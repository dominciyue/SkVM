import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  auditNamespacedResourceSemanticFailures,
  type NamespacedResourceSemanticFailureAuditInput,
} from "./namespaced-resource-semantic-failure-audit.ts"

async function fixture(): Promise<NamespacedResourceSemanticFailureAuditInput> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "skvm-semantic-audit-"))
  const sourceDir = path.join(rootDir, "benchmarks", "skill-ir", "pilots", "demo", "source")
  const runDir = path.join(rootDir, "results", "run", "demo", "optimized", "run-1")
  await mkdir(path.join(runDir, "workdir", ".skvm", "skill-resources", "demo-abcdef123456"), { recursive: true })
  await mkdir(path.join(runDir, "skill"), { recursive: true })
  await mkdir(sourceDir, { recursive: true })
  await writeFile(path.join(runDir, "workdir", "result.json"), "{}\n", "utf8")
  await writeFile(path.join(sourceDir, "SKILL.md"), "Use scripts/check.py\n", "utf8")
  await writeFile(path.join(runDir, "skill", "SKILL.md"), "Use .skvm/skill-resources/demo-abcdef123456/scripts/check.py\n", "utf8")
  await writeFile(path.join(runDir, "workdir", ".skvm", "skill-resources", "demo-abcdef123456", "scripts.check"), "ok\n", "utf8")
  await writeFile(path.join(runDir, "workdir", ".skvm", "skill-resource-manifest.json"), JSON.stringify({
    schemaVersion: "skill-ir-namespaced-resource-manifest/v1",
    skillId: "demo",
    sourceDigest: "a".repeat(64),
    closureDigest: "b".repeat(64),
    namespaceRoot: ".skvm/skill-resources/demo-abcdef123456",
    resources: [{ sourcePath: "scripts.check", targetPath: ".skvm/skill-resources/demo-abcdef123456/scripts.check", sha256: createHash("sha256").update("ok\n").digest("hex"), size: 3 }],
  }), "utf8")
  return {
    rootDir,
    corpus: [{
      skillId: "demo",
      sourcePath: "benchmarks/skill-ir/pilots/demo/source/SKILL.md",
      benchmarkAuditStatus: "failed",
      benchmarkAuditIssues: ["EXACT_CONTRACT_NOT_PUBLIC"],
    }],
    rawRows: [{
      caseId: "demo:skvm:windows:clean:demo-dev-001",
      system: "optimized",
      task: "demo-dev-001",
      runIndex: 1,
      runStatus: "ok",
      workDir: "results/run/demo/optimized/run-1/workdir",
      skillPath: "results/run/demo/optimized/run-1/skill/SKILL.md",
      taskPath: "results/run/demo/optimized/run-1/task.json",
    }],
    scoredRows: [{
      caseId: "demo:skvm:windows:clean:demo-dev-001",
      skill: "demo",
      agent: "skvm",
      environment: "windows",
      context: "clean",
      system: "optimized",
      task: "demo-dev-001",
      taskSplit: "development",
      runIndex: 1,
      runStatus: "ok",
      ruleViolations: 0,
      stepCoverage: 1,
      latencyMs: 1,
      successSource: "deterministic-evaluator",
      success: false,
      failedCriteria: ["demo-semantic"],
      evaluationSummary: [{ id: "demo-semantic", pass: false, score: 0, method: "custom", details: "failure" }],
    }],
    taskOutputs: [{ taskId: "demo-dev-001", outputPaths: ["result.json"] }],
  }
}

describe("namespaced resource semantic failure audit", () => {
  test("separates active namespace, produced outputs, and contract-sensitive failure", async () => {
    const input = await fixture()
    const report = await auditNamespacedResourceSemanticFailures(input)
    expect(report.counts.namespaceActiveRows).toBe(1)
    expect(report.counts.optimizedRowsWithProducedOutputs).toBe(1)
    expect(report.counts.contractSensitiveRows).toBe(1)
    expect(report.attribution.namespaceMechanism).toBe("supported")
    expect(report.attribution.modelExecution).toBe("supported")
    expect(report.attribution.benchmarkContract).toBe("supported")
    expect(report.findings.some((finding) => finding.code === "SOURCE_REWRITE_ONLY_VIEW")).toBe(true)
    expect(JSON.stringify(report)).not.toContain("details")
  })
})
