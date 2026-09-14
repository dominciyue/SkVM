import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  resolveActionValidation,
  validateOptimizationProgram,
} from "../../src/jit-optimize/package-validation.ts"
import type { ImplementationSelection } from "../../src/jit-optimize/implementations.ts"
import type { OptimizationAction } from "../../src/jit-optimize/types.ts"

const dirs: string[] = []

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("validateOptimizationProgram", () => {
  test("compares JSON references by value without imposing serialization or object key order", async () => {
    const packageDir = await tempDir("validation-json-reference-")
    const cwd = await tempDir("validation-json-output-")
    await writeFile(path.join(packageDir, "write.mjs"), `
import { writeFileSync } from "node:fs";
writeFileSync("out.json", process.argv[2]);
`)
    const reference = '{"a":1,"b":null,"items":["one","two"]}'
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "json-reference", kind: "generate-script", status: "selected",
        entry: "write.mjs", runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      cases: [
        '{\n "items": ["one", "two"], "b": null, "a": 1.0\n}\n',
        '{"a":2,"b":null,"items":["one","two"]}',
        '{"a":"1","b":null,"items":["one","two"]}',
        '{"a":1,"b":null,"items":["two","one"]}',
        '{"a":1,"items":["one","two"]}',
        'not-json',
      ].map((output, index) => ({
        id: `json-${index}`, cwd, args: [output], expectedFiles: ["out.json"],
        expectedFileSha256: { "out.json": new Bun.CryptoHasher("sha256").update(reference).digest("hex") },
        expectedFileJson: { "out.json": JSON.parse(reference) },
      })),
    })
    expect(result.cases.map((item) => item.status)).toEqual([
      "passed", "failed", "failed", "failed", "failed", "failed",
    ])
  })

  test("executes a long validation cwd without changing inputs or losing failed assertions", async () => {
    const packageDir = await tempDir("validation-long-cwd-")
    let workDir = path.join(packageDir, "cases")
    while (workDir.length < 300) workDir = path.join(workDir, "nested-validation")
    await mkdir(workDir, { recursive: true })
    await writeFile(path.join(workDir, "input.txt"), "original")
    await writeFile(path.join(packageDir, "process.mjs"), `
import { readFileSync, writeFileSync } from "node:fs";
writeFileSync("out.txt", readFileSync("input.txt"));
`)
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "long-cwd", kind: "generate-script", status: "selected",
        entry: "process.mjs", runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      cases: [
        { id: "success", cwd: workDir, args: [], expectedFiles: ["out.txt"] },
        {
          id: "wrong-output", cwd: workDir, args: [], expectedFiles: ["out.txt"],
          expectedFileSha256: { "out.txt": new Bun.CryptoHasher("sha256").update("different").digest("hex") },
        },
      ],
    })
    expect(result.cases.map((item) => item.exitCode)).toEqual([0, 0])
    expect(result.cases.map((item) => item.status)).toEqual(["passed", "failed"])
    expect(result.cases[1]?.failureKind).toBe("result-mismatch")
    expect(await readFile(path.join(workDir, "input.txt"), "utf8")).toBe("original")
    expect(await readFile(path.join(workDir, "out.txt"), "utf8")).toBe("original")
    expect(result.cases[0]?.cwd).toBe(workDir)
    if (process.platform === "win32") {
      for (const item of result.cases) {
        expect(item.executionCwd).toBeDefined()
        expect(item.executionCwd!.length).toBeLessThan(260)
        expect(await Bun.file(path.join(item.executionCwd!, "input.txt")).exists()).toBe(false)
      }
    }
  })

  test("runs help, changed inputs, a legal empty input, and an explicit missing-resource error", async () => {
    const packageDir = await tempDir("package-validation-skill-")
    const firstWorkDir = await tempDir("package-validation-first-")
    const secondWorkDir = await tempDir("package-validation-second-")
    const emptyWorkDir = await tempDir("package-validation-empty-")
    const missingWorkDir = await tempDir("package-validation-missing-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "project.mjs"), `
import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log("Usage: project --input <path> --out <path>"); process.exit(0); }
const inputAt = args.indexOf("--input");
const outAt = args.indexOf("--out");
if (inputAt < 0 || outAt < 0) { console.error("error: --input and --out are required"); process.exit(2); }
try {
  const values = JSON.parse(await readFile(args[inputAt + 1], "utf8"));
  await writeFile(args[outAt + 1], JSON.stringify({ values, count: values.length }));
  console.log(JSON.stringify({ status: "success", output: args[outAt + 1], count: values.length }));
} catch (error) {
  console.error("error: required input unavailable: " + error.message);
  process.exit(3);
}
`)
    await writeFile(path.join(firstWorkDir, "input.json"), JSON.stringify(["alpha"]))
    await writeFile(path.join(secondWorkDir, "input.json"), JSON.stringify(["beta", "gamma"]))
    await writeFile(path.join(emptyWorkDir, "input.json"), "[]")
    const implementation: ImplementationSelection = {
      actionId: "generated",
      kind: "generate-script",
      status: "selected",
      entry: "scripts/project.mjs",
      runtime: "node",
      inputs: ["input file"],
      outputs: ["out.json"],
      preconditions: [],
      residualDuties: [],
      verification: ["changed input changes output"],
    }

    const result = await validateOptimizationProgram({
      packageDir,
      implementation,
      help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
      cases: [
        { id: "first", cwd: firstWorkDir, args: ["--input", "input.json", "--out", "out.json"], expectedExitCode: 0, expectedFiles: ["out.json"] },
        { id: "second", cwd: secondWorkDir, args: ["--input", "input.json", "--out", "out.json"], expectedExitCode: 0, expectedFiles: ["out.json"] },
        { id: "empty", cwd: emptyWorkDir, args: ["--input", "input.json", "--out", "out.json"], expectedExitCode: 0, expectedFiles: ["out.json"] },
        { id: "missing", cwd: missingWorkDir, args: ["--input", "missing.json", "--out", "out.json"], expectedExitCode: 3, stderrIncludes: ["required input unavailable"] },
      ],
    })

    expect(result.status).toBe("passed")
    expect(result.help?.status).toBe("passed")
    expect(result.help?.command[0]).toBe(Bun.which("node") ?? process.execPath)
    expect(result.cases.map((item) => item.status)).toEqual(["passed", "passed", "passed", "passed"])
    expect(await readFile(path.join(firstWorkDir, "out.json"), "utf8"))
      .not.toBe(await readFile(path.join(secondWorkDir, "out.json"), "utf8"))
    expect(JSON.parse(await readFile(path.join(emptyWorkDir, "out.json"), "utf8"))).toEqual({ values: [], count: 0 })
    expect(result.cases[3]?.exitCode).toBe(3)
  })

  test("fails closed when the declared entry escapes the package root", async () => {
    const packageDir = await tempDir("package-validation-root-")
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "escape",
        kind: "generate-script",
        status: "selected",
        entry: "../outside.mjs",
        runtime: "node",
        inputs: [],
        outputs: [],
        preconditions: [],
        residualDuties: [],
        verification: [],
      },
      cases: [],
    })

    expect(result.status).toBe("failed")
    expect(result.failureKind).toBe("entry-unclear")
    expect(result.nextAction).toContain("entry")
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "entry-outside-package" }))
  })

  test("classifies an unexpected required-argument exit separately from a result mismatch", async () => {
    const packageDir = await tempDir("package-validation-classification-")
    const workDir = await tempDir("package-validation-classification-work-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "args.mjs"), `
if (process.argv.includes("--fail-args")) { console.error("usage: args --input; required argument missing"); process.exit(2); }
console.log("completed without expected marker");
`)
    const implementation: ImplementationSelection = {
      actionId: "classified",
      kind: "generate-script",
      status: "selected",
      entry: "scripts/args.mjs",
      runtime: "node",
      inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
    }
    const missingParameter = await validateOptimizationProgram({
      packageDir,
      implementation,
      cases: [{ id: "args", cwd: workDir, args: ["--fail-args"], expectedExitCode: 0 }],
    })
    const resultMismatch = await validateOptimizationProgram({
      packageDir,
      implementation,
      cases: [{ id: "result", cwd: workDir, args: [], stdoutIncludes: ["required-result-marker"] }],
    })
    expect(missingParameter.failureKind).toBe("parameter-missing")
    expect(missingParameter.nextAction).toContain("required input or parameter")
    expect(resultMismatch.failureKind).toBe("result-mismatch")
    expect(resultMismatch.nextAction).toContain("expected result")
  })

  test("gives a dependency-specific next action without installing globally", async () => {
    const packageDir = await tempDir("package-validation-dependency-")
    const workDir = await tempDir("package-validation-dependency-work-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "dependency.mjs"), `import "skvm-package-that-does-not-exist";\n`)
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "dependency",
        kind: "generate-script",
        status: "selected",
        entry: "scripts/dependency.mjs",
        runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      cases: [{ id: "dependency", cwd: workDir, args: [], expectedExitCode: 0 }],
    })

    expect(result.failureKind).toBe("environment-not-reconstructable")
    expect(result.nextAction).toContain("isolated environment")
    expect(result.nextAction).not.toContain("global")
  })

  test("rejects output bytes that differ from an engine-derived reference digest", async () => {
    const packageDir = await tempDir("package-validation-reference-")
    const workDir = await tempDir("package-validation-reference-work-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "wrong.mjs"), `
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("out", { recursive: true });
await writeFile("out/result.json", "wrong");
`)
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "reference",
        kind: "generate-script",
        status: "selected",
        entry: "scripts/wrong.mjs",
        runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      cases: [{
        id: "reference",
        cwd: workDir,
        args: [],
        expectedFiles: ["out/result.json"],
        expectedFileSha256: { "out/result.json": new Bun.CryptoHasher("sha256").update("expected").digest("hex") },
      }],
    })

    expect(result.status).toBe("failed")
    expect(result.failureKind).toBe("result-mismatch")
    expect(result.cases[0]?.diagnostics).toContainEqual(expect.stringContaining("digest mismatch"))
  })

  test("reports an unavailable variation cwd with a stable environment diagnostic", async () => {
    const packageDir = await tempDir("package-validation-cwd-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "noop.mjs"), "console.log('ok')\n")
    const missingCwd = path.join(packageDir, "cases", "does-not-exist")
    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "cwd",
        kind: "reuse-script",
        status: "selected",
        entry: "scripts/noop.mjs",
        runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      cases: [{ id: "missing-cwd", cwd: missingCwd, args: [] }],
    })

    expect(result.status).toBe("failed")
    expect(result.failureKind).toBe("environment-not-reconstructable")
    expect(result.cases[0]?.diagnostics).toEqual([
      `variation cwd is unavailable: ${path.resolve(missingCwd)}`,
    ])
  })
})

function action(id: string, changedPaths: string[], dependsOn: string[] = []): OptimizationAction {
  return {
    id,
    kind: "generate-script",
    evidenceIds: ["0"],
    sourceRefs: [],
    dependsOn,
    inputs: [],
    outputs: [],
    preconditions: [],
    changedPaths,
    residualDuties: [],
    verification: [],
  }
}

describe("resolveActionValidation", () => {
  test("retains a validated independent action while rejecting a failed action and its dependants", () => {
    const result = resolveActionValidation({
      actions: [
        action("good", ["docs/good.md"]),
        action("bad", ["scripts/bad.mjs"]),
        action("depends-on-bad", ["docs/dependent.md"], ["bad"]),
      ],
      observations: [
        { actionId: "good", status: "passed", diagnostics: [] },
        { actionId: "bad", status: "failed", failureKind: "script-execution-error", diagnostics: ["exit 1"] },
        { actionId: "depends-on-bad", status: "passed", diagnostics: [] },
      ],
    })

    expect(result.status).toBe("partial")
    expect(result.retainedActionIds).toEqual(["good"])
    expect(result.rejected.map((item) => item.actionId)).toEqual(["bad", "depends-on-bad"])
    expect(result.feedback).toEqual([
      expect.objectContaining({ actionId: "bad", failureKind: "script-execution-error", relevantFiles: ["scripts/bad.mjs"] }),
      expect.objectContaining({ actionId: "depends-on-bad", failureKind: "dependency-rejected", relevantFiles: ["docs/dependent.md"] }),
    ])
  })

  test("rejects a whole shared-file group instead of attempting a half-file rollback", () => {
    const result = resolveActionValidation({
      actions: [
        action("shared-good", ["SKILL.md", "docs/one.md"]),
        action("shared-bad", ["SKILL.md", "scripts/two.mjs"]),
        action("independent", ["references/keep.md"]),
      ],
      observations: [
        { actionId: "shared-good", status: "passed", diagnostics: [] },
        { actionId: "shared-bad", status: "failed", failureKind: "result-mismatch", diagnostics: ["wrong output"] },
        { actionId: "independent", status: "passed", diagnostics: [] },
      ],
    })

    expect(result.status).toBe("partial")
    expect(result.retainedActionIds).toEqual(["independent"])
    expect(result.rollbackGroups).toContainEqual({
      actionIds: ["shared-bad", "shared-good"],
      changedPaths: ["SKILL.md", "docs/one.md", "scripts/two.mjs"],
      reason: "shared-files-with-rejected-action",
    })
  })

  test("keeps validation not-run distinct from passed", () => {
    const result = resolveActionValidation({
      actions: [action("unvalidated", ["scripts/new.mjs"])],
      observations: [{ actionId: "unvalidated", status: "not-run", diagnostics: ["no reconstructable case"] }],
    })
    expect(result.status).toBe("not-run")
    expect(result.retainedActionIds).toEqual([])
    expect(result.unvalidatedActionIds).toEqual(["unvalidated"])
  })

  test("pending dependency prevents downstream validation promotion", () => {
    const result = resolveActionValidation({
      actions: [action("A", ["scripts/a.mjs"]), action("B", ["docs/b.md"], ["A"])],
      observations: [
        { actionId: "A", status: "not-run", diagnostics: ["missing input"] },
        { actionId: "B", status: "passed", diagnostics: [] },
      ],
    })
    expect(result.retainedActionIds).toEqual([])
    expect(result.unvalidatedActionIds).toEqual(["A", "B"])
    expect(result.rejected).toEqual([])
  })

  test("pending state propagates through transitive dependencies without becoming a failure", () => {
    const result = resolveActionValidation({
      actions: [
        action("A", ["scripts/a.mjs"]),
        action("B", ["docs/b.md"], ["A"]),
        action("C", ["docs/c.md"], ["B"]),
        action("independent", ["docs/independent.md"]),
      ],
      observations: [
        { actionId: "A", status: "not-run", diagnostics: ["runtime unavailable"] },
        { actionId: "B", status: "passed", diagnostics: [] },
        { actionId: "C", status: "passed", diagnostics: [] },
        { actionId: "independent", status: "passed", diagnostics: [] },
      ],
    })

    expect(result.retainedActionIds).toEqual(["independent"])
    expect(result.unvalidatedActionIds).toEqual(["A", "B", "C"])
    expect(result.rejected).toEqual([])
    expect(result.status).toBe("partial")
  })

  test("pending shared-file change keeps the whole group unvalidated", () => {
    const result = resolveActionValidation({
      actions: [
        action("shared-pending", ["SKILL.md", "scripts/a.mjs"]),
        action("shared-observed", ["SKILL.md", "docs/b.md"]),
        action("independent", ["references/keep.md"]),
      ],
      observations: [
        { actionId: "shared-pending", status: "not-run", diagnostics: ["missing input"] },
        { actionId: "shared-observed", status: "passed", diagnostics: [] },
        { actionId: "independent", status: "passed", diagnostics: [] },
      ],
    })

    expect(result.retainedActionIds).toEqual(["independent"])
    expect(result.unvalidatedActionIds).toEqual(["shared-pending", "shared-observed"])
    expect(result.rejected).toEqual([])
    expect(result.rollbackGroups).toEqual([])
  })
})

describe("validation promotion guards", () => {
  test("help-only execution is not promoted to behavior passed", async () => {
    const packageDir = await tempDir("package-validation-help-only-")
    await mkdir(path.join(packageDir, "scripts"))
    await writeFile(path.join(packageDir, "scripts", "help.mjs"), `
if (process.argv.includes("--help")) { console.log("Usage: help"); process.exit(0); }
`)

    const result = await validateOptimizationProgram({
      packageDir,
      implementation: {
        actionId: "help-only",
        kind: "generate-script",
        status: "selected",
        entry: "scripts/help.mjs",
        runtime: "node",
        inputs: [], outputs: [], preconditions: [], residualDuties: [], verification: [],
      },
      help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
      cases: [],
    })

    expect(result.help?.status).toBe("passed")
    expect(result.status).toBe("not-applicable")
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "validation-cases-missing" }))
  })
})
