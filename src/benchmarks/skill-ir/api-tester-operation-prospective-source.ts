import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { z } from "zod";
import {
  API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
  API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL,
  ApiTesterOperationSourceSelectionReportSchema,
  apiTesterOperationProspectiveProtocolSha256,
  qualifyApiTesterOperationSourceCandidate,
  type ApiTesterOperationRealSelection,
} from "./api-tester-operation-prospective";
import { ApiTesterOperationInputManifestSchema } from "../../skill-ir/api-tester-operation-input";
import {
  createContainedDirectory,
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

export const API_TESTER_OPERATION_SOURCE_ACQUISITION_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-source-acquisition/v1" as const;
export const API_TESTER_OPERATION_SOURCE_ARCHIVE_MANIFEST_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-source-archive-manifest/v1" as const;
export const API_TESTER_OPERATION_SOURCE_ACQUISITION_FAILURE_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-source-acquisition-failure/v1" as const;
const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const GitHubRepositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  html_url: z.string().url(),
  url: z.string().url(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  default_branch: z.string().min(1),
  license: z.object({ spdx_id: z.string().nullable() }).passthrough().nullable(),
}).passthrough();
const GitHubSearchSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.literal(false),
  items: z.array(GitHubRepositorySchema).max(100),
}).passthrough();
const GitHubBranchSchema = z.object({ commit: z.object({ sha: Sha1Schema }).passthrough() }).passthrough();
const GitHubTreeEntrySchema = z.object({
  path: z.string().min(1),
  type: z.enum(["blob", "tree", "commit"]),
  mode: z.enum(["040000", "100644", "100755", "120000", "160000"]),
  sha: Sha1Schema,
  size: z.number().int().nonnegative().optional(),
}).passthrough();
const GitHubTreeSchema = z.object({ sha: Sha1Schema, truncated: z.boolean(), tree: z.array(GitHubTreeEntrySchema) }).passthrough();

const BoundFileSchema = z.object({ path: z.string().min(1), byteLength: z.number().int().nonnegative(), sha256: Sha256Schema }).strict();
const RequestRecordSchema = z.object({
  ordinal: z.number().int().positive(),
  kind: z.enum(["search", "branch", "tree", "source", "license"]),
  queryId: z.enum(["github-topic-openapi-specification", "github-topic-openapi"]).nullable(),
  repositoryFullName: z.string().nullable(),
  url: z.string().url(),
  statusCode: z.number().int().min(100).max(599),
  response: BoundFileSchema,
  metadata: BoundFileSchema,
  acquisitionMillis: z.number().int().nonnegative(),
}).strict();

const CandidateRecordSchema = z.object({
  order: z.number().int().positive(),
  queryId: z.enum(["github-topic-openapi-specification", "github-topic-openapi"]),
  queryRank: z.number().int().positive(),
  repositoryFullName: z.string().min(1),
  repositoryId: z.number().int().positive(),
  lineageKey: z.string().min(1),
  repositoryCommit: Sha1Schema.nullable(),
  repositoryPath: z.string().nullable(),
  sourceBlobOid: Sha1Schema.nullable(),
  licensePath: z.string().nullable(),
  licenseBlobOid: Sha1Schema.nullable(),
  qualification: z.object({
    status: z.enum(["eligible", "excluded"]),
    reasons: z.array(z.string()),
    sourceBytes: z.number().int().nonnegative().nullable(),
    sourceSha256: Sha256Schema.nullable(),
    openapiVersion: z.string().nullable(),
    operationCount: z.number().int().nonnegative().nullable(),
  }).strict(),
  selectedOrder: z.number().int().min(1).max(12).nullable(),
}).strict();

export const ApiTesterOperationSourceAcquisitionSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_SOURCE_ACQUISITION_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.enum(["source-selection-complete", "source-selection-shortfall"]),
  selectedAt: z.string().datetime(),
  preSourceFreeze: z.object({ path: z.string().min(1), sha256: Sha256Schema, commit: Sha1Schema }).strict(),
  requests: z.array(RequestRecordSchema).min(2),
  candidates: z.array(CandidateRecordSchema),
  selection: BoundFileSchema,
  accounting: z.object({
    publicSourceSearchRequests: z.literal(2),
    publicSourceDownloadRequests: z.number().int().nonnegative(),
    selectedRealDocuments: z.number().int().min(0).max(12),
    excludedCandidates: z.number().int().nonnegative(),
    candidateTrialsBeforeSelection: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
  }).strict(),
}).strict();
export type ApiTesterOperationSourceAcquisition = z.infer<typeof ApiTesterOperationSourceAcquisitionSchema>;

export const ApiTesterOperationSourceAcquisitionFailureSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_SOURCE_ACQUISITION_FAILURE_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.literal("source-acquisition-failed"),
  failedAt: z.string().datetime(),
  preSourceFreeze: z.object({ path: z.string().min(1), sha256: Sha256Schema, commit: Sha1Schema }).strict(),
  error: z.object({ name: z.string().min(1), message: z.string().min(1) }).strict(),
  requests: z.array(RequestRecordSchema),
  accounting: z.object({
    requestsAttempted: z.number().int().nonnegative(),
    publicSourceResponsesArchived: z.number().int().nonnegative(),
    candidateTrialsBeforeSelection: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
  }).strict(),
}).strict();

export const ApiTesterOperationSourceArchiveManifestSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_SOURCE_ARCHIVE_MANIFEST_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.literal("source-selection-archive-closed"),
  acquisition: BoundFileSchema,
  selection: BoundFileSchema,
  files: z.array(BoundFileSchema),
}).strict();

export type ApiTesterOperationSourceHttpResponse = { status: number; headers: Record<string, string>; body: Uint8Array };
export type ApiTesterOperationSourceRequest = (url: string, headers: Readonly<Record<string, string>>) => Promise<ApiTesterOperationSourceHttpResponse>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function slug(value: string): string {
  return value.replaceAll("/", "--").replace(/[^A-Za-z0-9._-]/gu, "-");
}

function rawUrl(fullName: string, commit: string, path: string): string {
  return `https://raw.githubusercontent.com/${fullName}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function buildSearchUrl(query: typeof API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries[number]): string {
  const url = new URL(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.api);
  url.searchParams.set("q", query.query);
  url.searchParams.set("sort", query.sort);
  url.searchParams.set("order", query.order);
  url.searchParams.set("per_page", String(query.perPage));
  url.searchParams.set("page", "1");
  return url.toString();
}

function exactRepositoryApiUrl(repository: z.infer<typeof GitHubRepositorySchema>): string {
  const expected = `https://api.github.com/repos/${repository.full_name}`;
  if (repository.url !== expected) throw new Error(`repository API URL identity drift: ${repository.full_name}`);
  return expected;
}

async function defaultRequest(url: string, headers: Readonly<Record<string, string>>): Promise<ApiTesterOperationSourceHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.resourceLimits.sourceDownloadTimeoutMs);
  try {
    const response = await fetch(url, { method: "GET", headers, redirect: "error", signal: controller.signal });
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > 64 * 1024 * 1024) throw new Error(`public source response exceeds 64 MiB: ${url}`);
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  } finally {
    clearTimeout(timer);
  }
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = join(directory, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`source selection archive contains a symbolic link or junction: ${path}`);
    if (info.isDirectory()) files.push(...await listFiles(target, path));
    else if (info.isFile()) files.push(path);
    else throw new Error(`unsupported source selection archive entry: ${path}`);
  }
  return files;
}

function exactSet(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort(compareText);
  const right = [...expected].sort(compareText);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${label} closure / file set mismatch`);
}

function formatForPath(path: string): "json" | "yaml" {
  return path.toLowerCase().endsWith(".json") ? "json" : "yaml";
}

function documentPaths(tree: z.infer<typeof GitHubTreeSchema>): Array<z.infer<typeof GitHubTreeEntrySchema> & { size: number }> {
  const pattern = new RegExp(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.documentPathPattern, "iu");
  return tree.tree.filter((entry): entry is typeof entry & { size: number } => (
    entry.type === "blob"
    && (entry.mode === "100644" || entry.mode === "100755")
    && entry.size !== undefined
    && pattern.test(entry.path)
  )).sort((left, right) => compareText(left.path, right.path));
}

function licenseEntry(tree: z.infer<typeof GitHubTreeSchema>) {
  const candidates = tree.tree.filter((entry) => (
    entry.type === "blob"
    && (entry.mode === "100644" || entry.mode === "100755")
    && entry.size !== undefined
    && !entry.path.includes("/")
    && /^(?:licen[cs]e|copying)(?:[._-].*)?$/iu.test(entry.path)
  ));
  return candidates.length === 1 ? candidates[0]! : null;
}

function sidecar(response: ApiTesterOperationSourceHttpResponse) {
  const headers = new Map(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    schemaVersion: "skill-ir-api-tester-operation-prospective-http-response/v1",
    status: response.status,
    headers: {
      "content-type": headers.get("content-type") ?? "unknown",
      "x-ratelimit-remaining": headers.get("x-ratelimit-remaining") ?? null,
      "x-ratelimit-reset": headers.get("x-ratelimit-reset") ?? null,
    },
  };
}

export async function acquireApiTesterOperationProspectiveSources(options: {
  rootDir: string;
  outputDir: string;
  preSourceFreezePath: string;
  preSourceFreezeCommit: string;
  selectedAt: string;
  request?: ApiTesterOperationSourceRequest;
}) {
  const rootDir = resolve(options.rootDir);
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "prospective source output directory");
  const selectedAt = z.string().datetime().parse(options.selectedAt);
  const freezePath = normalizeRepositoryRelativePath(options.preSourceFreezePath, "pre-source freeze path");
  const freezeFile = await resolveContainedExistingFile(rootDir, freezePath, "pre-source freeze");
  const freezeBytes = await readFile(freezeFile);
  try {
    await lstat(join(rootDir, ...outputDir.split("/")));
    throw new Error("prospective source output directory already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const outputRoot = await createContainedDirectory(rootDir, outputDir, "prospective source output directory");
  const failureFile = await resolveContainedNewFile(rootDir, `${outputDir}/failure.json`, "prospective source failure report");
  const failureHandle = await open(failureFile, "wx");
  const request = options.request ?? defaultRequest;
  const requests: z.infer<typeof RequestRecordSchema>[] = [];
  const candidates: z.infer<typeof CandidateRecordSchema>[] = [];

  const archiveRequest = async (record: {
    kind: z.infer<typeof RequestRecordSchema>["kind"];
    queryId?: z.infer<typeof RequestRecordSchema>["queryId"];
    repositoryFullName?: string;
    url: string;
    responsePath: string;
  }): Promise<ApiTesterOperationSourceHttpResponse> => {
    const started = performance.now();
    const response = await request(record.url, {
      Accept: record.kind === "source" || record.kind === "license" ? "application/octet-stream" : "application/vnd.github+json",
      "User-Agent": "SkVM-public-source-selection",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const responsePath = `${outputDir}/${record.responsePath}`;
    const responseFile = await resolveContainedNewFile(rootDir, responsePath, "prospective source response");
    await writeFile(responseFile, response.body, { flag: "wx" });
    const metadataPath = responsePath.replace(/(\.[^./]+)?$/u, ".metadata.json");
    const metadataBytes = jsonBytes(sidecar(response));
    const metadataFile = await resolveContainedNewFile(rootDir, metadataPath, "prospective source response metadata");
    await writeFile(metadataFile, metadataBytes, { flag: "wx" });
    requests.push(RequestRecordSchema.parse({
      ordinal: requests.length + 1,
      kind: record.kind,
      queryId: record.queryId ?? null,
      repositoryFullName: record.repositoryFullName ?? null,
      url: record.url,
      statusCode: response.status,
      response: { path: responsePath, byteLength: response.body.byteLength, sha256: sha256(response.body) },
      metadata: { path: metadataPath, byteLength: metadataBytes.byteLength, sha256: sha256(metadataBytes) },
      acquisitionMillis: Math.max(0, Math.floor(performance.now() - started)),
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`public source request failed with HTTP ${response.status}: ${record.url}`);
    return response;
  };

  try {
    const searchResults: Array<{ queryId: "github-topic-openapi-specification" | "github-topic-openapi"; rank: number; repository: z.infer<typeof GitHubRepositorySchema> }> = [];
    for (const query of API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries) {
      const url = buildSearchUrl(query);
      const archived = await archiveRequest({ kind: "search", queryId: query.queryId, url, responsePath: `raw/search/${query.queryId}.json` });
      const parsed = GitHubSearchSchema.parse(JSON.parse(new TextDecoder().decode(archived.body)));
      parsed.items.forEach((repository, index) => {
        exactRepositoryApiUrl(repository);
        searchResults.push({ queryId: query.queryId, rank: index + 1, repository });
      });
    }

    const selected: ApiTesterOperationRealSelection[] = [];
    const excluded: Array<{
      order: number; repositoryFullName: string; lineageKey: string | null; repositoryCommit: string | null;
      repositoryPath: string | null; sourceSha256: string | null; reasons: string[]; evidence: string;
    }> = [];
    const priorDigests: string[] = [];
    const priorLineages: string[] = [];
    const seenRepositories = new Set<string>();
    let candidateOrder = 0;
    let downloadRequests = 0;

    for (const found of searchResults) {
      if (selected.length === 12) break;
      const repository = found.repository;
      const repositoryKey = repository.full_name.toLowerCase();
      const lineageKey = `github-repository-id:${repository.id}`;
      if (seenRepositories.has(repositoryKey)) {
        candidateOrder += 1;
        excluded.push({ order: candidateOrder, repositoryFullName: repository.full_name, lineageKey, repositoryCommit: null, repositoryPath: null, sourceSha256: null, reasons: ["DUPLICATE_LINEAGE"], evidence: "Repository already occurred earlier in the frozen search order." });
        candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: null, repositoryPath: null, sourceBlobOid: null, licensePath: null, licenseBlobOid: null, qualification: { status: "excluded", reasons: ["DUPLICATE_LINEAGE"], sourceBytes: null, sourceSha256: null, openapiVersion: null, operationCount: null }, selectedOrder: null });
        continue;
      }
      seenRepositories.add(repositoryKey);
      const preReasons: string[] = [];
      if (API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.exclusions.exposedRepositories.some((value) => value.toLowerCase() === repositoryKey)) preReasons.push("EXPOSED_REPOSITORY");
      if (repository.private) preReasons.push("PRIVATE_REPOSITORY");
      if (repository.fork) preReasons.push("FORK");
      if (repository.archived) preReasons.push("ARCHIVED");
      const spdx = repository.license?.spdx_id ?? "NOASSERTION";
      if (!(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.licenseSpdxAllowlist as readonly string[]).includes(spdx)) preReasons.push("LICENSE_NOT_ALLOWED");
      if (preReasons.length > 0) {
        candidateOrder += 1;
        excluded.push({ order: candidateOrder, repositoryFullName: repository.full_name, lineageKey, repositoryCommit: null, repositoryPath: null, sourceSha256: null, reasons: preReasons, evidence: "Repository search metadata failed a frozen pre-download rule." });
        candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: null, repositoryPath: null, sourceBlobOid: null, licensePath: null, licenseBlobOid: null, qualification: { status: "excluded", reasons: preReasons, sourceBytes: null, sourceSha256: null, openapiVersion: null, operationCount: null }, selectedOrder: null });
        continue;
      }

      const repositorySlug = `${String(found.rank).padStart(3, "0")}-${slug(repository.full_name)}`;
      const apiUrl = exactRepositoryApiUrl(repository);
      const branchUrl = `${apiUrl}/branches/${encodeURIComponent(repository.default_branch)}`;
      const branchResponse = await archiveRequest({ kind: "branch", repositoryFullName: repository.full_name, url: branchUrl, responsePath: `raw/repositories/${repositorySlug}/branch.json` });
      downloadRequests += 1;
      const commit = GitHubBranchSchema.parse(JSON.parse(new TextDecoder().decode(branchResponse.body))).commit.sha;
      const treeUrl = `${apiUrl}/git/trees/${commit}?recursive=1`;
      const treeResponse = await archiveRequest({ kind: "tree", repositoryFullName: repository.full_name, url: treeUrl, responsePath: `raw/repositories/${repositorySlug}/tree.json` });
      downloadRequests += 1;
      const tree = GitHubTreeSchema.parse(JSON.parse(new TextDecoder().decode(treeResponse.body)));
      const paths = documentPaths(tree);
      const license = licenseEntry(tree);
      if (tree.truncated || paths.length === 0 || !license) {
        candidateOrder += 1;
        const reasons = tree.truncated ? ["TREE_TRUNCATED"] : paths.length === 0 ? ["FORMAT_PATH_MISMATCH"] : ["LICENSE_BYTES_MISSING"];
        excluded.push({ order: candidateOrder, repositoryFullName: repository.full_name, lineageKey, repositoryCommit: commit, repositoryPath: null, sourceSha256: null, reasons, evidence: "Recursive tree did not expose one usable document path and one unambiguous root license." });
        candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: commit, repositoryPath: null, sourceBlobOid: null, licensePath: license?.path ?? null, licenseBlobOid: license?.sha ?? null, qualification: { status: "excluded", reasons, sourceBytes: null, sourceSha256: null, openapiVersion: null, operationCount: null }, selectedOrder: null });
        continue;
      }
      const licenseUrl = rawUrl(repository.full_name, commit, license.path);
      const licenseResponse = await archiveRequest({ kind: "license", repositoryFullName: repository.full_name, url: licenseUrl, responsePath: `raw/repositories/${repositorySlug}/license.bin` });
      downloadRequests += 1;
      if (licenseResponse.body.byteLength !== license.size || gitBlobOid(licenseResponse.body) !== license.sha) throw new Error(`license Git blob binding drift: ${repository.full_name}`);

      for (const document of paths) {
        candidateOrder += 1;
        if (document.size < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumSourceBytes
          || document.size > API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.maximumSourceBytes) {
          const reasons = [document.size < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumSourceBytes ? "SOURCE_TOO_SMALL" : "SOURCE_TOO_LARGE"];
          excluded.push({ order: candidateOrder, repositoryFullName: repository.full_name, lineageKey, repositoryCommit: commit, repositoryPath: document.path, sourceSha256: null, reasons, evidence: "Git tree size failed the frozen source byte bound before download." });
          candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: commit, repositoryPath: document.path, sourceBlobOid: document.sha, licensePath: license.path, licenseBlobOid: license.sha, qualification: { status: "excluded", reasons, sourceBytes: document.size, sourceSha256: null, openapiVersion: null, operationCount: null }, selectedOrder: null });
          continue;
        }
        const extension = document.path.toLowerCase().endsWith(".json") ? "json" : document.path.toLowerCase().endsWith(".yml") ? "yml" : "yaml";
        const sourceUrl = rawUrl(repository.full_name, commit, document.path);
        const sourceResponse = await archiveRequest({ kind: "source", repositoryFullName: repository.full_name, url: sourceUrl, responsePath: `raw/repositories/${repositorySlug}/candidate-${String(candidateOrder).padStart(3, "0")}.${extension}` });
        downloadRequests += 1;
        if (sourceResponse.body.byteLength !== document.size || gitBlobOid(sourceResponse.body) !== document.sha) throw new Error(`source Git blob binding drift: ${repository.full_name}:${document.path}`);
        const qualification = qualifyApiTesterOperationSourceCandidate({
          repositoryFullName: repository.full_name,
          repositoryFork: repository.fork,
          repositoryArchived: repository.archived,
          sourcePath: document.path,
          sourceFormat: formatForPath(document.path),
          sourceBytes: sourceResponse.body,
          licenseSpdx: spdx,
          licenseBytes: licenseResponse.body,
          priorSourceDigests: priorDigests,
          priorLineageKeys: priorLineages,
          lineageKey,
        });
        if (qualification.status === "excluded") {
          excluded.push({ order: candidateOrder, repositoryFullName: repository.full_name, lineageKey, repositoryCommit: commit, repositoryPath: document.path, sourceSha256: qualification.sourceSha256, reasons: qualification.reasons, evidence: "Source bytes failed one or more frozen qualification rules." });
          candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: commit, repositoryPath: document.path, sourceBlobOid: document.sha, licensePath: license.path, licenseBlobOid: license.sha, qualification: { ...qualification }, selectedOrder: null });
          continue;
        }

        const selectionOrder = selected.length + 1;
        const rowId = `real-public-${String(selectionOrder).padStart(2, "0")}`;
        const inputRoot = `${outputDir}/inputs/${rowId}`;
        const sourceArchivePath = `${inputRoot}/source.${extension}`;
        const licenseArchivePath = `${inputRoot}/LICENSE`;
        const manifestPath = `${inputRoot}/manifest.json`;
        await writeFile(await resolveContainedNewFile(rootDir, sourceArchivePath, "selected source archive"), sourceResponse.body, { flag: "wx" });
        await writeFile(await resolveContainedNewFile(rootDir, licenseArchivePath, "selected license archive"), licenseResponse.body, { flag: "wx" });
        const manifestBytes = jsonBytes(ApiTesterOperationInputManifestSchema.parse({
          schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
          identity: "skill-ir-api-tester-operation-input-development-001",
          bindingId: `prospective-real-${String(selectionOrder).padStart(2, "0")}`,
          supportContractId: "api-tester-openapi-subset-v2",
          input: { path: sourceArchivePath, format: formatForPath(document.path), bytes: sourceResponse.body.byteLength, sha256: qualification.sourceSha256 },
          output: { path: "candidate-output", writeMode: "exclusive-create-once" },
        }));
        await writeFile(await resolveContainedNewFile(rootDir, manifestPath, "selected source manifest"), manifestBytes, { flag: "wx" });
        const row = {
          rowId,
          selectionOrder,
          queryId: found.queryId,
          queryRank: found.rank,
          discoveredAt: selectedAt,
          repository: { url: repository.html_url, fullName: repository.full_name, id: repository.id, fork: false as const, archived: false as const, lineageKey, commit },
          source: { repositoryPath: document.path, rawUrl: sourceUrl, archivePath: sourceArchivePath, manifestPath, manifestSha256: sha256(manifestBytes), format: formatForPath(document.path), bytes: sourceResponse.body.byteLength, sha256: qualification.sourceSha256, openapiVersion: qualification.openapiVersion!, operationCount: qualification.operationCount! },
          license: { spdx, repositoryPath: license.path, rawUrl: licenseUrl, archivePath: licenseArchivePath, bytes: licenseResponse.body.byteLength, sha256: sha256(licenseResponse.body) },
          selectionBasis: "First eligible source in frozen query/rank/repository/path order with unique repository, lineage, and source digest.",
          candidateTrialsBeforeSelection: 0 as const,
        } satisfies ApiTesterOperationRealSelection;
        selected.push(row);
        priorDigests.push(qualification.sourceSha256);
        priorLineages.push(lineageKey);
        candidates.push({ order: candidateOrder, queryId: found.queryId, queryRank: found.rank, repositoryFullName: repository.full_name, repositoryId: repository.id, lineageKey, repositoryCommit: commit, repositoryPath: document.path, sourceBlobOid: document.sha, licensePath: license.path, licenseBlobOid: license.sha, qualification: { ...qualification }, selectedOrder: selectionOrder });
        break;
      }
    }

    const selectionPath = `${outputDir}/selection.json`;
    const searchRequests = requests.filter((entry) => entry.kind === "search");
    const selection = ApiTesterOperationSourceSelectionReportSchema.parse({
      schemaVersion: "skill-ir-api-tester-operation-prospective-source-selection/v1",
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      selectedAt,
      preSourceFreeze: { path: freezePath, sha256: sha256(freezeBytes), commit: options.preSourceFreezeCommit },
      protocolSha256: apiTesterOperationProspectiveProtocolSha256(),
      discovery: {
        requests: searchRequests.map((entry) => ({ queryId: entry.queryId, requestedAt: selectedAt, url: entry.url, statusCode: entry.statusCode, response: { path: entry.response.path, sha256: entry.response.sha256, bytes: entry.response.byteLength }, sourceAcquisitionMillis: entry.acquisitionMillis })),
        candidatesInspected: selected.length + excluded.length,
        eligibleCandidates: selected.length,
        excludedCandidates: excluded.length,
        orderingApplied: "query-index-then-api-rank-then-repository-full-name-then-document-path",
      },
      selected,
      excluded,
      shortfall: { target: 12, actual: selected.length, missing: 12 - selected.length, ruleRelaxed: false },
      accounting: { publicSourceSearchRequests: searchRequests.length, publicSourceDownloadRequests: downloadRequests, candidateTrialsBeforeSelection: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0, developmentAgentUsage: "host-external-not-measured-by-runner" },
      claimBoundary: "This deterministic public-source selection is a development convenience sample. It does not use candidate outcomes, estimate ecosystem support, prove live API behavior, or change readiness.",
    });
    const selectionBytes = jsonBytes(selection);
    await writeFile(await resolveContainedNewFile(rootDir, selectionPath, "prospective source selection"), selectionBytes, { flag: "wx" });
    const acquisitionPath = `${outputDir}/acquisition.json`;
    const acquisitionWithoutSelection = {
      schemaVersion: API_TESTER_OPERATION_SOURCE_ACQUISITION_SCHEMA_VERSION,
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      status: selected.length === 12 ? "source-selection-complete" : "source-selection-shortfall",
      selectedAt,
      preSourceFreeze: { path: freezePath, sha256: sha256(freezeBytes), commit: options.preSourceFreezeCommit },
      requests,
      candidates,
      selection: { path: selectionPath, byteLength: selectionBytes.byteLength, sha256: sha256(selectionBytes) },
      accounting: { publicSourceSearchRequests: 2, publicSourceDownloadRequests: downloadRequests, selectedRealDocuments: selected.length, excludedCandidates: excluded.length, candidateTrialsBeforeSelection: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0 },
    };
    const acquisition = ApiTesterOperationSourceAcquisitionSchema.parse(acquisitionWithoutSelection);
    const acquisitionBytes = jsonBytes(acquisition);
    await writeFile(await resolveContainedNewFile(rootDir, acquisitionPath, "prospective source acquisition report"), acquisitionBytes, { flag: "wx" });
    await failureHandle.close();
    await unlink(failureFile);

    const files = await listFiles(outputRoot);
    const manifestPath = "output-manifest.json";
    const boundFiles = await Promise.all(files.filter((path) => path !== manifestPath).sort(compareText).map(async (path) => {
      const bytes = await readFile(join(outputRoot, ...path.split("/")));
      return { path, byteLength: bytes.byteLength, sha256: sha256(bytes) };
    }));
    const manifest = ApiTesterOperationSourceArchiveManifestSchema.parse({
      schemaVersion: API_TESTER_OPERATION_SOURCE_ARCHIVE_MANIFEST_SCHEMA_VERSION,
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      status: "source-selection-archive-closed",
      acquisition: { path: "acquisition.json", byteLength: acquisitionBytes.byteLength, sha256: sha256(acquisitionBytes) },
      selection: { path: "selection.json", byteLength: selectionBytes.byteLength, sha256: sha256(selectionBytes) },
      files: boundFiles,
    });
    await writeFile(await resolveContainedNewFile(rootDir, `${outputDir}/${manifestPath}`, "prospective source archive manifest"), jsonBytes(manifest), { flag: "wx" });
    return selection;
  } catch (error) {
    const failure = ApiTesterOperationSourceAcquisitionFailureSchema.parse({
      schemaVersion: API_TESTER_OPERATION_SOURCE_ACQUISITION_FAILURE_SCHEMA_VERSION,
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      status: "source-acquisition-failed",
      failedAt: selectedAt,
      preSourceFreeze: { path: freezePath, sha256: sha256(freezeBytes), commit: options.preSourceFreezeCommit },
      error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) },
      requests,
      accounting: { requestsAttempted: requests.length, publicSourceResponsesArchived: requests.length, candidateTrialsBeforeSelection: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0 },
    });
    await failureHandle.truncate(0);
    await failureHandle.writeFile(jsonBytes(failure));
    await failureHandle.sync();
    await failureHandle.close();
    throw error;
  }
}

export async function verifyApiTesterOperationProspectiveSourceArchive(options: { rootDir: string; outputDir: string }) {
  const rootDir = resolve(options.rootDir);
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "prospective source output directory");
  const manifestFile = await resolveContainedExistingFile(rootDir, `${outputDir}/output-manifest.json`, "prospective source archive manifest");
  const outputRoot = dirname(manifestFile);
  const manifest = ApiTesterOperationSourceArchiveManifestSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")));
  exactSet(await listFiles(outputRoot), ["output-manifest.json", ...manifest.files.map((file) => file.path)], "prospective source archive");
  for (const file of manifest.files) {
    const target = await resolveContainedExistingFile(outputRoot, file.path, "prospective source archive file");
    const bytes = await readFile(target);
    if (bytes.byteLength !== file.byteLength || sha256(bytes) !== file.sha256) throw new Error(`prospective source archive digest / sha256 or byte drift: ${file.path}`);
  }
  const acquisitionBytes = await readFile(await resolveContainedExistingFile(outputRoot, manifest.acquisition.path, "source acquisition report"));
  if (acquisitionBytes.byteLength !== manifest.acquisition.byteLength || sha256(acquisitionBytes) !== manifest.acquisition.sha256) throw new Error("source acquisition report digest drift");
  const acquisition = ApiTesterOperationSourceAcquisitionSchema.parse(JSON.parse(acquisitionBytes.toString("utf8")));
  const selectionBytes = await readFile(await resolveContainedExistingFile(outputRoot, manifest.selection.path, "source selection report"));
  if (selectionBytes.byteLength !== manifest.selection.byteLength || sha256(selectionBytes) !== manifest.selection.sha256
    || acquisition.selection.sha256 !== manifest.selection.sha256 || acquisition.selection.byteLength !== manifest.selection.byteLength) {
    throw new Error("source selection report digest drift");
  }
  const selection = ApiTesterOperationSourceSelectionReportSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const freezeBytes = await readFile(await resolveContainedExistingFile(rootDir, acquisition.preSourceFreeze.path, "pre-source freeze"));
  if (sha256(freezeBytes) !== acquisition.preSourceFreeze.sha256
    || selection.preSourceFreeze.sha256 !== acquisition.preSourceFreeze.sha256
    || selection.preSourceFreeze.commit !== acquisition.preSourceFreeze.commit
    || selection.protocolSha256 !== apiTesterOperationProspectiveProtocolSha256()) {
    throw new Error("source acquisition pre-source freeze or protocol binding drift");
  }
  const searchRequests = acquisition.requests.filter((entry) => entry.kind === "search");
  if (searchRequests.length !== 2 || searchRequests.some((entry, index) => (
    entry.ordinal !== index + 1
    || entry.queryId !== API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries[index]!.queryId
    || entry.url !== buildSearchUrl(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries[index]!)
  ))) throw new Error("source discovery search request order drift");
  if (acquisition.requests.some((entry, index) => entry.ordinal !== index + 1)) {
    throw new Error("source discovery request ordinal drift");
  }
  const responseBytesByOrdinal = new Map<number, Uint8Array>();
  for (const request of acquisition.requests) {
    if (request.statusCode < 200 || request.statusCode >= 300) throw new Error(`successful source archive contains non-success HTTP ${request.statusCode}`);
    const responseBytes = await readFile(await resolveContainedExistingFile(rootDir, request.response.path, "archived public source response"));
    const metadataBytes = await readFile(await resolveContainedExistingFile(rootDir, request.metadata.path, "archived public source metadata"));
    if (responseBytes.byteLength !== request.response.byteLength || sha256(responseBytes) !== request.response.sha256
      || metadataBytes.byteLength !== request.metadata.byteLength || sha256(metadataBytes) !== request.metadata.sha256) {
      throw new Error(`archived request digest drift: ${request.ordinal}`);
    }
    responseBytesByOrdinal.set(request.ordinal, responseBytes);
  }
  const searchRepositoryByPosition = new Map<string, z.infer<typeof GitHubRepositorySchema>>();
  const orderedSearchRepositories: Array<{
    queryId: "github-topic-openapi-specification" | "github-topic-openapi";
    queryRank: number;
    repository: z.infer<typeof GitHubRepositorySchema>;
  }> = [];
  for (const request of searchRequests) {
    const parsed = GitHubSearchSchema.parse(JSON.parse(new TextDecoder().decode(responseBytesByOrdinal.get(request.ordinal)!)));
    parsed.items.forEach((repository, index) => {
      exactRepositoryApiUrl(repository);
      searchRepositoryByPosition.set(`${request.queryId}:${index + 1}`, repository);
      orderedSearchRepositories.push({
        queryId: request.queryId!,
        queryRank: index + 1,
        repository,
      });
    });
  }

  const exactRequest = (
    kind: z.infer<typeof RequestRecordSchema>["kind"],
    repositoryFullName: string,
    url: string,
  ): z.infer<typeof RequestRecordSchema> => {
    const matches = acquisition.requests.filter((request) => (
      request.kind === kind && request.repositoryFullName === repositoryFullName && request.url === url
    ));
    if (matches.length !== 1) throw new Error(`${kind} request binding drift: ${repositoryFullName}`);
    return matches[0]!;
  };

  if (acquisition.candidates.some((candidate, index) => candidate.order !== index + 1)) {
    throw new Error("source candidate order drift");
  }
  const replayCoveredCandidateOrders = new Set<number>();
  const replayConsumedRequestOrdinals = new Set(searchRequests.map((request) => request.ordinal));
  const replaySeenRepositories = new Set<string>();
  const replayPriorDigests: string[] = [];
  const replayPriorLineages: string[] = [];
  let replaySelectedCount = 0;
  for (const found of orderedSearchRepositories) {
    if (replaySelectedCount === 12) break;
    const repository = found.repository;
    const repositoryKey = repository.full_name.toLowerCase();
    const lineageKey = `github-repository-id:${repository.id}`;
    const group = acquisition.candidates.filter((candidate) => (
      candidate.queryId === found.queryId && candidate.queryRank === found.queryRank
    ));
    if (group.length === 0 || group.some((candidate) => (
      candidate.repositoryFullName !== repository.full_name
      || candidate.repositoryId !== repository.id
      || candidate.lineageKey !== lineageKey
    ))) {
      throw new Error(`raw search candidate coverage drift: ${found.queryId}:${found.queryRank}`);
    }
    group.forEach((candidate) => replayCoveredCandidateOrders.add(candidate.order));

    if (replaySeenRepositories.has(repositoryKey)) {
      if (group.length !== 1 || group[0]!.repositoryCommit !== null || group[0]!.repositoryPath !== null
        || group[0]!.selectedOrder !== null || group[0]!.qualification.status !== "excluded"
        || JSON.stringify(group[0]!.qualification.reasons) !== JSON.stringify(["DUPLICATE_LINEAGE"])) {
        throw new Error(`duplicate raw search candidate replay drift: ${repository.full_name}`);
      }
      continue;
    }
    replaySeenRepositories.add(repositoryKey);
    const preReasons: string[] = [];
    if (API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.exclusions.exposedRepositories.some((value) => value.toLowerCase() === repositoryKey)) preReasons.push("EXPOSED_REPOSITORY");
    if (repository.private) preReasons.push("PRIVATE_REPOSITORY");
    if (repository.fork) preReasons.push("FORK");
    if (repository.archived) preReasons.push("ARCHIVED");
    const spdx = repository.license?.spdx_id ?? "NOASSERTION";
    if (!(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.licenseSpdxAllowlist as readonly string[]).includes(spdx)) preReasons.push("LICENSE_NOT_ALLOWED");
    if (preReasons.length > 0) {
      if (group.length !== 1 || group[0]!.repositoryCommit !== null || group[0]!.repositoryPath !== null
        || group[0]!.selectedOrder !== null || group[0]!.qualification.status !== "excluded"
        || JSON.stringify(group[0]!.qualification.reasons) !== JSON.stringify(preReasons)) {
        throw new Error(`pre-download source candidate replay drift: ${repository.full_name}`);
      }
      continue;
    }

    const repositoryApiUrl = exactRepositoryApiUrl(repository);
    const branchUrl = `${repositoryApiUrl}/branches/${encodeURIComponent(repository.default_branch)}`;
    const branchRequest = exactRequest("branch", repository.full_name, branchUrl);
    replayConsumedRequestOrdinals.add(branchRequest.ordinal);
    const branch = GitHubBranchSchema.parse(JSON.parse(new TextDecoder().decode(responseBytesByOrdinal.get(branchRequest.ordinal)!)));
    const commit = branch.commit.sha;
    const treeUrl = `${repositoryApiUrl}/git/trees/${commit}?recursive=1`;
    const treeRequest = exactRequest("tree", repository.full_name, treeUrl);
    replayConsumedRequestOrdinals.add(treeRequest.ordinal);
    const tree = GitHubTreeSchema.parse(JSON.parse(new TextDecoder().decode(responseBytesByOrdinal.get(treeRequest.ordinal)!)));
    const paths = documentPaths(tree);
    const license = licenseEntry(tree);
    if (tree.truncated || paths.length === 0 || !license) {
      const reasons = tree.truncated ? ["TREE_TRUNCATED"] : paths.length === 0 ? ["FORMAT_PATH_MISMATCH"] : ["LICENSE_BYTES_MISSING"];
      if (group.length !== 1 || group[0]!.repositoryCommit !== commit || group[0]!.repositoryPath !== null
        || group[0]!.selectedOrder !== null || group[0]!.qualification.status !== "excluded"
        || JSON.stringify(group[0]!.qualification.reasons) !== JSON.stringify(reasons)) {
        throw new Error(`tree source candidate replay drift: ${repository.full_name}`);
      }
      continue;
    }

    const licenseUrl = rawUrl(repository.full_name, commit, license.path);
    const licenseRequest = exactRequest("license", repository.full_name, licenseUrl);
    replayConsumedRequestOrdinals.add(licenseRequest.ordinal);
    const licenseBytes = responseBytesByOrdinal.get(licenseRequest.ordinal)!;
    if (licenseBytes.byteLength !== license.size || gitBlobOid(licenseBytes) !== license.sha) {
      throw new Error(`license blob replay drift: ${repository.full_name}`);
    }
    let groupIndex = 0;
    for (const document of paths) {
      const candidate = group[groupIndex];
      if (!candidate || candidate.repositoryCommit !== commit || candidate.repositoryPath !== document.path
        || candidate.sourceBlobOid !== document.sha || candidate.licensePath !== license.path
        || candidate.licenseBlobOid !== license.sha) {
        throw new Error(`document candidate replay coverage drift: ${repository.full_name}:${document.path}`);
      }
      groupIndex += 1;
      if (document.size < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumSourceBytes
        || document.size > API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.maximumSourceBytes) {
        const reasons = [document.size < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumSourceBytes ? "SOURCE_TOO_SMALL" : "SOURCE_TOO_LARGE"];
        if (candidate.selectedOrder !== null || candidate.qualification.status !== "excluded"
          || candidate.qualification.sourceBytes !== document.size
          || JSON.stringify(candidate.qualification.reasons) !== JSON.stringify(reasons)) {
          throw new Error(`source size candidate replay drift: ${repository.full_name}:${document.path}`);
        }
        continue;
      }
      const sourceUrl = rawUrl(repository.full_name, commit, document.path);
      const sourceRequest = exactRequest("source", repository.full_name, sourceUrl);
      replayConsumedRequestOrdinals.add(sourceRequest.ordinal);
      const sourceBytes = responseBytesByOrdinal.get(sourceRequest.ordinal)!;
      if (sourceBytes.byteLength !== document.size || gitBlobOid(sourceBytes) !== document.sha) {
        throw new Error(`source blob replay drift: ${repository.full_name}:${document.path}`);
      }
      const qualification = qualifyApiTesterOperationSourceCandidate({
        repositoryFullName: repository.full_name,
        repositoryFork: repository.fork,
        repositoryArchived: repository.archived,
        sourcePath: document.path,
        sourceFormat: formatForPath(document.path),
        sourceBytes,
        licenseSpdx: spdx,
        licenseBytes,
        priorSourceDigests: replayPriorDigests,
        priorLineageKeys: replayPriorLineages,
        lineageKey,
      });
      if (JSON.stringify(candidate.qualification) !== JSON.stringify(qualification)) {
        throw new Error(`source qualification replay drift: ${repository.full_name}:${document.path}`);
      }
      if (qualification.status === "eligible") {
        replaySelectedCount += 1;
        if (candidate.selectedOrder !== replaySelectedCount) {
          throw new Error(`selected source replay order drift: ${repository.full_name}:${document.path}`);
        }
        replayPriorDigests.push(qualification.sourceSha256);
        replayPriorLineages.push(lineageKey);
        break;
      }
      if (candidate.selectedOrder !== null) throw new Error(`excluded source replay selection drift: ${repository.full_name}:${document.path}`);
    }
    if (groupIndex !== group.length) throw new Error(`document candidate replay surplus drift: ${repository.full_name}`);
  }
  if (replayCoveredCandidateOrders.size !== acquisition.candidates.length
    || replaySelectedCount !== selection.selected.length) {
    throw new Error("raw search source candidate replay coverage drift");
  }
  exactSet(
    acquisition.requests.map((request) => String(request.ordinal)),
    [...replayConsumedRequestOrdinals].map(String),
    "source request replay",
  );
  const selectedCandidates = acquisition.candidates.filter((candidate) => candidate.selectedOrder !== null);
  const excludedCandidates = acquisition.candidates.filter((candidate) => candidate.selectedOrder === null);
  if (selectedCandidates.length !== selection.selected.length || excludedCandidates.length !== selection.excluded.length) {
    throw new Error("source candidate selection coverage drift");
  }
  for (const excluded of selection.excluded) {
    const matches = acquisition.candidates.filter((candidate) => candidate.order === excluded.order);
    if (matches.length !== 1) throw new Error(`excluded source candidate binding drift: ${excluded.order}`);
    const candidate = matches[0]!;
    if (candidate.selectedOrder !== null
      || candidate.repositoryFullName !== excluded.repositoryFullName
      || candidate.lineageKey !== excluded.lineageKey
      || candidate.repositoryCommit !== excluded.repositoryCommit
      || candidate.repositoryPath !== excluded.repositoryPath
      || candidate.qualification.sourceSha256 !== excluded.sourceSha256
      || candidate.qualification.status !== "excluded"
      || JSON.stringify(candidate.qualification.reasons) !== JSON.stringify(excluded.reasons)) {
      throw new Error(`excluded source candidate binding drift: ${excluded.order}`);
    }
  }

  const priorDigests: string[] = [];
  const priorLineages: string[] = [];
  for (const [index, row] of selection.selected.entries()) {
    if (row.selectionOrder !== index + 1) throw new Error(`selected source order drift: ${row.rowId}`);
    const candidateMatches = acquisition.candidates.filter((candidate) => candidate.selectedOrder === row.selectionOrder);
    if (candidateMatches.length !== 1) throw new Error(`selected candidate binding drift: ${row.rowId}`);
    const candidate = candidateMatches[0]!;
    const discoveredRepository = searchRepositoryByPosition.get(`${candidate.queryId}:${candidate.queryRank}`);
    if (!discoveredRepository
      || candidate.queryId !== row.queryId
      || candidate.queryRank !== row.queryRank
      || candidate.repositoryFullName !== row.repository.fullName
      || candidate.repositoryId !== row.repository.id
      || candidate.lineageKey !== row.repository.lineageKey
      || candidate.repositoryCommit !== row.repository.commit
      || candidate.repositoryPath !== row.source.repositoryPath
      || candidate.licensePath !== row.license.repositoryPath
      || candidate.qualification.status !== "eligible"
      || candidate.qualification.sourceSha256 !== row.source.sha256
      || candidate.qualification.openapiVersion !== row.source.openapiVersion
      || candidate.qualification.operationCount !== row.source.operationCount
      || discoveredRepository.id !== row.repository.id
      || discoveredRepository.full_name !== row.repository.fullName
      || discoveredRepository.html_url !== row.repository.url
      || discoveredRepository.fork !== row.repository.fork
      || discoveredRepository.archived !== row.repository.archived) {
      throw new Error(`selected candidate source binding drift: ${row.rowId}`);
    }

    const repositoryApiUrl = exactRepositoryApiUrl(discoveredRepository);
    const branchUrl = `${repositoryApiUrl}/branches/${encodeURIComponent(discoveredRepository.default_branch)}`;
    const branchRequest = exactRequest("branch", row.repository.fullName, branchUrl);
    const branch = GitHubBranchSchema.parse(JSON.parse(new TextDecoder().decode(responseBytesByOrdinal.get(branchRequest.ordinal)!)));
    if (branch.commit.sha !== row.repository.commit) throw new Error(`branch commit binding drift: ${row.rowId}`);
    const treeUrl = `${repositoryApiUrl}/git/trees/${row.repository.commit}?recursive=1`;
    const treeRequest = exactRequest("tree", row.repository.fullName, treeUrl);
    const tree = GitHubTreeSchema.parse(JSON.parse(new TextDecoder().decode(responseBytesByOrdinal.get(treeRequest.ordinal)!)));
    if (tree.truncated) throw new Error(`tree source binding drift: ${row.rowId}`);
    const sourceTreeEntries = tree.tree.filter((entry) => entry.path === row.source.repositoryPath);
    const licenseTreeEntries = tree.tree.filter((entry) => entry.path === row.license.repositoryPath);
    if (sourceTreeEntries.length !== 1 || licenseTreeEntries.length !== 1) {
      throw new Error(`tree source/license binding drift: ${row.rowId}`);
    }
    const sourceTreeEntry = sourceTreeEntries[0]!;
    const licenseTreeEntry = licenseTreeEntries[0]!;
    if (sourceTreeEntry.type !== "blob" || !["100644", "100755"].includes(sourceTreeEntry.mode)
      || sourceTreeEntry.size !== row.source.bytes || sourceTreeEntry.sha !== candidate.sourceBlobOid) {
      throw new Error(`tree source blob binding drift: ${row.rowId}`);
    }
    if (licenseTreeEntry.type !== "blob" || !["100644", "100755"].includes(licenseTreeEntry.mode)
      || licenseTreeEntry.size !== row.license.bytes || licenseTreeEntry.sha !== candidate.licenseBlobOid) {
      throw new Error(`tree license blob binding drift: ${row.rowId}`);
    }

    const sourceBytes = await readFile(await resolveContainedExistingFile(rootDir, row.source.archivePath, "selected prospective source"));
    const licenseBytes = await readFile(await resolveContainedExistingFile(rootDir, row.license.archivePath, "selected prospective license"));
    const manifestBytes = await readFile(await resolveContainedExistingFile(rootDir, row.source.manifestPath, "selected prospective manifest"));
    const expectedSourceUrl = rawUrl(row.repository.fullName, row.repository.commit, row.source.repositoryPath);
    const expectedLicenseUrl = rawUrl(row.repository.fullName, row.repository.commit, row.license.repositoryPath);
    if (row.source.rawUrl !== expectedSourceUrl || row.license.rawUrl !== expectedLicenseUrl) {
      throw new Error(`selected raw URL binding drift: ${row.rowId}`);
    }
    const sourceRequest = exactRequest("source", row.repository.fullName, expectedSourceUrl);
    const licenseRequest = exactRequest("license", row.repository.fullName, expectedLicenseUrl);
    const rawSourceBytes = responseBytesByOrdinal.get(sourceRequest.ordinal)!;
    const rawLicenseBytes = responseBytesByOrdinal.get(licenseRequest.ordinal)!;
    if (rawSourceBytes.byteLength !== sourceBytes.byteLength || sha256(rawSourceBytes) !== sha256(sourceBytes)
      || gitBlobOid(rawSourceBytes) !== candidate.sourceBlobOid) {
      throw new Error(`raw source blob binding drift: ${row.rowId}`);
    }
    if (rawLicenseBytes.byteLength !== licenseBytes.byteLength || sha256(rawLicenseBytes) !== sha256(licenseBytes)
      || gitBlobOid(rawLicenseBytes) !== candidate.licenseBlobOid) {
      throw new Error(`raw license blob binding drift: ${row.rowId}`);
    }
    const inputManifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (sourceBytes.byteLength !== row.source.bytes || sha256(sourceBytes) !== row.source.sha256
      || licenseBytes.byteLength !== row.license.bytes || sha256(licenseBytes) !== row.license.sha256
      || sha256(manifestBytes) !== row.source.manifestSha256
      || inputManifest.input.path !== row.source.archivePath || inputManifest.input.sha256 !== row.source.sha256) {
      throw new Error(`selected source/license/manifest binding drift: ${row.rowId}`);
    }
    const qualification = qualifyApiTesterOperationSourceCandidate({
      repositoryFullName: row.repository.fullName,
      repositoryFork: row.repository.fork,
      repositoryArchived: row.repository.archived,
      sourcePath: row.source.repositoryPath,
      sourceFormat: row.source.format,
      sourceBytes,
      licenseSpdx: row.license.spdx,
      licenseBytes,
      priorSourceDigests: priorDigests,
      priorLineageKeys: priorLineages,
      lineageKey: row.repository.lineageKey,
    });
    if (qualification.status !== "eligible" || qualification.sourceSha256 !== row.source.sha256
      || qualification.openapiVersion !== row.source.openapiVersion || qualification.operationCount !== row.source.operationCount) {
      throw new Error(`selected source qualification drift: ${row.rowId}`);
    }
    priorDigests.push(row.source.sha256);
    priorLineages.push(row.repository.lineageKey);
  }
  if (selection.selected.length !== acquisition.accounting.selectedRealDocuments
    || selection.excluded.length !== acquisition.accounting.excludedCandidates
    || acquisition.requests.length !== acquisition.accounting.publicSourceSearchRequests + acquisition.accounting.publicSourceDownloadRequests) {
    throw new Error("source acquisition accounting drift");
  }
  return {
    status: "verified-source-selection-archive" as const,
    selectedRealDocuments: selection.selected.length,
    publicSourceSearchRequests: selection.accounting.publicSourceSearchRequests,
    candidateTrialsBeforeSelection: 0 as const,
  };
}
