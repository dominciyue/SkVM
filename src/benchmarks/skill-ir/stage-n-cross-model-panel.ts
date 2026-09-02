import { z } from "zod";
import { ExecutionFailureClassificationSchema, type ExecutionFailureClassification } from "./execution-resilience";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const FrozenFileSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const FamilySchema = z.enum(["gpt", "claude", "deepseek"]);
const SkillSchema = z.enum(["api-tester", "env-manager-v3"]);

export const StageNSmokeClassificationSchema = ExecutionFailureClassificationSchema;

export const StageNCrossModelPanelLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-n-cross-model-aot-stability-panel-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("skill-ir-stage-n-cross-model-aot-stability-001"),
  models: z.tuple([
    z.object({ family: z.literal("gpt"), route: z.string().min(1) }).strict(),
    z.object({ family: z.literal("claude"), route: z.string().min(1) }).strict(),
    z.object({ family: z.literal("deepseek"), route: z.string().min(1) }).strict(),
  ]),
  skills: z.tuple([
    z.object({
      skillId: z.literal("api-tester"), sourceLock: FrozenFileSchema, originalEvidence: FrozenFileSchema,
      taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    }).strict(),
    z.object({
      skillId: z.literal("env-manager-v3"), sourceLock: FrozenFileSchema, originalEvidence: FrozenFileSchema,
      costEvidence: FrozenFileSchema, taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    }).strict(),
  ]),
  harness: z.object({
    adapter: z.literal("pi"), adapterVersion: z.literal("0.67.68"), adapterConfig: z.literal("managed"),
    environment: z.literal("windows"), context: z.literal("clean"),
    absoluteTimeoutMs: z.number().int().positive(), idleTimeoutMs: z.number().int().positive(),
    maxSteps: z.number().int().positive(), outerWatchdogMs: z.number().int().positive(),
  }).strict(),
  denominator: z.object({
    skills: z.literal(2), tasksPerSkill: z.literal(2), repetitions: z.literal(2), families: z.literal(3),
    originalRows: z.literal(24), artifactRows: z.literal(8), logicalRows: z.literal(32),
  }).strict(),
  smoke: z.object({
    rowsPerFamilyPerSkill: z.literal(1), expectedRows: z.literal(6), retries: z.literal(0), reserve: z.literal(0),
  }).strict(),
  matrix: z.object({
    authorized: z.literal(false), originalRows: z.literal(24), artifactRows: z.literal(8),
    logicalRows: z.literal(32), paidOriginalRows: z.literal(16),
  }).strict(),
  claims: z.object({
    heldOutAllowed: z.literal(false), promotionAllowed: z.literal(false), readinessMutationAllowed: z.literal(false),
    claim: z.literal("AOT removes runtime model"),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, context) => {
  const families = new Set(lock.models.map((item) => item.family));
  if (families.size !== 3) context.addIssue({ code: z.ZodIssueCode.custom, message: "Stage N model family denominator drift" });
  if (lock.skills[0].taskIds.length !== 2 || lock.skills[1].taskIds.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Stage N task denominator drift" });
  }
  if (lock.denominator.originalRows !== lock.denominator.skills * lock.denominator.tasksPerSkill
    * lock.denominator.repetitions * lock.denominator.families) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Stage N original denominator drift" });
  }
  if (lock.denominator.logicalRows !== lock.denominator.originalRows + lock.denominator.artifactRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Stage N logical denominator drift" });
  }
  if (lock.matrix.authorized || lock.matrix.logicalRows !== lock.denominator.logicalRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Stage N matrix is not frozen as unauthorized" });
  }
});

export type StageNCrossModelPanelLock = z.infer<typeof StageNCrossModelPanelLockSchema>;
export type StageNFamily = z.infer<typeof FamilySchema>;
export type StageNSkill = z.infer<typeof SkillSchema>;

export const StageNSmokeRowSchema = z.object({
  family: FamilySchema,
  skillId: SkillSchema,
  route: z.string().min(1),
  taskId: z.string().min(1),
  mode: z.enum(["digest-bind", "execute"]),
  status: z.enum(["complete", "failed"]),
  usageAvailable: z.boolean(),
  classification: StageNSmokeClassificationSchema,
  detail: z.string().min(1),
}).strict();
export type StageNSmokeRow = z.infer<typeof StageNSmokeRowSchema>;

export const StageNSmokeQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-n-cross-model-aot-stability-smoke/v1"),
  experimentId: z.literal("skill-ir-stage-n-cross-model-aot-stability-001"),
  lockSha256: Sha256Schema,
  expectedRows: z.literal(6),
  observedRows: z.number().int().nonnegative(),
  rows: z.array(StageNSmokeRowSchema),
  eligibleFamilies: z.array(FamilySchema),
  excludedFamilies: z.array(FamilySchema),
  status: z.enum(["passed", "failed"]),
  matrixAuthorized: z.literal(false),
  paidCalls: z.number().int().nonnegative(),
  claimBoundary: z.literal("Smoke qualification only; no quality, matrix, held-out, promotion, readiness, or stability claim."),
}).strict();
export type StageNSmokeQualification = z.infer<typeof StageNSmokeQualificationSchema>;

function rowKey(row: Pick<StageNSmokeRow, "family" | "skillId">): string {
  return `${row.family}\0${row.skillId}`;
}

const EXPECTED_KEYS = [
  "gpt\0api-tester", "gpt\0env-manager-v3", "claude\0api-tester", "claude\0env-manager-v3",
  "deepseek\0api-tester", "deepseek\0env-manager-v3",
];

export function buildStageNSmokeQualification(input: {
  lock: StageNCrossModelPanelLock;
  lockSha256: string;
  rows: StageNSmokeRow[];
}): StageNSmokeQualification {
  const lock = StageNCrossModelPanelLockSchema.parse(input.lock);
  const lockSha256 = Sha256Schema.parse(input.lockSha256);
  const rows = input.rows.map((row) => StageNSmokeRowSchema.parse(row));
  const keys = rows.map(rowKey);
  if (new Set(keys).size !== keys.length) throw new Error("Stage N duplicate smoke row");
  if (rows.length !== lock.smoke.expectedRows) throw new Error("Stage N smoke denominator is incomplete");
  if (keys.some((key) => !EXPECTED_KEYS.includes(key)) || EXPECTED_KEYS.some((key) => !keys.includes(key))) {
    throw new Error("Stage N smoke denominator or family/skill binding drift");
  }
  for (const row of rows) {
    const model = lock.models.find((item) => item.family === row.family)!;
    const skill = lock.skills.find((item) => item.skillId === row.skillId)!;
    if (row.route !== model.route || row.taskId !== skill.taskIds[0]) throw new Error(`Stage N smoke binding drift: ${row.family}/${row.skillId}`);
    if (row.family === "gpt" && row.mode !== "digest-bind") throw new Error("Stage N GPT smoke must use digest-bind");
    if (row.family !== "gpt" && row.mode !== "execute") throw new Error("Stage N non-GPT smoke must execute");
    if (row.status === "complete" && row.classification !== "semantic-complete") throw new Error("Stage N complete smoke classification drift");
  }
  const eligibleFamilies = lock.models.map((model) => model.family).filter((family) => {
    const familyRows = rows.filter((row) => row.family === family);
    return familyRows.length === 2 && familyRows.every((row) => row.status === "complete" && row.usageAvailable
      && row.classification === "semantic-complete");
  });
  const excludedFamilies = lock.models.map((model) => model.family).filter((family) => !eligibleFamilies.includes(family));
  return StageNSmokeQualificationSchema.parse({
    schemaVersion: "skill-ir-stage-n-cross-model-aot-stability-smoke/v1",
    experimentId: lock.experimentId,
    lockSha256,
    expectedRows: lock.smoke.expectedRows,
    observedRows: rows.length,
    rows,
    eligibleFamilies,
    excludedFamilies,
    status: eligibleFamilies.length === lock.models.length ? "passed" : "failed",
    matrixAuthorized: false,
    paidCalls: rows.filter((row) => row.mode === "execute").length,
    claimBoundary: "Smoke qualification only; no quality, matrix, held-out, promotion, readiness, or stability claim.",
  });
}

export function assertStageNMatrixDenied(): never {
  throw new Error("Stage N matrix is not authorized: smoke result requires explicit user review before paid matrix");
}

export type StageNClaimBoundary = "AOT removes runtime model";
