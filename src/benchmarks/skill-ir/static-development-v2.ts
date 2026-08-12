import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const StaticDevelopmentV2LockSchema = z.object({
  schemaVersion: z.literal("skill-ir-static-development-lock/v2"),
  status: z.literal("preregistered"),
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  evaluationMode: z.enum(["improvement", "static-fidelity"]),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  skillId: z.string().min(1),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    baseIr: FrozenFileSchema,
    sourceAudit: FrozenFileSchema,
    publicContract: FrozenFileSchema.optional(),
    admissionEvidence: FrozenFileSchema.optional(),
  }).strict(),
  implementation: z.array(FrozenFileSchema).min(1),
  model: z.object({ route: z.string().min(1), family: z.string().min(1) }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.string().min(1) }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.array(z.string().min(1)).min(1),
    targetBlocksPerTask: z.number().int().positive(),
    reserveBlocksPerTask: z.number().int().nonnegative(),
    expectedSelectedRows: z.number().int().positive(),
    expectedSelectedTriplets: z.number().int().positive(),
    maximumAttemptRows: z.number().int().positive(),
    maximumCandidateTriplets: z.number().int().positive(),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    routeProbeTimeoutMs: z.literal(180000),
    resourceProbeRequired: z.literal(true),
    routeProbeRequired: z.literal(true),
    absoluteTimeoutMs: z.number().int().positive(),
    idleTimeoutMs: z.number().int().positive(),
    maxSteps: z.number().int().positive(),
    outerWatchdogMs: z.number().int().positive(),
    adapterConfig: z.literal("managed"),
    maximumWorkDirLength: z.literal(220),
    outputRoot: SafeRelativePathSchema,
  }).strict(),
  gate: z.object({
    minimumIrStaticSuccesses: z.number().int().nonnegative(),
    minimumIrStaticMeanScore: z.number().min(0).max(1),
    maximumActiveExecutionFailures: z.number().int().nonnegative(),
    maximumHardGateRegressions: z.number().int().nonnegative(),
    minimumImprovedPairs: z.number().int().nonnegative(),
    maximumRegressedPairs: z.number().int().nonnegative(),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsDynamicRepair: z.literal(false),
    permitsArtifactPromotion: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsResidualAudit: z.literal(true),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 task ids must be unique" });
  }
  const tasks = lock.matrix.taskIds.length;
  const systems = lock.matrix.systems.length;
  const selectedTriplets = tasks * lock.matrix.targetBlocksPerTask;
  const candidateTriplets = tasks * (lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask);
  if (
    lock.matrix.expectedSelectedTriplets !== selectedTriplets
    || lock.matrix.expectedSelectedRows !== selectedTriplets * systems
    || lock.matrix.maximumCandidateTriplets !== candidateTriplets
    || lock.matrix.maximumAttemptRows !== candidateTriplets * systems
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 denominator arithmetic mismatch" });
  }
  if (
    lock.runtime.absoluteTimeoutMs !== 600000
    || lock.runtime.idleTimeoutMs !== 120000
    || lock.runtime.outerWatchdogMs !== 660000
    || lock.runtime.maxSteps !== 30
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 requires the progress-aware Pi runtime" });
  }
  if (lock.runtime.idleTimeoutMs >= lock.runtime.absoluteTimeoutMs
    || lock.runtime.outerWatchdogMs <= lock.runtime.absoluteTimeoutMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 progress-aware timeout ordering mismatch" });
  }
  if (lock.gate.minimumIrStaticSuccesses > lock.matrix.expectedSelectedTriplets) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 static success gate exceeds denominator" });
  }
});

export type StaticDevelopmentV2Lock = z.infer<typeof StaticDevelopmentV2LockSchema>;
