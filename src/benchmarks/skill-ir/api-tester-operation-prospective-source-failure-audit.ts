#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
  API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL,
} from "./api-tester-operation-prospective";
import {
  ApiTesterOperationSourceAcquisitionFailureSchema,
} from "./api-tester-operation-prospective-source";
import {
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR,
  API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH,
} from "./api-tester-operation-prospective-source-run";
import { ApiTesterOperationInputManifestSchema } from "../../skill-ir/api-tester-operation-input";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

export const API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-source-failure-audit/v1" as const;
export const API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_PATH = "failure-audit.json" as const;
const EXPECTED_PRE_SOURCE_FREEZE_COMMIT = "e4c006fe32a6321ce5e4696758d53024c160f6db" as const;
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const BoundFileSchema = z.object({ path: z.string().min(1), byteLength: z.number().int().nonnegative(), sha256: Sha256Schema }).strict();
const HttpMetadataSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-http-response/v1"),
  status: z.number().int().min(100).max(599),
  headers: z.object({
    "content-type": z.string().min(1),
    "x-ratelimit-remaining": z.string().nullable(),
    "x-ratelimit-reset": z.string().nullable(),
  }).strict(),
}).strict();

export const ApiTesterOperationSourceFailureAuditSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.literal("verified-source-acquisition-failure"),
  auditedAt: z.string().datetime(),
  failure: BoundFileSchema,
  preSourceFreeze: z.object({ path: z.literal(API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH), sha256: Sha256Schema, commit: z.literal(EXPECTED_PRE_SOURCE_FREEZE_COMMIT) }).strict(),
  terminal: z.object({
    requestOrdinal: z.number().int().positive(),
    kind: z.enum(["search", "branch", "tree", "source", "license"]),
    url: z.string().url(),
    statusCode: z.number().int().min(300).max(599),
    rateLimitRemaining: z.string().nullable(),
    rateLimitReset: z.string().nullable(),
  }).strict(),
  totals: z.object({
    requestsAttempted: z.number().int().positive(),
    archivedResponses: z.number().int().positive(),
    partialInputBundles: z.number().int().nonnegative(),
    authoritativeSelections: z.literal(0),
    boundFiles: z.number().int().positive(),
    boundBytes: z.number().int().positive(),
  }).strict(),
  accounting: z.object({
    candidateTrialsBeforeSelection: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
  }).strict(),
  files: z.array(BoundFileSchema).min(1),
  claimBoundary: z.literal("The terminal archive is verifiable failure evidence. Partial input bundles are non-authoritative and are not a source selection, prediction denominator, prospective run, or replacement pool."),
}).strict();
export type ApiTesterOperationSourceFailureAudit = z.infer<typeof ApiTesterOperationSourceFailureAuditSchema>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = join(directory, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`source failure archive contains a symbolic link or junction: ${path}`);
    if (info.isDirectory()) files.push(...await listFiles(target, path));
    else if (info.isFile()) files.push(path);
    else throw new Error(`unsupported source failure archive entry: ${path}`);
  }
  return files;
}

function exactSet(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort(compareText);
  const right = [...expected].sort(compareText);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${label} closure / file set mismatch`);
}

function searchUrl(query: typeof API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries[number]): string {
  const url = new URL(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.api);
  url.searchParams.set("q", query.query);
  url.searchParams.set("sort", query.sort);
  url.searchParams.set("order", query.order);
  url.searchParams.set("per_page", String(query.perPage));
  url.searchParams.set("page", "1");
  return url.toString();
}

function assertRequestUrl(kind: "search" | "branch" | "tree" | "source" | "license", repositoryFullName: string | null, rawUrl: string): void {
  const url = new URL(rawUrl);
  if (kind === "search") return;
  if (!repositoryFullName) throw new Error(`${kind} request repository binding is missing`);
  const [owner, repository] = repositoryFullName.split("/");
  if (kind === "branch" || kind === "tree") {
    if (url.origin !== "https://api.github.com" || !url.pathname.startsWith(`/repos/${owner}/${repository}/`)) {
      throw new Error(`${kind} request GitHub API identity drift: ${repositoryFullName}`);
    }
    return;
  }
  if (url.origin !== "https://raw.githubusercontent.com" || !url.pathname.startsWith(`/${owner}/${repository}/`)) {
    throw new Error(`${kind} request raw GitHub identity drift: ${repositoryFullName}`);
  }
}

async function deriveAudit(options: { rootDir: string; outputDir: string; auditedAt: string }): Promise<ApiTesterOperationSourceFailureAudit> {
  const rootDir = resolve(options.rootDir);
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "prospective source failure output directory");
  const auditedAt = z.string().datetime().parse(options.auditedAt);
  const failurePath = `${outputDir}/failure.json`;
  const failureFile = await resolveContainedExistingFile(rootDir, failurePath, "prospective source failure report");
  const outputRoot = dirname(failureFile);
  const failureBytes = await readFile(failureFile);
  const failure = ApiTesterOperationSourceAcquisitionFailureSchema.parse(JSON.parse(failureBytes.toString("utf8")));
  if (failure.preSourceFreeze.path !== API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH
    || failure.preSourceFreeze.commit !== EXPECTED_PRE_SOURCE_FREEZE_COMMIT) {
    throw new Error("source failure pre-source freeze identity drift");
  }
  const freezeBytes = await readFile(await resolveContainedExistingFile(rootDir, failure.preSourceFreeze.path, "pre-source freeze"));
  if (sha256(freezeBytes) !== failure.preSourceFreeze.sha256) throw new Error("source failure pre-source freeze digest drift");
  if (failure.requests.length === 0
    || failure.accounting.requestsAttempted !== failure.requests.length
    || failure.accounting.publicSourceResponsesArchived !== failure.requests.length) {
    throw new Error("source failure request accounting drift");
  }
  if (failure.requests.some((request, index) => request.ordinal !== index + 1)) throw new Error("source failure request ordinal drift");
  const terminal = failure.requests.at(-1)!;
  if (terminal.statusCode < 300 || terminal.statusCode > 599
    || failure.requests.slice(0, -1).some((request) => request.statusCode < 200 || request.statusCode >= 300)
    || !failure.error.message.includes(`HTTP ${terminal.statusCode}`)
    || !failure.error.message.includes(terminal.url)) {
    throw new Error("source failure terminal response binding drift");
  }
  const searchRequests = failure.requests.filter((request) => request.kind === "search");
  for (const [index, request] of searchRequests.entries()) {
    const query = API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries[index];
    if (!query || request.queryId !== query.queryId || request.url !== searchUrl(query) || request.ordinal !== index + 1) {
      throw new Error("source failure frozen search prefix drift");
    }
  }
  if (searchRequests.length > 2 || (terminal.kind !== "search" && searchRequests.length !== 2)) {
    throw new Error("source failure search prefix completeness drift");
  }

  const successfulSourceDigests = new Set<string>();
  const successfulLicenseDigests = new Set<string>();
  let terminalMetadata: z.infer<typeof HttpMetadataSchema> | undefined;
  for (const request of failure.requests) {
    assertRequestUrl(request.kind, request.repositoryFullName, request.url);
    const expectedPrefix = `${outputDir}/`;
    if (!request.response.path.startsWith(expectedPrefix) || !request.metadata.path.startsWith(expectedPrefix)) {
      throw new Error(`source failure request path escaped output: ${request.ordinal}`);
    }
    const responseBytes = await readFile(await resolveContainedExistingFile(rootDir, request.response.path, "source failure raw response"));
    const metadataBytes = await readFile(await resolveContainedExistingFile(rootDir, request.metadata.path, "source failure response metadata"));
    if (responseBytes.byteLength !== request.response.byteLength || sha256(responseBytes) !== request.response.sha256
      || metadataBytes.byteLength !== request.metadata.byteLength || sha256(metadataBytes) !== request.metadata.sha256) {
      throw new Error(`source failure raw response digest / byte drift: ${request.ordinal}`);
    }
    const metadata = HttpMetadataSchema.parse(JSON.parse(metadataBytes.toString("utf8")));
    if (metadata.status !== request.statusCode) throw new Error(`source failure response metadata status drift: ${request.ordinal}`);
    if (request.statusCode >= 200 && request.statusCode < 300 && request.kind === "source") successfulSourceDigests.add(request.response.sha256);
    if (request.statusCode >= 200 && request.statusCode < 300 && request.kind === "license") successfulLicenseDigests.add(request.response.sha256);
    if (request.ordinal === terminal.ordinal) terminalMetadata = metadata;
  }

  const archiveFiles = (await listFiles(outputRoot)).filter((path) => path !== API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_PATH);
  if (archiveFiles.some((path) => ["selection.json", "acquisition.json", "output-manifest.json"].includes(path))) {
    throw new Error("source failure archive contains an authoritative success report");
  }
  const manifestPaths = archiveFiles.filter((path) => /^inputs\/real-public-\d{2}\/manifest\.json$/u.test(path)).sort(compareText);
  const expectedInputFiles: string[] = [];
  for (const [index, manifestPath] of manifestPaths.entries()) {
    const rowId = `real-public-${String(index + 1).padStart(2, "0")}`;
    if (manifestPath !== `inputs/${rowId}/manifest.json`) throw new Error("partial input bundle order drift");
    const manifestBytes = await readFile(await resolveContainedExistingFile(outputRoot, manifestPath, "partial input manifest"));
    const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    const sourceRelativePath = manifest.input.path.slice(`${outputDir}/`.length);
    if (!manifest.input.path.startsWith(`${outputDir}/inputs/${rowId}/`) || !/^inputs\/real-public-\d{2}\/source\.(?:json|ya?ml)$/u.test(sourceRelativePath)) {
      throw new Error(`partial input manifest source binding drift: ${rowId}`);
    }
    const licenseRelativePath = `inputs/${rowId}/LICENSE`;
    const sourceBytes = await readFile(await resolveContainedExistingFile(outputRoot, sourceRelativePath, "partial input source"));
    const licenseBytes = await readFile(await resolveContainedExistingFile(outputRoot, licenseRelativePath, "partial input license"));
    if (sourceBytes.byteLength !== manifest.input.bytes || sha256(sourceBytes) !== manifest.input.sha256
      || !successfulSourceDigests.has(manifest.input.sha256) || !successfulLicenseDigests.has(sha256(licenseBytes))) {
      throw new Error(`partial input raw response binding drift: ${rowId}`);
    }
    expectedInputFiles.push(manifestPath, sourceRelativePath, licenseRelativePath);
  }
  const requestFiles = failure.requests.flatMap((request) => [
    request.response.path.slice(`${outputDir}/`.length),
    request.metadata.path.slice(`${outputDir}/`.length),
  ]);
  exactSet(archiveFiles, ["failure.json", ...requestFiles, ...expectedInputFiles], "source failure archive");
  const files = await Promise.all(archiveFiles.sort(compareText).map(async (path) => {
    const bytes = await readFile(await resolveContainedExistingFile(outputRoot, path, "source failure bound file"));
    return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
  }));
  const boundBytes = files.reduce((sum, file) => sum + file.byteLength, 0);
  return ApiTesterOperationSourceFailureAuditSchema.parse({
    schemaVersion: API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
    status: "verified-source-acquisition-failure",
    auditedAt,
    failure: { path: "failure.json", byteLength: failureBytes.byteLength, sha256: sha256(failureBytes) },
    preSourceFreeze: failure.preSourceFreeze,
    terminal: {
      requestOrdinal: terminal.ordinal,
      kind: terminal.kind,
      url: terminal.url,
      statusCode: terminal.statusCode,
      rateLimitRemaining: terminalMetadata!.headers["x-ratelimit-remaining"],
      rateLimitReset: terminalMetadata!.headers["x-ratelimit-reset"],
    },
    totals: {
      requestsAttempted: failure.requests.length,
      archivedResponses: failure.requests.length,
      partialInputBundles: manifestPaths.length,
      authoritativeSelections: 0,
      boundFiles: files.length,
      boundBytes,
    },
    accounting: {
      candidateTrialsBeforeSelection: failure.accounting.candidateTrialsBeforeSelection,
      modelCalls: failure.accounting.modelCalls,
      businessApiCalls: failure.accounting.businessApiCalls,
      paidCalls: failure.accounting.paidCalls,
      heldOutAccesses: failure.accounting.heldOutAccesses,
      q1ReservedAccesses: failure.accounting.q1ReservedAccesses,
    },
    files,
    claimBoundary: "The terminal archive is verifiable failure evidence. Partial input bundles are non-authoritative and are not a source selection, prediction denominator, prospective run, or replacement pool.",
  });
}

export async function buildApiTesterOperationProspectiveSourceFailureAudit(options: {
  rootDir: string;
  outputDir: string;
  auditedAt: string;
}): Promise<ApiTesterOperationSourceFailureAudit> {
  const audit = await deriveAudit(options);
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "prospective source failure output directory");
  const auditFile = await resolveContainedNewFile(resolve(options.rootDir), `${outputDir}/${API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_PATH}`, "prospective source failure audit");
  await writeFile(auditFile, jsonBytes(audit), { flag: "wx" });
  return audit;
}

export async function verifyApiTesterOperationProspectiveSourceFailureAudit(options: {
  rootDir: string;
  outputDir: string;
}) {
  const rootDir = resolve(options.rootDir);
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "prospective source failure output directory");
  const auditFile = await resolveContainedExistingFile(rootDir, `${outputDir}/${API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_PATH}`, "prospective source failure audit");
  const audit = ApiTesterOperationSourceFailureAuditSchema.parse(JSON.parse(await readFile(auditFile, "utf8")));
  const derived = await deriveAudit({ rootDir, outputDir, auditedAt: audit.auditedAt });
  if (JSON.stringify(derived) !== JSON.stringify(audit)) throw new Error("source failure audit semantic or digest drift");
  exactSet(
    await listFiles(dirname(auditFile)),
    [API_TESTER_OPERATION_SOURCE_FAILURE_AUDIT_PATH, ...audit.files.map((file) => file.path)],
    "closed source failure audit",
  );
  return {
    status: audit.status,
    requestsAttempted: audit.totals.requestsAttempted,
    partialInputBundles: audit.totals.partialInputBundles,
    authoritativeSelections: 0 as const,
    terminalStatusCode: audit.terminal.statusCode,
  };
}

export type ApiTesterOperationProspectiveSourceFailureAuditCommand = {
  mode: "create" | "verify";
  rootDir: string;
  outputDir: typeof API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR;
  auditedAt?: string;
};

export function parseApiTesterOperationProspectiveSourceFailureAuditCommand(
  argv: string[],
): ApiTesterOperationProspectiveSourceFailureAuditCommand {
  const values = new Map<string, string>();
  for (const raw of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/u.exec(raw);
    if (!match) throw new Error(`invalid argument: ${raw}`);
    if (values.has(match[1]!)) throw new Error(`duplicate argument: --${match[1]}`);
    values.set(match[1]!, match[2]!);
  }
  const take = (key: string, required = true) => {
    const value = values.get(key);
    values.delete(key);
    if (required && !value) throw new Error(`--${key} is required`);
    return value;
  };
  const mode = z.enum(["create", "verify"]).parse(take("mode"));
  const rootDir = take("root")!;
  const outputDir = take("out")!;
  if (outputDir !== API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR) {
    throw new Error(`--out must be ${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`);
  }
  const auditedAtValue = take("audited-at", mode === "create");
  if (mode === "verify" && auditedAtValue !== undefined) throw new Error("--audited-at is only valid in create mode");
  const auditedAt = auditedAtValue === undefined ? undefined : z.string().datetime().parse(auditedAtValue);
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return { mode, rootDir, outputDir: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR, auditedAt };
}

if (import.meta.main) {
  const command = parseApiTesterOperationProspectiveSourceFailureAuditCommand(Bun.argv.slice(2));
  const result = command.mode === "create"
    ? await buildApiTesterOperationProspectiveSourceFailureAudit(command as Required<ApiTesterOperationProspectiveSourceFailureAuditCommand>)
    : await verifyApiTesterOperationProspectiveSourceFailureAudit(command);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
