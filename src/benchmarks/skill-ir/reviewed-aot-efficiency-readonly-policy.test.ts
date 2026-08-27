import { describe, expect, test } from "bun:test";
import {
  ReadonlySerialEfficiencyFreezeSchema,
  ReadonlySerialEfficiencyPolicySchema,
  ReadonlySerialQualificationReportSchema,
  assertReadonlyQualificationPrecedesFreeze,
} from "./reviewed-aot-efficiency-readonly-policy";

const ref = (path: string) => ({ path, sha256: "a".repeat(64) });
const rows = [
  ["env-manager-scorer-authority-node-dev-001", 1, "original", true],
  ["env-manager-scorer-authority-node-dev-001", 1, "reviewed-aot", false],
  ["env-manager-scorer-authority-node-dev-001", 2, "original", true],
  ["env-manager-scorer-authority-node-dev-001", 2, "reviewed-aot", false],
  ["env-manager-scorer-authority-vite-dev-002", 1, "original", true],
  ["env-manager-scorer-authority-vite-dev-002", 1, "reviewed-aot", false],
  ["env-manager-scorer-authority-vite-dev-002", 2, "original", true],
  ["env-manager-scorer-authority-vite-dev-002", 2, "reviewed-aot", false],
].map(([taskId, repetition, system, paid]) => ({ taskId, repetition, system, paid }));
const implementation = [
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control.ts"),
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-contract.ts"),
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial.ts"),
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control-run.ts"),
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-policy.ts"),
  ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-serial-run.ts"),
];
const predecessor = {
  policy: ref("benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-resilient-v1.json"),
  freeze: ref("results/skill-ir/reviewed-aot-efficiency-matrix-resilient-freeze-v1.json"),
  incident: ref("results/skill-ir/reviewed-aot-efficiency-resilient-observation-failure-v1.json"),
  rowReuse: false,
};
const denominator = {
  rows: 8, pairs: 4, paidOriginalRows: 4, deterministicReviewedAotRows: 4,
  taskIds: ["env-manager-scorer-authority-node-dev-001", "env-manager-scorer-authority-vite-dev-002"],
  repetitions: 2, systems: ["original", "reviewed-aot"],
  order: "task-then-repetition-then-system", retries: 0, forwardOnly: true,
  orderedRows: rows, startingPrefixRows: 0,
};

describe("reviewed-AOT read-only serial efficiency policy", () => {
  test("rejects a freeze timestamp that predates its qualification", () => {
    expect(() => assertReadonlyQualificationPrecedesFreeze(
      "2026-08-27T03:21:59.087Z",
      "2026-08-27T03:15:00.000Z",
    )).toThrow("predates qualification");
    expect(() => assertReadonlyQualificationPrecedesFreeze(
      "2026-08-27T03:21:59.087Z",
      "2026-08-27T03:22:00.000Z",
    )).not.toThrow();
  });

  test("freezes the real active-tree proof and zero-paid accounting", () => {
    const report = ReadonlySerialQualificationReportSchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-qualification/v1",
      status: "passed",
      completedAt: "2026-08-27T00:00:00.000Z",
      implementation,
      dependencyAudit: {
        localImports: { total: 3, withinReadonlyClosure: 3, outsideReadonlyClosure: 0 },
        forbiddenBuilderImports: 0, forbiddenMutationImports: 0,
        allowedFsPrimitives: ["lstat", "readFile", "readdir"],
      },
      activeTree: {
        realMaterializedOriginalRows: 4,
        independentHolderProcess: true,
        heldFileRoles: ["task", "skill", "initial-workdir-manifest"],
        concurrentStatusCalls: 12, concurrentCollectCalls: 12,
        beforeTreeSha256: "b".repeat(64), afterTreeSha256: "b".repeat(64),
        entryCount: 42, byteIdentical: true,
      },
      serialExecution: {
        fakeRows: 2, dispatchCount: 2, completedRows: 2, retries: 0,
        observerProcesses: 0, committedPrefixRecovery: true, dispatchedWithoutTerminalFailClosed: true,
      },
      accounting: { apiCalls: 0, modelCalls: 0, paidCalls: 0 },
      claimBoundary: "This qualification proves read-only observation and serial journal mechanics only. It is not model quality, recurring-cost, break-even, efficiency, portfolio, or readiness evidence.",
    });
    expect(report.activeTree.beforeTreeSha256).toBe(report.activeTree.afterTreeSha256);
    expect(report.accounting).toEqual({ apiCalls: 0, modelCalls: 0, paidCalls: 0 });
  });

  test("defines one fresh foreground-only 0/8 identity and the one-repair stop line", () => {
    const policy = ReadonlySerialEfficiencyPolicySchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-policy/v1",
      experimentId: "env-manager-reviewed-aot-efficiency-readonly-serial-001",
      frozenAt: "2026-08-27T00:00:00.000Z",
      predecessor,
      qualification: ref("results/skill-ir/reviewed-aot-efficiency-readonly-qualification-v1.json"),
      implementation,
      denominator,
      productionOneTime: { compileModelTokens: 9358, profileModelTokens: 0, packageModelTokens: 0, missing: [] },
      controlPlane: {
        observation: "read-only-frozen-bytes-plan-state-prefix",
        planBuilderReachable: false, materializerReachable: false, writesAllowed: false,
        concurrentActiveTreeProof: "byte-identical-passed",
      },
      execution: {
        owner: "single-foreground-serial-process", prepareBeforeCredentialCheck: true,
        productionObservers: 0, rowOrder: "dispatch-execute-prefix-next",
        committedPrefixRecovery: true, dispatchedWithoutTerminal: "fail-closed", retries: 0,
      },
      stopLoss: {
        remainingInfrastructureRepairIdentities: 0,
        onInfrastructureFailure: "stop-efficiency-and-enter-phase-2",
      },
      authorization: {
        currentStagePaidCalls: 0, futurePaidOriginalCalls: 4, retries: 0,
        heldOut: false, readinessPromotion: false,
      },
      prohibited: [
        "v1-row-reuse", "v2-row-reuse", "retry-or-reserve", "concurrent-production-observer",
        "post-hoc-row-selection", "held-out",
      ],
      claimBoundary: "This successor authorizes prepare plus one fresh foreground serial eight-row denominator. It does not establish quality, break-even, efficiency, portfolio, readiness, or automation before machine-derived results.",
    });
    expect(policy.execution).toMatchObject({ owner: "single-foreground-serial-process", productionObservers: 0, retries: 0 });
    expect(policy.stopLoss.remainingInfrastructureRepairIdentities).toBe(0);
  });

  test("freeze authorizes prepare and one matrix but no efficiency claim", () => {
    const freeze = ReadonlySerialEfficiencyFreezeSchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-freeze/v1",
      freezeId: "env-reviewed-aot-efficiency-readonly-serial-identity-001",
      status: "passed", policy: ref("benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-readonly-serial-v1.json"),
      predecessor, qualification: ref("results/skill-ir/reviewed-aot-efficiency-readonly-qualification-v1.json"),
      implementation, plan: denominator,
      accounting: { currentStagePaidCalls: 0, matrixExecuted: false, retries: 0 },
      authorizations: { prepare: true, paidMatrix: true, heldOut: false, efficiencyClaim: false },
      stopLoss: { remainingInfrastructureRepairIdentities: 0, onInfrastructureFailure: "stop-efficiency-and-enter-phase-2" },
      claimBoundary: "The zero-paid freeze binds the final read-only/serial successor and authorizes prepare plus one foreground execution. It is not a quality, cost, or efficiency result.",
    });
    expect(freeze.accounting.currentStagePaidCalls).toBe(0);
    expect(freeze.authorizations.efficiencyClaim).toBe(false);
  });
});
