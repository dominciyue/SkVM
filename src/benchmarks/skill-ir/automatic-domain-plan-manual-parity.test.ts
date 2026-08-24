import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveCrossSkillSemanticParity,
  runDomainPlanManualParityCase,
  summarizeManualEvaluation,
} from "./automatic-domain-plan-manual-parity";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function ref(path: string) {
  return { path, sha256: sha256Bytes(await readFile(path)) };
}

describe("restricted Domain Plan manual-evaluator parity", () => {
  test("uses the frozen task's real criterion denominator, weights, hard gates, and threshold", () => {
    const summary = summarizeManualEvaluation({
      criteria: [
        { id: "integrity", weight: 0.2, hardGate: true, status: "pass" },
        { id: "analysis", weight: 0.45, hardGate: false, status: "fail" },
        { id: "consistency", weight: 0.35, hardGate: false, status: "pass" },
      ],
      passThreshold: 0.85,
    });
    expect(summary).toEqual({
      passedCriteria: 2,
      criterionCount: 3,
      passRate: 2 / 3,
      weightedScore: 0.55,
      passThreshold: 0.85,
      hardGatePassed: true,
      thresholdPassed: false,
      infrastructureFailures: 0,
      fullCriterionPass: false,
      distanceToFull: 1,
    });
  });

  test("executes the frozen Env plan in both real development workdirs and invokes its 3-criterion evaluator", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "skill-ir-env-manual-parity-"));
    temporaryDirectories.push(outputDir);
    const report = await runDomainPlanManualParityCase({
      rootDir: process.cwd(),
      outputPath: join(outputDir, "report.json"),
      input: {
        schemaVersion: "skill-ir-domain-plan-manual-parity-case/v1",
        caseId: "env-manager",
        plan: await ref("results/skill-ir/automatic-domain-plan-attribution-v1/generated-plan.json"),
        taskDescription: await ref("benchmarks/skill-ir/task-descriptions/env-manager.json"),
        taskSet: await ref("benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json"),
        manualEvaluatorModule: await ref("src/bench/evaluators/env-manager-grade-v3.ts"),
        taskIds: [
          "env-manager-scorer-authority-node-dev-001",
          "env-manager-scorer-authority-vite-dev-002",
        ],
      },
      measurementCompletedAt: "2026-08-24T16:21:00.000Z",
    });
    expect(report.tasks).toHaveLength(2);
    expect(report.tasks.every((task) => task.baseline.summary.criterionCount === 3)).toBe(true);
    expect(report.tasks.every((task) => task.postPlan.summary.criterionCount === 3)).toBe(true);
    expect(report.tasks.every((task) => task.runtime.status === "failed")).toBe(true);
    expect(report.tasks.every((task) => task.protectedInputsPreserved)).toBe(true);
    expect(report.caseParity.status).toBe("failed");
    expect(report.summary).toMatchObject({
      taskCount: 2,
      paidCalls: 0,
      heldOutAccesses: 0,
      coreBranchDelta: 0,
    });
  });

  test("requires two distinct fully passing cases for cross-skill parity", () => {
    const base = {
      taskCount: 2,
      fullParityTasks: 2,
      caseParity: { status: "passed" as const },
    };
    expect(deriveCrossSkillSemanticParity([
      { caseId: "env-manager", ...base },
    ], 0)).toEqual({
      status: "failed",
      reason: "insufficient-distinct-skills",
      distinctSkillCount: 1,
      fullyPassingSkillCount: 1,
      coreBranchDelta: 0,
    });
    expect(deriveCrossSkillSemanticParity([
      { caseId: "env-manager", ...base },
      { caseId: "law-to-markdown", ...base },
    ], 0).status).toBe("passed");
    expect(deriveCrossSkillSemanticParity([
      { caseId: "env-manager", ...base },
      { caseId: "law-to-markdown", ...base, caseParity: { status: "failed" as const } },
    ], 0).reason).toBe("case-parity-failed");
  });
});
