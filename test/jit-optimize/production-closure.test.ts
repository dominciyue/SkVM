import { afterEach, describe, expect, mock, test } from "bun:test"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { OptimizeConfig, OptimizeInput, OptimizeResult, OptimizeSubmission } from "../../src/jit-optimize/types.ts"
import { buildOptimizedSkillPackage } from "../../src/jit-optimize/package.ts"
import { createProposal } from "../../src/proposals/storage.ts"

const tempDirs: string[] = []
const proposalDirs: string[] = []
let optimizerHandler: (input: OptimizeInput, config: OptimizeConfig) => Promise<OptimizeResult> = async () => {
  throw new Error("test optimizer handler was not configured")
}

mock.module("../../src/jit-optimize/optimizer.ts", () => ({
  runOptimizer: (input: OptimizeInput, config: OptimizeConfig) => optimizerHandler(input, config),
}))

const { runLoop } = await import("../../src/jit-optimize/loop.ts")

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  await Promise.all(proposalDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function repairScenario(options: { sharedFailureGroup: boolean; repairSucceeds: boolean }) {
  const skillDir = await tempDir("production-repair-skill-")
  const taskDir = await tempDir("production-repair-task-")
  const evidenceWorkDir = await tempDir("production-repair-evidence-")
  const logDir = await tempDir("production-repair-log-")
  const packageDir = path.join(await tempDir("production-repair-package-parent-"), "package")
  const baselineSkill = "# Multi converter\n\nUse the applicable bounded conversion and retain remaining judgment.\n"
  await writeFile(path.join(skillDir, "SKILL.md"), baselineSkill)
  const taskPath = path.join(taskDir, "task.json")
  await writeFile(taskPath, JSON.stringify({
    id: "multi-convert",
    prompt: "Run the bounded independent conversions.",
    fixtures: {
      "inputs/a.json": "{\"value\":\"a\"}\n",
      "inputs/b.json": "{\"value\":\"b\"}\n",
      "inputs/c.json": "{\"value\":\"c\"}\n",
    },
  }))
  await mkdir(path.join(evidenceWorkDir, "reference"), { recursive: true })
  for (const id of ["a", "b", "c"]) {
    await writeFile(path.join(evidenceWorkDir, "reference", `${id}.json`), `${JSON.stringify({ value: id.toUpperCase() })}\n`)
  }
  const logPath = path.join(logDir, "raw-runs.jsonl")
  await writeFile(logPath, `${JSON.stringify({
    caseId: "multi-convert:development",
    system: "original",
    stdout: "Tokens: in=1 out=1\n\nFinal output:\ncompleted",
    successSource: "execution-only",
    taskPath,
    skillPath: path.join(skillDir, "SKILL.md"),
    workDir: evidenceWorkDir,
    runStatus: "ok",
  })}\n`)

  const ids = options.sharedFailureGroup ? ["a", "b", "c"] : ["a", "b"]
  const actions = ids.map((id) => ({
    id,
    kind: "generate-script" as const,
    evidenceIds: ["0"],
    sourceRefs: ["SKILL.md", `evidence:0#reference/${id}.json`],
    dependsOn: [],
    inputs: [`inputs/${id}.json`],
    outputs: [`out/${id}.json`],
    preconditions: ["Node.js is available"],
    changedPaths: options.sharedFailureGroup && id !== "c"
      ? ["SKILL.md", `scripts/${id}.mjs`]
      : [`scripts/${id}.mjs`],
    residualDuties: [],
    verification: ["reference output digest"],
    validation: {
      cases: [{
        id,
        evidenceId: "0",
        inputSource: "task-fixtures" as const,
        inputFiles: [`inputs/${id}.json`],
        args: ["--out", `out/${id}.json`],
        expectedFiles: [{ path: `out/${id}.json`, referencePath: `reference/${id}.json` }],
        basis: "reference-output" as const,
        sourceRefs: [`evidence:0#reference/${id}.json`],
      }],
    },
  }))
  const submission = (): OptimizeSubmission => ({
    rootCause: "Independent mechanical conversions need reusable programs.",
    reasoning: "Each action is bounded by a real reference output.",
    confidence: 0.9,
    changedFiles: [
      ...(options.sharedFailureGroup ? ["SKILL.md"] : []),
      ...ids.map((id) => `scripts/${id}.mjs`),
    ],
    changes: ids.map((id) => ({
      file: `scripts/${id}.mjs`,
      description: `Add converter ${id}.`,
      generality: `Other inputs can use converter ${id}.`,
    })),
    actions,
  })
  const source = (id: string, value: string) => `
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2); const out = args[args.indexOf("--out") + 1];
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, ${JSON.stringify(`${JSON.stringify({ value })}\n`)});
`
  let calls = 0
  const repairFeedback: unknown[] = []
  optimizerHandler = async (input, config) => {
    calls += 1
    const workspaceDir = await tempDir(`production-repair-optimizer-${calls}-`)
    await cp(input.skillDir, workspaceDir, { recursive: true })
    await mkdir(path.join(workspaceDir, "scripts"), { recursive: true })
    if (calls === 1) {
      await writeFile(path.join(workspaceDir, "scripts", "a.mjs"), source("a", "WRONG"))
      await writeFile(path.join(workspaceDir, "scripts", "b.mjs"), source("b", "B"))
      if (options.sharedFailureGroup) {
        await writeFile(path.join(workspaceDir, "scripts", "c.mjs"), source("c", "C"))
        await writeFile(path.join(workspaceDir, "SKILL.md"), "# Candidate routing shared by a and b\n")
      }
    } else {
      repairFeedback.push((input as OptimizeInput & { repairFeedback?: unknown }).repairFeedback)
      await writeFile(
        path.join(workspaceDir, "scripts", "a.mjs"),
        source("a", options.repairSucceeds ? "A" : "STILL-WRONG"),
      )
    }
    const value = submission()
    if (config.recordDir) {
      await mkdir(config.recordDir, { recursive: true })
      await writeFile(path.join(config.recordDir, "submission.json"), `${JSON.stringify(value, null, 2)}\n`)
    }
    return {
      changed: true,
      workspaceDir,
      submission: value,
      actualChangedFiles: calls === 1 ? value.changedFiles : ["scripts/a.mjs"],
      cost: calls,
      tokens: { input: calls, output: calls, cacheRead: 0, cacheWrite: 0 },
    }
  }
  const proposal = await createProposal({
    skillName: `production-repair-${Date.now()}-${options.sharedFailureGroup ? "shared" : "independent"}`,
    skillDir,
    harness: "pi",
    optimizerModel: "test/optimizer",
    targetModel: "test/target",
    source: `log:${logPath}`,
  })
  proposalDirs.push(proposal.dir)
  const result = await runLoop({
    skillDir,
    optimizer: { model: "test/optimizer" },
    taskSource: { kind: "execution-log", logs: [{ path: logPath, recordLocators: ["line:1"] }] },
    targetAdapter: { model: "test/target", harness: "pi" },
    delivery: { keepAllRounds: true, autoApply: false },
    evalProvider: {
      name: "unused-test-provider",
      complete: async () => { throw new Error("log-only flow must not call the eval provider") },
      completeWithToolResults: async () => { throw new Error("log-only flow must not call the eval provider") },
    },
  }, { proposal })
  const exported = await buildOptimizedSkillPackage({ proposalDir: proposal.dir, packageDir })
  const report = JSON.parse(await readFile(path.join(proposal.dir, "round-1-validation", "report.json"), "utf8"))
  return { skillDir, baselineSkill, proposal, packageDir, result, report, exported, calls, repairFeedback }
}

describe("execution-log production validation closure", () => {
  test("normal loop validates a generated program, persists evidence, and exports the real proposal snapshot", async () => {
    const skillDir = await tempDir("production-closure-skill-")
    const taskDir = await tempDir("production-closure-task-")
    const evidenceWorkDir = await tempDir("production-closure-evidence-")
    const logDir = await tempDir("production-closure-log-")
    const packageDir = path.join(await tempDir("production-closure-package-parent-"), "package")
    await writeFile(path.join(skillDir, "SKILL.md"), "# Converter\n\nConvert a JSON value while preserving the task contract.\n")
    const taskPath = path.join(taskDir, "task.json")
    await writeFile(taskPath, JSON.stringify({
      id: "uppercase-json",
      prompt: "Convert input.json into uppercase output JSON.",
      fixtures: { "inputs/input.json": "{\"value\":\"alpha\"}\n" },
    }))
    await mkdir(path.join(evidenceWorkDir, "reference"), { recursive: true })
    await writeFile(path.join(evidenceWorkDir, "reference", "result.json"), "{\"value\":\"ALPHA\"}\n")
    const logPath = path.join(logDir, "raw-runs.jsonl")
    await writeFile(logPath, `${JSON.stringify({
      caseId: "uppercase-json:development",
      system: "original",
      model: "test/target",
      adapter: "pi",
      adapterVersion: "test",
      runIndex: 1,
      taskPath,
      skillPath: path.join(skillDir, "SKILL.md"),
      workDir: evidenceWorkDir,
      exitCode: 0,
      runStatus: "ok",
      durationMs: 1,
      stdout: "Tokens: in=1 out=1\n\nFinal output:\ncompleted",
      stderr: "",
      successSource: "execution-only",
    })}\n`)

    optimizerHandler = async (input, config) => {
      const workspaceDir = await tempDir("production-closure-optimizer-")
      await cp(input.skillDir, workspaceDir, { recursive: true })
      await mkdir(path.join(workspaceDir, "scripts"), { recursive: true })
      await writeFile(path.join(workspaceDir, "scripts", "convert.mjs"), `
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log("Usage: convert --input <path> --out <path>"); process.exit(0); }
const inputAt = args.indexOf("--input");
const outAt = args.indexOf("--out");
if (inputAt < 0 || outAt < 0) { console.error("required argument --input and --out"); process.exit(2); }
const parsed = JSON.parse(await readFile(args[inputAt + 1], "utf8"));
const output = { value: String(parsed.value).toUpperCase() };
await mkdir(path.dirname(args[outAt + 1]), { recursive: true });
await writeFile(args[outAt + 1], JSON.stringify(output) + "\\n");
console.log(JSON.stringify({ status: "success", output: args[outAt + 1] }));
`)
      await writeFile(path.join(workspaceDir, "SKILL.md"), "# Converter\n\nUse `scripts/convert.mjs` for bounded JSON conversions, then complete residual duties.\n")
      const submission: OptimizeSubmission = {
        rootCause: "The repeated deterministic conversion had no reusable executable entry.",
        reasoning: "The generated program parameterizes paths and leaves task interpretation with the agent.",
        confidence: 0.9,
        changedFiles: ["SKILL.md", "scripts/convert.mjs"],
        changes: [
          { file: "SKILL.md", description: "Route bounded conversions to the helper.", generality: "Other JSON conversion tasks use the same entry." },
          { file: "scripts/convert.mjs", description: "Add a parameterized deterministic converter.", generality: "Other paths and values use the same arguments." },
        ],
        actions: [{
          id: "generate-converter",
          kind: "generate-script",
          evidenceIds: ["0"],
          sourceRefs: ["SKILL.md", "evidence:0#taskPrompt"],
          dependsOn: [],
          inputs: ["JSON input path"],
          outputs: ["JSON output path"],
          preconditions: ["Node.js is available"],
          changedPaths: ["SKILL.md", "scripts/convert.mjs"],
          residualDuties: ["The agent decides whether the task fits the bounded conversion."],
          verification: ["Compare produced bytes with the observed reference output."],
          validation: {
            help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
            cases: [{
              id: "observed",
              evidenceId: "0",
              inputSource: "task-fixtures",
              inputFiles: ["inputs/input.json"],
              args: ["--input", "inputs/input.json", "--out", "out/result.json"],
              expectedFiles: [{ path: "out/result.json", referencePath: "reference/result.json" }],
              basis: "reference-output",
              sourceRefs: ["evidence:0#workdir/reference/result.json"],
            }],
          },
        }],
      }
      if (config.recordDir) {
        await mkdir(config.recordDir, { recursive: true })
        await writeFile(path.join(config.recordDir, "submission.json"), `${JSON.stringify(submission, null, 2)}\n`)
      }
      return {
        changed: true,
        workspaceDir,
        submission,
        actualChangedFiles: ["SKILL.md", "scripts/convert.mjs"],
        cost: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }
    }

    const proposal = await createProposal({
      skillName: `production-closure-${Date.now()}`,
      skillDir,
      harness: "pi",
      optimizerModel: "test/optimizer",
      targetModel: "test/target",
      source: `log:${logPath}`,
    })
    proposalDirs.push(proposal.dir)
    const result = await runLoop({
      skillDir,
      optimizer: { model: "test/optimizer" },
      taskSource: { kind: "execution-log", logs: [{ path: logPath, recordLocators: ["line:1"] }] },
      targetAdapter: { model: "test/target", harness: "pi" },
      delivery: { keepAllRounds: true, autoApply: false },
      evalProvider: {
        name: "unused-test-provider",
        complete: async () => { throw new Error("log-only flow must not call the eval provider") },
        completeWithToolResults: async () => { throw new Error("log-only flow must not call the eval provider") },
      },
    }, { proposal })

    const report = JSON.parse(await readFile(path.join(proposal.dir, "round-1-validation", "report.json"), "utf8"))
    expect(result.bestRound).toBe(1)
    expect(result.validation?.status).toBe("passed")
    expect(report.execution.programRuns).toBe(1)
    expect(report.execution.caseRuns).toBe(1)
    expect(report.resolution).toEqual(expect.objectContaining({
      status: "passed",
      retainedActionIds: ["generate-converter"],
      unvalidatedActionIds: [],
    }))
    expect(report.actions[0]).toEqual(expect.objectContaining({
      actionId: "generate-converter",
      planStatus: "ready",
      independentCaseIds: ["observed"],
      programStatus: "passed",
    }))

    const history = JSON.parse(await readFile(path.join(proposal.dir, "history.json"), "utf8"))
    expect(history.entries[0].validation).toEqual(expect.objectContaining({
      status: "passed",
      reportPath: "round-1-validation/report.json",
    }))
    const exported = await buildOptimizedSkillPackage({ proposalDir: proposal.dir, packageDir })
    expect(exported.status).toBe("exported")
    expect(await readFile(path.join(packageDir, "scripts", "convert.mjs"), "utf8")).toContain("toUpperCase")
  })

  test("repairs only the failed independent action once and reuses the passed observation", async () => {
    const scenario = await repairScenario({ sharedFailureGroup: false, repairSucceeds: true })

    expect(scenario.calls).toBe(2)
    expect(scenario.result.bestRound).toBe(1)
    expect(scenario.result.validation?.status).toBe("passed")
    expect(scenario.report.repair).toEqual(expect.objectContaining({ attempted: true, attemptCount: 1 }))
    expect(scenario.report.repair.feedback).toEqual([
      expect.objectContaining({ actionId: "a", relevantFiles: ["scripts/a.mjs"] }),
    ])
    expect(scenario.repairFeedback).toEqual([
      expect.objectContaining({ actionIds: ["a"] }),
    ])
    expect(scenario.report.actions.find((item: { actionId: string }) => item.actionId === "b"))
      .toEqual(expect.objectContaining({ validationSource: "reused-initial-observation" }))
    expect(await readFile(path.join(scenario.proposal.dir, "round-1-validation", "initial-report.json"), "utf8"))
      .toContain("digest mismatch")
    expect(await readFile(path.join(scenario.packageDir, "scripts", "a.mjs"), "utf8")).toContain("\\\"A\\\"")
    expect(await readFile(path.join(scenario.packageDir, "scripts", "b.mjs"), "utf8")).toContain("\\\"B\\\"")
  })

  test("rolls back a still-failing shared group while retaining an independent passed action", async () => {
    const scenario = await repairScenario({ sharedFailureGroup: true, repairSucceeds: false })

    expect(scenario.calls).toBe(2)
    expect(scenario.result.bestRound).toBe(1)
    expect(scenario.report.rollback).toEqual(expect.objectContaining({
      actionIds: ["a", "b"],
      changedPaths: ["SKILL.md", "scripts/a.mjs", "scripts/b.mjs"],
    }))
    expect(scenario.report.resolution).toEqual(expect.objectContaining({
      status: "passed",
      retainedActionIds: ["c"],
      rejected: [],
    }))
    expect(await readFile(path.join(scenario.packageDir, "SKILL.md"), "utf8")).toBe(scenario.baselineSkill)
    expect(Bun.file(path.join(scenario.packageDir, "scripts", "a.mjs")).size).toBe(0)
    expect(Bun.file(path.join(scenario.packageDir, "scripts", "b.mjs")).size).toBe(0)
    expect(await readFile(path.join(scenario.packageDir, "scripts", "c.mjs"), "utf8")).toContain("\\\"C\\\"")
  })
})
