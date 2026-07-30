import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  ExperimentalDesignV2TaskSufficiencyManifestSchema,
  analyzeExperimentalDesignV2TaskSufficiency,
  summarizeExperimentalDesignV2InstructionCoverage,
  verifyExperimentalDesignV2TaskSufficiencyManifest,
} from "./experimental-design-v2-task-sufficiency.ts"

const rootDir = process.cwd()
const manifestPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/public-contract-task-sufficiency-audit.json",
)
const reportPath = path.join(
  rootDir,
  "results/skill-ir/experimental-design-v2-public-contract-task-sufficiency-audit-2026-07-31.json",
)

async function loadManifest() {
  return ExperimentalDesignV2TaskSufficiencyManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  )
}

describe("experimental-design v2 public-contract task sufficiency audit", () => {
  test("binds development-only evidence and reproduces the compact report", async () => {
    const manifest = await loadManifest()
    await expect(
      verifyExperimentalDesignV2TaskSufficiencyManifest(rootDir, manifest),
    ).resolves.toEqual(manifest)

    const report = await analyzeExperimentalDesignV2TaskSufficiency({ rootDir, manifest })
    const persisted = JSON.parse(await readFile(reportPath, "utf8")) as unknown

    expect(persisted).toEqual(report)
    expect(report.status).toBe("passed")
    expect(report.conclusion).toBe("public-contract-operationally-sufficient-current-surface")
    expect(report.decision).toBe("move-to-skill-unique-deterministic-capability")
    expect(report.counts.scorerRequired).toBeGreaterThan(0)
    expect(report.counts.scorerRequiredPubliclyDisclosed).toBe(report.counts.scorerRequired)
    expect(report.counts.skillIncremental).toBeGreaterThan(0)
    expect(report.counts.skillIncrementalMeasured).toBe(0)
    expect(report.ratios.noSkillOperationalCoverage).toBe(1)
    expect(report.ratios.skillIncrementalMeasurementCoverage).toBe(0)

    const serialized = JSON.stringify(report)
    expect(serialized).not.toMatch(/TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs|model-output/iu)
  })

  test("removing public procedural evidence removes no-skill coverage", async () => {
    const manifest = await loadManifest()
    const target = manifest.instructions.find(
      (entry) => entry.id === "sequential-block-balance",
    )!
    const mutated = manifest.instructions.map((entry) =>
      entry.id === target.id
        ? {
            ...entry,
            evidence: entry.evidence.filter(
              (anchor) => anchor.audience !== "no-skill-visible",
            ),
          }
        : entry,
    )

    const coverage = summarizeExperimentalDesignV2InstructionCoverage(mutated)
    const changed = coverage.instructions.find((entry) => entry.id === target.id)!
    expect(changed.disclosedToNoSkill).toBe(false)
    expect(coverage.counts.scorerRequiredPubliclyDisclosed).toBe(
      coverage.counts.scorerRequired - 1,
    )
    expect(coverage.ratios.noSkillOperationalCoverage).toBeLessThan(1)
  })

  test("rejects evaluation-split and gold canaries in every evidence sink", async () => {
    const manifest = await loadManifest()
    for (const canary of [
      "TEST_ONLY_HELDOUT_V2_DO_NOT_CONSUME",
      "expectedAnswer",
      "goldAnswer",
      "raw-runs.jsonl",
      "model-output",
    ]) {
      const poisoned = structuredClone(manifest)
      poisoned.instructions[0]!.summary = canary
      await expect(
        verifyExperimentalDesignV2TaskSufficiencyManifest(rootDir, poisoned),
      ).rejects.toThrow("forbidden evidence sink")
    }
  })

  test("rejects bound-file and quote drift", async () => {
    const manifest = await loadManifest()
    const digestDrift = structuredClone(manifest)
    digestDrift.inputs.publicContract.sha256 = "0".repeat(64)
    await expect(
      verifyExperimentalDesignV2TaskSufficiencyManifest(rootDir, digestDrift),
    ).rejects.toThrow("digest mismatch")

    const quoteDrift = structuredClone(manifest)
    quoteDrift.instructions[0]!.evidence[0]!.quote = "TEST_ONLY_MISSING_PUBLIC_QUOTE"
    await expect(
      verifyExperimentalDesignV2TaskSufficiencyManifest(rootDir, quoteDrift),
    ).rejects.toThrow("evidence quote missing")
  })
})
