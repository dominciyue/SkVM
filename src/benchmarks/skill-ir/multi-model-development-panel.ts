import { z } from "zod";
import {
  ExecutionFailureClassificationSchema,
  selectMatchedExecutionBlocks,
  type ExecutionEnvelope,
  type ExecutionFailureClassification,
  type MatchedExecutionBlock,
  type ReplacedExecutionBlock,
} from "./execution-resilience";
import type { ScoredAgentRunRow } from "./scoring";
import type { RealAgentRunPlanEntry } from "./real-agent";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const FrozenFileSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const ModelFamilySchema = z.enum(["gpt", "claude", "deepseek"]);
const ModelSystemSchema = z.enum(["no-skill", "original", "ir-static"]);

export const MultiModelDevelopmentPanelLockSchema = z.object({
  schemaVersion: z.enum([
    "skill-ir-multi-model-development-panel-lock/v1",
    "skill-ir-multi-model-development-panel-lock/v2",
    "skill-ir-multi-model-development-panel-lock/v3",
    "skill-ir-multi-model-development-panel-lock/v4",
  ]),
  status: z.literal("preregistered"),
  experimentId: z.enum([
    "skill-ir-three-family-development-panel-v1",
    "skill-ir-three-family-development-panel-v2",
    "skill-ir-three-family-development-panel-v3",
    "skill-ir-three-family-development-panel-v4",
  ]),
  methodEvidence: z.literal(true),
  models: z.tuple([
    z.object({ route: z.string().min(1), family: z.literal("gpt") }).strict(),
    z.object({ route: z.string().min(1), family: z.literal("claude") }).strict(),
    z.object({ route: z.string().min(1), family: z.literal("deepseek") }).strict(),
  ]),
  cases: z.tuple([
    z.object({
      skillId: z.literal("api-tester"), baseLock: FrozenFileSchema,
      taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    }).strict(),
    z.object({
      skillId: z.literal("env-manager-v3"), baseLock: FrozenFileSchema,
      taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    }).strict(),
  ]),
  frozenImplementations: z.object({
    panelContract: FrozenFileSchema,
    panelPlanner: FrozenFileSchema,
    panelRunner: FrozenFileSchema,
    executionResilience: FrozenFileSchema,
    executionRunner: FrozenFileSchema,
    modelPlanner: FrozenFileSchema,
    scoring: FrozenFileSchema,
    piAdapter: FrozenFileSchema,
    piRuntime: FrozenFileSchema.optional(),
  }).strict(),
  harness: z.object({
    adapter: z.literal("pi"), adapterVersion: z.literal("0.67.68"),
    environment: z.literal("windows"), context: z.literal("clean"), maximumWorkDirLength: z.literal(220),
    packageJson: FrozenFileSchema, bunLock: FrozenFileSchema, piCli: FrozenFileSchema,
    installedPackageJson: z.string().min(1), nodeCommand: z.literal("node"), nodeVersion: z.literal("v23.8.0"),
    nodeExecutableSha256: Sha256Schema, bunVersion: z.literal("1.3.14"),
  }).strict(),
  matrix: z.object({
    modelSystems: z.tuple([
      z.literal("no-skill"), z.literal("original"), z.literal("ir-static"),
    ]),
    targetBlocksPerCell: z.literal(1), reserveBlocksPerCell: z.literal(1),
    expectedSelectedTriplets: z.literal(12), expectedSelectedModelRows: z.literal(36),
    maximumAttemptModelRows: z.literal(72), expectedSharedArtifactRows: z.literal(4),
    expectedLogicalRows: z.literal(40),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"), absoluteTimeoutMs: z.literal(600000),
    idleTimeoutMs: z.literal(120000), maxSteps: z.literal(30), outerWatchdogMs: z.literal(660000),
    retries: z.literal(0),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"), skillId: z.literal("api-tester"), taskId: z.string().min(1),
  }).strict(),
  gate: z.object({
    minimumArtifactMeanScore: z.number().min(0).max(1),
    maximumArtifactHardGateFailures: z.literal(0), maximumArtifactRegressions: z.literal(0),
  }).strict(),
  promotionBoundary: z.object({
    developmentOnly: z.literal(true), entersMainClaim: z.literal(false),
    permitsHeldOutExecution: z.literal(false), permitsPromotion: z.literal(false),
    permitsTokenBreakEven: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, context) => {
  const version = lock.schemaVersion.split("/").at(-1)!;
  if (!lock.experimentId.endsWith(`-${version}`)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "multi-model lock schema and experiment identity mismatch" });
  }
  if (version !== "v1" && lock.frozenImplementations.piRuntime === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `multi-model ${version} must freeze Pi runtime observability` });
  }
  const cells = lock.models.length * lock.cases.reduce((sum, item) => sum + item.taskIds.length, 0);
  const selected = cells * lock.matrix.targetBlocksPerCell * lock.matrix.modelSystems.length;
  const attempted = cells * (lock.matrix.targetBlocksPerCell + lock.matrix.reserveBlocksPerCell)
    * lock.matrix.modelSystems.length;
  const anchors = lock.cases.reduce((sum, item) => sum + item.taskIds.length, 0);
  if (lock.matrix.expectedSelectedTriplets !== cells
    || lock.matrix.expectedSelectedModelRows !== selected
    || lock.matrix.maximumAttemptModelRows !== attempted) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "multi-model selected or attempted model denominator drift" });
  }
  if (lock.matrix.expectedSharedArtifactRows !== anchors
    || lock.matrix.expectedLogicalRows !== selected + anchors) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "multi-model shared artifact denominator drift" });
  }
  if (!lock.cases[0].taskIds.includes(lock.qualification.taskId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "multi-model qualification task drift" });
  }
});

export type MultiModelDevelopmentPanelLock = z.infer<typeof MultiModelDevelopmentPanelLockSchema>;
type ModelFamily = z.infer<typeof ModelFamilySchema>;
type ModelSystem = z.infer<typeof ModelSystemSchema>;

export type MultiModelPanelPlanEntry = RealAgentRunPlanEntry & {
  executionClass: "model-agent" | "direct-deterministic";
  artifactPackageDir?: string;
};

export function buildMultiModelPanelEntries(input: {
  lock: MultiModelDevelopmentPanelLock;
  basePlans: Record<string, RealAgentRunPlanEntry[]>;
  artifactRows: Array<RealAgentRunPlanEntry & { artifactPackageDir: string }>;
}): { modelRows: MultiModelPanelPlanEntry[]; artifactRows: MultiModelPanelPlanEntry[] } {
  const lock = MultiModelDevelopmentPanelLockSchema.parse(input.lock);
  const modelRows: MultiModelPanelPlanEntry[] = [];
  for (const model of lock.models) for (const panelCase of lock.cases) {
    const key = `${model.family}:${panelCase.skillId}`;
    const rows = input.basePlans[key];
    if (!rows) throw new Error(`Multi-model base plan missing: ${key}`);
    for (const taskId of panelCase.taskIds) for (
      let block = 1;
      block <= lock.matrix.targetBlocksPerCell + lock.matrix.reserveBlocksPerCell;
      block += 1
    ) for (const system of lock.matrix.modelSystems) {
      const matches = rows.filter((row) => row.caseId.endsWith(`:${taskId}`)
        && row.runIndex === block && row.system === system);
      if (matches.length !== 1) {
        throw new Error(`Multi-model plan arm mismatch: ${model.family}/${panelCase.skillId}/${taskId}/${block}/${system}`);
      }
      const row = matches[0]!;
      if (row.model !== model.route || row.modelFamily !== model.family
        || row.adapter !== lock.harness.adapter || row.adapterVersion !== lock.harness.adapterVersion
        || row.panelConfigId !== lock.experimentId) {
        throw new Error(`Multi-model plan identity drift: ${key}`);
      }
      modelRows.push({ ...row, executionClass: "model-agent" });
    }
  }
  if (modelRows.length !== lock.matrix.maximumAttemptModelRows) {
    throw new Error(`Multi-model candidate row denominator drift: ${modelRows.length}`);
  }

  const artifactRows: MultiModelPanelPlanEntry[] = [];
  for (const panelCase of lock.cases) for (const taskId of panelCase.taskIds) {
    const matches = input.artifactRows.filter((row) => row.caseId.endsWith(`:${taskId}`));
    if (matches.length !== 1) throw new Error(`Multi-model shared artifact row mismatch: ${panelCase.skillId}/${taskId}`);
    const row = matches[0]!;
    if (row.model !== "direct-deterministic" || row.modelFamily !== "none"
      || row.runIndex !== 1 || row.panelConfigId !== lock.experimentId) {
      throw new Error(`Multi-model shared artifact identity drift: ${panelCase.skillId}/${taskId}`);
    }
    artifactRows.push({ ...row, executionClass: "direct-deterministic" });
  }
  if (artifactRows.length !== lock.matrix.expectedSharedArtifactRows) {
    throw new Error(`Multi-model shared artifact denominator drift: ${artifactRows.length}`);
  }
  return { modelRows, artifactRows };
}

type DirectionCounts = { gains: number; equals: number; regressions: number };

export type MultiModelFamilyPanelSummary = {
  route: string;
  selectedRows: number;
  attemptedRows: number;
  semanticCompleteRows: number;
  executionCompatible: boolean;
  failureTaxonomy: Record<ExecutionFailureClassification, number>;
  originalVsNoSkill: DirectionCounts;
  staticVsOriginal: DirectionCounts;
  aggregateTokens: number;
};

export type MultiModelDevelopmentPanelReport = {
  schemaVersion: "skill-ir-multi-model-development-panel-report/v1";
  experimentId: string;
  denominator: "preregistered-selected-logical-row";
  status: "completed" | "blocked";
  counts: {
    expectedSelectedModelRows: number;
    selectedModelRows: number;
    attemptedModelRows: number;
    expectedSharedArtifactRows: number;
    observedSharedArtifactRows: number;
    logicalRows: number;
  };
  selection: {
    complete: boolean;
    selectedTriplets: number;
    replacedTriplets: number;
    replaced: Array<ReplacedExecutionBlock & { modelFamily: ModelFamily; skillId: string }>;
    aborts: Array<{ modelFamily: ModelFamily; skillId: string; taskId: string; reason: string }>;
  };
  modelFamilies: Record<ModelFamily, MultiModelFamilyPanelSummary>;
  artifact: {
    successes: number;
    meanScoreIncludingMissing: number;
    hardGateFailures: number;
    regressionsAgainstModelArms: number;
    gatePassed: boolean;
  };
  interpretation: {
    infrastructureSensitive: boolean;
    executionCompatibleFamilies: ModelFamily[];
    methodDirection: "non-regressing" | "mixed" | "regressing";
    heldOutAllowed: false;
    promotionAllowed: false;
    mainClaimAllowed: false;
  };
};

export const MultiModelDevelopmentPanelQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-multi-model-development-panel-qualification/v1"),
  experimentId: z.literal("skill-ir-three-family-development-panel-v1"),
  lockSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  localPi: z.object({ status: z.enum(["passed", "failed"]), observedVersion: z.string() }).strict(),
  resources: z.tuple([
    z.object({ skillId: z.literal("api-tester"), status: z.enum(["ok", "failed", "unavailable"]) }).strict(),
    z.object({ skillId: z.literal("env-manager-v3"), status: z.enum(["ok", "failed", "unavailable"]) }).strict(),
  ]),
  routes: z.tuple([
    z.object({ family: z.literal("gpt"), route: z.string(), classification: ExecutionFailureClassificationSchema, outputsPresent: z.boolean() }).strict(),
    z.object({ family: z.literal("claude"), route: z.string(), classification: ExecutionFailureClassificationSchema, outputsPresent: z.boolean() }).strict(),
    z.object({ family: z.literal("deepseek"), route: z.string(), classification: ExecutionFailureClassificationSchema, outputsPresent: z.boolean() }).strict(),
  ]),
  claimBoundary: z.literal("Route, Pi, resource, and execution-observability qualification only; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence."),
}).strict();

const QualificationAttemptSchema = z.object({
  candidate: z.union([z.literal(1), z.literal(2)]),
  classification: ExecutionFailureClassificationSchema,
  outputsPresent: z.boolean(),
}).strict();

const QualificationRouteV2Schema = z.object({
  family: ModelFamilySchema,
  route: z.string().min(1),
  attempts: z.array(QualificationAttemptSchema).min(1).max(2),
  selectedCandidate: z.union([z.literal(1), z.literal(2)]).nullable(),
  status: z.enum(["passed", "failed"]),
}).strict();

export const MultiModelDevelopmentPanelQualificationV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-multi-model-development-panel-qualification/v2"),
  experimentId: z.literal("skill-ir-three-family-development-panel-v2"),
  lockSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  localPi: z.object({ status: z.enum(["passed", "failed"]), observedVersion: z.string() }).strict(),
  resources: z.tuple([
    z.object({ skillId: z.literal("api-tester"), status: z.enum(["ok", "failed", "unavailable"]) }).strict(),
    z.object({ skillId: z.literal("env-manager-v3"), status: z.enum(["ok", "failed", "unavailable"]) }).strict(),
  ]),
  routes: z.tuple([
    QualificationRouteV2Schema.extend({ family: z.literal("gpt") }).strict(),
    QualificationRouteV2Schema.extend({ family: z.literal("claude") }).strict(),
    QualificationRouteV2Schema.extend({ family: z.literal("deepseek") }).strict(),
  ]),
  claimBoundary: z.literal("Route, Pi, resource, and execution-observability qualification with one bounded pre-semantic reserve only; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence."),
}).strict();

export type MultiModelDevelopmentPanelQualificationV2 = z.infer<
  typeof MultiModelDevelopmentPanelQualificationV2Schema
>;

export const MultiModelDevelopmentPanelQualificationV3Schema = MultiModelDevelopmentPanelQualificationV2Schema.extend({
  schemaVersion: z.literal("skill-ir-multi-model-development-panel-qualification/v3"),
  experimentId: z.literal("skill-ir-three-family-development-panel-v3"),
}).strict();

export type MultiModelDevelopmentPanelQualificationV3 = z.infer<
  typeof MultiModelDevelopmentPanelQualificationV3Schema
>;

export const MultiModelDevelopmentPanelQualificationV4Schema = MultiModelDevelopmentPanelQualificationV2Schema.extend({
  schemaVersion: z.literal("skill-ir-multi-model-development-panel-qualification/v4"),
  experimentId: z.literal("skill-ir-three-family-development-panel-v4"),
  claimBoundary: z.literal("Infrastructure and execution-observability qualification with one bounded pre-semantic reserve only; task outputs and active execution outcomes are disclosed but never used to preselect models; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence."),
}).strict();

export type MultiModelDevelopmentPanelQualificationV4 = z.infer<
  typeof MultiModelDevelopmentPanelQualificationV4Schema
>;

export function buildMultiModelDevelopmentPanelQualificationV2(input: Omit<
  MultiModelDevelopmentPanelQualificationV2,
  "schemaVersion" | "experimentId" | "status" | "claimBoundary"
>): MultiModelDevelopmentPanelQualificationV2 {
  for (const route of input.routes) {
    const selected = selectMultiModelQualificationAttempt(route.attempts);
    if (route.selectedCandidate !== selected.selectedCandidate
      || route.status !== (selected.passed ? "passed" : "failed")) {
      throw new Error(`Multi-model qualification v2 route selection mismatch: ${route.family}`);
    }
  }
  const passed = input.localPi.status === "passed"
    && input.resources.every((item) => item.status === "ok")
    && input.routes.every((item) => item.status === "passed");
  return MultiModelDevelopmentPanelQualificationV2Schema.parse({
    schemaVersion: "skill-ir-multi-model-development-panel-qualification/v2",
    experimentId: "skill-ir-three-family-development-panel-v2",
    ...input,
    status: passed ? "passed" : "failed",
    claimBoundary: "Route, Pi, resource, and execution-observability qualification with one bounded pre-semantic reserve only; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence.",
  });
}

export function buildMultiModelDevelopmentPanelQualificationV3(input: Omit<
  MultiModelDevelopmentPanelQualificationV3,
  "schemaVersion" | "experimentId" | "status" | "claimBoundary"
>): MultiModelDevelopmentPanelQualificationV3 {
  for (const route of input.routes) {
    const selected = selectMultiModelQualificationAttempt(route.attempts);
    if (route.selectedCandidate !== selected.selectedCandidate
      || route.status !== (selected.passed ? "passed" : "failed")) {
      throw new Error(`Multi-model qualification v3 route selection mismatch: ${route.family}`);
    }
  }
  const passed = input.localPi.status === "passed"
    && input.resources.every((item) => item.status === "ok")
    && input.routes.every((item) => item.status === "passed");
  return MultiModelDevelopmentPanelQualificationV3Schema.parse({
    schemaVersion: "skill-ir-multi-model-development-panel-qualification/v3",
    experimentId: "skill-ir-three-family-development-panel-v3",
    ...input,
    status: passed ? "passed" : "failed",
    claimBoundary: "Route, Pi, resource, and execution-observability qualification with one bounded pre-semantic reserve only; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence.",
  });
}

export function selectMultiModelInfrastructureQualificationAttempt(attempts: Array<{
  candidate: number;
  classification: ExecutionFailureClassification;
  outputsPresent: boolean;
}>): { selectedCandidate: number | null; passed: boolean } {
  if (attempts.length < 1 || attempts.length > 2) {
    throw new Error("Multi-model infrastructure qualification requires one target and at most one reserve attempt");
  }
  const first = attempts[0]!;
  if (first.candidate !== 1) throw new Error("Multi-model qualification target candidate must be 1");
  const eligible = (classification: ExecutionFailureClassification) => classification === "semantic-complete"
    || classification === "active-idle-timeout"
    || classification === "active-absolute-timeout"
    || classification === "step-limit";
  if (eligible(first.classification)) return { selectedCandidate: 1, passed: true };
  const replaceable = first.classification === "transport-transient"
    || first.classification === "empty-terminal"
    || first.classification === "pre-semantic-idle-timeout";
  if (!replaceable || attempts.length === 1) return { selectedCandidate: null, passed: false };
  const second = attempts[1]!;
  if (second.candidate !== 2) throw new Error("Multi-model qualification reserve candidate must be 2");
  return eligible(second.classification)
    ? { selectedCandidate: 2, passed: true }
    : { selectedCandidate: null, passed: false };
}

export function buildMultiModelDevelopmentPanelQualificationV4(input: Omit<
  MultiModelDevelopmentPanelQualificationV4,
  "schemaVersion" | "experimentId" | "status" | "claimBoundary"
>): MultiModelDevelopmentPanelQualificationV4 {
  for (const route of input.routes) {
    const selected = selectMultiModelInfrastructureQualificationAttempt(route.attempts);
    if (route.selectedCandidate !== selected.selectedCandidate
      || route.status !== (selected.passed ? "passed" : "failed")) {
      throw new Error(`Multi-model qualification v4 route selection mismatch: ${route.family}`);
    }
  }
  const passed = input.localPi.status === "passed"
    && input.resources.every((item) => item.status === "ok")
    && input.routes.every((item) => item.status === "passed");
  return MultiModelDevelopmentPanelQualificationV4Schema.parse({
    schemaVersion: "skill-ir-multi-model-development-panel-qualification/v4",
    experimentId: "skill-ir-three-family-development-panel-v4",
    ...input,
    status: passed ? "passed" : "failed",
    claimBoundary: "Infrastructure and execution-observability qualification with one bounded pre-semantic reserve only; task outputs and active execution outcomes are disclosed but never used to preselect models; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence.",
  });
}

export type MultiModelDevelopmentPanelQualification = z.infer<
  typeof MultiModelDevelopmentPanelQualificationSchema
>;

export function selectMultiModelQualificationAttempt(attempts: Array<{
  candidate: number;
  classification: ExecutionFailureClassification;
  outputsPresent: boolean;
}>): { selectedCandidate: number | null; passed: boolean } {
  if (attempts.length < 1 || attempts.length > 2) {
    throw new Error("Multi-model qualification requires one target and at most one reserve attempt");
  }
  const first = attempts[0]!;
  if (first.candidate !== 1) throw new Error("Multi-model qualification target candidate must be 1");
  if (first.classification === "semantic-complete" && first.outputsPresent) {
    return { selectedCandidate: 1, passed: true };
  }
  const replaceable = first.classification === "transport-transient"
    || first.classification === "empty-terminal"
    || first.classification === "pre-semantic-idle-timeout";
  if (!replaceable || attempts.length === 1) return { selectedCandidate: null, passed: false };
  const second = attempts[1]!;
  if (second.candidate !== 2) throw new Error("Multi-model qualification reserve candidate must be 2");
  return second.classification === "semantic-complete" && second.outputsPresent
    ? { selectedCandidate: 2, passed: true }
    : { selectedCandidate: null, passed: false };
}

export function buildMultiModelDevelopmentPanelQualification(input: Omit<
  MultiModelDevelopmentPanelQualification,
  "schemaVersion" | "experimentId" | "status" | "claimBoundary"
>): MultiModelDevelopmentPanelQualification {
  const passed = input.localPi.status === "passed"
    && input.resources.every((item) => item.status === "ok")
    && input.routes.every((item) => item.classification === "semantic-complete" && item.outputsPresent);
  return MultiModelDevelopmentPanelQualificationSchema.parse({
    schemaVersion: "skill-ir-multi-model-development-panel-qualification/v1",
    experimentId: "skill-ir-three-family-development-panel-v1",
    ...input,
    status: passed ? "passed" : "failed",
    claimBoundary: "Route, Pi, resource, and execution-observability qualification only; no scorer ranking, quality, held-out, promotion, or cross-model main-claim evidence.",
  });
}

type PanelTask = { id: string; hardGateIds: string[] };

function cellEnvelopes(
  envelopes: ExecutionEnvelope[], family: ModelFamily, skillId: string, taskId: string,
): ExecutionEnvelope[] {
  const prefix = `${family}:${skillId}:${taskId}:`;
  return envelopes.filter((item) => item.taskId === taskId && item.attemptId.startsWith(prefix));
}

function score(row: ScoredAgentRunRow | undefined): number {
  return row?.evaluatorScore ?? (row?.success ? 1 : 0);
}

function hardGatesPass(row: ScoredAgentRunRow, hardGateIds: string[]): boolean {
  const summaries = new Map((row.evaluationSummary ?? []).filter((item) => item.id)
    .map((item) => [item.id!, item.pass]));
  return hardGateIds.every((id) => summaries.get(id) === true);
}

function emptyTaxonomy(): Record<ExecutionFailureClassification, number> {
  return Object.fromEntries(
    ExecutionFailureClassificationSchema.options.map((item) => [item, 0]),
  ) as Record<ExecutionFailureClassification, number>;
}

function direction(candidate: number, baseline: number, counts: DirectionCounts): void {
  if (candidate > baseline) counts.gains += 1;
  else if (candidate < baseline) counts.regressions += 1;
  else counts.equals += 1;
}

function selectedRow(
  rows: ScoredAgentRunRow[], lock: MultiModelDevelopmentPanelLock, family: ModelFamily,
  skillId: string, taskId: string, system: ModelSystem, block: number,
): ScoredAgentRunRow | undefined {
  const route = lock.models.find((item) => item.family === family)!.route;
  const matches = rows.filter((row) => row.model === route && row.modelFamily === family
    && row.skill === skillId && row.task === taskId && row.system === system
    && row.runIndex === block && row.panelConfigId === lock.experimentId);
  if (matches.length > 1) throw new Error(`Duplicate selected scored row: ${family}/${skillId}/${taskId}/${system}/${block}`);
  return matches[0];
}

export function buildMultiModelDevelopmentPanelReport(input: {
  lock: MultiModelDevelopmentPanelLock;
  qualificationPassed: boolean;
  tasks: PanelTask[];
  envelopes: ExecutionEnvelope[];
  scoredRows: ScoredAgentRunRow[];
}): MultiModelDevelopmentPanelReport {
  const lock = MultiModelDevelopmentPanelLockSchema.parse(input.lock);
  const taskById = new Map(input.tasks.map((item) => [item.id, item]));
  const selected = new Map<string, MatchedExecutionBlock>();
  const replaced: MultiModelDevelopmentPanelReport["selection"]["replaced"] = [];
  const aborts: MultiModelDevelopmentPanelReport["selection"]["aborts"] = [];
  let attemptedModelRows = 0;

  for (const model of lock.models) for (const panelCase of lock.cases) for (const taskId of panelCase.taskIds) {
    if (!taskById.has(taskId)) throw new Error(`Multi-model panel task missing: ${taskId}`);
    const rows = cellEnvelopes(input.envelopes, model.family, panelCase.skillId, taskId);
    attemptedModelRows += rows.length;
    const selection = selectMatchedExecutionBlocks({
      taskIds: [taskId], systems: lock.matrix.modelSystems,
      targetBlocksPerTask: lock.matrix.targetBlocksPerCell,
      reserveBlocksPerTask: lock.matrix.reserveBlocksPerCell, envelopes: rows,
    });
    const cellKey = `${model.family}\0${panelCase.skillId}\0${taskId}`;
    if (selection.selectedBlocks[0]) selected.set(cellKey, selection.selectedBlocks[0]);
    replaced.push(...selection.replacedBlocks.map((item) => ({
      ...item, modelFamily: model.family, skillId: panelCase.skillId,
    })));
    if (!selection.complete) aborts.push({
      modelFamily: model.family, skillId: panelCase.skillId, taskId,
      reason: selection.abortReason ?? "incomplete-selection",
    });
  }

  if (attemptedModelRows > lock.matrix.maximumAttemptModelRows) {
    throw new Error("Multi-model attempted row denominator exceeded");
  }

  const familySummaries = {} as Record<ModelFamily, MultiModelFamilyPanelSummary>;
  for (const model of lock.models) {
    const taxonomy = emptyTaxonomy();
    const originalVsNoSkill: DirectionCounts = { gains: 0, equals: 0, regressions: 0 };
    const staticVsOriginal: DirectionCounts = { gains: 0, equals: 0, regressions: 0 };
    const familyEnvelopes = input.envelopes.filter((item) => item.attemptId.startsWith(`${model.family}:`));
    for (const item of familyEnvelopes) taxonomy[item.classification] += 1;
    let selectedRows = 0;
    let semanticCompleteRows = 0;
    let aggregateTokens = 0;
    for (const panelCase of lock.cases) for (const taskId of panelCase.taskIds) {
      const block = selected.get(`${model.family}\0${panelCase.skillId}\0${taskId}`);
      if (!block) continue;
      selectedRows += lock.matrix.modelSystems.length;
      const selectedEnvelopes = cellEnvelopes(input.envelopes, model.family, panelCase.skillId, taskId)
        .filter((item) => item.candidateBlock === block.candidateBlock);
      semanticCompleteRows += selectedEnvelopes.filter((item) => item.classification === "semantic-complete").length;
      const noSkill = selectedRow(input.scoredRows, lock, model.family, panelCase.skillId, taskId, "no-skill", block.candidateBlock);
      const original = selectedRow(input.scoredRows, lock, model.family, panelCase.skillId, taskId, "original", block.candidateBlock);
      const staticRow = selectedRow(input.scoredRows, lock, model.family, panelCase.skillId, taskId, "ir-static", block.candidateBlock);
      direction(score(original), score(noSkill), originalVsNoSkill);
      direction(score(staticRow), score(original), staticVsOriginal);
      aggregateTokens += [noSkill, original, staticRow].reduce((sum, row) => sum + (row?.tokenCost ?? 0), 0);
    }
    const blockers = taxonomy["qualification-failure"] + taxonomy["parser-incompatible"]
      + taxonomy["runtime-crash"] + taxonomy["active-idle-timeout"]
      + taxonomy["active-absolute-timeout"] + taxonomy["step-limit"]
      + taxonomy["measurement-invalid"];
    familySummaries[model.family] = {
      route: model.route, selectedRows, attemptedRows: familyEnvelopes.length, semanticCompleteRows,
      executionCompatible: blockers === 0 && semanticCompleteRows === selectedRows,
      failureTaxonomy: taxonomy, originalVsNoSkill, staticVsOriginal, aggregateTokens,
    };
  }

  const artifactRows = input.scoredRows.filter((row) => row.system === "validated-artifact"
    && row.model === "direct-deterministic" && row.modelFamily === "none"
    && row.panelConfigId === lock.experimentId);
  const artifactKeys = new Set<string>();
  let artifactHardGateFailures = 0;
  let artifactRegressions = 0;
  let artifactScoreSum = 0;
  for (const panelCase of lock.cases) for (const taskId of panelCase.taskIds) {
    const key = `${panelCase.skillId}\0${taskId}`;
    const matches = artifactRows.filter((row) => row.skill === panelCase.skillId && row.task === taskId && row.runIndex === 1);
    if (matches.length > 1) throw new Error(`Duplicate shared artifact row: ${key}`);
    const artifact = matches[0];
    if (artifact) artifactKeys.add(key);
    const artifactScore = score(artifact);
    artifactScoreSum += artifactScore;
    if (!artifact || !hardGatesPass(artifact, taskById.get(taskId)!.hardGateIds)) artifactHardGateFailures += 1;
    for (const family of ModelFamilySchema.options) {
      const block = selected.get(`${family}\0${panelCase.skillId}\0${taskId}`);
      if (!block) { artifactRegressions += 1; continue; }
      const original = selectedRow(input.scoredRows, lock, family, panelCase.skillId, taskId, "original", block.candidateBlock);
      const staticRow = selectedRow(input.scoredRows, lock, family, panelCase.skillId, taskId, "ir-static", block.candidateBlock);
      if (artifactScore < Math.max(score(original), score(staticRow))
        || ((original?.success || staticRow?.success) && !artifact?.success)) artifactRegressions += 1;
    }
  }
  const artifactMean = artifactScoreSum / lock.matrix.expectedSharedArtifactRows;
  const artifactGate = artifactKeys.size === lock.matrix.expectedSharedArtifactRows
    && artifactMean >= lock.gate.minimumArtifactMeanScore
    && artifactHardGateFailures <= lock.gate.maximumArtifactHardGateFailures
    && artifactRegressions <= lock.gate.maximumArtifactRegressions;
  const selectionComplete = aborts.length === 0 && selected.size === lock.matrix.expectedSelectedTriplets;
  const selectedModelRows = selected.size * lock.matrix.modelSystems.length;
  const executionCompatibleFamilies = ModelFamilySchema.options.filter((family) =>
    familySummaries[family].executionCompatible);
  const regressions = ModelFamilySchema.options.reduce((sum, family) =>
    sum + familySummaries[family].staticVsOriginal.regressions, 0);
  const gains = ModelFamilySchema.options.reduce((sum, family) =>
    sum + familySummaries[family].staticVsOriginal.gains, 0);

  return {
    schemaVersion: "skill-ir-multi-model-development-panel-report/v1",
    experimentId: lock.experimentId,
    denominator: "preregistered-selected-logical-row",
    status: input.qualificationPassed && selectionComplete && artifactKeys.size === lock.matrix.expectedSharedArtifactRows
      ? "completed" : "blocked",
    counts: {
      expectedSelectedModelRows: lock.matrix.expectedSelectedModelRows,
      selectedModelRows, attemptedModelRows,
      expectedSharedArtifactRows: lock.matrix.expectedSharedArtifactRows,
      observedSharedArtifactRows: artifactKeys.size,
      logicalRows: selectedModelRows + artifactKeys.size,
    },
    selection: {
      complete: selectionComplete, selectedTriplets: selected.size,
      replacedTriplets: replaced.length, replaced, aborts,
    },
    modelFamilies: familySummaries,
    artifact: {
      successes: artifactRows.filter((row) => row.success).length,
      meanScoreIncludingMissing: Number(artifactMean.toFixed(4)),
      hardGateFailures: artifactHardGateFailures,
      regressionsAgainstModelArms: artifactRegressions,
      gatePassed: artifactGate,
    },
    interpretation: {
      infrastructureSensitive: replaced.length > 0
        || new Set(ModelFamilySchema.options.map((family) => familySummaries[family].failureTaxonomy["transport-transient"]
          + familySummaries[family].failureTaxonomy["empty-terminal"]
          + familySummaries[family].failureTaxonomy["pre-semantic-idle-timeout"])).size > 1,
      executionCompatibleFamilies,
      methodDirection: regressions === 0 ? "non-regressing" : gains > 0 ? "mixed" : "regressing",
      heldOutAllowed: false, promotionAllowed: false, mainClaimAllowed: false,
    },
  };
}
