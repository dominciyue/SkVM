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
  RestrictedDomainPlanSynthesisError,
  RestrictedDomainPlanSynthesisFailureClassSchema,
  RestrictedDomainPlanSynthesisFailureStageSchema,
  SanitizedProviderResponseMetadataSchema,
  type RestrictedDomainPlanRequest,
} from "./automatic-domain-plan-synthesis";
import {
  validateRestrictedDomainPlanBindings,
  type RestrictedDomainPlan,
} from "./automatic-restricted-domain-plan";
import { deriveRestrictedDomainPlanBindings } from "./automatic-restricted-domain-plan-runtime";
import { auditRestrictedDomainPlanStaticTypes } from "./automatic-restricted-domain-plan-static-types";
import { compileStructuralExecutionPlan, StructuralTargetBindingSchema } from "./automatic-structural-execution";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const ParentShadowCatalogSchema = z.object({
  automaticDomainCatalog: DigestRefSchema,
  automaticDomainReport: DigestRefSchema,
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    taskSet: DigestRefSchema,
    constructionTaskId: IdentifierSchema,
    transferTaskId: IdentifierSchema,
    publicContractFixturePaths: z.array(SafePathSchema).min(1),
    bindingsByTask: z.array(z.object({
      taskId: IdentifierSchema,
      bindings: z.array(StructuralTargetBindingSchema),
    }).strict()).length(2),
  }).passthrough()).min(1),
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

export const SingleDomainPlanGenerationCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-single-generation-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  parentShadowCatalog: DigestRefSchema,
  caseId: IdentifierSchema,
  model: z.object({
    modelId: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/u),
    cacheRoot: SafePathSchema,
    timeoutMs: z.number().int().min(60_000).max(900_000),
    maximumPaidCalls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
}).strict();

export type SingleDomainPlanGenerationCatalog = z.infer<typeof SingleDomainPlanGenerationCatalogSchema>;

const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.literal(0),
}).strict();

export const SingleDomainPlanGenerationFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-single-generation-freeze/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  parents: z.object({
    shadowCatalog: DigestRefSchema,
    automaticDomainCatalog: DigestRefSchema,
    automaticDomainReport: DigestRefSchema,
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
  implementation: z.array(DigestRefSchema).length(9),
  modelRoute: z.object({
    modelId: z.string(),
    backendModel: z.string(),
    routeKind: z.literal("openai-compatible"),
    baseUrlSha256: Sha256Schema,
  }).strict(),
  request: z.object({
    toolSchemaMode: z.literal("domain-plan-strict"),
    requestSha256: Sha256Schema,
    providerPayloadSha256: Sha256Schema,
    requestChars: z.number().int().positive(),
    providerPayloadChars: z.number().int().positive(),
    forbiddenTaskDataLiteralCount: z.number().int().positive(),
  }).strict(),
  authorization: z.object({
    executeAllowed: z.literal(true),
    maximumPaidCalls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
  summary: z.object({
    paidCalls: z.literal(0),
    authorizedPaidCalls: z.literal(1),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict();

export type SingleDomainPlanGenerationFreeze = z.infer<typeof SingleDomainPlanGenerationFreezeSchema>;

const AuditStatusSchema = z.enum(["passed", "failed", "not-run"]);

export const SingleDomainPlanGenerationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-single-generation-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  preModelFreezeSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  caseId: IdentifierSchema,
  status: z.enum([
    "plan-produced",
    "provider-failure",
    "leakage-rejected",
    "binding-rejected",
    "static-type-rejected",
  ]),
  usageStatus: z.enum(["reported", "unavailable"]),
  tokens: TokenUsageSchema.nullable(),
  durationMs: z.number().nonnegative(),
  responseMetadata: SanitizedProviderResponseMetadataSchema,
  providerFailure: z.object({
    stage: RestrictedDomainPlanSynthesisFailureStageSchema,
    failureClass: RestrictedDomainPlanSynthesisFailureClassSchema,
    detailDigest: Sha256Schema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
  }).strict().nullable(),
  audits: z.object({
    leakage: AuditStatusSchema,
    constructionBinding: AuditStatusSchema,
    transferBinding: AuditStatusSchema,
    staticTypes: AuditStatusSchema,
  }).strict(),
  auditFailureDigest: Sha256Schema.nullable(),
  staticTypeIssueCount: z.number().int().nonnegative(),
  generatedPlan: DigestRefSchema.nullable(),
  summary: z.object({
    paidCalls: z.literal(1),
    providerAttempts: z.literal(1),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    rawProviderBodiesPersisted: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (report.status === "plan-produced") {
    if (!report.generatedPlan || report.providerFailure || !report.tokens || report.usageStatus !== "reported"
      || Object.values(report.audits).some((status) => status !== "passed")
      || report.auditFailureDigest || report.staticTypeIssueCount !== 0) {
      context.addIssue({ code: "custom", message: "produced plan lacks complete safe audit evidence" });
    }
  } else if (report.generatedPlan) {
    context.addIssue({ code: "custom", message: "rejected generation cannot persist a plan" });
  }
  if (report.status === "provider-failure" && (!report.providerFailure || report.tokens || report.usageStatus !== "unavailable")) {
    context.addIssue({ code: "custom", message: "provider failure accounting is incomplete" });
  }
});

export type SingleDomainPlanGenerationReport = z.infer<typeof SingleDomainPlanGenerationReportSchema>;

type PreparedGeneration = {
  caseConfig: z.infer<typeof ParentShadowCatalogSchema>["cases"][number];
  source: z.infer<typeof DigestRefSchema>;
  taskDescription: z.infer<typeof DigestRefSchema>;
  sourceText: string;
  descriptionText: string;
  description: z.infer<typeof ThinTaskDescriptionSchema>;
  taskSet: z.infer<typeof TaskSetSchema>;
  constructionTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  transferTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  candidateDigest: string;
  generationInput: z.infer<typeof DomainAutomaticConstructionShadowCatalogSchema>["cases"][number]["generationInput"];
  request: RestrictedDomainPlanRequest;
  forbidden: string[];
  parents: {
    automaticDomainCatalog: z.infer<typeof DigestRefSchema>;
    automaticDomainReport: z.infer<typeof DigestRefSchema>;
  };
};

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-synthesis.ts",
  "src/benchmarks/skill-ir/automatic-domain-construction.ts",
  "src/benchmarks/skill-ir/automatic-domain-construction-shadow.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-runtime.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-single-generation.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-single-generation-run.ts",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
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

function routeIdentity(rootDir: string, catalog: SingleDomainPlanGenerationCatalog) {
  const previous = process.env.SKVM_CACHE;
  process.env.SKVM_CACHE = containedPath(rootDir, catalog.model.cacheRoot);
  invalidateConfigCache();
  try {
    const route = resolveRoute(catalog.model.modelId);
    if (route.kind !== "openai-compatible" || !route.baseUrl) {
      throw new Error("single Domain Plan generation requires an openai-compatible route");
    }
    return {
      modelId: catalog.model.modelId,
      backendModel: resolveBackendModel(catalog.model.modelId),
      routeKind: "openai-compatible" as const,
      baseUrlSha256: sha256Bytes(Buffer.from(route.baseUrl, "utf8")),
    };
  } finally {
    if (previous === undefined) delete process.env.SKVM_CACHE;
    else process.env.SKVM_CACHE = previous;
    invalidateConfigCache();
  }
}

function provider(rootDir: string, catalog: SingleDomainPlanGenerationCatalog) {
  const previous = process.env.SKVM_CACHE;
  process.env.SKVM_CACHE = containedPath(rootDir, catalog.model.cacheRoot);
  invalidateConfigCache();
  try {
    const route = resolveRoute(catalog.model.modelId);
    if (route.kind !== "openai-compatible" || !route.baseUrl) {
      throw new Error("single Domain Plan generation requires an openai-compatible route");
    }
    const apiKey = resolveRouteApiKey(route);
    if (!apiKey) throw new Error("single Domain Plan generation route has no API key");
    return { baseUrl: route.baseUrl, apiKey, backendModel: resolveBackendModel(catalog.model.modelId) };
  } finally {
    if (previous === undefined) delete process.env.SKVM_CACHE;
    else process.env.SKVM_CACHE = previous;
    invalidateConfigCache();
  }
}

async function prepareGeneration(
  rootDir: string,
  catalog: SingleDomainPlanGenerationCatalog,
): Promise<PreparedGeneration> {
  const parentBytes = await readPinned(rootDir, catalog.parentShadowCatalog);
  const parent = ParentShadowCatalogSchema.parse(JSON.parse(parentBytes.toString("utf8")));
  const caseConfig = parent.cases.find((entry) => entry.caseId === catalog.caseId);
  if (!caseConfig) throw new Error(`parent shadow catalog is missing ${catalog.caseId}`);
  const [domainCatalogBytes, domainReportBytes] = await Promise.all([
    readPinned(rootDir, parent.automaticDomainCatalog),
    readPinned(rootDir, parent.automaticDomainReport),
  ]);
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(domainCatalogBytes.toString("utf8")));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(domainReportBytes.toString("utf8")));
  const generationInput = domainCatalog.cases.find((entry) => entry.caseId === catalog.caseId)?.generationInput;
  const candidateDigest = domainReport.generationFreeze.find((entry) => entry.caseId === catalog.caseId)?.candidateDigest;
  if (!generationInput || !candidateDigest) throw new Error(`automatic domain evidence is missing ${catalog.caseId}`);
  const [sourceBytes, descriptionBytes, taskSetBytes] = await Promise.all([
    readPinned(rootDir, generationInput.source),
    readPinned(rootDir, generationInput.taskDescription),
    readPinned(rootDir, caseConfig.taskSet),
  ]);
  const sourceText = sourceBytes.toString("utf8");
  const descriptionText = descriptionBytes.toString("utf8");
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionText));
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  const constructionTask = taskSet.tasks.find((task) => task.id === caseConfig.constructionTaskId);
  const transferTask = taskSet.tasks.find((task) => task.id === caseConfig.transferTaskId);
  if (!constructionTask || !transferTask) throw new Error("single generation task pair is incomplete");
  const request = buildRestrictedDomainPlanRequest({
    sourceText,
    taskDescription: description,
    constructionTask,
    publicContractFixturePaths: caseConfig.publicContractFixturePaths,
  });
  const forbidden = deriveForbiddenTaskDataLiterals({
    sourceText,
    taskDescriptionText: descriptionText,
    prompt: constructionTask.prompt,
    fixtures: constructionTask.fixtures,
    publicContractFixturePaths: caseConfig.publicContractFixturePaths,
  });
  if (forbidden.length === 0) throw new Error("single generation has no task-data leakage canary");
  return {
    caseConfig,
    source: generationInput.source,
    taskDescription: generationInput.taskDescription,
    sourceText,
    descriptionText,
    description,
    taskSet,
    constructionTask,
    transferTask,
    candidateDigest,
    generationInput,
    request,
    forbidden,
    parents: {
      automaticDomainCatalog: parent.automaticDomainCatalog,
      automaticDomainReport: parent.automaticDomainReport,
    },
  };
}

function requestIdentity(prepared: PreparedGeneration, backendModel: string) {
  const requestText = jsonText(prepared.request);
  const payloadText = jsonText(buildRestrictedDomainPlanCompletionPayload({
    backendModel,
    request: prepared.request,
    toolSchemaMode: "domain-plan-strict",
  }));
  return {
    toolSchemaMode: "domain-plan-strict" as const,
    requestSha256: sha256Bytes(Buffer.from(requestText, "utf8")),
    providerPayloadSha256: sha256Bytes(Buffer.from(payloadText, "utf8")),
    requestChars: requestText.length,
    providerPayloadChars: payloadText.length,
    forbiddenTaskDataLiteralCount: prepared.forbidden.length,
  };
}

export async function buildSingleDomainPlanGenerationFreeze(
  rootDir: string,
  rawCatalog: SingleDomainPlanGenerationCatalog,
  outDir: string,
): Promise<SingleDomainPlanGenerationFreeze> {
  const catalog = SingleDomainPlanGenerationCatalogSchema.parse(rawCatalog);
  if (Date.parse(catalog.measurementStartedAt) > Date.now()) throw new Error("single generation measurement start is in the future");
  const prepared = await prepareGeneration(rootDir, catalog);
  const route = routeIdentity(rootDir, catalog);
  const candidate = await constructDomainSkillCandidates(rootDir, prepared.generationInput);
  if (sha256Bytes(Buffer.from(jsonText(candidate), "utf8")) !== prepared.candidateDigest) {
    throw new Error("single generation automatic candidate identity drift");
  }
  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const coreText = (await Promise.all(IMPLEMENTATION_PATHS.map((path) => readFile(containedPath(rootDir, path), "utf8"))))
    .join("\n");
  if (coreText.includes(`\"${catalog.caseId}\"`)) {
    throw new Error(`single generation implementation contains case-specific branch literal ${catalog.caseId}`);
  }
  const freeze = SingleDomainPlanGenerationFreezeSchema.parse({
    schemaVersion: "skill-ir-domain-plan-single-generation-freeze/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementStartedAt: catalog.measurementStartedAt,
    parents: {
      shadowCatalog: catalog.parentShadowCatalog,
      automaticDomainCatalog: prepared.parents.automaticDomainCatalog,
      automaticDomainReport: prepared.parents.automaticDomainReport,
    },
    case: {
      caseId: catalog.caseId,
      source: { path: prepared.source.path, sha256: prepared.source.sha256 },
      taskDescription: { path: prepared.taskDescription.path, sha256: prepared.taskDescription.sha256 },
      taskSet: prepared.caseConfig.taskSet,
      candidateDigest: prepared.candidateDigest,
      constructionTaskId: prepared.constructionTask.id,
      transferTaskId: prepared.transferTask.id,
    },
    implementation,
    modelRoute: route,
    request: requestIdentity(prepared, route.backendModel),
    authorization: { executeAllowed: true, maximumPaidCalls: 1, retries: 0 },
    summary: {
      paidCalls: 0,
      authorizedPaidCalls: 1,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    },
  });
  await atomicWrite(resolve(outDir, "pre-model-freeze.json"), jsonText(freeze));
  return freeze;
}

async function materializeTask(workDir: string, fixtures: Record<string, string>) {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(fixtures)) {
    const target = containedPath(workDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return InitialWorkdirManifestSchema.parse({
    schemaVersion: "skvm-initial-workdir-manifest/v1",
    entries: await snapshotWorkdir(workDir),
  });
}

async function taskBindingAudit(options: {
  root: string;
  prepared: PreparedGeneration;
  candidate: Awaited<ReturnType<typeof constructDomainSkillCandidates>>;
  plan: RestrictedDomainPlan;
  task: PreparedGeneration["constructionTask"];
}) {
  const workDir = join(options.root, options.task.id);
  const initialManifest = await materializeTask(workDir, options.task.fixtures);
  const binding = options.prepared.caseConfig.bindingsByTask.find((entry) => entry.taskId === options.task.id);
  if (!binding) throw new Error(`single generation is missing task binding ${options.task.id}`);
  const structuralPlan = compileStructuralExecutionPlan(options.candidate, binding.bindings);
  validateRestrictedDomainPlanBindings(options.plan, deriveRestrictedDomainPlanBindings(structuralPlan, initialManifest));
}

function auditDigest(error: unknown): string {
  return sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
}

export async function runSingleDomainPlanGeneration(options: {
  rootDir: string;
  catalog: SingleDomainPlanGenerationCatalog;
  freeze: SingleDomainPlanGenerationFreeze;
  freezePath: string;
  outDir: string;
  measurementCompletedAt?: string;
  complete?: (input: { request: RestrictedDomainPlanRequest }) => Promise<Awaited<ReturnType<typeof completeRestrictedDomainPlanOnce>>>;
}): Promise<SingleDomainPlanGenerationReport> {
  const catalog = SingleDomainPlanGenerationCatalogSchema.parse(options.catalog);
  const freeze = SingleDomainPlanGenerationFreezeSchema.parse(options.freeze);
  const freezeBytes = await readFile(options.freezePath);
  if (sha256Bytes(freezeBytes) !== sha256Bytes(Buffer.from(jsonText(freeze), "utf8"))) {
    throw new Error("single generation freeze file identity drift");
  }
  if (freeze.catalogSha256 !== sha256Bytes(Buffer.from(jsonText(catalog), "utf8"))) {
    throw new Error("single generation catalog identity drift");
  }
  await Promise.all(freeze.implementation.map((entry) => readPinned(options.rootDir, entry)));
  const route = routeIdentity(options.rootDir, catalog);
  if (jsonText(route) !== jsonText(freeze.modelRoute)) throw new Error("single generation provider identity drift");
  const prepared = await prepareGeneration(options.rootDir, catalog);
  if (jsonText(requestIdentity(prepared, route.backendModel)) !== jsonText(freeze.request)) {
    throw new Error("single generation request identity drift");
  }
  const candidate = await constructDomainSkillCandidates(options.rootDir, prepared.generationInput);
  if (sha256Bytes(Buffer.from(jsonText(candidate), "utf8")) !== freeze.case.candidateDigest) {
    throw new Error("single generation candidate identity drift");
  }
  const resolvedProvider = options.complete ? null : provider(options.rootDir, catalog);
  const bindingRoot = await mkdtemp(join(tmpdir(), "skill-ir-single-domain-binding-"));
  let status: z.infer<typeof SingleDomainPlanGenerationReportSchema>["status"] = "provider-failure";
  let usageStatus: "reported" | "unavailable" = "unavailable";
  let tokens: z.infer<typeof TokenUsageSchema> | null = null;
  let durationMs = 0;
  let responseMetadata: z.infer<typeof SanitizedProviderResponseMetadataSchema> = {
    httpStatus: null,
    responseBodyTextLength: null,
    responseBodySha256: null,
    responseJsonParsed: false,
    choiceCount: null,
    finishReason: null,
    assistantContentPresent: null,
    assistantContentTextLength: null,
    toolCallCount: null,
    requestedToolCallPresent: null,
    requestedToolCallArgumentsLength: null,
    usagePresent: null,
  };
  let providerFailure: z.infer<typeof SingleDomainPlanGenerationReportSchema>["providerFailure"] = null;
  const audits = {
    leakage: "not-run",
    constructionBinding: "not-run",
    transferBinding: "not-run",
    staticTypes: "not-run",
  } as {
    leakage: z.infer<typeof AuditStatusSchema>;
    constructionBinding: z.infer<typeof AuditStatusSchema>;
    transferBinding: z.infer<typeof AuditStatusSchema>;
    staticTypes: z.infer<typeof AuditStatusSchema>;
  };
  let auditFailureDigest: string | null = null;
  let staticTypeIssueCount = 0;
  let generatedPlan: z.infer<typeof DigestRefSchema> | null = null;
  try {
    let completion: Awaited<ReturnType<typeof completeRestrictedDomainPlanOnce>>;
    try {
      completion = options.complete
        ? await options.complete({ request: prepared.request })
        : await completeRestrictedDomainPlanOnce({
            ...resolvedProvider!,
            request: prepared.request,
            timeoutMs: catalog.model.timeoutMs,
            toolSchemaMode: "domain-plan-strict",
          });
      usageStatus = "reported";
      tokens = completion.tokens;
      durationMs = completion.durationMs;
      responseMetadata = completion.responseMetadata;
    } catch (error) {
      if (!(error instanceof RestrictedDomainPlanSynthesisError)) throw error;
      durationMs = error.durationMs;
      responseMetadata = error.responseMetadata;
      providerFailure = {
        stage: error.stage,
        failureClass: error.failureClass,
        detailDigest: error.detailDigest,
        httpStatus: error.httpStatus,
      };
      status = "provider-failure";
      completion = undefined as never;
    }
    if (!providerFailure) {
      try {
        auditRestrictedDomainPlanLeakage(completion.plan, prepared.forbidden);
        audits.leakage = "passed";
      } catch (error) {
        audits.leakage = "failed";
        auditFailureDigest = auditDigest(error);
        status = "leakage-rejected";
      }
      if (audits.leakage === "passed") {
        try {
          await taskBindingAudit({ root: bindingRoot, prepared, candidate, plan: completion.plan, task: prepared.constructionTask });
          audits.constructionBinding = "passed";
        } catch (error) {
          audits.constructionBinding = "failed";
          auditFailureDigest ??= auditDigest(error);
        }
        try {
          await taskBindingAudit({ root: bindingRoot, prepared, candidate, plan: completion.plan, task: prepared.transferTask });
          audits.transferBinding = "passed";
        } catch (error) {
          audits.transferBinding = "failed";
          auditFailureDigest ??= auditDigest(error);
        }
        if (audits.constructionBinding === "passed" && audits.transferBinding === "passed") {
          const issues = auditRestrictedDomainPlanStaticTypes(completion.plan);
          staticTypeIssueCount = issues.length;
          audits.staticTypes = issues.length === 0 ? "passed" : "failed";
          if (issues.length === 0) {
            const planPath = resolve(options.outDir, "generated-plan.json");
            const text = jsonText(completion.plan);
            await atomicWrite(planPath, text);
            generatedPlan = {
              path: relative(options.rootDir, planPath).replaceAll("\\", "/"),
              sha256: sha256Bytes(Buffer.from(text, "utf8")),
            };
            status = "plan-produced";
          } else {
            auditFailureDigest = sha256Bytes(Buffer.from(jsonText(issues.map((issue) => issue.code)), "utf8"));
            status = "static-type-rejected";
          }
        } else {
          status = "binding-rejected";
        }
      }
    }
    const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
    if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) {
      throw new Error("single generation completion precedes measurement start");
    }
    if (Date.parse(completedAt) > Date.now()) throw new Error("single generation completion is in the future");
    const report = SingleDomainPlanGenerationReportSchema.parse({
      schemaVersion: "skill-ir-domain-plan-single-generation-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: freeze.catalogSha256,
      preModelFreezeSha256: sha256Bytes(freezeBytes),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      caseId: catalog.caseId,
      status,
      usageStatus,
      tokens,
      durationMs,
      responseMetadata,
      providerFailure,
      audits,
      auditFailureDigest,
      staticTypeIssueCount,
      generatedPlan,
      summary: {
        paidCalls: 1,
        providerAttempts: 1,
        retries: 0,
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
