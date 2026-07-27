import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import type { AgentAdapter } from "../core/types.ts"
import { readInitialWorkdirManifest } from "../core/workdir-manifest.ts"
import { executeRun, loadRunSkill, loadRunTask } from "./index.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("executeRun captures fixtures and skill resources before adapter setup", async () => {
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
      setupObservedManifest = (await readFile(manifestPath, "utf8")).includes("references/guide.md")
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
  expect(manifest.entries.map((entry) => entry.path)).toEqual([
    "references",
    "references/guide.md",
    "study.json",
  ])
})
