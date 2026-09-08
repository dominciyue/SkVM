import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { SafeRelativePathSchema } from "./artifact-package";
import { ArtifactPresetResultSchema } from "../../skill-ir/verified-artifact-presets";
import {
  API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2,
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
  ApiTesterProductionBindingSchemaV2,
} from "../../skill-ir/api-tester-production-contract-v2";

export const API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY =
  "skill-ir-api-tester-constructor-candidate-v2-001" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY =
  "skill-ir-api-tester-v2-feature-migration-001" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_IDENTITY =
  "skill-ir-api-tester-v2-feature-migration-002" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_ASSET_PATH =
  "benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_PANEL_PATH =
  "benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-002" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH =
  "benchmarks/skill-ir/classification/api-tester-constructor-candidate-v2.json" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH =
  `${API_TESTER_V2_FEATURE_MIGRATION_PANEL_PATH}/experiment-lock.json` as const;
export const API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH =
  `${API_TESTER_V2_FEATURE_MIGRATION_ASSET_PATH}/source-selection.json` as const;
export const API_TESTER_V2_FEATURE_MIGRATION_RESULT_PATH =
  "results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json" as const;
export const API_TESTER_V2_FEATURE_MIGRATION_PREDECESSOR_FAILURE_PATH =
  "results/skill-ir/api-tester-v2-feature-migration-001/preflight-failure.json" as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const RowIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u);
const PrimaryFeatureSchema = z.enum([
  "local-component-ref",
  "body-primitive-array",
  "query-form-explode",
]);
const RowFeatureSchema = z.union([PrimaryFeatureSchema, z.literal("declared-rejection-boundary")]);
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

export const ApiTesterV2FeatureMigrationPreflightFailureSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-v2-feature-migration-preflight-failure/v1"),
  identity: z.literal("skill-ir-api-tester-v2-feature-migration-001-preflight-failure-001"),
  experimentIdentity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY),
  status: z.literal("blocked-before-row-execution"),
  attemptedAt: z.string().datetime(),
  freeze: z.object({
    commit: z.literal("8b59a6905c5b17448b82aafca558990fd8295023"),
    remoteBranch: z.literal("origin/skill-ir-aot"),
    candidateSha256: Sha256Schema,
    lockSha256: Sha256Schema,
    selectionSha256: Sha256Schema,
  }).strict(),
  failure: z.object({
    code: z.literal("CHECKOUT_REPRESENTATION_COMPARISON_BUG"),
    failedCheck: z.literal("candidate-execution-surface-git-blob-byte-equality"),
    role: z.literal("top-level-shim"),
    path: z.literal("bin/skvm.js"),
    candidateWorkingTree: z.object({ bytes: z.literal(1300), sha256: Sha256Schema, lineEndings: z.literal("1-crlf-plus-28-lf") }).strict(),
    gitBlob: z.object({ bytes: z.literal(1299), sha256: Sha256Schema, lineEndings: z.literal("29-lf") }).strict(),
    gitFilteredRepresentation: z.object({ bytes: z.literal(1328), sha256: Sha256Schema, lineEndings: z.literal("29-crlf") }).strict(),
    diagnosis: z.string().min(1),
  }).strict(),
  activity: z.object({
    rowsPlanned: z.literal(10),
    rowsAttempted: z.literal(0),
    selectedInputBytesRead: z.literal(0),
    resultReportCreated: z.literal(false),
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
  disposition: z.object({
    candidateChanged: z.literal(false),
    inputSetChanged: z.literal(false),
    predictionsChanged: z.literal(false),
    lockOverwritten: z.literal(false),
    resultOverwritten: z.literal(false),
    successorExperimentIdentity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

const PredictionSchema = z.object({
  expectedOutcome: z.enum(["accepted", "rejected"]),
  rejectionCode: RejectionCodeSchema.nullable(),
  expectedCheckerStatus: z.enum(["pass", "not-run"]),
  basis: z.string().min(1),
}).strict().superRefine((prediction, context) => {
  if (prediction.expectedOutcome === "accepted") {
    if (prediction.rejectionCode !== null || prediction.expectedCheckerStatus !== "pass") {
      context.addIssue({ code: "custom", message: "accepted prediction requires checker pass and no rejection code" });
    }
  } else if (prediction.rejectionCode === null || prediction.expectedCheckerStatus !== "not-run") {
    context.addIssue({ code: "custom", message: "rejected prediction requires a rejection code and checker not-run" });
  }
});

const SourceInventorySchema = z.object({
  openapiVersion: z.string().regex(/^3\./u),
  pathCount: z.number().int().positive(),
  localComponentRefs: z.number().int().nonnegative(),
  bodyPrimitiveArrays: z.number().int().nonnegative(),
  queryFormExplodePrimitiveArrays: z.number().int().nonnegative(),
  primaryLocator: z.string().min(1),
}).strict();

const UpstreamSchema = z.object({
  repository: z.string().url(),
  commit: GitCommitSchema,
  repositoryPath: SafeRelativePathSchema,
  rawUrl: z.string().url(),
}).strict();

const LicenseSchema = z.object({
  summary: z.string().min(1),
  cachePath: SafeRelativePathSchema,
  repositoryPath: SafeRelativePathSchema,
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  rawUrl: z.string().url(),
}).strict();

const SelectedSourceSchema = z.object({
  rowId: RowIdSchema,
  primaryFeature: PrimaryFeatureSchema,
  secondaryFeatures: z.array(PrimaryFeatureSchema),
  format: z.enum(["json", "yaml"]),
  cachePath: SafeRelativePathSchema,
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  upstream: UpstreamSchema,
  license: LicenseSchema,
  inventory: SourceInventorySchema,
  inclusionReason: z.string().min(1),
  prediction: PredictionSchema,
  reviewedWithoutCandidateExecution: z.literal(true),
}).strict().superRefine((source, context) => {
  if (new Set(source.secondaryFeatures).size !== source.secondaryFeatures.length
    || source.secondaryFeatures.includes(source.primaryFeature)) {
    context.addIssue({ code: "custom", path: ["secondaryFeatures"], message: "secondary features must be unique and exclude primary" });
  }
  const count = source.primaryFeature === "local-component-ref"
    ? source.inventory.localComponentRefs
    : source.primaryFeature === "body-primitive-array"
      ? source.inventory.bodyPrimitiveArrays
      : source.inventory.queryFormExplodePrimitiveArrays;
  if (count < 1) context.addIssue({ code: "custom", path: ["inventory"], message: "primary feature must have structural evidence" });
});

export const ApiTesterV2FeatureMigrationSelectionSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-v2-feature-selection/v1"),
  identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY),
  selectedAt: z.string().datetime(),
  method: z.literal("public-structural-review-no-constructor-trial"),
  sampling: z.object({
    random: z.literal(false),
    featureDirected: z.literal(true),
    realInputTarget: z.literal(6),
    independentRepositoryTarget: z.literal(6),
    primaryStrata: z.object({
      "local-component-ref": z.literal(2),
      "body-primitive-array": z.literal(2),
      "query-form-explode": z.literal(2),
    }).strict(),
    oneInputCountsOnce: z.literal(true),
    ecosystemAdmissionRateClaim: z.literal(false),
  }).strict(),
  forbiddenReuse: z.object({
    exposedInputs: z.array(z.string().min(1)).length(4),
    existingApiTesterFixtures: z.literal(true),
    heldOut: z.literal(true),
    q1ProspectiveReservation: z.literal(true),
  }).strict(),
  selected: z.array(SelectedSourceSchema).length(6),
  excludedCandidates: z.array(z.object({
    repository: z.string().url(),
    commit: GitCommitSchema,
    repositoryPath: SafeRelativePathSchema,
    reason: z.string().min(1),
  }).strict()).min(1),
  audit: z.object({
    constructorTrialsOnSelectedInputs: z.literal(0),
    artifactTrialsOnSelectedInputs: z.literal(0),
    cliTrialsOnSelectedInputs: z.literal(0),
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((selection, context) => {
  const ids = selection.selected.map((source) => source.rowId);
  const repositories = selection.selected.map((source) => source.upstream.repository.toLowerCase());
  const cachePaths = selection.selected.map((source) => source.cachePath);
  if (new Set(ids).size !== 6 || new Set(repositories).size !== 6 || new Set(cachePaths).size !== 6) {
    context.addIssue({ code: "custom", path: ["selected"], message: "selection requires six unique rows, repositories, and cache paths" });
  }
  for (const feature of PrimaryFeatureSchema.options) {
    if (selection.selected.filter((source) => source.primaryFeature === feature).length !== 2) {
      context.addIssue({ code: "custom", path: ["selected"], message: `selection requires two ${feature} rows` });
    }
  }
  const forbidden = selection.forbiddenReuse.exposedInputs.map((value) => value.toLowerCase());
  if (selection.selected.some((source) => forbidden.some((value) =>
    `${source.upstream.repository}/${source.upstream.repositoryPath}`.toLowerCase().includes(value)))) {
    context.addIssue({ code: "custom", path: ["selected"], message: "selection reuses an exposed input" });
  }
});
export type ApiTesterV2FeatureMigrationSelection = z.infer<typeof ApiTesterV2FeatureMigrationSelectionSchema>;

const ExecutionSurfaceEntrySchema = z.object({
  role: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  path: SafeRelativePathSchema,
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
}).strict();

const REQUIRED_EXECUTION_SURFACE = [
  ["top-level-shim", "bin/skvm.js"],
  ["top-level-route", "bin/skvm-route.js"],
  ["artifact-cli", "src/cli/artifact.ts"],
  ["preset-dispatch", "src/skill-ir/verified-artifact-presets.ts"],
  ["v2-contract", "src/skill-ir/api-tester-production-contract-v2.ts"],
  ["v2-program-generator-checker", "src/skill-ir/api-tester-production-programs-v2.ts"],
  ["v2-artifact-runner", "src/skill-ir/api-tester-production-artifact-v2.ts"],
  ["v1-shared-rejection-type", "src/skill-ir/api-tester-production-contract.ts"],
  ["safe-path-helper", "src/benchmarks/skill-ir/artifact-package.ts"],
  ["digest-helper", "src/benchmarks/skill-ir/source-fixture.ts"],
  ["dependency-manifest", "package.json"],
  ["dependency-lock", "bun.lock"],
] as const;

export const ApiTesterV2FeatureMigrationCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-constructor-candidate/v2"),
  identity: z.literal(API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY),
  frozenAt: z.literal("2026-09-08T11:00:00.000Z"),
  implementationIdentity: z.literal("skill-ir-api-tester-production-binding-successor-development-001"),
  bindingSchemaVersion: z.literal(API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  productInvocation: z.literal("node bin/skvm.js artifact --preset=api-tester --binding=<binding>"),
  executionSurface: z.array(ExecutionSurfaceEntrySchema).length(REQUIRED_EXECUTION_SURFACE.length),
  runtime: z.object({
    bun: z.string().min(1),
    node: z.string().min(1),
    dependencyResolution: z.literal("package.json-plus-bun.lock-digest-bound"),
  }).strict(),
  supportedFeatures: z.array(z.string().min(1)).min(1),
  rejectedFeatures: z.array(z.string().min(1)).min(1),
  checkerBoundary: z.string().min(1),
  evidenceBoundary: z.object({
    developmentOnly: z.literal(true),
    fullOpenApiValidator: z.literal(false),
    explicitExecutionSurfaceNotGeneralModuleGraph: z.literal(true),
    changesV1: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((candidate, context) => {
  const paths = candidate.executionSurface.map((entry) => entry.path);
  if (new Set(paths).size !== REQUIRED_EXECUTION_SURFACE.length
    || REQUIRED_EXECUTION_SURFACE.some(([, path]) => !paths.includes(path))) {
    context.addIssue({ code: "custom", path: ["executionSurface"], message: "candidate execution surface drift" });
  }
});
export type ApiTesterV2FeatureMigrationCandidate = z.infer<typeof ApiTesterV2FeatureMigrationCandidateSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function digestFile(path: string): Promise<{ bytes: number; sha256: string }> {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function contained(baseDirectory: string, relativePath: string): string {
  const base = resolve(baseDirectory);
  const target = resolve(base, SafeRelativePathSchema.parse(relativePath));
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error(`path escapes base directory: ${relativePath}`);
  return target;
}

function containedAbsolute(baseDirectory: string, targetPath: string): string {
  const base = resolve(baseDirectory);
  const target = resolve(targetPath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`) || isAbsolute(fromBase)) {
    throw new Error(`path escapes root: ${targetPath}`);
  }
  return target;
}

export function inspectPublicOpenApiStructure(text: string, format: "json" | "yaml"): {
  openapiVersion: string;
  pathCount: number;
  localComponentRefs: { count: number; locators: string[] };
  bodyPrimitiveArrays: { count: number; locators: string[] };
  queryFormExplodePrimitiveArrays: { count: number; locators: string[] };
} {
  const document = format === "json" ? JSON.parse(text) : parseYaml(text);
  if (!isRecord(document) || typeof document.openapi !== "string" || !document.openapi.startsWith("3.")
    || !isRecord(document.paths) || Object.keys(document.paths).length < 1) {
    throw new Error("structural inventory requires OpenAPI 3.x with non-empty paths");
  }
  const refs: string[] = [];
  const bodyArrays: string[] = [];
  const queryArrays: string[] = [];
  const walk = (value: unknown, locator: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${locator}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.$ref === "string" && /^#\/components\/(?:parameters|requestBodies|schemas|securitySchemes)\//u.test(value.$ref)) {
      refs.push(locator);
    }
    if (value.in === "query" && isRecord(value.schema) && value.schema.type === "array"
      && (value.style === undefined || value.style === "form") && (value.explode === undefined || value.explode === true)
      && isRecord(value.schema.items) && ["string", "integer", "number", "boolean"].includes(String(value.schema.items.type))) {
      queryArrays.push(locator);
    }
    if (isRecord(value.requestBody) && isRecord(value.requestBody.content)
      && isRecord(value.requestBody.content["application/json"])) {
      const media = value.requestBody.content["application/json"];
      const schema = isRecord(media) ? media.schema : undefined;
      if (isRecord(schema) && schema.type === "object" && isRecord(schema.properties)) {
        for (const [name, property] of Object.entries(schema.properties)) {
          if (isRecord(property) && property.type === "array" && isRecord(property.items)
            && ["string", "integer", "number", "boolean"].includes(String(property.items.type))) {
            bodyArrays.push(`${locator}.requestBody.content.application/json.schema.properties.${name}`);
          }
        }
      }
    }
    for (const [key, entry] of Object.entries(value)) walk(entry, `${locator}.${key}`);
  };
  walk(document, "$");
  return {
    openapiVersion: document.openapi,
    pathCount: Object.keys(document.paths).length,
    localComponentRefs: { count: refs.length, locators: refs.slice(0, 20) },
    bodyPrimitiveArrays: { count: bodyArrays.length, locators: bodyArrays.slice(0, 20) },
    queryFormExplodePrimitiveArrays: { count: queryArrays.length, locators: queryArrays.slice(0, 20) },
  };
}

export async function buildApiTesterV2FeatureMigrationCandidate(options: {
  rootDir: string;
  bunVersion: string;
  nodeVersion: string;
}): Promise<ApiTesterV2FeatureMigrationCandidate> {
  const rootDir = resolve(options.rootDir);
  const executionSurface = await Promise.all(REQUIRED_EXECUTION_SURFACE.map(async ([role, path]) => ({
    role,
    path,
    ...await digestFile(contained(rootDir, path)),
  })));
  return ApiTesterV2FeatureMigrationCandidateSchema.parse({
    schemaVersion: "skill-ir-api-tester-constructor-candidate/v2",
    identity: API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY,
    frozenAt: "2026-09-08T11:00:00.000Z",
    implementationIdentity: "skill-ir-api-tester-production-binding-successor-development-001",
    bindingSchemaVersion: API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    productInvocation: "node bin/skvm.js artifact --preset=api-tester --binding=<binding>",
    executionSurface,
    runtime: {
      bun: options.bunVersion,
      node: options.nodeVersion,
      dependencyResolution: "package.json-plus-bun.lock-digest-bound",
    },
    supportedFeatures: [
      "bounded same-document component refs in consumed parameter, request-body, schema, and security-scheme slots",
      "query primitive arrays with style=form and boolean explode, including repeated-value encoding",
      "application/json object request bodies with primitive scalar or primitive-array properties",
      "bounded scalar constraints plus date, float, and double annotations",
      "bearer HTTP and header API-key security with explicit response witnesses",
      "deterministic generation plus independent public-contract checking",
    ],
    rejectedFeatures: [
      "external, unresolved, cyclic, wrong-kind, sibling, and path-item refs",
      "nested, object-item, path, or header arrays and composed schemas",
      "non-form query array serialization and unsupported scalar formats or schema keywords",
      "non-application/json or non-object request bodies",
      "non-explicit response status keys and unsupported security scopes or schemes",
    ],
    checkerBoundary: "The standalone v2 checker validates the normalized public contract and generated evidence; it does not parse arbitrary OpenAPI, import the generator, or compare gold plan bytes.",
    evidenceBoundary: {
      developmentOnly: true,
      fullOpenApiValidator: false,
      explicitExecutionSurfaceNotGeneralModuleGraph: true,
      changesV1: false,
      changesReadiness: false,
    },
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
  });
}

const FrozenInputSchema = z.object({
  storage: z.enum(["external-cache", "repository"]),
  cachePath: SafeRelativePathSchema.nullable(),
  repositoryPath: SafeRelativePathSchema.nullable(),
  format: z.enum(["json", "yaml"]),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  upstream: UpstreamSchema.nullable(),
  license: LicenseSchema.nullable(),
}).strict().superRefine((input, context) => {
  if (input.storage === "external-cache") {
    if (!input.cachePath || input.repositoryPath || !input.upstream || !input.license) {
      context.addIssue({ code: "custom", message: "external input requires cache/upstream/license only" });
    }
  } else if (input.cachePath || !input.repositoryPath || input.upstream || input.license) {
    context.addIssue({ code: "custom", message: "repository input requires repositoryPath only" });
  }
});

const LockRowSchema = z.object({
  rowId: RowIdSchema,
  stratum: z.enum(["real-public-input", "synthetic-boundary"]),
  primaryFeature: RowFeatureSchema,
  secondaryFeatures: z.array(PrimaryFeatureSchema),
  input: FrozenInputSchema,
  bindingPath: SafeRelativePathSchema,
  binding: ApiTesterProductionBindingSchemaV2,
  bindingSha256: Sha256Schema,
  prediction: PredictionSchema,
}).strict();

export const ApiTesterV2FeatureMigrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-v2-feature-migration-lock/v2"),
  identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY),
  frozenAt: z.literal("2026-09-08T11:40:00.000Z"),
  candidate: z.object({
    identity: z.literal(API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY),
    path: z.literal(API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH),
    sha256: Sha256Schema,
  }).strict(),
  selection: z.object({
    identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY),
    path: z.literal(API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH),
    sha256: Sha256Schema,
  }).strict(),
  predecessorPreflight: z.object({
    experimentIdentity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY),
    freezeCommit: z.literal("8b59a6905c5b17448b82aafca558990fd8295023"),
    reportPath: z.literal(API_TESTER_V2_FEATURE_MIGRATION_PREDECESSOR_FAILURE_PATH),
    reportSha256: Sha256Schema,
    rowsAttempted: z.literal(0),
    selectedInputBytesRead: z.literal(0),
  }).strict(),
  executionHarness: z.array(z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()).length(3),
  selectionRule: z.object({
    method: z.literal("public-structural-review-no-constructor-trial"),
    sixIndependentRepositories: z.literal(true),
    exactPrimaryStrata: z.literal("2-local-ref+2-body-array+2-query-form-explode"),
    oneInputCountsOnce: z.literal(true),
    randomSample: z.literal(false),
    ecosystemAdmissionRateClaim: z.literal(false),
  }).strict(),
  denominator: z.object({
    realPublicInputs: z.literal(6),
    syntheticBoundaryCases: z.literal(4),
    total: z.literal(10),
  }).strict(),
  result: z.object({
    path: z.literal(API_TESTER_V2_FEATURE_MIGRATION_RESULT_PATH),
    writeMode: z.literal("exclusive-create-once"),
  }).strict(),
  executionPolicy: z.object({
    attemptsPerRow: z.literal(1),
    retries: z.literal(0),
    replacements: z.literal(0),
    candidateFixes: z.literal(0),
    route: z.literal("node-bin-skvm-js-artifact-binding"),
    retainAllOutcomesInDenominator: z.literal(true),
  }).strict(),
  costContract: z.object({
    historicalDevelopmentAgentTokens: z.literal(467220),
    historicalDevelopmentCostSeparateFromRuntime: z.literal(true),
    perRowMilestones: z.tuple([
      z.literal("input-materialization"),
      z.literal("construction"),
      z.literal("generation"),
      z.literal("checking"),
      z.literal("evidence-analysis"),
    ]),
    unavailableOrCoalescedTimingExplicit: z.literal(true),
    humanModificationHistoricalBackfill: z.literal(false),
  }).strict(),
  rows: z.array(LockRowSchema).length(10),
  resultState: z.literal("not-run"),
  claimBoundary: z.string().min(1),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((lock, context) => {
  const ids = lock.rows.map((row) => row.rowId);
  if (new Set(ids).size !== 10
    || lock.rows.filter((row) => row.stratum === "real-public-input").length !== 6
    || lock.rows.filter((row) => row.stratum === "synthetic-boundary").length !== 4) {
    context.addIssue({ code: "custom", path: ["rows"], message: "lock denominator must remain 6 real plus 4 boundary = 10" });
  }
});
export type ApiTesterV2FeatureMigrationLock = z.infer<typeof ApiTesterV2FeatureMigrationLockSchema>;

const BOUNDARY_ROWS = [
  { rowId: "boundary-external-schema-ref", file: "external-schema-ref.json", code: "UNSUPPORTED_REFERENCE" as const, basis: "External schema references are outside the bounded same-document resolver." },
  { rowId: "boundary-nested-array-items", file: "nested-array-items.json", code: "UNSUPPORTED_SCHEMA" as const, basis: "Array items must be primitive scalar schemas, not objects." },
  { rowId: "boundary-query-space-delimited", file: "query-space-delimited.json", code: "UNSUPPORTED_PARAMETER" as const, basis: "Query primitive arrays support style=form only." },
  { rowId: "boundary-composed-body", file: "composed-body.json", code: "UNSUPPORTED_REQUEST_BODY" as const, basis: "Composed request-body schemas are outside the v2 object-property contract." },
] as const;

const HARNESS_PATHS = [
  "src/benchmarks/skill-ir/api-tester-v2-feature-migration.ts",
  "src/benchmarks/skill-ir/api-tester-v2-feature-migration-freeze-run.ts",
  "src/benchmarks/skill-ir/api-tester-v2-feature-migration-first-run.ts",
] as const;

async function readBinding(rootDir: string, rowId: string) {
  const path = `${API_TESTER_V2_FEATURE_MIGRATION_ASSET_PATH}/bindings/${rowId}.json`;
  const bytes = await readFile(contained(rootDir, path));
  return {
    path,
    binding: ApiTesterProductionBindingSchemaV2.parse(JSON.parse(bytes.toString("utf8"))),
    sha256: sha256(bytes),
  };
}

export async function buildApiTesterV2FeatureMigrationLock(options: {
  rootDir: string;
  candidate: ApiTesterV2FeatureMigrationCandidate | unknown;
  selection: ApiTesterV2FeatureMigrationSelection | unknown;
}): Promise<ApiTesterV2FeatureMigrationLock> {
  const rootDir = resolve(options.rootDir);
  const candidate = ApiTesterV2FeatureMigrationCandidateSchema.parse(options.candidate);
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(options.selection);
  const candidateBytes = await readFile(contained(rootDir, API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH));
  if (JSON.stringify(ApiTesterV2FeatureMigrationCandidateSchema.parse(JSON.parse(candidateBytes.toString("utf8")))) !== JSON.stringify(candidate)) {
    throw new Error("candidate differs from committed snapshot bytes");
  }
  const selectionBytes = await readFile(contained(rootDir, API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH));
  if (JSON.stringify(ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")))) !== JSON.stringify(selection)) {
    throw new Error("selection differs from source-selection bytes");
  }
  const realRows = await Promise.all(selection.selected.map(async (source) => {
    const binding = await readBinding(rootDir, source.rowId);
    if (binding.binding.input.format !== source.format) throw new Error(`binding format drift: ${source.rowId}`);
    return LockRowSchema.parse({
      rowId: source.rowId,
      stratum: "real-public-input",
      primaryFeature: source.primaryFeature,
      secondaryFeatures: source.secondaryFeatures,
      input: {
        storage: "external-cache",
        cachePath: source.cachePath,
        repositoryPath: null,
        format: source.format,
        bytes: source.bytes,
        sha256: source.sha256,
        upstream: source.upstream,
        license: source.license,
      },
      bindingPath: binding.path,
      binding: binding.binding,
      bindingSha256: binding.sha256,
      prediction: source.prediction,
    });
  }));
  const boundaryRows = await Promise.all(BOUNDARY_ROWS.map(async (source) => {
    const path = `${API_TESTER_V2_FEATURE_MIGRATION_ASSET_PATH}/boundary/${source.file}`;
    const binding = await readBinding(rootDir, source.rowId);
    return LockRowSchema.parse({
      rowId: source.rowId,
      stratum: "synthetic-boundary",
      primaryFeature: "declared-rejection-boundary",
      secondaryFeatures: [],
      input: {
        storage: "repository",
        cachePath: null,
        repositoryPath: path,
        format: "json",
        ...await digestFile(contained(rootDir, path)),
        upstream: null,
        license: null,
      },
      bindingPath: binding.path,
      binding: binding.binding,
      bindingSha256: binding.sha256,
      prediction: {
        expectedOutcome: "rejected",
        rejectionCode: source.code,
        expectedCheckerStatus: "not-run",
        basis: source.basis,
      },
    });
  }));
  const executionHarness = await Promise.all(HARNESS_PATHS.map(async (path) => ({
    path,
    sha256: sha256(await readFile(contained(rootDir, path))),
  })));
  const predecessorFailureBytes = await readFile(contained(rootDir, API_TESTER_V2_FEATURE_MIGRATION_PREDECESSOR_FAILURE_PATH));
  ApiTesterV2FeatureMigrationPreflightFailureSchema.parse(JSON.parse(predecessorFailureBytes.toString("utf8")));
  return ApiTesterV2FeatureMigrationLockSchema.parse({
    schemaVersion: "skill-ir-api-tester-v2-feature-migration-lock/v2",
    identity: API_TESTER_V2_FEATURE_MIGRATION_IDENTITY,
    frozenAt: "2026-09-08T11:40:00.000Z",
    candidate: {
      identity: candidate.identity,
      path: API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH,
      sha256: sha256(candidateBytes),
    },
    selection: {
      identity: API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
      path: API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH,
      sha256: sha256(selectionBytes),
    },
    predecessorPreflight: {
      experimentIdentity: API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
      freezeCommit: "8b59a6905c5b17448b82aafca558990fd8295023",
      reportPath: API_TESTER_V2_FEATURE_MIGRATION_PREDECESSOR_FAILURE_PATH,
      reportSha256: sha256(predecessorFailureBytes),
      rowsAttempted: 0,
      selectedInputBytesRead: 0,
    },
    executionHarness,
    selectionRule: {
      method: "public-structural-review-no-constructor-trial",
      sixIndependentRepositories: true,
      exactPrimaryStrata: "2-local-ref+2-body-array+2-query-form-explode",
      oneInputCountsOnce: true,
      randomSample: false,
      ecosystemAdmissionRateClaim: false,
    },
    denominator: { realPublicInputs: 6, syntheticBoundaryCases: 4, total: 10 },
    result: {
      path: API_TESTER_V2_FEATURE_MIGRATION_RESULT_PATH,
      writeMode: "exclusive-create-once",
    },
    executionPolicy: {
      attemptsPerRow: 1,
      retries: 0,
      replacements: 0,
      candidateFixes: 0,
      route: "node-bin-skvm-js-artifact-binding",
      retainAllOutcomesInDenominator: true,
    },
    costContract: {
      historicalDevelopmentAgentTokens: 467220,
      historicalDevelopmentCostSeparateFromRuntime: true,
      perRowMilestones: ["input-materialization", "construction", "generation", "checking", "evidence-analysis"],
      unavailableOrCoalescedTimingExplicit: true,
      humanModificationHistoricalBackfill: false,
    },
    rows: [...realRows, ...boundaryRows],
    resultState: "not-run",
    claimBoundary: "This purposive 6-real-plus-4-boundary panel measures one fixed API profile and candidate through the unified product CLI. It does not estimate ecosystem admission, prove arbitrary OpenAPI, human savings, optimized LLM behavior, new-skill onboarding, cross-profile transfer, held-out performance, portfolio status, or readiness.",
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
  });
}

async function verifyFrozenFile(path: string, expected: { bytes: number; sha256: string }, label: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const bytes = await readFile(path);
  if (bytes.byteLength !== expected.bytes) throw new Error(`${label} byte length drift`);
  if (sha256(bytes) !== expected.sha256) throw new Error(`${label} digest drift`);
}

export async function verifyApiTesterV2FeatureMigrationInputs(options: {
  rootDir: string;
  cacheRoot: string;
  lock: ApiTesterV2FeatureMigrationLock | unknown;
}): Promise<{ rows: 10; realInputs: 6; boundaryInputs: 4; licenseFiles: 6; bindingFiles: 10 }> {
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const lock = ApiTesterV2FeatureMigrationLockSchema.parse(options.lock);
  let realInputs = 0;
  let boundaryInputs = 0;
  let licenseFiles = 0;
  for (const row of lock.rows) {
    const bindingBytes = await readFile(contained(rootDir, row.bindingPath));
    const binding = ApiTesterProductionBindingSchemaV2.parse(JSON.parse(bindingBytes.toString("utf8")));
    if (sha256(bindingBytes) !== row.bindingSha256 || JSON.stringify(binding) !== JSON.stringify(row.binding)) {
      throw new Error(`binding digest or content drift: ${row.rowId}`);
    }
    if (row.stratum === "real-public-input") {
      realInputs += 1;
      if (!row.input.cachePath || !row.input.license) throw new Error(`real input binding missing: ${row.rowId}`);
      await verifyFrozenFile(contained(cacheRoot, row.input.cachePath), row.input, `real input ${row.rowId}`);
      await verifyFrozenFile(contained(cacheRoot, row.input.license.cachePath), row.input.license, `license ${row.rowId}`);
      licenseFiles += 1;
    } else {
      boundaryInputs += 1;
      if (!row.input.repositoryPath) throw new Error(`boundary path missing: ${row.rowId}`);
      await verifyFrozenFile(contained(rootDir, row.input.repositoryPath), row.input, `boundary ${row.rowId}`);
    }
  }
  if (realInputs !== 6 || boundaryInputs !== 4 || licenseFiles !== 6) throw new Error("migration input denominator drift");
  return { rows: 10, realInputs: 6, boundaryInputs: 4, licenseFiles: 6, bindingFiles: 10 };
}

const EvidenceSchema = z.object({
  cliReportSha256: Sha256Schema,
  packageManifestSha256: Sha256Schema,
  generatorSha256: Sha256Schema,
  checkerSha256: Sha256Schema,
  planSha256: Sha256Schema,
  reportSha256: Sha256Schema,
  validationReportSha256: Sha256Schema,
}).strict();

const ObservedRowSchema = z.object({
  rowId: RowIdSchema,
  stratum: z.enum(["real-public-input", "synthetic-boundary"]),
  primaryFeature: RowFeatureSchema,
  inputSha256: Sha256Schema,
  bindingSha256: Sha256Schema,
  prediction: PredictionSchema,
  actual: z.object({
    outcome: z.enum(["accepted", "rejected", "checker-failed", "infrastructure-failed"]),
    rejectionCode: RejectionCodeSchema.nullable(),
    error: z.string().min(1).nullable(),
    checkerStatus: z.enum(["pass", "fail", "not-run"]),
    evidence: EvidenceSchema.nullable(),
  }).strict(),
  predictionParity: z.enum(["exact", "outcome-only", "mismatch"]),
  adaptation: z.object({
    extraCode: z.literal(false),
    extraTemplate: z.literal(false),
    extraRule: z.literal(false),
    humanModificationMinutes: z.literal(0),
    note: z.string().min(1),
  }).strict(),
  costs: z.object({
    inputMaterializationMillis: z.number().int().nonnegative(),
    constructionMillis: z.number().int().nonnegative().nullable(),
    generationMillis: z.number().int().nonnegative().nullable(),
    checkingMillis: z.number().int().nonnegative().nullable(),
    cliEndToEndMillis: z.number().int().nonnegative(),
    evidenceAnalysisMillis: z.number().int().nonnegative(),
    observerResolutionMillis: z.literal(5),
    coalescedMilestones: z.boolean(),
  }).strict(),
  accounting: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
}).strict().superRefine((row, context) => {
  if (row.actual.outcome === "accepted") {
    if (row.actual.rejectionCode || row.actual.error || row.actual.checkerStatus !== "pass" || !row.actual.evidence) {
      context.addIssue({ code: "custom", message: "accepted row requires passing checker evidence only" });
    }
  } else if (row.actual.outcome === "rejected") {
    if (!row.actual.rejectionCode || row.actual.error || row.actual.checkerStatus !== "not-run" || row.actual.evidence) {
      context.addIssue({ code: "custom", message: "rejected row requires a rejection code only" });
    }
  } else if (row.actual.rejectionCode || !row.actual.error || row.actual.evidence) {
    context.addIssue({ code: "custom", message: "failed row requires a sanitized error only" });
  }
});
export type ApiTesterV2FeatureMigrationObservedRow = z.infer<typeof ObservedRowSchema>;

const OutcomeCountsSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  checkerFailed: z.number().int().nonnegative(),
  infrastructureFailed: z.number().int().nonnegative(),
}).strict();

export const ApiTesterV2FeatureMigrationFirstRunReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-v2-feature-migration-first-run-report/v1"),
  identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY),
  status: z.literal("completed"),
  completedAt: z.string().datetime(),
  freeze: z.object({
    commit: GitCommitSchema,
    remoteBranch: z.literal("origin/skill-ir-aot"),
    lockPath: z.literal(API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH),
    lockSha256: Sha256Schema,
    candidateSha256: Sha256Schema,
    selectionSha256: Sha256Schema,
    verifiedBeforeRun: z.literal(true),
  }).strict(),
  denominator: z.object({
    planned: z.literal(10),
    attempted: z.literal(10),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    checkerFailed: z.number().int().nonnegative(),
    infrastructureFailed: z.number().int().nonnegative(),
  }).strict(),
  strata: z.object({
    realPublicInputs: OutcomeCountsSchema,
    syntheticBoundaryCases: OutcomeCountsSchema,
  }).strict(),
  realPrimaryFeatures: z.object({
    "local-component-ref": OutcomeCountsSchema,
    "body-primitive-array": OutcomeCountsSchema,
    "query-form-explode": OutcomeCountsSchema,
  }).strict(),
  predictionParity: z.object({
    exact: z.number().int().nonnegative(),
    outcomeOnly: z.number().int().nonnegative(),
    mismatch: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(ObservedRowSchema).length(10),
  costs: z.object({
    historicalDevelopment: z.object({ agentTokens: z.literal(467220), separateFromRuntime: z.literal(true) }).strict(),
    runtime: z.object({
      inputMaterializationMillis: z.number().int().nonnegative(),
      constructionMillisObserved: z.number().int().nonnegative(),
      generationMillisObserved: z.number().int().nonnegative(),
      checkingMillisObserved: z.number().int().nonnegative(),
      cliEndToEndMillis: z.number().int().nonnegative(),
      evidenceAnalysisMillis: z.number().int().nonnegative(),
      unavailableConstructionRows: z.number().int().nonnegative(),
      unavailableGenerationRows: z.number().int().nonnegative(),
      unavailableCheckingRows: z.number().int().nonnegative(),
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
    }).strict(),
    humanModification: z.object({ totalMinutes: z.literal(0), historicalBackfill: z.literal(false) }).strict(),
  }).strict(),
  firstRunImmutable: z.literal(true),
  evidenceBoundary: z.object({
    purposiveFeatureSample: z.literal(true),
    estimatesOpenApiEcosystemAdmission: z.literal(false),
    provesArbitraryOpenApi: z.literal(false),
    provesHumanSavings: z.literal(false),
    provesOptimizedLlm: z.literal(false),
    provesNewSkillOnboarding: z.literal(false),
    changesPortfolio: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const ids = report.rows.map((row) => row.rowId);
  const outcomes = [report.denominator.accepted, report.denominator.rejected, report.denominator.checkerFailed, report.denominator.infrastructureFailed];
  if (new Set(ids).size !== 10 || outcomes.reduce((sum, count) => sum + count, 0) !== 10) {
    context.addIssue({ code: "custom", path: ["denominator"], message: "first-run report must retain all 10 rows" });
  }
});
export type ApiTesterV2FeatureMigrationFirstRunReport = z.infer<typeof ApiTesterV2FeatureMigrationFirstRunReportSchema>;

function countOutcomes(rows: ApiTesterV2FeatureMigrationObservedRow[]) {
  return OutcomeCountsSchema.parse({
    accepted: rows.filter((row) => row.actual.outcome === "accepted").length,
    rejected: rows.filter((row) => row.actual.outcome === "rejected").length,
    checkerFailed: rows.filter((row) => row.actual.outcome === "checker-failed").length,
    infrastructureFailed: rows.filter((row) => row.actual.outcome === "infrastructure-failed").length,
  });
}

export function buildApiTesterV2FeatureMigrationFirstRunReport(options: {
  lock: ApiTesterV2FeatureMigrationLock | unknown;
  lockSha256: string;
  candidateSha256: string;
  selectionSha256: string;
  freezeCommit: string;
  completedAt: string;
  rows: ApiTesterV2FeatureMigrationObservedRow[] | unknown[];
}): ApiTesterV2FeatureMigrationFirstRunReport {
  const lock = ApiTesterV2FeatureMigrationLockSchema.parse(options.lock);
  const rows = options.rows.map((row) => ObservedRowSchema.parse(row));
  if (rows.length !== 10 || rows.some((row, index) => {
    const frozen = lock.rows[index];
    return !frozen || row.rowId !== frozen.rowId || row.stratum !== frozen.stratum
      || row.primaryFeature !== frozen.primaryFeature || row.inputSha256 !== frozen.input.sha256
      || row.bindingSha256 !== frozen.bindingSha256 || JSON.stringify(row.prediction) !== JSON.stringify(frozen.prediction);
  })) throw new Error("first-run rows do not exactly cover the frozen 10-row denominator and order");
  const realRows = rows.filter((row) => row.stratum === "real-public-input");
  const boundaryRows = rows.filter((row) => row.stratum === "synthetic-boundary");
  const total = countOutcomes(rows);
  const sumNullable = (key: "constructionMillis" | "generationMillis" | "checkingMillis") =>
    rows.reduce((sum, row) => sum + (row.costs[key] ?? 0), 0);
  return ApiTesterV2FeatureMigrationFirstRunReportSchema.parse({
    schemaVersion: "skill-ir-api-tester-v2-feature-migration-first-run-report/v1",
    identity: lock.identity,
    status: "completed",
    completedAt: options.completedAt,
    freeze: {
      commit: options.freezeCommit,
      remoteBranch: "origin/skill-ir-aot",
      lockPath: API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH,
      lockSha256: options.lockSha256,
      candidateSha256: options.candidateSha256,
      selectionSha256: options.selectionSha256,
      verifiedBeforeRun: true,
    },
    denominator: { planned: 10, attempted: 10, ...total },
    strata: { realPublicInputs: countOutcomes(realRows), syntheticBoundaryCases: countOutcomes(boundaryRows) },
    realPrimaryFeatures: {
      "local-component-ref": countOutcomes(realRows.filter((row) => row.primaryFeature === "local-component-ref")),
      "body-primitive-array": countOutcomes(realRows.filter((row) => row.primaryFeature === "body-primitive-array")),
      "query-form-explode": countOutcomes(realRows.filter((row) => row.primaryFeature === "query-form-explode")),
    },
    predictionParity: {
      exact: rows.filter((row) => row.predictionParity === "exact").length,
      outcomeOnly: rows.filter((row) => row.predictionParity === "outcome-only").length,
      mismatch: rows.filter((row) => row.predictionParity === "mismatch").length,
    },
    rows,
    costs: {
      historicalDevelopment: { agentTokens: 467220, separateFromRuntime: true },
      runtime: {
        inputMaterializationMillis: rows.reduce((sum, row) => sum + row.costs.inputMaterializationMillis, 0),
        constructionMillisObserved: sumNullable("constructionMillis"),
        generationMillisObserved: sumNullable("generationMillis"),
        checkingMillisObserved: sumNullable("checkingMillis"),
        cliEndToEndMillis: rows.reduce((sum, row) => sum + row.costs.cliEndToEndMillis, 0),
        evidenceAnalysisMillis: rows.reduce((sum, row) => sum + row.costs.evidenceAnalysisMillis, 0),
        unavailableConstructionRows: rows.filter((row) => row.costs.constructionMillis === null).length,
        unavailableGenerationRows: rows.filter((row) => row.costs.generationMillis === null).length,
        unavailableCheckingRows: rows.filter((row) => row.costs.checkingMillis === null).length,
        modelCalls: 0,
        apiCalls: 0,
        paidCalls: 0,
      },
      humanModification: { totalMinutes: 0, historicalBackfill: false },
    },
    firstRunImmutable: true,
    evidenceBoundary: {
      purposiveFeatureSample: true,
      estimatesOpenApiEcosystemAdmission: false,
      provesArbitraryOpenApi: false,
      provesHumanSavings: false,
      provesOptimizedLlm: false,
      provesNewSkillOnboarding: false,
      changesPortfolio: false,
      changesReadiness: false,
    },
    claimBoundary: "This immutable first run reports fixed-profile migration for six purposively selected real public inputs plus four separate boundary inputs through one frozen unified-CLI candidate. It does not estimate ecosystem admission, prove arbitrary OpenAPI, human savings, optimized LLM behavior, new-skill onboarding, cross-profile transfer, held-out performance, portfolio status, or readiness.",
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

export async function gitTrackedFileMatchesCommit(options: {
  rootDir: string;
  commit: string;
  path: string;
}): Promise<void> {
  const rootDir = resolve(options.rootDir);
  const commit = GitCommitSchema.parse(options.commit);
  const path = SafeRelativePathSchema.parse(options.path);
  const existence = await git(rootDir, ["cat-file", "-e", `${commit}:${path}`]);
  if (existence.exitCode !== 0) throw new Error(`freeze commit does not contain ${path}`);
  const comparison = await git(rootDir, ["diff", "--quiet", commit, "--", path]);
  if (comparison.exitCode === 1) throw new Error(`tracked working representation differs from freeze commit: ${path}`);
  if (comparison.exitCode !== 0) throw new Error(`unable to compare tracked file with freeze commit: ${path}`);
}

async function gitFileAtCommit(rootDir: string, commit: string, path: string): Promise<Uint8Array> {
  const child = Bun.spawn(["git", "-c", `safe.directory=${rootDir.replaceAll("\\", "/")}`, "show", `${commit}:${SafeRelativePathSchema.parse(path)}`], {
    cwd: rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, bytes, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`freeze commit does not contain ${path}: ${stderr.trim()}`);
  return new Uint8Array(bytes);
}

export async function verifyApiTesterV2FeatureMigrationFreeze(options: {
  rootDir: string;
  freezeCommit: string;
}): Promise<{
  lock: ApiTesterV2FeatureMigrationLock;
  lockSha256: string;
  candidateSha256: string;
  selectionSha256: string;
  freezeCommit: string;
}> {
  const rootDir = resolve(options.rootDir);
  const freezeCommit = GitCommitSchema.parse(options.freezeCommit);
  const commitCheck = await git(rootDir, ["rev-parse", "--verify", `${freezeCommit}^{commit}`]);
  if (commitCheck.exitCode !== 0 || commitCheck.stdout.trim() !== freezeCommit) throw new Error("freeze commit is not the requested full commit identity");
  const remoteCheck = await git(rootDir, ["merge-base", "--is-ancestor", freezeCommit, "origin/skill-ir-aot"]);
  if (remoteCheck.exitCode !== 0) throw new Error("freeze commit is not present on origin/skill-ir-aot");

  const lockBytes = await readFile(contained(rootDir, API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH));
  const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  const lockSha256 = sha256(lockBytes);
  if (sha256(await gitFileAtCommit(rootDir, freezeCommit, API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH)) !== lockSha256) {
    throw new Error("working lock differs from freeze commit");
  }
  const candidateBytes = await readFile(contained(rootDir, lock.candidate.path));
  const candidateSha256 = sha256(candidateBytes);
  if (candidateSha256 !== lock.candidate.sha256
    || sha256(await gitFileAtCommit(rootDir, freezeCommit, lock.candidate.path)) !== candidateSha256) {
    throw new Error("candidate snapshot digest or freeze drift");
  }
  const candidate = ApiTesterV2FeatureMigrationCandidateSchema.parse(JSON.parse(candidateBytes.toString("utf8")));
  for (const source of candidate.executionSurface) {
    const current = await readFile(contained(rootDir, source.path));
    if (current.byteLength !== source.bytes || sha256(current) !== source.sha256) throw new Error(`candidate execution surface drift: ${source.role}`);
    await gitTrackedFileMatchesCommit({ rootDir, commit: freezeCommit, path: source.path });
  }
  const selectionBytes = await readFile(contained(rootDir, lock.selection.path));
  const selectionSha256 = sha256(selectionBytes);
  if (selectionSha256 !== lock.selection.sha256
    || sha256(await gitFileAtCommit(rootDir, freezeCommit, lock.selection.path)) !== selectionSha256) {
    throw new Error("source selection digest or freeze drift");
  }
  ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const predecessorFailureBytes = await readFile(contained(rootDir, lock.predecessorPreflight.reportPath));
  if (sha256(predecessorFailureBytes) !== lock.predecessorPreflight.reportSha256
    || sha256(await gitFileAtCommit(rootDir, freezeCommit, lock.predecessorPreflight.reportPath)) !== lock.predecessorPreflight.reportSha256) {
    throw new Error("predecessor preflight record digest or freeze drift");
  }
  ApiTesterV2FeatureMigrationPreflightFailureSchema.parse(JSON.parse(predecessorFailureBytes.toString("utf8")));
  for (const harness of lock.executionHarness) {
    if (sha256(await readFile(contained(rootDir, harness.path))) !== harness.sha256
      || sha256(await gitFileAtCommit(rootDir, freezeCommit, harness.path)) !== harness.sha256) {
      throw new Error(`execution harness drift: ${harness.path}`);
    }
  }
  for (const row of lock.rows) {
    if (sha256(await gitFileAtCommit(rootDir, freezeCommit, row.bindingPath)) !== row.bindingSha256) {
      throw new Error(`binding not frozen: ${row.rowId}`);
    }
    if (row.input.storage === "repository" && row.input.repositoryPath
      && sha256(await gitFileAtCommit(rootDir, freezeCommit, row.input.repositoryPath)) !== row.input.sha256) {
      throw new Error(`boundary not frozen: ${row.rowId}`);
    }
  }
  return { lock, lockSha256, candidateSha256, selectionSha256, freezeCommit };
}

function sanitized(error: unknown, replacements: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const replacement of replacements.filter(Boolean)) {
    message = message.replaceAll(replacement, "<path>").replaceAll(replacement.replaceAll("\\", "/"), "<path>");
  }
  return message.slice(0, 2000) || "unknown error";
}

function predictionParity(prediction: z.infer<typeof PredictionSchema>, actual: z.infer<typeof ObservedRowSchema>["actual"]): "exact" | "outcome-only" | "mismatch" {
  if (prediction.expectedOutcome === "accepted" && actual.outcome === "accepted" && actual.checkerStatus === "pass") return "exact";
  if (prediction.expectedOutcome === "rejected" && actual.outcome === "rejected") {
    return prediction.rejectionCode === actual.rejectionCode ? "exact" : "outcome-only";
  }
  return "mismatch";
}

async function existsRegular(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function observeMilestones(input: {
  packageManifest: string;
  plan: string;
  report: string;
  validation: string;
  cliReport: string;
  startedAt: number;
  stopped: () => boolean;
}): Promise<Record<"package" | "outputs" | "validation" | "cli", number | null>> {
  const observed: Record<"package" | "outputs" | "validation" | "cli", number | null> = {
    package: null,
    outputs: null,
    validation: null,
    cli: null,
  };
  const inspect = async () => {
    const now = Date.now() - input.startedAt;
    if (observed.package === null && await existsRegular(input.packageManifest)) observed.package = now;
    if (observed.outputs === null && await existsRegular(input.plan) && await existsRegular(input.report)) observed.outputs = now;
    if (observed.validation === null && await existsRegular(input.validation)) observed.validation = now;
    if (observed.cli === null && await existsRegular(input.cliReport)) observed.cli = now;
  };
  while (!input.stopped()) {
    await inspect();
    await new Promise((complete) => setTimeout(complete, 5));
  }
  await inspect();
  return observed;
}

function milestoneCosts(observed: Record<"package" | "outputs" | "validation" | "cli", number | null>) {
  const constructionMillis = observed.package;
  const generationMillis = observed.package !== null && observed.outputs !== null
    ? Math.max(0, observed.outputs - observed.package) : null;
  const checkingMillis = observed.outputs !== null && observed.validation !== null
    ? Math.max(0, observed.validation - observed.outputs) : null;
  const values = [observed.package, observed.outputs, observed.validation, observed.cli].filter((value): value is number => value !== null);
  return {
    constructionMillis,
    generationMillis,
    checkingMillis,
    coalescedMilestones: new Set(values).size !== values.length,
  };
}

export async function runApiTesterV2FeatureMigrationFirstRun(options: {
  rootDir: string;
  cacheRoot: string;
  freezeCommit: string;
  outPath: string;
  nodeExecutable: string;
  bunExecutable: string;
  completedAt: string;
}): Promise<ApiTesterV2FeatureMigrationFirstRunReport> {
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const outPath = containedAbsolute(rootDir, options.outPath);
  const freeze = await verifyApiTesterV2FeatureMigrationFreeze({ rootDir, freezeCommit: options.freezeCommit });
  if (outPath !== contained(rootDir, freeze.lock.result.path)) {
    throw new Error("first-run output must use the frozen result path");
  }
  await verifyApiTesterV2FeatureMigrationInputs({ rootDir, cacheRoot, lock: freeze.lock });
  if (await existsRegular(outPath)) throw new Error("immutable first-run report already exists");
  const executionRoot = await mkdtemp(join(rootDir, ".tmp-api-v2-feature-migration-"));
  const rows: ApiTesterV2FeatureMigrationObservedRow[] = [];
  try {
    for (const row of freeze.lock.rows) {
      const workDir = join(executionRoot, row.rowId, "workdir");
      const outDir = join(executionRoot, row.rowId, "output");
      const materializationStarted = performance.now();
      const inputSource = row.input.storage === "external-cache"
        ? contained(cacheRoot, row.input.cachePath!)
        : contained(rootDir, row.input.repositoryPath!);
      const workInput = contained(workDir, row.binding.input.path);
      await mkdir(dirname(workInput), { recursive: true });
      await copyFile(inputSource, workInput);
      const inputMaterializationMillis = Math.max(0, Math.round(performance.now() - materializationStarted));
      const startedAt = Date.now();
      let stopped = false;
      const observation = observeMilestones({
        packageManifest: join(outDir, "artifact", "package-manifest.json"),
        plan: join(workDir, row.binding.outputs.plan),
        report: join(workDir, row.binding.outputs.report),
        validation: join(outDir, "validation-report.json"),
        cliReport: join(outDir, "cli-report.json"),
        startedAt,
        stopped: () => stopped,
      });
      const child = Bun.spawn([
        options.nodeExecutable,
        join(rootDir, "bin", "skvm.js"),
        "artifact",
        "--preset=api-tester",
        `--binding=${contained(rootDir, row.bindingPath)}`,
        `--root=${rootDir}`,
        `--workdir=${workDir}`,
        `--out=${outDir}`,
        `--completed-at=${options.completedAt}`,
      ], {
        cwd: rootDir,
        env: { ...process.env, SKVM_BUN_BIN: options.bunExecutable, SKVM_NODE: options.nodeExecutable },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const cliEndToEndMillis = Math.max(0, Date.now() - startedAt);
      stopped = true;
      const observed = await observation;
      const analysisStarted = performance.now();
      let actual: z.infer<typeof ObservedRowSchema>["actual"];
      if (exitCode === 0) {
        try {
          const cliReport = ArtifactPresetResultSchema.parse(JSON.parse(stdout));
          if (cliReport.schemaVersion !== "skill-ir-artifact-cli-result/v2"
            || cliReport.binding.schemaVersion !== API_TESTER_PRODUCTION_BINDING_SCHEMA_VERSION_V2
            || cliReport.binding.sha256 !== row.bindingSha256
            || cliReport.quality.result !== "pass") {
            throw new Error("unified CLI result does not match the frozen v2 binding/checker");
          }
          const [cliBytes, manifestBytes, planBytes, reportBytes, validationBytes] = await Promise.all([
            readFile(join(outDir, "cli-report.json")),
            readFile(join(outDir, "artifact", "package-manifest.json")),
            readFile(join(workDir, row.binding.outputs.plan)),
            readFile(join(workDir, row.binding.outputs.report)),
            readFile(join(outDir, "validation-report.json")),
          ]);
          actual = {
            outcome: "accepted",
            rejectionCode: null,
            error: null,
            checkerStatus: "pass",
            evidence: {
              cliReportSha256: sha256(cliBytes),
              packageManifestSha256: sha256(manifestBytes),
              generatorSha256: cliReport.binding.generatorSha256,
              checkerSha256: cliReport.binding.checkerSha256,
              planSha256: sha256(planBytes),
              reportSha256: sha256(reportBytes),
              validationReportSha256: sha256(validationBytes),
            },
          };
        } catch (error) {
          actual = {
            outcome: "infrastructure-failed",
            rejectionCode: null,
            error: sanitized(error, [rootDir, cacheRoot, executionRoot]),
            checkerStatus: "not-run",
            evidence: null,
          };
        }
      } else {
        const rejection = stderr.match(/\b(INVALID_OPENAPI|UNSUPPORTED_OPENAPI_FEATURE|UNSUPPORTED_REFERENCE|UNSUPPORTED_PARAMETER|UNSUPPORTED_REQUEST_BODY|UNSUPPORTED_SECURITY|UNSUPPORTED_RESPONSE|UNSUPPORTED_SCHEMA|UNCONSTRUCTIBLE_CONSTRAINT|MISSING_REQUIRED_ERROR_RESPONSE|MISSING_SECURITY_ERROR_RESPONSE):/u)?.[1];
        if (rejection) {
          actual = {
            outcome: "rejected",
            rejectionCode: RejectionCodeSchema.parse(rejection),
            error: null,
            checkerStatus: "not-run",
            evidence: null,
          };
        } else if (await existsRegular(join(outDir, "validation-report.json"))) {
          actual = {
            outcome: "checker-failed",
            rejectionCode: null,
            error: sanitized(stderr || stdout || "checker failed", [rootDir, cacheRoot, executionRoot]),
            checkerStatus: "fail",
            evidence: null,
          };
        } else {
          actual = {
            outcome: "infrastructure-failed",
            rejectionCode: null,
            error: sanitized(stderr || stdout || `CLI exited ${exitCode}`, [rootDir, cacheRoot, executionRoot]),
            checkerStatus: "not-run",
            evidence: null,
          };
        }
      }
      const evidenceAnalysisMillis = Math.max(0, Math.round(performance.now() - analysisStarted));
      rows.push(ObservedRowSchema.parse({
        rowId: row.rowId,
        stratum: row.stratum,
        primaryFeature: row.primaryFeature,
        inputSha256: row.input.sha256,
        bindingSha256: row.bindingSha256,
        prediction: row.prediction,
        actual,
        predictionParity: predictionParity(row.prediction, actual),
        adaptation: {
          extraCode: false,
          extraTemplate: false,
          extraRule: false,
          humanModificationMinutes: 0,
          note: "No code, template, rule, or human modification was permitted during the immutable first run.",
        },
        costs: {
          inputMaterializationMillis,
          ...milestoneCosts(observed),
          cliEndToEndMillis,
          evidenceAnalysisMillis,
          observerResolutionMillis: 5,
        },
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      }));
    }
    const report = buildApiTesterV2FeatureMigrationFirstRunReport({
      lock: freeze.lock,
      lockSha256: freeze.lockSha256,
      candidateSha256: freeze.candidateSha256,
      selectionSha256: freeze.selectionSha256,
      freezeCommit: freeze.freezeCommit,
      completedAt: options.completedAt,
      rows,
    });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, jsonText(report), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
