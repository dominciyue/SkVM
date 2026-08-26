import { describe, expect, test } from "bun:test";
import {
  buildResilientEfficiencyPolicy,
  ResilientEfficiencyFreezeSchema,
  ResilientEfficiencyPolicySchema,
  validateResilientEfficiencyPolicy,
} from "./reviewed-aot-efficiency-resilient-policy";

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

function policyFixture() {
  return {
    schemaVersion: "skill-ir-reviewed-aot-efficiency-resilient-policy/v1",
    experimentId: "env-manager-reviewed-aot-efficiency-v2",
    frozenAt: "2026-08-26T08:00:00.000Z",
    predecessor: {
      policy: ref("benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-v1.json"),
      freeze: ref("results/skill-ir/reviewed-aot-efficiency-matrix-freeze-v1.json"),
      interruption: ref("results/skill-ir/reviewed-aot-efficiency-interruption-v1.json"),
      rowReuse: false,
    },
    resilienceQualification: ref("results/skill-ir/reviewed-aot-efficiency-resilience-qualification-v1.json"),
    implementation: [
      ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient.ts"),
      ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-run.ts"),
      ref("src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-policy.ts"),
    ],
    denominator: {
      rows: 8, pairs: 4, paidOriginalRows: 4, deterministicReviewedAotRows: 4,
      taskIds: ["env-manager-scorer-authority-node-dev-001", "env-manager-scorer-authority-vite-dev-002"],
      repetitions: 2, systems: ["original", "reviewed-aot"],
      order: "task-then-repetition-then-system", retries: 0, forwardOnly: true,
      orderedRows: rows, startingPrefixRows: 0,
    },
    productionOneTime: { compileModelTokens: 9358, profileModelTokens: 0, packageModelTokens: 0, missing: [] },
    recovery: {
      executionOwner: "single-detached-worker",
      controllerRole: "validate-start-observe-collect",
      journalOrder: ["prepared", "dispatched", "terminal-record", "prefix-committed"],
      redispatchAfterDispatched: false,
      recoverableInterruption: "foreground-controller-or-desktop-parent-only",
      missingTerminalAfterDispatch: "fail-closed",
    },
    authorization: { currentStagePaidCalls: 0, futurePaidOriginalCalls: 4, retries: 0, heldOut: false, readinessPromotion: false },
    prohibited: ["v1-row-reuse", "v1-orphan-backfill", "retry-or-reserve", "post-hoc-row-selection", "held-out"],
    claimBoundary: "This successor authorizes one fresh eight-row reviewed-AOT efficiency denominator. It does not recover or reuse v1 rows and does not establish quality, break-even, readiness, or automation before machine-derived results.",
  };
}

describe("reviewed-AOT resilient efficiency identity", () => {
  test("defines one fresh 0/8 denominator with no retry disguised as recovery", () => {
    const policy = ResilientEfficiencyPolicySchema.parse(policyFixture());
    expect(policy.denominator.startingPrefixRows).toBe(0);
    expect(policy.predecessor.rowReuse).toBe(false);
    expect(policy.recovery.redispatchAfterDispatched).toBe(false);
    expect(policy.authorization.futurePaidOriginalCalls).toBe(4);
  });

  test("rejects a reused prefix or retry budget", () => {
    expect(() => ResilientEfficiencyPolicySchema.parse({
      ...policyFixture(),
      denominator: { ...policyFixture().denominator, startingPrefixRows: 6 },
    })).toThrow();
    expect(() => ResilientEfficiencyPolicySchema.parse({
      ...policyFixture(),
      authorization: { ...policyFixture().authorization, retries: 1 },
    })).toThrow();
  });

  test("freezes qualification authority and still records zero paid calls", () => {
    const policy = ResilientEfficiencyPolicySchema.parse(policyFixture());
    const freeze = ResilientEfficiencyFreezeSchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-resilient-freeze/v1",
      freezeId: "env-reviewed-aot-efficiency-resilient-identity-v1",
      status: "passed",
      policy: ref("benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-resilient-v1.json"),
      predecessor: policy.predecessor,
      resilienceQualification: policy.resilienceQualification,
      implementation: policy.implementation,
      plan: policy.denominator,
      accounting: { currentStagePaidCalls: 0, matrixExecuted: false, retries: 0 },
      authorizations: { paidMatrix: true, heldOut: false, efficiencyClaim: false },
      claimBoundary: "The zero-paid freeze binds the fresh resilient eight-row identity and authorizes one detached execution. It is not a quality, cost, or efficiency result.",
    });
    expect(freeze.plan.orderedRows).toHaveLength(8);
    expect(freeze.accounting).toEqual({ currentStagePaidCalls: 0, matrixExecuted: false, retries: 0 });
  });

  test("derives the real successor only from the verified predecessor and resilience qualification", async () => {
    const policy = await buildResilientEfficiencyPolicy(process.cwd(), "2026-08-26T08:00:00.000Z");
    expect(policy.predecessor.rowReuse).toBe(false);
    expect(policy.denominator.orderedRows).toHaveLength(8);
    expect(policy.productionOneTime).toEqual({
      compileModelTokens: 9358, profileModelTokens: 0, packageModelTokens: 0, missing: [],
    });
    await expect(validateResilientEfficiencyPolicy({
      ...policy,
      resilienceQualification: { ...policy.resilienceQualification, sha256: "0".repeat(64) },
    }, process.cwd())).rejects.toThrow("digest mismatch");
  });
});
