import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  BidsSuccessorArtifactAdapterSchema,
  compileBidsSuccessorValidatedArtifact,
  loadBidsSuccessorArtifactCompilerInput,
} from "./bids-successor-artifact-compiler.ts"
import {
  buildBidsSuccessorArtifactControlFreeze,
  runBidsSuccessorArtifactControls,
  validateBidsSuccessorArtifactControlFreeze,
} from "./bids-successor-artifact-control.ts"
import {
  BidsSuccessorTaskSetSchema,
  deriveBidsSuccessorAuditOracle,
  loadBidsSuccessorSourceRules,
} from "./bids-successor-contract.ts"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog.ts"
import { runValidatedArtifactPlan } from "./validated-artifact-runtime.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const pilotDir = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/successor-v2")
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function temporaryResultDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(rootDir, "results/skill-ir", prefix))
  temporaryDirectories.push(directory)
  return directory
}

describe("BIDS successor deterministic artifact controls", () => {
  test("builds a deterministic successor package without changing the frozen v1 compiler", async () => {
    const adapter = BidsSuccessorArtifactAdapterSchema.parse(JSON.parse(await readFile(
      path.join(pilotDir, "artifact-adapter.json"), "utf8",
    )))
    expect(adapter).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-artifact-adapter/v1",
      adapterId: "bids-successor-source-derived-audit",
      reportSchemaVersion: "skill-ir-bids-audit-report/v2",
    })

    const first = await temporaryDirectory("skvm-bids-successor-artifact-a-")
    const second = await temporaryDirectory("skvm-bids-successor-artifact-b-")
    const input = await loadBidsSuccessorArtifactCompilerInput(rootDir)
    await compileBidsSuccessorValidatedArtifact(input, first)
    await compileBidsSuccessorValidatedArtifact(input, second)
    const [firstPackage, secondPackage, firstManifest, secondManifest] = await Promise.all([
      validateValidatedArtifactPackage(first),
      validateValidatedArtifactPackage(second),
      readFile(path.join(first, "package-manifest.json")),
      readFile(path.join(second, "package-manifest.json")),
    ])
    expect(firstManifest).toEqual(secondManifest)
    expect(firstPackage.packageBytes).toBe(secondPackage.packageBytes)
    expect(firstPackage.manifest.protectedInputs).toEqual([
      "dataset-manifest.json", "bids-audit-interface.json",
    ])
    expect(firstPackage.manifest.generatedOutputs).toEqual(["bids-audit.json"])
  })

  test("executes the two successor fixtures and emits the v2 source-derived oracle", async () => {
    const packageDir = await temporaryDirectory("skvm-bids-successor-artifact-package-")
    await compileBidsSuccessorValidatedArtifact(
      await loadBidsSuccessorArtifactCompilerInput(rootDir), packageDir,
    )
    const artifactPackage = await validateValidatedArtifactPackage(packageDir)
    const tasks = BidsSuccessorTaskSetSchema.parse(JSON.parse(await readFile(
      path.join(pilotDir, "development/tasks.json"), "utf8",
    )))
    const sourceRules = await loadBidsSuccessorSourceRules(rootDir)
    for (const task of tasks.tasks) {
      const workDir = await temporaryDirectory("skvm-bids-successor-artifact-work-")
      for (const [relativePath, contents] of Object.entries(task.fixtures)) {
        await Bun.write(path.join(workDir, relativePath), contents)
      }
      const execution = await runValidatedArtifactPlan({ package: artifactPackage, workDir })
      const actual = JSON.parse(await readFile(path.join(workDir, "bids-audit.json"), "utf8"))
      const expected = await deriveBidsSuccessorAuditOracle(
        JSON.parse(task.fixtures["dataset-manifest.json"]!), sourceRules,
      )
      expect(execution.status).toBe("complete")
      expect(execution.validation?.status).toBe("pass")
      expect(actual).toEqual(expected)
      expect(actual.schemaVersion).toBe("skill-ir-bids-audit-report/v2")
      expect(actual.issues.every((issue: { evidencePaths: string[]; repair: { targetPath: string } }) =>
        issue.evidencePaths.length === 1 && issue.evidencePaths[0] === issue.repair.targetPath)).toBe(true)
    }
  })

  test("scores exactly four successor task controls and freezes their pre-model identity", async () => {
    const outDir = await temporaryResultDirectory("skvm-bids-successor-controls-")
    const control = await runBidsSuccessorArtifactControls({ rootDir, outDir })
    expect(control).toMatchObject({
      rows: 4,
      scoredRowCount: 4,
      successfulRows: 4,
      modelCalls: 0,
      modelTokens: 0,
    })
    expect(control.rawRows.map((row) => [row.system, row.runIndex])).toEqual([
      ["validated-artifact", 1],
      ["validated-artifact", 2],
      ["validated-artifact", 1],
      ["validated-artifact", 2],
    ])
    expect(control.rawRows.every((row) => row.taskPath === path.join(
      rootDir, "benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json",
    ))).toBe(true)
    expect(control.scoredRows.every((row) => row.success && row.evaluatorScore === 1
      && row.successSource === "deterministic-evaluator")).toBe(true)

    const freeze = await buildBidsSuccessorArtifactControlFreeze({ rootDir, control })
    expect(freeze).toMatchObject({
      schemaVersion: "skill-ir-bids-successor-artifact-control-freeze/v1",
      status: "passed",
      measurementIdentity: "bids-successor-semantic-scorer-v2",
      controls: { rows: 4, scoredRows: 4, successfulRows: 4, modelCalls: 0, modelTokens: 0 },
      authorizations: { modelMatrix: true, dynamic: false, heldOut: false, readinessPromotion: false },
      sensitiveData: { modelOutputContentConsumed: false, heldOutConsumed: false },
    })
    expect(JSON.stringify(freeze)).not.toContain(rootDir)
    expect(JSON.stringify(freeze)).not.toMatch(/SKVM_XTY_API_KEY\s*[:=]\s*[^"}]+/u)
    await expect(validateBidsSuccessorArtifactControlFreeze(freeze, rootDir))
      .resolves.toEqual(freeze)
    const stale = structuredClone(freeze)
    stale.identityClosure.policy.sha256 = "0".repeat(64)
    await expect(validateBidsSuccessorArtifactControlFreeze(stale, rootDir))
      .rejects.toThrow("digest mismatch")
  })

  test("freezes a result runner that consumes direct successor evidence without corpus fallback", async () => {
    const source = await readFile(path.join(
      rootDir, "src/benchmarks/skill-ir/bids-successor-development-result-run.ts",
    ), "utf8")
    expect(source).toContain("validateBidsSuccessorArtifactControlFreeze")
    expect(source).toContain("buildProspectiveDevelopmentResult")
    expect(source).not.toContain("corpus:")
    expect(source).not.toContain("scoreRealAgentRuns")
  })
})
