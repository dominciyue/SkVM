import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { lawToMarkdownGradeV2 } from "./law-to-markdown-grade-v2.ts"

const roots: string[] = []
const schemaVersion = "skill-ir-law-to-markdown-eval/v2"
const contract = `${JSON.stringify({
  schemaVersion: "skill-ir-law-to-markdown-public-contract/v2",
  contractId: "law-to-markdown-public-contract-v2",
  protectedInputs: ["document.txt", "law-contract.json"],
  outputs: {
    review: "markdown/document/document+审核报告.md",
    deliverable: "markdown/document/document+最终成果.md",
  },
  exactOutputSet: true,
  reviewEvidence: {
    openingMarker: "```json law-review-evidence",
    closingMarker: "```",
    blockCount: 1,
    fields: ["inputPath", "documentClass", "deliverable"],
    documentClasses: ["law", "non-law"],
  },
}, null, 2)}\n`

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function makeRun(document: string): Promise<{ root: string; workDir: string; result: RunResult }> {
  const root = await mkdtemp(path.join(tmpdir(), "law-v2-grade-"))
  roots.push(root)
  const workDir = path.join(root, "workdir")
  await mkdir(workDir)
  await writeFile(path.join(workDir, "document.txt"), document, "utf8")
  await writeFile(path.join(workDir, "law-contract.json"), contract, "utf8")
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  })
  return {
    root,
    workDir,
    result: {
      text: "done",
      steps: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      durationMs: 0,
      llmDurationMs: 0,
      workDir,
      runStatus: "ok",
      usageAvailable: true,
      initialWorkdirManifest,
    },
  }
}

async function grade(check: string, result: RunResult) {
  return lawToMarkdownGradeV2.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-law-to-markdown-v2",
      payload: { schemaVersion, check },
    },
    runResult: result,
  })
}

async function writeOutputs(workDir: string, deliverable: string | undefined, evidence: object, prose: string) {
  const directory = path.join(workDir, "markdown", "document")
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, "document+审核报告.md"),
    `${prose}\n\n\`\`\`json law-review-evidence\n${JSON.stringify(evidence)}\n\`\`\`\n`,
    "utf8",
  )
  if (deliverable !== undefined) {
    await writeFile(path.join(directory, "document+最终成果.md"), deliverable, "utf8")
  }
}

describe("law-to-markdown v2 public semantic evaluator", () => {
  test("registers a separate evaluator identity", () => {
    expect(customEvaluators.get("skill-ir-law-to-markdown-v2")).toBe(lawToMarkdownGradeV2)
  })

  test("accepts alternative review prose when observable law evidence and output are valid", async () => {
    const source = "示例治理法\n第一章 总则\n第一条 为了治理示例事项，制定本法。\n（一）公开；（二）公平。\n"
    const run = await makeRun(source)
    await writeOutputs(
      run.workDir,
      "# 示例治理法\n### 第一章 总则\n##### 第一条 为了治理示例事项，制定本法。\n（一）公开；\n（二）公平。\n",
      { inputPath: "document.txt", documentClass: "law", deliverable: true },
      "检查完成，这份文档可以交付。",
    )

    expect(await grade("classification", run.result)).toMatchObject({ pass: true, score: 1 })
    for (const check of ["input-and-delta", "content-fidelity", "structure", "review-evidence"]) {
      expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("accepts a clear non-law rejection without a final deliverable", async () => {
    const run = await makeRun("GB/T 9000—2026 示例规范\n1 范围\n示例内容。\n")
    await writeOutputs(
      run.workDir,
      undefined,
      { inputPath: "document.txt", documentClass: "non-law", deliverable: false },
      "该输入属于标准，不生成最终转换稿。",
    )
    for (const check of ["input-and-delta", "classification", "content-fidelity", "structure", "review-evidence"]) {
      expect(await grade(check, run.result)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("rejects wrong evidence, wrong hierarchy, content loss, protected mutation, and extra output", async () => {
    const source = "示例条例\n第一章 总则\n第一条 示例正文。\n（一）甲；（二）乙。\n"
    const run = await makeRun(source)
    await writeOutputs(
      run.workDir,
      "# 示例条例\n## 第一章 总则\n##### 第一条 内容丢失。\n（一）甲；（二）乙。\n",
      { inputPath: "document.txt", documentClass: "non-law", deliverable: false },
      "任意正文",
    )
    await writeFile(path.join(run.workDir, "document.txt"), `${source}changed`, "utf8")
    await writeFile(path.join(run.workDir, "debug.log"), "extra", "utf8")

    expect(await grade("classification", run.result)).toMatchObject({ pass: true, score: 1 })
    for (const check of ["input-and-delta", "content-fidelity", "structure", "review-evidence"]) {
      const result = await grade(check, run.result)
      expect(result.pass).toBe(false)
      expect(result.infraError).toBeUndefined()
    }
  })
})
