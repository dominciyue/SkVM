import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import {
  parsePreIrCalibrationGateArgs,
  runPreIrCalibrationGateFile,
} from "./pre-ir-calibration-gate-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)

function scoredRows(): ScoredAgentRunRow[] {
  const rows: ScoredAgentRunRow[] = []
  for (const task of ["law-to-markdown-statute-dev-001", "law-to-markdown-standard-dev-002"]) {
    for (const runIndex of [1, 2]) {
      for (const system of ["no-skill", "original"] as const) {
        const weaker = task.endsWith("001") && runIndex === 1 && system === "no-skill"
        rows.push({
          caseId: `law-to-markdown:skvm:windows:clean:${task}`,
          skill: "law-to-markdown",
          agent: "skvm",
          environment: "windows",
          context: "clean",
          task,
          system,
          model: "xty/gpt-5.6-sol",
          modelFamily: "gpt",
          adapter: "bare-agent",
          adapterVersion: "workspace-law-pre-ir-v1",
          panelConfigId: "law-to-markdown-pre-ir-calibration-v1",
          runIndex,
          taskSplit: "development",
          success: !weaker,
          ruleViolations: weaker ? 1 : 0,
          stepCoverage: 1,
          latencyMs: 1,
          runStatus: "ok",
          successSource: "deterministic-evaluator",
          failedCriteria: weaker ? ["law-heading-structure"] : [],
          evaluatorScore: weaker ? 0.8 : 1,
          evaluationSummary: [{
            method: "custom",
            id: "law-heading-structure",
            pass: !weaker,
            score: weaker ? 0 : 1,
            details: "PRIVATE scorer detail",
          }],
        })
      }
    }
  }
  return rows
}

describe("pre-IR calibration gate CLI", () => {
  test("writes digest-bound compact evidence without raw or evaluator content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pre-ir-gate-"))
    try {
      const rawPath = path.join(dir, "raw.jsonl")
      const scoredPath = path.join(dir, "scored.jsonl")
      const resourcePath = path.join(dir, "resource.json")
      const routePath = path.join(dir, "route.json")
      const outPath = path.join(dir, "nested", "report.json")
      await writeFile(rawPath, '{"private":"PRIVATE RAW MODEL OUTPUT"}\n', "utf8")
      await writeFile(scoredPath, `${scoredRows().map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
      await writeFile(resourcePath, `${JSON.stringify({
        schemaVersion: "skill-ir-resource-probe-result/v1",
        methodEvidence: false,
        status: "ok",
        executableSource: "env",
        requiredModules: ["docx", "pdfplumber"],
        exitCode: 0,
        stderrClass: "none",
        durationMs: 1,
      })}\n`, "utf8")
      await writeFile(routePath, `${JSON.stringify({
        schemaVersion: "skill-ir-pre-ir-route-probe-result/v1",
        calibrationId: "law-to-markdown-pre-ir-calibration-v1",
        methodEvidence: false,
        model: "xty/gpt-5.6-sol",
        caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-statute-dev-001",
        system: "original",
        status: "ok",
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      })}\n`, "utf8")

      const report = await runPreIrCalibrationGateFile({
        rootDir,
        lockPath,
        rawPath,
        scoredPath,
        resourcePath,
        routePath,
        outPath,
      })
      expect(report.passed).toBe(true)
      expect(report.evidence).toMatchObject({
        lockSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        rawSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        scoredSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        resourceProbeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        routeProbeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      const serialized = await readFile(outPath, "utf8")
      expect(serialized).not.toContain("PRIVATE")
      expect(serialized).not.toContain(dir)
      expect(serialized).not.toContain("details")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rejects unknown arguments", () => {
    expect(() => parsePreIrCalibrationGateArgs(["--held-out=true"])).toThrow("Unknown argument")
  })
})
