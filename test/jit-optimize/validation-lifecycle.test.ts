import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  deriveProgramValidationPlan,
  runOptimizationValidationLifecycle,
} from "../../src/jit-optimize/validation-lifecycle.ts"
import type { ImplementationSelection } from "../../src/jit-optimize/implementations.ts"
import type { Evidence, OptimizationAction } from "../../src/jit-optimize/types.ts"

const dirs: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function implementation(actionId: string): ImplementationSelection {
  return {
    actionId,
    kind: "generate-script",
    status: "selected",
    entry: "scripts/convert.mjs",
    runtime: "node",
    inputs: ["task fixture"],
    outputs: ["result"],
    preconditions: [],
    residualDuties: [],
    verification: ["compare with the observed reference output"],
  }
}

async function evidenceWithFixture(options: {
  taskId: string
  inputPath: string
  input: string
  referencePath: string
  reference: string
}): Promise<Evidence> {
  const root = await tempDir("validation-lifecycle-evidence-")
  const taskPath = path.join(root, "task.json")
  await writeFile(taskPath, JSON.stringify({
    id: options.taskId,
    fixtures: { [options.inputPath]: options.input },
  }))
  return {
    taskId: options.taskId,
    taskPrompt: `Convert ${options.inputPath}`,
    conversationLog: [],
    criteria: [{
      id: "reference-output",
      method: "file-check",
      description: "Output must match the independently observed reference bytes.",
      weight: 1,
      score: 1,
      passed: true,
    }],
    workDirSnapshot: { files: new Map([[options.referencePath, options.reference]]) },
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
}

describe("deriveProgramValidationPlan", () => {
  test("materializes real task resources and follows changed input paths with reference-bound checks", async () => {
    const validationRoot = await tempDir("validation-lifecycle-root-")
    const evidences = [
      await evidenceWithFixture({
        taskId: "original",
        inputPath: "inputs/original.json",
        input: "{\"value\":\"alpha\"}\n",
        referencePath: "reference/result.json",
        reference: "{\"value\":\"ALPHA\"}\n",
      }),
      await evidenceWithFixture({
        taskId: "variation",
        inputPath: "changed/nested/input.json",
        input: "{\"value\":\"beta\"}\n",
        referencePath: "reference/changed-result.json",
        reference: "{\"value\":\"BETA\"}\n",
      }),
    ]
    const action = {
      id: "generated",
      kind: "generate-script",
      evidenceIds: ["0", "1"],
      sourceRefs: ["SKILL.md#workflow"],
      dependsOn: [],
      inputs: ["task fixture"],
      outputs: ["result"],
      preconditions: [],
      changedPaths: ["scripts/convert.mjs"],
      residualDuties: [],
      verification: ["reference outputs"],
      validation: {
        help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
        cases: [
          {
            id: "original",
            evidenceId: "0",
            inputSource: "task-fixtures",
            inputFiles: ["inputs/original.json"],
            args: ["--input", "inputs/original.json", "--out", "out/result.json"],
            expectedFiles: [{ path: "out/result.json", referencePath: "reference/result.json" }],
            basis: "reference-output",
            sourceRefs: ["evidence:0#criteria/reference-output"],
          },
          {
            id: "variation",
            evidenceId: "1",
            inputSource: "task-fixtures",
            inputFiles: ["changed/nested/input.json"],
            args: ["--input", "changed/nested/input.json", "--out", "out/changed.json"],
            expectedFiles: [{ path: "out/changed.json", referencePath: "reference/changed-result.json" }],
            basis: "reference-output",
            sourceRefs: ["evidence:1#criteria/reference-output"],
          },
        ],
      },
    } as unknown as OptimizationAction

    const plan = await deriveProgramValidationPlan({
      action,
      implementation: implementation(action.id),
      evidences,
      validationRoot,
    })

    expect(plan.status).toBe("ready")
    expect(plan.cases.map((item) => item.args)).toEqual([
      ["--input", "inputs/original.json", "--out", "out/result.json"],
      ["--input", "changed/nested/input.json", "--out", "out/changed.json"],
    ])
    expect(await readFile(path.join(plan.cases[0]!.cwd, "inputs/original.json"), "utf8"))
      .toBe("{\"value\":\"alpha\"}\n")
    expect(await readFile(path.join(plan.cases[1]!.cwd, "changed/nested/input.json"), "utf8"))
      .toBe("{\"value\":\"beta\"}\n")
    expect(Bun.file(path.join(plan.cases[0]!.cwd, "out/result.json")).size).toBe(0)
    expect(plan.cases[0]!.expectedFileSha256?.["out/result.json"]).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.cases[1]!.expectedFileSha256?.["out/changed.json"]).not
      .toBe(plan.cases[0]!.expectedFileSha256?.["out/result.json"])
    expect(plan.independentCaseIds).toEqual(["original", "variation"])
    expect(plan.diagnostics).toEqual([])
  })

  test("resolves optimizer-workspace evidence locators and rewrites matching command arguments", async () => {
    const validationRoot = await tempDir("validation-lifecycle-projected-locator-")
    const evidence = await evidenceWithFixture({
      taskId: "locale-check",
      inputPath: "unused.json",
      input: "{}\n",
      referencePath: "src/locales/en-US.json",
      reference: "{\"home\":{\"welcome\":\"Welcome\"}}\n",
    })
    evidence.criteria![0]!.id = "locale-integrity"
    evidence.workDirSnapshot = { files: new Map([
      ["src/locales/zh-CN.json", "{\"home\":{\"welcome\":\"欢迎\"}}\n"],
      ["src/locales/en-US.json", "{\"home\":{\"welcome\":\"Welcome\"}}\n"],
    ]) }
    const prefix = ".optimize/tasks/locale-check/run-0-workdir"
    const action = {
      id: "locale-parity",
      kind: "generate-script",
      evidenceIds: ["0"],
      sourceRefs: ["SKILL.md#completeness"],
      dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["scripts/check.py"], residualDuties: [], verification: [],
      validation: {
        cases: [{
          id: "observed-locales",
          evidenceId: "0",
          inputSource: "workdir-snapshot",
          inputFiles: [
            `${prefix}/src/locales/zh-CN.json`,
            `${prefix}/src/locales/en-US.json`,
          ],
          args: [
            "--reference",
            `zh-CN=${prefix}/src/locales/zh-CN.json`,
            "--locale",
            `en-US=${prefix}/src/locales/en-US.json`,
          ],
          expectedFiles: [],
          basis: "task-contract",
          sourceRefs: ["evidence:0#criteria/locale-integrity"],
        }],
      },
    } as unknown as OptimizationAction

    const plan = await deriveProgramValidationPlan({
      action,
      implementation: implementation(action.id),
      evidences: [evidence],
      validationRoot,
    })

    expect(plan.status).toBe("ready")
    expect(plan.cases[0]!.args).toEqual([
      "--reference",
      "zh-CN=src/locales/zh-CN.json",
      "--locale",
      "en-US=src/locales/en-US.json",
    ])
    expect(await readFile(path.join(plan.cases[0]!.cwd, "src/locales/zh-CN.json"), "utf8"))
      .toContain("欢迎")
    expect(await readFile(path.join(plan.cases[0]!.cwd, "src/locales/en-US.json"), "utf8"))
      .toContain("Welcome")
    expect(plan.independentCaseIds).toEqual(["observed-locales"])
    expect(plan.caseEvidence[0]!.independentCriterionIds).toEqual(["locale-integrity"])
    expect(plan.diagnostics).toEqual([])
  })

  test("does not treat a task-contract case with an invented criterion reference as independent", async () => {
    const validationRoot = await tempDir("validation-lifecycle-unbound-contract-")
    const evidence = await evidenceWithFixture({
      taskId: "unbound",
      inputPath: "input.json",
      input: "{}\n",
      referencePath: "output.json",
      reference: "{}\n",
    })
    const action = {
      id: "unbound-contract",
      kind: "generate-script",
      evidenceIds: ["0"], sourceRefs: [], dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["scripts/check.mjs"], residualDuties: [], verification: [],
      validation: { cases: [{
        id: "unbound",
        evidenceId: "0",
        inputSource: "task-fixtures",
        inputFiles: ["input.json"],
        args: ["input.json"],
        expectedFiles: [],
        basis: "task-contract",
        sourceRefs: ["evidence:0#criteria/not-real"],
      }] },
    } as unknown as OptimizationAction

    const plan = await deriveProgramValidationPlan({
      action,
      implementation: implementation(action.id),
      evidences: [evidence],
      validationRoot,
    })

    expect(plan.status).toBe("ready")
    expect(plan.independentCaseIds).toEqual([])
    expect(plan.selfCheckCaseIds).toEqual(["unbound"])
    expect(plan.caseEvidence[0]!.independentCriterionIds).toEqual([])
  })

  test("keeps a missing evidence resource unresolved for this action", async () => {
    const validationRoot = await tempDir("validation-lifecycle-missing-")
    const evidence = await evidenceWithFixture({
      taskId: "missing",
      inputPath: "input.json",
      input: "{}",
      referencePath: "expected.json",
      reference: "{}",
    })
    const action = {
      id: "missing-resource",
      kind: "generate-script",
      evidenceIds: ["0"],
      sourceRefs: [],
      dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["scripts/convert.mjs"], residualDuties: [], verification: [],
      validation: {
        cases: [{
          id: "missing",
          evidenceId: "0",
          inputSource: "task-fixtures",
          inputFiles: ["does-not-exist.json"],
          args: ["--input", "does-not-exist.json"],
          expectedFiles: [],
          basis: "self-check",
          sourceRefs: [],
        }],
      },
    } as unknown as OptimizationAction

    const plan = await deriveProgramValidationPlan({
      action,
      implementation: implementation(action.id),
      evidences: [evidence],
      validationRoot,
    })

    expect(plan.status).toBe("unresolved")
    expect(plan.cases).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "validation-input-missing",
      caseId: "missing",
    }))
  })

  test("legacy actions without validation suggestions remain not-applicable", async () => {
    const action = {
      id: "legacy",
      kind: "generate-script",
      evidenceIds: ["0"], sourceRefs: [], dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["scripts/convert.mjs"], residualDuties: [], verification: [],
    } as OptimizationAction

    const plan = await deriveProgramValidationPlan({
      action,
      implementation: implementation(action.id),
      evidences: [],
      validationRoot: await tempDir("validation-lifecycle-legacy-"),
    })

    expect(plan.status).toBe("not-applicable")
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({ code: "validation-suggestion-missing" }))
  })
})

describe("runOptimizationValidationLifecycle", () => {
  test("retains a selected documentation route only through its independently validated dependency", async () => {
    const proposalDir = await tempDir("validation-lifecycle-proposal-")
    const skillDir = await tempDir("validation-lifecycle-skill-")
    await writeFile(path.join(skillDir, "SKILL.md"), "# Checker\n\nUse the generated checker.\n")
    await writeFile(path.join(skillDir, "check.mjs"), `
import { readFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log("Usage: check <path>"); process.exit(0); }
const value = JSON.parse(await readFile(args[0], "utf8"));
process.stdout.write(JSON.stringify(value) + "\\n");
`)
    const evidence = await evidenceWithFixture({
      taskId: "checked-route",
      inputPath: "input.json",
      input: "{\"value\":\"alpha\"}\n",
      referencePath: "reference.json",
      reference: "{\"value\":\"alpha\"}\n",
    })
    const checker = {
      id: "checker",
      kind: "generate-script",
      evidenceIds: ["0"], sourceRefs: ["SKILL.md"], dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["check.mjs"], residualDuties: [], verification: [],
      validation: {
        help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
        cases: [{
          id: "observed",
          evidenceId: "0",
          inputSource: "task-fixtures",
          inputFiles: ["input.json"],
          args: ["input.json"],
          expectedFiles: [],
          stdoutIncludes: ["alpha"],
          basis: "task-contract",
          sourceRefs: ["evidence:0#criteria/reference-output"],
        }],
      },
    } as OptimizationAction
    const docs = {
      id: "route-docs",
      kind: "restructure-docs",
      evidenceIds: ["0"], sourceRefs: ["SKILL.md"], dependsOn: ["checker"], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["SKILL.md"], residualDuties: [], verification: [],
    } as OptimizationAction

    const result = await runOptimizationValidationLifecycle({
      proposalDir,
      round: 1,
      skillDir,
      actions: [checker, docs],
      evidences: [evidence],
    })

    expect(result.summary.status).toBe("passed")
    expect(result.summary.retainedActionIds).toEqual(["checker", "route-docs"])
    expect(result.report.actions.find((item) => item.actionId === "route-docs")).toMatchObject({
      planStatus: "not-applicable",
      programStatus: "not-run",
    })
  })

  test("leaves a standalone documentation rewrite unvalidated", async () => {
    const proposalDir = await tempDir("validation-lifecycle-docs-proposal-")
    const skillDir = await tempDir("validation-lifecycle-docs-skill-")
    await writeFile(path.join(skillDir, "SKILL.md"), "# Documentation only\n")
    const docs = {
      id: "standalone-docs",
      kind: "restructure-docs",
      evidenceIds: [], sourceRefs: ["SKILL.md"], dependsOn: [], inputs: [], outputs: [], preconditions: [],
      changedPaths: ["SKILL.md"], residualDuties: [], verification: [],
    } as OptimizationAction

    const result = await runOptimizationValidationLifecycle({
      proposalDir,
      round: 1,
      skillDir,
      actions: [docs],
      evidences: [],
    })

    expect(result.summary.status).toBe("not-run")
    expect(result.summary.unvalidatedActionIds).toEqual(["standalone-docs"])
  })
})
