import { afterEach, describe, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  compileExperimentalDesignArtifact,
  loadExperimentalDesignArtifactCompilerInput,
  type ExperimentalDesignArtifactCompilerInput,
} from "./experimental-design-artifact-compiler.ts"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog.ts"
import { sha256Bytes } from "./source-fixture.ts"

const rootDir = process.cwd()
const pilotDir = "benchmarks/skill-ir/pilots/experimental-design"
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

async function packageText(root: string): Promise<string> {
  const files: string[] = []
  const walk = async (current = "") => {
    for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
      const relativePath = current ? `${current}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(relativePath)
      else files.push(relativePath)
    }
  }
  await walk()
  return (await Promise.all(files.sort().map(async (relativePath) =>
    `${relativePath}\n${await readFile(join(root, relativePath), "utf8")}`
  ))).join("\n---FILE---\n")
}

describe("experimental-design validated artifact compiler", () => {
  test("reuses the skill-neutral catalog and execution runtime", async () => {
    const outDir = await tempDir("experimental-design-artifact-")
    const input = await loadExperimentalDesignArtifactCompilerInput(rootDir)
    await compileExperimentalDesignArtifact(input, outDir)
    const validated = await validateValidatedArtifactPackage(outDir)

    expect(validated.manifest.catalog).toBe("validated-skill-artifact/v1")
    expect(validated.manifest.skillId).toBe("experimental-design")
    expect(validated.manifest.protectedInputs).toEqual(["study.json"])
    expect(validated.manifest.generatedOutputs).toEqual([
      "design/design-plan.json",
      "design/allocation.csv",
      "design/design-report.md",
    ])
    expect(validated.executionPlan.nodes.map((node) => node.kind)).toEqual(["process", "validate"])
    expect(validated.manifest.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["script", "check", "schema", "template", "tool-plan", "skill-ir"]),
    )

    for (const corePath of [
      "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
      "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
    ]) {
      expect(await readFile(join(rootDir, corePath), "utf8")).not.toContain("experimental-design")
    }
  })

  test("is byte-for-byte reproducible and excludes forbidden evidence canaries", async () => {
    const first = await tempDir("experimental-design-first-")
    const second = await tempDir("experimental-design-second-")
    const input = await loadExperimentalDesignArtifactCompilerInput(rootDir)
    const poisoned = {
      ...input,
      taskContract: {
        ...input.taskContract,
        evaluatorPayload: "EVALUATOR_CANARY_73091",
        heldOutPrompt: "HELDOUT_CANARY_73091",
        runtimeOutput: "RUNTIME_CANARY_73091",
        lawFailure: "LAW_FAILURE_CANARY_73091",
        secret: "SECRET_CANARY_73091",
      },
    } as ExperimentalDesignArtifactCompilerInput

    await compileExperimentalDesignArtifact(poisoned, first)
    await compileExperimentalDesignArtifact(poisoned, second)
    const text = await packageText(first)
    expect(text).toBe(await packageText(second))
    for (const canary of [
      "EVALUATOR_CANARY_73091",
      "HELDOUT_CANARY_73091",
      "RUNTIME_CANARY_73091",
      "LAW_FAILURE_CANARY_73091",
      "SECRET_CANARY_73091",
    ]) {
      expect(text).not.toContain(canary)
    }
  })

  test("rejects non-development task contracts", async () => {
    const outDir = await tempDir("experimental-design-heldout-")
    const input = await loadExperimentalDesignArtifactCompilerInput(rootDir)
    await expect(compileExperimentalDesignArtifact({
      ...input,
      taskContract: {
        tasks: [{
          id: "experimental-design-sequential-heldout-001",
          prompt: "held-out is forbidden",
        }],
      },
    }, outDir)).rejects.toThrow()
  })

  test("reverse evidence removal prevents compilation", async () => {
    const fixtureRoot = await tempDir("experimental-design-source-")
    await cp(join(rootDir, pilotDir), join(fixtureRoot, pilotDir), { recursive: true })
    const sourcePath = join(fixtureRoot, pilotDir, "source/SKILL.md")
    const changed = (await readFile(sourcePath, "utf8"))
      .replace("Everything is seeded", "Schedules may be generated")
    await writeFile(sourcePath, changed, "utf8")

    const input = await loadExperimentalDesignArtifactCompilerInput(fixtureRoot)
    input.sourceFiles = await Promise.all(input.sourceFiles.map(async (record) => ({
      path: record.path,
      sha256: sha256Bytes(await readFile(join(fixtureRoot, record.path))),
    })))
    const auditPath = join(fixtureRoot, input.sourceAudit.path)
    const audit = JSON.parse(await readFile(auditPath, "utf8")) as {
      sources: Array<{ path: string; sha256: string }>
    }
    audit.sources.find((source) => source.path.endsWith("/SKILL.md"))!.sha256 =
      input.sourceFiles.find((source) => source.path.endsWith("/SKILL.md"))!.sha256
    await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8")
    input.sourceAudit.sha256 = sha256Bytes(await readFile(auditPath))

    await expect(compileExperimentalDesignArtifact(
      input,
      await tempDir("experimental-design-reverse-"),
    )).rejects.toThrow(/seeded allocation evidence/i)
  })
})
