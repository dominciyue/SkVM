import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { SkillIRBenchmarkTask } from "./real-agent.ts"
import {
  scoreRawRunRowsBySkill,
  taskIndexKey,
  type RawAgentRunRow,
} from "./scoring.ts"

const taskPath = path.join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/law-to-markdown/tasks.json",
)
const temporaryDirectories = new Set<string>()

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
  temporaryDirectories.clear()
})

async function loadTask(id: string): Promise<SkillIRBenchmarkTask> {
  const taskSet = JSON.parse(await readFile(taskPath, "utf8")) as {
    tasks: SkillIRBenchmarkTask[]
  }
  const task = taskSet.tasks.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Missing law-to-markdown task ${id}`)
  return task
}

async function makeWorkDir(task: SkillIRBenchmarkTask): Promise<string> {
  const workDir = await mkdtemp(path.join(tmpdir(), "law-to-markdown-pilot-"))
  temporaryDirectories.add(workDir)
  for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
    const destination = path.join(workDir, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, "utf8")
  }
  return workDir
}

function rawRow(task: SkillIRBenchmarkTask, workDir: string): RawAgentRunRow {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${task.id}`,
    system: "original",
    taskPath,
    workDir,
    exitCode: 0,
    runStatus: "ok",
    durationMs: 10,
    stdout: "Final output:\nConversion complete.",
    stderr: "",
    successSource: "execution-only",
  }
}

describe("law-to-markdown deterministic pilot scoring", () => {
  test("scores a complete legal conversion and keeps evaluator gold out of the compact row", async () => {
    const task = await loadTask("law-to-markdown-statute-dev-001")
    const workDir = await makeWorkDir(task)
    const outputDir = path.join(workDir, "markdown", "document")
    await mkdir(outputDir, { recursive: true })
    await writeFile(path.join(outputDir, "document+最终成果.md"), [
      "# 中华人民共和国示例数据法",
      "### 第一章 总则",
      "##### 第一条 为了规范数据活动，制定本法。",
      "##### 第二条 数据处理应当遵循合法、正当、必要原则。",
      "（一）公开透明；",
      "（二）安全可控。",
      "",
    ].join("\n"), "utf8")
    await writeFile(path.join(outputDir, "document+审核报告.md"), [
      "输入文件：document.txt",
      "最终审核结论：通过",
      "是否可交付：是",
      "",
    ].join("\n"), "utf8")

    const rows = await scoreRawRunRowsBySkill(
      [rawRow(task, workDir)],
      new Map([[taskIndexKey("law-to-markdown", task.id), task]]),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      success: true,
      evaluatorScore: 1,
      successSource: "deterministic-evaluator",
      failedCriteria: [],
    })
    const serialized = JSON.stringify(rows[0])
    expect(serialized).not.toContain('"payload"')
    expect(serialized).not.toContain("中华人民共和国示例数据法\\n第一章")
  })

  test("a non-law final deliverable fails document policy without becoming infrastructure", async () => {
    const task = await loadTask("law-to-markdown-standard-dev-002")
    const workDir = await makeWorkDir(task)
    const outputDir = path.join(workDir, "markdown", "document")
    await mkdir(outputDir, { recursive: true })
    await writeFile(path.join(outputDir, "document+审核报告.md"), [
      "输入文件：document.txt",
      "最终审核结论：拒绝（非法律文档）",
      "是否可交付：否",
      "",
    ].join("\n"), "utf8")
    await writeFile(path.join(outputDir, "document+最终成果.md"), "unexpected\n", "utf8")

    const [row] = await scoreRawRunRowsBySkill(
      [rawRow(task, workDir)],
      new Map([[taskIndexKey("law-to-markdown", task.id), task]]),
    )

    expect(row).toMatchObject({
      success: false,
      failureStage: "evaluation",
    })
    expect(row?.failureType).not.toBe("infrastructure")
    expect(row?.failedCriteria).toContain("law-document-policy")
  })
})
