import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY,
  API_TESTER_OPERATION_CANDIDATE_BINDING_PATH,
  ApiTesterOperationCandidateBindingSchema,
  verifyApiTesterOperationCandidateBindingAgainstLiveTree,
} from "./api-tester-operation-candidate-binding";
import { SafeRelativePathSchema, Sha256Schema, parseSafeRelativePath } from "./artifact-package";
import {
  ApiTesterOperationInputManifestSchema,
  ApiTesterOperationOutputManifestSchema,
  ApiTesterOperationInputReportSchema,
  runApiTesterOperationInput,
  verifyApiTesterOperationInputOutput,
} from "../../skill-ir/api-tester-operation-input";

export const API_TESTER_OPERATION_PROSPECTIVE_IDENTITY =
  "skill-ir-api-tester-operation-prospective-001" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-protocol/v1" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_PRE_SOURCE_FREEZE_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-pre-source-freeze/v1" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_LOCK_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-lock/v1" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_RUN_STATE_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-run-state/v1" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_FIRST_RUN_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-first-run-report/v1" as const;
export const API_TESTER_OPERATION_SYNTHETIC_VALIDATION_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-synthetic-validation/v1" as const;

const SUPPORT_CONTRACT_ID = "api-tester-openapi-subset-v2" as const;
const BRANCH = "api-tester-operation-unseen-prospective-001" as const;
const REMOTE_BRANCH = "origin/api-tester-operation-unseen-prospective-001" as const;
const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts",
  "src/benchmarks/skill-ir/api-tester-operation-prospective.ts",
] as const;
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();
const GitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const RowIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u);
const DateTimeSchema = z.string().datetime();
const ExecutionPolicySchema = z.object({
  attemptsPerRow: z.literal(1),
  retries: z.literal(0),
  replacements: z.literal(0),
  candidateFixes: z.literal(0),
  runAllRows: z.literal(true),
  retainAllOutcomesInDenominator: z.literal(true),
  dispatchedWithoutTerminal: z.literal("fail-closed-no-redispatch"),
}).strict();

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

function pathWithin(parent: string, candidate: string): boolean {
  const local = relative(resolve(parent), resolve(candidate));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(rootDir: string, path: string, label: string): string {
  const safe = parseSafeRelativePath(portable(path));
  const root = resolve(rootDir);
  const absolute = resolve(root, safe);
  if (absolute === root || !pathWithin(root, absolute)) throw new Error(`${label} escapes root: ${safe}`);
  return absolute;
}

async function regularFile(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function digestRef(rootDir: string, path: string, label = "bound file"): Promise<{ path: string; sha256: string }> {
  const safe = parseSafeRelativePath(portable(path));
  const absolute = contained(rootDir, safe, label);
  if (!await regularFile(absolute)) throw new Error(`${label} is missing or not a regular file: ${safe}`);
  return { path: safe, sha256: sha256(await readFile(absolute)) };
}

function gitResult(rootDir: string, gitExecutable: string, args: string[]) {
  const child = spawnSync(gitExecutable, ["-c", `safe.directory=${portable(resolve(rootDir))}`, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: child.status, stdout: child.stdout ?? "", stderr: child.stderr ?? "" };
}

function gitBytes(rootDir: string, gitExecutable: string, commit: string, path: string): Buffer {
  const safe = parseSafeRelativePath(portable(path));
  const child = spawnSync(gitExecutable, [
    "-c", `safe.directory=${portable(resolve(rootDir))}`,
    "cat-file", "--filters", `--path=${safe}`, `${GitCommitSchema.parse(commit)}:${safe}`,
  ], { cwd: rootDir, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (child.status !== 0 || !child.stdout) {
    throw new Error(`Git commit does not contain bound file ${safe}: ${child.stderr?.toString("utf8").trim() ?? "unknown"}`);
  }
  return child.stdout;
}

function verifyGitRef(rootDir: string, gitExecutable: string, commit: string, ref: { path: string; sha256: string }): void {
  const actual = sha256(gitBytes(rootDir, gitExecutable, commit, ref.path));
  if (actual !== ref.sha256) throw new Error(`Git-bound digest mismatch: ${ref.path}`);
}

function assertCommitOnRemote(rootDir: string, gitExecutable: string, commit: string, remoteBranch = REMOTE_BRANCH): void {
  const identity = gitResult(rootDir, gitExecutable, ["rev-parse", "--verify", `${GitCommitSchema.parse(commit)}^{commit}`]);
  if (identity.status !== 0 || identity.stdout.trim() !== commit) throw new Error("requested full Git commit identity is unavailable");
  const remote = gitResult(rootDir, gitExecutable, ["merge-base", "--is-ancestor", commit, remoteBranch]);
  if (remote.status !== 0) throw new Error(`commit is not present on ${remoteBranch}`);
}

const ExposedRepositorySchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

export const ApiTesterOperationProspectiveProtocolSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  researchQuestion: z.literal("Can the frozen operation-level method automatically admit, construct, and check in-contract operations in unseen public OpenAPI documents while completely reporting every other operation?"),
  sourceDiscovery: z.object({
    provider: z.literal("github-public-repository-search"),
    api: z.literal("https://api.github.com/search/repositories"),
    queries: z.tuple([
      z.object({ queryId: z.literal("github-topic-openapi-specification"), query: z.literal("topic:openapi-specification archived:false fork:false"), sort: z.literal("stars"), order: z.literal("desc"), perPage: z.literal(100), pages: z.tuple([z.literal(1)]) }).strict(),
      z.object({ queryId: z.literal("github-topic-openapi"), query: z.literal("topic:openapi archived:false fork:false"), sort: z.literal("stars"), order: z.literal("desc"), perPage: z.literal(100), pages: z.tuple([z.literal(1)]) }).strict(),
    ]),
    order: z.literal("query-index-then-api-rank-then-repository-full-name-then-document-path"),
    repositoryTreeRule: z.literal("At the captured default-branch commit, inspect the recursive Git tree and order matching OpenAPI filenames lexicographically."),
    documentPathPattern: z.literal("(^|/)(openapi|swagger)[-_.a-z0-9]*\\.(json|ya?ml)$"),
    discoveryEvidence: z.literal("Archive normalized search responses, repository metadata, inspected tree candidates, and every inclusion/exclusion decision."),
  }).strict(),
  eligibility: z.object({
    publicRepository: z.literal(true),
    forkAllowed: z.literal(false),
    archivedAllowed: z.literal(false),
    openapiMajorMinor: z.tuple([z.literal("3.0"), z.literal("3.1")]),
    formats: z.tuple([z.literal("json"), z.literal("yaml")]),
    minimumSourceBytes: z.literal(100),
    maximumSourceBytes: z.literal(2_097_152),
    minimumOperations: z.literal(1),
    maximumOperations: z.literal(2_000),
    licenseSpdxAllowlist: z.tuple([
      z.literal("Apache-2.0"), z.literal("MIT"), z.literal("BSD-2-Clause"), z.literal("BSD-3-Clause"),
      z.literal("ISC"), z.literal("MPL-2.0"), z.literal("CC0-1.0"), z.literal("Unlicense"),
      z.literal("GPL-2.0"), z.literal("GPL-3.0"), z.literal("LGPL-2.1"), z.literal("LGPL-3.0"),
      z.literal("AGPL-3.0"), z.literal("CDDL-1.0"),
    ]),
    licenseBytesRequired: z.literal(true),
    candidateOutcomeUsedForSelection: z.literal(false),
  }).strict(),
  exclusions: z.object({
    exposedRepositories: z.array(ExposedRepositorySchema).length(10),
    exactSourceDigestDuplicates: z.literal(true),
    repositoryAndLineageDuplicates: z.literal(true),
    heldOutAndQ1Reserved: z.literal("prohibited-without-reading-protected-registries"),
    pendingProspective: z.literal(true),
    mirrorsAndForksIndependent: z.literal(false),
  }).strict(),
  denominator: z.object({
    realDocuments: z.literal(12),
    independentRepositoryTarget: z.literal(12),
    syntheticDocuments: z.literal(6),
    totalDocuments: z.literal(18),
    oneDocumentCountsOnce: z.literal(true),
    syntheticIncludedInRealRates: z.literal(false),
  }).strict(),
  resourceLimits: z.object({
    maximumSourceBytes: z.literal(2_097_152),
    maximumOperations: z.literal(2_000),
    sourceDownloadTimeoutMs: z.literal(30_000),
    sourceQualificationTimeoutMs: z.literal(5_000),
    perDocumentRunTimeoutMs: z.literal(120_000),
    totalFirstRunTimeoutMs: z.literal(2_160_000),
  }).strict(),
  executionPolicy: ExecutionPolicySchema,
  outcomeClasses: z.tuple([
    z.literal("fully-accepted-within-local-contract"), z.literal("partial"), z.literal("rejected"),
    z.literal("unresolved"), z.literal("construction-or-checker-failed"), z.literal("infrastructure-failed"),
  ]),
  metrics: z.object({
    documentCounts: z.literal(true),
    operationCounts: z.literal(true),
    admissionCounts: z.literal(true),
    checkerPassedOperations: z.literal(true),
    sourceAdvisoriesAndBlocking: z.literal(true),
    constructionObligationCoverage: z.literal(true),
    predictionComparison: z.literal(true),
    durationAndSourceAcquisitionSeparate: z.literal(true),
  }).strict(),
  stopConditions: z.object({
    preRowZero: z.tuple([
      z.literal("candidate-or-runner-binding-failure"), z.literal("input-license-manifest-or-prediction-closure-failure"),
      z.literal("non-clean-or-wrong-execution-commit"), z.literal("output-already-exists"),
    ]),
    afterDispatch: z.literal("record-terminal-or-fail-closed; never retry, replace, or fix the candidate"),
    sourceShortfall: z.literal("record the deterministic shortfall without relaxing eligibility or filling from excluded sources"),
  }).strict(),
  evidence: z.object({
    sourceBytes: z.literal(true), licenseBytes: z.literal(true), upstreamCommitPathAndUrl: z.literal(true),
    sourceAndLicenseDigests: z.literal(true), ordinaryInputManifest: z.literal(true), discoveryAndExclusionLog: z.literal(true),
    predictionBeforeCandidateTrial: z.literal(true), stateJournalTerminalAndPrefix: z.literal(true), exactOutputClosure: z.literal(true),
  }).strict(),
  claimBoundary: z.string().min(1),
  audit: z.object({
    heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0), modelCalls: z.literal(0),
    businessApiCalls: z.literal(0), paidCalls: z.literal(0), readinessChanges: z.literal(0),
  }).strict(),
}).strict().superRefine((protocol, context) => {
  if (new Set(protocol.exclusions.exposedRepositories.map((entry) => entry.toLowerCase())).size !== 10) {
    context.addIssue({ code: "custom", path: ["exclusions", "exposedRepositories"], message: "exposed repository exclusions must be unique" });
  }
});

export const API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL = ApiTesterOperationProspectiveProtocolSchema.parse({
  schemaVersion: API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL_SCHEMA_VERSION,
  identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
  researchQuestion: "Can the frozen operation-level method automatically admit, construct, and check in-contract operations in unseen public OpenAPI documents while completely reporting every other operation?",
  sourceDiscovery: {
    provider: "github-public-repository-search",
    api: "https://api.github.com/search/repositories",
    queries: [
      { queryId: "github-topic-openapi-specification", query: "topic:openapi-specification archived:false fork:false", sort: "stars", order: "desc", perPage: 100, pages: [1] },
      { queryId: "github-topic-openapi", query: "topic:openapi archived:false fork:false", sort: "stars", order: "desc", perPage: 100, pages: [1] },
    ],
    order: "query-index-then-api-rank-then-repository-full-name-then-document-path",
    repositoryTreeRule: "At the captured default-branch commit, inspect the recursive Git tree and order matching OpenAPI filenames lexicographically.",
    documentPathPattern: "(^|/)(openapi|swagger)[-_.a-z0-9]*\\.(json|ya?ml)$",
    discoveryEvidence: "Archive normalized search responses, repository metadata, inspected tree candidates, and every inclusion/exclusion decision.",
  },
  eligibility: {
    publicRepository: true,
    forkAllowed: false,
    archivedAllowed: false,
    openapiMajorMinor: ["3.0", "3.1"],
    formats: ["json", "yaml"],
    minimumSourceBytes: 100,
    maximumSourceBytes: 2_097_152,
    minimumOperations: 1,
    maximumOperations: 2_000,
    licenseSpdxAllowlist: ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "CC0-1.0", "Unlicense", "GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "CDDL-1.0"],
    licenseBytesRequired: true,
    candidateOutcomeUsedForSelection: false,
  },
  exclusions: {
    exposedRepositories: [
      "open-meteo/open-meteo", "dpp-admin/openapi", "openwrt-iac/uapi", "htool/signalk-polar-performance-plugin",
      "oracle/opengrok", "box/box-openapi", "meilisearch/specifications", "bangumi/server", "DeepLcom/openapi", "rejetto/hfs",
    ],
    exactSourceDigestDuplicates: true,
    repositoryAndLineageDuplicates: true,
    heldOutAndQ1Reserved: "prohibited-without-reading-protected-registries",
    pendingProspective: true,
    mirrorsAndForksIndependent: false,
  },
  denominator: { realDocuments: 12, independentRepositoryTarget: 12, syntheticDocuments: 6, totalDocuments: 18, oneDocumentCountsOnce: true, syntheticIncludedInRealRates: false },
  resourceLimits: { maximumSourceBytes: 2_097_152, maximumOperations: 2_000, sourceDownloadTimeoutMs: 30_000, sourceQualificationTimeoutMs: 5_000, perDocumentRunTimeoutMs: 120_000, totalFirstRunTimeoutMs: 2_160_000 },
  executionPolicy: { attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0, runAllRows: true, retainAllOutcomesInDenominator: true, dispatchedWithoutTerminal: "fail-closed-no-redispatch" },
  outcomeClasses: ["fully-accepted-within-local-contract", "partial", "rejected", "unresolved", "construction-or-checker-failed", "infrastructure-failed"],
  metrics: { documentCounts: true, operationCounts: true, admissionCounts: true, checkerPassedOperations: true, sourceAdvisoriesAndBlocking: true, constructionObligationCoverage: true, predictionComparison: true, durationAndSourceAcquisitionSeparate: true },
  stopConditions: {
    preRowZero: ["candidate-or-runner-binding-failure", "input-license-manifest-or-prediction-closure-failure", "non-clean-or-wrong-execution-commit", "output-already-exists"],
    afterDispatch: "record-terminal-or-fail-closed; never retry, replace, or fix the candidate",
    sourceShortfall: "record the deterministic shortfall without relaxing eligibility or filling from excluded sources",
  },
  evidence: { sourceBytes: true, licenseBytes: true, upstreamCommitPathAndUrl: true, sourceAndLicenseDigests: true, ordinaryInputManifest: true, discoveryAndExclusionLog: true, predictionBeforeCandidateTrial: true, stateJournalTerminalAndPrefix: true, exactOutputClosure: true },
  claimBoundary: "This preregistered development panel describes one deterministic public-source selection and one immutable 12-real-plus-6-synthetic run. It does not estimate ecosystem admission, prove arbitrary OpenAPI support or live API behavior, establish human savings, consume Q1 or held-out sources, or change readiness.",
  audit: { heldOutAccesses: 0, q1ReservedAccesses: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, readinessChanges: 0 },
});

export function apiTesterOperationProspectiveProtocolSha256(): string {
  return sha256(canonical(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL));
}

export function remainingApiTesterOperationProspectiveRunMillis(elapsedMillis: number): number {
  if (!Number.isFinite(elapsedMillis) || elapsedMillis < 0) throw new Error("prospective elapsed milliseconds must be finite and nonnegative");
  return Math.max(0, Math.floor(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.resourceLimits.totalFirstRunTimeoutMs - elapsedMillis));
}

const SyntheticDefinitionSchema = z.object({
  rowId: RowIdSchema,
  path: SafeRelativePathSchema,
  manifestPath: SafeRelativePathSchema,
  purpose: z.string().min(1),
  expectedStrictVerification: z.enum(["pass", "source-coverage-fail"]),
  prediction: z.object({
    expectedDocumentOutcome: z.enum(["fully-accepted-within-local-contract", "partial", "rejected", "unresolved"]),
    expectedAcceptedOperations: z.number().int().nonnegative(),
    basis: z.string().min(1),
    authoredWithoutCandidateExecution: z.literal(true),
  }).strict(),
}).strict();

export const API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS = z.array(SyntheticDefinitionSchema).length(6).parse([
  {
    rowId: "synthetic-accepted-inline-path",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/accepted-inline-path.json",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-accepted-inline-path.json",
    purpose: "Positive control for one inline required path parameter with explicit success and error responses.",
    expectedStrictVerification: "pass",
    prediction: { expectedDocumentOutcome: "fully-accepted-within-local-contract", expectedAcceptedOperations: 1, basis: "All used syntax is inside the frozen v2 support contract.", authoredWithoutCandidateExecution: true },
  },
  {
    rowId: "synthetic-accepted-local-ref-array",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/accepted-local-ref-array.yaml",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-accepted-local-ref-array.json",
    purpose: "Positive control for local parameter reference, primitive query array encoding, and inherited API-key security.",
    expectedStrictVerification: "pass",
    prediction: { expectedDocumentOutcome: "fully-accepted-within-local-contract", expectedAcceptedOperations: 1, basis: "The dependency-preserving v2 subset explicitly supports these forms.", authoredWithoutCandidateExecution: true },
  },
  {
    rowId: "synthetic-partial-cookie-and-accepted",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/partial-cookie-and-accepted.json",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-partial-cookie-and-accepted.json",
    purpose: "Mixed document proving that an unsupported cookie operation does not hide an independent accepted operation.",
    expectedStrictVerification: "pass",
    prediction: { expectedDocumentOutcome: "partial", expectedAcceptedOperations: 1, basis: "The health operation is in contract while cookie parameters are not.", authoredWithoutCandidateExecution: true },
  },
  {
    rowId: "synthetic-rejected-oauth2",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/rejected-oauth2.yaml",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-rejected-oauth2.json",
    purpose: "All-rejected control for OAuth2 with non-empty scopes.",
    expectedStrictVerification: "pass",
    prediction: { expectedDocumentOutcome: "rejected", expectedAcceptedOperations: 0, basis: "OAuth2 is outside the frozen v2 security subset.", authoredWithoutCandidateExecution: true },
  },
  {
    rowId: "synthetic-unresolved-path-item-ref",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/unresolved-path-item-ref.yaml",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-unresolved-path-item-ref.json",
    purpose: "Enumeration-incomplete control for a path-item reference that may hide operations.",
    expectedStrictVerification: "source-coverage-fail",
    prediction: { expectedDocumentOutcome: "unresolved", expectedAcceptedOperations: 0, basis: "The source enumerator intentionally fails closed on path-item references.", authoredWithoutCandidateExecution: true },
  },
  {
    rowId: "synthetic-unresolved-missing-parameter",
    path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/synthetic/unresolved-missing-parameter.json",
    manifestPath: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/synthetic-unresolved-missing-parameter.json",
    purpose: "Source-blocker control for a missing required local parameter dependency.",
    expectedStrictVerification: "pass",
    prediction: { expectedDocumentOutcome: "unresolved", expectedAcceptedOperations: 0, basis: "The operation dependency cannot be closed from the supplied source bytes.", authoredWithoutCandidateExecution: true },
  },
]);

export type ApiTesterOperationSourceQualificationReason =
  | "EXPOSED_REPOSITORY" | "FORK" | "ARCHIVED" | "FORMAT_PATH_MISMATCH" | "SOURCE_TOO_SMALL"
  | "SOURCE_TOO_LARGE" | "LICENSE_NOT_ALLOWED" | "LICENSE_BYTES_MISSING" | "DUPLICATE_SOURCE"
  | "DUPLICATE_LINEAGE" | "PARSE_FAILED" | "UNSUPPORTED_OPENAPI_VERSION" | "PATHS_MISSING"
  | "NO_OPERATIONS" | "TOO_MANY_OPERATIONS";

export function qualifyApiTesterOperationSourceCandidate(options: {
  repositoryFullName: string;
  repositoryFork: boolean;
  repositoryArchived: boolean;
  sourcePath: string;
  sourceFormat: "json" | "yaml";
  sourceBytes: Uint8Array;
  licenseSpdx: string;
  licenseBytes: Uint8Array;
  priorSourceDigests: string[];
  priorLineageKeys: string[];
  lineageKey: string;
}): {
  status: "eligible" | "excluded";
  reasons: ApiTesterOperationSourceQualificationReason[];
  sourceBytes: number;
  sourceSha256: string;
  openapiVersion: string | null;
  operationCount: number | null;
} {
  const exposed = new Set(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.exclusions.exposedRepositories.map((entry) => entry.toLowerCase()));
  const sourceDigest = sha256(options.sourceBytes);
  if (exposed.has(options.repositoryFullName.toLowerCase())) {
    return { status: "excluded", reasons: ["EXPOSED_REPOSITORY"], sourceBytes: options.sourceBytes.byteLength, sourceSha256: sourceDigest, openapiVersion: null, operationCount: null };
  }
  const reasons: ApiTesterOperationSourceQualificationReason[] = [];
  if (options.repositoryFork) reasons.push("FORK");
  if (options.repositoryArchived) reasons.push("ARCHIVED");
  const matchesExtension = options.sourceFormat === "json"
    ? options.sourcePath.toLowerCase().endsWith(".json")
    : /\.ya?ml$/iu.test(options.sourcePath);
  if (!matchesExtension) reasons.push("FORMAT_PATH_MISMATCH");
  if (options.sourceBytes.byteLength < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumSourceBytes) reasons.push("SOURCE_TOO_SMALL");
  if (options.sourceBytes.byteLength > API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.maximumSourceBytes) reasons.push("SOURCE_TOO_LARGE");
  if (!(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.licenseSpdxAllowlist as readonly string[]).includes(options.licenseSpdx)) reasons.push("LICENSE_NOT_ALLOWED");
  if (options.licenseBytes.byteLength === 0) reasons.push("LICENSE_BYTES_MISSING");
  if (options.priorSourceDigests.includes(sourceDigest)) reasons.push("DUPLICATE_SOURCE");
  if (options.priorLineageKeys.includes(options.lineageKey)) reasons.push("DUPLICATE_LINEAGE");

  let parsed: unknown;
  try {
    if (options.sourceFormat === "json") parsed = JSON.parse(Buffer.from(options.sourceBytes).toString("utf8"));
    else {
      const document = parseDocument(Buffer.from(options.sourceBytes).toString("utf8"), { schema: "core", uniqueKeys: true });
      if (document.errors.length > 0) throw new Error(document.errors.map((error) => error.message).join("; "));
      parsed = document.toJS({ maxAliasCount: 0 });
    }
  } catch {
    reasons.push("PARSE_FAILED");
    return { status: "excluded", reasons, sourceBytes: options.sourceBytes.byteLength, sourceSha256: sourceDigest, openapiVersion: null, operationCount: null };
  }
  const record = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const openapiVersion = typeof record.openapi === "string" ? record.openapi : null;
  if (!openapiVersion || !/^3\.(?:0|1)\./u.test(openapiVersion)) reasons.push("UNSUPPORTED_OPENAPI_VERSION");
  const paths = typeof record.paths === "object" && record.paths !== null && !Array.isArray(record.paths)
    ? record.paths as Record<string, unknown> : null;
  if (!paths) reasons.push("PATHS_MISSING");
  let operationCount: number | null = null;
  if (paths) {
    operationCount = Object.values(paths).reduce<number>((count, pathItem) => {
      if (typeof pathItem !== "object" || pathItem === null || Array.isArray(pathItem)) return count;
      const item = pathItem as Record<string, unknown>;
      return count + HTTP_METHODS.filter((method) => Object.prototype.hasOwnProperty.call(item, method)).length;
    }, 0);
    if (operationCount < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.minimumOperations) reasons.push("NO_OPERATIONS");
    if (operationCount > API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.eligibility.maximumOperations) reasons.push("TOO_MANY_OPERATIONS");
  }
  return {
    status: reasons.length === 0 ? "eligible" : "excluded",
    reasons,
    sourceBytes: options.sourceBytes.byteLength,
    sourceSha256: sourceDigest,
    openapiVersion,
    operationCount,
  };
}

const RealSelectionSchema = z.object({
  rowId: RowIdSchema,
  selectionOrder: z.number().int().min(1).max(12),
  queryId: z.enum(["github-topic-openapi-specification", "github-topic-openapi"]),
  queryRank: z.number().int().positive(),
  discoveredAt: DateTimeSchema,
  repository: z.object({
    url: z.string().url(), fullName: ExposedRepositorySchema, id: z.number().int().positive(), fork: z.literal(false), archived: z.literal(false),
    lineageKey: z.string().min(1), commit: GitCommitSchema,
  }).strict(),
  source: z.object({
    repositoryPath: SafeRelativePathSchema, rawUrl: z.string().url(), archivePath: SafeRelativePathSchema, manifestPath: SafeRelativePathSchema,
    manifestSha256: Sha256Schema, format: z.enum(["json", "yaml"]), bytes: z.number().int().min(100).max(2_097_152), sha256: Sha256Schema,
    openapiVersion: z.string().regex(/^3\.(?:0|1)\./u), operationCount: z.number().int().min(1).max(2_000),
  }).strict(),
  license: z.object({
    spdx: z.string().min(1), repositoryPath: SafeRelativePathSchema, rawUrl: z.string().url(), archivePath: SafeRelativePathSchema,
    bytes: z.number().int().positive(), sha256: Sha256Schema,
  }).strict(),
  selectionBasis: z.string().min(1),
  candidateTrialsBeforeSelection: z.literal(0),
}).strict();
export type ApiTesterOperationRealSelection = z.infer<typeof RealSelectionSchema>;

const DiscoveryRequestEvidenceSchema = z.object({
  queryId: z.enum(["github-topic-openapi-specification", "github-topic-openapi"]),
  requestedAt: DateTimeSchema,
  url: z.string().url(),
  statusCode: z.number().int().min(200).max(299),
  response: DigestRefSchema.extend({ bytes: z.number().int().positive() }).strict(),
  sourceAcquisitionMillis: z.number().int().nonnegative(),
}).strict();

const ExcludedSourceSchema = z.object({
  order: z.number().int().positive(),
  repositoryFullName: ExposedRepositorySchema,
  lineageKey: z.string().min(1).nullable(),
  repositoryCommit: GitCommitSchema.nullable(),
  repositoryPath: SafeRelativePathSchema.nullable(),
  sourceSha256: Sha256Schema.nullable(),
  reasons: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u)).min(1),
  evidence: z.string().min(1),
}).strict();

export const ApiTesterOperationSourceSelectionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-source-selection/v1"),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  selectedAt: DateTimeSchema,
  preSourceFreeze: DigestRefSchema.extend({ commit: GitCommitSchema }).strict(),
  protocolSha256: Sha256Schema,
  discovery: z.object({
    requests: z.array(DiscoveryRequestEvidenceSchema).min(1),
    candidatesInspected: z.number().int().nonnegative(),
    eligibleCandidates: z.number().int().nonnegative(),
    excludedCandidates: z.number().int().nonnegative(),
    orderingApplied: z.literal("query-index-then-api-rank-then-repository-full-name-then-document-path"),
  }).strict(),
  selected: z.array(RealSelectionSchema).max(12),
  excluded: z.array(ExcludedSourceSchema),
  shortfall: z.object({ target: z.literal(12), actual: z.number().int().min(0).max(12), missing: z.number().int().min(0).max(12), ruleRelaxed: z.literal(false) }).strict(),
  accounting: z.object({
    publicSourceSearchRequests: z.number().int().positive(), publicSourceDownloadRequests: z.number().int().nonnegative(),
    candidateTrialsBeforeSelection: z.literal(0), modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0), developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const ordered = [...report.selected].sort((left, right) => left.selectionOrder - right.selectionOrder);
  if (report.selected.some((entry, index) => entry.selectionOrder !== index + 1)
    || canonical(ordered) !== canonical(report.selected)
    || new Set(report.selected.map((entry) => entry.rowId)).size !== report.selected.length
    || new Set(report.selected.map((entry) => entry.repository.fullName.toLowerCase())).size !== report.selected.length
    || new Set(report.selected.map((entry) => entry.repository.lineageKey)).size !== report.selected.length
    || new Set(report.selected.map((entry) => entry.source.sha256)).size !== report.selected.length) {
    context.addIssue({ code: "custom", path: ["selected"], message: "selection must preserve deterministic repository, lineage, and source uniqueness in exact order" });
  }
  if (report.discovery.requests.length !== report.accounting.publicSourceSearchRequests
    || report.discovery.excludedCandidates !== report.excluded.length
    || report.discovery.candidatesInspected !== report.selected.length + report.excluded.length
    || report.discovery.eligibleCandidates < report.selected.length
    || report.discovery.eligibleCandidates > report.discovery.candidatesInspected
    || report.shortfall.actual !== report.selected.length
    || report.shortfall.missing !== 12 - report.selected.length) {
    context.addIssue({ code: "custom", path: ["accounting"], message: "selection discovery accounting drift" });
  }
});
export type ApiTesterOperationSourceSelectionReport = z.infer<typeof ApiTesterOperationSourceSelectionReportSchema>;

const RealPredictionSchema = z.object({
  rowId: RowIdSchema,
  authoredAt: DateTimeSchema,
  expectedDocumentOutcome: z.enum(["unknown", "fully-accepted-within-local-contract", "partial", "rejected", "unresolved", "construction-or-checker-failed", "infrastructure-failed"]),
  expectedAcceptedOperations: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unknown") }).strict(),
    z.object({ kind: z.literal("range"), minimum: z.number().int().nonnegative(), maximum: z.number().int().nonnegative() }).strict(),
  ]),
  basis: z.string().min(1),
  candidateTrialsBeforePrediction: z.literal(0),
}).strict().superRefine((prediction, context) => {
  if (prediction.expectedAcceptedOperations.kind === "range"
    && prediction.expectedAcceptedOperations.minimum > prediction.expectedAcceptedOperations.maximum) {
    context.addIssue({ code: "custom", path: ["expectedAcceptedOperations"], message: "prediction range is inverted" });
  }
});
export type ApiTesterOperationRealPrediction = z.infer<typeof RealPredictionSchema>;

export const ApiTesterOperationPredictionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-predictions/v1"),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  authoredAt: DateTimeSchema,
  selection: DigestRefSchema,
  predictions: z.array(RealPredictionSchema).length(12),
  accounting: z.object({ candidateTrialsBeforePrediction: z.literal(0), modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0), developmentAgentUsage: z.literal("host-external-not-measured-by-runner") }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  if (new Set(report.predictions.map((entry) => entry.rowId)).size !== 12) {
    context.addIssue({ code: "custom", path: ["predictions"], message: "prediction report requires 12 unique real rows" });
  }
});
export type ApiTesterOperationPredictionReport = z.infer<typeof ApiTesterOperationPredictionReportSchema>;

const SyntheticBoundSchema = SyntheticDefinitionSchema.extend({
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  manifestSha256: Sha256Schema,
}).strict();

const ExperimentRowSchema = z.discriminatedUnion("stratum", [
  z.object({
    rowId: RowIdSchema,
    rowIndex: z.number().int().min(0).max(17),
    stratum: z.literal("real-public-document"),
    source: z.object({ path: SafeRelativePathSchema, format: z.enum(["json", "yaml"]), bytes: z.number().int().positive(), sha256: Sha256Schema }).strict(),
    manifest: DigestRefSchema,
    license: DigestRefSchema,
    selection: RealSelectionSchema,
    prediction: RealPredictionSchema,
  }).strict(),
  z.object({
    rowId: RowIdSchema,
    rowIndex: z.number().int().min(0).max(17),
    stratum: z.literal("synthetic-boundary"),
    source: z.object({ path: SafeRelativePathSchema, format: z.enum(["json", "yaml"]), bytes: z.number().int().positive(), sha256: Sha256Schema }).strict(),
    manifest: DigestRefSchema,
    license: z.null(),
    purpose: z.string().min(1),
    prediction: SyntheticDefinitionSchema.shape.prediction,
  }).strict(),
]);
export type ApiTesterOperationProspectiveExperimentRow = z.infer<typeof ExperimentRowSchema>;

export const ApiTesterOperationProspectiveExperimentLockSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_PROSPECTIVE_LOCK_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  frozenAt: DateTimeSchema,
  selectionCommit: GitCommitSchema,
  preSourceFreeze: DigestRefSchema.extend({ commit: GitCommitSchema }).strict(),
  selectionReport: DigestRefSchema,
  predictionsReport: DigestRefSchema,
  supportContractId: z.literal(SUPPORT_CONTRACT_ID),
  denominator: z.object({ realDocuments: z.literal(12), syntheticDocuments: z.literal(6), totalDocuments: z.literal(18) }).strict(),
  executionPolicy: ExecutionPolicySchema,
  rows: z.array(ExperimentRowSchema).length(18),
  status: z.literal("not-run"),
  accounting: z.object({ prospectiveRuns: z.literal(0), modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0) }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((lock, context) => {
  const ids = lock.rows.map((row) => row.rowId);
  if (new Set(ids).size !== 18 || lock.rows.some((row, index) => row.rowIndex !== index)) {
    context.addIssue({ code: "custom", path: ["rows"], message: "lock requires 18 unique rows in exact indexed order" });
  }
  if (lock.rows.slice(0, 12).some((row) => row.stratum !== "real-public-document")
    || lock.rows.slice(12).some((row) => row.stratum !== "synthetic-boundary")) {
    context.addIssue({ code: "custom", path: ["rows"], message: "prospective denominator must remain 12 real plus 6 synthetic rows" });
  }
  const realRows = lock.rows.filter((row): row is Extract<ApiTesterOperationProspectiveExperimentRow, { stratum: "real-public-document" }> => row.stratum === "real-public-document");
  if (new Set(realRows.map((row) => row.selection.repository.fullName.toLowerCase())).size !== 12
    || new Set(realRows.map((row) => row.selection.repository.lineageKey)).size !== 12
    || realRows.some((row) => row.selection.rowId !== row.rowId || row.prediction.rowId !== row.rowId)) {
    context.addIssue({ code: "custom", path: ["rows"], message: "real rows require 12 independent repositories/lineages and matching predictions" });
  }
});
export type ApiTesterOperationProspectiveExperimentLock = z.infer<typeof ApiTesterOperationProspectiveExperimentLockSchema>;

export function buildApiTesterOperationProspectiveExperimentLock(options: {
  preSourceFreeze: { path: string; sha256: string; commit: string };
  selectionReport: { path: string; sha256: string };
  predictionsReport: { path: string; sha256: string };
  selectionCommit: string;
  frozenAt: string;
  realSelections: ApiTesterOperationRealSelection[] | unknown[];
  realPredictions: ApiTesterOperationRealPrediction[] | unknown[];
  syntheticRows: Array<z.infer<typeof SyntheticBoundSchema>> | unknown[];
}): ApiTesterOperationProspectiveExperimentLock {
  const realSelections = options.realSelections.map((entry) => RealSelectionSchema.parse(entry));
  const predictions = options.realPredictions.map((entry) => RealPredictionSchema.parse(entry));
  const synthetics = options.syntheticRows.map((entry) => SyntheticBoundSchema.parse(entry));
  if (realSelections.length !== 12 || predictions.length !== 12 || synthetics.length !== 6) {
    throw new Error("prospective experiment lock requires exactly 12 real selections, 12 real predictions, and 6 synthetics");
  }
  const predictionByRow = new Map(predictions.map((entry) => [entry.rowId, entry]));
  const realRows: ApiTesterOperationProspectiveExperimentRow[] = realSelections
    .sort((left, right) => left.selectionOrder - right.selectionOrder)
    .map((selection, rowIndex) => {
      const prediction = predictionByRow.get(selection.rowId);
      if (!prediction) throw new Error(`real prediction missing: ${selection.rowId}`);
      return ExperimentRowSchema.parse({
        rowId: selection.rowId,
        rowIndex,
        stratum: "real-public-document",
        source: { path: selection.source.archivePath, format: selection.source.format, bytes: selection.source.bytes, sha256: selection.source.sha256 },
        manifest: { path: selection.source.manifestPath, sha256: selection.source.manifestSha256 },
        license: { path: selection.license.archivePath, sha256: selection.license.sha256 },
        selection,
        prediction,
      });
    });
  const syntheticRows = synthetics.map((entry, index) => ExperimentRowSchema.parse({
    rowId: entry.rowId,
    rowIndex: index + 12,
    stratum: "synthetic-boundary",
    source: { path: entry.path, format: entry.path.toLowerCase().endsWith(".json") ? "json" : "yaml", bytes: entry.bytes, sha256: entry.sha256 },
    manifest: { path: entry.manifestPath, sha256: entry.manifestSha256 },
    license: null,
    purpose: entry.purpose,
    prediction: entry.prediction,
  }));
  return ApiTesterOperationProspectiveExperimentLockSchema.parse({
    schemaVersion: API_TESTER_OPERATION_PROSPECTIVE_LOCK_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
    frozenAt: options.frozenAt,
    selectionCommit: options.selectionCommit,
    preSourceFreeze: options.preSourceFreeze,
    selectionReport: options.selectionReport,
    predictionsReport: options.predictionsReport,
    supportContractId: SUPPORT_CONTRACT_ID,
    denominator: { realDocuments: 12, syntheticDocuments: 6, totalDocuments: 18 },
    executionPolicy: API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.executionPolicy,
    rows: [...realRows, ...syntheticRows],
    status: "not-run",
    accounting: { prospectiveRuns: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0 },
    claimBoundary: "This lock fixes one 18-document development denominator and pre-execution predictions. Synthetic rows remain separate and no row has run yet.",
  });
}

export async function buildApiTesterOperationProspectiveExperimentLockFromFiles(options: {
  rootDir: string;
  preSourceFreezePath: string;
  preSourceFreezeCommit: string;
  selectionPath: string;
  predictionsPath: string;
  selectionCommit: string;
  frozenAt: string;
}): Promise<ApiTesterOperationProspectiveExperimentLock> {
  const rootDir = resolve(options.rootDir);
  const freezeBytes = await readFile(contained(rootDir, options.preSourceFreezePath, "pre-source freeze"));
  const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  const selectionBytes = await readFile(contained(rootDir, options.selectionPath, "source selection report"));
  const selection = ApiTesterOperationSourceSelectionReportSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const predictionBytes = await readFile(contained(rootDir, options.predictionsPath, "prediction report"));
  const predictions = ApiTesterOperationPredictionReportSchema.parse(JSON.parse(predictionBytes.toString("utf8")));
  if (selection.preSourceFreeze.path !== parseSafeRelativePath(portable(options.preSourceFreezePath))
    || selection.preSourceFreeze.sha256 !== sha256(freezeBytes)
    || selection.preSourceFreeze.commit !== options.preSourceFreezeCommit
    || selection.protocolSha256 !== sha256(canonical(freeze.protocol))
    || predictions.selection.path !== parseSafeRelativePath(portable(options.selectionPath))
    || predictions.selection.sha256 !== sha256(selectionBytes)) {
    throw new Error("selection, prediction, or pre-source freeze binding mismatch");
  }
  const selectedIds = selection.selected.map((entry) => entry.rowId);
  if (canonical(selectedIds) !== canonical(predictions.predictions.map((entry) => entry.rowId))) {
    throw new Error("prediction rows do not exactly cover the selected real rows");
  }
  const syntheticRows = await Promise.all(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map(async (entry) => {
    const sourceBytes = await readFile(contained(rootDir, entry.path, "synthetic lock source"));
    const manifestBytes = await readFile(contained(rootDir, entry.manifestPath, "synthetic lock manifest"));
    return SyntheticBoundSchema.parse({ ...entry, bytes: sourceBytes.byteLength, sha256: sha256(sourceBytes), manifestSha256: sha256(manifestBytes) });
  }));
  return buildApiTesterOperationProspectiveExperimentLock({
    preSourceFreeze: { path: options.preSourceFreezePath, sha256: sha256(freezeBytes), commit: options.preSourceFreezeCommit },
    selectionReport: { path: options.selectionPath, sha256: sha256(selectionBytes) },
    predictionsReport: { path: options.predictionsPath, sha256: sha256(predictionBytes) },
    selectionCommit: options.selectionCommit,
    frozenAt: options.frozenAt,
    realSelections: selection.selected,
    realPredictions: predictions.predictions,
    syntheticRows,
  });
}

const AttemptSchema = z.object({
  attemptId: z.string().regex(/^(first-run|reproduction)-row-\d{3}$/u),
  rowId: RowIdSchema,
  rowIndex: z.number().int().min(0).max(17),
  status: z.enum(["prepared", "dispatched", "terminal-recorded"]),
  preparedAt: DateTimeSchema,
  dispatchedAt: DateTimeSchema.nullable(),
  terminalAt: DateTimeSchema.nullable(),
  terminalSha256: Sha256Schema.nullable(),
}).strict();

export const ApiTesterOperationProspectiveRunStateSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_PROSPECTIVE_RUN_STATE_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  runKind: z.enum(["first-run", "reproduction"]),
  lockSha256: Sha256Schema,
  rowOrder: z.array(RowIdSchema).length(18),
  status: z.enum(["ready", "running", "completed", "failed-closed"]),
  createdAt: DateTimeSchema,
  nextRowIndex: z.number().int().min(0).max(18),
  completedRows: z.number().int().min(0).max(18),
  dispatchCount: z.number().int().min(0).max(18),
  attempts: z.array(AttemptSchema).max(18),
}).strict().superRefine((state, context) => {
  if (new Set(state.rowOrder).size !== 18 || state.nextRowIndex !== state.completedRows) {
    context.addIssue({ code: "custom", path: ["rowOrder"], message: "run state requires one unique 18-row order and a contiguous completed prefix" });
  }
  if (state.attempts.some((attempt, index) => attempt.rowIndex !== index || attempt.rowId !== state.rowOrder[index]
    || attempt.attemptId !== `${state.runKind}-row-${String(index + 1).padStart(3, "0")}`)) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "run attempts must be a contiguous identity-bound prefix" });
  }
  const completed = state.attempts.filter((attempt) => attempt.status === "terminal-recorded").length;
  const dispatched = state.attempts.filter((attempt) => attempt.status !== "prepared").length;
  if (completed !== state.completedRows || dispatched !== state.dispatchCount) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "run state accounting drift" });
  }
  if ((state.status === "completed") !== (state.completedRows === 18)) {
    context.addIssue({ code: "custom", path: ["status"], message: "completed status must match the full 18-row terminal prefix" });
  }
});
export type ApiTesterOperationProspectiveRunState = z.infer<typeof ApiTesterOperationProspectiveRunStateSchema>;

export function createApiTesterOperationProspectiveRunState(options: {
  runKind: "first-run" | "reproduction";
  lockSha256: string;
  rowOrder: string[];
  createdAt: string;
}): ApiTesterOperationProspectiveRunState {
  return ApiTesterOperationProspectiveRunStateSchema.parse({
    schemaVersion: API_TESTER_OPERATION_PROSPECTIVE_RUN_STATE_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
    runKind: options.runKind,
    lockSha256: options.lockSha256,
    rowOrder: options.rowOrder,
    status: "ready",
    createdAt: options.createdAt,
    nextRowIndex: 0,
    completedRows: 0,
    dispatchCount: 0,
    attempts: [],
  });
}

export function prepareNextApiTesterOperationProspectiveRow(stateInput: ApiTesterOperationProspectiveRunState | unknown): ApiTesterOperationProspectiveRunState {
  const state = ApiTesterOperationProspectiveRunStateSchema.parse(stateInput);
  if (state.status === "completed" || state.status === "failed-closed") throw new Error(`cannot prepare row from ${state.status} state`);
  const current = state.attempts[state.nextRowIndex];
  if (current?.status === "prepared") return state;
  if (current?.status === "dispatched") throw new Error("current row was dispatched and requires a terminal; redispatch is forbidden");
  if (current) throw new Error("current row already has a terminal");
  const rowId = state.rowOrder[state.nextRowIndex];
  if (!rowId) throw new Error("no next row is available");
  return ApiTesterOperationProspectiveRunStateSchema.parse({
    ...state,
    status: "running",
    attempts: [...state.attempts, {
      attemptId: `${state.runKind}-row-${String(state.nextRowIndex + 1).padStart(3, "0")}`,
      rowId,
      rowIndex: state.nextRowIndex,
      status: "prepared",
      preparedAt: state.createdAt,
      dispatchedAt: null,
      terminalAt: null,
      terminalSha256: null,
    }],
  });
}

export function markApiTesterOperationProspectiveRowDispatched(
  stateInput: ApiTesterOperationProspectiveRunState | unknown,
  dispatchedAt: string,
): ApiTesterOperationProspectiveRunState {
  const state = ApiTesterOperationProspectiveRunStateSchema.parse(stateInput);
  const current = state.attempts[state.nextRowIndex];
  if (!current || current.status !== "prepared") throw new Error("current row is not prepared or was already dispatched");
  const attempts = state.attempts.map((attempt, index) => index === state.nextRowIndex
    ? { ...attempt, status: "dispatched" as const, dispatchedAt: DateTimeSchema.parse(dispatchedAt) }
    : attempt);
  return ApiTesterOperationProspectiveRunStateSchema.parse({ ...state, status: "running", dispatchCount: state.dispatchCount + 1, attempts });
}

export function recordApiTesterOperationProspectiveTerminal(
  stateInput: ApiTesterOperationProspectiveRunState | unknown,
  terminal: { rowId: string; rowIndex: number; attemptId: string; terminalSha256: string; terminalAt: string },
): ApiTesterOperationProspectiveRunState {
  const state = ApiTesterOperationProspectiveRunStateSchema.parse(stateInput);
  const current = state.attempts[state.nextRowIndex];
  if (!current || current.status !== "dispatched") throw new Error("duplicate or non-current terminal; current row is not dispatched");
  if (terminal.rowId !== current.rowId || terminal.rowIndex !== current.rowIndex || terminal.attemptId !== current.attemptId) {
    throw new Error("terminal identity does not match the current dispatched row");
  }
  const attempts = state.attempts.map((attempt, index) => index === state.nextRowIndex
    ? { ...attempt, status: "terminal-recorded" as const, terminalAt: DateTimeSchema.parse(terminal.terminalAt), terminalSha256: Sha256Schema.parse(terminal.terminalSha256) }
    : attempt);
  const completedRows = state.completedRows + 1;
  return ApiTesterOperationProspectiveRunStateSchema.parse({
    ...state,
    status: completedRows === 18 ? "completed" : "running",
    completedRows,
    nextRowIndex: completedRows,
    attempts,
  });
}

const CompletedTerminalSchema = z.object({
  status: z.literal("completed"),
  reportSha256: Sha256Schema,
  outputManifestSha256: Sha256Schema,
  portableSemanticSha256: Sha256Schema,
  documentDisposition: z.enum(["fully-accepted-within-local-contract", "partial", "rejected", "unresolved"]),
  totals: z.object({
    operations: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(), artifactCheckedPassedOperations: z.number().int().nonnegative(),
  }).strict(),
  gates: z.object({ implementationCorrectness: z.enum(["pass", "fail"]), sourceCorrectness: z.enum(["pass", "unverified", "blocked"]) }).strict(),
  obligationCoverage: z.object({ total: z.number().int().nonnegative(), covered: z.number().int().nonnegative(), uncovered: z.number().int().nonnegative(), status: z.enum(["pass", "fail", "not-applicable"]) }).strict(),
  sourceIssues: z.object({ blocking: z.number().int().nonnegative(), advisories: z.number().int().nonnegative() }).strict(),
}).strict();

const InfrastructureTerminalSchema = z.object({
  status: z.literal("infrastructure-failed"),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u),
  error: z.string().min(1).max(2_000),
}).strict();

const ObservedRowSchema = z.object({
  rowId: RowIdSchema,
  rowIndex: z.number().int().min(0).max(17),
  stratum: z.enum(["real-public-document", "synthetic-boundary"]),
  inputSha256: Sha256Schema,
  manifestSha256: Sha256Schema,
  terminal: z.discriminatedUnion("status", [CompletedTerminalSchema, InfrastructureTerminalSchema]),
  durationMillis: z.number().int().nonnegative(),
  accounting: z.object({ modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
}).strict().superRefine((row, context) => {
  if (row.terminal.status !== "completed") return;
  if (row.terminal.totals.operations !== row.terminal.totals.accepted + row.terminal.totals.rejected + row.terminal.totals.unresolved
    || row.terminal.totals.artifactCheckedPassedOperations > row.terminal.totals.accepted) {
    context.addIssue({ code: "custom", path: ["terminal", "totals"], message: "terminal operation totals drift" });
  }
  if (row.terminal.obligationCoverage.uncovered !== row.terminal.obligationCoverage.total - row.terminal.obligationCoverage.covered) {
    context.addIssue({ code: "custom", path: ["terminal", "obligationCoverage"], message: "terminal obligation totals drift" });
  }
});
export type ApiTesterOperationProspectiveObservedRow = z.infer<typeof ObservedRowSchema>;

function deriveRowTotals(rows: ApiTesterOperationProspectiveObservedRow[]) {
  const completed = rows.filter((row): row is ApiTesterOperationProspectiveObservedRow & { terminal: z.infer<typeof CompletedTerminalSchema> } => row.terminal.status === "completed");
  return {
    documents: rows.length,
    completedDocuments: completed.length,
    infrastructureFailedDocuments: rows.length - completed.length,
    operations: completed.reduce((sum, row) => sum + row.terminal.totals.operations, 0),
    acceptedOperations: completed.reduce((sum, row) => sum + row.terminal.totals.accepted, 0),
    rejectedOperations: completed.reduce((sum, row) => sum + row.terminal.totals.rejected, 0),
    unresolvedOperations: completed.reduce((sum, row) => sum + row.terminal.totals.unresolved, 0),
    artifactCheckedPassedOperations: completed.reduce((sum, row) => sum + row.terminal.totals.artifactCheckedPassedOperations, 0),
    implementationFailedDocuments: completed.filter((row) => row.terminal.gates.implementationCorrectness === "fail").length,
    sourceBlockedDocuments: completed.filter((row) => row.terminal.gates.sourceCorrectness === "blocked").length,
    sourceAdvisoryDocuments: completed.filter((row) => row.terminal.gates.sourceCorrectness === "unverified").length,
    obligations: completed.reduce((sum, row) => sum + row.terminal.obligationCoverage.total, 0),
    coveredObligations: completed.reduce((sum, row) => sum + row.terminal.obligationCoverage.covered, 0),
    uncoveredObligations: completed.reduce((sum, row) => sum + row.terminal.obligationCoverage.uncovered, 0),
  };
}

const DerivedTotalsSchema = z.object({
  documents: z.number().int().nonnegative(), completedDocuments: z.number().int().nonnegative(), infrastructureFailedDocuments: z.number().int().nonnegative(),
  operations: z.number().int().nonnegative(), acceptedOperations: z.number().int().nonnegative(), rejectedOperations: z.number().int().nonnegative(),
  unresolvedOperations: z.number().int().nonnegative(), artifactCheckedPassedOperations: z.number().int().nonnegative(),
  implementationFailedDocuments: z.number().int().nonnegative(), sourceBlockedDocuments: z.number().int().nonnegative(), sourceAdvisoryDocuments: z.number().int().nonnegative(),
  obligations: z.number().int().nonnegative(), coveredObligations: z.number().int().nonnegative(), uncoveredObligations: z.number().int().nonnegative(),
}).strict();

export const ApiTesterOperationProspectiveFirstRunReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_PROSPECTIVE_FIRST_RUN_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  runKind: z.enum(["first-run", "reproduction"]),
  status: z.literal("completed"),
  lock: DigestRefSchema.extend({ commit: GitCommitSchema }).strict(),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema,
  denominator: z.object({ planned: z.literal(18), attempted: z.literal(18), realDocuments: z.literal(12), syntheticDocuments: z.literal(6) }).strict(),
  totals: DerivedTotalsSchema,
  strata: z.object({ realPublicDocuments: DerivedTotalsSchema, syntheticBoundaries: DerivedTotalsSchema }).strict(),
  rows: z.array(ObservedRowSchema).length(18),
  executionPolicy: ExecutionPolicySchema,
  accounting: z.object({ prospectiveRuns: z.literal(1), rowDispatches: z.literal(18), modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0), retries: z.literal(0), replacements: z.literal(0), candidateFixes: z.literal(0), heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0), developmentAgentUsage: z.literal("host-external-not-measured-by-runner") }).strict(),
  evidenceBoundary: z.object({ syntheticIncludedInRealRates: z.literal(false), provesEcosystemAdmission: z.literal(false), provesLiveApiBehavior: z.literal(false), provesHumanSavings: z.literal(false), changesReadiness: z.literal(false) }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const ids = report.rows.map((row) => row.rowId);
  if (new Set(ids).size !== 18 || report.rows.some((row, index) => row.rowIndex !== index)
    || report.rows.slice(0, 12).some((row) => row.stratum !== "real-public-document")
    || report.rows.slice(12).some((row) => row.stratum !== "synthetic-boundary")) {
    context.addIssue({ code: "custom", path: ["rows"], message: "report must retain the exact 12+6 indexed denominator" });
  }
  const expected = deriveRowTotals(report.rows);
  const expectedReal = deriveRowTotals(report.rows.slice(0, 12));
  const expectedSynthetic = deriveRowTotals(report.rows.slice(12));
  if (canonical(expected) !== canonical(report.totals)
    || canonical(expectedReal) !== canonical(report.strata.realPublicDocuments)
    || canonical(expectedSynthetic) !== canonical(report.strata.syntheticBoundaries)) {
    context.addIssue({ code: "custom", path: ["totals"], message: "first-run derived totals or denominator drift" });
  }
});
export type ApiTesterOperationProspectiveFirstRunReport = z.infer<typeof ApiTesterOperationProspectiveFirstRunReportSchema>;

export function buildApiTesterOperationProspectiveFirstRunReport(options: {
  runKind: "first-run" | "reproduction";
  lock: { path: string; sha256: string; commit: string };
  startedAt: string;
  completedAt: string;
  rows: ApiTesterOperationProspectiveObservedRow[] | unknown[];
}): ApiTesterOperationProspectiveFirstRunReport {
  const rows = options.rows.map((row) => ObservedRowSchema.parse(row));
  if (rows.length !== 18) throw new Error("first-run report requires all 18 terminal rows");
  return ApiTesterOperationProspectiveFirstRunReportSchema.parse({
    schemaVersion: API_TESTER_OPERATION_PROSPECTIVE_FIRST_RUN_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
    runKind: options.runKind,
    status: "completed",
    lock: options.lock,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    denominator: { planned: 18, attempted: 18, realDocuments: 12, syntheticDocuments: 6 },
    totals: deriveRowTotals(rows),
    strata: { realPublicDocuments: deriveRowTotals(rows.slice(0, 12)), syntheticBoundaries: deriveRowTotals(rows.slice(12)) },
    rows,
    executionPolicy: API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.executionPolicy,
    accounting: { prospectiveRuns: 1, rowDispatches: 18, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, retries: 0, replacements: 0, candidateFixes: 0, heldOutAccesses: 0, q1ReservedAccesses: 0, developmentAgentUsage: "host-external-not-measured-by-runner" },
    evidenceBoundary: { syntheticIncludedInRealRates: false, provesEcosystemAdmission: false, provesLiveApiBehavior: false, provesHumanSavings: false, changesReadiness: false },
    claimBoundary: "This immutable development report describes exactly the frozen 12-real-plus-6-synthetic document run. Operation-level local success is not whole-document or live-API success, and the selected real documents do not estimate ecosystem admission.",
  });
}

const SyntheticValidationRowSchema = z.object({
  rowId: RowIdSchema,
  source: DigestRefSchema.extend({ bytes: z.number().int().positive() }).strict(),
  manifest: DigestRefSchema,
  output: z.object({ report: DigestRefSchema, inventory: DigestRefSchema, outputManifest: DigestRefSchema }).strict().nullable(),
  result: z.object({ operations: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), unresolved: z.number().int().nonnegative(), checked: z.number().int().nonnegative(), documentDisposition: z.string().min(1), portableSemanticSha256: Sha256Schema }).strict().nullable(),
  expectedOutputVerification: z.enum(["pass", "source-coverage-fail"]),
  actualOutputVerification: z.enum(["pass", "source-coverage-fail", "unexpected-fail"]),
  validationStatus: z.enum(["pass", "fail"]),
  error: z.string().nullable(),
}).strict().superRefine((row, context) => {
  if (row.validationStatus === "pass" && row.expectedOutputVerification !== row.actualOutputVerification) {
    context.addIssue({ code: "custom", message: "synthetic validation expected relation drift" });
  }
  if (row.actualOutputVerification === "unexpected-fail" ? row.error === null : (!row.output || !row.result)) {
    context.addIssue({ code: "custom", message: "synthetic validation row result shape drift" });
  }
});

export const ApiTesterOperationSyntheticValidationReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_SYNTHETIC_VALIDATION_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.enum(["completed", "completed-with-failures"]),
  completedAt: DateTimeSchema,
  totals: z.object({ syntheticDocuments: z.literal(6), attempted: z.literal(6), verified: z.number().int().min(0).max(6), infrastructureFailed: z.number().int().min(0).max(6) }).strict(),
  rows: z.array(SyntheticValidationRowSchema).length(6),
  accounting: z.object({ prospectiveRuns: z.literal(0), realDocumentsRead: z.literal(0), modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0) }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const verified = report.rows.filter((row) => row.validationStatus === "pass").length;
  const infrastructureFailed = report.rows.filter((row) => row.actualOutputVerification === "unexpected-fail").length;
  if (new Set(report.rows.map((row) => row.rowId)).size !== 6 || report.totals.verified !== verified
    || report.totals.infrastructureFailed !== infrastructureFailed
    || (report.status === "completed") !== (verified === 6 && infrastructureFailed === 0)) {
    context.addIssue({ code: "custom", path: ["totals"], message: "synthetic validation totals drift" });
  }
});
export type ApiTesterOperationSyntheticValidationReport = z.infer<typeof ApiTesterOperationSyntheticValidationReportSchema>;

function sanitizeError(error: unknown, roots: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const root of roots) message = message.replaceAll(root, "<path>").replaceAll(portable(root), "<path>");
  return message.slice(0, 2_000) || "unknown error";
}

async function ensureEmptyOutput(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(path)).length > 0) throw new Error("output root already exists and is not an empty regular directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path, { recursive: true });
  }
}

export async function runApiTesterOperationSyntheticValidation(options: {
  rootDir: string;
  outRoot: string;
  nodeExecutable: string;
  completedAt: string;
}): Promise<ApiTesterOperationSyntheticValidationReport> {
  const rootDir = resolve(options.rootDir);
  const outRoot = resolve(options.outRoot);
  await ensureEmptyOutput(outRoot);
  const rows: z.infer<typeof SyntheticValidationRowSchema>[] = [];
  const tempRoot = await mkdtemp(join(tmpdir(), "skvm-api-operation-synthetic-validation-"));
  try {
    for (const synthetic of API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS) {
      const rowRoot = join(tempRoot, synthetic.rowId);
      const sourceBytes = await readFile(contained(rootDir, synthetic.path, "synthetic source"));
      const manifestBytes = await readFile(contained(rootDir, synthetic.manifestPath, "synthetic manifest"));
      const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
      if (manifest.input.path !== synthetic.path || manifest.input.bytes !== sourceBytes.byteLength || manifest.input.sha256 !== sha256(sourceBytes)) {
        throw new Error(`synthetic manifest does not bind source bytes: ${synthetic.rowId}`);
      }
      await mkdir(dirname(contained(rowRoot, synthetic.path, "synthetic work source")), { recursive: true });
      await mkdir(dirname(contained(rowRoot, synthetic.manifestPath, "synthetic work manifest")), { recursive: true });
      await writeFile(contained(rowRoot, synthetic.path, "synthetic work source"), sourceBytes, { flag: "wx" });
      await writeFile(contained(rowRoot, synthetic.manifestPath, "synthetic work manifest"), manifestBytes, { flag: "wx" });
      try {
        const result = await runApiTesterOperationInput({ rootDir: rowRoot, manifestPath: synthetic.manifestPath, nodeExecutable: options.nodeExecutable, completedAt: options.completedAt });
        let actualOutputVerification: "pass" | "source-coverage-fail" | "unexpected-fail" = "pass";
        let checked = result.totals.artifactCheckedPassedOperations;
        let portableSemanticSha256 = result.portableSemanticSha256;
        let verificationError: string | null = null;
        try {
          const verified = await verifyApiTesterOperationInputOutput({ rootDir: rowRoot, manifestPath: synthetic.manifestPath, nodeExecutable: options.nodeExecutable });
          checked = verified.checked;
          portableSemanticSha256 = verified.portableSemanticSha256;
        } catch (error) {
          verificationError = sanitizeError(error, [rootDir, outRoot, tempRoot]);
          actualOutputVerification = /SOURCE_ENUMERATION_INCOMPLETE|operation source coverage failed/iu.test(verificationError)
            ? "source-coverage-fail" : "unexpected-fail";
        }
        const outputRoot = contained(rowRoot, manifest.output.path, "synthetic candidate output");
        const archiveRoot = join(outRoot, "rows", synthetic.rowId, "candidate-output");
        await mkdir(dirname(archiveRoot), { recursive: true });
        await cp(outputRoot, archiveRoot, { recursive: true, errorOnExist: true, force: false });
        const reportBytes = await readFile(join(outputRoot, "report.json"));
        const inventoryBytes = await readFile(join(outputRoot, "operation-inventory.json"));
        const outputManifestBytes = await readFile(join(outputRoot, "output-manifest.json"));
        rows.push(SyntheticValidationRowSchema.parse({
          rowId: synthetic.rowId,
          source: { path: synthetic.path, bytes: sourceBytes.byteLength, sha256: sha256(sourceBytes) },
          manifest: { path: synthetic.manifestPath, sha256: sha256(manifestBytes) },
          output: {
            report: { path: portable(relative(outRoot, join(archiveRoot, "report.json"))), sha256: sha256(reportBytes) },
            inventory: { path: portable(relative(outRoot, join(archiveRoot, "operation-inventory.json"))), sha256: sha256(inventoryBytes) },
            outputManifest: { path: portable(relative(outRoot, join(archiveRoot, "output-manifest.json"))), sha256: sha256(outputManifestBytes) },
          },
          result: {
            operations: result.totals.operations,
            accepted: result.totals.accepted,
            rejected: result.totals.rejected,
            unresolved: result.totals.unresolved,
            checked,
            documentDisposition: result.documentDisposition,
            portableSemanticSha256,
          },
          expectedOutputVerification: synthetic.expectedStrictVerification,
          actualOutputVerification,
          validationStatus: actualOutputVerification === synthetic.expectedStrictVerification ? "pass" : "fail",
          error: verificationError,
        }));
      } catch (error) {
        rows.push(SyntheticValidationRowSchema.parse({
          rowId: synthetic.rowId,
          source: { path: synthetic.path, bytes: sourceBytes.byteLength, sha256: sha256(sourceBytes) },
          manifest: { path: synthetic.manifestPath, sha256: sha256(manifestBytes) },
          output: null,
          result: null,
          expectedOutputVerification: synthetic.expectedStrictVerification,
          actualOutputVerification: "unexpected-fail",
          validationStatus: "fail",
          error: sanitizeError(error, [rootDir, outRoot, tempRoot]),
        }));
      }
    }
    const verified = rows.filter((row) => row.validationStatus === "pass").length;
    const infrastructureFailed = rows.filter((row) => row.actualOutputVerification === "unexpected-fail").length;
    const report = ApiTesterOperationSyntheticValidationReportSchema.parse({
      schemaVersion: API_TESTER_OPERATION_SYNTHETIC_VALIDATION_SCHEMA_VERSION,
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      status: verified === 6 && infrastructureFailed === 0 ? "completed" : "completed-with-failures",
      completedAt: options.completedAt,
      totals: { syntheticDocuments: 6, attempted: 6, verified, infrastructureFailed },
      rows,
      accounting: { prospectiveRuns: 0, realDocumentsRead: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0 },
      claimBoundary: "This report validates runner, reporting, and strict output verification only on six deterministic synthetic development documents. It contributes zero real prospective observations.",
    });
    await writeFile(join(outRoot, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function listRegularFiles(root: string, current = ""): Promise<string[]> {
  const directory = current ? join(root, current) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const next = current ? `${portable(current)}/${entry.name}` : entry.name;
    const absolute = join(root, next);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`validation closure contains a symlink: ${next}`);
    if (stat.isDirectory()) files.push(...await listRegularFiles(root, next));
    else if (stat.isFile()) files.push(portable(next));
    else throw new Error(`validation closure contains a non-regular entry: ${next}`);
  }
  return files.sort(compareText);
}

export async function verifyApiTesterOperationSyntheticValidation(options: {
  rootDir: string;
  outRoot: string;
  nodeExecutable: string;
}): Promise<{ status: "verified"; syntheticDocuments: 6; expectedSourceCoverageFailures: 1; prospectiveRuns: 0 }> {
  const rootDir = resolve(options.rootDir);
  const outRoot = resolve(options.outRoot);
  const reportBytes = await readFile(join(outRoot, "report.json"));
  const report = ApiTesterOperationSyntheticValidationReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  const definitionByRow = new Map(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map((entry) => [entry.rowId, entry]));
  const expectedFiles = new Set<string>(["report.json"]);
  const tempRoot = await mkdtemp(join(tmpdir(), "skvm-api-operation-synthetic-verify-"));
  try {
    for (const row of report.rows) {
      const definition = definitionByRow.get(row.rowId);
      if (!definition || row.source.path !== definition.path || row.manifest.path !== definition.manifestPath) {
        throw new Error(`synthetic validation row identity drift: ${row.rowId}`);
      }
      const sourceBytes = await readFile(contained(rootDir, row.source.path, "synthetic verification source"));
      const manifestBytes = await readFile(contained(rootDir, row.manifest.path, "synthetic verification manifest"));
      if (sourceBytes.byteLength !== row.source.bytes || sha256(sourceBytes) !== row.source.sha256 || sha256(manifestBytes) !== row.manifest.sha256) {
        throw new Error(`synthetic validation source or manifest digest drift: ${row.rowId}`);
      }
      if (!row.output || !row.result) throw new Error(`synthetic validation lacks archived output: ${row.rowId}`);
      for (const ref of [row.output.report, row.output.inventory, row.output.outputManifest]) {
        const bytes = await readFile(contained(outRoot, ref.path, "synthetic archived output"));
        if (sha256(bytes) !== ref.sha256) throw new Error(`synthetic archived output digest drift: ${row.rowId}:${ref.path}`);
      }
      const archivedOutputRoot = dirname(contained(outRoot, row.output.report.path, "synthetic archived report"));
      const outputManifest = ApiTesterOperationOutputManifestSchema.parse(JSON.parse(await readFile(join(archivedOutputRoot, "output-manifest.json"), "utf8")));
      const archivePrefix = portable(relative(outRoot, archivedOutputRoot));
      expectedFiles.add(`${archivePrefix}/output-manifest.json`);
      for (const ref of outputManifest.files) expectedFiles.add(`${archivePrefix}/${ref.path}`);

      const rowRoot = join(tempRoot, row.rowId);
      await mkdir(dirname(contained(rowRoot, row.source.path, "synthetic verifier work source")), { recursive: true });
      await mkdir(dirname(contained(rowRoot, row.manifest.path, "synthetic verifier work manifest")), { recursive: true });
      await writeFile(contained(rowRoot, row.source.path, "synthetic verifier work source"), sourceBytes, { flag: "wx" });
      await writeFile(contained(rowRoot, row.manifest.path, "synthetic verifier work manifest"), manifestBytes, { flag: "wx" });
      const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
      const workOutput = contained(rowRoot, manifest.output.path, "synthetic verifier work output");
      await mkdir(dirname(workOutput), { recursive: true });
      await cp(archivedOutputRoot, workOutput, { recursive: true, errorOnExist: true, force: false });
      let actualVerification: "pass" | "source-coverage-fail" | "unexpected-fail" = "pass";
      let strictResult: Awaited<ReturnType<typeof verifyApiTesterOperationInputOutput>> | null = null;
      let strictError: string | null = null;
      try {
        strictResult = await verifyApiTesterOperationInputOutput({ rootDir: rowRoot, manifestPath: row.manifest.path, nodeExecutable: options.nodeExecutable });
      } catch (error) {
        strictError = sanitizeError(error, [rootDir, outRoot, tempRoot]);
        actualVerification = /SOURCE_ENUMERATION_INCOMPLETE|operation source coverage failed/iu.test(strictError)
          ? "source-coverage-fail" : "unexpected-fail";
      }
      if (actualVerification !== definition.expectedStrictVerification
        || row.expectedOutputVerification !== definition.expectedStrictVerification
        || row.actualOutputVerification !== actualVerification
        || row.validationStatus !== "pass") {
        throw new Error(`synthetic strict output relation drift: ${row.rowId}: ${strictError ?? actualVerification}`);
      }
      const operationReport = ApiTesterOperationInputReportSchema.parse(JSON.parse(await readFile(join(workOutput, "report.json"), "utf8")));
      const expectedResult = {
        operations: operationReport.totals.operations,
        accepted: operationReport.totals.accepted,
        rejected: operationReport.totals.rejected,
        unresolved: operationReport.totals.unresolved,
        checked: strictResult?.checked ?? operationReport.totals.artifactCheckedPassedOperations,
        documentDisposition: operationReport.documentDisposition,
        portableSemanticSha256: strictResult?.portableSemanticSha256 ?? operationReport.portableSemanticSha256,
      };
      if (canonical(expectedResult) !== canonical(row.result)) throw new Error(`synthetic derived result drift: ${row.rowId}`);
    }
    const actualFiles = await listRegularFiles(outRoot);
    const expected = [...expectedFiles].sort(compareText);
    if (canonical(actualFiles) !== canonical(expected)) throw new Error("synthetic validation exact output closure drift");
    return { status: "verified", syntheticDocuments: 6, expectedSourceCoverageFailures: 1, prospectiveRuns: 0 };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const PreSourceSyntheticSchema = SyntheticDefinitionSchema.extend({
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  manifestSha256: Sha256Schema,
}).strict();

export const ApiTesterOperationProspectivePreSourceFreezeSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_PROSPECTIVE_PRE_SOURCE_FREEZE_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  status: z.literal("frozen-pending-push"),
  frozenAt: DateTimeSchema,
  branch: z.literal(BRANCH),
  remoteBranch: z.literal(REMOTE_BRANCH),
  executionCommit: GitCommitSchema,
  supportContractId: z.literal(SUPPORT_CONTRACT_ID),
  candidate: DigestRefSchema.extend({ identity: z.literal(API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY), executionCommit: GitCommitSchema }).strict(),
  protocol: ApiTesterOperationProspectiveProtocolSchema,
  implementation: z.array(DigestRefSchema).length(IMPLEMENTATION_PATHS.length),
  synthetics: z.array(PreSourceSyntheticSchema).length(6),
  syntheticValidation: DigestRefSchema,
  runtime: z.object({ bun: z.string().regex(/^\d+\.\d+\.\d+$/u), node: z.string().regex(/^v\d+\.\d+\.\d+$/u) }).strict(),
  sourceState: z.object({ realSourcesSearched: z.literal(0), realSourcesRead: z.literal(0), selectedRealDocuments: z.literal(0), realPredictionsAuthored: z.literal(0), prospectiveRuns: z.literal(0) }).strict(),
  accounting: z.object({ modelCalls: z.literal(0), businessApiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0), q1ReservedAccesses: z.literal(0), developmentAgentUsage: z.literal("host-external-not-measured-by-runner") }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((freeze, context) => {
  if (canonical(freeze.protocol) !== canonical(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL)) {
    context.addIssue({ code: "custom", path: ["protocol"], message: "pre-source protocol drift" });
  }
  if (JSON.stringify(freeze.implementation.map((entry) => entry.path)) !== JSON.stringify(IMPLEMENTATION_PATHS)) {
    context.addIssue({ code: "custom", path: ["implementation"], message: "pre-source implementation order drift" });
  }
  if (JSON.stringify(freeze.synthetics.map((entry) => entry.rowId)) !== JSON.stringify(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map((entry) => entry.rowId))) {
    context.addIssue({ code: "custom", path: ["synthetics"], message: "pre-source synthetic registry drift" });
  }
});
export type ApiTesterOperationProspectivePreSourceFreeze = z.infer<typeof ApiTesterOperationProspectivePreSourceFreezeSchema>;

export async function buildApiTesterOperationProspectivePreSourceFreeze(options: {
  rootDir: string;
  executionCommit: string;
  frozenAt: string;
  bunVersion: string;
  nodeVersion: string;
  syntheticValidation: { path: string; sha256: string };
}): Promise<ApiTesterOperationProspectivePreSourceFreeze> {
  const rootDir = resolve(options.rootDir);
  const candidateBytes = await readFile(contained(rootDir, API_TESTER_OPERATION_CANDIDATE_BINDING_PATH, "candidate binding"));
  const candidate = ApiTesterOperationCandidateBindingSchema.parse(JSON.parse(candidateBytes.toString("utf8")));
  const synthetics = await Promise.all(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map(async (entry) => {
    const source = await digestRef(rootDir, entry.path, "synthetic source");
    const manifest = await digestRef(rootDir, entry.manifestPath, "synthetic manifest");
    const sourceBytes = await readFile(contained(rootDir, entry.path, "synthetic source"));
    const parsedManifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(await readFile(contained(rootDir, entry.manifestPath, "synthetic manifest"), "utf8")));
    if (parsedManifest.input.path !== entry.path || parsedManifest.input.bytes !== sourceBytes.byteLength || parsedManifest.input.sha256 !== source.sha256) {
      throw new Error(`synthetic manifest binding drift: ${entry.rowId}`);
    }
    return PreSourceSyntheticSchema.parse({ ...entry, bytes: sourceBytes.byteLength, sha256: source.sha256, manifestSha256: manifest.sha256 });
  }));
  return ApiTesterOperationProspectivePreSourceFreezeSchema.parse({
    schemaVersion: API_TESTER_OPERATION_PROSPECTIVE_PRE_SOURCE_FREEZE_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
    status: "frozen-pending-push",
    frozenAt: options.frozenAt,
    branch: BRANCH,
    remoteBranch: REMOTE_BRANCH,
    executionCommit: options.executionCommit,
    supportContractId: SUPPORT_CONTRACT_ID,
    candidate: { path: API_TESTER_OPERATION_CANDIDATE_BINDING_PATH, sha256: sha256(candidateBytes), identity: candidate.identity, executionCommit: candidate.executionCommit },
    protocol: API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL,
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((path) => digestRef(rootDir, path, "prospective implementation"))),
    synthetics,
    syntheticValidation: DigestRefSchema.parse(options.syntheticValidation),
    runtime: { bun: options.bunVersion, node: options.nodeVersion },
    sourceState: { realSourcesSearched: 0, realSourcesRead: 0, selectedRealDocuments: 0, realPredictionsAuthored: 0, prospectiveRuns: 0 },
    accounting: { modelCalls: 0, businessApiCalls: 0, paidCalls: 0, heldOutAccesses: 0, q1ReservedAccesses: 0, developmentAgentUsage: "host-external-not-measured-by-runner" },
    claimBoundary: "This pre-source freeze binds the selection protocol, candidate, runner, six synthetic inputs, validation evidence, and runtime before any unseen real source is searched or read. It contains no real input, prediction, or prospective result.",
  });
}

export async function verifyApiTesterOperationProspectivePreSourceFreezeLocal(options: {
  rootDir: string;
  freeze: ApiTesterOperationProspectivePreSourceFreeze | unknown;
  bunVersion: string;
  nodeVersion: string;
}): Promise<{ status: "verified"; syntheticDocuments: 6; prospectiveRuns: 0 }> {
  const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(options.freeze);
  if (freeze.runtime.bun !== options.bunVersion || freeze.runtime.node !== options.nodeVersion) throw new Error("pre-source runtime drift");
  const validation = await digestRef(options.rootDir, freeze.syntheticValidation.path, "synthetic validation report");
  if (validation.sha256 !== freeze.syntheticValidation.sha256) throw new Error("synthetic validation report digest drift");
  const expected = await buildApiTesterOperationProspectivePreSourceFreeze({
    rootDir: options.rootDir,
    executionCommit: freeze.executionCommit,
    frozenAt: freeze.frozenAt,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
    syntheticValidation: freeze.syntheticValidation,
  });
  if (canonical(expected) !== canonical(freeze)) throw new Error("pre-source implementation, candidate, protocol, or synthetic digest drift");
  const candidateBytes = await readFile(contained(options.rootDir, freeze.candidate.path, "candidate binding"));
  const candidate = ApiTesterOperationCandidateBindingSchema.parse(JSON.parse(candidateBytes.toString("utf8")));
  await verifyApiTesterOperationCandidateBindingAgainstLiveTree({ rootDir: options.rootDir, binding: candidate, bunVersion: options.bunVersion, nodeVersion: options.nodeVersion });
  return { status: "verified", syntheticDocuments: 6, prospectiveRuns: 0 };
}

export async function verifyApiTesterOperationProspectivePreSourceFreezeGitArchive(options: {
  rootDir: string;
  freeze: ApiTesterOperationProspectivePreSourceFreeze | unknown;
  nodeExecutable: string;
  gitExecutable: string;
}): Promise<{ status: "git-archive-verified"; executionCommit: string; validationFiles: number; prospectiveRuns: 0 }> {
  const rootDir = resolve(options.rootDir);
  const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(options.freeze);
  const identity = gitResult(rootDir, options.gitExecutable, ["rev-parse", "--verify", `${freeze.executionCommit}^{commit}`]);
  if (identity.status !== 0 || identity.stdout.trim() !== freeze.executionCommit) {
    throw new Error("pre-source execution commit identity is unavailable");
  }
  const refs = [
    freeze.candidate,
    ...freeze.implementation,
    ...freeze.synthetics.flatMap((entry) => [
      { path: entry.path, sha256: entry.sha256 },
      { path: entry.manifestPath, sha256: entry.manifestSha256 },
    ]),
    freeze.syntheticValidation,
  ];
  for (const ref of refs) verifyGitRef(rootDir, options.gitExecutable, freeze.executionCommit, ref);

  const validationRoot = dirname(contained(rootDir, freeze.syntheticValidation.path, "synthetic validation report"));
  const validationRootPath = parseSafeRelativePath(portable(relative(rootDir, validationRoot)));
  const validationFiles = await listRegularFiles(validationRoot);
  const expectedRepositoryPaths = validationFiles.map((path) => `${validationRootPath}/${path}`);
  const tree = gitResult(rootDir, options.gitExecutable, [
    "ls-tree", "-r", "--name-only", freeze.executionCommit, "--", validationRootPath,
  ]);
  if (tree.status !== 0) throw new Error(`cannot enumerate Git validation closure: ${tree.stderr.trim() || "unknown"}`);
  const committedRepositoryPaths = tree.stdout.split(/\r?\n/u).filter(Boolean).map(portable).sort(compareText);
  if (canonical(committedRepositoryPaths) !== canonical(expectedRepositoryPaths)) {
    const missing = expectedRepositoryPaths.filter((path) => !committedRepositoryPaths.includes(path));
    const extra = committedRepositoryPaths.filter((path) => !expectedRepositoryPaths.includes(path));
    throw new Error(`Git validation closure path set mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`);
  }
  for (const path of validationFiles) {
    const repositoryPath = `${validationRootPath}/${path}`;
    const workingDigest = sha256(await readFile(join(validationRoot, path)));
    verifyGitRef(rootDir, options.gitExecutable, freeze.executionCommit, { path: repositoryPath, sha256: workingDigest });
  }
  const strict = await verifyApiTesterOperationSyntheticValidation({ rootDir, outRoot: validationRoot, nodeExecutable: options.nodeExecutable });
  if (strict.syntheticDocuments !== 6 || strict.prospectiveRuns !== 0) throw new Error("synthetic validation strict result drift");
  return { status: "git-archive-verified", executionCommit: freeze.executionCommit, validationFiles: validationFiles.length, prospectiveRuns: 0 };
}

export async function verifyApiTesterOperationProspectivePreSourceFreezeGit(options: {
  rootDir: string;
  freezePath: string;
  freezeCommit: string;
  bunVersion: string;
  nodeVersion: string;
  nodeExecutable: string;
  gitExecutable: string;
}): Promise<{ status: "remote-frozen"; freezeCommit: string; executionCommit: string; syntheticDocuments: 6; prospectiveRuns: 0 }> {
  const rootDir = resolve(options.rootDir);
  const freezePath = parseSafeRelativePath(portable(options.freezePath));
  const freezeBytes = await readFile(contained(rootDir, freezePath, "pre-source freeze"));
  const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  await verifyApiTesterOperationProspectivePreSourceFreezeLocal({ rootDir, freeze, bunVersion: options.bunVersion, nodeVersion: options.nodeVersion });
  assertCommitOnRemote(rootDir, options.gitExecutable, options.freezeCommit);
  if (sha256(gitBytes(rootDir, options.gitExecutable, options.freezeCommit, freezePath)) !== sha256(freezeBytes)) {
    throw new Error("pre-source freeze working bytes differ from the remote-frozen commit");
  }
  const ancestry = gitResult(rootDir, options.gitExecutable, ["merge-base", "--is-ancestor", freeze.executionCommit, options.freezeCommit]);
  if (ancestry.status !== 0) throw new Error("pre-source execution commit is not an ancestor of the freeze commit");
  await verifyApiTesterOperationProspectivePreSourceFreezeGitArchive({
    rootDir,
    freeze,
    nodeExecutable: options.nodeExecutable,
    gitExecutable: options.gitExecutable,
  });
  const validationRoot = dirname(contained(rootDir, freeze.syntheticValidation.path, "synthetic validation report"));
  const validationReport = ApiTesterOperationSyntheticValidationReportSchema.parse(JSON.parse(await readFile(join(validationRoot, "report.json"), "utf8")));
  if (validationReport.accounting.prospectiveRuns !== 0) throw new Error("synthetic validation was miscounted as prospective");
  return { status: "remote-frozen", freezeCommit: options.freezeCommit, executionCommit: freeze.executionCommit, syntheticDocuments: 6, prospectiveRuns: 0 };
}

export async function verifyApiTesterOperationProspectiveExperimentLockFiles(options: {
  rootDir: string;
  lock: ApiTesterOperationProspectiveExperimentLock | unknown;
}): Promise<{ status: "verified"; rows: 18; realDocuments: 12; syntheticDocuments: 6; licenseFiles: 12 }> {
  const rootDir = resolve(options.rootDir);
  const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(options.lock);
  for (const ref of [lock.preSourceFreeze, lock.selectionReport, lock.predictionsReport]) {
    const actual = await digestRef(rootDir, ref.path, "experiment lock reference");
    if (actual.sha256 !== ref.sha256) throw new Error(`experiment lock reference digest drift: ${ref.path}`);
  }
  let licenseFiles = 0;
  for (const row of lock.rows) {
    const sourceBytes = await readFile(contained(rootDir, row.source.path, "locked source"));
    const manifestBytes = await readFile(contained(rootDir, row.manifest.path, "locked manifest"));
    if (sourceBytes.byteLength !== row.source.bytes || sha256(sourceBytes) !== row.source.sha256 || sha256(manifestBytes) !== row.manifest.sha256) {
      throw new Error(`locked source or manifest digest drift: ${row.rowId}`);
    }
    const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (manifest.input.path !== row.source.path || manifest.input.format !== row.source.format
      || manifest.input.bytes !== row.source.bytes || manifest.input.sha256 !== row.source.sha256
      || manifest.output.path !== "candidate-output") {
      throw new Error(`ordinary input manifest binding drift: ${row.rowId}`);
    }
    if (row.stratum === "real-public-document") {
      const licenseBytes = await readFile(contained(rootDir, row.license.path, "locked license"));
      if (sha256(licenseBytes) !== row.license.sha256) throw new Error(`locked license digest drift: ${row.rowId}`);
      licenseFiles += 1;
    }
  }
  if (licenseFiles !== 12) throw new Error("prospective lock license denominator drift");
  return { status: "verified", rows: 18, realDocuments: 12, syntheticDocuments: 6, licenseFiles: 12 };
}

export async function verifyApiTesterOperationProspectiveExperimentLockGit(options: {
  rootDir: string;
  lockPath: string;
  executionCommit: string;
  freezePath: string;
  freezeCommit: string;
  bunVersion: string;
  nodeVersion: string;
  nodeExecutable: string;
  gitExecutable: string;
}): Promise<{ status: "remote-frozen"; executionCommit: string; rows: 18; prospectiveRuns: 0 }> {
  const rootDir = resolve(options.rootDir);
  const lockPath = parseSafeRelativePath(portable(options.lockPath));
  const lockBytes = await readFile(contained(rootDir, lockPath, "prospective lock"));
  const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  if (lock.preSourceFreeze.path !== parseSafeRelativePath(portable(options.freezePath)) || lock.preSourceFreeze.commit !== options.freezeCommit) {
    throw new Error("experiment lock pre-source freeze identity drift");
  }
  await verifyApiTesterOperationProspectivePreSourceFreezeGit({
    rootDir,
    freezePath: options.freezePath,
    freezeCommit: options.freezeCommit,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
    nodeExecutable: options.nodeExecutable,
    gitExecutable: options.gitExecutable,
  });
  await verifyApiTesterOperationProspectiveExperimentLockFiles({ rootDir, lock });
  assertCommitOnRemote(rootDir, options.gitExecutable, options.executionCommit);
  if (sha256(gitBytes(rootDir, options.gitExecutable, options.executionCommit, lockPath)) !== sha256(lockBytes)) {
    throw new Error("prospective lock differs from the remote-frozen execution commit");
  }
  const selectionAncestry = gitResult(rootDir, options.gitExecutable, ["merge-base", "--is-ancestor", lock.selectionCommit, options.executionCommit]);
  if (selectionAncestry.status !== 0) throw new Error("selection commit is not an ancestor of the execution commit");
  const refs = [
    lock.selectionReport,
    lock.predictionsReport,
    ...lock.rows.flatMap((row) => [
      { path: row.source.path, sha256: row.source.sha256 },
      row.manifest,
      ...(row.stratum === "real-public-document" ? [row.license] : []),
    ]),
  ];
  for (const ref of refs) verifyGitRef(rootDir, options.gitExecutable, lock.selectionCommit, ref);
  return { status: "remote-frozen", executionCommit: options.executionCommit, rows: 18, prospectiveRuns: lock.accounting.prospectiveRuns };
}

export function operationReportToObservedTerminal(reportInput: unknown, reportSha256: string, outputManifestSha256: string) {
  const report = ApiTesterOperationInputReportSchema.parse(reportInput);
  return CompletedTerminalSchema.parse({
    status: "completed",
    reportSha256,
    outputManifestSha256,
    portableSemanticSha256: report.portableSemanticSha256,
    documentDisposition: report.documentDisposition,
    totals: report.totals,
    gates: { implementationCorrectness: report.gates.implementationCorrectness, sourceCorrectness: report.gates.sourceCorrectness },
    obligationCoverage: report.obligationCoverage,
    sourceIssues: { blocking: report.sourceIssues.blocking, advisories: report.sourceIssues.advisories },
  });
}

const PrefixSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-prefix/v1"),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  runKind: z.enum(["first-run", "reproduction"]),
  lockSha256: Sha256Schema,
  rows: z.array(ObservedRowSchema).max(18),
}).strict().superRefine((prefix, context) => {
  if (prefix.rows.some((row, index) => row.rowIndex !== index) || new Set(prefix.rows.map((row) => row.rowId)).size !== prefix.rows.length) {
    context.addIssue({ code: "custom", path: ["rows"], message: "observed rows must form a unique contiguous prefix" });
  }
});

const ProspectiveInvocationSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-invocation/v1"),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  runKind: z.enum(["first-run", "reproduction"]),
  rowId: RowIdSchema,
  attemptId: z.string().regex(/^(first-run|reproduction)-row-\d{3}$/u),
  runtime: z.literal("current-bun-process"),
  entry: z.literal("src/skill-ir/api-tester-operation-input-run.ts"),
  arguments: z.object({
    root: z.literal("<isolated-row-root>"),
    manifest: SafeRelativePathSchema,
    node: z.string().min(1),
  }).strict(),
  timeoutMillis: z.number().int().min(0).max(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.resourceLimits.perDocumentRunTimeoutMs),
}).strict();

const ProspectiveExitSchema = z.object({
  status: z.number().int().nullable(),
  signal: z.string().nullable(),
  timedOut: z.boolean(),
  error: z.string().nullable(),
}).strict();

const PROSPECTIVE_JOURNAL_FILES = [
  "dispatched.json",
  "exit.json",
  "invocation.json",
  "prepared.json",
  "stderr.log",
  "stdout.log",
  "terminal.json",
] as const;

const ProspectiveOutputManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-prospective-output-manifest/v1"),
  identity: z.literal(API_TESTER_OPERATION_PROSPECTIVE_IDENTITY),
  runKind: z.enum(["first-run", "reproduction"]),
  lockSha256: Sha256Schema,
  files: z.array(DigestRefSchema).min(4),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].sort(compareText)) || paths.includes("output-manifest.json")) {
    context.addIssue({ code: "custom", path: ["files"], message: "prospective output manifest paths must be sorted, unique, and exclude itself" });
  }
});

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, jsonText(value), { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function nowIso(): string {
  return new Date().toISOString();
}

class ProspectiveRowExecutionError extends Error {
  readonly errorCode: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.name = "ProspectiveRowExecutionError";
    this.errorCode = errorCode;
  }
}

async function copyRowInputs(rootDir: string, rowRoot: string, row: ApiTesterOperationProspectiveExperimentRow): Promise<void> {
  for (const ref of [{ path: row.source.path }, row.manifest]) {
    const source = contained(rootDir, ref.path, "prospective row input");
    const destination = contained(rowRoot, ref.path, "prospective row work input");
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: false, errorOnExist: true, force: false });
  }
}

export async function runApiTesterOperationProspectiveRows(options: {
  rootDir: string;
  lock: ApiTesterOperationProspectiveExperimentLock | unknown;
  lockRef: { path: string; sha256: string; commit: string };
  outRoot: string;
  nodeExecutable: string;
  runKind: "first-run" | "reproduction";
  startedAt: string;
}): Promise<ApiTesterOperationProspectiveFirstRunReport> {
  const rootDir = resolve(options.rootDir);
  const outRoot = resolve(options.outRoot);
  const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(options.lock);
  const lockRef = DigestRefSchema.extend({ commit: GitCommitSchema }).strict().parse(options.lockRef);
  const lockBytes = await readFile(contained(rootDir, lockRef.path, "prospective lock reference"));
  if (sha256(lockBytes) !== lockRef.sha256
    || canonical(ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(lockBytes.toString("utf8")))) !== canonical(lock)) {
    throw new Error("prospective lock digest or semantic binding drift");
  }
  await verifyApiTesterOperationProspectiveExperimentLockFiles({ rootDir, lock });
  try {
    await lstat(outRoot);
    throw new Error("prospective output already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(outRoot, { recursive: true });
  const lockSha256 = lockRef.sha256;
  let state = createApiTesterOperationProspectiveRunState({ runKind: options.runKind, lockSha256, rowOrder: lock.rows.map((row) => row.rowId), createdAt: options.startedAt });
  let prefix = PrefixSchema.parse({ schemaVersion: "skill-ir-api-tester-operation-prospective-prefix/v1", identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY, runKind: options.runKind, lockSha256, rows: [] });
  await writeFile(join(outRoot, "state.json"), jsonText(state), { encoding: "utf8", flag: "wx" });
  await writeFile(join(outRoot, "prefix.json"), jsonText(prefix), { encoding: "utf8", flag: "wx" });
  const tempRoot = await mkdtemp(join(tmpdir(), `skvm-api-operation-${options.runKind}-`));
  const totalRunStarted = performance.now();
  try {
    for (const row of lock.rows) {
      const remainingBeforeDispatch = remainingApiTesterOperationProspectiveRunMillis(performance.now() - totalRunStarted);
      if (remainingBeforeDispatch === 0) {
        state = ApiTesterOperationProspectiveRunStateSchema.parse({ ...state, status: "failed-closed" });
        await writeAtomicJson(join(outRoot, "state.json"), state);
        throw new Error("prospective aggregate runtime budget exhausted before the next row dispatch; remaining rows are unexecuted and redispatch is forbidden");
      }
      state = prepareNextApiTesterOperationProspectiveRow(state);
      const attempt = state.attempts[row.rowIndex]!;
      const journalRoot = join(outRoot, "journal", attempt.attemptId);
      await mkdir(journalRoot, { recursive: true });
      await writeFile(join(journalRoot, "prepared.json"), jsonText(attempt), { encoding: "utf8", flag: "wx" });
      state = markApiTesterOperationProspectiveRowDispatched(state, nowIso());
      await writeAtomicJson(join(outRoot, "state.json"), state);
      await writeFile(join(journalRoot, "dispatched.json"), jsonText(state.attempts[row.rowIndex]), { encoding: "utf8", flag: "wx" });

      const rowStarted = performance.now();
      let terminal: z.infer<typeof CompletedTerminalSchema> | z.infer<typeof InfrastructureTerminalSchema>;
      const rowRoot = join(tempRoot, row.rowId);
      try {
        await copyRowInputs(rootDir, rowRoot, row);
        const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(await readFile(contained(rowRoot, row.manifest.path, "prospective row manifest"), "utf8")));
        const candidateEntryPath = resolve(import.meta.dir, "../../skill-ir/api-tester-operation-input-run.ts");
        const processTimeoutMillis = Math.min(
          API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.resourceLimits.perDocumentRunTimeoutMs,
          remainingApiTesterOperationProspectiveRunMillis(performance.now() - totalRunStarted),
        );
        const invocation = {
          schemaVersion: "skill-ir-api-tester-operation-prospective-invocation/v1",
          identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
          runKind: options.runKind,
          rowId: row.rowId,
          attemptId: attempt.attemptId,
          runtime: "current-bun-process",
          entry: "src/skill-ir/api-tester-operation-input-run.ts",
          arguments: { root: "<isolated-row-root>", manifest: row.manifest.path, node: options.nodeExecutable },
          timeoutMillis: processTimeoutMillis,
        };
        await writeFile(join(journalRoot, "invocation.json"), jsonText(invocation), { encoding: "utf8", flag: "wx" });
        if (processTimeoutMillis === 0) {
          const error = "aggregate runtime budget was exhausted after dispatch and before candidate process start";
          await writeFile(join(journalRoot, "stdout.log"), "", { encoding: "utf8", flag: "wx" });
          await writeFile(join(journalRoot, "stderr.log"), "", { encoding: "utf8", flag: "wx" });
          await writeFile(join(journalRoot, "exit.json"), jsonText({ status: null, signal: null, timedOut: true, error }), { encoding: "utf8", flag: "wx" });
          throw new ProspectiveRowExecutionError("TOTAL_RUN_TIMEOUT", error);
        }
        const child = spawnSync(process.execPath, [
          candidateEntryPath,
          `--root=${rowRoot}`,
          `--manifest=${row.manifest.path}`,
          `--node=${options.nodeExecutable}`,
        ], {
          cwd: rootDir,
          encoding: "utf8",
          timeout: processTimeoutMillis,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
        });
        const timedOut = child.error instanceof Error && (child.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
        await writeFile(join(journalRoot, "stdout.log"), child.stdout ?? "", { encoding: "utf8", flag: "wx" });
        await writeFile(join(journalRoot, "stderr.log"), child.stderr ?? "", { encoding: "utf8", flag: "wx" });
        await writeFile(join(journalRoot, "exit.json"), jsonText({
          status: child.status,
          signal: child.signal,
          timedOut,
          error: child.error ? sanitizeError(child.error, [rootDir, outRoot, tempRoot]) : null,
        }), { encoding: "utf8", flag: "wx" });
        if (timedOut) {
          const timeoutCode = processTimeoutMillis < API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.resourceLimits.perDocumentRunTimeoutMs
            ? "TOTAL_RUN_TIMEOUT" : "ROW_TIMEOUT";
          throw new ProspectiveRowExecutionError(timeoutCode, `candidate process exceeded the preregistered ${timeoutCode === "ROW_TIMEOUT" ? "per-document" : "aggregate"} timeout`);
        }
        if (child.error) throw new ProspectiveRowExecutionError("CANDIDATE_PROCESS_FAILED", sanitizeError(child.error, [rootDir, outRoot, tempRoot]));
        if (child.status !== 0) throw new ProspectiveRowExecutionError("CANDIDATE_EXIT_NONZERO", `candidate process exited ${child.status}: ${(child.stderr ?? "").trim().slice(0, 1_000) || "no stderr"}`);
        const candidateOutput = contained(rowRoot, manifest.output.path, "prospective candidate output");
        const candidateReport = ApiTesterOperationInputReportSchema.parse(JSON.parse(await readFile(join(candidateOutput, "report.json"), "utf8")));
        const archivedOutput = join(outRoot, "rows", row.rowId, "candidate-output");
        await mkdir(dirname(archivedOutput), { recursive: true });
        await cp(candidateOutput, archivedOutput, { recursive: true, errorOnExist: true, force: false });
        const reportBytes = await readFile(join(candidateOutput, "report.json"));
        const outputManifestBytes = await readFile(join(candidateOutput, "output-manifest.json"));
        try {
          await verifyApiTesterOperationInputOutput({ rootDir: rowRoot, manifestPath: row.manifest.path, nodeExecutable: options.nodeExecutable });
        } catch (error) {
          if (candidateReport.gates.implementationCorrectness !== "fail") throw error;
        }
        terminal = operationReportToObservedTerminal(candidateReport, sha256(reportBytes), sha256(outputManifestBytes));
      } catch (error) {
        terminal = InfrastructureTerminalSchema.parse({
          status: "infrastructure-failed",
          errorCode: error instanceof ProspectiveRowExecutionError ? error.errorCode : "ROW_EXECUTION_FAILED",
          error: sanitizeError(error, [rootDir, outRoot, tempRoot]),
        });
      }
      const observed = ObservedRowSchema.parse({
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        stratum: row.stratum,
        inputSha256: row.source.sha256,
        manifestSha256: row.manifest.sha256,
        terminal,
        durationMillis: Math.max(0, Math.round(performance.now() - rowStarted)),
        accounting: { modelCalls: 0, businessApiCalls: 0, paidCalls: 0 },
      });
      const terminalPath = join(journalRoot, "terminal.json");
      const terminalBytes = Buffer.from(jsonText(observed), "utf8");
      await writeFile(terminalPath, terminalBytes, { flag: "wx" });
      state = recordApiTesterOperationProspectiveTerminal(state, {
        rowId: row.rowId,
        rowIndex: row.rowIndex,
        attemptId: attempt.attemptId,
        terminalSha256: sha256(terminalBytes),
        terminalAt: nowIso(),
      });
      prefix = PrefixSchema.parse({ ...prefix, rows: [...prefix.rows, observed] });
      await writeAtomicJson(join(outRoot, "state.json"), state);
      await writeAtomicJson(join(outRoot, "prefix.json"), prefix);
    }
    const report = buildApiTesterOperationProspectiveFirstRunReport({
      runKind: options.runKind,
      lock: lockRef,
      startedAt: options.startedAt,
      completedAt: nowIso(),
      rows: prefix.rows,
    });
    await writeFile(join(outRoot, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
    const files = await listRegularFiles(outRoot);
    const refs = await Promise.all(files.map(async (path) => ({ path, sha256: sha256(await readFile(join(outRoot, path))) })));
    const manifest = ProspectiveOutputManifestSchema.parse({
      schemaVersion: "skill-ir-api-tester-operation-prospective-output-manifest/v1",
      identity: API_TESTER_OPERATION_PROSPECTIVE_IDENTITY,
      runKind: options.runKind,
      lockSha256,
      files: refs,
    });
    await writeFile(join(outRoot, "output-manifest.json"), jsonText(manifest), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function verifyApiTesterOperationProspectiveRunOutput(options: {
  rootDir: string;
  lock: ApiTesterOperationProspectiveExperimentLock | unknown;
  outRoot: string;
  nodeExecutable: string;
  expectedRunKind: "first-run" | "reproduction";
}): Promise<{ status: "verified"; rows: 18; realDocuments: 12; syntheticDocuments: 6; infrastructureFailedDocuments: number; prospectiveRuns: 1 }> {
  const rootDir = resolve(options.rootDir);
  const outRoot = resolve(options.outRoot);
  const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(options.lock);
  await verifyApiTesterOperationProspectiveExperimentLockFiles({ rootDir, lock });
  const report = ApiTesterOperationProspectiveFirstRunReportSchema.parse(JSON.parse(await readFile(join(outRoot, "report.json"), "utf8")));
  const lockBytes = await readFile(contained(rootDir, report.lock.path, "prospective report lock"));
  if (sha256(lockBytes) !== report.lock.sha256
    || canonical(ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(lockBytes.toString("utf8")))) !== canonical(lock)) {
    throw new Error("prospective report lock digest or semantic binding drift");
  }
  const state = ApiTesterOperationProspectiveRunStateSchema.parse(JSON.parse(await readFile(join(outRoot, "state.json"), "utf8")));
  const prefix = PrefixSchema.parse(JSON.parse(await readFile(join(outRoot, "prefix.json"), "utf8")));
  const manifest = ProspectiveOutputManifestSchema.parse(JSON.parse(await readFile(join(outRoot, "output-manifest.json"), "utf8")));
  if (report.runKind !== options.expectedRunKind || state.runKind !== options.expectedRunKind || prefix.runKind !== options.expectedRunKind || manifest.runKind !== options.expectedRunKind
    || state.lockSha256 !== report.lock.sha256 || prefix.lockSha256 !== report.lock.sha256 || manifest.lockSha256 !== report.lock.sha256
    || state.status !== "completed" || state.dispatchCount !== 18 || state.completedRows !== 18
    || canonical(prefix.rows) !== canonical(report.rows)
    || canonical(report.rows.map((row) => row.rowId)) !== canonical(lock.rows.map((row) => row.rowId))) {
    throw new Error("prospective state, prefix, report, or frozen row order drift");
  }
  const actualFiles = await listRegularFiles(outRoot);
  const expectedFiles = [...manifest.files.map((entry) => entry.path), "output-manifest.json"].sort(compareText);
  if (canonical(actualFiles) !== canonical(expectedFiles)) throw new Error("prospective exact output closure drift");
  for (const ref of manifest.files) {
    if (sha256(await readFile(contained(outRoot, ref.path, "prospective output file"))) !== ref.sha256) throw new Error(`prospective output digest drift: ${ref.path}`);
  }
  const tempRoot = await mkdtemp(join(tmpdir(), `skvm-api-operation-${options.expectedRunKind}-verify-`));
  try {
    for (const [index, row] of lock.rows.entries()) {
      const observed = report.rows[index]!;
      const attempt = state.attempts[index]!;
      const journalRoot = join(outRoot, "journal", attempt.attemptId);
      const journalFiles = await listRegularFiles(journalRoot);
      if (canonical(journalFiles) !== canonical([...PROSPECTIVE_JOURNAL_FILES])) {
        throw new Error(`prospective journal closure drift: ${row.rowId}`);
      }
      const prepared = AttemptSchema.parse(JSON.parse(await readFile(join(journalRoot, "prepared.json"), "utf8")));
      const dispatched = AttemptSchema.parse(JSON.parse(await readFile(join(journalRoot, "dispatched.json"), "utf8")));
      const expectedPrepared = AttemptSchema.parse({
        ...attempt,
        status: "prepared",
        dispatchedAt: null,
        terminalAt: null,
        terminalSha256: null,
      });
      const expectedDispatched = AttemptSchema.parse({
        ...attempt,
        status: "dispatched",
        terminalAt: null,
        terminalSha256: null,
      });
      if (canonical(prepared) !== canonical(expectedPrepared) || canonical(dispatched) !== canonical(expectedDispatched)) {
        throw new Error(`prospective prepared or dispatched journal semantic drift: ${row.rowId}`);
      }
      let invocation: z.infer<typeof ProspectiveInvocationSchema>;
      try {
        invocation = ProspectiveInvocationSchema.parse(JSON.parse(await readFile(join(journalRoot, "invocation.json"), "utf8")));
      } catch (error) {
        throw new Error(`prospective invocation journal schema drift: ${row.rowId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (invocation.runKind !== report.runKind || invocation.rowId !== row.rowId || invocation.attemptId !== attempt.attemptId
        || invocation.arguments.manifest !== row.manifest.path || invocation.arguments.node !== options.nodeExecutable) {
        throw new Error(`prospective invocation journal semantic drift: ${row.rowId}`);
      }
      const exit = ProspectiveExitSchema.parse(JSON.parse(await readFile(join(journalRoot, "exit.json"), "utf8")));
      const stdout = await readFile(join(journalRoot, "stdout.log"), "utf8");
      const stderr = await readFile(join(journalRoot, "stderr.log"), "utf8");
      if (observed.terminal.status === "completed") {
        if (invocation.timeoutMillis === 0 || exit.status !== 0 || exit.signal !== null || exit.timedOut || exit.error !== null || stderr !== "") {
          throw new Error(`prospective successful exit journal semantic drift: ${row.rowId}`);
        }
      } else if ((observed.terminal.errorCode === "ROW_TIMEOUT" || observed.terminal.errorCode === "TOTAL_RUN_TIMEOUT") && !exit.timedOut) {
        throw new Error(`prospective timeout exit journal semantic drift: ${row.rowId}`);
      } else if (observed.terminal.errorCode === "CANDIDATE_EXIT_NONZERO" && (exit.status === null || exit.status === 0 || exit.timedOut)) {
        throw new Error(`prospective nonzero exit journal semantic drift: ${row.rowId}`);
      } else if (observed.terminal.errorCode === "CANDIDATE_PROCESS_FAILED" && exit.error === null) {
        throw new Error(`prospective process error journal semantic drift: ${row.rowId}`);
      }
      const terminalBytes = await readFile(join(journalRoot, "terminal.json"));
      if (sha256(terminalBytes) !== attempt.terminalSha256 || canonical(JSON.parse(terminalBytes.toString("utf8"))) !== canonical(observed)) {
        throw new Error(`prospective terminal binding drift: ${row.rowId}`);
      }
      if (observed.inputSha256 !== row.source.sha256 || observed.manifestSha256 !== row.manifest.sha256) {
        throw new Error(`prospective input binding drift: ${row.rowId}`);
      }
      if (observed.terminal.status === "infrastructure-failed") continue;
      const rowRoot = join(tempRoot, row.rowId);
      await copyRowInputs(rootDir, rowRoot, row);
      const manifestInput = ApiTesterOperationInputManifestSchema.parse(JSON.parse(await readFile(contained(rowRoot, row.manifest.path, "prospective verification manifest"), "utf8")));
      const archivedOutput = join(outRoot, "rows", row.rowId, "candidate-output");
      const workOutput = contained(rowRoot, manifestInput.output.path, "prospective verification output");
      await mkdir(dirname(workOutput), { recursive: true });
      await cp(archivedOutput, workOutput, { recursive: true, errorOnExist: true, force: false });
      const candidateReportBytes = await readFile(join(workOutput, "report.json"));
      const outputManifestBytes = await readFile(join(workOutput, "output-manifest.json"));
      const candidateReport = ApiTesterOperationInputReportSchema.parse(JSON.parse(candidateReportBytes.toString("utf8")));
      const expectedStdout = {
        status: candidateReport.status,
        operations: candidateReport.totals.operations,
        accepted: candidateReport.totals.accepted,
        rejected: candidateReport.totals.rejected,
        unresolved: candidateReport.totals.unresolved,
        checked: candidateReport.totals.artifactCheckedPassedOperations,
        documentDisposition: candidateReport.documentDisposition,
        portableSemanticSha256: candidateReport.portableSemanticSha256,
      };
      let actualStdout: unknown;
      try {
        actualStdout = JSON.parse(stdout.trim());
      } catch {
        throw new Error(`prospective candidate stdout journal is not the expected JSON: ${row.rowId}`);
      }
      if (canonical(actualStdout) !== canonical(expectedStdout)) {
        throw new Error(`prospective candidate stdout journal semantic drift: ${row.rowId}`);
      }
      try {
        await verifyApiTesterOperationInputOutput({ rootDir: rowRoot, manifestPath: row.manifest.path, nodeExecutable: options.nodeExecutable });
      } catch (error) {
        if (candidateReport.gates.implementationCorrectness !== "fail") throw error;
      }
      const expectedTerminal = operationReportToObservedTerminal(candidateReport, sha256(candidateReportBytes), sha256(outputManifestBytes));
      if (canonical(expectedTerminal) !== canonical(observed.terminal)) throw new Error(`prospective candidate output summary drift: ${row.rowId}`);
    }
    const rebuilt = buildApiTesterOperationProspectiveFirstRunReport({
      runKind: report.runKind,
      lock: report.lock,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      rows: report.rows,
    });
    if (canonical(rebuilt) !== canonical(report)) throw new Error("prospective first-run derived report drift");
    return { status: "verified", rows: 18, realDocuments: 12, syntheticDocuments: 6, infrastructureFailedDocuments: report.totals.infrastructureFailedDocuments, prospectiveRuns: 1 };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function runApiTesterOperationProspectiveFirstRun(options: {
  rootDir: string;
  freezePath: string;
  freezeCommit: string;
  lockPath: string;
  executionCommit: string;
  outRoot: string;
  nodeExecutable: string;
  gitExecutable: string;
  runKind: "first-run" | "reproduction";
  startedAt: string;
}): Promise<ApiTesterOperationProspectiveFirstRunReport> {
  const rootDir = resolve(options.rootDir);
  const clean = gitResult(rootDir, options.gitExecutable, ["status", "--porcelain", "--untracked-files=no"]);
  if (clean.status !== 0 || clean.stdout.trim() !== "") throw new Error("prospective execution requires a tracked-clean checkout");
  await verifyApiTesterOperationProspectiveExperimentLockGit({
    rootDir,
    lockPath: options.lockPath,
    executionCommit: options.executionCommit,
    freezePath: options.freezePath,
    freezeCommit: options.freezeCommit,
    bunVersion: Bun.version,
    nodeVersion: spawnSync(options.nodeExecutable, ["--version"], { encoding: "utf8" }).stdout?.trim() ?? "",
    nodeExecutable: options.nodeExecutable,
    gitExecutable: options.gitExecutable,
  });
  const lockBytes = await readFile(contained(rootDir, options.lockPath, "prospective execution lock"));
  const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  return runApiTesterOperationProspectiveRows({
    rootDir,
    lock,
    lockRef: { path: options.lockPath, sha256: sha256(lockBytes), commit: options.executionCommit },
    outRoot: options.outRoot,
    nodeExecutable: options.nodeExecutable,
    runKind: options.runKind,
    startedAt: options.startedAt,
  });
}

function reproductionSemantics(report: ApiTesterOperationProspectiveFirstRunReport) {
  return {
    lock: report.lock,
    denominator: report.denominator,
    totals: report.totals,
    strata: report.strata,
    rows: report.rows.map((row) => ({
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      stratum: row.stratum,
      inputSha256: row.inputSha256,
      manifestSha256: row.manifestSha256,
      terminal: row.terminal.status === "completed" ? {
        status: row.terminal.status,
        portableSemanticSha256: row.terminal.portableSemanticSha256,
        documentDisposition: row.terminal.documentDisposition,
        totals: row.terminal.totals,
        gates: row.terminal.gates,
        obligationCoverage: row.terminal.obligationCoverage,
        sourceIssues: row.terminal.sourceIssues,
      } : {
        status: row.terminal.status,
        errorCode: row.terminal.errorCode,
        error: row.terminal.error,
      },
      accounting: row.accounting,
    })),
    executionPolicy: report.executionPolicy,
    accounting: report.accounting,
    evidenceBoundary: report.evidenceBoundary,
  };
}

export function compareApiTesterOperationProspectiveReproduction(
  firstRunInput: ApiTesterOperationProspectiveFirstRunReport | unknown,
  reproductionInput: ApiTesterOperationProspectiveFirstRunReport | unknown,
): { status: "equivalent"; rows: 18; semanticSha256: string } {
  const firstRun = ApiTesterOperationProspectiveFirstRunReportSchema.parse(firstRunInput);
  const reproduction = ApiTesterOperationProspectiveFirstRunReportSchema.parse(reproductionInput);
  if (firstRun.runKind !== "first-run" || reproduction.runKind !== "reproduction") throw new Error("reproduction comparison run-kind mismatch");
  const expected = reproductionSemantics(firstRun);
  const actual = reproductionSemantics(reproduction);
  if (canonical(expected) !== canonical(actual)) throw new Error("reproduction semantic mismatch");
  return { status: "equivalent", rows: 18, semanticSha256: sha256(canonical(expected)) };
}
