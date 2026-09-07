import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import {
  AI_ASSISTED_DEVELOPMENT_ROUTING_IDENTITY,
  AiAssistedDevelopmentRoutingSchema,
  type AiAssistedDevelopmentRouting,
} from "./ai-assisted-development-routing";
import {
  API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION,
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID,
  ApiTesterProductionBindingSchema,
  ApiTesterProductionUnsupportedError,
  type ApiTesterProductionUnsupportedCode,
} from "../../skill-ir/api-tester-production-contract";
import {
  API_TESTER_PRODUCTION_IDENTITY,
  executeApiTesterProductionArtifact,
  prepareApiTesterProductionArtifact,
} from "../../skill-ir/api-tester-production-artifact";

export const API_TESTER_CONSTRUCTOR_CANDIDATE_IDENTITY =
  "skill-ir-api-tester-constructor-candidate-001" as const;
export const API_TESTER_CONSTRUCTOR_PROSPECTIVE_IDENTITY =
  "skill-ir-api-tester-constructor-prospective-001" as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const SafeRelativePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), {
  message: "path must be a contained POSIX relative path",
});

const RejectionCodeSchema = z.enum([
  "INVALID_OPENAPI",
  "UNSUPPORTED_OPENAPI_FEATURE",
  "UNSUPPORTED_REFERENCE",
  "UNSUPPORTED_PARAMETER",
  "UNSUPPORTED_REQUEST_BODY",
  "UNSUPPORTED_SECURITY",
  "UNSUPPORTED_RESPONSE",
  "UNSUPPORTED_SCHEMA",
  "UNCONSTRUCTIBLE_CONSTRAINT",
  "MISSING_REQUIRED_ERROR_RESPONSE",
  "MISSING_SECURITY_ERROR_RESPONSE",
]);

const REJECTION_CODES = [
  "INVALID_OPENAPI",
  "UNSUPPORTED_OPENAPI_FEATURE",
  "UNSUPPORTED_REFERENCE",
  "UNSUPPORTED_PARAMETER",
  "UNSUPPORTED_REQUEST_BODY",
  "UNSUPPORTED_SECURITY",
  "UNSUPPORTED_RESPONSE",
  "UNSUPPORTED_SCHEMA",
  "UNCONSTRUCTIBLE_CONSTRAINT",
  "MISSING_REQUIRED_ERROR_RESPONSE",
  "MISSING_SECURITY_ERROR_RESPONSE",
] as const satisfies readonly ApiTesterProductionUnsupportedCode[];

const SourceClosureEntrySchema = z.object({
  role: z.enum(["contract-builder", "checker-generator", "artifact-wrapper", "deterministic-runtime"]),
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ApiTesterConstructorCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-constructor-candidate/v1"),
  identity: z.literal(API_TESTER_CONSTRUCTOR_CANDIDATE_IDENTITY),
  frozenAt: z.literal("2026-09-07T08:30:00.000Z"),
  implementationIdentity: z.literal(API_TESTER_PRODUCTION_IDENTITY),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID),
  routingTable: z.object({
    identity: z.literal(AI_ASSISTED_DEVELOPMENT_ROUTING_IDENTITY),
    path: z.literal("benchmarks/skill-ir/classification/ai-assisted-development-routing-v1.json"),
    sha256: Sha256Schema,
  }).strict(),
  historicalQ2: z.object({
    profileId: z.string().min(1),
    path: z.literal("benchmarks/skill-ir/classification/q2-current-capabilities-v1.json"),
    sha256: Sha256Schema,
  }).strict(),
  sourceClosure: z.array(SourceClosureEntrySchema).length(4),
  supportedFeatures: z.array(z.string().min(1)).min(1),
  rejectionCodes: z.tuple(REJECTION_CODES.map((code) => z.literal(code)) as unknown as [
    z.ZodLiteral<ApiTesterProductionUnsupportedCode>,
    ...z.ZodLiteral<ApiTesterProductionUnsupportedCode>[],
  ]),
  checkerBoundary: z.string().min(1),
  evidenceBoundary: z.object({
    developmentOnly: z.literal(true),
    fullOpenApiValidator: z.literal(false),
    rejectionMeansCurrentCandidateDoesNotAdmit: z.literal(true),
    changesHistoricalQ2: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((candidate, context) => {
  const roles = candidate.sourceClosure.map((entry) => entry.role);
  if (new Set(roles).size !== 4) {
    context.addIssue({ code: "custom", path: ["sourceClosure"], message: "candidate source roles must be unique" });
  }
});
export type ApiTesterConstructorCandidate = z.infer<typeof ApiTesterConstructorCandidateSchema>;

const ProspectiveInputSchema = z.object({
  storage: z.enum(["external-cache", "repository"]),
  path: SafeRelativePathSchema,
  format: z.enum(["json", "yaml"]),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  upstream: z.object({
    repository: z.string().url(),
    commit: GitCommitSchema,
    repositoryPath: SafeRelativePathSchema,
    rawUrl: z.string().url(),
  }).strict().nullable(),
  license: z.object({
    summary: z.string().min(1),
    path: SafeRelativePathSchema,
    bytes: z.number().int().positive(),
    sha256: Sha256Schema,
    rawUrl: z.string().url(),
  }).strict().nullable(),
}).strict().superRefine((input, context) => {
  if ((input.storage === "external-cache") !== (input.upstream !== null && input.license !== null)) {
    context.addIssue({ code: "custom", message: "external cache inputs require upstream and license bindings" });
  }
  const extensionMatches = input.format === "json"
    ? input.path.toLowerCase().endsWith(".json")
    : /\.ya?ml$/iu.test(input.path);
  if (!extensionMatches) context.addIssue({ code: "custom", path: ["path"], message: "input extension/format mismatch" });
});

const ProspectiveRowSchema = z.object({
  rowId: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u),
  stratum: z.enum(["real-public-input", "synthetic-boundary"]),
  input: ProspectiveInputSchema,
  bindingPath: SafeRelativePathSchema,
  binding: ApiTesterProductionBindingSchema,
  bindingSha256: Sha256Schema,
  prediction: z.object({
    expectedOutcome: z.literal("rejected"),
    rejectionCode: RejectionCodeSchema,
    basis: z.string().min(1),
  }).strict(),
}).strict().superRefine((row, context) => {
  if ((row.stratum === "real-public-input") !== (row.input.storage === "external-cache")) {
    context.addIssue({ code: "custom", message: "row stratum/input storage mismatch" });
  }
  if (row.binding.input.path !== row.input.path || row.binding.input.format !== row.input.format) {
    context.addIssue({ code: "custom", message: "row input/binding mismatch" });
  }
});

export const ApiTesterProspectiveExperimentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-constructor-prospective-lock/v1"),
  identity: z.literal(API_TESTER_CONSTRUCTOR_PROSPECTIVE_IDENTITY),
  frozenAt: z.literal("2026-09-07T09:00:00.000Z"),
  candidate: z.object({
    identity: z.literal(API_TESTER_CONSTRUCTOR_CANDIDATE_IDENTITY),
    path: z.literal("benchmarks/skill-ir/classification/api-tester-constructor-candidate-v1.json"),
    sha256: Sha256Schema,
  }).strict(),
  selectionRule: z.object({
    method: z.literal("development-purposive-pre-execution"),
    realInputInclusion: z.tuple([
      z.literal("public GitHub repository with an OpenAPI 3.x document available at an immutable commit and path"),
      z.literal("repository license file available and digest-bound"),
      z.literal("not an existing API Tester development fixture and not held-out material"),
      z.literal("four distinct upstream repositories; source bytes inspected only as public text before prediction"),
    ]),
    boundarySelection: z.tuple([
      z.literal("one unsupported parameter-location case"),
      z.literal("one unsupported security-scheme case"),
      z.literal("one unsupported request-body media-type case"),
      z.literal("one missing required-field error-response case"),
    ]),
    randomSample: z.literal(false),
    reliabilityClaim: z.literal(false),
  }).strict(),
  denominator: z.object({
    realPublicInputs: z.literal(4),
    syntheticBoundaryCases: z.literal(4),
    total: z.literal(8),
  }).strict(),
  executionPolicy: z.object({
    attemptsPerRow: z.literal(1),
    retries: z.literal(0),
    replacements: z.literal(0),
    candidateFixes: z.literal(0),
    runAllRows: z.literal(true),
    retainAllOutcomesInDenominator: z.literal(true),
  }).strict(),
  costs: z.object({
    aiAnalysis: z.object({ status: z.literal("not-measured"), scope: z.literal("platform-side development activity outside the project runner") }).strict(),
    construction: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), durationRecordedPerRow: z.literal(true) }).strict(),
    runAndCheck: z.object({ durationRecordedPerRow: z.literal(true) }).strict(),
    humanModification: z.object({ prospectiveObservedMinutesPerRow: z.literal(true), historicalBackfillAllowed: z.literal(false) }).strict(),
  }).strict(),
  rows: z.array(ProspectiveRowSchema).length(8),
  resultState: z.literal("not-run"),
  claimBoundary: z.string().min(1),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((lock, context) => {
  const rowIds = lock.rows.map((row) => row.rowId);
  if (new Set(rowIds).size !== 8) {
    context.addIssue({ code: "custom", path: ["rows"], message: "prospective lock requires 8 unique rows" });
  }
  if (lock.rows.filter((row) => row.stratum === "real-public-input").length !== 4
    || lock.rows.filter((row) => row.stratum === "synthetic-boundary").length !== 4) {
    context.addIssue({ code: "custom", path: ["rows"], message: "prospective denominator must remain 4 real plus 4 boundary rows" });
  }
});
export type ApiTesterProspectiveExperimentLock = z.infer<typeof ApiTesterProspectiveExperimentLockSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function digestFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const bytes = await readFile(path);
  return { sha256: sha256(bytes), bytes: bytes.byteLength };
}

export async function buildApiTesterConstructorCandidate(options: {
  rootDir: string;
  routing: AiAssistedDevelopmentRouting;
}): Promise<ApiTesterConstructorCandidate> {
  const rootDir = resolve(options.rootDir);
  const routing = AiAssistedDevelopmentRoutingSchema.parse(options.routing);
  const routingPath = join(rootDir, "benchmarks", "skill-ir", "classification", "ai-assisted-development-routing-v1.json");
  const q2Path = join(rootDir, "benchmarks", "skill-ir", "classification", "q2-current-capabilities-v1.json");
  const [routingBytes, q2Bytes] = await Promise.all([readFile(routingPath), readFile(q2Path)]);
  const committedRouting = AiAssistedDevelopmentRoutingSchema.parse(JSON.parse(routingBytes.toString("utf8")));
  if (JSON.stringify(committedRouting) !== JSON.stringify(routing)) throw new Error("routing object differs from committed artifact");
  const q2 = z.object({ profileId: z.string().min(1) }).passthrough().parse(JSON.parse(q2Bytes.toString("utf8")));
  const sourceSpecs = [
    { role: "contract-builder" as const, path: "src/skill-ir/api-tester-production-contract.ts" },
    { role: "checker-generator" as const, path: "src/skill-ir/api-tester-production-programs.ts" },
    { role: "artifact-wrapper" as const, path: "src/skill-ir/api-tester-production-artifact.ts" },
    { role: "deterministic-runtime" as const, path: "src/skill-ir/api-tester-production-programs.ts" },
  ];
  const sourceClosure = await Promise.all(sourceSpecs.map(async (entry) => ({
    ...entry,
    sha256: sha256(await readFile(join(rootDir, entry.path))),
  })));
  return ApiTesterConstructorCandidateSchema.parse({
    schemaVersion: "skill-ir-api-tester-constructor-candidate/v1",
    identity: API_TESTER_CONSTRUCTOR_CANDIDATE_IDENTITY,
    frozenAt: "2026-09-07T08:30:00.000Z",
    implementationIdentity: API_TESTER_PRODUCTION_IDENTITY,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID,
    routingTable: {
      identity: routing.identity,
      path: "benchmarks/skill-ir/classification/ai-assisted-development-routing-v1.json",
      sha256: sha256(routingBytes),
    },
    historicalQ2: {
      profileId: q2.profileId,
      path: "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json",
      sha256: sha256(q2Bytes),
    },
    sourceClosure,
    supportedFeatures: [
      "OpenAPI 3.x documents with non-empty paths and explicit operation response codes",
      "inline primitive path, query, and header parameters",
      "inline application/json object request bodies with primitive properties",
      "bearer HTTP and header API-key security schemes",
      "string email/uri plus primitive enum, length, and numeric range constraints",
      "deterministic valid/invalid request planning and public-contract checking",
    ],
    rejectionCodes: REJECTION_CODES,
    checkerBoundary: "The checker validates the normalized public contract emitted by this candidate; it is not a second OpenAPI parser or a complete OpenAPI/JSON Schema validator.",
    evidenceBoundary: {
      developmentOnly: true,
      fullOpenApiValidator: false,
      rejectionMeansCurrentCandidateDoesNotAdmit: true,
      changesHistoricalQ2: false,
      changesReadiness: false,
    },
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
  });
}

const REAL_INPUTS = [
  {
    rowId: "real-open-meteo-forecast",
    path: "open-meteo/forecast.yml",
    format: "yaml" as const,
    bytes: 136988,
    sha256: "fdd3195d66fade678924c1df99d32de4f1d6aa7c954c5bc7ff1646ed8c558def",
    repository: "https://github.com/open-meteo/open-meteo",
    commit: "6c45053fb1ef0c049de931292a0f5cb35f14c0ba",
    repositoryPath: "openapi/forecast.yml",
    rawUrl: "https://raw.githubusercontent.com/open-meteo/open-meteo/6c45053fb1ef0c049de931292a0f5cb35f14c0ba/openapi/forecast.yml",
    license: { summary: "AGPL-3.0 repository; OpenAPI info field declares CC-BY-4.0", path: "open-meteo/LICENSE", bytes: 34522, sha256: "20b067f86de375aae6db0f283ab2e65de24d537733b89bd58432c101259d84cf", rawUrl: "https://raw.githubusercontent.com/open-meteo/open-meteo/6c45053fb1ef0c049de931292a0f5cb35f14c0ba/LICENSE" },
    code: "UNSUPPORTED_SCHEMA" as const,
    basis: "The first path has an inline query parameter whose schema type is array; the candidate requires an explicit primitive field type.",
  },
  {
    rowId: "real-dpp-rest-api",
    path: "dpp/openapi.yaml",
    format: "yaml" as const,
    bytes: 12003,
    sha256: "df78853e87d23ecf78f3114ad865d0c258eaa77b96288850226182eb4067da28",
    repository: "https://github.com/dpp-admin/openapi",
    commit: "692ce4aba0f0e1cc121c7b7b87b5d13fd70ed28b",
    repositoryPath: "openapi.yaml",
    rawUrl: "https://raw.githubusercontent.com/dpp-admin/openapi/692ce4aba0f0e1cc121c7b7b87b5d13fd70ed28b/openapi.yaml",
    license: { summary: "MIT", path: "dpp/LICENSE", bytes: 677, sha256: "24e5014c27673b84f577ac9cbc13326f55cdbe76118ac336b373444408058ac8", rawUrl: "https://raw.githubusercontent.com/dpp-admin/openapi/692ce4aba0f0e1cc121c7b7b87b5d13fd70ed28b/LICENSE" },
    code: "UNSUPPORTED_REFERENCE" as const,
    basis: "The public document contains $ref entries, which the candidate rejects before contract construction.",
  },
  {
    rowId: "real-openwrt-uapi",
    path: "openwrt/openapi.json",
    format: "json" as const,
    bytes: 845865,
    sha256: "a6795142c979606ddec9db4416acdd0b4fd345a2bcb82faf42b2250e353517cf",
    repository: "https://github.com/openwrt-iac/uapi",
    commit: "01db068a9558cb3353d0b0998e4dc3c8629be0d3",
    repositoryPath: "build/openapi.json",
    rawUrl: "https://raw.githubusercontent.com/openwrt-iac/uapi/01db068a9558cb3353d0b0998e4dc3c8629be0d3/build/openapi.json",
    license: { summary: "MIT", path: "openwrt/LICENSE", bytes: 1068, sha256: "3dc1ba29a680728decae988bcb0c6b8b4164955741d33c3e00a90d37064e9ec3", rawUrl: "https://raw.githubusercontent.com/openwrt-iac/uapi/01db068a9558cb3353d0b0998e4dc3c8629be0d3/LICENSE" },
    code: "UNSUPPORTED_REFERENCE" as const,
    basis: "The public document contains $ref entries, which the candidate rejects before contract construction.",
  },
  {
    rowId: "real-signalk-polar-performance",
    path: "signalk/openApi.json",
    format: "json" as const,
    bytes: 34723,
    sha256: "0888e6743b209fbb7972eeb403d6570d614c14d710159aa6937d124781447de9",
    repository: "https://github.com/htool/signalk-polar-performance-plugin",
    commit: "9e655e45197db627a460370394404c055f14722a",
    repositoryPath: "openApi.json",
    rawUrl: "https://raw.githubusercontent.com/htool/signalk-polar-performance-plugin/9e655e45197db627a460370394404c055f14722a/openApi.json",
    license: { summary: "Apache-2.0", path: "signalk/LICENSE", bytes: 11357, sha256: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4", rawUrl: "https://raw.githubusercontent.com/htool/signalk-polar-performance-plugin/9e655e45197db627a460370394404c055f14722a/LICENSE" },
    code: "UNSUPPORTED_REFERENCE" as const,
    basis: "The public document contains $ref entries, which the candidate rejects before contract construction.",
  },
] as const;

const BOUNDARY_INPUTS = [
  { rowId: "boundary-unsupported-cookie-parameter", file: "unsupported-cookie-parameter.json", code: "UNSUPPORTED_PARAMETER" as const, basis: "Cookie parameters are outside the admitted path/query/header locations." },
  { rowId: "boundary-unsupported-oauth2-security", file: "unsupported-oauth2-security.json", code: "UNSUPPORTED_SECURITY" as const, basis: "OAuth2 is outside the admitted bearer HTTP and header API-key schemes." },
  { rowId: "boundary-unsupported-multipart-body", file: "unsupported-multipart-body.json", code: "UNSUPPORTED_REQUEST_BODY" as const, basis: "Multipart form data is outside the admitted application/json request-body media type." },
  { rowId: "boundary-missing-required-error-response", file: "missing-required-error-response.json", code: "MISSING_REQUIRED_ERROR_RESPONSE" as const, basis: "A required path field has no explicit 4xx/5xx response to witness its invalid case." },
] as const;

function binding(rowId: string, path: string, format: "json" | "yaml") {
  return ApiTesterProductionBindingSchema.parse({
    schemaVersion: API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION,
    bindingId: rowId.replace(/^(real|boundary)-/u, "prospective-"),
    input: { path, format },
    outputs: { plan: "plan.json", report: "report.md" },
  });
}

export async function buildApiTesterProspectiveExperimentLock(options: {
  rootDir: string;
  candidate: ApiTesterConstructorCandidate;
}): Promise<ApiTesterProspectiveExperimentLock> {
  const rootDir = resolve(options.rootDir);
  const candidate = ApiTesterConstructorCandidateSchema.parse(options.candidate);
  const candidatePath = join(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v1.json");
  const candidateBytes = await readFile(candidatePath);
  const committedCandidate = ApiTesterConstructorCandidateSchema.parse(JSON.parse(candidateBytes.toString("utf8")));
  if (JSON.stringify(candidate) !== JSON.stringify(committedCandidate)) throw new Error("candidate differs from committed snapshot");

  const buildRowBinding = async (rowId: string) => {
    const bindingPath = `benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/bindings/${rowId}.json`;
    const bindingBytes = await readFile(join(rootDir, bindingPath));
    const rowBinding = ApiTesterProductionBindingSchema.parse(JSON.parse(bindingBytes.toString("utf8")));
    return { bindingPath, binding: rowBinding, bindingSha256: sha256(bindingBytes) };
  };

  const realRows = await Promise.all(REAL_INPUTS.map(async (entry) => {
    const rowBinding = binding(entry.rowId, entry.path, entry.format);
    const committedBinding = await buildRowBinding(entry.rowId);
    if (JSON.stringify(rowBinding) !== JSON.stringify(committedBinding.binding)) {
      throw new Error(`committed binding drift: ${entry.rowId}`);
    }
    return ProspectiveRowSchema.parse({
      rowId: entry.rowId,
      stratum: "real-public-input",
      input: {
        storage: "external-cache",
        path: entry.path,
        format: entry.format,
        bytes: entry.bytes,
        sha256: entry.sha256,
        upstream: { repository: entry.repository, commit: entry.commit, repositoryPath: entry.repositoryPath, rawUrl: entry.rawUrl },
        license: entry.license,
      },
      bindingPath: committedBinding.bindingPath,
      binding: rowBinding,
      bindingSha256: committedBinding.bindingSha256,
      prediction: { expectedOutcome: "rejected", rejectionCode: entry.code, basis: entry.basis },
    });
  }));
  const boundaryRows = await Promise.all(BOUNDARY_INPUTS.map(async (entry) => {
    const path = `benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/boundary/${entry.file}`;
    const digest = await digestFile(join(rootDir, path));
    const rowBinding = binding(entry.rowId, path, "json");
    const committedBinding = await buildRowBinding(entry.rowId);
    if (JSON.stringify(rowBinding) !== JSON.stringify(committedBinding.binding)) {
      throw new Error(`committed binding drift: ${entry.rowId}`);
    }
    return ProspectiveRowSchema.parse({
      rowId: entry.rowId,
      stratum: "synthetic-boundary",
      input: { storage: "repository", path, format: "json", ...digest, upstream: null, license: null },
      bindingPath: committedBinding.bindingPath,
      binding: rowBinding,
      bindingSha256: committedBinding.bindingSha256,
      prediction: { expectedOutcome: "rejected", rejectionCode: entry.code, basis: entry.basis },
    });
  }));
  return ApiTesterProspectiveExperimentLockSchema.parse({
    schemaVersion: "skill-ir-api-tester-constructor-prospective-lock/v1",
    identity: API_TESTER_CONSTRUCTOR_PROSPECTIVE_IDENTITY,
    frozenAt: "2026-09-07T09:00:00.000Z",
    candidate: {
      identity: candidate.identity,
      path: "benchmarks/skill-ir/classification/api-tester-constructor-candidate-v1.json",
      sha256: sha256(candidateBytes),
    },
    selectionRule: {
      method: "development-purposive-pre-execution",
      realInputInclusion: [
        "public GitHub repository with an OpenAPI 3.x document available at an immutable commit and path",
        "repository license file available and digest-bound",
        "not an existing API Tester development fixture and not held-out material",
        "four distinct upstream repositories; source bytes inspected only as public text before prediction",
      ],
      boundarySelection: [
        "one unsupported parameter-location case",
        "one unsupported security-scheme case",
        "one unsupported request-body media-type case",
        "one missing required-field error-response case",
      ],
      randomSample: false,
      reliabilityClaim: false,
    },
    denominator: { realPublicInputs: 4, syntheticBoundaryCases: 4, total: 8 },
    executionPolicy: { attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0, runAllRows: true, retainAllOutcomesInDenominator: true },
    costs: {
      aiAnalysis: { status: "not-measured", scope: "platform-side development activity outside the project runner" },
      construction: { modelCalls: 0, apiCalls: 0, paidCalls: 0, durationRecordedPerRow: true },
      runAndCheck: { durationRecordedPerRow: true },
      humanModification: { prospectiveObservedMinutesPerRow: true, historicalBackfillAllowed: false },
    },
    rows: [...realRows, ...boundaryRows],
    resultState: "not-run",
    claimBoundary: "This frozen 4+4 development panel can reveal candidate admission and rejection behavior on the selected inputs. It does not complete human Q1, estimate reliability, prove arbitrary OpenAPI support, establish human savings, or change readiness.",
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
  });
}

function contained(baseDirectory: string, relativePath: string): string {
  const base = resolve(baseDirectory);
  const target = resolve(base, SafeRelativePathSchema.parse(relativePath));
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error(`path escapes base directory: ${relativePath}`);
  }
  return target;
}

async function verifyFrozenFile(path: string, expected: { bytes: number; sha256: string }, label: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const bytes = await readFile(path);
  if (bytes.byteLength !== expected.bytes) throw new Error(`${label} byte length drift`);
  if (sha256(bytes) !== expected.sha256) throw new Error(`${label} digest drift`);
}

export async function verifyApiTesterProspectiveInputs(options: {
  rootDir: string;
  cacheRoot: string;
  lock: ApiTesterProspectiveExperimentLock | unknown;
}): Promise<{ rows: 8; realInputs: 4; boundaryInputs: 4; licenseFiles: 4; bindingFiles: 8 }> {
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const lock = ApiTesterProspectiveExperimentLockSchema.parse(options.lock);
  let realInputs = 0;
  let boundaryInputs = 0;
  let licenseFiles = 0;
  for (const row of lock.rows) {
    const bindingPath = contained(rootDir, row.bindingPath);
    const bindingBytes = await readFile(bindingPath);
    const parsedBinding = ApiTesterProductionBindingSchema.parse(JSON.parse(bindingBytes.toString("utf8")));
    if (sha256(bindingBytes) !== row.bindingSha256 || JSON.stringify(parsedBinding) !== JSON.stringify(row.binding)) {
      throw new Error(`binding digest or content drift: ${row.rowId}`);
    }
    if (row.stratum === "real-public-input") {
      realInputs += 1;
      await verifyFrozenFile(contained(cacheRoot, row.input.path), row.input, `real input ${row.rowId}`);
      if (!row.input.license) throw new Error(`real input license missing: ${row.rowId}`);
      await verifyFrozenFile(contained(cacheRoot, row.input.license.path), row.input.license, `license ${row.rowId}`);
      licenseFiles += 1;
    } else {
      boundaryInputs += 1;
      await verifyFrozenFile(contained(rootDir, row.input.path), row.input, `boundary input ${row.rowId}`);
    }
  }
  if (realInputs !== 4 || boundaryInputs !== 4 || licenseFiles !== 4) {
    throw new Error("prospective input denominator drift");
  }
  return { rows: 8, realInputs: 4, boundaryInputs: 4, licenseFiles: 4, bindingFiles: 8 };
}

const ProspectiveObservedRowSchema = z.object({
  rowId: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u),
  stratum: z.enum(["real-public-input", "synthetic-boundary"]),
  inputSha256: Sha256Schema,
  bindingSha256: Sha256Schema,
  prediction: z.object({
    expectedOutcome: z.literal("rejected"),
    rejectionCode: RejectionCodeSchema,
    basis: z.string().min(1),
  }).strict(),
  actual: z.object({
    outcome: z.enum(["accepted", "rejected", "checker-failed", "infrastructure-failed"]),
    rejectionCode: RejectionCodeSchema.nullable(),
    error: z.string().min(1).nullable(),
    artifact: z.object({
      packageManifestSha256: Sha256Schema,
      generatorSha256: Sha256Schema,
      checkerSha256: Sha256Schema,
      planSha256: Sha256Schema,
      reportSha256: Sha256Schema,
      validationReportSha256: Sha256Schema,
    }).strict().nullable(),
    checkerStatus: z.enum(["not-run", "pass", "fail"]),
  }).strict(),
  predictionParity: z.enum(["exact", "outcome-only", "mismatch"]),
  costs: z.object({
    constructionMillis: z.number().int().nonnegative(),
    runAndCheckMillis: z.number().int().nonnegative(),
    humanModificationMinutes: z.number().nonnegative(),
    humanModificationNote: z.string().min(1),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
}).strict().superRefine((row, context) => {
  if (row.actual.outcome === "rejected") {
    if (!row.actual.rejectionCode || row.actual.artifact || row.actual.checkerStatus !== "not-run") {
      context.addIssue({ code: "custom", message: "rejected rows require only a rejection code" });
    }
  } else if (row.actual.outcome === "accepted") {
    if (row.actual.rejectionCode || !row.actual.artifact || row.actual.checkerStatus !== "pass" || row.actual.error) {
      context.addIssue({ code: "custom", message: "accepted rows require passing artifact evidence" });
    }
  } else if (row.actual.rejectionCode || !row.actual.error || row.actual.artifact) {
    context.addIssue({ code: "custom", message: "failed rows require an error and no artifact/rejection code" });
  }
});
export type ApiTesterProspectiveObservedRow = z.infer<typeof ProspectiveObservedRowSchema>;

const OutcomeCountsSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  checkerFailed: z.number().int().nonnegative(),
  infrastructureFailed: z.number().int().nonnegative(),
}).strict();

export const ApiTesterProspectiveFirstRunReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-constructor-prospective-first-run-report/v1"),
  identity: z.literal(API_TESTER_CONSTRUCTOR_PROSPECTIVE_IDENTITY),
  status: z.literal("completed"),
  freeze: z.object({
    commit: GitCommitSchema,
    remoteBranch: z.literal("origin/skill-ir-aot"),
    lockPath: z.literal("benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/experiment-lock.json"),
    lockSha256: Sha256Schema,
    candidateSha256: Sha256Schema,
    verifiedBeforeRun: z.literal(true),
  }).strict(),
  denominator: z.object({
    planned: z.literal(8),
    attempted: z.literal(8),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    checkerFailed: z.number().int().nonnegative(),
    infrastructureFailed: z.number().int().nonnegative(),
  }).strict(),
  strata: z.object({
    realPublicInputs: OutcomeCountsSchema,
    syntheticBoundaryCases: OutcomeCountsSchema,
  }).strict(),
  predictionParity: z.object({
    exact: z.number().int().nonnegative(),
    outcomeOnly: z.number().int().nonnegative(),
    mismatch: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(ProspectiveObservedRowSchema).length(8),
  costs: z.object({
    aiAnalysis: z.object({ status: z.literal("not-measured") }).strict(),
    construction: z.object({ totalMillis: z.number().int().nonnegative(), modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
    runAndCheck: z.object({ totalMillis: z.number().int().nonnegative() }).strict(),
    humanModification: z.object({ totalMinutes: z.number().nonnegative(), historicalBackfill: z.literal(false) }).strict(),
  }).strict(),
  firstRunImmutable: z.literal(true),
  evidenceBoundary: z.object({
    completesOriginalQ1: z.literal(false),
    provesHumanAgreement: z.literal(false),
    provesClassificationAccuracy: z.literal(false),
    provesReliability: z.literal(false),
    provesHumanSavings: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const ids = report.rows.map((row) => row.rowId);
  if (new Set(ids).size !== 8) {
    context.addIssue({ code: "custom", path: ["rows"], message: "first-run report requires 8 unique denominator rows" });
  }
  const outcomeCount = (outcome: ApiTesterProspectiveObservedRow["actual"]["outcome"]) =>
    report.rows.filter((row) => row.actual.outcome === outcome).length;
  const expected = {
    accepted: outcomeCount("accepted"),
    rejected: outcomeCount("rejected"),
    checkerFailed: outcomeCount("checker-failed"),
    infrastructureFailed: outcomeCount("infrastructure-failed"),
  };
  if (Object.entries(expected).some(([key, value]) => report.denominator[key as keyof typeof expected] !== value)
    || Object.values(expected).reduce((sum, value) => sum + value, 0) !== 8) {
    context.addIssue({ code: "custom", path: ["denominator"], message: "first-run outcome denominator drift" });
  }
});
export type ApiTesterProspectiveFirstRunReport = z.infer<typeof ApiTesterProspectiveFirstRunReportSchema>;

function countOutcomes(rows: ApiTesterProspectiveObservedRow[]): z.infer<typeof OutcomeCountsSchema> {
  return {
    accepted: rows.filter((row) => row.actual.outcome === "accepted").length,
    rejected: rows.filter((row) => row.actual.outcome === "rejected").length,
    checkerFailed: rows.filter((row) => row.actual.outcome === "checker-failed").length,
    infrastructureFailed: rows.filter((row) => row.actual.outcome === "infrastructure-failed").length,
  };
}

export function buildApiTesterProspectiveFirstRunReport(options: {
  lock: ApiTesterProspectiveExperimentLock | unknown;
  lockSha256: string;
  freezeCommit: string;
  candidateSha256: string;
  rows: ApiTesterProspectiveObservedRow[] | unknown[];
}): ApiTesterProspectiveFirstRunReport {
  const lock = ApiTesterProspectiveExperimentLockSchema.parse(options.lock);
  const rows = options.rows.map((row) => ProspectiveObservedRowSchema.parse(row));
  if (rows.length !== 8 || rows.some((row, index) => row.rowId !== lock.rows[index]?.rowId
    || row.inputSha256 !== lock.rows[index]?.input.sha256
    || row.bindingSha256 !== lock.rows[index]?.bindingSha256
    || JSON.stringify(row.prediction) !== JSON.stringify(lock.rows[index]?.prediction))) {
    throw new Error("first-run rows do not exactly cover the frozen lock denominator/order");
  }
  const outcomes = countOutcomes(rows);
  const real = countOutcomes(rows.filter((row) => row.stratum === "real-public-input"));
  const boundary = countOutcomes(rows.filter((row) => row.stratum === "synthetic-boundary"));
  return ApiTesterProspectiveFirstRunReportSchema.parse({
    schemaVersion: "skill-ir-api-tester-constructor-prospective-first-run-report/v1",
    identity: lock.identity,
    status: "completed",
    freeze: {
      commit: options.freezeCommit,
      remoteBranch: "origin/skill-ir-aot",
      lockPath: "benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/experiment-lock.json",
      lockSha256: options.lockSha256,
      candidateSha256: options.candidateSha256,
      verifiedBeforeRun: true,
    },
    denominator: { planned: 8, attempted: 8, ...outcomes },
    strata: { realPublicInputs: real, syntheticBoundaryCases: boundary },
    predictionParity: {
      exact: rows.filter((row) => row.predictionParity === "exact").length,
      outcomeOnly: rows.filter((row) => row.predictionParity === "outcome-only").length,
      mismatch: rows.filter((row) => row.predictionParity === "mismatch").length,
    },
    rows,
    costs: {
      aiAnalysis: { status: "not-measured" },
      construction: {
        totalMillis: rows.reduce((sum, row) => sum + row.costs.constructionMillis, 0),
        modelCalls: 0,
        apiCalls: 0,
        paidCalls: 0,
      },
      runAndCheck: { totalMillis: rows.reduce((sum, row) => sum + row.costs.runAndCheckMillis, 0) },
      humanModification: {
        totalMinutes: rows.reduce((sum, row) => sum + row.costs.humanModificationMinutes, 0),
        historicalBackfill: false,
      },
    },
    firstRunImmutable: true,
    evidenceBoundary: {
      completesOriginalQ1: false,
      provesHumanAgreement: false,
      provesClassificationAccuracy: false,
      provesReliability: false,
      provesHumanSavings: false,
      changesReadiness: false,
    },
    claimBoundary: "This immutable development first run reports admission, rejection, checker, and infrastructure outcomes for the frozen four-real-plus-four-boundary panel only. It does not complete Q1, estimate reliability, establish human savings, or change readiness.",
  });
}

async function git(rootDir: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(["git", "-c", `safe.directory=${rootDir.replaceAll("\\", "/")}`, ...args], {
    cwd: rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function gitFileAtCommit(rootDir: string, commit: string, path: string): Promise<Uint8Array> {
  const result = await git(rootDir, ["show", `${commit}:${SafeRelativePathSchema.parse(path)}`]);
  if (result.exitCode !== 0) throw new Error(`freeze commit does not contain ${path}: ${result.stderr.trim()}`);
  return Buffer.from(result.stdout, "utf8");
}

export async function verifyApiTesterProspectiveFreeze(options: {
  rootDir: string;
  lockPath: string;
  freezeCommit: string;
}): Promise<{
  lock: ApiTesterProspectiveExperimentLock;
  lockSha256: string;
  candidate: ApiTesterConstructorCandidate;
  candidateSha256: string;
  freezeCommit: string;
}> {
  const rootDir = resolve(options.rootDir);
  const freezeCommit = GitCommitSchema.parse(options.freezeCommit);
  const lockPath = SafeRelativePathSchema.parse(options.lockPath);
  const lockBytes = await readFile(contained(rootDir, lockPath));
  const lock = ApiTesterProspectiveExperimentLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  const lockSha256 = sha256(lockBytes);
  const commitCheck = await git(rootDir, ["rev-parse", "--verify", `${freezeCommit}^{commit}`]);
  if (commitCheck.exitCode !== 0 || commitCheck.stdout.trim() !== freezeCommit) {
    throw new Error("freeze commit is not the requested full commit identity");
  }
  const remoteCheck = await git(rootDir, ["merge-base", "--is-ancestor", freezeCommit, "origin/skill-ir-aot"]);
  if (remoteCheck.exitCode !== 0) throw new Error("freeze commit is not present on origin/skill-ir-aot");
  const frozenLockBytes = await gitFileAtCommit(rootDir, freezeCommit, lockPath);
  if (sha256(frozenLockBytes) !== lockSha256) throw new Error("working lock differs from freeze commit");

  const candidatePath = lock.candidate.path;
  const candidateBytes = await readFile(contained(rootDir, candidatePath));
  const candidateSha256 = sha256(candidateBytes);
  if (candidateSha256 !== lock.candidate.sha256) throw new Error("candidate snapshot digest drift");
  const frozenCandidateBytes = await gitFileAtCommit(rootDir, freezeCommit, candidatePath);
  if (sha256(frozenCandidateBytes) !== candidateSha256) throw new Error("candidate snapshot differs from freeze commit");
  const candidate = ApiTesterConstructorCandidateSchema.parse(JSON.parse(candidateBytes.toString("utf8")));
  for (const source of candidate.sourceClosure) {
    if (sha256(await readFile(contained(rootDir, source.path))) !== source.sha256) {
      throw new Error(`candidate source closure digest drift: ${source.role}`);
    }
  }
  for (const row of lock.rows) {
    const frozenBinding = await gitFileAtCommit(rootDir, freezeCommit, row.bindingPath);
    if (sha256(frozenBinding) !== row.bindingSha256) throw new Error(`binding not frozen at commit: ${row.rowId}`);
    if (row.stratum === "synthetic-boundary") {
      const frozenInput = await gitFileAtCommit(rootDir, freezeCommit, row.input.path);
      if (sha256(frozenInput) !== row.input.sha256) throw new Error(`boundary input not frozen at commit: ${row.rowId}`);
    }
  }
  return { lock, lockSha256, candidate, candidateSha256, freezeCommit };
}

function elapsedMillis(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

function sanitizeError(error: unknown, replacements: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const replacement of replacements.filter(Boolean)) {
    message = message.replaceAll(replacement, "<path>").replaceAll(replacement.replaceAll("\\", "/"), "<path>");
  }
  return message.slice(0, 2000) || "unknown error";
}

function parity(
  prediction: ApiTesterProspectiveExperimentLock["rows"][number]["prediction"],
  actual: ApiTesterProspectiveObservedRow["actual"],
): ApiTesterProspectiveObservedRow["predictionParity"] {
  if (actual.outcome === "rejected" && actual.rejectionCode === prediction.rejectionCode) return "exact";
  if (actual.outcome === "rejected") return "outcome-only";
  return "mismatch";
}

export async function runApiTesterProspectiveFirstRun(options: {
  rootDir: string;
  cacheRoot: string;
  lockPath: string;
  freezeCommit: string;
  outPath: string;
  nodeExecutable: string;
}): Promise<ApiTesterProspectiveFirstRunReport> {
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const outPath = resolve(options.outPath);
  const freeze = await verifyApiTesterProspectiveFreeze({
    rootDir,
    lockPath: options.lockPath,
    freezeCommit: options.freezeCommit,
  });
  await verifyApiTesterProspectiveInputs({ rootDir, cacheRoot, lock: freeze.lock });
  const executionRoot = await mkdtemp(join(tmpdir(), "skvm-api-prospective-"));
  const observedRows: ApiTesterProspectiveObservedRow[] = [];
  try {
    for (const row of freeze.lock.rows) {
      const workDir = join(executionRoot, row.rowId, "workdir");
      const rowOutDir = join(executionRoot, row.rowId, "output");
      const sourcePath = row.stratum === "real-public-input"
        ? contained(cacheRoot, row.input.path)
        : contained(rootDir, row.input.path);
      const workInputPath = contained(workDir, row.input.path);
      await mkdir(dirname(workInputPath), { recursive: true });
      await copyFile(sourcePath, workInputPath);
      let constructionMillis = 0;
      let runAndCheckMillis = 0;
      let actual: ApiTesterProspectiveObservedRow["actual"];
      const constructionStarted = performance.now();
      try {
        const prepared = await prepareApiTesterProductionArtifact({
          rootDir,
          bindingPath: row.bindingPath,
          workDir,
          outDir: rowOutDir,
        });
        constructionMillis = elapsedMillis(constructionStarted);
        const runStarted = performance.now();
        try {
          const result = await executeApiTesterProductionArtifact({
            packageDir: prepared.packageDir,
            workDir,
            outDir: rowOutDir,
            nodeExecutable: options.nodeExecutable,
          });
          runAndCheckMillis = elapsedMillis(runStarted);
          actual = {
            outcome: "accepted",
            rejectionCode: null,
            error: null,
            artifact: {
              packageManifestSha256: result.package.manifestSha256,
              generatorSha256: result.package.generator.sha256,
              checkerSha256: result.package.checker.sha256,
              planSha256: result.outputs.plan.sha256,
              reportSha256: result.outputs.report.sha256,
              validationReportSha256: result.outputs.validationReport.sha256,
            },
            checkerStatus: "pass",
          };
        } catch (error) {
          runAndCheckMillis = elapsedMillis(runStarted);
          const checkerFailure = /checker|validation/iu.test(error instanceof Error ? error.message : String(error));
          actual = {
            outcome: checkerFailure ? "checker-failed" : "infrastructure-failed",
            rejectionCode: null,
            error: sanitizeError(error, [rootDir, cacheRoot, executionRoot]),
            artifact: null,
            checkerStatus: checkerFailure ? "fail" : "not-run",
          };
        }
      } catch (error) {
        constructionMillis = elapsedMillis(constructionStarted);
        if (error instanceof ApiTesterProductionUnsupportedError) {
          actual = {
            outcome: "rejected",
            rejectionCode: error.code,
            error: null,
            artifact: null,
            checkerStatus: "not-run",
          };
        } else {
          actual = {
            outcome: "infrastructure-failed",
            rejectionCode: null,
            error: sanitizeError(error, [rootDir, cacheRoot, executionRoot]),
            artifact: null,
            checkerStatus: "not-run",
          };
        }
      }
      observedRows.push(ProspectiveObservedRowSchema.parse({
        rowId: row.rowId,
        stratum: row.stratum,
        inputSha256: row.input.sha256,
        bindingSha256: row.bindingSha256,
        prediction: row.prediction,
        actual,
        predictionParity: parity(row.prediction, actual),
        costs: {
          constructionMillis,
          runAndCheckMillis,
          humanModificationMinutes: 0,
          humanModificationNote: "No human modification occurred during the immutable first run.",
        },
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      }));
    }
    const report = buildApiTesterProspectiveFirstRunReport({
      lock: freeze.lock,
      lockSha256: freeze.lockSha256,
      freezeCommit: freeze.freezeCommit,
      candidateSha256: freeze.candidateSha256,
      rows: observedRows,
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, jsonText(report), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
