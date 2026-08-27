import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ReadonlyReviewedAotRowSchema } from "./reviewed-aot-efficiency-readonly-control";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(500).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
export const ReadonlySerialFrozenFileSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

export const READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID =
  "env-manager-reviewed-aot-efficiency-readonly-serial-001";
export const READONLY_SERIAL_EFFICIENCY_POLICY_PATH =
  "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-readonly-serial-v1.json";
export const READONLY_SERIAL_EFFICIENCY_FREEZE_PATH =
  "results/skill-ir/reviewed-aot-efficiency-readonly-serial-freeze-v1.json";
export const READONLY_SERIAL_QUALIFICATION_PATH =
  "results/skill-ir/reviewed-aot-efficiency-readonly-qualification-v1.json";
export const RESILIENT_OBSERVATION_FAILURE_PATH =
  "results/skill-ir/reviewed-aot-efficiency-resilient-observation-failure-v1.json";

export const READONLY_SERIAL_IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-contract.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control-run.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-policy.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts",
] as const;

export const ReadonlySerialPredecessorSchema = z.object({
  policy: ReadonlySerialFrozenFileSchema,
  freeze: ReadonlySerialFrozenFileSchema,
  incident: ReadonlySerialFrozenFileSchema,
  rowReuse: z.literal(false),
}).strict();

export const ReadonlySerialDenominatorSchema = z.object({
  rows: z.literal(8),
  pairs: z.literal(4),
  paidOriginalRows: z.literal(4),
  deterministicReviewedAotRows: z.literal(4),
  taskIds: z.tuple([
    z.literal("env-manager-scorer-authority-node-dev-001"),
    z.literal("env-manager-scorer-authority-vite-dev-002"),
  ]),
  repetitions: z.literal(2),
  systems: z.tuple([z.literal("original"), z.literal("reviewed-aot")]),
  order: z.literal("task-then-repetition-then-system"),
  retries: z.literal(0),
  forwardOnly: z.literal(true),
  orderedRows: z.array(ReadonlyReviewedAotRowSchema).length(8),
  startingPrefixRows: z.literal(0),
}).strict().superRefine((denominator, context) => {
  const expected = denominator.taskIds.flatMap((taskId) => [1, 2].flatMap((repetition) => [
    { taskId, repetition, system: "original", paid: true },
    { taskId, repetition, system: "reviewed-aot", paid: false },
  ]));
  if (!isDeepStrictEqual(denominator.orderedRows, expected)) {
    context.addIssue({ code: "custom", message: "read-only serial denominator row order drift" });
  }
});

export const ReadonlySerialStopLossSchema = z.object({
  remainingInfrastructureRepairIdentities: z.literal(0),
  onInfrastructureFailure: z.literal("stop-efficiency-and-enter-phase-2"),
}).strict();

export const ReadonlySerialQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-qualification/v1"),
  status: z.literal("passed"),
  completedAt: z.string().datetime({ offset: true }),
  implementation: z.array(ReadonlySerialFrozenFileSchema).length(READONLY_SERIAL_IMPLEMENTATION_PATHS.length),
  dependencyAudit: z.object({
    localImports: z.object({
      total: z.literal(3),
      withinReadonlyClosure: z.literal(3),
      outsideReadonlyClosure: z.literal(0),
    }).strict(),
    forbiddenBuilderImports: z.literal(0),
    forbiddenMutationImports: z.literal(0),
    allowedFsPrimitives: z.tuple([z.literal("lstat"), z.literal("readFile"), z.literal("readdir")]),
  }).strict(),
  activeTree: z.object({
    realMaterializedOriginalRows: z.literal(4),
    independentHolderProcess: z.literal(true),
    heldFileRoles: z.tuple([
      z.literal("task"), z.literal("skill"), z.literal("initial-workdir-manifest"),
    ]),
    concurrentStatusCalls: z.literal(12),
    concurrentCollectCalls: z.literal(12),
    beforeTreeSha256: Sha256Schema,
    afterTreeSha256: Sha256Schema,
    entryCount: z.number().int().positive(),
    byteIdentical: z.literal(true),
  }).strict().superRefine((tree, context) => {
    if (tree.beforeTreeSha256 !== tree.afterTreeSha256) {
      context.addIssue({ code: "custom", message: "active tree digest changed during observation" });
    }
  }),
  serialExecution: z.object({
    fakeRows: z.literal(2),
    dispatchCount: z.literal(2),
    completedRows: z.literal(2),
    retries: z.literal(0),
    observerProcesses: z.literal(0),
    committedPrefixRecovery: z.literal(true),
    dispatchedWithoutTerminalFailClosed: z.literal(true),
  }).strict(),
  accounting: z.object({ apiCalls: z.literal(0), modelCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
  claimBoundary: z.literal("This qualification proves read-only observation and serial journal mechanics only. It is not model quality, recurring-cost, break-even, efficiency, portfolio, or readiness evidence."),
}).strict();
export type ReadonlySerialQualificationReport = z.infer<typeof ReadonlySerialQualificationReportSchema>;

export const ReadonlySerialEfficiencyPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-serial-policy/v1"),
  experimentId: z.literal(READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID),
  frozenAt: z.string().datetime({ offset: true }),
  predecessor: ReadonlySerialPredecessorSchema,
  qualification: ReadonlySerialFrozenFileSchema,
  implementation: z.array(ReadonlySerialFrozenFileSchema).length(READONLY_SERIAL_IMPLEMENTATION_PATHS.length),
  denominator: ReadonlySerialDenominatorSchema,
  productionOneTime: z.object({
    compileModelTokens: z.literal(9358),
    profileModelTokens: z.literal(0),
    packageModelTokens: z.literal(0),
    missing: z.tuple([]),
  }).strict(),
  controlPlane: z.object({
    observation: z.literal("read-only-frozen-bytes-plan-state-prefix"),
    planBuilderReachable: z.literal(false),
    materializerReachable: z.literal(false),
    writesAllowed: z.literal(false),
    concurrentActiveTreeProof: z.literal("byte-identical-passed"),
  }).strict(),
  execution: z.object({
    owner: z.literal("single-foreground-serial-process"),
    prepareBeforeCredentialCheck: z.literal(true),
    productionObservers: z.literal(0),
    rowOrder: z.literal("dispatch-execute-prefix-next"),
    committedPrefixRecovery: z.literal(true),
    dispatchedWithoutTerminal: z.literal("fail-closed"),
    retries: z.literal(0),
  }).strict(),
  stopLoss: ReadonlySerialStopLossSchema,
  authorization: z.object({
    currentStagePaidCalls: z.literal(0),
    futurePaidOriginalCalls: z.literal(4),
    retries: z.literal(0),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("v1-row-reuse"), z.literal("v2-row-reuse"), z.literal("retry-or-reserve"),
    z.literal("concurrent-production-observer"), z.literal("post-hoc-row-selection"), z.literal("held-out"),
  ]),
  claimBoundary: z.literal("This successor authorizes prepare plus one fresh foreground serial eight-row denominator. It does not establish quality, break-even, efficiency, portfolio, readiness, or automation before machine-derived results."),
}).strict();
export type ReadonlySerialEfficiencyPolicy = z.infer<typeof ReadonlySerialEfficiencyPolicySchema>;

export const ReadonlySerialEfficiencyFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-readonly-serial-freeze/v1"),
  freezeId: z.literal("env-reviewed-aot-efficiency-readonly-serial-identity-001"),
  status: z.literal("passed"),
  policy: ReadonlySerialFrozenFileSchema,
  predecessor: ReadonlySerialPredecessorSchema,
  qualification: ReadonlySerialFrozenFileSchema,
  implementation: z.array(ReadonlySerialFrozenFileSchema).length(READONLY_SERIAL_IMPLEMENTATION_PATHS.length),
  plan: ReadonlySerialDenominatorSchema,
  accounting: z.object({
    currentStagePaidCalls: z.literal(0), matrixExecuted: z.literal(false), retries: z.literal(0),
  }).strict(),
  authorizations: z.object({
    prepare: z.literal(true), paidMatrix: z.literal(true), heldOut: z.literal(false), efficiencyClaim: z.literal(false),
  }).strict(),
  stopLoss: ReadonlySerialStopLossSchema,
  claimBoundary: z.literal("The zero-paid freeze binds the final read-only/serial successor and authorizes prepare plus one foreground execution. It is not a quality, cost, or efficiency result."),
}).strict();
export type ReadonlySerialEfficiencyFreeze = z.infer<typeof ReadonlySerialEfficiencyFreezeSchema>;

export const ReviewedAotPairedQualityEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-paired-quality-evidence/v1"),
  experimentId: z.string().min(1),
  counts: z.object({
    expectedRows: z.literal(8),
    observedRows: z.number().int().nonnegative(),
    expectedPairs: z.literal(4),
    completePairs: z.number().int().nonnegative(),
  }).strict(),
  records: z.array(z.object({
    taskId: z.string().min(1),
    repetition: z.number().int().positive(),
    system: z.enum(["original", "reviewed-aot"]),
    status: z.enum(["complete", "missing-raw", "missing-scored"]),
    success: z.boolean(),
    score: z.number().min(0).max(1),
    infrastructureFailure: z.boolean(),
    hardGateFailure: z.boolean(),
  }).strict()).length(8),
  pairs: z.array(z.object({
    taskId: z.string().min(1),
    repetition: z.number().int().positive(),
    originalScore: z.number().min(0).max(1),
    reviewedAotScore: z.number().min(0).max(1),
    regressed: z.boolean(),
    reviewedAotPassed: z.boolean(),
  }).strict()).length(4),
  gate: z.object({
    completeRows: z.boolean(),
    completePairs: z.boolean(),
    allReviewedPass: z.boolean(),
    noInfrastructureFailures: z.boolean(),
    noReviewedHardGateFailures: z.boolean(),
    noPairwiseRegressions: z.boolean(),
    passed: z.boolean(),
  }).strict(),
  qualityEquivalent: z.boolean(),
  authorizations: z.object({ heldOut: z.literal(false), readinessPromotion: z.literal(false) }).strict(),
}).strict();
export type ReviewedAotPairedQualityEvidence = z.infer<typeof ReviewedAotPairedQualityEvidenceSchema>;
