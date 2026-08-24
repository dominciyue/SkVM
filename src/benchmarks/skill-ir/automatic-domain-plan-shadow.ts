import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  InitialWorkdirManifestSchema,
  readInitialWorkdirManifest,
  snapshotWorkdir,
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest";
import { ThinTaskDescriptionSchema } from "./automatic-domain-construction";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  DomainAutomaticConstructionShadowReportSchema,
} from "./automatic-domain-construction-shadow";
import {
  buildRestrictedDomainPlanRequest,
  auditRestrictedDomainPlanLeakage,
  completeRestrictedDomainPlanOnce,
  deriveForbiddenTaskDataLiterals,
  type RestrictedDomainPlanRequest,
} from "./automatic-domain-plan-synthesis";
import {
  RestrictedDomainPlanSchema,
  validateRestrictedDomainPlanBindings,
  type RestrictedDomainPlan,
} from "./automatic-restricted-domain-plan";
import {
  compileStructuralExecutionPlan,
  StructuralTargetBindingSchema,
} from "./automatic-structural-execution";
import {
  buildRestrictedDomainPlanPackage,
  deriveRestrictedDomainPlanBindings,
} from "./automatic-restricted-domain-plan-runtime";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";
import {
  resolveBackendModel,
  resolveRoute,
  resolveRouteApiKey,
} from "../../providers/registry";
import { invalidateConfigCache } from "../../core/config";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const TaskBindingSchema = z.object({
  taskId: IdentifierSchema,
  bindings: z.array(StructuralTargetBindingSchema),
}).strict();

const ShadowCaseSchema = z.object({
  caseId: IdentifierSchema,
  taskSet: DigestRefSchema,
  constructionTaskId: IdentifierSchema,
  transferTaskId: IdentifierSchema,
  publicContractFixturePaths: z.array(SafePathSchema).min(1).max(4),
  bindingsByTask: z.array(TaskBindingSchema).length(2),
  manualEvaluatorModule: DigestRefSchema,
}).strict().superRefine((entry, context) => {
  if (entry.constructionTaskId === entry.transferTaskId) {
    context.addIssue({ code: "custom", message: "construction and transfer task ids must differ" });
  }
  const bindingIds = entry.bindingsByTask.map((binding) => binding.taskId);
  if (new Set(bindingIds).size !== 2
    || !bindingIds.includes(entry.constructionTaskId)
    || !bindingIds.includes(entry.transferTaskId)) {
    context.addIssue({ code: "custom", message: "bindings must cover construction and transfer tasks exactly" });
  }
});

export const RestrictedDomainPlanShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  automaticDomainCatalog: DigestRefSchema,
  automaticDomainReport: DigestRefSchema,
  model: z.object({
    modelId: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/u),
    cacheRoot: SafePathSchema,
    temperature: z.literal(0),
    maxTokens: z.literal(16_384),
    timeoutMs: z.number().int().min(60_000).max(900_000),
    callsPerCase: z.literal(1),
    retries: z.literal(0),
  }).strict(),
  cases: z.array(ShadowCaseSchema).length(2),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.cases.map((entry) => entry.caseId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "case ids must be unique" });
});

export type RestrictedDomainPlanShadowCatalog = z.infer<typeof RestrictedDomainPlanShadowCatalogSchema>;

const PreModelRequestSchema = z.object({
  caseId: IdentifierSchema,
  source: DigestRefSchema,
  taskDescription: DigestRefSchema,
  taskSet: DigestRefSchema,
  candidateDigest: Sha256Schema,
  constructionTaskId: IdentifierSchema,
  constructionTaskSplit: z.literal("development"),
  transferTaskId: IdentifierSchema,
  transferTaskSplit: z.literal("development"),
  publicContractFixturePaths: z.array(SafePathSchema).min(1),
  requestSha256: Sha256Schema,
  forbiddenTaskDataLiteralCount: z.number().int().positive(),
  requestContainsEvaluatorPayload: z.literal(false),
  requestContainsHeldOut: z.literal(false),
}).strict();

export const RestrictedDomainPlanPreModelFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-pre-model-freeze/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).min(1),
  parentEvidence: z.object({
    automaticDomainCatalog: DigestRefSchema,
    automaticDomainReport: DigestRefSchema,
  }).strict(),
  modelRoute: z.object({
    modelId: z.string(),
    backendModel: z.string(),
    routeKind: z.enum(["openai-compatible", "openrouter", "anthropic"]),
    baseUrlSha256: Sha256Schema.nullable(),
  }).strict(),
  requests: z.array(PreModelRequestSchema).length(2),
  authorization: z.object({
    executeAllowed: z.literal(true),
    modelId: z.string(),
    callsPerCase: z.literal(1),
    maximumPaidCalls: z.literal(2),
    retries: z.literal(0),
    continueAfterIndependentCaseFailure: z.literal(true),
  }).strict(),
  summary: z.object({
    caseCount: z.literal(2),
    requestCount: z.literal(2),
    paidCalls: z.literal(0),
    authorizedPaidCalls: z.literal(2),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((freeze, context) => {
  const caseIds = freeze.requests.map((entry) => entry.caseId);
  if (new Set(caseIds).size !== 2) context.addIssue({ code: "custom", message: "freeze requests must cover two cases" });
  if (freeze.authorization.modelId !== freeze.modelRoute.modelId) {
    context.addIssue({ code: "custom", message: "authorization model does not match resolved route" });
  }
});

export type RestrictedDomainPlanPreModelFreeze = z.infer<typeof RestrictedDomainPlanPreModelFreezeSchema>;

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.literal("development"),
    prompt: z.string(),
    fixtures: z.record(z.string()),
    eval: z.array(EvalCriterionSchema),
  }).passthrough()).min(2),
}).passthrough();

type ShadowTask = z.infer<typeof TaskSetSchema>["tasks"][number];

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes repository root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}: expected ${ref.sha256}, received ${actual}`);
  return bytes;
}

export async function verifyRestrictedDomainPlanImplementationIdentity(
  rootDir: string,
  implementation: Array<z.infer<typeof DigestRefSchema>>,
): Promise<void> {
  await Promise.all(implementation.map((ref) => readPinned(rootDir, DigestRefSchema.parse(ref))));
}

export function verifyRestrictedDomainPlanProviderIdentity(
  provider: { baseUrl: string; backendModel: string },
  frozen: RestrictedDomainPlanPreModelFreeze["modelRoute"],
): void {
  const baseUrlSha256 = sha256Bytes(Buffer.from(provider.baseUrl, "utf8"));
  if (frozen.routeKind !== "openai-compatible"
    || frozen.baseUrlSha256 !== baseUrlSha256
    || frozen.backendModel !== provider.backendModel) {
    throw new Error("restricted Domain Plan provider identity drift");
  }
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertMeasurementStartNotFuture(measurementStartedAt: string): void {
  if (Date.parse(measurementStartedAt) > Date.now()) {
    throw new Error("restricted Domain Plan measurement start is in the future");
  }
}

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-synthesis.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-runtime.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-runner.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-checker.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-shadow.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-shadow-run.ts",
] as const;

function resolveCatalogRoute(rootDir: string, catalog: RestrictedDomainPlanShadowCatalog) {
  const previous = process.env.SKVM_CACHE;
  process.env.SKVM_CACHE = containedPath(rootDir, catalog.model.cacheRoot);
  invalidateConfigCache();
  try {
    return resolveRoute(catalog.model.modelId);
  } finally {
    if (previous === undefined) delete process.env.SKVM_CACHE;
    else process.env.SKVM_CACHE = previous;
    invalidateConfigCache();
  }
}

export async function buildRestrictedDomainPlanPreModelFreeze(
  rootDir: string,
  rawCatalog: RestrictedDomainPlanShadowCatalog,
  outDir: string,
): Promise<RestrictedDomainPlanPreModelFreeze> {
  const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(rawCatalog);
  assertMeasurementStartNotFuture(catalog.measurementStartedAt);
  const [domainCatalogBytes, domainReportBytes] = await Promise.all([
    readPinned(rootDir, catalog.automaticDomainCatalog),
    readPinned(rootDir, catalog.automaticDomainReport),
  ]);
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(domainCatalogBytes.toString("utf8")));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(domainReportBytes.toString("utf8")));
  const generationByCase = new Map(domainCatalog.cases.map((entry) => [entry.caseId, entry.generationInput]));
  const digestByCase = new Map(domainReport.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));
  const requests: Array<z.infer<typeof PreModelRequestSchema>> = [];

  for (const entry of catalog.cases) {
    const generation = generationByCase.get(entry.caseId);
    const candidateDigest = digestByCase.get(entry.caseId);
    if (!generation || !candidateDigest) throw new Error(`automatic domain parent is missing case ${entry.caseId}`);
    const [sourceBytes, descriptionBytes, taskSetBytes] = await Promise.all([
      readPinned(rootDir, generation.source),
      readPinned(rootDir, generation.taskDescription),
      readPinned(rootDir, entry.taskSet),
    ]);
    const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
    const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
    const constructionTask = taskSet.tasks.find((task) => task.id === entry.constructionTaskId);
    const transferTask = taskSet.tasks.find((task) => task.id === entry.transferTaskId);
    if (!constructionTask || !transferTask) throw new Error(`development task split is incomplete for ${entry.caseId}`);
    const request = buildRestrictedDomainPlanRequest({
      sourceText: sourceBytes.toString("utf8"),
      taskDescription: description,
      constructionTask,
      publicContractFixturePaths: entry.publicContractFixturePaths,
    });
    const requestText = jsonText(request);
    const forbidden = deriveForbiddenTaskDataLiterals({
      sourceText: sourceBytes.toString("utf8"),
      taskDescriptionText: descriptionBytes.toString("utf8"),
      prompt: constructionTask.prompt,
      fixtures: constructionTask.fixtures,
      publicContractFixturePaths: entry.publicContractFixturePaths,
    });
    if (forbidden.length === 0) throw new Error(`construction task has no task-data leakage canary: ${entry.caseId}`);
    // buildRestrictedDomainPlanRequest reconstructs the task from an explicit
    // {id, split, prompt, fixtures} projection. The source/description may
    // legitimately discuss words such as "evaluation" or "payload", so a
    // substring scan would create false blockers; the strict projection is the
    // evidence boundary and is covered by a private-canary unit test.
    requests.push(PreModelRequestSchema.parse({
      caseId: entry.caseId,
      source: { path: generation.source.path, sha256: generation.source.sha256 },
      taskDescription: { path: generation.taskDescription.path, sha256: generation.taskDescription.sha256 },
      taskSet: entry.taskSet,
      candidateDigest,
      constructionTaskId: constructionTask.id,
      constructionTaskSplit: constructionTask.split,
      transferTaskId: transferTask.id,
      transferTaskSplit: transferTask.split,
      publicContractFixturePaths: entry.publicContractFixturePaths,
      requestSha256: sha256Bytes(Buffer.from(requestText, "utf8")),
      forbiddenTaskDataLiteralCount: forbidden.length,
      requestContainsEvaluatorPayload: false,
      requestContainsHeldOut: false,
    }));
  }

  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const coreText = (await Promise.all(IMPLEMENTATION_PATHS.slice(0, 2)
    .map((path) => readFile(containedPath(rootDir, path), "utf8")))).join("\n");
  for (const entry of catalog.cases) {
    if (coreText.includes(entry.caseId)) throw new Error(`restricted Domain Plan core contains case-specific id ${entry.caseId}`);
  }
  const route = resolveCatalogRoute(rootDir, catalog);
  const freeze = RestrictedDomainPlanPreModelFreezeSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-pre-model-freeze/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementStartedAt: catalog.measurementStartedAt,
    implementation,
    parentEvidence: {
      automaticDomainCatalog: catalog.automaticDomainCatalog,
      automaticDomainReport: catalog.automaticDomainReport,
    },
    modelRoute: {
      modelId: catalog.model.modelId,
      backendModel: resolveBackendModel(catalog.model.modelId),
      routeKind: route.kind,
      baseUrlSha256: route.baseUrl ? sha256Bytes(Buffer.from(route.baseUrl, "utf8")) : null,
    },
    requests,
    authorization: {
      executeAllowed: true,
      modelId: catalog.model.modelId,
      callsPerCase: 1,
      maximumPaidCalls: 2,
      retries: 0,
      continueAfterIndependentCaseFailure: true,
    },
    summary: {
      caseCount: 2,
      requestCount: 2,
      paidCalls: 0,
      authorizedPaidCalls: 2,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    },
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "pre-model-freeze.json"), jsonText(freeze), "utf8");
  return freeze;
}

const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.literal(0),
}).strict();

const ManualCriterionSchema = z.object({
  id: IdentifierSchema,
  status: z.enum(["pass", "fail", "infrastructure-failure"]),
}).strict();

const TaskExecutionSchema = z.object({
  taskId: IdentifierSchema,
  role: z.enum(["construction", "transfer"]),
  packageStatus: z.enum([
    "complete",
    "process-failure",
    "validation-failure",
    "infrastructure-failure",
    "protected-input-failure",
  ]),
  processStatus: z.enum(["complete", "failed", "timeout", "not-run"]),
  validationStatus: z.enum(["pass", "fail", "not-produced"]),
  validationErrorCodes: z.array(z.string()),
  protectedInputsPreserved: z.boolean(),
  generatedPaths: z.array(SafePathSchema),
  packageManifestSha256: Sha256Schema,
  packageBytes: z.number().int().positive(),
  manualCriteria: z.array(ManualCriterionSchema),
  manualPassedCriteria: z.number().int().nonnegative(),
  manualCriterionCount: z.number().int().nonnegative(),
}).strict().superRefine((entry, context) => {
  if (entry.manualCriteria.length !== entry.manualCriterionCount
    || entry.manualCriteria.filter((criterion) => criterion.status === "pass").length !== entry.manualPassedCriteria) {
    context.addIssue({ code: "custom", message: "manual criterion accounting does not conserve" });
  }
});

const SynthesisRecordSchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  paidCalls: z.literal(1),
  providerAttempts: z.literal(1),
  usageStatus: z.enum(["reported", "unavailable"]),
  tokens: TokenUsageSchema.nullable(),
  durationMs: z.number().nonnegative().nullable(),
  requestSha256: Sha256Schema,
  planSha256: Sha256Schema.nullable(),
  planLoc: z.number().int().nonnegative(),
  stepCount: z.number().int().nonnegative(),
  leakageAudit: z.enum(["passed", "failed", "not-run"]),
  twoTaskBindingAudit: z.enum(["passed", "failed", "not-run"]),
  failureCode: z.enum(["none", "provider-or-parse", "task-data-leakage", "binding-invalid"]),
  failureDigest: Sha256Schema.nullable(),
}).strict().superRefine((entry, context) => {
  if (entry.status === "succeeded") {
    if (!entry.planSha256 || entry.stepCount === 0 || entry.planLoc === 0
      || entry.leakageAudit !== "passed" || entry.twoTaskBindingAudit !== "passed"
      || entry.failureCode !== "none" || entry.failureDigest !== null) {
      context.addIssue({ code: "custom", message: "successful synthesis lacks frozen plan evidence" });
    }
  } else if (entry.planSha256 !== null || entry.failureCode === "none" || entry.failureDigest === null) {
    context.addIssue({ code: "custom", message: "failed synthesis accounting is incomplete" });
  }
});

const DomainPlanCaseReportSchema = z.object({
  caseId: IdentifierSchema,
  constructionTaskId: IdentifierSchema,
  transferTaskId: IdentifierSchema,
  synthesis: SynthesisRecordSchema,
  planOperations: z.array(z.string()),
  declaredDomainPredicateIds: z.array(IdentifierSchema),
  establishedDomainPredicateParity: z.array(IdentifierSchema).length(0),
  unimplementedDomainPredicateIds: z.array(IdentifierSchema),
  taskExecutions: z.array(TaskExecutionSchema).max(2),
  transferPlanExecutable: z.boolean(),
  automaticEligibility: z.boolean(),
  semanticParity: z.literal("not-established"),
}).strict().superRefine((entry, context) => {
  if (entry.synthesis.status === "succeeded" && entry.taskExecutions.length !== 2) {
    context.addIssue({ code: "custom", message: "successful synthesis requires two task executions" });
  }
  if (entry.synthesis.status === "failed" && entry.taskExecutions.length !== 0) {
    context.addIssue({ code: "custom", message: "failed synthesis cannot have task executions" });
  }
  const transfer = entry.taskExecutions.find((task) => task.role === "transfer");
  if (entry.transferPlanExecutable !== (transfer?.processStatus === "complete")) {
    context.addIssue({ code: "custom", message: "transfer executable flag does not match execution" });
  }
  const eligible = entry.taskExecutions.length === 2 && entry.taskExecutions.every((task) =>
    task.packageStatus === "complete"
    && task.manualCriterionCount > 0
    && task.manualPassedCriteria === task.manualCriterionCount);
  if (entry.automaticEligibility !== eligible) {
    context.addIssue({ code: "custom", message: "automatic eligibility does not match full package/manual evidence" });
  }
});

export const RestrictedDomainPlanShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  preModelFreeze: DigestRefSchema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  planFreezeCompletedBeforeManualEvaluatorModuleLoad: z.literal(true),
  cases: z.array(DomainPlanCaseReportSchema).length(2),
  reuseGate: z.object({
    status: z.enum(["passed", "failed"]),
    requiredDistinctCases: z.literal(2),
    distinctTransferExecutableCases: z.number().int().min(0).max(2),
    sharedPrimitiveFamilies: z.array(z.string()),
    coreBranchDelta: z.literal(0),
    semanticParity: z.literal("not-established"),
  }).strict(),
  accounting: z.object({
    modelGeneratedPlanLoc: z.number().int().nonnegative(),
    caseSpecificBindingPaths: z.number().int().nonnegative(),
    meteredHumanMinutes: z.number().int().nonnegative(),
    adapterLoc: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
  summary: z.object({
    caseCount: z.literal(2),
    synthesisSucceeded: z.number().int().min(0).max(2),
    transferExecutableCases: z.number().int().min(0).max(2),
    packagePassingExecutions: z.number().int().min(0).max(4),
    manualPassedCriteria: z.number().int().nonnegative(),
    manualCriterionCount: z.number().int().nonnegative(),
    automaticEligibilityCases: z.number().int().min(0).max(2),
    paidCalls: z.literal(2),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadsSentToModel: z.literal(0),
    manualEvaluatorModuleLoads: z.number().int().min(0).max(2),
    coreBranchDelta: z.literal(0),
    semanticParity: z.literal("not-established"),
  }).strict(),
}).strict().superRefine((report, context) => {
  const succeeded = report.cases.filter((entry) => entry.synthesis.status === "succeeded").length;
  const transfer = report.cases.filter((entry) => entry.transferPlanExecutable).length;
  const executions = report.cases.flatMap((entry) => entry.taskExecutions);
  const packagePassing = executions.filter((entry) => entry.packageStatus === "complete").length;
  const manualPassed = executions.reduce((sum, entry) => sum + entry.manualPassedCriteria, 0);
  const manualTotal = executions.reduce((sum, entry) => sum + entry.manualCriterionCount, 0);
  const eligible = report.cases.filter((entry) => entry.automaticEligibility).length;
  if (report.summary.synthesisSucceeded !== succeeded
    || report.summary.transferExecutableCases !== transfer
    || report.summary.packagePassingExecutions !== packagePassing
    || report.summary.manualPassedCriteria !== manualPassed
    || report.summary.manualCriterionCount !== manualTotal
    || report.summary.automaticEligibilityCases !== eligible) {
    context.addIssue({ code: "custom", message: "shadow summary does not conserve case evidence" });
  }
  if (report.reuseGate.distinctTransferExecutableCases !== transfer
    || report.reuseGate.status !== (transfer === 2 ? "passed" : "failed")) {
    context.addIssue({ code: "custom", message: "reuse gate does not match transfer execution" });
  }
});

export type RestrictedDomainPlanShadowReport = z.infer<typeof RestrictedDomainPlanShadowReportSchema>;

type PreparedCase = {
  config: z.infer<typeof ShadowCaseSchema>;
  generation: z.infer<typeof DomainAutomaticConstructionShadowCatalogSchema>["cases"][number]["generationInput"];
  candidateDigest: string;
  sourceBytes: Buffer;
  descriptionBytes: Buffer;
  description: z.infer<typeof ThinTaskDescriptionSchema>;
  taskSet: z.infer<typeof TaskSetSchema>;
  constructionTask: ShadowTask;
  transferTask: ShadowTask;
  request: ReturnType<typeof buildRestrictedDomainPlanRequest>;
  forbidden: string[];
};

async function prepareCases(rootDir: string, catalog: RestrictedDomainPlanShadowCatalog): Promise<PreparedCase[]> {
  const [domainCatalogBytes, domainReportBytes] = await Promise.all([
    readPinned(rootDir, catalog.automaticDomainCatalog),
    readPinned(rootDir, catalog.automaticDomainReport),
  ]);
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(domainCatalogBytes.toString("utf8")));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(domainReportBytes.toString("utf8")));
  const generationByCase = new Map(domainCatalog.cases.map((entry) => [entry.caseId, entry.generationInput]));
  const digestByCase = new Map(domainReport.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));
  const prepared: PreparedCase[] = [];
  for (const config of catalog.cases) {
    const generation = generationByCase.get(config.caseId);
    const candidateDigest = digestByCase.get(config.caseId);
    if (!generation || !candidateDigest) throw new Error(`automatic domain parent is missing case ${config.caseId}`);
    const [sourceBytes, descriptionBytes, taskSetBytes] = await Promise.all([
      readPinned(rootDir, generation.source),
      readPinned(rootDir, generation.taskDescription),
      readPinned(rootDir, config.taskSet),
    ]);
    const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
    const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
    const constructionTask = taskSet.tasks.find((task) => task.id === config.constructionTaskId);
    const transferTask = taskSet.tasks.find((task) => task.id === config.transferTaskId);
    if (!constructionTask || !transferTask) throw new Error(`development task split is incomplete for ${config.caseId}`);
    const request = buildRestrictedDomainPlanRequest({
      sourceText: sourceBytes.toString("utf8"),
      taskDescription: description,
      constructionTask,
      publicContractFixturePaths: config.publicContractFixturePaths,
    });
    prepared.push({
      config,
      generation,
      candidateDigest,
      sourceBytes,
      descriptionBytes,
      description,
      taskSet,
      constructionTask,
      transferTask,
      request,
      forbidden: deriveForbiddenTaskDataLiterals({
        sourceText: sourceBytes.toString("utf8"),
        taskDescriptionText: descriptionBytes.toString("utf8"),
        prompt: constructionTask.prompt,
        fixtures: constructionTask.fixtures,
        publicContractFixturePaths: config.publicContractFixturePaths,
      }),
    });
  }
  return prepared;
}

async function materializeTask(workDir: string, task: ShadowTask): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(task.fixtures)) {
    const target = containedPath(workDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function assertPlanBindsToBothTasks(options: {
  root: string;
  prepared: PreparedCase;
  candidate: Awaited<ReturnType<typeof constructDomainSkillCandidates>>;
  plan: RestrictedDomainPlan;
}): Promise<void> {
  for (const task of [options.prepared.constructionTask, options.prepared.transferTask]) {
    const taskRoot = join(options.root, options.prepared.config.caseId, task.id);
    const workDir = join(taskRoot, "workdir");
    await materializeTask(workDir, task);
    const initialManifest = InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: await snapshotWorkdir(workDir),
    });
    const binding = options.prepared.config.bindingsByTask.find((entry) => entry.taskId === task.id)!;
    const structuralPlan = compileStructuralExecutionPlan(options.candidate, binding.bindings);
    validateRestrictedDomainPlanBindings(options.plan, deriveRestrictedDomainPlanBindings(structuralPlan, initialManifest));
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function failureDigest(error: unknown): string {
  return sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
}

function writeOperationPaths(plan: RestrictedDomainPlan): string[] {
  return plan.steps.flatMap((step) =>
    ["write-json", "write-text-template", "copy-text"].includes(step.op) && "path" in step ? [step.path] : []);
}

async function protectedInputsPreserved(workDir: string, initialEntries: z.infer<typeof InitialWorkdirManifestSchema>["entries"]) {
  const current = new Map((await snapshotWorkdir(workDir)).map((entry) => [entry.path, entry]));
  return initialEntries.every((entry) => JSON.stringify(current.get(entry.path)) === JSON.stringify(entry));
}

type InternalExecution = z.infer<typeof TaskExecutionSchema> & {
  workDir: string;
  manifestReference: InitialWorkdirManifestReference;
  task: ShadowTask;
};

async function runManualCriteria(options: {
  evaluatorModule: string;
  caseRoot: string;
  runs: InternalExecution[];
}) {
  await mkdir(options.caseRoot, { recursive: true });
  const inputPath = join(options.caseRoot, "manual-evaluator-input.json");
  await writeFile(inputPath, jsonText({
    evaluatorModule: options.evaluatorModule,
    eval: options.runs[0]?.task.eval ?? [],
    runs: options.runs.map((run) => ({
      id: run.taskId,
      workDir: run.workDir,
      initialWorkdirManifest: run.manifestReference,
    })),
  }), "utf8");
  const child = Bun.spawn([
    process.execPath,
    resolve(import.meta.dir, "automatic-structural-manual-checker.ts"),
    "--input",
    inputPath,
  ], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`manual evaluator subprocess failed: ${stderr.trim()}`);
  return z.record(z.string(), z.record(z.string(), z.object({
    status: z.enum(["pass", "fail", "infrastructure-failure"]),
    details: z.string().optional(),
  }).strict())).parse(JSON.parse(stdout.trim()));
}

function resolveExecutionProvider(rootDir: string, catalog: RestrictedDomainPlanShadowCatalog) {
  const previous = process.env.SKVM_CACHE;
  process.env.SKVM_CACHE = containedPath(rootDir, catalog.model.cacheRoot);
  invalidateConfigCache();
  try {
    const route = resolveRoute(catalog.model.modelId);
    const apiKey = resolveRouteApiKey(route);
    if (route.kind !== "openai-compatible" || !route.baseUrl) {
      throw new Error("restricted Domain Plan execution requires an openai-compatible route with baseUrl");
    }
    if (!apiKey) throw new Error("restricted Domain Plan execution route has no API key");
    return { baseUrl: route.baseUrl, apiKey, backendModel: resolveBackendModel(catalog.model.modelId) };
  } finally {
    if (previous === undefined) delete process.env.SKVM_CACHE;
    else process.env.SKVM_CACHE = previous;
    invalidateConfigCache();
  }
}

export async function runRestrictedDomainPlanShadow(options: {
  rootDir: string;
  catalog: RestrictedDomainPlanShadowCatalog;
  preModelFreeze: RestrictedDomainPlanPreModelFreeze;
  outDir: string;
  measurementCompletedAt: string;
  meteredHumanMinutes: number;
  preModelFreezePath?: string;
  complete?: (input: {
    caseId: string;
    request: RestrictedDomainPlanRequest;
  }) => Promise<Awaited<ReturnType<typeof completeRestrictedDomainPlanOnce>>>;
}) : Promise<RestrictedDomainPlanShadowReport> {
  const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(options.catalog);
  const freeze = RestrictedDomainPlanPreModelFreezeSchema.parse(options.preModelFreeze);
  assertMeasurementStartNotFuture(catalog.measurementStartedAt);
  if (freeze.measurementStartedAt !== catalog.measurementStartedAt) {
    throw new Error("restricted Domain Plan measurement identity drift");
  }
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt);
  if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) throw new Error("measurement completion precedes start");
  const freezePath = options.preModelFreezePath
    ?? "results/skill-ir/automatic-domain-plan-shadow-v1/pre-model-freeze.json";
  const freezeBytes = await readPinned(options.rootDir, {
    path: freezePath,
    sha256: sha256Bytes(Buffer.from(jsonText(freeze), "utf8")),
  });
  if (freeze.catalogSha256 !== sha256Bytes(Buffer.from(jsonText(catalog), "utf8"))) throw new Error("pre-model catalog identity drift");
  await verifyRestrictedDomainPlanImplementationIdentity(options.rootDir, freeze.implementation);
  const prepared = await prepareCases(options.rootDir, catalog);
  const provider = options.complete ? null : resolveExecutionProvider(options.rootDir, catalog);
  if (provider) verifyRestrictedDomainPlanProviderIdentity(provider, freeze.modelRoute);
  const executionRoot = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-shadow-"));
  const synthesis = new Map<string, z.infer<typeof SynthesisRecordSchema>>();
  const plans = new Map<string, RestrictedDomainPlan>();
  const candidates = new Map<string, Awaited<ReturnType<typeof constructDomainSkillCandidates>>>();
  try {
    // Complete and persist every plan before loading any evaluator module.
    for (const entry of prepared) {
      const frozenRequest = freeze.requests.find((request) => request.caseId === entry.config.caseId)!;
      const requestSha256 = sha256Bytes(Buffer.from(jsonText(entry.request), "utf8"));
      if (requestSha256 !== frozenRequest.requestSha256) throw new Error(`request drift for ${entry.config.caseId}`);
      const candidate = await constructDomainSkillCandidates(options.rootDir, entry.generation);
      if (sha256Bytes(Buffer.from(jsonText(candidate), "utf8")) !== entry.candidateDigest) {
        throw new Error(`candidate drift for ${entry.config.caseId}`);
      }
      candidates.set(entry.config.caseId, candidate);
      let usage: z.infer<typeof TokenUsageSchema> | null = null;
      let durationMs: number | null = null;
      let leakageAudit: "passed" | "failed" | "not-run" = "not-run";
      let bindingAudit: "passed" | "failed" | "not-run" = "not-run";
      try {
        const completion = options.complete
          ? await options.complete({ caseId: entry.config.caseId, request: entry.request })
          : await completeRestrictedDomainPlanOnce({
              ...provider!,
              request: entry.request,
              timeoutMs: catalog.model.timeoutMs,
            });
        usage = completion.tokens;
        durationMs = completion.durationMs;
        try {
          auditRestrictedDomainPlanLeakage(completion.plan, entry.forbidden);
          leakageAudit = "passed";
        } catch (error) {
          leakageAudit = "failed";
          throw Object.assign(error instanceof Error ? error : new Error(String(error)), { domainFailureCode: "task-data-leakage" });
        }
        try {
          await assertPlanBindsToBothTasks({ root: executionRoot, prepared: entry, candidate, plan: completion.plan });
          bindingAudit = "passed";
        } catch (error) {
          bindingAudit = "failed";
          throw Object.assign(error instanceof Error ? error : new Error(String(error)), { domainFailureCode: "binding-invalid" });
        }
        const planText = jsonText(completion.plan);
        const planSha256 = sha256Bytes(Buffer.from(planText, "utf8"));
        await atomicWrite(resolve(options.outDir, "plans", `${entry.config.caseId}.json`), planText);
        plans.set(entry.config.caseId, completion.plan);
        synthesis.set(entry.config.caseId, SynthesisRecordSchema.parse({
          status: "succeeded",
          paidCalls: 1,
          providerAttempts: 1,
          usageStatus: "reported",
          tokens: usage,
          durationMs,
          requestSha256,
          planSha256,
          planLoc: planText.split(/\r?\n/u).length,
          stepCount: completion.plan.steps.length,
          leakageAudit,
          twoTaskBindingAudit: bindingAudit,
          failureCode: "none",
          failureDigest: null,
        }));
      } catch (error) {
        const code = (error as { domainFailureCode?: string }).domainFailureCode;
        synthesis.set(entry.config.caseId, SynthesisRecordSchema.parse({
          status: "failed",
          paidCalls: 1,
          providerAttempts: 1,
          usageStatus: usage ? "reported" : "unavailable",
          tokens: usage,
          durationMs,
          requestSha256,
          planSha256: null,
          planLoc: 0,
          stepCount: 0,
          leakageAudit,
          twoTaskBindingAudit: bindingAudit,
          failureCode: code === "task-data-leakage" ? "task-data-leakage"
            : code === "binding-invalid" ? "binding-invalid" : "provider-or-parse",
          failureDigest: failureDigest(error),
        }));
      }
    }

    const executions = new Map<string, InternalExecution[]>();
    for (const entry of prepared) {
      const plan = plans.get(entry.config.caseId);
      if (!plan) continue;
      const candidate = candidates.get(entry.config.caseId)!;
      const caseRuns: InternalExecution[] = [];
      for (const [role, task] of [["construction", entry.constructionTask], ["transfer", entry.transferTask]] as const) {
        const taskRoot = join(executionRoot, entry.config.caseId, "execution", task.id);
        const workDir = join(taskRoot, "workdir");
        await materializeTask(workDir, task);
        const manifestReference = await writeInitialWorkdirManifest({
          workDir,
          manifestPath: join(taskRoot, "initial-workdir-manifest.json"),
        });
        const initialManifest = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
        const binding = entry.config.bindingsByTask.find((candidateBinding) => candidateBinding.taskId === task.id)!;
        const structuralPlan = compileStructuralExecutionPlan(candidate, binding.bindings);
        const packageRecord = await buildRestrictedDomainPlanPackage({
          packageDir: join(taskRoot, "package"),
          candidate,
          structuralPlan,
          domainPlan: plan,
          initialManifest,
          sourceBytes: entry.sourceBytes,
          taskId: task.id,
          taskPrompt: task.prompt,
        });
        const runtime = await runValidatedArtifactPlan({ package: packageRecord, workDir });
        const processNode = runtime.nodes.find((node) => node.id === "execute-domain-plan");
        const generatedPaths = [];
        for (const path of writeOperationPaths(plan)) {
          try {
            const stat = await Bun.file(containedPath(workDir, path)).exists();
            if (stat) generatedPaths.push(path);
          } catch {
            // A missing optional output is represented by absence.
          }
        }
        caseRuns.push({
          taskId: task.id,
          role,
          packageStatus: runtime.status,
          processStatus: processNode?.status ?? "not-run",
          validationStatus: runtime.validation?.status ?? "not-produced",
          validationErrorCodes: runtime.validation?.errors.map((error) => error.code) ?? [],
          protectedInputsPreserved: await protectedInputsPreserved(workDir, initialManifest.entries),
          generatedPaths,
          packageManifestSha256: sha256Bytes(await readFile(join(packageRecord.packageDir, "package-manifest.json"))),
          packageBytes: packageRecord.packageBytes,
          manualCriteria: [],
          manualPassedCriteria: 0,
          manualCriterionCount: 0,
          workDir,
          manifestReference,
          task,
        });
      }
      executions.set(entry.config.caseId, caseRuns);
    }

    let manualEvaluatorModuleLoads = 0;
    for (const entry of prepared) {
      const runs = executions.get(entry.config.caseId);
      if (!runs) continue;
      await readPinned(options.rootDir, entry.config.manualEvaluatorModule);
      const manual = await runManualCriteria({
        evaluatorModule: containedPath(options.rootDir, entry.config.manualEvaluatorModule.path),
        caseRoot: join(executionRoot, entry.config.caseId, "manual"),
        runs,
      });
      manualEvaluatorModuleLoads += 1;
      for (const run of runs) {
        const result = manual[run.taskId];
        if (!result) throw new Error(`manual evaluator omitted task ${run.taskId}`);
        run.manualCriteria = Object.entries(result).map(([id, value]) => ({ id, status: value.status }));
        run.manualCriterionCount = run.manualCriteria.length;
        run.manualPassedCriteria = run.manualCriteria.filter((criterion) => criterion.status === "pass").length;
      }
    }

    const structuralPredicates = new Set(["input-integrity", "output-presence", "exact-output-set", "json-shape"]);
    const cases = prepared.map((entry) => {
      const synthesisRecord = synthesis.get(entry.config.caseId)!;
      const plan = plans.get(entry.config.caseId);
      const internalRuns = executions.get(entry.config.caseId) ?? [];
      const taskExecutions = internalRuns.map(({ workDir: _workDir, manifestReference: _manifest, task: _task, ...run }) => run);
      const declaredDomainPredicateIds = entry.description.passCriteria
        .filter((criterion) => !structuralPredicates.has(criterion.predicate))
        .map((criterion) => criterion.id);
      const automaticEligibility = taskExecutions.length === 2 && taskExecutions.every((task) =>
        task.packageStatus === "complete"
        && task.manualCriterionCount > 0
        && task.manualPassedCriteria === task.manualCriterionCount);
      return DomainPlanCaseReportSchema.parse({
        caseId: entry.config.caseId,
        constructionTaskId: entry.constructionTask.id,
        transferTaskId: entry.transferTask.id,
        synthesis: synthesisRecord,
        planOperations: plan ? [...new Set(plan.steps.map((step) => step.op))] : [],
        declaredDomainPredicateIds,
        establishedDomainPredicateParity: [],
        unimplementedDomainPredicateIds: declaredDomainPredicateIds,
        taskExecutions,
        transferPlanExecutable: taskExecutions.find((task) => task.role === "transfer")?.processStatus === "complete",
        automaticEligibility,
        semanticParity: "not-established",
      });
    });
    const transferExecutableCases = cases.filter((entry) => entry.transferPlanExecutable).length;
    const operationSets = cases.filter((entry) => entry.synthesis.status === "succeeded")
      .map((entry) => new Set(entry.planOperations));
    const sharedPrimitiveFamilies = operationSets.length === 2
      ? [...operationSets[0]!].filter((operation) => operationSets[1]!.has(operation))
      : [];
    const taskExecutions = cases.flatMap((entry) => entry.taskExecutions);
    const report = RestrictedDomainPlanShadowReportSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan-shadow-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: freeze.catalogSha256,
      preModelFreeze: { path: freezePath, sha256: sha256Bytes(freezeBytes) },
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      planFreezeCompletedBeforeManualEvaluatorModuleLoad: true,
      cases,
      reuseGate: {
        status: transferExecutableCases === 2 ? "passed" : "failed",
        requiredDistinctCases: 2,
        distinctTransferExecutableCases: transferExecutableCases,
        sharedPrimitiveFamilies,
        coreBranchDelta: 0,
        semanticParity: "not-established",
      },
      accounting: {
        modelGeneratedPlanLoc: cases.reduce((sum, entry) => sum + entry.synthesis.planLoc, 0),
        caseSpecificBindingPaths: catalog.cases.reduce((sum, entry) => sum + entry.bindingsByTask
          .reduce((subtotal, binding) => subtotal + binding.bindings.reduce((count, target) => count + target.paths.length, 0), 0), 0),
        meteredHumanMinutes: options.meteredHumanMinutes,
        adapterLoc: 0,
        coreBranchDelta: 0,
      },
      summary: {
        caseCount: 2,
        synthesisSucceeded: cases.filter((entry) => entry.synthesis.status === "succeeded").length,
        transferExecutableCases,
        packagePassingExecutions: taskExecutions.filter((entry) => entry.packageStatus === "complete").length,
        manualPassedCriteria: taskExecutions.reduce((sum, entry) => sum + entry.manualPassedCriteria, 0),
        manualCriterionCount: taskExecutions.reduce((sum, entry) => sum + entry.manualCriterionCount, 0),
        automaticEligibilityCases: cases.filter((entry) => entry.automaticEligibility).length,
        paidCalls: 2,
        retries: 0,
        heldOutAccesses: 0,
        evaluatorPayloadsSentToModel: 0,
        manualEvaluatorModuleLoads,
        coreBranchDelta: 0,
        semanticParity: "not-established",
      },
    });
    await writeFile(resolve(options.outDir, "report.json"), jsonText(report), "utf8");
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
