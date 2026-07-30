import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS,
  buildExperimentalDesignV2HarderDevelopmentTaskSet,
  buildExperimentalDesignV2SaturationAudit,
  summarizeExperimentalDesignV2HarderTaskComplexity,
  validateExperimentalDesignV2HarderDevelopmentTaskSet,
} from "./experimental-design-v2-harder-development.ts"
import { sha256Bytes } from "./source-fixture.ts"

const rootDir = process.cwd()
const v2Root = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2",
)

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as unknown
}

describe("experimental-design v2 harder development contract", () => {
  test("derives the old strong-model saturation finding without raw or held-out input", async () => {
    const gateBytes = await readFile(path.join(
      rootDir,
      "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/gate-report.json",
    ))
    const analysisBytes = await readFile(path.join(
      rootDir,
      "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json",
    ))
    const taskSetBytes = await readFile(path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
    ))
    const publicContractBytes = await readFile(path.join(v2Root, "public-contract.json"))
    const report = buildExperimentalDesignV2SaturationAudit({
      gateBytes,
      analysisBytes,
      taskSetBytes,
      publicContractBytes,
    })
    const persisted = await readJson(
      "results/skill-ir/experimental-design-v2-harder-development-saturation-audit-2026-07-31.json",
    )

    expect(persisted).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.currentMatrix).toMatchObject({
      noSkillSuccesses: 4,
      noSkillRows: 4,
      noSkillMeanScore: 1,
      differingPairs: 0,
      infrastructureFailures: 0,
    })
    expect(report.currentTaskEnvelope).toMatchObject({
      maximumArms: 2,
      maximumStrata: 2,
      combinesStrataAndSequentialEnrollment: false,
      includesAnalysisUnitDifference: false,
    })
    expect(report.allowedNextStep).toBe("supplemental-development-task-set")
    expect(report.inputs).toEqual({
      gateSha256: sha256Bytes(gateBytes),
      analysisSha256: sha256Bytes(analysisBytes),
      taskSetSha256: sha256Bytes(taskSetBytes),
      publicContractSha256: sha256Bytes(publicContractBytes),
    })
    expect(JSON.stringify(report)).not.toContain("heldout")
    expect(JSON.stringify(report)).not.toContain("raw-runs")
  })

  test("builds two public multi-constraint tasks with the unchanged v2 contract", async () => {
    const publicContractBytes = await readFile(path.join(v2Root, "public-contract.json"))
    const taskSet = buildExperimentalDesignV2HarderDevelopmentTaskSet(publicContractBytes)
    const persisted = await readJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/harder-development/tasks.json",
    )
    const validated = validateExperimentalDesignV2HarderDevelopmentTaskSet(
      persisted,
      publicContractBytes,
    )

    expect(persisted).toEqual(taskSet)
    expect(validated.tasks.map((task) => task.id)).toEqual([
      ...EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS,
    ])
    expect(validated.tasks.every((task) => task.split === "development")).toBe(true)
    expect(validated.tasks.every(
      (task) => task.fixtures["design-contract.json"] === publicContractBytes.toString("utf8"),
    )).toBe(true)

    const profiles = validated.tasks.map(summarizeExperimentalDesignV2HarderTaskComplexity)
    expect(profiles[0]).toMatchObject({
      assignmentLevel: "individual",
      arms: 3,
      strata: 3,
      sequentialEnrollment: true,
      analysisUnitDiffers: true,
      hasFullBlock: true,
      hasPartialBlock: true,
    })
    expect(profiles[1]).toMatchObject({
      assignmentLevel: "cluster",
      arms: 4,
      strata: 3,
      sequentialEnrollment: true,
      analysisUnitDiffers: true,
      hasFullBlock: true,
      hasPartialBlock: true,
    })
  })

  test("rejects contract drift and forbidden evaluator or held-out evidence", async () => {
    const publicContractBytes = await readFile(path.join(v2Root, "public-contract.json"))
    const taskSet = buildExperimentalDesignV2HarderDevelopmentTaskSet(publicContractBytes)

    const contractDrift = structuredClone(taskSet)
    contractDrift.tasks[0]!.fixtures["design-contract.json"] += "\n"
    expect(() => validateExperimentalDesignV2HarderDevelopmentTaskSet(
      contractDrift,
      publicContractBytes,
    )).toThrow("public contract bytes")

    const goldLeak = structuredClone(taskSet) as unknown as Record<string, unknown>
    ;(goldLeak.tasks as Array<Record<string, unknown>>)[0]!.expectedAnswer = "private"
    expect(() => validateExperimentalDesignV2HarderDevelopmentTaskSet(
      goldLeak,
      publicContractBytes,
    )).toThrow("forbidden evidence")

    const heldoutLeak = structuredClone(taskSet)
    heldoutLeak.tasks[0]!.prompt += " TEST_ONLY_HELDOUT_V2_LEAK"
    expect(() => validateExperimentalDesignV2HarderDevelopmentTaskSet(
      heldoutLeak,
      publicContractBytes,
    )).toThrow("held-out evidence")
  })

  test("fails closed when the frozen predecessor evidence is not saturated", async () => {
    const gate = await readJson(
      "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/gate-report.json",
    ) as Record<string, unknown>
    const changedGate = structuredClone(gate) as {
      systems: { "no-skill": { successes: number } }
    }
    changedGate.systems["no-skill"].successes = 3
    const analysis = await readJson(
      "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json",
    )
    const taskSet = await readJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
    )
    const publicContractBytes = await readFile(path.join(v2Root, "public-contract.json"))

    expect(() => buildExperimentalDesignV2SaturationAudit({
      gateBytes: Buffer.from(JSON.stringify(changedGate), "utf8"),
      analysisBytes: Buffer.from(JSON.stringify(analysis), "utf8"),
      taskSetBytes: Buffer.from(JSON.stringify(taskSet), "utf8"),
      publicContractBytes,
    })).toThrow("not saturated")
  })
})
