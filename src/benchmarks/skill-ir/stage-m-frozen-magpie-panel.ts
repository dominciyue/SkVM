import { z } from "zod";
import { MAGPIE_RELEASE_AUDIT_CASE_IDS } from "./magpie-release-audit-step2";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const CaseIdSchema = z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS);
const FamilySchema = z.enum(["gpt", "claude", "deepseek"]);

const FrozenRefSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const RouteSchema = z.object({ family: FamilySchema, route: z.string().min(1) }).strict();
const CaseSchema = z.object({ caseId: CaseIdSchema, split: z.literal("public-development") }).strict();
const UsageSchema = z.object({
  available: z.boolean(),
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
}).strict();

export const StageMFrozenMagpiePanelLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-001"),
  artifact: z.object({
    productConfig: FrozenRefSchema,
    productReport: FrozenRefSchema,
    checker: FrozenRefSchema,
    closureSha256: Sha256Schema,
    checkerAuthority: z.literal("p2-gold-digest-output-regression"),
  }).strict(),
  inputs: z.object({
    measurementTasks: FrozenRefSchema,
    upstreamCommit: z.literal("453dd9f20bdebe9d4458d84682bd707be1414f80"),
    split: z.literal("public-development"),
  }).strict(),
  models: z.tuple([
    RouteSchema.extend({ family: z.literal("gpt") }).strict(),
    RouteSchema.extend({ family: z.literal("claude") }).strict(),
    RouteSchema.extend({ family: z.literal("deepseek") }).strict(),
  ]),
  cases: z.array(CaseSchema).length(MAGPIE_RELEASE_AUDIT_CASE_IDS.length),
  harness: z.object({
    adapter: z.literal("pi"),
    adapterVersion: z.literal("0.67.68"),
    adapterConfig: z.literal("managed"),
    environment: z.literal("windows"),
    context: z.literal("clean"),
    absoluteTimeoutMs: z.literal(600000),
    idleTimeoutMs: z.literal(120000),
    maxSteps: z.literal(30),
    outerWatchdogMs: z.literal(660000),
    retries: z.literal(0),
  }).strict(),
  matrix: z.object({
    modelSystems: z.tuple([z.literal("original")]),
    artifactSystem: z.literal("frozen-artifact"),
    repetitions: z.literal(1),
    expectedCases: z.literal(9),
    expectedModelRows: z.literal(27),
    expectedArtifactRows: z.literal(9),
    expectedLogicalRows: z.literal(36),
    order: z.literal("family-then-case"),
  }).strict(),
  qualification: z.object({
    expectedRowsPerFamily: z.literal(9),
    requiredUsage: z.literal(true),
    matrixRequiresAllFamilies: z.literal(true),
  }).strict(),
  claims: z.object({
    heldOutAllowed: z.literal(false),
    promotionAllowed: z.literal(false),
    readinessMutationAllowed: z.literal(false),
    crossModelGeneralization: z.literal("not-established"),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, context) => {
  if (lock.cases.some((item, index) => item.caseId !== MAGPIE_RELEASE_AUDIT_CASE_IDS[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cases"], message: "Stage M case order must match the frozen Magpie public slice" });
  }
  const expectedModels = new Set(["gpt", "claude", "deepseek"]);
  if (new Set(lock.models.map((item) => item.family)).size !== expectedModels.size) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["models"], message: "Stage M requires exactly one route for each model family" });
  }
  if (lock.matrix.expectedModelRows !== lock.matrix.expectedCases * lock.models.length * lock.matrix.repetitions) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["matrix"], message: "Stage M model denominator drift" });
  }
  if (lock.matrix.expectedArtifactRows !== lock.matrix.expectedCases * lock.matrix.repetitions
    || lock.matrix.expectedLogicalRows !== lock.matrix.expectedModelRows + lock.matrix.expectedArtifactRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["matrix"], message: "Stage M artifact or logical denominator drift" });
  }
  if (lock.qualification.expectedRowsPerFamily !== lock.matrix.expectedCases * lock.matrix.repetitions) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["qualification"], message: "Stage M qualification denominator drift" });
  }
});

export type StageMFrozenMagpiePanelLock = z.infer<typeof StageMFrozenMagpiePanelLockSchema>;

export const StageMQualificationClassificationSchema = z.enum([
  "semantic-complete",
  "usage-missing",
  "parser-incompatible",
  "runtime-crash",
  "timeout",
  "controller-exception",
]);

export const StageMQualificationRowSchema = z.object({
  family: FamilySchema,
  caseId: CaseIdSchema,
  status: z.enum(["complete", "failed"]),
  classification: StageMQualificationClassificationSchema,
  usageAvailable: z.boolean(),
  usage: UsageSchema,
  durationMs: z.number().nonnegative(),
  detail: z.string().min(1).optional(),
}).strict().superRefine((row, context) => {
  if (row.usageAvailable !== row.usage.available) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["usageAvailable"], message: "Stage M qualification usage availability drift" });
  }
  if (row.status === "complete" && row.classification !== "semantic-complete") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "Stage M complete qualification row must be semantic-complete" });
  }
  if (row.status === "failed" && !row.detail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["detail"], message: "Stage M failed qualification row requires detail" });
  }
});

export type StageMQualificationRow = z.infer<typeof StageMQualificationRowSchema>;

const QualificationFamilySchema = z.object({
  family: FamilySchema,
  route: z.string().min(1),
  expectedRows: z.literal(9),
  observedRows: z.number().int().nonnegative(),
  completeRows: z.number().int().nonnegative(),
  missingCaseIds: z.array(CaseIdSchema),
  rows: z.array(StageMQualificationRowSchema),
}).strict();

export const StageMQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-qualification/v1"),
  experimentId: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-001"),
  lockSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  matrixAuthorized: z.boolean(),
  expectedRowsTotal: z.literal(27),
  observedRowsTotal: z.number().int().nonnegative(),
  families: z.object({
    gpt: QualificationFamilySchema.extend({ family: z.literal("gpt") }).strict(),
    claude: QualificationFamilySchema.extend({ family: z.literal("claude") }).strict(),
    deepseek: QualificationFamilySchema.extend({ family: z.literal("deepseek") }).strict(),
  }).strict(),
  claimBoundary: z.literal("Stage M qualification proves only that all three declared model families completed the frozen nine-case denominator with observable usage; it is not quality, semantic equivalence, held-out, promotion, or cross-model generalization evidence."),
}).strict();

export type StageMQualification = z.infer<typeof StageMQualificationSchema>;

export function buildStageMQualification(input: {
  lock: StageMFrozenMagpiePanelLock;
  lockSha256: string;
  families: Array<{
    family: "gpt" | "claude" | "deepseek";
    route: string;
    expectedRows: number;
    observedRows: number;
    missingCaseIds: string[];
    rows: StageMQualificationRow[];
  }>;
}): StageMQualification {
  const lock = StageMFrozenMagpiePanelLockSchema.parse(input.lock);
  if (input.families.length !== lock.models.length) throw new Error("Stage M qualification requires all three model families");
  const byFamily = new Map(input.families.map((item) => [item.family, item]));
  const summaries = Object.fromEntries(lock.models.map((model) => {
    const family = byFamily.get(model.family);
    if (!family) throw new Error(`Stage M qualification family missing: ${model.family}`);
    const rows = family.rows.map((row) => StageMQualificationRowSchema.parse(row));
    if (family.expectedRows !== lock.qualification.expectedRowsPerFamily) {
      throw new Error(`Stage M qualification expected-row declaration drift: ${model.family}`);
    }
    const expectedCases = new Set(lock.cases.map((item) => item.caseId));
    const observedCases = new Set(rows.map((row) => row.caseId));
    if ([...observedCases].some((caseId) => !expectedCases.has(caseId as never))) throw new Error(`Stage M qualification case drift: ${model.family}`);
    if (new Set(rows.map((row) => row.caseId)).size !== rows.length) throw new Error(`Stage M qualification duplicate row: ${model.family}`);
    const missingCaseIds = lock.cases.map((item) => item.caseId).filter((caseId) => !observedCases.has(caseId));
    if (family.observedRows !== rows.length) throw new Error(`Stage M qualification observed-row declaration drift: ${model.family}`);
    if (JSON.stringify(family.missingCaseIds) !== JSON.stringify(missingCaseIds)) {
      throw new Error(`Stage M qualification missing-case declaration drift: ${model.family}`);
    }
    const completeRows = rows.filter((row) => row.status === "complete"
      && row.classification === "semantic-complete" && row.usageAvailable).length;
    return [model.family, {
      family: model.family, route: model.route, expectedRows: lock.qualification.expectedRowsPerFamily,
      observedRows: rows.length, completeRows, missingCaseIds, rows,
    }];
  })) as Record<"gpt" | "claude" | "deepseek", z.infer<typeof QualificationFamilySchema>>;
  const observedRowsTotal = Object.values(summaries).reduce((sum, item) => sum + item.observedRows, 0);
  const passed = observedRowsTotal === lock.matrix.expectedModelRows
    && Object.values(summaries).every((family) => family.observedRows === family.expectedRows
      && family.missingCaseIds.length === 0
      && family.completeRows === family.expectedRows
      && family.rows.every((row) => row.family === family.family));
  return StageMQualificationSchema.parse({
    schemaVersion: "skill-ir-stage-m-frozen-magpie-cross-model-panel-qualification/v1",
    experimentId: lock.experimentId, lockSha256: Sha256Schema.parse(input.lockSha256),
    status: passed ? "passed" : "failed", matrixAuthorized: passed,
    expectedRowsTotal: lock.matrix.expectedModelRows, observedRowsTotal,
    families: summaries,
    claimBoundary: "Stage M qualification proves only that all three declared model families completed the frozen nine-case denominator with observable usage; it is not quality, semantic equivalence, held-out, promotion, or cross-model generalization evidence.",
  });
}

export function assertStageMMatrixAuthorized(qualificationInput: StageMQualification, lockSha256: string): void {
  const qualification = StageMQualificationSchema.parse(qualificationInput);
  if (qualification.status !== "passed" || !qualification.matrixAuthorized || qualification.lockSha256 !== Sha256Schema.parse(lockSha256)) {
    throw new Error("Stage M matrix is not authorized: qualification failed, incomplete, or stale");
  }
}

export const StageMModelMatrixRowSchema = z.object({
  family: FamilySchema,
  route: z.string().min(1),
  caseId: CaseIdSchema,
  status: z.enum(["complete", "failed"]),
  classification: StageMQualificationClassificationSchema,
  usage: UsageSchema,
  durationMs: z.number().nonnegative(),
  passed: z.boolean(),
  failures: z.array(z.string()),
  outputSha256: Sha256Schema,
  detail: z.string().min(1).optional(),
}).strict().superRefine((row, context) => {
  if (row.status === "complete" && row.classification !== "semantic-complete") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "Stage M complete model row must be semantic-complete" });
  }
  if (row.status === "failed" && !row.detail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["detail"], message: "Stage M failed model row requires detail" });
  }
});

export type StageMModelMatrixRow = z.infer<typeof StageMModelMatrixRowSchema>;

export const StageMArtifactMatrixRowSchema = z.object({
  caseId: CaseIdSchema,
  status: z.enum(["complete", "failed"]),
  passed: z.boolean(),
  outputSha256: Sha256Schema,
  expectedOutputSha256: Sha256Schema,
  durationMs: z.number().nonnegative(),
  detail: z.string().min(1).optional(),
}).strict().superRefine((row, context) => {
  if (row.status === "complete" && (!row.passed || row.outputSha256 !== row.expectedOutputSha256)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["outputSha256"], message: "Stage M complete artifact row must match its frozen output digest" });
  }
  if (row.status === "failed" && !row.detail) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["detail"], message: "Stage M failed artifact row requires detail" });
  }
});

export type StageMArtifactMatrixRow = z.infer<typeof StageMArtifactMatrixRowSchema>;

type DirectionCounts = { gains: number; equals: number; regressions: number; missing: number };

function directions(): DirectionCounts { return { gains: 0, equals: 0, regressions: 0, missing: 0 }; }

export const StageMMatrixReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-report/v1"),
  experimentId: z.literal("skill-ir-stage-m-frozen-magpie-cross-model-panel-001"),
  lockSha256: Sha256Schema,
  status: z.enum(["completed", "blocked"]),
  denominator: z.literal("preregistered-unique-matrix"),
  counts: z.object({
    expectedModelRows: z.literal(27), observedModelRows: z.number().int().nonnegative(),
    expectedArtifactRows: z.literal(9), observedArtifactRows: z.number().int().nonnegative(),
    logicalRows: z.number().int().nonnegative(),
  }).strict(),
  modelFamilies: z.object({
    gpt: z.object({ route: z.string().min(1), expectedRows: z.literal(9), observedRows: z.number().int().nonnegative(), failedRows: z.number().int().nonnegative(), missingRows: z.number().int().nonnegative(), artifactVsOriginal: z.object({ gains: z.number().int().nonnegative(), equals: z.number().int().nonnegative(), regressions: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).strict() }).strict(),
    claude: z.object({ route: z.string().min(1), expectedRows: z.literal(9), observedRows: z.number().int().nonnegative(), failedRows: z.number().int().nonnegative(), missingRows: z.number().int().nonnegative(), artifactVsOriginal: z.object({ gains: z.number().int().nonnegative(), equals: z.number().int().nonnegative(), regressions: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).strict() }).strict(),
    deepseek: z.object({ route: z.string().min(1), expectedRows: z.literal(9), observedRows: z.number().int().nonnegative(), failedRows: z.number().int().nonnegative(), missingRows: z.number().int().nonnegative(), artifactVsOriginal: z.object({ gains: z.number().int().nonnegative(), equals: z.number().int().nonnegative(), regressions: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).strict() }).strict(),
  }).strict(),
  artifact: z.object({ observedRows: z.number().int().nonnegative(), passedRows: z.number().int().nonnegative(), failedRows: z.number().int().nonnegative(), outputDigests: z.array(z.object({ caseId: CaseIdSchema, sha256: Sha256Schema }).strict()).length(9) }).strict(),
  rows: z.object({
    models: z.array(StageMModelMatrixRowSchema).length(27),
    artifact: z.array(StageMArtifactMatrixRowSchema).length(9),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(27),
    artifactExecutions: z.literal(9),
    retries: z.literal(0),
    replacements: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
  interpretation: z.object({
    claimBoundary: z.literal("Stage M reports a fixed frozen-artifact comparison across the declared GPT, Claude, and DeepSeek routes. P2 gold-digest output regression is not the P1 semantic checker, and this panel does not establish cross-model generalization, held-out improvement, promotion, or readiness."),
    direction: z.enum(["non-regressing", "mixed", "regressing", "not-estimable"]),
    heldOutAllowed: z.literal(false), promotionAllowed: z.literal(false), readinessMutationAllowed: z.literal(false),
  }).strict(),
}).strict();

export type StageMMatrixReport = z.infer<typeof StageMMatrixReportSchema>;

export function buildStageMMatrixReport(input: {
  lock: StageMFrozenMagpiePanelLock;
  lockSha256: string;
  qualification: StageMQualification;
  modelRows: StageMModelMatrixRow[];
  artifactRows: StageMArtifactMatrixRow[];
}): StageMMatrixReport {
  const lock = StageMFrozenMagpiePanelLockSchema.parse(input.lock);
  const lockSha256 = Sha256Schema.parse(input.lockSha256);
  assertStageMMatrixAuthorized(input.qualification, lockSha256);
  const modelRows = input.modelRows.map((row) => StageMModelMatrixRowSchema.parse(row));
  const artifactRows = input.artifactRows.map((row) => StageMArtifactMatrixRowSchema.parse(row));
  if (modelRows.length !== lock.matrix.expectedModelRows) throw new Error(`Stage M model denominator mismatch: expected ${lock.matrix.expectedModelRows}, observed ${modelRows.length}`);
  if (artifactRows.length !== lock.matrix.expectedArtifactRows) throw new Error(`Stage M artifact denominator mismatch: expected ${lock.matrix.expectedArtifactRows}, observed ${artifactRows.length}`);
  const modelKeys = modelRows.map((row) => `${row.family}\0${row.caseId}`);
  if (new Set(modelKeys).size !== modelRows.length) throw new Error("Stage M model denominator contains duplicate rows");
  if (new Set(artifactRows.map((row) => row.caseId)).size !== artifactRows.length) throw new Error("Stage M artifact denominator contains duplicate rows");
  for (const model of lock.models) {
    for (const row of modelRows.filter((candidate) => candidate.family === model.family)) {
      if (row.route !== model.route) throw new Error(`Stage M model route drift: ${model.family}`);
    }
  }
  const artifactByCase = new Map(artifactRows.map((row) => [row.caseId, row]));
  const familySummaries = Object.fromEntries(lock.models.map((model) => {
    const rows = modelRows.filter((row) => row.family === model.family);
    const counts = directions();
    for (const caseId of lock.cases.map((item) => item.caseId)) {
      const modelRow = rows.find((row) => row.caseId === caseId);
      const artifact = artifactByCase.get(caseId);
      if (!modelRow || !artifact) { counts.missing += 1; continue; }
      if (artifact.passed > modelRow.passed) counts.gains += 1;
      else if (artifact.passed < modelRow.passed) counts.regressions += 1;
      else counts.equals += 1;
    }
    return [model.family, { route: model.route, expectedRows: lock.matrix.expectedArtifactRows, observedRows: rows.length, failedRows: rows.filter((row) => row.status !== "complete").length, missingRows: Math.max(0, lock.matrix.expectedArtifactRows - rows.length), artifactVsOriginal: counts }];
  })) as Record<"gpt" | "claude" | "deepseek", { route: string; expectedRows: 9; observedRows: number; failedRows: number; missingRows: number; artifactVsOriginal: DirectionCounts }>;
  const passedRows = artifactRows.filter((row) => row.status === "complete" && row.passed).length;
  const failedRows = artifactRows.filter((row) => row.status !== "complete" || !row.passed).length;
  const regressions = Object.values(familySummaries).reduce((sum, family) => sum + family.artifactVsOriginal.regressions, 0);
  const gains = Object.values(familySummaries).reduce((sum, family) => sum + family.artifactVsOriginal.gains, 0);
  const missing = Object.values(familySummaries).reduce((sum, family) => sum + family.artifactVsOriginal.missing, 0);
  const direction = missing > 0 ? "not-estimable" : regressions === 0 ? "non-regressing" : gains > 0 ? "mixed" : "regressing";
  const report = {
    schemaVersion: "skill-ir-stage-m-frozen-magpie-cross-model-panel-report/v1" as const,
    experimentId: lock.experimentId, lockSha256,
    status: modelRows.every((row) => row.status === "complete") && artifactRows.every((row) => row.status === "complete") ? "completed" as const : "blocked" as const,
    denominator: "preregistered-unique-matrix" as const,
    counts: { expectedModelRows: lock.matrix.expectedModelRows, observedModelRows: modelRows.length, expectedArtifactRows: lock.matrix.expectedArtifactRows, observedArtifactRows: artifactRows.length, logicalRows: modelRows.length + artifactRows.length },
    modelFamilies: familySummaries,
    artifact: { observedRows: artifactRows.length, passedRows, failedRows, outputDigests: artifactRows.map((row) => ({ caseId: row.caseId, sha256: row.outputSha256 })) },
    rows: { models: modelRows, artifact: artifactRows },
    accounting: { modelCalls: 27 as const, artifactExecutions: 9 as const, retries: 0 as const, replacements: 0 as const, heldOutAccesses: 0 as const },
    interpretation: { claimBoundary: "Stage M reports a fixed frozen-artifact comparison across the declared GPT, Claude, and DeepSeek routes. P2 gold-digest output regression is not the P1 semantic checker, and this panel does not establish cross-model generalization, held-out improvement, promotion, or readiness.", direction, heldOutAllowed: false as const, promotionAllowed: false as const, readinessMutationAllowed: false as const },
  };
  return StageMMatrixReportSchema.parse(report);
}
