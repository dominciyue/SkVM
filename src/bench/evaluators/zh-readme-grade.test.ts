import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { ZhReadmeTaskSetSchema, type ZhReadmeTaskSet } from "../../benchmarks/skill-ir/zh-readme-contract.ts"
import { ZhReadmeGradePayloadSchema, zhReadmeGrade } from "./zh-readme-grade.ts"
import {
  customEvaluatorImplementations,
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "./index.ts"

const rootDir = process.cwd()

async function runReadme(
  readme: string,
  mutate?: (input: { workDir: string; task: ZhReadmeTaskSet["tasks"][number] }) => Promise<void>,
) {
  const taskSet = ZhReadmeTaskSetSchema.parse(JSON.parse(await readFile(path.join(
    rootDir,
    "benchmarks/skill-ir/pilots/zh-readme/development/tasks.json",
  ), "utf8")))
  const task = taskSet.tasks[0]
  const root = await mkdtemp(path.join(tmpdir(), "skvm-zh-readme-grade-"))
  const workDir = path.join(root, "workdir")
  try {
    for (const [relativePath, text] of Object.entries(task.fixtures)) {
      const output = path.join(workDir, ...relativePath.split("/"))
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, text, "utf8")
    }
    const reference = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(root, "initial-workdir-manifest.json"),
    })
    await writeFile(path.join(workDir, "README.zh-CN.md"), readme, "utf8")
    if (mutate) await mutate({ workDir, task })
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
    const results = new Map<string, Awaited<ReturnType<typeof zhReadmeGrade.run>>>()
    for (const raw of task.eval) {
      const criterion = EvalCriterionSchema.parse(raw)
      if (criterion.method !== "custom") throw new Error("test criterion must be custom")
      results.set(raw.id, await zhReadmeGrade.run({ criterion, runResult }))
    }
    return results
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const validReadme = `# Echo Lab 中文指南

Echo Lab 面向需要整理 JSON Lines 事件的开发者，把本地记录转换成清晰的终端摘要。

## 开始安装

\`\`\`bash
npm install
\`\`\`

## 马上使用

\`\`\`bash
echo-lab --input events.jsonl --level warn
\`\`\`

入口代码位于 \`src/cli.js\`。项目文档见 [正式文档](https://example.org/echo-lab/docs)，源码位于
[GitHub](https://github.com/example/echo-lab)。

## 参与开发

\`\`\`bash
npm test
npm run lint
\`\`\`

## 许可证

本项目采用 MIT 许可证。
`

describe("zh-readme deterministic evaluator", () => {
  test("registers a source-bound evaluator identity", async () => {
    const actualDigest = createHash("sha256").update(await readFile(path.join(
      rootDir,
      "src/bench/evaluators/zh-readme-grade.ts",
    ))).digest("hex")
    expect(customEvaluatorSourcePaths.get("skill-ir-zh-readme"))
      .toBe("src/bench/evaluators/zh-readme-grade.ts")
    expect(customEvaluatorSourceDigests.get("skill-ir-zh-readme")).toBe(actualDigest)
    expect(customEvaluatorImplementations.get("skill-ir-zh-readme")).toBe(zhReadmeGrade)
  })

  test("accepts alternative Chinese headings, ordering, and wording", async () => {
    const results = await runReadme(validReadme)
    expect([...results.values()].map((entry) => entry.pass)).toEqual([true, true, true, true, true])
  })

  test("rejects fabricated commands, links, and repository paths", async () => {
    const readme = validReadme
      .replace("npm run lint", "npm run deploy")
      .replace("https://example.org/echo-lab/docs", "https://fake.example/download")
      .replace("src/cli.js", "src/missing.js")
    const results = await runReadme(readme)
    expect(results.get("readme-artifact-integrity")?.pass).toBe(true)
    expect(results.get("readme-command-fidelity")?.pass).toBe(false)
    expect(results.get("readme-reference-fidelity")?.pass).toBe(false)
  })

  test("rejects protected mutation and unexpected files", async () => {
    const results = await runReadme(validReadme, async ({ workDir }) => {
      await writeFile(path.join(workDir, "package.json"), "{}\n", "utf8")
      await writeFile(path.join(workDir, "notes.tmp"), "unexpected\n", "utf8")
    })
    expect(results.get("readme-artifact-integrity")?.pass).toBe(false)
  })

  test("rejects unsafe paths and private payload canaries", () => {
    const base = {
      schemaVersion: "skill-ir-zh-readme-eval/v1",
      check: "artifact-integrity",
      paths: { interface: "readme-interface.json", readme: "README.zh-CN.md" },
      protectedSha256: { "package.json": "0".repeat(64), "readme-interface.json": "1".repeat(64) },
    }
    expect(ZhReadmeGradePayloadSchema.safeParse(base).success).toBe(true)
    expect(ZhReadmeGradePayloadSchema.safeParse({ ...base, gold: "TEST_ONLY" }).success).toBe(false)
    expect(ZhReadmeGradePayloadSchema.safeParse({
      ...base,
      protectedSha256: { "../package.json": "0".repeat(64), "readme-interface.json": "1".repeat(64) },
    }).success).toBe(false)
  })
})
