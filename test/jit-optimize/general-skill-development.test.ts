import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { buildOptimizedSkillPackage } from "../../src/jit-optimize/package.ts"
import {
  buildGeneralSkillTaskPrompt,
  runGeneralSkillDevelopment,
  type GeneralSkillAgentRunner,
} from "../../src/jit-optimize/general-skill-development.ts"
import type { RunExecutionObservation } from "../../src/core/types.ts"

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function root(): Promise<string> {
  const result = await mkdtemp(path.join(os.tmpdir(), "skvm-general-development-"))
  roots.push(result)
  return result
}

async function put(base: string, relative: string, content: string): Promise<void> {
  const target = path.join(base, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

async function makePackage(kind: "program" | "docs"): Promise<{ packageDir: string; base: string }> {
  const base = await root()
  const proposal = path.join(base, "proposal")
  const original = path.join(proposal, "original")
  const round = path.join(proposal, "round-1")
  await put(original, "SKILL.md", "# Original\n")
  if (kind === "program") {
    await put(round, "SKILL.md", "# Optimized\n\nUse the bundled record transformer, then review its JSON and write summary.md.\n")
    await put(round, "tools/transform.mjs", "console.log(JSON.stringify({status:'success'}))\n")
  } else {
    await put(round, "SKILL.md", "# Optimized review workflow\n\nRead the input and write a concise checked report.\n")
  }
  await put(proposal, "meta.json", JSON.stringify({
    schemaVersion: 1,
    skillName: `${kind}-skill`,
    skillDir: original,
    harness: "bare-agent",
    optimizerModel: "provider/optimizer",
    targetModel: "provider/target",
    source: "test",
    timestamp: "20260913T000000000Z",
    status: "pending",
    acceptedRound: null,
    bestRound: 1,
    bestRoundReason: "test",
    roundCount: 2,
  }))
  const action = {
    id: kind,
    kind: kind === "program" ? "generate-script" : "restructure-docs",
    evidenceIds: ["0"],
    sourceRefs: [], dependsOn: [], inputs: ["input.json"], outputs: ["result.json"], preconditions: [],
    changedPaths: kind === "program" ? ["SKILL.md", "tools/transform.mjs"] : ["SKILL.md"],
    residualDuties: kind === "program" ? ["review transformed result"] : [],
    verification: ["check requested output"],
  }
  await put(proposal, "round-1-optimizer/submission.json", JSON.stringify({
    rootCause: "test", reasoning: "test", confidence: 1, changedFiles: action.changedPaths, actions: [action],
  }))
  const packageDir = path.join(base, "package")
  await buildOptimizedSkillPackage({ proposalDir: proposal, packageDir })
  return { packageDir, base }
}

function runResult() {
  return {
    exitCode: 0,
    durationMs: 12,
    timedOut: false,
    cost: 0,
    tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0 },
    rawStdout: "[]",
    rawStderr: "",
    driver: "pi" as const,
  }
}

function executionObservation(): RunExecutionObservation {
  return {
    schemaVersion: "skvm-run-execution-observation/v1",
    process: { exitCode: 0, durationMs: 12, termination: "natural" },
    activity: {
      requestDispatched: true,
      providerResponses: 2,
      assistantMessages: 2,
      toolCalls: 1,
      toolResults: 1,
    },
    counts: {
      runCount: 1,
      modelResponseCount: 2,
      turnCount: 2,
      toolCallCount: 1,
      retryCount: 0,
      toolOutputCharacters: 17,
    },
    terminal: { present: true, stopReason: "stop" },
    usage: { available: true, input: 10, output: 5, cacheRead: 2, cacheWrite: 0, providerTotal: 17, reasoning: null },
    parser: { outcome: "ok", unknownTypes: [] },
  }
}

describe("general skill development consumption", () => {
  test("keeps the natural task prompt free of internal helper paths", () => {
    const prompt = buildGeneralSkillTaskPrompt({
      task: "Transform input.json and review the result.",
      resourcePaths: ["input.json"],
      expectedOutputPaths: ["result.json", "summary.md"],
    })
    expect(prompt).toContain("Transform input.json")
    expect(prompt).toContain("./skill/SKILL.md")
    expect(prompt).not.toContain("transform.mjs")
    expect(prompt).not.toContain("internal binding")
    expect(prompt).toContain("python -B")
    expect(prompt).toContain("Treat ./skill as immutable")
  })

  test("checks a declared helper call and a post-helper residual result separately", async () => {
    const { packageDir, base } = await makePackage("program")
    const sourceInput = path.join(base, "source-input.json")
    await writeFile(sourceInput, JSON.stringify({ value: "beta" }))
    let observedPrompt = ""
    const agentRunner: GeneralSkillAgentRunner = async (options) => {
      observedPrompt = options.prompt
      await writeFile(path.join(options.cwd, "result.json"), JSON.stringify({ value: "beta" }))
      await writeFile(path.join(options.cwd, "summary.md"), "Reviewed beta output.\n")
      return {
        result: runResult(),
        executionObservation: executionObservation(),
        steps: [{
          role: "assistant",
          timestamp: 1,
          toolCalls: [{ id: "read", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0 }, {
            id: "run", name: "execute_command", input: { command: "node skill/tools/transform.mjs input.json" },
            output: "{\"status\":\"success\",\"output\":\"result.json\"}", exitCode: 0,
          }],
        }],
      }
    }
    const report = await runGeneralSkillDevelopment({
      skillDir: packageDir,
      runDir: path.join(base, "run"),
      task: "Transform input.json, inspect the JSON result, and write summary.md.",
      resources: [{ sourcePath: sourceInput, workPath: "input.json", protected: true }],
      expectedFiles: [
        { path: "result.json", includes: ["beta"] },
        { path: "summary.md", includes: ["Reviewed", "beta"] },
      ],
      residualEvidenceFiles: ["summary.md"],
      model: "provider/model",
      agentRunner,
    })

    expect(observedPrompt).not.toContain("transform.mjs")
    expect(report.status).toBe("passed")
    expect(report.verification.taskPassed).toBe(true)
    expect(report.consumption).toMatchObject({
      helperSucceeded: true,
      residualWorkRequired: true,
      residualWorkCompleted: true,
      consumptionComplete: true,
    })
    expect(report.verification.protectedResourcesPreserved).toBe(true)
    expect(report.verification.skillPackagePreserved).toBe(true)
    expect(report.runtime.executionObservation?.counts).toEqual({
      runCount: 1,
      modelResponseCount: 2,
      turnCount: 2,
      toolCallCount: 1,
      retryCount: 0,
      toolOutputCharacters: 17,
    })
    expect(report.runtime.agentEvents).toMatchObject({
      path: "agent-events.json.gz",
      format: "gzip",
      rawBytes: 2,
    })
    expect(gunzipSync(await readFile(path.join(base, "run", "agent-events.json.gz"))).toString("utf8")).toBe("[]")
    expect(report.runtime.initialWorkdirManifest.path).toBe(path.join(base, "run", "initial-workdir-manifest.json"))
    expect(report.runtime.initialWorkdirManifest.sha256).toHaveLength(64)
  })

  test("does not require a fictitious helper for a docs-only package", async () => {
    const { packageDir, base } = await makePackage("docs")
    const agentRunner: GeneralSkillAgentRunner = async (options) => {
      expect(await Bun.file(path.join(options.cwd, "notes.txt")).text()).toBe("alpha\n")
      await writeFile(path.join(options.cwd, "report.md"), "Checked alpha.\n")
      return {
        result: runResult(),
        steps: [{ role: "assistant", timestamp: 1, toolCalls: [{
          id: "read-docs", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0,
        }] }],
      }
    }
    const report = await runGeneralSkillDevelopment({
      skillDir: packageDir,
      runDir: path.join(base, "run-docs"),
      task: "Review notes.txt and write report.md.",
      resources: [],
      fixtures: { "notes.txt": "alpha\n" },
      protectedFixturePaths: ["notes.txt"],
      expectedFiles: [{ path: "report.md", includes: ["Checked alpha"] }],
      model: "provider/model",
      agentRunner,
    })
    expect(report.status).toBe("passed")
    expect(report.consumption).toMatchObject({ documentationOnly: true, helperInvoked: false, consumptionComplete: true })
  })

  test("fails the task boundary when execution mutates the copied skill package", async () => {
    const { packageDir, base } = await makePackage("docs")
    const agentRunner: GeneralSkillAgentRunner = async (options) => {
      await writeFile(path.join(options.cwd, "report.md"), "Checked alpha.\n")
      await put(options.cwd, "skill/scripts/__pycache__/helper.pyc", "cache")
      return {
        result: runResult(),
        steps: [{ role: "assistant", timestamp: 1, toolCalls: [{
          id: "read-docs", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0,
        }] }],
      }
    }
    const report = await runGeneralSkillDevelopment({
      skillDir: packageDir,
      runDir: path.join(base, "run-mutated-package"),
      task: "Review notes.txt and write report.md.",
      resources: [],
      fixtures: { "notes.txt": "alpha\n" },
      protectedFixturePaths: ["notes.txt"],
      expectedFiles: [{ path: "report.md", includes: ["Checked alpha"] }],
      model: "provider/model",
      agentRunner,
    })
    expect(report.status).toBe("failed")
    expect(report.verification).toMatchObject({ taskPassed: false, skillPackagePreserved: false })
  })

  test("runs an ordinary source skill without requiring an optimization manifest", async () => {
    const base = await root()
    const sourceSkill = path.join(base, "source-skill")
    await put(sourceSkill, "SKILL.md", "# Source workflow\n\nRead notes.txt and write report.md.\n")
    const agentRunner: GeneralSkillAgentRunner = async (options) => {
      await writeFile(path.join(options.cwd, "report.md"), "Checked alpha.\n")
      return {
        result: runResult(),
        steps: [{ role: "assistant", timestamp: 1, toolCalls: [{
          id: "read-source", name: "read_file", input: { path: "skill/SKILL.md" }, exitCode: 0,
        }] }],
      }
    }
    const report = await runGeneralSkillDevelopment({
      skillDir: sourceSkill,
      runDir: path.join(base, "source-run"),
      task: "Review notes.txt and write report.md.",
      resources: [],
      fixtures: { "notes.txt": "alpha\n" },
      protectedFixturePaths: ["notes.txt"],
      expectedFiles: [{ path: "report.md", includes: ["Checked alpha"] }],
      model: "provider/model",
      agentRunner,
    })
    expect(report.status).toBe("passed")
    expect(report.package).toMatchObject({ kind: "source", selectedEntrypoints: [] })
    expect(report.package.manifestIdentity).toStartWith("source:")
  })
})
