import { describe, expect, test } from "bun:test";
import {
  StageNCrossModelPanelLockSchema,
  buildStageNSmokeQualification,
  type StageNCrossModelPanelLock,
  type StageNSmokeRow,
} from "./stage-n-cross-model-panel";

const digest = (char: string) => char.repeat(64);

function makeLock(): StageNCrossModelPanelLock {
  return StageNCrossModelPanelLockSchema.parse({
    schemaVersion: "skill-ir-stage-n-cross-model-aot-stability-panel-lock/v1",
    status: "preregistered",
    experimentId: "skill-ir-stage-n-cross-model-aot-stability-001",
    models: [
      { family: "gpt", route: "xty/gpt-5.6-sol" },
      { family: "claude", route: "xty/claude-opus-4-8" },
      { family: "deepseek", route: "xty/deepseek-v4-pro" },
    ],
    skills: [
      {
        skillId: "api-tester",
        sourceLock: { path: "benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json", sha256: digest("a") },
        originalEvidence: { path: "results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json", sha256: digest("b") },
        taskIds: ["api-tester-openapi-users-dev-001", "api-tester-openapi-inventory-dev-002"],
      },
      {
        skillId: "env-manager-v3",
        sourceLock: { path: "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-readonly-serial-v1.json", sha256: digest("c") },
        originalEvidence: { path: "results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/paired-quality-evidence.json", sha256: digest("d") },
        costEvidence: { path: "results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/cost-accounting.json", sha256: digest("e") },
        taskIds: ["env-manager-scorer-authority-node-dev-001", "env-manager-scorer-authority-vite-dev-002"],
      },
    ],
    harness: {
      adapter: "pi", adapterVersion: "0.67.68", adapterConfig: "managed", environment: "windows", context: "clean",
      absoluteTimeoutMs: 600000, idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000,
    },
    denominator: {
      skills: 2, tasksPerSkill: 2, repetitions: 2, families: 3,
      originalRows: 24, artifactRows: 8, logicalRows: 32,
    },
    smoke: { rowsPerFamilyPerSkill: 1, expectedRows: 6, retries: 0, reserve: 0 },
    matrix: { authorized: false, originalRows: 24, artifactRows: 8, logicalRows: 32, paidOriginalRows: 16 },
    claims: { heldOutAllowed: false, promotionAllowed: false, readinessMutationAllowed: false, claim: "AOT removes runtime model" },
    prohibited: ["matrix-before-smoke-review", "retry-or-reserve", "held-out", "package-mutation", "readiness-mutation"],
  });
}

function smokeRows(): StageNSmokeRow[] {
  const routes = { gpt: "xty/gpt-5.6-sol", claude: "xty/claude-opus-4-8", deepseek: "xty/deepseek-v4-pro" } as const;
  const taskIds = { "api-tester": "api-tester-openapi-users-dev-001", "env-manager-v3": "env-manager-scorer-authority-node-dev-001" } as const;
  return ["gpt", "claude", "deepseek"].flatMap((family) => ["api-tester", "env-manager-v3"].map((skillId) => ({
    family: family as StageNSmokeRow["family"],
    skillId: skillId as StageNSmokeRow["skillId"],
    route: routes[family as keyof typeof routes],
    taskId: taskIds[skillId as keyof typeof taskIds],
    mode: family === "gpt" ? "digest-bind" as const : "execute" as const,
    status: "complete" as const,
    usageAvailable: true,
    classification: "semantic-complete" as const,
    detail: "smoke",
  })));
}

describe("Stage N cross-model AOT stability contract", () => {
  test("freezes the corrected 24 + 8 = 32 denominator and new identity", () => {
    const lock = makeLock();
    expect(lock.experimentId).toBe("skill-ir-stage-n-cross-model-aot-stability-001");
    expect(lock.denominator).toEqual({ skills: 2, tasksPerSkill: 2, repetitions: 2, families: 3, originalRows: 24, artifactRows: 8, logicalRows: 32 });
    expect(lock.matrix).toMatchObject({ authorized: false, originalRows: 24, artifactRows: 8, logicalRows: 32, paidOriginalRows: 16 });
    expect(() => StageNCrossModelPanelLockSchema.parse({ ...lock, denominator: { ...lock.denominator, originalRows: 27 } })).toThrow(/denominator/);
  });

  test("requires one smoke row per family and skill while retaining failed rows", () => {
    const result = buildStageNSmokeQualification({ lock: makeLock(), lockSha256: digest("f"), rows: smokeRows() });
    expect(result.expectedRows).toBe(6);
    expect(result.observedRows).toBe(6);
    expect(result.eligibleFamilies).toEqual(["gpt", "claude", "deepseek"]);

    const failed = smokeRows().map((row) => row.family === "deepseek" ? { ...row, status: "failed" as const, classification: "active-absolute-timeout" as const, usageAvailable: false } : row);
    const negative = buildStageNSmokeQualification({ lock: makeLock(), lockSha256: digest("f"), rows: failed });
    expect(negative.status).toBe("failed");
    expect(negative.eligibleFamilies).toEqual(["gpt", "claude"]);
    expect(negative.rows.find((row) => row.family === "deepseek")?.status).toBe("failed");
  });

  test("rejects duplicate or missing smoke rows instead of shrinking the denominator", () => {
    const lock = makeLock();
    expect(() => buildStageNSmokeQualification({ lock, lockSha256: digest("1"), rows: smokeRows().slice(0, 5) })).toThrow(/smoke denominator/);
    expect(() => buildStageNSmokeQualification({ lock, lockSha256: digest("1"), rows: [...smokeRows(), smokeRows()[0]!] })).toThrow(/duplicate smoke row/);
  });
});
