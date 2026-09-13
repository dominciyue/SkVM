import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { computeDiff, serializeContext } from "../../src/jit-optimize/workspace.ts"
import type { Evidence, EvidenceCriterion } from "../../src/jit-optimize/types.ts"

function crit(opts: {
  score: number
  passed?: boolean
  weight?: number
  infraError?: string
  name?: string
}): EvidenceCriterion {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    method: "llm-judge",
    weight: opts.weight ?? 1,
    score: opts.score,
    passed: opts.passed ?? opts.score >= 0.5,
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.infraError ? { infraError: opts.infraError } : {}),
  }
}

function ev(
  taskId: string,
  taskPrompt: string,
  criteria: EvidenceCriterion[],
): Evidence {
  return {
    taskId,
    taskPrompt,
    conversationLog: [
      { type: "request", ts: "2026-04-14T00:00:00Z", text: taskPrompt },
      { type: "response", ts: "2026-04-14T00:00:01Z", text: "ok" },
    ],
    workDirSnapshot: { files: new Map() },
    criteria,
    runMeta: {
      tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      durationMs: 1000,
      skillLoaded: true,
      runStatus: "ok",
    },
  }
}

async function setupOptimizeDir(evidences: Evidence[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "workspace-test-"))
  await serializeContext(dir, evidences, [])
  return dir
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

describe("computeDiff — portable optimizer changes", () => {
  test("emits forward-slash paths and ignores runtime cache artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-diff-portable-"))
    const original = path.join(root, "original")
    const workspace = path.join(root, "workspace")
    try {
      await mkdir(path.join(original, "scripts", "__pycache__"), { recursive: true })
      await mkdir(path.join(workspace, "scripts", "__pycache__"), { recursive: true })
      await writeFile(path.join(original, "scripts", "run.py"), "print('old')\n")
      await writeFile(path.join(workspace, "scripts", "run.py"), "print('new')\n")
      await writeFile(path.join(original, "scripts", "__pycache__", "run.pyc"), "old cache\n")
      await writeFile(path.join(workspace, "scripts", "__pycache__", "run.pyc"), "new cache\n")
      await writeFile(path.join(workspace, "scripts", "__pycache__", "helper.pyc"), "new cache\n")

      expect(await computeDiff(workspace, original)).toEqual({
        added: [],
        modified: ["scripts/run.py"],
        removed: [],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("serializeContext — task-first layout", () => {
  test("groups multiple runs of the same task under tasks/<safeId>/", async () => {
    const dir = await setupOptimizeDir([
      ev("task-A", "do A", [crit({ score: 0.0 })]),
      ev("task-A", "do A", [crit({ score: 0.0 })]),
      ev("task-B", "do B", [crit({ score: 1.0 })]),
      ev("task-B", "do B", [crit({ score: 1.0 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries.sort()).toEqual(["task-A", "task-B"])

      const aFiles = await readdir(path.join(dir, "tasks", "task-A"))
      expect(aFiles).toContain("summary.md")
      expect(aFiles).toContain("run-0.md")
      expect(aFiles).toContain("run-0.json")
      expect(aFiles).toContain("run-1.md")
      expect(aFiles).toContain("run-1.json")

      const bFiles = await readdir(path.join(dir, "tasks", "task-B"))
      expect(bFiles).toContain("run-0.md")
      expect(bFiles).toContain("run-1.md")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("taskId with slashes is sanitized for the directory name", async () => {
    const dir = await setupOptimizeDir([
      ev("pdf/extract", "extract pdf", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries).toEqual(["pdf-extract"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("taskId with arbitrary non-fs-safe chars is reduced to a clean slug", async () => {
    const dir = await setupOptimizeDir([
      ev("skill:pdf extract!?", "p", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      // Only [a-zA-Z0-9._-] survives, repeats collapsed, leading/trailing
      // dashes trimmed. Colons, spaces, question marks all become dashes.
      expect(taskEntries).toEqual(["skill-pdf-extract"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("taskId that reduces to empty falls back to unnamed-task", async () => {
    const dir = await setupOptimizeDir([
      ev("///", "empty", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries).toEqual(["unnamed-task"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("dot-segment taskId does NOT escape the tasks directory (Codex review P2)", async () => {
    // `..` as a task id would resolve `path.join(optimizeDir, "tasks", "..")`
    // to optimizeDir itself, clobbering README.md, PER_TASK_SUMMARY.md, etc.
    // Reachable from the log source (file named `...jsonl` → basename after
    // extension strip is `..`). Must fall back to `unnamed-task`.
    const dir = await setupOptimizeDir([
      ev("..", "dot-dot", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries).toEqual(["unnamed-task"])
      // No stray summary.md / run-0.md in the root (those would indicate
      // the `..` escape had actually written into optimizeDir).
      const rootFiles = await readdir(dir)
      expect(rootFiles).not.toContain("run-0.md")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("pure-dot taskIds of any length are rejected", async () => {
    const dir = await setupOptimizeDir([
      ev(".", "single dot", [crit({ score: 0.5 })]),
      ev("....", "four dots", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      // Both fall back to `unnamed-task`, then the collision disambiguator
      // gives the second one a `-2` suffix.
      expect(taskEntries.sort()).toEqual(["unnamed-task", "unnamed-task-2"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("two distinct task ids that collapse to the same slug land in separate directories (Codex review P2)", async () => {
    // `pdf/extract` and `pdf:extract` both sanitize to `pdf-extract`.
    // Without disambiguation the second group overwrites the first.
    const dir = await setupOptimizeDir([
      ev("pdf/extract", "slash form", [crit({ score: 0.2 })]),
      ev("pdf:extract", "colon form", [crit({ score: 0.9 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries.sort()).toEqual(["pdf-extract", "pdf-extract-2"])
      const firstRun = await readFile(
        path.join(dir, "tasks", "pdf-extract", "run-0.md"),
        "utf-8",
      )
      const secondRun = await readFile(
        path.join(dir, "tasks", "pdf-extract-2", "run-0.md"),
        "utf-8",
      )
      expect(firstRun).toContain("slash form")
      expect(secondRun).toContain("colon form")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("case-only collision is disambiguated (APFS is case-insensitive by default)", async () => {
    const dir = await setupOptimizeDir([
      ev("TaskA", "upper", [crit({ score: 0.5 })]),
      ev("taska", "lower", [crit({ score: 0.5 })]),
    ])
    try {
      const taskEntries = await readdir(path.join(dir, "tasks"))
      expect(taskEntries.length).toBe(2)
      const lowerNames = taskEntries.map((n) => n.toLowerCase()).sort()
      expect(lowerNames).toEqual(["taska", "taska-2"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("does NOT emit the legacy flat evidence-N.md files", async () => {
    const dir = await setupOptimizeDir([
      ev("task-A", "do A", [crit({ score: 0.5 })]),
      ev("task-A", "do A", [crit({ score: 0.5 })]),
    ])
    try {
      const top = await readdir(dir)
      expect(top.some((f) => f.startsWith("evidence-"))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("each run-N.md records its global Evidence Index", async () => {
    const dir = await setupOptimizeDir([
      ev("task-A", "a", [crit({ score: 0.0 })]), // global 0
      ev("task-B", "b", [crit({ score: 1.0 })]), // global 1
      ev("task-A", "a", [crit({ score: 0.0 })]), // global 2 (second run of A)
    ])
    try {
      const aRun0 = await readFile(path.join(dir, "tasks", "task-A", "run-0.md"), "utf-8")
      const aRun1 = await readFile(path.join(dir, "tasks", "task-A", "run-1.md"), "utf-8")
      const bRun0 = await readFile(path.join(dir, "tasks", "task-B", "run-0.md"), "utf-8")
      expect(aRun0).toContain("Evidence Index (global): 0")
      expect(bRun0).toContain("Evidence Index (global): 1")
      expect(aRun1).toContain("Evidence Index (global): 2")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("PER_TASK_SUMMARY.md — status bucketing", () => {
  test("FAILING / MARGINAL / PASSING buckets honour the 0.5 and 0.9 boundaries", async () => {
    const dir = await setupOptimizeDir([
      ev("task-failing", "f", [crit({ score: 0.2 })]),
      ev("task-marginal", "m", [crit({ score: 0.7 })]),
      ev("task-passing", "p", [crit({ score: 0.95 })]),
    ])
    try {
      const summary = await readFile(path.join(dir, "PER_TASK_SUMMARY.md"), "utf-8")
      expect(summary).toContain("`task-failing`")
      expect(summary).toContain("`task-marginal`")
      expect(summary).toContain("`task-passing`")
      // Status bucketing
      const failingRow = summary.split("\n").find((l) => l.includes("task-failing"))
      expect(failingRow).toBeDefined()
      expect(failingRow!).toContain("FAILING")
      const marginalRow = summary.split("\n").find((l) => l.includes("task-marginal"))
      expect(marginalRow!).toContain("MARGINAL")
      const passingRow = summary.split("\n").find((l) => l.includes("task-passing"))
      expect(passingRow!).toContain("PASSING")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("fully-tainted task lands in TAINTED bucket", async () => {
    const dir = await setupOptimizeDir([
      ev("task-broken", "x", [crit({ score: 0, infraError: "timeout" })]),
    ])
    try {
      const summary = await readFile(path.join(dir, "PER_TASK_SUMMARY.md"), "utf-8")
      const row = summary.split("\n").find((l) => l.includes("task-broken"))
      expect(row!).toContain("TAINTED")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("clean trace evidence without criteria is UNASSESSED rather than TAINTED", async () => {
    const evidence = ev("trace-only", "inspect trace", [])
    evidence.criteria = undefined
    evidence.runMeta = undefined
    const dir = await setupOptimizeDir([evidence])
    try {
      const summary = await readFile(path.join(dir, "PER_TASK_SUMMARY.md"), "utf8")
      expect(summary).toContain("| UNASSESSED | `trace-only`")
      expect(summary).toContain("A missing score is not an infrastructure failure")
      expect(summary).not.toContain("| TAINTED  | `trace-only`")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rows are sorted by mean score ascending (failures at the top)", async () => {
    const dir = await setupOptimizeDir([
      ev("task-ok", "ok", [crit({ score: 0.95 })]),
      ev("task-broken", "br", [crit({ score: 0.1 })]),
      ev("task-mid", "mid", [crit({ score: 0.6 })]),
    ])
    try {
      const summary = await readFile(path.join(dir, "PER_TASK_SUMMARY.md"), "utf-8")
      const lines = summary.split("\n")
      const brokenIdx = lines.findIndex((l) => l.includes("task-broken"))
      const midIdx = lines.findIndex((l) => l.includes("task-mid"))
      const okIdx = lines.findIndex((l) => l.includes("task-ok"))
      expect(brokenIdx).toBeLessThan(midIdx)
      expect(midIdx).toBeLessThan(okIdx)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("summary lists global Evidence Indices for each task", async () => {
    const dir = await setupOptimizeDir([
      ev("task-A", "a", [crit({ score: 0.5 })]),
      ev("task-B", "b", [crit({ score: 0.5 })]),
      ev("task-A", "a", [crit({ score: 0.5 })]),
    ])
    try {
      const summary = await readFile(path.join(dir, "PER_TASK_SUMMARY.md"), "utf-8")
      const aRow = summary.split("\n").find((l) => l.includes("task-A"))!
      const bRow = summary.split("\n").find((l) => l.includes("task-B"))!
      // task-A's two runs landed at global index 0 and 2; task-B's single run at 1.
      expect(aRow).toContain("0,2")
      expect(bRow).toMatch(/\|\s*1\s*\|/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("task summary.md", () => {
  test("includes per-run breakdown and mean", async () => {
    const dir = await setupOptimizeDir([
      ev("task-A", "a", [crit({ score: 0.2 })]),
      ev("task-A", "a", [crit({ score: 0.4 })]),
    ])
    try {
      const summary = await readFile(path.join(dir, "tasks", "task-A", "summary.md"), "utf-8")
      expect(summary).toContain("Task `task-A`")
      expect(summary).toContain("mean score: 0.300")
      expect(summary).toContain("| run-0 | 0 |")
      expect(summary).toContain("| run-1 | 1 |")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("workdir snapshot placement", () => {
  test("workdir files land under tasks/<safeId>/run-N-workdir/", async () => {
    const taskEv: Evidence = {
      taskId: "task-A",
      taskPrompt: "do A",
      conversationLog: [],
      workDirSnapshot: { files: new Map([["out.txt", "hello"]]) },
      criteria: [crit({ score: 0.5 })],
      runMeta: {
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        costUsd: 0,
        durationMs: 0,
        skillLoaded: true,
        runStatus: "ok",
      },
    }
    const dir = await setupOptimizeDir([taskEv])
    try {
      const workdirFile = path.join(dir, "tasks", "task-A", "run-0-workdir", "out.txt")
      expect(await pathExists(workdirFile)).toBe(true)
      const content = await readFile(workdirFile, "utf-8")
      expect(content).toBe("hello")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("materializes trace-bound original task fixtures separately from the observed workdir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-task-fixtures-"))
    const optimizeDir = path.join(root, ".optimize")
    const taskPath = path.join(root, "task.json")
    await mkdir(optimizeDir)
    await writeFile(taskPath, JSON.stringify({
      id: "task-A",
      prompt: "check source messages",
      fixtures: {
        "src/App.tsx": "export const label = 'Save'\n",
        "locales/en.json": "{\"save\":\"Save\"}\n",
      },
      eval: [{
        id: "hidden-evaluator-contract",
        method: "llm-judge",
        rubric: "must not be projected into optimizer fixture files",
      }],
    }))

    const taskEv = ev("task-A", "check source messages", [crit({ score: 1 })])
    taskEv.trace = {
      format: "skvm-raw-runs-jsonl/v1",
      representation: "conversation-trace",
      sourcePath: path.join(root, "raw-runs.jsonl"),
      inputSha256: "a".repeat(64),
      recordLocator: "line:1",
      taskIdSource: "source",
      taskPath,
      unknownFields: [],
      diagnostics: [],
    }

    try {
      await serializeContext(optimizeDir, [taskEv], [])
      const fixtureDir = path.join(optimizeDir, "tasks", "task-A", "run-0-task-fixtures")
      expect(await readFile(path.join(fixtureDir, "src", "App.tsx"), "utf8"))
        .toBe("export const label = 'Save'\n")
      expect(await readFile(path.join(fixtureDir, "locales", "en.json"), "utf8"))
        .toBe("{\"save\":\"Save\"}\n")

      const manifest = JSON.parse(await readFile(
        path.join(optimizeDir, "tasks", "task-A", "run-0-task-fixtures-manifest.json"),
        "utf8",
      )) as {
        schemaVersion: string
        status: string
        taskSha256: string
        files: Array<{ path: string; bytes: number; sha256: string }>
      }
      expect(manifest.schemaVersion).toBe("jit-optimize-task-fixtures/v1")
      expect(manifest.status).toBe("materialized")
      expect(manifest.taskSha256).toHaveLength(64)
      expect(manifest.files.map((file) => file.path)).toEqual([
        "locales/en.json",
        "src/App.tsx",
      ])

      const runMarkdown = await readFile(
        path.join(optimizeDir, "tasks", "task-A", "run-0.md"),
        "utf8",
      )
      const readme = await readFile(path.join(optimizeDir, "README.md"), "utf8")
      expect(runMarkdown).toContain("run-0-task-fixtures/")
      expect(runMarkdown).toContain("original pre-run inputs")
      expect(readme).toContain("run-N-task-fixtures/")
      expect(readme).toContain("not evaluator expectations")
      expect(await pathExists(path.join(fixtureDir, "eval"))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("records an unresolved manifest and writes no fixture when a task fixture path escapes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-unsafe-task-fixtures-"))
    const optimizeDir = path.join(root, ".optimize")
    const taskPath = path.join(root, "task.json")
    await mkdir(optimizeDir)
    await writeFile(taskPath, JSON.stringify({
      id: "task-A",
      prompt: "unsafe fixture",
      fixtures: { "../escape.txt": "must not escape\n" },
      eval: [],
    }))

    const taskEv = ev("task-A", "unsafe fixture", [])
    taskEv.trace = {
      format: "skvm-raw-runs-jsonl/v1",
      representation: "conversation-trace",
      sourcePath: path.join(root, "raw-runs.jsonl"),
      inputSha256: "b".repeat(64),
      recordLocator: "line:1",
      taskIdSource: "source",
      taskPath,
      unknownFields: [],
      diagnostics: [],
    }

    try {
      await serializeContext(optimizeDir, [taskEv], [])
      const taskDir = path.join(optimizeDir, "tasks", "task-A")
      const manifest = JSON.parse(await readFile(
        path.join(taskDir, "run-0-task-fixtures-manifest.json"),
        "utf8",
      )) as { status: string; diagnostic: { code: string; message: string } }
      expect(manifest.status).toBe("unresolved")
      expect(manifest.diagnostic.code).toBe("unsafe-fixture-path")
      expect(manifest.diagnostic.message).toContain("../escape.txt")
      expect(await pathExists(path.join(taskDir, "run-0-task-fixtures"))).toBe(false)
      expect(await pathExists(path.join(root, "escape.txt"))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("serializeContext — implementation context", () => {
  test("organizes runnable source interfaces, shaped inputs, observed outputs, and checks without locator guessing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-implementation-context-"))
    const optimizeDir = path.join(root, "optimize")
    const skillDir = path.join(root, "skill")
    const taskDir = path.join(root, "task")
    try {
      await mkdir(path.join(skillDir, "scripts"), { recursive: true })
      await mkdir(taskDir, { recursive: true })
      await writeFile(path.join(skillDir, "SKILL.md"), "# Table tool\n\nUse `scripts/table.py --input FILE --out FILE`.\n")
      await writeFile(
        path.join(skillDir, "scripts", "table.py"),
        "# usage: table.py --input FILE --out FILE\nprint('ok')\n",
      )
      const taskPath = path.join(taskDir, "task.json")
      await writeFile(taskPath, JSON.stringify({
        id: "table-task",
        fixtures: { "inputs/rows.csv": "name,code\nAlpha,A1\n" },
      }))
      const evidence: Evidence = {
        taskId: "table-task",
        taskPrompt: "Read the CSV and produce a JSON summary.",
        conversationLog: [],
        criteria: [{
          id: "summary-schema",
          method: "file-check",
          description: "Summary follows the required object schema.",
          weight: 1,
          score: 1,
          passed: true,
        }],
        workDirSnapshot: { files: new Map([
          ["out/summary.json", "{\"name\":\"Alpha\",\"code\":\"A1\"}\n"],
        ]) },
        trace: {
          format: "test-trace",
          representation: "run-summary",
          sourcePath: path.join(root, "trace.jsonl"),
          inputSha256: "a".repeat(64),
          recordLocator: "line:1",
          taskIdSource: "source",
          taskPath,
          unknownFields: [],
          diagnostics: [],
        },
      }

      await serializeContext(optimizeDir, [evidence], [], { skillDir })

      const context = JSON.parse(await readFile(path.join(optimizeDir, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
      expect(context).toMatchObject({
        schemaVersion: "jit-optimize-implementation-context/v1",
        implementationContract: {
          existingExecutable: "reuse-script",
          newExecutable: "generate-script",
          domainBackend: "registered-only",
          declarationMismatch: "repairable-action-diagnostic",
        },
        sourceInterfaces: [{
          path: "scripts/table.py",
          runtime: "python",
          parameterTokens: ["--input", "--out"],
          referencedBySkill: true,
        }],
        evidence: [{
          evidenceIndex: 0,
          taskId: "table-task",
          inputs: {
            status: "materialized",
            files: [{
              path: "inputs/rows.csv",
              locator: ".optimize/tasks/table-task/run-0-task-fixtures/inputs/rows.csv",
              format: { kind: "csv", columns: ["name", "code"] },
            }],
          },
          observedOutputs: [{
            path: "out/summary.json",
            locator: ".optimize/tasks/table-task/run-0-workdir/out/summary.json",
            format: { kind: "json", rootType: "object", topLevelKeys: ["code", "name"] },
          }],
          checks: [{
            id: "summary-schema",
            method: "file-check",
            passed: true,
            sourceRef: "evidence:0#criteria/summary-schema",
          }],
        }],
      })
      expect(await readFile(path.join(optimizeDir, "README.md"), "utf8"))
        .toContain(".optimize/IMPLEMENTATION_CONTEXT.json")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("projects digest-bound pre-run bytes separately from stale task fixtures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-pre-run-inputs-"))
    const optimizeDir = path.join(root, "optimize")
    const taskDir = path.join(root, "task")
    const snapshotDir = path.join(root, "source-inputs")
    try {
      await mkdir(taskDir, { recursive: true })
      await mkdir(path.join(snapshotDir, "files"), { recursive: true })
      const taskPath = path.join(taskDir, "task.json")
      await writeFile(taskPath, JSON.stringify({
        id: "same-name-input",
        fixtures: { "input.bin": "stale-task-fixture" },
      }))
      const inputBytes = Uint8Array.from([0xff, 0x00, 0x01])
      const inputSha = new Bun.CryptoHasher("sha256").update(inputBytes).digest("hex")
      const snapshotText = `${JSON.stringify({
        schemaVersion: "skvm-pre-run-input-snapshot/v1",
        limits: { maxFileBytes: 64 * 1024, maxTotalBytes: 512 * 1024 },
        entries: [{
          path: "input.bin",
          type: "file",
          status: "captured",
          sha256: inputSha,
          bytes: inputBytes.byteLength,
          contentPath: "files/input.bin",
          mediaType: "binary",
        }],
      }, null, 2)}\n`
      const snapshotPath = path.join(snapshotDir, "manifest.json")
      await Bun.write(path.join(snapshotDir, "files", "input.bin"), inputBytes)
      await Bun.write(snapshotPath, snapshotText)
      const evidence = ev("same-name-input", "consume the original input", []) as any
      evidence.trace = {
        format: "test-trace",
        representation: "run-summary",
        sourcePath: path.join(root, "trace.jsonl"),
        inputSha256: "a".repeat(64),
        recordLocator: "line:1",
        taskIdSource: "source",
        taskPath,
        unknownFields: [],
        diagnostics: [],
      }
      evidence.inputResources = {
        preRun: {
          source: "pre-run-input-snapshot",
          reference: {
            path: snapshotPath,
            sha256: new Bun.CryptoHasher("sha256").update(snapshotText).digest("hex"),
            bytes: Buffer.byteLength(snapshotText),
          },
        },
      }

      await serializeContext(optimizeDir, [evidence], [])

      const context = JSON.parse(await readFile(path.join(optimizeDir, "IMPLEMENTATION_CONTEXT.json"), "utf8"))
      expect(context.evidence[0].preRunInputs).toMatchObject({
        status: "materialized",
        files: [{
          path: "input.bin",
          locator: ".optimize/tasks/same-name-input/run-0-pre-run-inputs/input.bin",
          bytes: 3,
          sha256: inputSha,
          mediaType: "binary",
        }],
      })
      expect(await Bun.file(path.join(optimizeDir, "tasks", "same-name-input", "run-0-pre-run-inputs", "input.bin")).bytes())
        .toEqual(inputBytes)
      expect(await readFile(path.join(optimizeDir, "tasks", "same-name-input", "run-0-task-fixtures", "input.bin"), "utf8"))
        .toBe("stale-task-fixture")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("source skill resource navigation", () => {
  test("indexes the complete configured skill so rules not exercised by the trace stay readable", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "workspace-resource-index-"))
    const optimizeDir = path.join(dir, ".optimize")
    try {
      await mkdir(path.join(dir, "scripts"), { recursive: true })
      await mkdir(optimizeDir)
      await writeFile(path.join(dir, "SKILL.md"), "# Skill\n\nAlways preserve the original file.\n")
      await writeFile(path.join(dir, "scripts", "unused-rule.py"), "print('unrun rule remains available')\n")

      const evidence = ev("one-real-run", "process one file", [])
      evidence.criteria = undefined
      evidence.runMeta = undefined
      await serializeContext(optimizeDir, [evidence], [], { skillDir: dir })

      const index = await readFile(path.join(optimizeDir, "SKILL_RESOURCE_INDEX.md"), "utf-8")
      const readme = await readFile(path.join(optimizeDir, "README.md"), "utf-8")
      expect(index).toContain("`SKILL.md`")
      expect(index).toContain("`scripts/unused-rule.py`")
      expect(index).toContain("not evidence that the rule is unused")
      expect(readme).toContain("SKILL_RESOURCE_INDEX.md")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
