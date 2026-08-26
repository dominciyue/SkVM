import { describe, expect, test } from "bun:test";
import {
  assertReviewedAotEfficiencyPrefix,
  buildReviewedAotEfficiencyFreeze,
  buildReviewedAotEfficiencyPolicy,
  validateReviewedAotEfficiencyPolicy,
} from "./reviewed-aot-efficiency-matrix";

describe("reviewed AOT efficiency matrix freeze", () => {
  test("freezes eight paired rows only after a complete construction-cost identity", async () => {
    const rootDir = process.cwd();
    const policy = await buildReviewedAotEfficiencyPolicy(rootDir);
    const validated = await validateReviewedAotEfficiencyPolicy(policy, rootDir);
    const freeze = await buildReviewedAotEfficiencyFreeze(rootDir, policy);

    expect(policy.denominator).toEqual({
      rows: 8,
      pairs: 4,
      paidOriginalRows: 4,
      deterministicReviewedAotRows: 4,
      taskIds: [
        "env-manager-scorer-authority-node-dev-001",
        "env-manager-scorer-authority-vite-dev-002",
      ],
      repetitions: 2,
      systems: ["original", "reviewed-aot"],
      order: "task-then-repetition-then-system",
      retries: 0,
      forwardOnly: true,
    });
    expect(policy.productionOneTime).toEqual({
      compileModelTokens: 9358,
      profileModelTokens: 0,
      packageModelTokens: 0,
      missing: [],
    });
    expect(validated.rows).toHaveLength(8);
    expect(validated.rows.map((row) => `${row.taskId}:${row.repetition}:${row.system}`)).toEqual([
      "env-manager-scorer-authority-node-dev-001:1:original",
      "env-manager-scorer-authority-node-dev-001:1:reviewed-aot",
      "env-manager-scorer-authority-node-dev-001:2:original",
      "env-manager-scorer-authority-node-dev-001:2:reviewed-aot",
      "env-manager-scorer-authority-vite-dev-002:1:original",
      "env-manager-scorer-authority-vite-dev-002:1:reviewed-aot",
      "env-manager-scorer-authority-vite-dev-002:2:original",
      "env-manager-scorer-authority-vite-dev-002:2:reviewed-aot",
    ]);
    expect(freeze).toMatchObject({
      status: "passed",
      plan: { rows: 8, pairs: 4, paidOriginalRows: 4, deterministicReviewedAotRows: 4 },
      deterministicDryRun: { tasks: 2, fullPassTasks: 2, modelTokens: 0 },
      accounting: { currentStagePaidCalls: 0, matrixExecuted: false },
      authorizations: { paidMatrix: true, heldOut: false, efficiencyClaim: false },
    });
  });

  test("fails closed when the construction-cost authority digest drifts", async () => {
    const rootDir = process.cwd();
    const policy = await buildReviewedAotEfficiencyPolicy(rootDir);
    await expect(validateReviewedAotEfficiencyPolicy({
      ...policy,
      constructionCostReadiness: { ...policy.constructionCostReadiness, sha256: "0".repeat(64) },
    }, rootDir)).rejects.toThrow("digest mismatch");
  });

  test("accepts only an exact forward-only prefix of the frozen row order", async () => {
    const rootDir = process.cwd();
    const policy = await buildReviewedAotEfficiencyPolicy(rootDir);
    const { rows } = await validateReviewedAotEfficiencyPolicy(policy, rootDir);
    expect(() => assertReviewedAotEfficiencyPrefix(rows, rows.slice(0, 3))).not.toThrow();
    expect(() => assertReviewedAotEfficiencyPrefix(rows, [rows[1]!])).toThrow("prefix identity mismatch");
    expect(() => assertReviewedAotEfficiencyPrefix(rows, [...rows, rows[0]!])).toThrow("prefix length mismatch");
  });
});
