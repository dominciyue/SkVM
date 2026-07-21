import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RawAgentRunRow } from "./scoring.ts"
import {
  InfrastructureDiagnosticLockSchema,
  auditInfrastructureRows,
} from "./infrastructure-diagnostic.ts"
import {
  parseInfrastructureDiagnosticArgs,
  runInfrastructureDiagnosticFile,
} from "./infrastructure-diagnostic-run.ts"

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function lock(overrides: Record<string, unknown> = {}) {
  return InfrastructureDiagnosticLockSchema.parse({
    schemaVersion: "skill-ir-infrastructure-diagnostic-lock/v1",
    diagnosticId: "env-manager-v4-bun-stability-diagnostic-v1",
    methodEvidence: false,
    sourceExperiment: {
      id: "env-manager-contract-repair-v4-development",
      catalog: "executable-contract-repair-artifact/v4",
      system: "ir-contract-artifact-dev",
      raw: { path: "raw.jsonl", sha256: "1".repeat(64) },
      summary: { path: "summary.json", sha256: "2".repeat(64) },
      gate: { path: "gate.json", sha256: "3".repeat(64) },
    },
    identity: {
      skill: "env-manager",
      model: "xty/gpt-5.6-sol",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-contract-repair-v4",
      agent: "skvm",
      environment: "windows",
      context: "clean",
      panelConfigId: "env-manager-contract-repair-v4-development",
    },
    taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
    repetitions: 2,
    retryPolicy: "forbid-source-rerun",
    heldOutAllowed: false,
    ...overrides,
  })
}

function crashRow(): RawAgentRunRow {
  return {
    caseId: "env-manager:skvm:windows:clean:env-manager-node-audit-dev-001",
    system: "ir-contract-artifact-dev",
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-contract-repair-v4",
    panelConfigId: "env-manager-contract-repair-v4-development",
    runIndex: 1,
    taskPath: "local/task.json",
    workDir: "D:\\private\\workdir",
    exitCode: 1,
    runStatus: "adapter-crashed",
    durationMs: 58_578,
    stdout: "private model output",
    stderr: [
      "Args: D:\\private\\task.json --model=xty/gpt-5.6-sol",
      "Bun v1.3.14 (0d9b296a) Windows x64",
      "panic(main thread): Internal assertion failure",
      "oh no: Bun has crashed. This indicates a bug in Bun, not your code.",
      "error: script skvm exited with code 3",
      "Artifact runtime infrastructure failure at generation",
    ].join("\n"),
    successSource: "execution-only",
    attempts: 1,
  }
}

describe("V4 infrastructure diagnostic", () => {
  test("projects a Bun assertion into a safe non-method record", () => {
    const report = auditInfrastructureRows([crashRow()], lock())

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-infrastructure-diagnostic-report/v1",
      diagnosticId: "env-manager-v4-bun-stability-diagnostic-v1",
      methodEvidence: false,
      reproducibility: "inconclusive",
      counts: { sourceRows: 1, infrastructureRows: 1 },
      records: [{
        taskId: "env-manager-node-audit-dev-001",
        runIndex: 1,
        failureStage: "generation",
        runStatus: "adapter-crashed",
        exitCode: 1,
        crashClass: "bun-internal-assertion",
        runtime: { name: "bun", version: "1.3.14" },
      }],
    })
    expect(report.records[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain("private")
    expect(serialized).not.toContain("stdout")
    expect(serialized).not.toContain("stderr")
  })

  test("rejects identity drift, retries, held-out tasks, and method-evidence locks", () => {
    expect(() => auditInfrastructureRows([{ ...crashRow(), model: "xty/other" }], lock())).toThrow("model")
    expect(() => auditInfrastructureRows([{ ...crashRow(), attempts: 2 }], lock())).toThrow("retry")
    expect(() => auditInfrastructureRows([{ ...crashRow(), caseId: "env-manager:skvm:windows:clean:held-out" }], lock())).toThrow("task")
    expect(() => lock({ methodEvidence: true })).toThrow()
    expect(() => lock({ heldOutAllowed: true })).toThrow()
  })

  test("CLI verifies frozen file digests and gate boundaries before writing a report", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "infrastructure-diagnostic-"))
    try {
      const rawText = `${JSON.stringify(crashRow())}\n`
      const summaryText = `${JSON.stringify({ claimBoundary: { developmentGatePassed: false, heldOutExecuted: false } })}\n`
      const gateText = `${JSON.stringify({ gate: { passed: false } })}\n`
      await writeFile(path.join(rootDir, "raw.jsonl"), rawText, "utf8")
      await writeFile(path.join(rootDir, "summary.json"), summaryText, "utf8")
      await writeFile(path.join(rootDir, "gate.json"), gateText, "utf8")
      const lockValue = lock({
        sourceExperiment: {
          id: "env-manager-contract-repair-v4-development",
          catalog: "executable-contract-repair-artifact/v4",
          system: "ir-contract-artifact-dev",
          raw: { path: "raw.jsonl", sha256: sha256(rawText) },
          summary: { path: "summary.json", sha256: sha256(summaryText) },
          gate: { path: "gate.json", sha256: sha256(gateText) },
        },
      })
      await writeFile(path.join(rootDir, "lock.json"), `${JSON.stringify(lockValue)}\n`, "utf8")

      const args = parseInfrastructureDiagnosticArgs([
        `--root-dir=${rootDir}`,
        "--lock=lock.json",
        "--out=report.json",
      ])
      const report = await runInfrastructureDiagnosticFile(args)
      expect(report.records).toHaveLength(1)
      expect(JSON.parse(await readFile(path.join(rootDir, "report.json"), "utf8"))).toEqual(report)

      await writeFile(path.join(rootDir, "raw.jsonl"), `${rawText} `, "utf8")
      await expect(runInfrastructureDiagnosticFile(args)).rejects.toThrow("raw digest mismatch")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
