import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { SkillIRSchema } from "../../skill-ir/schema"
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit"
import { validateSkillIR } from "../../skill-ir/validate"
import { BidsTaskSetSchema, deriveBidsAuditOracle, loadBidsSourceRules } from "./bids-contract"
import {
  BidsArtifactAdapterSchema,
  compileBidsValidatedArtifact,
  loadBidsArtifactCompilerInput,
} from "./bids-artifact-compiler"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog"
import { runValidatedArtifactPlan } from "./validated-artifact-runtime"

const rootDir = path.resolve(import.meta.dir, "../../..")
const pilotDir = path.join(rootDir, "benchmarks/skill-ir/pilots/bids")
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

describe("BIDS validated artifact compiler", () => {
  test("keeps the committed profile-empty base IR fully source-audited", async () => {
    const ir = SkillIRSchema.parse(JSON.parse(await readFile(path.join(pilotDir, "base-ir.json"), "utf8")))
    const audit = SkillIRSourceAuditSchema.parse(JSON.parse(
      await readFile(path.join(pilotDir, "base-ir-source-audit.json"), "utf8"),
    ))

    expect(ir.profile).toEqual([])
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] })
    expect(await verifySkillIRSourceAudit(ir, audit, rootDir)).toEqual({ errors: [], warnings: [] })
    expect(BidsArtifactAdapterSchema.parse(JSON.parse(
      await readFile(path.join(pilotDir, "artifact-adapter.json"), "utf8"),
    )).outputs).toEqual(["bids-audit.json"])
  })

  test("builds a deterministic catalog-valid package from the audited inputs", async () => {
    const first = await temporaryDirectory("skvm-bids-artifact-a-")
    const second = await temporaryDirectory("skvm-bids-artifact-b-")
    const input = await loadBidsArtifactCompilerInput(rootDir)

    await compileBidsValidatedArtifact(input, first)
    await compileBidsValidatedArtifact(input, second)

    const [firstPackage, secondPackage, firstManifest, secondManifest] = await Promise.all([
      validateValidatedArtifactPackage(first),
      validateValidatedArtifactPackage(second),
      readFile(path.join(first, "package-manifest.json")),
      readFile(path.join(second, "package-manifest.json")),
    ])
    expect(firstPackage.manifest.skillId).toBe("bids")
    expect(firstPackage.manifest.protectedInputs).toEqual([
      "dataset-manifest.json",
      "bids-audit-interface.json",
    ])
    expect(firstPackage.manifest.generatedOutputs).toEqual(["bids-audit.json"])
    expect(firstManifest).toEqual(secondManifest)
    expect(firstPackage.packageBytes).toBe(secondPackage.packageBytes)
  })

  test("executes both development fixtures and emits the source-derived audit only", async () => {
    const packageDir = await temporaryDirectory("skvm-bids-artifact-package-")
    await compileBidsValidatedArtifact(await loadBidsArtifactCompilerInput(rootDir), packageDir)
    const artifactPackage = await validateValidatedArtifactPackage(packageDir)
    const tasks = BidsTaskSetSchema.parse(JSON.parse(
      await readFile(path.join(pilotDir, "development/tasks.json"), "utf8"),
    ))
    const sourceRules = await loadBidsSourceRules(rootDir)

    for (const task of tasks.tasks) {
      const workDir = await temporaryDirectory("skvm-bids-artifact-work-")
      for (const [relativePath, contents] of Object.entries(task.fixtures)) {
        await Bun.write(path.join(workDir, relativePath), contents)
      }

      const execution = await runValidatedArtifactPlan({ package: artifactPackage, workDir })
      const actual = JSON.parse(await readFile(path.join(workDir, "bids-audit.json"), "utf8"))
      const expected = await deriveBidsAuditOracle(
        JSON.parse(task.fixtures["dataset-manifest.json"]!),
        sourceRules,
      )

      expect(execution.status).toBe("complete")
      expect(execution.validation?.status).toBe("pass")
      expect(actual).toEqual(expected)
      expect((await readdir(workDir)).sort()).toEqual([
        "bids-audit-interface.json",
        "bids-audit.json",
        "dataset-manifest.json",
      ])
    }
  })

  test("fails closed before compilation when an audited input digest drifts", async () => {
    const outDir = await temporaryDirectory("skvm-bids-artifact-drift-")
    const input = await loadBidsArtifactCompilerInput(rootDir)
    input.baseIr.sha256 = "0".repeat(64)

    await expect(compileBidsValidatedArtifact(input, outDir)).rejects.toThrow("digest mismatch")
  })
})
