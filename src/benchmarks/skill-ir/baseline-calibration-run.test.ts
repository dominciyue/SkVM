import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256Bytes } from "./source-fixture";
import type { BaselineCalibrationLock } from "./baseline-calibration";
import {
  assertBaselineExecutionPrerequisites,
  buildBaselineCalibrationPlan,
  compactBaselineRouteProbe,
  parseBaselineCalibrationRunArgs,
} from "./baseline-calibration-run";

const rootDir = path.resolve(import.meta.dir, "../../..");

async function frozenFile(filePath: string): Promise<{ path: string; sha256: string }> {
  return {
    path: filePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, filePath))),
  };
}

async function writeTestLock(directory: string): Promise<string> {
  const inputPaths = {
    source: "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md",
    tasks: "benchmarks/skill-ir/pilots/experimental-design/tasks.json",
    resourceContract: "benchmarks/skill-ir/pilots/experimental-design/resource-contract.json",
    scorer: "src/bench/evaluators/experimental-design-grade.ts",
    baseIr: "benchmarks/skill-ir/pilots/experimental-design/base-ir.json",
    sourceAudit: "benchmarks/skill-ir/pilots/experimental-design/base-ir-source-audit.json",
  };
  const implementationPaths = {
    lockValidator: "src/benchmarks/skill-ir/baseline-calibration.ts",
    runner: "src/benchmarks/skill-ir/baseline-calibration-run.ts",
    gate: "src/benchmarks/skill-ir/baseline-calibration.ts",
    gateRunner: "src/benchmarks/skill-ir/baseline-calibration.ts",
    modelRunner: "src/benchmarks/skill-ir/real-agent-run.ts",
    scoring: "src/benchmarks/skill-ir/scoring.ts",
    routeProbe: "src/benchmarks/skill-ir/route-probe.ts",
    resourceProbe: "src/benchmarks/skill-ir/resource-contract-run.ts",
    bareAgent: "src/adapters/bare-agent.ts",
  };
  const lock: BaselineCalibrationLock = {
    schemaVersion: "skill-ir-baseline-calibration-lock/v1",
    status: "preregistered",
    calibrationId: "experimental-design-baseline-calibration-v1",
    methodEvidence: false,
    corpus: "pilot",
    skillId: "experimental-design",
    frozenInputs: Object.fromEntries(await Promise.all(Object.entries(inputPaths)
      .map(async ([key, value]) => [key, await frozenFile(value)]))) as BaselineCalibrationLock["frozenInputs"],
    frozenImplementations: Object.fromEntries(await Promise.all(Object.entries(implementationPaths)
      .map(async ([key, value]) => [key, await frozenFile(value)]))) as BaselineCalibrationLock["frozenImplementations"],
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
    prohibited: ["held-out execution"],
  };
  const lockPath = path.join(directory, "lock.json");
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return lockPath;
}

describe("skill-neutral baseline calibration runner", () => {
  test("builds exactly four runnable no-skill/original development pairs", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "baseline-plan-"));
    try {
      const lockPath = await writeTestLock(tempDir);
      const result = await buildBaselineCalibrationPlan({
        rootDir,
        lockPath,
        outDir: path.join(tempDir, "out"),
        phase: "plan",
      });

      expect(result.schemaVersion).toBe("skill-ir-baseline-calibration-plan/v1");
      expect(result.plan).toHaveLength(8);
      expect(result.lockDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(new Set(result.plan.map((row) => row.system))).toEqual(
        new Set(["no-skill", "original"]),
      );
      expect(new Set(result.plan.map((row) => `${row.caseId}:${row.runIndex}`))).toHaveLength(4);
      expect(result.runArgs.allowTasksAuthored).toBe(false);
      expect(result.runArgs.allowDevelopmentReplay).toBe(false);
      expect(result.plan.every((row) =>
        row.panelConfigId === "experimental-design-baseline-calibration-v1"
        && row.model === "xty/gpt-5.6-sol"
        && !row.caseId.includes("heldout"))).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("keeps route evidence compact and binds it to the lock digest", () => {
    const route = compactBaselineRouteProbe({
      calibrationId: "experimental-design-baseline-calibration-v1",
      lockDigest: "a".repeat(64),
      model: "xty/gpt-5.6-sol",
      caseId: "experimental-design:skvm:windows:clean:experimental-design-stratified-dev-001",
      execution: {
        exitCode: 0,
        timedOut: false,
        durationMs: 123,
        stdout: "private model text",
        stderr: "D:\\private\\path",
      },
    });

    expect(route).toMatchObject({
      schemaVersion: "skill-ir-baseline-calibration-route-probe-result/v1",
      lockDigest: "a".repeat(64),
      status: "ok",
      system: "original",
      timedOut: false,
    });
    expect(JSON.stringify(route)).not.toContain("private");
    expect(JSON.stringify(route)).not.toContain("stdout");
  });

  test("requires API, resource success, and exact route identity before execute", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "baseline-execute-"));
    try {
      const lockPath = await writeTestLock(tempDir);
      const result = await buildBaselineCalibrationPlan({
        rootDir,
        lockPath,
        outDir: path.join(tempDir, "out"),
        phase: "execute",
      });
      const resource = {
        schemaVersion: "skill-ir-resource-probe-result/v1" as const,
        methodEvidence: false as const,
        status: "ok" as const,
        executableSource: "env" as const,
        requiredModules: [],
        exitCode: 0,
        stderrClass: "none" as const,
        durationMs: 1,
      };
      const route = compactBaselineRouteProbe({
        calibrationId: result.calibrationId,
        lockDigest: result.lockDigest,
        model: result.lock.model.route,
        caseId: result.plan.find((row) => row.system === "original")!.caseId,
        execution: { exitCode: 0, timedOut: false, stdout: "", stderr: "" },
      });

      expect(() => assertBaselineExecutionPrerequisites(
        result.lock,
        result.lockDigest,
        resource,
        route,
        {},
      )).toThrow("API key");
      expect(() => assertBaselineExecutionPrerequisites(
        result.lock,
        result.lockDigest,
        { ...resource, status: "failed" },
        route,
        { SKVM_XTY_API_KEY: "test-key" },
      )).toThrow("resource probe");
      expect(() => assertBaselineExecutionPrerequisites(
        result.lock,
        result.lockDigest,
        resource,
        { ...route, lockDigest: "b".repeat(64) },
        { SKVM_XTY_API_KEY: "test-key" },
      )).toThrow("route probe");
      expect(() => assertBaselineExecutionPrerequisites(
        result.lock,
        result.lockDigest,
        resource,
        route,
        { SKVM_XTY_API_KEY: "test-key" },
      )).not.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("parses only plan, route-probe, and execute", () => {
    expect(parseBaselineCalibrationRunArgs([
      "--lock=lock.json",
      "--out-dir=out",
      "--phase=route-probe",
    ])).toMatchObject({ phase: "route-probe" });
    expect(() => parseBaselineCalibrationRunArgs([
      "--lock=lock.json",
      "--out-dir=out",
      "--phase=held-out",
    ])).toThrow("phase");
  });
});
