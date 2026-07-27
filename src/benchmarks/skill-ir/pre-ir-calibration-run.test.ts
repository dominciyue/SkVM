import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertPreIrExecutionPrerequisites,
  buildPreIrCalibrationPlan,
  compactPreIrRouteProbe,
  parsePreIrCalibrationRunArgs,
  projectPreIrPlanRuntime,
  withQualifiedPreIrRuntimeEnvironment,
} from "./pre-ir-calibration-run.ts"
import type { PreIrCalibrationLock } from "./pre-ir-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)
const v2LockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-pre-ir-calibration-lock.json",
)
const v2RuntimeLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-runtime-qualified-calibration-lock.json",
)
const v2ConfigBoundLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-config-bound-calibration-lock.json",
)
const v2ExplicitChildEnvLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-explicit-child-env-calibration-lock.json",
)
const v2Bun1313CalibrationLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-bun-1.3.13-calibration-lock.json",
)
const v2NodeHttpFetchActiveLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-node-http-fetch-active-calibration-lock.json",
)
const v2NodeHttpCalibrationLockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-node-http-calibration-lock.json",
)

describe("pre-IR calibration runner", () => {
  test("compiles the frozen experimental-design v2 materialized-delta calibration", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-pre-ir-plan-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2LockPath,
        outDir,
        phase: "plan",
      })

      expect(result.plan).toHaveLength(8)
      expect(new Set(result.plan.map((row) => row.caseId.split(":")[0]))).toEqual(
        new Set(["experimental-design-v2"]),
      )
      expect(new Set(result.plan.map((row) => row.system))).toEqual(new Set(["no-skill", "original"]))
      expect(new Set(result.plan.map((row) => row.caseId.split(":").at(-1)))).toEqual(new Set([
        "experimental-design-v2-stratified-dev-001",
        "experimental-design-v2-cluster-sequential-dev-002",
      ]))
      expect(result.plan.every((row) => !row.caseId.includes("heldout"))).toBe(true)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("keeps legacy commands unchanged and projects only a runtime-qualified plan", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-runtime-plan-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2LockPath,
        outDir,
        phase: "plan",
      })
      expect(projectPreIrPlanRuntime(result.plan, result.lock, rootDir)).toEqual(result.plan)

      const qualified = {
        ...result.lock,
        schemaVersion: "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1",
        executionRuntime: {
          kind: "compiled-skvm",
          commandMode: "direct",
          sourceCommit: "a".repeat(40),
          executable: { path: ".skvm/runtime/skvm.exe", sha256: "b".repeat(64) },
          qualification: { path: "results/runtime-qualification.json", sha256: "c".repeat(64) },
        },
      } as unknown as PreIrCalibrationLock
      const projected = projectPreIrPlanRuntime(result.plan, qualified, rootDir)
      expect(projected.every((row) => row.command[0] === path.resolve(rootDir, ".skvm/runtime/skvm.exe"))).toBe(true)
      expect(projected.every((row) => row.command[1] === "run")).toBe(true)
      expect(result.plan.every((row) => row.command.slice(0, 4).join(" ") === "bun run skvm run")).toBe(true)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("compiles the committed runtime-qualified lock to the frozen direct executable", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-qualified-plan-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2RuntimeLockPath,
        outDir,
        phase: "plan",
      })

      expect(result.plan).toHaveLength(8)
      expect(result.plan.every((row) => row.command[0] === path.resolve(rootDir, "dist/skvm.exe"))).toBe(true)
      expect(result.plan.every((row) => row.command[1] === "run")).toBe(true)
      expect(result.plan.every((row) => !row.command.includes("skvm"))).toBe(true)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("compiles the config-bound replacement with the same frozen direct executable", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-config-bound-plan-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2ConfigBoundLockPath,
        outDir,
        phase: "plan",
      })

      expect(result.plan).toHaveLength(8)
      expect(result.lock).toMatchObject({ executionRuntime: { cacheRoot: ".skvm" } })
      expect(result.plan.every((row) => row.command[0] === path.resolve(rootDir, "dist/skvm.exe"))).toBe(true)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("rejects the historical explicit-child-env plan after bound orchestration drifts", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-explicit-child-env-plan-"))
    try {
      await expect(buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2ExplicitChildEnvLockPath,
        outDir,
        phase: "plan",
      })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration-run.ts digest mismatch")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("rejects the historical fetch-qualified matrix after transport orchestration evolves", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-bun-1313-plan-"))
    try {
      await expect(buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2Bun1313CalibrationLockPath,
        outDir,
        phase: "plan",
      })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration.ts digest mismatch")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("binds and restores the qualified cache root around child execution", async () => {
    const previous = process.env.SKVM_CACHE
    const lock = {
      schemaVersion: "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1",
      executionRuntime: { cacheRoot: ".skvm" },
    } as unknown as PreIrCalibrationLock
    delete process.env.SKVM_CACHE
    try {
      await expect(withQualifiedPreIrRuntimeEnvironment(lock, rootDir, async (env) => {
        expect(env.SKVM_CACHE).toBe(path.resolve(rootDir, ".skvm"))
        expect(process.env.SKVM_CACHE).toBeUndefined()
        throw new Error("test callback failure")
      })).rejects.toThrow("test callback failure")
      expect(process.env.SKVM_CACHE).toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.SKVM_CACHE
      else process.env.SKVM_CACHE = previous
    }
  })

  test("projects the Node HTTP helper only for a transport-qualified lock", async () => {
    const lock = {
      schemaVersion: "skill-ir-node-http-runtime-qualified-pre-ir-calibration-lock/v1",
      executionRuntime: { cacheRoot: ".skvm" },
      nodeHttpTransport: {
        kind: "node-http-helper",
        nodeExecutable: { path: ".skvm/runtime/node.exe" },
        helper: { path: "src/providers/openai-compatible-node-helper.mjs" },
      },
    } as unknown as PreIrCalibrationLock

    await withQualifiedPreIrRuntimeEnvironment(lock, rootDir, async (env) => {
      expect(env.SKVM_CACHE).toBe(path.resolve(rootDir, ".skvm"))
      expect(env.SKVM_OPENAI_HTTP_NODE).toBe(path.resolve(rootDir, ".skvm/runtime/node.exe"))
      expect(env.SKVM_OPENAI_HTTP_HELPER).toBe(
        path.resolve(rootDir, "src/providers/openai-compatible-node-helper.mjs"),
      )
    })
  })

  test("rejects the historical Node HTTP candidate after final-lock verification evolves", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-node-http-plan-"))
    try {
      await expect(buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2NodeHttpFetchActiveLockPath,
        outDir,
        phase: "plan",
      })).rejects.toThrow("orchestration src/benchmarks/skill-ir/pre-ir-calibration.ts digest mismatch")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("compiles the fetch-qualified Node HTTP matrix as eight direct rows", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-node-http-matrix-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath: v2NodeHttpCalibrationLockPath,
        outDir,
        phase: "plan",
      })

      expect(result.lock.schemaVersion).toBe("skill-ir-node-http-fetch-qualified-pre-ir-calibration-lock/v1")
      expect(result.plan).toHaveLength(8)
      expect(result.plan.every((row) => row.command[0] === path.resolve(
        rootDir,
        ".skvm/runtime/bun-1.3.13-node-http-2026-07-27/skvm.exe",
      ))).toBe(true)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("compiles exactly four complete no-skill/original development pairs", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "law-pre-ir-plan-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath,
        outDir,
        phase: "plan",
      })

      expect(result.schemaVersion).toBe("skill-ir-pre-ir-calibration-plan/v1")
      expect(result.calibrationId).toBe("law-to-markdown-pre-ir-calibration-v1")
      expect(result.execute).toBe(false)
      expect(result.plan).toHaveLength(8)
      expect(new Set(result.plan.map((row) => row.system))).toEqual(new Set(["no-skill", "original"]))
      expect(new Set(result.plan.map((row) => row.runIndex))).toEqual(new Set([1, 2]))
      expect(new Set(result.plan.map((row) => row.panelConfigId))).toEqual(
        new Set(["law-to-markdown-pre-ir-calibration-v1"]),
      )
      expect(result.plan.every((row) => row.model === "xty/gpt-5.6-sol")).toBe(true)
      expect(result.plan.every((row) => !row.caseId.includes("heldout"))).toBe(true)

      const pairKeys = new Set(result.plan.map((row) =>
        `${row.caseId}:${row.runIndex}`,
      ))
      expect(pairKeys).toHaveLength(4)
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })

  test("parses only the three explicit lock-bound phases", () => {
    expect(parsePreIrCalibrationRunArgs([
      `--lock=${lockPath}`,
      "--out-dir=results/skill-ir/law-pre-ir-test",
      "--phase=route-probe",
    ])).toMatchObject({ phase: "route-probe" })
    expect(() => parsePreIrCalibrationRunArgs([
      `--lock=${lockPath}`,
      "--out-dir=results/skill-ir/law-pre-ir-test",
      "--phase=held-out",
    ])).toThrow("phase")
    expect(() => parsePreIrCalibrationRunArgs([
      `--lock=${lockPath}`,
      "--out-dir=results/skill-ir/law-pre-ir-test",
      "--execute",
    ])).toThrow("Unknown argument")
  })

  test("keeps route probe output compact and non-method", () => {
    const result = compactPreIrRouteProbe({
      calibrationId: "law-to-markdown-pre-ir-calibration-v1",
      model: "xty/gpt-5.6-sol",
      caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-statute-dev-001",
      execution: {
        exitCode: 0,
        timedOut: false,
        durationMs: 123,
        stdout: "private model text",
        stderr: "D:\\private\\path",
      },
    })

    expect(result).toEqual({
      schemaVersion: "skill-ir-pre-ir-route-probe-result/v1",
      calibrationId: "law-to-markdown-pre-ir-calibration-v1",
      methodEvidence: false,
      model: "xty/gpt-5.6-sol",
      caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-statute-dev-001",
      system: "original",
      status: "ok",
      exitCode: 0,
      timedOut: false,
      durationMs: 123,
    })
    expect(JSON.stringify(result)).not.toContain("private")
  })

  test("blocks execution without fresh resource, route, and API prerequisites", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "law-pre-ir-execute-"))
    try {
      const result = await buildPreIrCalibrationPlan({
        rootDir,
        lockPath,
        outDir,
        phase: "execute",
      })
    const resource = {
      schemaVersion: "skill-ir-resource-probe-result/v1" as const,
      methodEvidence: false as const,
      status: "ok" as const,
      executableSource: "env" as const,
      requiredModules: ["docx", "pdfplumber"],
      exitCode: 0,
      stderrClass: "none" as const,
      durationMs: 1,
    }
    const route = compactPreIrRouteProbe({
      calibrationId: result.calibrationId,
      model: result.lock.model.route,
      caseId: result.plan.find((row) => row.system === "original")!.caseId,
      execution: { exitCode: 0, timedOut: false, stdout: "", stderr: "" },
    })

      expect(() => assertPreIrExecutionPrerequisites(result.lock, resource, route, {})).toThrow("API key")
      expect(() => assertPreIrExecutionPrerequisites(
        result.lock,
        { ...resource, status: "failed" },
        route,
        { SKVM_XTY_API_KEY: "test-key" },
      )).toThrow("resource probe")
      expect(() => assertPreIrExecutionPrerequisites(
        result.lock,
        resource,
        { ...route, model: "xty/other" },
        { SKVM_XTY_API_KEY: "test-key" },
      )).toThrow("route probe")
      expect(() => assertPreIrExecutionPrerequisites(
        result.lock,
        resource,
        route,
        { SKVM_XTY_API_KEY: "test-key" },
      )).not.toThrow()
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })
})
