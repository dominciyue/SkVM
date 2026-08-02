import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { ZhReadmeTaskSetSchema, type ZhReadmeTaskSet } from "../../benchmarks/skill-ir/zh-readme-contract.ts"
import { zhReadmeGradeV2 } from "./zh-readme-grade-v2.ts"

const rootDir = process.cwd()

async function grade(taskIndex: 0 | 1, readme: string) {
  const taskSet = ZhReadmeTaskSetSchema.parse(JSON.parse(await readFile(path.join(
    rootDir, "benchmarks/skill-ir/pilots/zh-readme/development/tasks.json",
  ), "utf8")))
  const task: ZhReadmeTaskSet["tasks"][number] = taskSet.tasks[taskIndex]
  const root = await mkdtemp(path.join(tmpdir(), "skvm-zh-readme-v2-"))
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
    const runResult: RunResult = {
      text: "test", steps: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0, durationMs: 0, llmDurationMs: 0, workDir, initialWorkdirManifest: reference, runStatus: "ok",
    }
    const results = new Map<string, Awaited<ReturnType<typeof zhReadmeGradeV2.run>>>()
    for (const raw of task.eval) {
      const criterion = EvalCriterionSchema.parse(raw)
      if (criterion.method !== "custom") throw new Error("test criterion must be custom")
      results.set(raw.id, await zhReadmeGradeV2.run({ criterion, runResult }))
    }
    return results
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const conservativeNode = `# Echo Lab 中文说明

Echo Lab 用于整理 JSON Lines 事件，并生成清晰的终端摘要。

## 安装

仓库没有声明可验证的安装命令，安装方式待补充。

## 快速使用

\`\`\`bash
echo-lab --input <JSONL 文件> --level warn
npm start
\`\`\`

入口位于 [src/cli.js](src/cli.js)，文档见 [项目文档](https://example.org/echo-lab/docs)，仓库见
[GitHub](https://github.com/example/echo-lab)。

## 开发测试

\`\`\`bash
npm test
npm run lint
\`\`\`

## 许可证

本项目采用 MIT License。
`

const equivalentPython = `# note-index 中文说明

note-index 从本地 Markdown 笔记构建可搜索索引，适合离线整理个人资料。

## 安装

\`\`\`bash
python -m pip install .
\`\`\`

## 快速使用

\`\`\`bash
note-index scan <Markdown 笔记目录>
\`\`\`

入口见 [src/note_index/cli.py](src/note_index/cli.py)，用法见 [docs/USAGE.md](docs/USAGE.md)，项目主页为
[Homepage](https://example.org/note-index)，仓库为 [Repository](https://github.com/example/note-index)。

## 开发测试

\`\`\`bash
python -m pytest
\`\`\`

## 许可证

本项目采用 Apache License 2.0。
`

describe("zh-readme v2 deterministic evaluator", () => {
  test("accepts conservative missing-evidence handling and bounded command aliases", async () => {
    const results = await grade(0, conservativeNode)
    expect([...results.values()].map((entry) => entry.pass)).toEqual([true, true, true, true, true])
  })

  test("accepts documented placeholders and SPDX display-equivalent license wording", async () => {
    const results = await grade(1, equivalentPython)
    expect([...results.values()].map((entry) => entry.pass)).toEqual([true, true, true, true, true])
  })

  test("rejects unsupported installation commands", async () => {
    const results = await grade(0, conservativeNode.replace(
      "仓库没有声明可验证的安装命令，安装方式待补充。",
      "\`\`\`bash\nnpm install -g .\n\`\`\`",
    ))
    expect(results.get("readme-command-fidelity")?.pass).toBe(false)
  })

  test("rejects local Markdown links that resolve only inside the skill package", async () => {
    const results = await grade(0, conservativeNode.replace(
      "本项目采用 MIT License。",
      "本项目采用 MIT License，完整文本见 [上游许可证](LICENSE.upstream)。",
    ))
    expect(results.get("readme-reference-fidelity")?.pass).toBe(false)
  })
})
