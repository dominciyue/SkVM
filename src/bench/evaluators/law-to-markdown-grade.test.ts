import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import { customEvaluators } from "../../framework/types.ts"
import "./index.ts"
import { lawToMarkdownGrade } from "./law-to-markdown-grade.ts"

const temporaryDirectories = new Set<string>()
const schemaVersion = "skill-ir-law-to-markdown-eval/v1"

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
  temporaryDirectories.clear()
})

async function makeWorkDir(prefix = "law-to-markdown-grade-"): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.add(directory)
  return directory
}

function runResult(workDir: string): RunResult {
  return {
    text: "Conversion complete.",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    runStatus: "ok",
  }
}

async function grade(payload: unknown, workDir: string) {
  return lawToMarkdownGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-law-to-markdown",
      payload,
    },
    runResult: runResult(workDir),
  })
}

describe("skill-ir-law-to-markdown registration and path safety", () => {
  test("is registered by the evaluator barrel", () => {
    expect(customEvaluators.get("skill-ir-law-to-markdown")).toBe(lawToMarkdownGrade)
  })

  test("invalid payloads and unsafe paths are infrastructure failures", async () => {
    const workDir = await makeWorkDir()
    const invalid = await grade({ schemaVersion: "wrong", check: "protected-file", path: "input.txt", content: "x" }, workDir)
    expect(invalid).toMatchObject({ pass: false, score: 0 })
    expect(invalid.infraError).toBeDefined()

    for (const unsafePath of ["../input.txt", "/outside.txt", "C:\\outside.txt", "nested/../input.txt"]) {
      const result = await grade({ schemaVersion, check: "protected-file", path: unsafePath, content: "x" }, workDir)
      expect(result).toMatchObject({ pass: false, score: 0 })
      expect(result.infraError).toBeDefined()
      expect(result.details).not.toContain(unsafePath)
    }
  })

  test("a declared symlink escaping the workdir is infrastructure", async () => {
    const workDir = await makeWorkDir()
    const outside = await makeWorkDir("law-grade-outside-")
    const outsideFile = path.join(outside, "input.txt")
    await writeFile(outsideFile, "outside", "utf8")
    try {
      await symlink(outsideFile, path.join(workDir, "input.txt"), "file")
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) return
      throw error
    }

    const result = await grade({ schemaVersion, check: "protected-file", path: "input.txt", content: "outside" }, workDir)
    expect(result.infraError).toBeDefined()
  })
})

describe("law document scoring", () => {
  const input = "示例法\n第一章 总则\n第一条 为了规范示例活动，制定本法。\n（一）公开；（二）安全。\n"
  const deliverable = "# 示例法\n### 第一章 总则\n##### 第一条 为了规范示例活动，制定本法。\n（一）公开；\n（二）安全。\n"

  test("passes protected input, artifact policy, fidelity, structure, and approved review", async () => {
    const workDir = await makeWorkDir()
    await mkdir(path.join(workDir, "markdown", "input"), { recursive: true })
    await writeFile(path.join(workDir, "input.txt"), input, "utf8")
    await writeFile(path.join(workDir, "markdown/input/input+最终成果.md"), deliverable, "utf8")
    await writeFile(path.join(workDir, "markdown/input/input+审核报告.md"), "最终审核结论：通过\n是否可交付：是\n", "utf8")

    const checks = [
      { check: "protected-file", path: "input.txt", content: input },
      { check: "artifact-policy", required: ["markdown/input/input+审核报告.md", "markdown/input/input+最终成果.md"], forbidden: ["markdown/input/input.stage1.md"] },
      { check: "content-fidelity", inputPath: "input.txt", outputPath: "markdown/input/input+最终成果.md" },
      { check: "heading-structure", path: "markdown/input/input+最终成果.md", headings: [{ level: 1, text: "示例法" }, { level: 3, text: "第一章 总则" }, { level: 5, text: "第一条 为了规范示例活动，制定本法。" }] },
      { check: "line-layout", path: "markdown/input/input+最终成果.md", requiredStandaloneLines: ["（一）公开；", "（二）安全。"] },
      { check: "review-outcome", path: "markdown/input/input+审核报告.md", outcome: "approved" },
    ]

    for (const check of checks) {
      expect(await grade({ schemaVersion, ...check }, workDir)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("detects changed input, content loss, and wrong heading level semantically", async () => {
    const workDir = await makeWorkDir()
    await mkdir(path.join(workDir, "markdown", "input"), { recursive: true })
    await writeFile(path.join(workDir, "input.txt"), `${input}被修改`, "utf8")
    await writeFile(path.join(workDir, "markdown/input/input+最终成果.md"), "# 示例法\n## 第一章 总则\n", "utf8")

    for (const payload of [
      { schemaVersion, check: "protected-file", path: "input.txt", content: input },
      { schemaVersion, check: "content-fidelity", inputPath: "input.txt", outputPath: "markdown/input/input+最终成果.md" },
      { schemaVersion, check: "heading-structure", path: "markdown/input/input+最终成果.md", headings: [{ level: 3, text: "第一章 总则" }] },
    ]) {
      const result = await grade(payload, workDir)
      expect(result).toMatchObject({ pass: false, score: 0 })
      expect(result.infraError).toBeUndefined()
    }
  })
})

describe("non-law rejection scoring", () => {
  test("requires rejection report and forbids a final deliverable", async () => {
    const workDir = await makeWorkDir()
    await mkdir(path.join(workDir, "markdown", "standard"), { recursive: true })
    await writeFile(path.join(workDir, "standard.txt"), "GB/T 0000-2026 测试规范\n1 范围\n", "utf8")
    await writeFile(path.join(workDir, "markdown/standard/standard+审核报告.md"), "最终审核结论：拒绝（非法律文档）\n是否可交付：否\n", "utf8")

    expect(await grade({
      schemaVersion,
      check: "artifact-policy",
      required: ["markdown/standard/standard+审核报告.md"],
      forbidden: ["markdown/standard/standard+最终成果.md"],
    }, workDir)).toMatchObject({ pass: true, score: 1 })
    expect(await grade({
      schemaVersion,
      check: "review-outcome",
      path: "markdown/standard/standard+审核报告.md",
      outcome: "rejected-non-law",
    }, workDir)).toMatchObject({ pass: true, score: 1 })
    expect(await grade({
      schemaVersion,
      check: "report-source",
      path: "markdown/standard/standard+审核报告.md",
      sourceName: "standard.txt",
    }, workDir)).toMatchObject({ pass: false, score: 0 })

    await writeFile(path.join(workDir, "markdown/standard/standard+最终成果.md"), "wrong", "utf8")
    const result = await grade({
      schemaVersion,
      check: "artifact-policy",
      required: ["markdown/standard/standard+审核报告.md"],
      forbidden: ["markdown/standard/standard+最终成果.md"],
    }, workDir)
    expect(result).toMatchObject({ pass: false, score: 0 })
    expect(result.infraError).toBeUndefined()
  })
})
