import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { experimentalDesignGrade } from "../../bench/evaluators/experimental-design-grade.ts"
import {
  compileExperimentalDesignArtifact,
  loadExperimentalDesignArtifactCompilerInput,
} from "./experimental-design-artifact-compiler.ts"
import { ResourceContractSchema, runResourceProbe } from "./resource-contract.ts"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog.ts"
import { runValidatedArtifactPlan } from "./validated-artifact-runtime.ts"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

type Task = {
  id: string
  split: "development" | "held-out"
  fixtures: Record<string, string>
  eval: Array<{
    method: "custom"
    id: string
    name: string
    weight: number
    evaluatorId: string
    payload: unknown
  }>
  hardGateIds: string[]
  passThreshold: number
}

async function scoreTask(task: Task, workDir: string) {
  const criteria = await Promise.all(task.eval.map(async (criterion) => ({
    criterion,
    result: await experimentalDesignGrade.run({
      criterion,
      runResult: { workDir },
    } as never),
  })))
  const score = criteria.reduce(
    (sum, row) => sum + row.criterion.weight * row.result.score,
    0,
  )
  const hardGateFailures = criteria
    .filter((row) => task.hardGateIds.includes(row.criterion.id) && !row.result.pass)
    .map((row) => row.criterion.id)
  return {
    score,
    success: score >= task.passThreshold && hardGateFailures.length === 0,
    hardGateFailures,
  }
}

async function fixtureWorkDir(task: Task): Promise<string> {
  const workDir = await tempDir(`experimental-design-${task.id}-`)
  for (const [relativePath, content] of Object.entries(task.fixtures)) {
    await writeFile(join(workDir, relativePath), content, "utf8")
  }
  return workDir
}

describe("experimental-design validated artifact activation", () => {
  test.skipIf(!process.env.SKVM_PYTHON)(
    "executes both development phenotypes through the generic runtime and scorer",
    async () => {
      const rootDir = process.cwd()
      const packageDir = await tempDir("experimental-design-package-")
      await compileExperimentalDesignArtifact(
        await loadExperimentalDesignArtifactCompilerInput(rootDir),
        packageDir,
      )
      const packageRecord = await validateValidatedArtifactPackage(packageDir)
      const resource = ResourceContractSchema.parse(JSON.parse(await readFile(
        join(rootDir, "benchmarks/skill-ir/pilots/experimental-design/resource-contract.json"),
        "utf8",
      )))
      expect((await runResourceProbe(resource, {
        env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
      })).status).toBe("ok")

      const registry = JSON.parse(await readFile(
        join(rootDir, "benchmarks/skill-ir/pilots/experimental-design/tasks.json"),
        "utf8",
      )) as { tasks: Task[] }
      const development = registry.tasks.filter((task) => task.split === "development")
      expect(development).toHaveLength(2)

      for (const task of development) {
        const workDir = await fixtureWorkDir(task)
        const inputPath = join(workDir, "study.json")
        const beforeDigest = createHash("sha256").update(await readFile(inputPath)).digest("hex")
        expect((await scoreTask(task, workDir)).success).toBe(false)

        const runtime = await runValidatedArtifactPlan({
          package: packageRecord,
          workDir,
          env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
        })
        const after = await scoreTask(task, workDir)

        expect(runtime.status).toBe("complete")
        expect(runtime.validation?.status).toBe("pass")
        expect(runtime.modelGenerationTokens).toBe(0)
        expect(runtime.modelRepairTokens).toBe(0)
        expect(after).toMatchObject({ success: true, hardGateFailures: [] })
        expect(after.score).toBeCloseTo(1, 8)
        expect(createHash("sha256").update(await readFile(inputPath)).digest("hex"))
          .toBe(beforeDigest)
      }
    },
    120_000,
  )

  test.skipIf(!process.env.SKVM_PYTHON)(
    "runtime checker rejects a structurally valid schedule that disagrees with the public seed",
    async () => {
      const rootDir = process.cwd()
      const packageDir = await tempDir("experimental-design-seed-check-")
      await compileExperimentalDesignArtifact(
        await loadExperimentalDesignArtifactCompilerInput(rootDir),
        packageDir,
      )
      const packageRecord = await validateValidatedArtifactPackage(packageDir)
      const registry = JSON.parse(await readFile(
        join(rootDir, "benchmarks/skill-ir/pilots/experimental-design/tasks.json"),
        "utf8",
      )) as { tasks: Task[] }
      const task = registry.tasks.find((candidate) =>
        candidate.id === "experimental-design-stratified-dev-001"
      )!
      const workDir = await fixtureWorkDir(task)
      expect((await runValidatedArtifactPlan({
        package: packageRecord,
        workDir,
        env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
      })).status).toBe("complete")

      const allocationPath = join(workDir, "design/allocation.csv")
      const lines = (await readFile(allocationPath, "utf8")).trimEnd().split("\n")
      const first = lines[1]!.split(",")
      const second = lines[2]!.split(",")
      ;[first[3], second[3]] = [second[3]!, first[3]!]
      lines[1] = first.join(",")
      lines[2] = second.join(",")
      await writeFile(allocationPath, `${lines.join("\n")}\n`, "utf8")

      const checker = packageRecord.manifest.artifacts.find(
        (artifact) => artifact.id === "design-checker",
      )!
      const checkerProcess = Bun.spawn([
        process.env.SKVM_PYTHON!,
        join(packageDir, checker.path),
        "--workdir",
        workDir,
      ], { stdout: "pipe", stderr: "pipe" })
      const [exitCode, stdout] = await Promise.all([
        checkerProcess.exited,
        new Response(checkerProcess.stdout).text(),
        new Response(checkerProcess.stderr).text(),
      ])
      expect(exitCode).toBe(0)
      expect(JSON.parse(stdout)).toMatchObject({
        status: "fail",
        errors: [{ code: "ALLOCATION_SEED_MISMATCH" }],
      })
    },
    120_000,
  )
})
