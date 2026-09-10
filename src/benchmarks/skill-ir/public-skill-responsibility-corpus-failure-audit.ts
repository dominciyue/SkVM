import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { z } from "zod";
import {
  PUBLIC_SKILL_CORPUS_IDENTITY,
  PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
  PublicSkillCorpusProtocolSchema,
  verifyPublicSkillCorpusProtocolFiles,
} from "./public-skill-responsibility-corpus";
import { validateGitHubRepositoryApiIdentity } from "./public-skill-responsibility-corpus-discovery";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

const FAILURE_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-metadata-discovery-failure/v1" as const;
export const PUBLIC_SKILL_METADATA_FAILURE_AUDIT_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-metadata-failure-audit/v1" as const;
const RATE_LIMIT_FAILURE = "GitHub search rate limit exhausted before fixed metadata sequence completed" as const;
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const FailureSchema = z.object({
  schemaVersion: z.literal(FAILURE_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_SKILL_CORPUS_IDENTITY),
  status: z.literal("metadata-discovery-failed"),
  failedAt: z.string().datetime(),
  protocol: z.object({
    path: z.literal(PUBLIC_SKILL_CORPUS_PROTOCOL_PATH),
    sha256: Sha256Schema,
  }).strict(),
  error: z.object({ name: z.string().min(1), message: z.string().min(1) }).strict(),
  accounting: z.object({
    metadataRequestsAttempted: z.number().int().positive(),
    publicSkillBodyRequests: z.literal(0),
    publicSkillBodyBytes: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    pendingProspectiveAccesses: z.literal(0),
  }).strict(),
}).strict();

const SearchBodySchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.literal(false),
  items: z.array(z.object({
    full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
    url: z.string().url(),
  }).passthrough()).max(100),
}).passthrough();

const ResponseMetadataSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-skill-responsibility-http-metadata/v1"),
  status: z.literal(200),
  headers: z.object({
    "content-type": z.string().min(1),
    "x-ratelimit-remaining": z.string().regex(/^\d+$/u),
    "x-ratelimit-reset": z.string().regex(/^\d+$/u),
  }).strict(),
}).strict();

const BoundFileSchema = z.object({
  path: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: Sha256Schema,
}).strict();

export const PublicSkillMetadataFailureAuditSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SKILL_METADATA_FAILURE_AUDIT_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_SKILL_CORPUS_IDENTITY),
  status: z.literal("metadata-failure-audit-complete"),
  failure: BoundFileSchema.extend({ failedAt: z.string().datetime(), reason: z.literal(RATE_LIMIT_FAILURE) }).strict(),
  protocol: z.object({ path: z.literal(PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), sha256: Sha256Schema }).strict(),
  archivedSearchPrefix: z.array(z.object({
    ordinal: z.number().int().positive(),
    queryPriority: z.number().int().positive(),
    page: z.number().int().positive(),
    responsePath: z.string().min(1),
    responseMetadataPath: z.string().min(1),
    totalCount: z.number().int().nonnegative(),
    repositoryCount: z.number().int().nonnegative(),
    rateLimitRemaining: z.number().int().nonnegative(),
    rateLimitResetAt: z.string().datetime(),
  }).strict()).min(1),
  files: z.array(BoundFileSchema).min(3),
  accounting: z.object({
    metadataRequestsAttempted: z.number().int().positive(),
    archivedSuccessfulResponses: z.number().int().positive(),
    archivedFiles: z.number().int().positive(),
    archivedBytes: z.number().int().nonnegative(),
    publicSkillBodyRequests: z.literal(0),
    publicSkillBodyBytes: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    pendingProspectiveAccesses: z.literal(0),
  }).strict(),
}).strict();

export type PublicSkillMetadataFailureAudit = z.infer<typeof PublicSkillMetadataFailureAuditSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function codePointCompare(left: string, right: string): number {
  const a = [...left].map((value) => value.codePointAt(0)!);
  const b = [...right].map((value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => codePointCompare(left.name, right.name));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = join(directory, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`failure archive contains a symbolic link or junction: ${path}`);
    if (info.isDirectory()) files.push(...await listFiles(target, path));
    else if (info.isFile()) files.push(path);
    else throw new Error(`failure archive contains an unsupported filesystem entry: ${path}`);
  }
  return files;
}

function exactSet(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort(codePointCompare);
  const right = [...expected].sort(codePointCompare);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${label} closure / file set mismatch`);
}

function assertAuditContained(outputDir: string, auditPath: string): string {
  const relative = posix.relative(outputDir, auditPath);
  if (!relative || relative === ".." || relative.startsWith("../") || posix.isAbsolute(relative)) {
    throw new Error("failure audit path must remain inside the failure output directory");
  }
  return relative;
}

async function analyzeFailureArchive(options: {
  rootDir: string;
  outputDir: string;
  auditRelativePath?: string;
}): Promise<Omit<PublicSkillMetadataFailureAudit, "schemaVersion" | "identity" | "status">> {
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "failure output directory");
  const failurePath = `${outputDir}/failure.json`;
  const failureFile = await resolveContainedExistingFile(options.rootDir, failurePath, "metadata failure report");
  const outputRoot = dirname(failureFile);
  const failureBytes = await readFile(failureFile);
  const failure = FailureSchema.parse(JSON.parse(failureBytes.toString("utf8")));
  await verifyPublicSkillCorpusProtocolFiles({ rootDir: options.rootDir, protocolPath: failure.protocol.path });
  const protocolFile = await resolveContainedExistingFile(options.rootDir, failure.protocol.path, "public skill corpus protocol");
  const protocolBytes = await readFile(protocolFile);
  if (sha256(protocolBytes) !== failure.protocol.sha256) throw new Error("failure protocol digest drift");
  const protocol = PublicSkillCorpusProtocolSchema.parse(JSON.parse(protocolBytes.toString("utf8")));
  if (failure.error.message !== RATE_LIMIT_FAILURE) throw new Error("failure audit only accepts the fixed search rate-limit terminal reason");

  const archivedSearchPrefix: PublicSkillMetadataFailureAudit["archivedSearchPrefix"] = [];
  const expectedFiles = ["failure.json"];
  let ordinal = 0;
  let stopped = false;
  for (let queryIndex = 0; queryIndex < protocol.repositorySearch.queries.length; queryIndex += 1) {
    for (const page of protocol.repositorySearch.pages) {
      ordinal += 1;
      const responsePath = `raw/search/query-${queryIndex + 1}-page-${page}.json`;
      const responseMetadataPath = responsePath.replace(/\.json$/u, ".metadata.json");
      let responseFile: string;
      let metadataFile: string;
      try {
        responseFile = await resolveContainedExistingFile(options.rootDir, `${outputDir}/${responsePath}`, "archived search response");
        metadataFile = await resolveContainedExistingFile(options.rootDir, `${outputDir}/${responseMetadataPath}`, "archived search response metadata");
      } catch {
        stopped = true;
        break;
      }
      const body = SearchBodySchema.parse(JSON.parse(await readFile(responseFile, "utf8")));
      for (const item of body.items) {
        validateGitHubRepositoryApiIdentity(item.url, item.full_name, protocol.provider.baseUrl);
      }
      const metadata = ResponseMetadataSchema.parse(JSON.parse(await readFile(metadataFile, "utf8")));
      if (!metadata.headers["content-type"].toLowerCase().includes("json")) throw new Error("archived search response is not JSON");
      const remaining = Number(metadata.headers["x-ratelimit-remaining"]);
      const resetSeconds = Number(metadata.headers["x-ratelimit-reset"]);
      if (!Number.isSafeInteger(resetSeconds) || resetSeconds <= 0) throw new Error("archived search reset header is invalid");
      if (archivedSearchPrefix.at(-1)?.rateLimitRemaining === 0) {
        throw new Error("archived search prefix continues after rate limit exhaustion");
      }
      archivedSearchPrefix.push({
        ordinal,
        queryPriority: queryIndex + 1,
        page,
        responsePath,
        responseMetadataPath,
        totalCount: body.total_count,
        repositoryCount: body.items.length,
        rateLimitRemaining: remaining,
        rateLimitResetAt: new Date(resetSeconds * 1000).toISOString(),
      });
      expectedFiles.push(responsePath, responseMetadataPath);
    }
    if (stopped) break;
  }
  if (archivedSearchPrefix.length === 0) throw new Error("rate-limit failure archive contains no successful search response");
  if (archivedSearchPrefix.length !== failure.accounting.metadataRequestsAttempted) {
    throw new Error("failure attempted-request count does not match archived successful search prefix");
  }
  if (archivedSearchPrefix.at(-1)!.rateLimitRemaining !== 0) {
    throw new Error("rate-limit failure archive does not terminate at remaining zero");
  }
  if (archivedSearchPrefix.length >= protocol.repositorySearch.queries.length * protocol.repositorySearch.pages.length) {
    throw new Error("rate-limit failure archive unexpectedly completed the frozen search sequence");
  }
  if (options.auditRelativePath) expectedFiles.push(options.auditRelativePath);
  exactSet(await listFiles(outputRoot), expectedFiles, "metadata failure archive");

  const boundFiles = await Promise.all(expectedFiles
    .filter((path) => path !== options.auditRelativePath)
    .sort(codePointCompare)
    .map(async (path) => {
      const file = await resolveContainedExistingFile(options.rootDir, `${outputDir}/${path}`, "failure archive file");
      const bytes = await readFile(file);
      return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
    }));
  return {
    failure: {
      path: "failure.json",
      byteLength: failureBytes.byteLength,
      sha256: sha256(failureBytes),
      failedAt: failure.failedAt,
      reason: RATE_LIMIT_FAILURE,
    },
    protocol: failure.protocol,
    archivedSearchPrefix,
    files: boundFiles,
    accounting: {
      ...failure.accounting,
      archivedSuccessfulResponses: archivedSearchPrefix.length,
      archivedFiles: boundFiles.length,
      archivedBytes: boundFiles.reduce((total, file) => total + file.byteLength, 0),
    },
  };
}

export async function createPublicSkillMetadataFailureAudit(options: {
  rootDir: string;
  outputDir: string;
  auditPath: string;
}): Promise<PublicSkillMetadataFailureAudit> {
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "failure output directory");
  const auditPath = normalizeRepositoryRelativePath(options.auditPath, "failure audit path");
  assertAuditContained(outputDir, auditPath);
  const audit = PublicSkillMetadataFailureAuditSchema.parse({
    schemaVersion: PUBLIC_SKILL_METADATA_FAILURE_AUDIT_SCHEMA_VERSION,
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: "metadata-failure-audit-complete",
    ...await analyzeFailureArchive({ rootDir: options.rootDir, outputDir }),
  });
  const target = await resolveContainedNewFile(options.rootDir, auditPath, "metadata failure audit");
  await writeFile(target, `${JSON.stringify(audit, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return audit;
}

export async function verifyPublicSkillMetadataFailureAuditFiles(options: {
  rootDir: string;
  auditPath: string;
}): Promise<{
  status: "verified-metadata-failure-audit";
  metadataRequestsAttempted: number;
  archivedSuccessfulResponses: number;
  lastRateLimitRemaining: number;
  publicSkillBodyRequests: 0;
}> {
  const auditPath = normalizeRepositoryRelativePath(options.auditPath, "failure audit path");
  const auditFile = await resolveContainedExistingFile(options.rootDir, auditPath, "metadata failure audit");
  const audit = PublicSkillMetadataFailureAuditSchema.parse(JSON.parse(await readFile(auditFile, "utf8")));
  const outputDir = posix.dirname(auditPath);
  const auditRelativePath = assertAuditContained(outputDir, auditPath);
  const rebuilt = await analyzeFailureArchive({ rootDir: options.rootDir, outputDir, auditRelativePath });
  const expected = PublicSkillMetadataFailureAuditSchema.parse({
    schemaVersion: PUBLIC_SKILL_METADATA_FAILURE_AUDIT_SCHEMA_VERSION,
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: "metadata-failure-audit-complete",
    ...rebuilt,
  });
  if (canonical(audit) !== canonical(expected)) {
    throw new Error("metadata failure audit semantic or digest drift");
  }
  return {
    status: "verified-metadata-failure-audit",
    metadataRequestsAttempted: audit.accounting.metadataRequestsAttempted,
    archivedSuccessfulResponses: audit.accounting.archivedSuccessfulResponses,
    lastRateLimitRemaining: audit.archivedSearchPrefix.at(-1)!.rateLimitRemaining,
    publicSkillBodyRequests: 0,
  };
}
