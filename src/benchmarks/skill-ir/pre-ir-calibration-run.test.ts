import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertPreIrExecutionPrerequisites,
  buildPreIrCalibrationPlan,
  compactPreIrRouteProbe,
  parsePreIrCalibrationRunArgs,
} from "./pre-ir-calibration-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)

describe("pre-IR calibration runner", () => {
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
