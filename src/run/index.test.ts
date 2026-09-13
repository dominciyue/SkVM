import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import type { AgentAdapter } from "../core/types.ts"
import { readInitialWorkdirManifest } from "../core/workdir-manifest.ts"
import { executeRun, loadRunSkill, loadRunTask, materializeNaturalRunTask } from "./index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("executeRun captures source inputs before namespaced skill deployment", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-execute-manifest-"))
  roots.push(root)
  const taskDir = join(root, "task")
  const skillDir = join(root, "skill")
  const workDir = join(root, "run", "workdir")
  const manifestPath = join(root, "run", "initial-workdir-manifest.json")
  await mkdir(taskDir, { recursive: true })
  await mkdir(join(skillDir, "references"), { recursive: true })
  await writeFile(join(taskDir, "task.json"), `${JSON.stringify({
    id: "manifest-task",
    prompt: "Do the task.",
    fixtures: { "study.json": "{\"studyId\":\"s1\"}\n" },
    eval: [],
  })}\n`, "utf8")
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: manifest\ndescription: test\n---\nUse references.\n", "utf8")
  await writeFile(join(skillDir, "references", "guide.md"), "guide\n", "utf8")

  let setupObservedManifest = false
  const adapter: AgentAdapter = {
    name: "bare-agent",
    async setup() {
      const content = await readFile(manifestPath, "utf8")
      setupObservedManifest = content.includes("study.json") && !content.includes("references/guide.md")
    },
    async run() {
      return {
        text: "done",
        steps: [],
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
        durationMs: 1,
        llmDurationMs: 1,
        workDir,
        runStatus: "ok",
      }
    },
    async teardown() {},
  }

  const result = await executeRun({
    task: await loadRunTask(join(taskDir, "task.json")),
    skill: await loadRunSkill(join(skillDir, "SKILL.md")),
    adapter,
    adapterConfig: { model: "test/model", maxSteps: 1, timeoutMs: 1000, mode: "managed" },
    workDir,
    initialWorkdirManifestPath: manifestPath,
  })

  expect(setupObservedManifest).toBe(true)
  expect(result.initialWorkdirManifest).toBeDefined()
  const manifest = await readInitialWorkdirManifest({
    workDir,
    reference: result.initialWorkdirManifest!,
  })
  expect(manifest.entries.map((entry) => entry.path)).toEqual(["study.json"])
  expect(await Bun.file(join(workDir, ".skvm", "skills", "skill", "references", "guide.md")).text()).toBe("guide\n")
})

test("executeRun preserves natural-task bytes before the source agent changes them", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-execute-input-snapshot-"))
  roots.push(root)
  const skillDir = join(root, "skill")
  const workDir = join(root, "ordinary workdir")
  const sessionDir = join(root, "session")
  const initialManifestPath = join(sessionDir, "initial-workdir-manifest.json")
  const inputSnapshotPath = join(sessionDir, "source-inputs", "manifest.json")
  await mkdir(skillDir, { recursive: true })
  await mkdir(workDir, { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: input-snapshot\ndescription: test\n---\nInspect the task file.\n", "utf8")
  await writeFile(join(workDir, "document.txt"), "source bytes\n", "utf8")
  const task = await materializeNaturalRunTask({
    prompt: "Read document.txt and create result.txt.",
    taskPath: join(sessionDir, "source-task", "task.json"),
  })

  let sourceBytesVisibleBeforeRun = false
  const adapter: AgentAdapter = {
    name: "bare-agent",
    async setup() {
      if (!await Bun.file(inputSnapshotPath).exists()) return
      const snapshot = JSON.parse(await Bun.file(inputSnapshotPath).text())
      const source = snapshot.entries.find((entry: { path: string }) => entry.path === "document.txt")
      if (source?.status !== "captured") return
      sourceBytesVisibleBeforeRun = await Bun.file(join(inputSnapshotPath, "..", source.contentPath)).text() === "source bytes\n"
    },
    async run() {
      await writeFile(join(workDir, "document.txt"), "source changed by agent\n", "utf8")
      await writeFile(join(workDir, "result.txt"), "generated\n", "utf8")
      return {
        text: "done",
        steps: [],
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
        durationMs: 1,
        llmDurationMs: 1,
        workDir,
        runStatus: "ok",
      }
    },
    async teardown() {},
  }

  const result = await executeRun({
    task,
    skill: await loadRunSkill(join(skillDir, "SKILL.md")),
    adapter,
    adapterConfig: { model: "test/model", maxSteps: 1, timeoutMs: 1000, mode: "managed" },
    workDir,
    initialWorkdirManifestPath: initialManifestPath,
    preRunInputSnapshotPath: inputSnapshotPath,
  })

  expect(sourceBytesVisibleBeforeRun).toBe(true)
  expect(await Bun.file(join(workDir, "document.txt")).text()).toBe("source changed by agent\n")
  expect(await Bun.file(join(workDir, "result.txt")).text()).toBe("generated\n")
  expect(result.initialWorkdirManifest).toBeDefined()
})

test("pre-run snapshot keeps unchanged deleted empty unicode and binary inputs while reporting bounded omissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-execute-input-shapes-"))
  roots.push(root)
  const skillDir = join(root, "skill")
  const workDir = join(root, "work")
  const sessionDir = join(root, "session")
  const inputSnapshotPath = join(sessionDir, "source-inputs", "manifest.json")
  await mkdir(skillDir, { recursive: true })
  await mkdir(join(workDir, "资料 目录"), { recursive: true })
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: input-shapes\ndescription: test\n---\nInspect files.\n", "utf8")
  await writeFile(join(workDir, "unchanged.txt"), "same\n", "utf8")
  await writeFile(join(workDir, "deleted.txt"), "delete later\n", "utf8")
  await writeFile(join(workDir, "empty.txt"), "", "utf8")
  await writeFile(join(workDir, "资料 目录", "空 文件.txt"), "中文内容\n", "utf8")
  await writeFile(join(workDir, "binary.dat"), Uint8Array.from([0, 255, 1, 2]))
  await writeFile(join(workDir, "too-large.txt"), "x".repeat(64 * 1024 + 1), "utf8")
  const task = await materializeNaturalRunTask({
    prompt: "Inspect the inputs and write result.txt.",
    taskPath: join(sessionDir, "source-task", "task.json"),
  })
  const adapter: AgentAdapter = {
    name: "bare-agent",
    async setup() {},
    async run() {
      await unlink(join(workDir, "deleted.txt"))
      await writeFile(join(workDir, "result.txt"), "new output\n", "utf8")
      return {
        text: "done",
        steps: [],
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        cost: 0,
        durationMs: 1,
        llmDurationMs: 1,
        workDir,
        runStatus: "ok",
      }
    },
    async teardown() {},
  }

  const result = await executeRun({
    task,
    skill: await loadRunSkill(join(skillDir, "SKILL.md")),
    adapter,
    adapterConfig: { model: "test/model", maxSteps: 1, timeoutMs: 1000, mode: "managed" },
    workDir,
    initialWorkdirManifestPath: join(sessionDir, "initial-workdir-manifest.json"),
    preRunInputSnapshotPath: inputSnapshotPath,
  })
  const snapshot = JSON.parse(await Bun.file(inputSnapshotPath).text())
  const byPath = new Map(snapshot.entries.map((entry: { path: string }) => [entry.path, entry]))

  expect(byPath.get("unchanged.txt")).toMatchObject({ status: "captured", mediaType: "text" })
  expect(byPath.get("deleted.txt")).toMatchObject({ status: "captured", mediaType: "text" })
  expect(byPath.get("empty.txt")).toMatchObject({ status: "captured", bytes: 0, mediaType: "text" })
  expect(byPath.get("资料 目录/空 文件.txt")).toMatchObject({ status: "captured", mediaType: "text" })
  expect(byPath.get("binary.dat")).toMatchObject({ status: "captured", bytes: 4, mediaType: "binary" })
  expect(byPath.get("too-large.txt")).toMatchObject({ status: "omitted", reason: "file-too-large" })
  const deleted = byPath.get("deleted.txt") as { contentPath: string }
  expect(await Bun.file(join(inputSnapshotPath, "..", deleted.contentPath)).text()).toBe("delete later\n")
  expect(byPath.has("result.txt")).toBe(false)
  expect(await readdir(workDir)).not.toContain("source-inputs")
  expect(result.preRunInputSnapshot).toMatchObject({ path: inputSnapshotPath })
})
