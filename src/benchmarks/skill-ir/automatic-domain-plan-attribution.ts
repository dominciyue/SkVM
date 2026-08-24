import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { invalidateConfigCache } from "../../core/config";
import { InitialWorkdirManifestSchema, snapshotWorkdir } from "../../core/workdir-manifest";
import { resolveBackendModel, resolveRoute, resolveRouteApiKey } from "../../providers/registry";
import { ThinTaskDescriptionSchema, constructDomainSkillCandidates } from "./automatic-domain-construction";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  DomainAutomaticConstructionShadowReportSchema,
} from "./automatic-domain-construction-shadow";
import {
  auditRestrictedDomainPlanLeakage,
  buildRestrictedDomainPlanCompletionPayload,
  buildRestrictedDomainPlanRequest,
  completeRestrictedDomainPlanOnce,
  deriveForbiddenTaskDataLiterals,
  RestrictedDomainPlanRequestSchema,
  RestrictedDomainPlanSynthesisError,
  RestrictedDomainPlanSynthesisFailureClassSchema,
  RestrictedDomainPlanSynthesisFailureStageSchema,
  RestrictedDomainPlanToolSchemaModeSchema,
  SanitizedProviderResponseMetadataSchema,
  type RestrictedDomainPlanRequest,
  type RestrictedDomainPlanToolSchemaMode,
} from "./automatic-domain-plan-synthesis";
import { buildRestrictedDomainPlanTransportRequest, RestrictedDomainPlanTransportReportSchema } from "./automatic-domain-plan-transport-qualification";
import { RestrictedDomainPlanSchema, validateRestrictedDomainPlanBindings, type RestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import { deriveRestrictedDomainPlanBindings } from "./automatic-restricted-domain-plan-runtime";
import { compileStructuralExecutionPlan, StructuralTargetBindingSchema } from "./automatic-structural-execution";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const ParentTaskBindingSchema = z.object({
  taskId: IdentifierSchema,
  bindings: z.array(StructuralTargetBindingSchema),
}).strict();

const ParentShadowCatalogProjectionSchema = z.object({
  automaticDomainCatalog: DigestRefSchema,
  automaticDomainReport: DigestRefSchema,
  model: z.object({ modelId: z.string(), cacheRoot: SafePathSchema }).passthrough(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    taskSet: DigestRefSchema,
    constructionTaskId: IdentifierSchema,
    transferTaskId: IdentifierSchema,
    publicContractFixturePaths: z.array(SafePathSchema).min(1),
    bindingsByTask: z.array(ParentTaskBindingSchema).length(2),
  }).passthrough()).min(1),
}).passthrough();

const ParentShadowReportProjectionSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-shadow-report/v1"),
  summary: z.object({ paidCalls: z.literal(2) }).passthrough(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    synthesis: z.object({ failureCode: z.literal("provider-or-parse") }).passthrough(),
  }).passthrough()).length(2),
}).passthrough();

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.literal("development"),
    prompt: z.string().min(1),
    fixtures: z.record(z.string()),
  }).passthrough()).min(2),
}).passthrough();

export const RestrictedDomainPlanAttributionCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-attribution-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  parentShadowCatalog: DigestRefSchema,
  parentShadowReport: DigestRefSchema,
  transportQualificationReport: DigestRefSchema,
  caseId: IdentifierSchema,
  model: z.object({
    modelId: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/u),
    cacheRoot: SafePathSchema,
    timeoutMs: z.number().int().min(60_000).max(900_000),
    maximumPaidCalls: z.literal(3),
    retries: z.literal(0),
  }).strict(),
}).strict();

export type RestrictedDomainPlanAttributionCatalog = z.infer<typeof RestrictedDomainPlanAttributionCatalogSchema>;

const AttributionStageIdSchema = z.enum(["context-minimal", "context-strict", "task-bound-strict"]);
type AttributionStageId = z.infer<typeof AttributionStageIdSchema>;

const FrozenStageSchema = z.object({
  stageId: AttributionStageIdSchema,
  incrementalChange: z.enum(["real-skill-and-thin-declaration", "strict-domain-plan-tool-schema", "construction-task-and-two-task-binding"]),
  toolSchemaMode: RestrictedDomainPlanToolSchemaModeSchema,
  requestSha256: Sha256Schema,
  providerPayloadSha256: Sha256Schema,
  requestChars: z.number().int().positive(),
  providerPayloadChars: z.number().int().positive(),
  expectedPlanSha256: Sha256Schema.nullable(),
  taskPayloadAccesses: z.union([z.literal(0), z.literal(1)]),
}).strict();

export const RestrictedDomainPlanAttributionFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-attribution-freeze/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  parents: z.object({
    shadowCatalog: DigestRefSchema,
    shadowReport: DigestRefSchema,
    transportQualificationReport: DigestRefSchema,
  }).strict(),
  case: z.object({
    caseId: IdentifierSchema,
    source: DigestRefSchema,
    taskDescription: DigestRefSchema,
    taskSet: DigestRefSchema,
    candidateDigest: Sha256Schema,
    constructionTaskId: IdentifierSchema,
    transferTaskId: IdentifierSchema,
  }).strict(),
  implementation: z.array(DigestRefSchema).min(1),
  modelRoute: z.object({
    modelId: z.string(),
    backendModel: z.string(),
    routeKind: z.literal("openai-compatible"),
    baseUrlSha256: Sha256Schema,
  }).strict(),
  stages: z.array(FrozenStageSchema).length(3),
  authorization: z.object({
    executeAllowed: z.literal(true),
    maximumPaidCalls: z.literal(3),
    retries: z.literal(0),
    executeAllStagesIndependently: z.literal(true),
  }).strict(),
  summary: z.object({
    stageCount: z.literal(3),
    paidCalls: z.literal(0),
    authorizedPaidCalls: z.literal(3),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((freeze, context) => {
  const expected = ["context-minimal", "context-strict", "task-bound-strict"];
  if (freeze.stages.some((stage, index) => stage.stageId !== expected[index])) {
    context.addIssue({ code: "custom", message: "attribution stages are not in frozen progressive order" });
  }
});

export type RestrictedDomainPlanAttributionFreeze = z.infer<typeof RestrictedDomainPlanAttributionFreezeSchema>;

const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.literal(0),
}).strict();

const ProviderFailureSchema = z.object({
  stage: RestrictedDomainPlanSynthesisFailureStageSchema,
  failureClass: RestrictedDomainPlanSynthesisFailureClassSchema,
  durationMs: z.number().nonnegative(),
  detailDigest: Sha256Schema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
}).strict();

const PostParseAuditsSchema = z.object({
  leakage: z.enum(["passed", "failed", "not-run"]),
  constructionBinding: z.enum(["passed", "failed", "not-run"]),
  transferBinding: z.enum(["passed", "failed", "not-run"]),
  failureDigest: Sha256Schema.nullable(),
}).strict();

const StageObservationSchema = z.object({
  stageId: AttributionStageIdSchema,
  toolSchemaMode: RestrictedDomainPlanToolSchemaModeSchema,
  requestSha256: Sha256Schema,
  providerPayloadSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  paidCalls: z.literal(1),
  providerAttempts: z.literal(1),
  usageStatus: z.enum(["reported", "unavailable"]),
  tokens: TokenUsageSchema.nullable(),
  durationMs: z.number().nonnegative(),
  responseMetadata: SanitizedProviderResponseMetadataSchema,
  returnedPlanSha256: Sha256Schema.nullable(),
  canonicalPlanMatched: z.boolean().nullable(),
  failure: ProviderFailureSchema.nullable(),
  postParseAudits: PostParseAuditsSchema,
}).strict().superRefine((stage, context) => {
  if (stage.status === "passed") {
    if (!stage.tokens || stage.usageStatus !== "reported" || !stage.returnedPlanSha256 || stage.failure) {
      context.addIssue({ code: "custom", message: "passed attribution stage lacks completion evidence" });
    }
  } else if (stage.tokens || stage.usageStatus !== "unavailable" || stage.returnedPlanSha256 || !stage.failure) {
    context.addIssue({ code: "custom", message: "failed attribution stage lacks typed failure evidence" });
  }
});

const FailureOrPassSchema = z.union([z.literal("passed"), RestrictedDomainPlanSynthesisFailureClassSchema]);

export const RestrictedDomainPlanAttributionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-attribution-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  preModelFreezeSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  status: z.enum([
    "plan-produced",
    "engineering-blocker-localized",
    "persistent-domain-plan-generation-failure",
    "inconclusive-infrastructure",
  ]),
  stages: z.array(StageObservationSchema).length(3),
  bisection: z.object({
    priorTaskFreeTransport: z.literal("passed"),
    realContextRequest: FailureOrPassSchema,
    strictToolSchema: FailureOrPassSchema,
    taskBoundGeneration: z.union([z.literal("plan-produced"), RestrictedDomainPlanSynthesisFailureClassSchema]),
    twoTaskBinding: z.enum(["passed", "failed", "not-run"]),
  }).strict(),
  generatedPlan: DigestRefSchema.nullable(),
  historicalTaskFailuresReclassified: z.literal(false),
  semanticParity: z.literal("not-established"),
  eligibilityChanged: z.literal(false),
  summary: z.object({
    paidCalls: z.literal(3),
    retries: z.literal(0),
    taskPayloadCalls: z.literal(1),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    rawProviderBodiesPersisted: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict();

export type RestrictedDomainPlanAttributionReport = z.infer<typeof RestrictedDomainPlanAttributionReportSchema>;

const AttributionPrefixSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-attribution-prefix/v1"),
  catalogSha256: Sha256Schema,
  stages: z.array(StageObservationSchema).max(3),
  safeGeneratedPlan: RestrictedDomainPlanSchema.nullable(),
}).strict();

type PreparedAttribution = {
  source: z.infer<typeof DigestRefSchema>;
  taskDescription: z.infer<typeof DigestRefSchema>;
  taskSetRef: z.infer<typeof DigestRefSchema>;
  sourceText: string;
  descriptionText: string;
  description: z.infer<typeof ThinTaskDescriptionSchema>;
  taskSet: z.infer<typeof TaskSetSchema>;
  constructionTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  transferTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  candidateDigest: string;
  generationInput: z.infer<typeof DomainAutomaticConstructionShadowCatalogSchema>["cases"][number]["generationInput"];
  caseConfig: z.infer<typeof ParentShadowCatalogProjectionSchema>["cases"][number];
  requests: Array<{
    stageId: AttributionStageId;
    incrementalChange: z.infer<typeof FrozenStageSchema>["incrementalChange"];
    request: RestrictedDomainPlanRequest;
    toolSchemaMode: RestrictedDomainPlanToolSchemaMode;
    expectedPlan: RestrictedDomainPlan | null;
    taskPayloadAccesses: 0 | 1;
  }>;
  forbidden: string[];
};

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-synthesis.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification.ts",
  "src/benchmarks/skill-ir/automatic-domain-construction.ts",
  "src/benchmarks/skill-ir/automatic-domain-construction-shadow.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-runtime.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-attribution.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-attribution-run.ts",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const candidate = resolve(rootDir, SafePathSchema.parse(path));
  const fromRoot = relative(resolve(rootDir), candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes repository root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function resolveCatalogRoute(rootDir: string, catalog: RestrictedDomainPlanAttributionCatalog) {
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

function routeIdentity(rootDir: string, catalog: RestrictedDomainPlanAttributionCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) throw new Error("attribution requires openai-compatible route");
  return {
    modelId: catalog.model.modelId,
    backendModel: resolveBackendModel(catalog.model.modelId),
    routeKind: "openai-compatible" as const,
    baseUrlSha256: sha256Bytes(Buffer.from(route.baseUrl, "utf8")),
  };
}

function resolveProvider(rootDir: string, catalog: RestrictedDomainPlanAttributionCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) throw new Error("attribution requires openai-compatible route");
  const apiKey = resolveRouteApiKey(route);
  if (!apiKey) throw new Error("attribution route has no API key");
  return { baseUrl: route.baseUrl, apiKey, backendModel: resolveBackendModel(catalog.model.modelId) };
}

async function prepareAttribution(rootDir: string, catalog: RestrictedDomainPlanAttributionCatalog): Promise<PreparedAttribution> {
  const [parentCatalogBytes, parentReportBytes, transportReportBytes] = await Promise.all([
    readPinned(rootDir, catalog.parentShadowCatalog),
    readPinned(rootDir, catalog.parentShadowReport),
    readPinned(rootDir, catalog.transportQualificationReport),
  ]);
  const parentCatalog = ParentShadowCatalogProjectionSchema.parse(JSON.parse(parentCatalogBytes.toString("utf8")));
  const parentReport = ParentShadowReportProjectionSchema.parse(JSON.parse(parentReportBytes.toString("utf8")));
  const transport = RestrictedDomainPlanTransportReportSchema.parse(JSON.parse(transportReportBytes.toString("utf8")));
  if (transport.status !== "passed" || !transport.canonicalPlanMatched) throw new Error("task-free transport parent is not passed");
  if (!parentReport.cases.every((entry) => entry.synthesis.failureCode === "provider-or-parse")) {
    throw new Error("historical shadow parent no longer has the frozen merged attribution gap");
  }
  const caseConfig = parentCatalog.cases.find((entry) => entry.caseId === catalog.caseId);
  if (!caseConfig) throw new Error(`parent shadow is missing case ${catalog.caseId}`);
  const [domainCatalogBytes, domainReportBytes] = await Promise.all([
    readPinned(rootDir, parentCatalog.automaticDomainCatalog),
    readPinned(rootDir, parentCatalog.automaticDomainReport),
  ]);
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(domainCatalogBytes.toString("utf8")));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(domainReportBytes.toString("utf8")));
  const generation = domainCatalog.cases.find((entry) => entry.caseId === catalog.caseId)?.generationInput;
  const candidateDigest = domainReport.generationFreeze.find((entry) => entry.caseId === catalog.caseId)?.candidateDigest;
  if (!generation || !candidateDigest) throw new Error(`automatic domain parent is missing ${catalog.caseId}`);
  const [sourceBytes, descriptionBytes, taskSetBytes] = await Promise.all([
    readPinned(rootDir, generation.source),
    readPinned(rootDir, generation.taskDescription),
    readPinned(rootDir, caseConfig.taskSet),
  ]);
  const sourceText = sourceBytes.toString("utf8");
  const descriptionText = descriptionBytes.toString("utf8");
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionText));
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  const constructionTask = taskSet.tasks.find((task) => task.id === caseConfig.constructionTaskId);
  const transferTask = taskSet.tasks.find((task) => task.id === caseConfig.transferTaskId);
  if (!constructionTask || !transferTask) throw new Error("attribution task pair is incomplete");
  const canonical = buildRestrictedDomainPlanTransportRequest();
  const contextRequest = RestrictedDomainPlanRequestSchema.parse({
    ...canonical.request,
    prompt: [
      canonical.request.prompt,
      "# Diagnostic public context (do not use it to alter the canonical plan above)",
      "## Public SKILL.md",
      sourceText,
      "## Thin task declaration",
      JSON.stringify(description, null, 2),
    ].join("\n\n"),
  });
  const taskRequest = buildRestrictedDomainPlanRequest({
    sourceText,
    taskDescription: description,
    constructionTask,
    publicContractFixturePaths: caseConfig.publicContractFixturePaths,
  });
  return {
    source: generation.source,
    taskDescription: generation.taskDescription,
    taskSetRef: caseConfig.taskSet,
    sourceText,
    descriptionText,
    description,
    taskSet,
    constructionTask,
    transferTask,
    candidateDigest,
    generationInput: generation,
    caseConfig,
    requests: [
      { stageId: "context-minimal", incrementalChange: "real-skill-and-thin-declaration", request: contextRequest, toolSchemaMode: "shape-minimal", expectedPlan: canonical.expectedPlan, taskPayloadAccesses: 0 },
      { stageId: "context-strict", incrementalChange: "strict-domain-plan-tool-schema", request: contextRequest, toolSchemaMode: "domain-plan-strict", expectedPlan: canonical.expectedPlan, taskPayloadAccesses: 0 },
      { stageId: "task-bound-strict", incrementalChange: "construction-task-and-two-task-binding", request: taskRequest, toolSchemaMode: "domain-plan-strict", expectedPlan: null, taskPayloadAccesses: 1 },
    ],
    forbidden: deriveForbiddenTaskDataLiterals({
      sourceText,
      taskDescriptionText: descriptionText,
      prompt: constructionTask.prompt,
      fixtures: constructionTask.fixtures,
      publicContractFixturePaths: caseConfig.publicContractFixturePaths,
    }),
  };
}

function frozenStages(prepared: PreparedAttribution, backendModel: string): Array<z.infer<typeof FrozenStageSchema>> {
  return prepared.requests.map((stage) => {
    const requestText = jsonText(stage.request);
    const payloadText = jsonText(buildRestrictedDomainPlanCompletionPayload({
      backendModel,
      request: stage.request,
      toolSchemaMode: stage.toolSchemaMode,
    }));
    return FrozenStageSchema.parse({
      stageId: stage.stageId,
      incrementalChange: stage.incrementalChange,
      toolSchemaMode: stage.toolSchemaMode,
      requestSha256: sha256Bytes(Buffer.from(requestText, "utf8")),
      providerPayloadSha256: sha256Bytes(Buffer.from(payloadText, "utf8")),
      requestChars: requestText.length,
      providerPayloadChars: payloadText.length,
      expectedPlanSha256: stage.expectedPlan
        ? sha256Bytes(Buffer.from(jsonText(stage.expectedPlan), "utf8"))
        : null,
      taskPayloadAccesses: stage.taskPayloadAccesses,
    });
  });
}

export async function buildRestrictedDomainPlanAttributionFreeze(
  rootDir: string,
  rawCatalog: RestrictedDomainPlanAttributionCatalog,
  outDir: string,
): Promise<RestrictedDomainPlanAttributionFreeze> {
  const catalog = RestrictedDomainPlanAttributionCatalogSchema.parse(rawCatalog);
  if (Date.parse(catalog.measurementStartedAt) > Date.now()) throw new Error("attribution measurement start is in the future");
  const prepared = await prepareAttribution(rootDir, catalog);
  const route = routeIdentity(rootDir, catalog);
  const candidate = await constructDomainSkillCandidates(rootDir, prepared.generationInput);
  if (sha256Bytes(Buffer.from(jsonText(candidate), "utf8")) !== prepared.candidateDigest) throw new Error("automatic candidate identity drift");
  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const freeze = RestrictedDomainPlanAttributionFreezeSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-attribution-freeze/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementStartedAt: catalog.measurementStartedAt,
    parents: {
      shadowCatalog: catalog.parentShadowCatalog,
      shadowReport: catalog.parentShadowReport,
      transportQualificationReport: catalog.transportQualificationReport,
    },
    case: {
      caseId: catalog.caseId,
      source: { path: prepared.source.path, sha256: prepared.source.sha256 },
      taskDescription: { path: prepared.taskDescription.path, sha256: prepared.taskDescription.sha256 },
      taskSet: prepared.taskSetRef,
      candidateDigest: prepared.candidateDigest,
      constructionTaskId: prepared.constructionTask.id,
      transferTaskId: prepared.transferTask.id,
    },
    implementation,
    modelRoute: route,
    stages: frozenStages(prepared, route.backendModel),
    authorization: { executeAllowed: true, maximumPaidCalls: 3, retries: 0, executeAllStagesIndependently: true },
    summary: {
      stageCount: 3,
      paidCalls: 0,
      authorizedPaidCalls: 3,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    },
  });
  await atomicWrite(resolve(outDir, "pre-model-freeze.json"), jsonText(freeze));
  return freeze;
}

async function materializeTask(workDir: string, task: PreparedAttribution["constructionTask"]): Promise<z.infer<typeof InitialWorkdirManifestSchema>> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(task.fixtures)) {
    const destination = containedPath(workDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  return InitialWorkdirManifestSchema.parse({ schemaVersion: "skvm-initial-workdir-manifest/v1", entries: await snapshotWorkdir(workDir) });
}

async function auditTaskBinding(options: {
  root: string;
  prepared: PreparedAttribution;
  candidate: Awaited<ReturnType<typeof constructDomainSkillCandidates>>;
  plan: RestrictedDomainPlan;
  task: PreparedAttribution["constructionTask"];
}): Promise<void> {
  const workDir = join(options.root, options.task.id);
  const initialManifest = await materializeTask(workDir, options.task);
  const targetBindings = options.prepared.caseConfig.bindingsByTask.find((entry) => entry.taskId === options.task.id)?.bindings;
  if (!targetBindings) throw new Error(`missing binding for ${options.task.id}`);
  const structuralPlan = compileStructuralExecutionPlan(options.candidate, targetBindings);
  validateRestrictedDomainPlanBindings(options.plan, deriveRestrictedDomainPlanBindings(structuralPlan, initialManifest));
}

function failureObservation(
  frozen: z.infer<typeof FrozenStageSchema>,
  error: RestrictedDomainPlanSynthesisError,
): z.infer<typeof StageObservationSchema> {
  return StageObservationSchema.parse({
    stageId: frozen.stageId,
    toolSchemaMode: frozen.toolSchemaMode,
    requestSha256: frozen.requestSha256,
    providerPayloadSha256: frozen.providerPayloadSha256,
    status: "failed",
    paidCalls: 1,
    providerAttempts: 1,
    usageStatus: "unavailable",
    tokens: null,
    durationMs: error.durationMs,
    responseMetadata: error.responseMetadata,
    returnedPlanSha256: null,
    canonicalPlanMatched: null,
    failure: {
      stage: error.stage,
      failureClass: error.failureClass,
      durationMs: error.durationMs,
      detailDigest: error.detailDigest,
      httpStatus: error.httpStatus,
    },
    postParseAudits: { leakage: "not-run", constructionBinding: "not-run", transferBinding: "not-run", failureDigest: null },
  });
}

function bisectionValue(stage: z.infer<typeof StageObservationSchema>) {
  return stage.status === "passed" ? "passed" as const : stage.failure!.failureClass;
}

export async function runRestrictedDomainPlanAttribution(options: {
  rootDir: string;
  catalog: RestrictedDomainPlanAttributionCatalog;
  freeze: RestrictedDomainPlanAttributionFreeze;
  freezePath: string;
  outDir: string;
  measurementCompletedAt?: string;
  complete?: (input: {
    stageId: AttributionStageId;
    request: RestrictedDomainPlanRequest;
    toolSchemaMode: RestrictedDomainPlanToolSchemaMode;
  }) => Promise<Awaited<ReturnType<typeof completeRestrictedDomainPlanOnce>>>;
}): Promise<RestrictedDomainPlanAttributionReport> {
  const catalog = RestrictedDomainPlanAttributionCatalogSchema.parse(options.catalog);
  const freeze = RestrictedDomainPlanAttributionFreezeSchema.parse(options.freeze);
  const freezeBytes = await readFile(options.freezePath);
  if (sha256Bytes(freezeBytes) !== sha256Bytes(Buffer.from(jsonText(freeze), "utf8"))) throw new Error("attribution freeze file identity drift");
  if (freeze.catalogSha256 !== sha256Bytes(Buffer.from(jsonText(catalog), "utf8"))) throw new Error("attribution catalog identity drift");
  await Promise.all(freeze.implementation.map((ref) => readPinned(options.rootDir, ref)));
  const currentRoute = routeIdentity(options.rootDir, catalog);
  if (jsonText(currentRoute) !== jsonText(freeze.modelRoute)) throw new Error("attribution provider identity drift");
  const prepared = await prepareAttribution(options.rootDir, catalog);
  const currentStages = frozenStages(prepared, currentRoute.backendModel);
  if (jsonText(currentStages) !== jsonText(freeze.stages)) throw new Error("attribution request identity drift");
  const candidate = await constructDomainSkillCandidates(options.rootDir, prepared.generationInput);
  if (sha256Bytes(Buffer.from(jsonText(candidate), "utf8")) !== freeze.case.candidateDigest) throw new Error("attribution candidate identity drift");
  const provider = options.complete ? null : resolveProvider(options.rootDir, catalog);
  const prefixPath = resolve(options.outDir, "attribution-prefix.json");
  let prefix = AttributionPrefixSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-attribution-prefix/v1",
    catalogSha256: freeze.catalogSha256,
    stages: [],
    safeGeneratedPlan: null,
  });
  try {
    prefix = AttributionPrefixSchema.parse(JSON.parse(await readFile(prefixPath, "utf8")));
    if (prefix.catalogSha256 !== freeze.catalogSha256) throw new Error("attribution prefix catalog drift");
    prefix.stages.forEach((stage, index) => {
      if (stage.stageId !== freeze.stages[index]?.stageId
        || stage.requestSha256 !== freeze.stages[index]?.requestSha256
        || stage.providerPayloadSha256 !== freeze.stages[index]?.providerPayloadSha256) {
        throw new Error("attribution prefix is not a strict frozen prefix");
      }
    });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) throw error;
  }
  const bindingRoot = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-attribution-binding-"));
  try {
    for (let index = prefix.stages.length; index < prepared.requests.length; index += 1) {
      const stage = prepared.requests[index]!;
      const frozen = freeze.stages[index]!;
      let observation: z.infer<typeof StageObservationSchema>;
      try {
        const completion = options.complete
          ? await options.complete({ stageId: stage.stageId, request: stage.request, toolSchemaMode: stage.toolSchemaMode })
          : await completeRestrictedDomainPlanOnce({
              ...provider!,
              request: stage.request,
              toolSchemaMode: stage.toolSchemaMode,
              timeoutMs: catalog.model.timeoutMs,
            });
        const returnedPlanSha256 = sha256Bytes(Buffer.from(jsonText(completion.plan), "utf8"));
        const postParseAudits = {
          leakage: "not-run" as "passed" | "failed" | "not-run",
          constructionBinding: "not-run" as "passed" | "failed" | "not-run",
          transferBinding: "not-run" as "passed" | "failed" | "not-run",
          failureDigest: null as string | null,
        };
        if (stage.stageId === "task-bound-strict") {
          try {
            auditRestrictedDomainPlanLeakage(completion.plan, prepared.forbidden);
            postParseAudits.leakage = "passed";
            prefix.safeGeneratedPlan = completion.plan;
          } catch (error) {
            postParseAudits.leakage = "failed";
            postParseAudits.failureDigest = sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
          }
          if (postParseAudits.leakage === "passed") {
            try {
              await auditTaskBinding({ root: bindingRoot, prepared, candidate, plan: completion.plan, task: prepared.constructionTask });
              postParseAudits.constructionBinding = "passed";
            } catch (error) {
              postParseAudits.constructionBinding = "failed";
              postParseAudits.failureDigest ??= sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
            }
            try {
              await auditTaskBinding({ root: bindingRoot, prepared, candidate, plan: completion.plan, task: prepared.transferTask });
              postParseAudits.transferBinding = "passed";
            } catch (error) {
              postParseAudits.transferBinding = "failed";
              postParseAudits.failureDigest ??= sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
            }
          }
        }
        observation = StageObservationSchema.parse({
          stageId: stage.stageId,
          toolSchemaMode: stage.toolSchemaMode,
          requestSha256: frozen.requestSha256,
          providerPayloadSha256: frozen.providerPayloadSha256,
          status: "passed",
          paidCalls: 1,
          providerAttempts: completion.providerAttempts,
          usageStatus: "reported",
          tokens: completion.tokens,
          durationMs: completion.durationMs,
          responseMetadata: completion.responseMetadata,
          returnedPlanSha256,
          canonicalPlanMatched: stage.expectedPlan
            ? returnedPlanSha256 === frozen.expectedPlanSha256
            : null,
          failure: null,
          postParseAudits,
        });
      } catch (error) {
        if (!(error instanceof RestrictedDomainPlanSynthesisError)) throw error;
        observation = failureObservation(frozen, error);
      }
      prefix.stages.push(observation);
      await atomicWrite(prefixPath, jsonText(AttributionPrefixSchema.parse(prefix)));
    }
    if (prefix.stages.length !== 3) throw new Error("attribution prefix is incomplete");
    const [contextStage, strictStage, taskStage] = prefix.stages;
    const binding = taskStage!.postParseAudits;
    const twoTaskBinding = binding.constructionBinding === "passed" && binding.transferBinding === "passed"
      ? "passed" as const
      : binding.constructionBinding === "not-run" && binding.transferBinding === "not-run"
        ? "not-run" as const
        : "failed" as const;
    const anyInfrastructure = prefix.stages.some((stage) => stage.failure?.failureClass === "http-or-network");
    const status = taskStage!.status === "passed"
      ? "plan-produced" as const
      : anyInfrastructure
        ? "inconclusive-infrastructure" as const
        : contextStage!.status === "passed" && strictStage!.status === "passed"
          ? "persistent-domain-plan-generation-failure" as const
          : "engineering-blocker-localized" as const;
    let generatedPlan: z.infer<typeof DigestRefSchema> | null = null;
    if (prefix.safeGeneratedPlan) {
      const path = resolve(options.outDir, "generated-plan.json");
      const text = jsonText(prefix.safeGeneratedPlan);
      await atomicWrite(path, text);
      generatedPlan = {
        path: relative(options.rootDir, path).replaceAll("\\", "/"),
        sha256: sha256Bytes(Buffer.from(text, "utf8")),
      };
    }
    const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
    if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) throw new Error("attribution completion precedes start");
    const report = RestrictedDomainPlanAttributionReportSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan-attribution-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: freeze.catalogSha256,
      preModelFreezeSha256: sha256Bytes(freezeBytes),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      status,
      stages: prefix.stages,
      bisection: {
        priorTaskFreeTransport: "passed",
        realContextRequest: bisectionValue(contextStage!),
        strictToolSchema: bisectionValue(strictStage!),
        taskBoundGeneration: taskStage!.status === "passed" ? "plan-produced" : taskStage!.failure!.failureClass,
        twoTaskBinding,
      },
      generatedPlan,
      historicalTaskFailuresReclassified: false,
      semanticParity: "not-established",
      eligibilityChanged: false,
      summary: {
        paidCalls: 3,
        retries: 0,
        taskPayloadCalls: 1,
        heldOutAccesses: 0,
        evaluatorPayloadAccesses: 0,
        rawProviderBodiesPersisted: 0,
        coreBranchDelta: 0,
      },
    });
    await atomicWrite(resolve(options.outDir, "report.json"), jsonText(report));
    return report;
  } finally {
    await rm(bindingRoot, { recursive: true, force: true });
  }
}
