import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  buildExperimentalDesignSkillUniqueAudits,
} from "./experimental-design-skill-unique-audit.ts"

const rootDir = process.cwd()

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as unknown
}

describe("experimental-design skill-unique audits", () => {
  test("matches all development differential and materialization controls", async () => {
    const reports = await buildExperimentalDesignSkillUniqueAudits({ rootDir })
    expect(reports.contract.status).toBe("passed")
    expect(reports.contract.counts).toEqual({
      tasks: 2,
      cases: 18,
      matched: 18,
    })
    expect(reports.contract.reverseEvidence).toEqual({
      missingParentIsUnconfirmed: true,
      taskIdDoesNotAffectOracle: true,
    })
    expect(Object.values(reports.contract.leakChecks).every(Boolean)).toBe(true)

    expect(reports.materialization.status).toBe("passed")
    expect(reports.materialization.counts).toEqual({
      tasks: 2,
      arms: 4,
      checks: 36,
      passed: 36,
    })
    expect(reports.materialization.arms.every((arm) => arm.status === "passed")).toBe(true)
  })

  test("reproduces committed compact reports without answer or model text", async () => {
    const reports = await buildExperimentalDesignSkillUniqueAudits({ rootDir })
    expect(await readJson(
      "results/skill-ir/experimental-design-skill-unique-contract-audit-2026-07-31.json",
    )).toEqual(reports.contract)
    expect(await readJson(
      "results/skill-ir/experimental-design-skill-unique-materialization-audit-2026-07-31.json",
    )).toEqual(reports.materialization)

    const compact = JSON.stringify(reports)
    expect(compact).not.toMatch(/expectedAnswer|goldAnswer|raw-runs|private model output/iu)
    expect(compact).not.toContain("the replicate is whatever the treatment")
    expect(compact).not.toContain("TEST_ONLY_HELDOUT_SKILL_UNIQUE")
  })

  test("fails closed on source anchor or split-freeze drift", async () => {
    const sourceProvenance = await readJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/source-oracle-provenance.json",
    ) as { claims: Array<{ anchorSha256: string }> }
    const sourceDrift = structuredClone(sourceProvenance)
    sourceDrift.claims[0]!.anchorSha256 = "0".repeat(64)
    await expect(buildExperimentalDesignSkillUniqueAudits({
      rootDir,
      sourceProvenance: sourceDrift,
    })).rejects.toThrow("source anchor digest mismatch")

    const splitFreeze = await readJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/task-split-freeze.json",
    ) as { development: { sha256: string } }
    const freezeDrift = structuredClone(splitFreeze)
    freezeDrift.development.sha256 = "f".repeat(64)
    await expect(buildExperimentalDesignSkillUniqueAudits({
      rootDir,
      splitFreeze: freezeDrift,
    })).rejects.toThrow("development digest mismatch")
  })
})
