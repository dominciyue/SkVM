import { createHash } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import {
  buildBidsDevelopmentTaskSet,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
} from "../../benchmarks/skill-ir/bids-contract.ts"
import { customEvaluatorSourceDigests } from "./index.ts"
import { bidsGrade } from "./bids-grade.ts"

const temporaryDirectories = new Set<string>()

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function runResult(workDir: string, initialWorkdirManifest: InitialWorkdirManifestReference): RunResult {
  return {
    text: "complete",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest,
    runStatus: "ok",
  }
}

async function fixture(taskIndex = 0) {
  const task = buildBidsDevelopmentTaskSet().tasks[taskIndex]!
  const workDir = await mkdtemp(path.join(tmpdir(), "skvm-bids-grade-"))
  temporaryDirectories.add(workDir)
  for (const [name, contents] of Object.entries(task.fixtures)) {
    await writeFile(path.join(workDir, name), contents, "utf8")
  }
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: `${workDir}-initial-workdir-manifest.json`,
  })
  const report = await deriveBidsAuditOracle(
    JSON.parse(task.fixtures["dataset-manifest.json"]!),
    await loadBidsSourceRules(process.cwd()),
  )
  await writeFile(path.join(workDir, "bids-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return { task, workDir, initialWorkdirManifest, report }
}

async function grade(
  check: "input-integrity" | "artifact-contract" | "semantic-audit",
  value: Awaited<ReturnType<typeof fixture>>,
) {
  const payload = value.task.eval.find((criterion) => criterion.payload.check === check)!.payload
  return bidsGrade.run({
    criterion: { method: "custom", evaluatorId: "skill-ir-bids", payload },
    runResult: runResult(value.workDir, value.initialWorkdirManifest),
  })
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
})

describe("BIDS deterministic evaluator", () => {
  test("registers one evaluator and binds its current implementation digest", async () => {
    expect(customEvaluators.get("skill-ir-bids")).toBe(bidsGrade)
    expect(customEvaluatorSourceDigests.get("skill-ir-bids")).toBe(sha256(await readFile(
      path.join(process.cwd(), "src/bench/evaluators/bids-grade.ts"),
      "utf8",
    )))
  })

  test("passes all criteria for both source-derived canonical reports", async () => {
    for (const taskIndex of [0, 1]) {
      const value = await fixture(taskIndex)
      for (const check of ["input-integrity", "artifact-contract", "semantic-audit"] as const) {
        expect(await grade(check, value)).toMatchObject({ pass: true, score: 1 })
      }
    }
  })

  test("accepts set-like issue and evidence ordering but rejects semantic omission", async () => {
    const alternative = await fixture(1)
    alternative.report.issues.reverse()
    alternative.report.issues.forEach((issue) => issue.evidencePaths.reverse())
    await writeFile(path.join(alternative.workDir, "bids-audit.json"), `${JSON.stringify(alternative.report)}\n`)
    expect(await grade("semantic-audit", alternative)).toMatchObject({ pass: true, score: 1 })

    const omitted = await fixture(1)
    omitted.report.issues.pop()
    omitted.report.summary.issueCount -= 1
    omitted.report.summary.errorCount -= 1
    await writeFile(path.join(omitted.workDir, "bids-audit.json"), `${JSON.stringify(omitted.report)}\n`)
    expect(await grade("semantic-audit", omitted)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects protected-input mutation and any output beyond the public set", async () => {
    const mutated = await fixture()
    await writeFile(path.join(mutated.workDir, "dataset-manifest.json"), "{}\n")
    expect(await grade("input-integrity", mutated)).toMatchObject({ pass: false, score: 0 })

    const extra = await fixture()
    await writeFile(path.join(extra.workDir, "debug.txt"), "unexpected\n")
    expect(await grade("artifact-contract", extra)).toMatchObject({ pass: false, score: 0 })
  })
})
