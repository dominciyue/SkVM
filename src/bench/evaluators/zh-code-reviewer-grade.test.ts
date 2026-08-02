import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { deriveZhCodeReviewOracle } from "../../benchmarks/skill-ir/zh-code-reviewer-oracle.ts"
import { ZhCodeReviewerTaskSetSchema } from "../../benchmarks/skill-ir/zh-code-reviewer-contract.ts"
import {
  ZhCodeReviewerGradePayloadSchema,
  zhCodeReviewerGrade,
} from "./zh-code-reviewer-grade.ts"
import {
  customEvaluatorImplementations,
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "./index.ts"

const rootDir = process.cwd()

async function withSubmittedReview(
  mutate: (input: {
    report: Record<string, unknown>
    markdown: { value: string }
    sourcePath: string
    source: { value: string }
  }) => void,
): Promise<Map<string, Awaited<ReturnType<typeof zhCodeReviewerGrade.run>>>> {
  const tasks = ZhCodeReviewerTaskSetSchema.parse(JSON.parse(await readFile(
    path.join(rootDir, "benchmarks/skill-ir/pilots/zh-code-reviewer/development/tasks.json"),
    "utf8",
  )))
  const task = tasks.tasks[0]
  const sourcePath = task.eval[0]!.payload.paths.source
  const sourceText = task.fixtures[sourcePath]!
  const oracle = deriveZhCodeReviewOracle(sourcePath, sourceText)
  if (oracle.status !== "confirmed") throw new Error("test fixture oracle must be confirmed")

  const tempRoot = await mkdtemp(path.join(tmpdir(), "skvm-review-grade-"))
  const workDir = path.join(tempRoot, "workdir")
  try {
    await mkdir(path.dirname(path.join(workDir, sourcePath)), { recursive: true })
    await writeFile(path.join(workDir, sourcePath), sourceText, "utf8")
    await writeFile(path.join(workDir, "review-interface.json"), task.fixtures["review-interface.json"]!, "utf8")
    const reference = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(tempRoot, "initial-workdir-manifest.json"),
    })
    const findings = [...oracle.findings].reverse().map((entry) => ({
      category: entry.category,
      severity: entry.severity,
      path: entry.path,
      line: entry.line,
      symbol: entry.symbol,
      impact: `该问题会在对应路径产生可观察影响：${entry.ruleId}`,
      recommendation: "请改用边界明确的安全 API，并增加覆盖该分支的回归测试。",
    }))
    const report: Record<string, unknown> = {
      schemaVersion: "code-review/v1",
      reviewedFiles: [sourcePath],
      findings,
      highlights: ["函数职责较集中"],
      summary: "发现需要优先处理的问题，建议修复后补充测试。",
    }
    const markdown = {
      value: [
        "# 代码审查报告",
        "",
        ...findings.map((entry) => `- ${entry.severity} ${entry.path}:${entry.line} ${entry.symbol}：${entry.impact}`),
        "",
        "## 总结",
        "建议按影响顺序完成修复。",
      ].join("\n"),
    }
    const source = { value: sourceText }
    mutate({ report, markdown, sourcePath, source })
    if (source.value !== sourceText) await writeFile(path.join(workDir, sourcePath), source.value, "utf8")
    await writeFile(path.join(workDir, "code-review.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    await writeFile(path.join(workDir, "code-review.md"), `${markdown.value}\n`, "utf8")

    const runResult: RunResult = {
      text: "test",
      steps: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      durationMs: 0,
      llmDurationMs: 0,
      workDir,
      initialWorkdirManifest: reference,
      runStatus: "ok",
    }
    const results = new Map<string, Awaited<ReturnType<typeof zhCodeReviewerGrade.run>>>()
    for (const raw of task.eval) {
      const criterion = EvalCriterionSchema.parse(raw)
      if (criterion.method !== "custom") throw new Error("test criterion must be custom")
      results.set(raw.id, await zhCodeReviewerGrade.run({ criterion, runResult }))
    }
    return results
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

describe("zh-code-reviewer deterministic evaluator", () => {
  test("registers a source-bound evaluator identity", async () => {
    const actualDigest = createHash("sha256").update(await readFile(path.join(
      rootDir,
      "src/bench/evaluators/zh-code-reviewer-grade.ts",
    ))).digest("hex")
    expect(customEvaluatorSourcePaths.get("skill-ir-zh-code-reviewer"))
      .toBe("src/bench/evaluators/zh-code-reviewer-grade.ts")
    expect(customEvaluatorSourceDigests.get("skill-ir-zh-code-reviewer"))
      .toBe(actualDigest)
    expect(customEvaluatorImplementations.get("skill-ir-zh-code-reviewer")).toBe(zhCodeReviewerGrade)
  })

  test("accepts alternative ordering and free Chinese wording", async () => {
    const results = await withSubmittedReview(() => {})
    expect([...results.values()].every((entry) => entry.pass && !entry.infraError)).toBe(true)
  })

  test("accepts a non-empty structured summary allowed by the public interface", async () => {
    const results = await withSubmittedReview(({ report }) => {
      report.summary = {
        findingCount: (report.findings as unknown[]).length,
        critical: 2,
        assessment: "建议优先处理已确认问题。",
      }
    })
    expect([...results.values()].every((entry) => entry.pass && !entry.infraError)).toBe(true)
  })

  test("rejects a missing confirmed finding", async () => {
    const results = await withSubmittedReview(({ report }) => {
      ;(report.findings as unknown[]).pop()
    })
    expect(results.get("review-evidence-coverage")?.pass).toBe(false)
  })

  test("rejects severity weakening independently from wording", async () => {
    const results = await withSubmittedReview(({ report }) => {
      ;((report.findings as Array<Record<string, unknown>>)[0]!).severity = "minor"
    })
    expect(results.get("review-severity-calibration")?.pass).toBe(false)
  })

  test("rejects report contradictions and protected source mutation", async () => {
    const inconsistent = await withSubmittedReview(({ markdown }) => {
      markdown.value = "# 代码审查报告\n\n没有发现任何问题。"
    })
    expect(inconsistent.get("review-report-consistency")?.pass).toBe(false)

    const modified = await withSubmittedReview(({ source }) => {
      source.value += "// modified\n"
    })
    expect(modified.get("review-artifact-integrity")?.pass).toBe(false)
  })

  test("rejects unsafe paths and private payload canaries", () => {
    const base = {
      schemaVersion: "skill-ir-zh-code-reviewer-eval/v1",
      check: "artifact-integrity",
      paths: {
        source: "src/demo.ts",
        interface: "review-interface.json",
        jsonReport: "code-review.json",
        markdownReport: "code-review.md",
      },
      protectedSha256: { source: "0".repeat(64), interface: "1".repeat(64) },
    }
    expect(ZhCodeReviewerGradePayloadSchema.safeParse(base).success).toBe(true)
    expect(ZhCodeReviewerGradePayloadSchema.safeParse({ ...base, gold: "TEST_ONLY" }).success).toBe(false)
    expect(ZhCodeReviewerGradePayloadSchema.safeParse({
      ...base,
      paths: { ...base.paths, jsonReport: "../outside.json" },
    }).success).toBe(false)
  })
})
