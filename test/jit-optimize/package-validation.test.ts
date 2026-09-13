import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { validateOptimizationProgram } from "../../src/jit-optimize/package-validation.ts"
import type { ImplementationSelection } from "../../src/jit-optimize/implementations.ts"

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
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "entry-outside-package" }))
  })
})
