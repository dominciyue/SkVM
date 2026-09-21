import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const exampleRoot = path.join(repositoryRoot, "examples", "authorization-assessment")
const resultRoot = path.join(
  repositoryRoot,
  "results",
  "skill-ir",
  "skill-dsl-research",
  "development",
  "authorization-capability-v1",
)
const cleanupRoots: string[] = []

interface ExampleAssessment {
  schemaVersion: "authorization-assessment-input/v1"
  sourceIdentity: { repository: string; sourceRef: string }
  sourceRoot: string
  sources: string[]
  task: AuthorizationTaskV0
}

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

describe("authorization authoring example", () => {
  it("loads the self-contained example through the ordinary input path", async () => {
    const loaded = await loadLocalAuthorizationInput(path.join(exampleRoot, "assessment.json"))

    expect(loaded.status).toBe("valid")
    if (loaded.status !== "valid") return
    expect(loaded.analysisProfile).toEqual({ id: "authorization-core-v1", origin: "default" })
    expect(loaded.sourceBundle.files.map(file => file.relativePath)).toEqual(["src/record.ts"])
    expect(loaded.analysisPlan.entries).toHaveLength(6)
  })

  it("reproduces two bounded authoring mistakes before a changed task becomes valid", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-authoring-"))
    cleanupRoots.push(root)
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    const originalInput = JSON.parse(
      await readFile(path.join(exampleRoot, "assessment.json"), "utf8"),
    ) as ExampleAssessment
    const originalSource = await readFile(path.join(exampleRoot, "project", "src", "record.ts"), "utf8")
    await writeFile(path.join(root, "project", "src", "record.ts"), originalSource, "utf8")
    const inputPath = path.join(root, "assessment.json")
    const writeAssessment = async (value: ExampleAssessment) => {
      await writeFile(inputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    }

    await writeAssessment(originalInput)
    expect((await loadLocalAuthorizationInput(inputPath)).status).toBe("valid")

    const changed = structuredClone(originalInput)
    changed.task.taskId = "synthetic-record-archive-v2"
    changed.task.request = "Assess the revised record archive entry at the new source revision."
    changed.task.repository = "https://example.test/synthetic/records-v2"
    changed.task.sourceRef = "synthetic-v2"
    changed.task.policySources[0]!.revision = "synthetic-policy-v2"
    await writeAssessment(changed)
    const identityDrift = await loadLocalAuthorizationInput(inputPath)
    expect(identityDrift.status).toBe("invalid")
    if (identityDrift.status === "invalid") {
      expect(identityDrift.diagnostics.map(diagnostic => diagnostic.code)).toEqual(["source-identity-mismatch"])
    }

    changed.sourceIdentity = {
      repository: changed.task.repository,
      sourceRef: changed.task.sourceRef,
    }
    changed.task.entries[0]!.locations[0]!.path = "src/archive-v2.ts"
    await writeAssessment(changed)
    const staleSourceList = await loadLocalAuthorizationInput(inputPath)
    expect(staleSourceList.status).toBe("invalid")
    if (staleSourceList.status === "invalid") {
      expect(staleSourceList.diagnostics.map(diagnostic => diagnostic.code)).toEqual([
        "declaration-source-location-invalid",
      ])
    }

    await writeFile(path.join(root, "project", "src", "archive-v2.ts"), originalSource, "utf8")
    changed.sources = ["src/archive-v2.ts"]
    await writeAssessment(changed)
    expect((await loadLocalAuthorizationInput(inputPath)).status).toBe("valid")
  })

  it("keeps two independent source skills, their mapped slice, and their residual duties distinct", async () => {
    const artifact = JSON.parse(
      await readFile(path.join(resultRoot, "skill-responsibility-mappings-v1.json"), "utf8"),
    ) as {
      schemaVersion: string
      method: { mappingMode: string; wholeSkillConversionClaimed: boolean }
      sourceSkills: Array<{
        sourceId: string
        family: string
        commit: string
        declarationMappings: unknown[]
        analysisRequirementMappings: unknown[]
        retainedResponsibilities: string[]
      }>
      counting: { independentSkillSources: number; targetCodeProjects: number }
    }

    expect(artifact.schemaVersion).toBe("authorization-skill-responsibility-mapping/v1")
    expect(artifact.method).toEqual(expect.objectContaining({
      mappingMode: "human-agent-assisted",
      wholeSkillConversionClaimed: false,
    }))
    expect(artifact.sourceSkills).toHaveLength(2)
    expect(new Set(artifact.sourceSkills.map(source => source.sourceId)).size).toBe(2)
    expect(new Set(artifact.sourceSkills.map(source => source.family)).size).toBe(2)
    for (const source of artifact.sourceSkills) {
      expect(source.commit).not.toBe("")
      expect(source.declarationMappings.length).toBeGreaterThan(0)
      expect(source.analysisRequirementMappings.length).toBeGreaterThan(0)
      expect(source.retainedResponsibilities.length).toBeGreaterThan(0)
    }
    expect(artifact.counting).toEqual({ independentSkillSources: 2, targetCodeProjects: 2 })
  })
})
