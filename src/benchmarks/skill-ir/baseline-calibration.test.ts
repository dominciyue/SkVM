import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256Bytes } from "./source-fixture";
import {
  validateBaselineCalibrationLock,
  type BaselineCalibrationLock,
} from "./baseline-calibration";

const rootDir = path.resolve(import.meta.dir, "../../..");

const paths = {
  source: "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md",
  tasks: "benchmarks/skill-ir/pilots/experimental-design/tasks.json",
  resourceContract: "benchmarks/skill-ir/pilots/experimental-design/resource-contract.json",
  scorer: "src/bench/evaluators/experimental-design-grade.ts",
  baseIr: "benchmarks/skill-ir/pilots/experimental-design/base-ir.json",
  sourceAudit: "benchmarks/skill-ir/pilots/experimental-design/base-ir-source-audit.json",
  lockValidator: "src/benchmarks/skill-ir/baseline-calibration.ts",
  runner: "src/benchmarks/skill-ir/baseline-calibration.ts",
  gate: "src/benchmarks/skill-ir/baseline-calibration.ts",
  gateRunner: "src/benchmarks/skill-ir/baseline-calibration.ts",
  modelRunner: "src/benchmarks/skill-ir/real-agent-run.ts",
  scoring: "src/benchmarks/skill-ir/scoring.ts",
  routeProbe: "src/benchmarks/skill-ir/route-probe.ts",
  resourceProbe: "src/benchmarks/skill-ir/resource-contract-run.ts",
  bareAgent: "src/adapters/bare-agent.ts",
} as const;

async function frozenFile(filePath: string): Promise<{ path: string; sha256: string }> {
  return {
    path: filePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, filePath))),
  };
}

async function validLock(): Promise<BaselineCalibrationLock> {
  const frozenInputs = Object.fromEntries(await Promise.all(
    Object.entries(paths).slice(0, 6).map(async ([key, filePath]) => [key, await frozenFile(filePath)]),
  ));
  const frozenImplementations = Object.fromEntries(await Promise.all(
    Object.entries(paths).slice(6).map(async ([key, filePath]) => [key, await frozenFile(filePath)]),
  ));
  return {
    schemaVersion: "skill-ir-baseline-calibration-lock/v1",
    status: "preregistered",
    calibrationId: "experimental-design-baseline-calibration-v1",
    methodEvidence: false,
    corpus: "pilot",
    skillId: "experimental-design",
    frozenInputs,
    frozenImplementations,
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    adapter: { id: "bare-agent", version: "workspace-experimental-design-baseline-v1" },
    matrix: {
      systems: ["no-skill", "original"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: [
        "experimental-design-stratified-dev-001",
        "experimental-design-cluster-dev-002",
      ],
      repetitions: 2,
      expectedRows: 8,
      expectedPairs: 4,
    },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY",
      pythonEnv: "SKVM_PYTHON",
      retries: 0,
      resourceProbeRequired: true,
      routeProbeRequired: true,
      routeProbeTimeoutMs: 180000,
    },
    gate: {
      maximumInfrastructureFailures: 0,
      requireNoSkillNonSaturation: true,
      minimumDifferingPairs: 1,
      requireOriginalNonRegression: false,
    },
    promotionBoundary: {
      corpusStatusAtRun: "runnable",
      fullDevelopmentPlanningAfterGate: true,
      entersMainClaim: false,
      permitsHeldOut: false,
      permitsScorerRetuning: false,
      permitsPackageRecompile: false,
      permitsPgo: false,
    },
    prohibited: [
      "held-out execution",
      "scorer or task retuning from calibration output",
      "package recompile from calibration output",
      "PGO or main-claim interpretation",
    ],
  } as BaselineCalibrationLock;
}

describe("skill-neutral baseline calibration lock", () => {
  test("validates a runnable pilot and all frozen inputs and implementations", async () => {
    const lock = await validateBaselineCalibrationLock(await validLock(), rootDir);

    expect(lock.skillId).toBe("experimental-design");
    expect(lock.matrix.taskIds).toEqual([
      "experimental-design-stratified-dev-001",
      "experimental-design-cluster-dev-002",
    ]);
    expect(lock.promotionBoundary).toMatchObject({
      corpusStatusAtRun: "runnable",
      fullDevelopmentPlanningAfterGate: true,
      permitsHeldOut: false,
      entersMainClaim: false,
    });
  });

  test("rejects digest, lifecycle, path identity, and held-out drift", async () => {
    const digestDrift = await validLock();
    digestDrift.frozenImplementations.runner.sha256 = "0".repeat(64);
    await expect(validateBaselineCalibrationLock(digestDrift, rootDir)).rejects.toThrow(
      "digest mismatch",
    );

    const manifest = JSON.parse(await readFile(
      path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
      "utf8",
    )) as { skills: Array<Record<string, unknown>> };
    const lifecycleDrift = structuredClone(manifest);
    lifecycleDrift.skills.find((skill) => skill.id === "experimental-design")!.status = "tasks-authored";
    await expect(validateBaselineCalibrationLock(await validLock(), rootDir, {
      manifest: lifecycleDrift,
    })).rejects.toThrow("corpus identity drift");

    const pathDrift = structuredClone(manifest);
    pathDrift.skills.find((skill) => skill.id === "experimental-design")!.irPath = "other.json";
    await expect(validateBaselineCalibrationLock(await validLock(), rootDir, {
      manifest: pathDrift,
    })).rejects.toThrow("corpus identity drift");

    const heldOut = await validLock();
    heldOut.matrix.taskIds[1] = "experimental-design-sequential-heldout-001";
    await expect(validateBaselineCalibrationLock(heldOut, rootDir)).rejects.toThrow(
      "non-development",
    );
  });

  test("rejects duplicate tasks and weakened matrix or promotion boundaries", async () => {
    const duplicate = await validLock();
    duplicate.matrix.taskIds[1] = duplicate.matrix.taskIds[0];
    await expect(validateBaselineCalibrationLock(duplicate, rootDir)).rejects.toThrow("unique");

    const retries = await validLock();
    (retries.runtime as { retries: number }).retries = 1;
    await expect(validateBaselineCalibrationLock(retries, rootDir)).rejects.toThrow();

    const irSystem = await validLock();
    irSystem.matrix.systems[1] = "ir-static" as "original";
    await expect(validateBaselineCalibrationLock(irSystem, rootDir)).rejects.toThrow();

    const heldOutAllowed = await validLock();
    (heldOutAllowed.promotionBoundary as { permitsHeldOut: boolean }).permitsHeldOut = true;
    await expect(validateBaselineCalibrationLock(heldOutAllowed, rootDir)).rejects.toThrow();
  });
});
