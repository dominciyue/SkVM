import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  MethodPortfolioAuthorityRegistrySchema,
  deriveOptimizationCostReportAuthority,
  deriveValidatedArtifactGateAuthority,
  readAndEvaluateAuthoritativeMethodPortfolio,
  readOptimizationEvidenceAuthority,
  writeAuthoritativeMethodPortfolioReadinessReport,
} from "./method-portfolio-evidence-authority.ts"
import { buildOptimizationCostAccountingReport } from "./optimization-cost-accounting.ts"
import { sha256Bytes } from "./source-fixture.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

async function readJson(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(path.join(rootDir, ...relativePath.split("/")), "utf8"))
}

describe("method portfolio optimization evidence authority", () => {
  test("successor registry accepts only digest-bound evidence references, not self-declared conclusions", () => {
    const registry = {
      schemaVersion: "skill-ir-method-portfolio/v4",
      portfolioId: "authority-test",
      basePortfolio: {
        path: "benchmarks/base-portfolio.json",
        sha256: "0".repeat(64),
      },
      cases: [{
        skillId: "skill-1",
        optimizationEvidence: {
          status: "evidence-ref",
          evidencePath: "results/evidence.json",
          evidenceSha256: "1".repeat(64),
        },
      }],
    }

    expect(MethodPortfolioAuthorityRegistrySchema.parse(registry).cases[0]!.optimizationEvidence)
      .toEqual({
        status: "evidence-ref",
        evidencePath: "results/evidence.json",
        evidenceSha256: "1".repeat(64),
      })

    const selfDeclared = structuredClone(registry)
    Object.assign(selfDeclared.cases[0]!.optimizationEvidence, {
      classification: "efficiency-positive",
      qualityComparisonComplete: true,
      allAttemptCostComplete: true,
      breakEvenComplete: true,
    })
    expect(() => MethodPortfolioAuthorityRegistrySchema.parse(selfDeclared)).toThrow()
  })

  test("derives API quality-positive and Env fidelity from real gate rows", async () => {
    const api = deriveValidatedArtifactGateAuthority(await readJson(
      "results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json",
    ))
    expect(api).toMatchObject({
      evidenceSchemaVersion: "skill-ir-validated-artifact-development-gate-report/v1",
      classification: "quality-positive",
      qualityComparisonComplete: true,
      qualityEquivalent: true,
      strictQualityImprovement: true,
      productionCostComplete: false,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    })

    const env = deriveValidatedArtifactGateAuthority(await readJson(
      "results/skill-ir/env-manager-v3-validated-artifact-development-v1/gate-report.json",
    ))
    expect(env).toMatchObject({
      classification: "fidelity-preserving",
      qualityComparisonComplete: true,
      qualityEquivalent: true,
      strictQualityImprovement: false,
    })
  })

  test("rejects aggregate claims that disagree with the underlying gate records", async () => {
    const gate = await readJson(
      "results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json",
    )
    gate.systems["validated-artifact"].successes = 3
    expect(() => deriveValidatedArtifactGateAuthority(gate)).toThrow("systems summary")
  })

  test("recomputes cost completeness and efficiency instead of trusting report flags", async () => {
    const envGate = deriveValidatedArtifactGateAuthority(await readJson(
      "results/skill-ir/env-manager-v3-validated-artifact-development-v1/gate-report.json",
    ))
    const historical = deriveOptimizationCostReportAuthority(
      await readJson("results/skill-ir/env-manager-v3-cost-accounting.json"),
      envGate,
    )
    expect(historical).toMatchObject({
      classification: "fidelity-preserving",
      qualityComparisonComplete: true,
      productionCostComplete: false,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    })

    const measured = (value: number) => ({ status: "measured" as const, value })
    const qualityEvidence = { path: "results/quality.json", sha256: "2".repeat(64) }
    const cost = buildOptimizationCostAccountingReport({
      skillId: "skill-1",
      experimentId: "prospective-efficiency",
      quality: { equivalent: true, evidence: qualityEvidence },
      adaptation: {
        humanMinutes: 5,
        adapterLoc: 4,
        coreBranchDelta: 0,
        reusedArtifactKinds: ["schemas"],
        unautomatedSteps: ["review"],
      },
      production: {
        oneTime: {
          compile: { modelTokens: measured(100), durationMs: measured(20) },
          profile: { modelTokens: measured(0), durationMs: measured(0) },
          package: { modelTokens: measured(0), durationMs: measured(5), bytes: measured(128) },
        },
        runtime: {
          original: { samples: 4, aggregateModelTokens: 4000, aggregateDurationMs: 400 },
          optimized: { samples: 4, aggregateModelTokens: 0, aggregateDurationMs: 40 },
          repairModelTokensPerRun: 0,
        },
      },
      research: {
        attempts: [{
          id: "matrix",
          kind: "matrix",
          attempts: 8,
          usage: {
            inputTokens: measured(2000),
            outputTokens: measured(500),
            cacheReadTokens: measured(0),
            cacheWriteTokens: measured(0),
          },
          durationMs: measured(500),
        }],
        scorer: { modelTokens: measured(0), durationMs: measured(5) },
        repair: { modelTokens: measured(0), durationMs: measured(0) },
      },
      evidence: [qualityEvidence],
    })
    expect(deriveOptimizationCostReportAuthority(cost, {
      ...envGate,
      classification: "quality-positive",
      strictQualityImprovement: true,
    })).toMatchObject({
      classification: "efficiency-positive",
      productionCostComplete: true,
      allAttemptCostComplete: true,
      breakEvenComplete: true,
    })

    const tampered = structuredClone(cost)
    tampered.completeness.allAttemptCostComplete = false
    expect(() => deriveOptimizationCostReportAuthority(tampered, envGate))
      .toThrow("cost report derived fields")
  })

  test("fails closed on missing, digest-drifted, or unknown evidence files", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "skill-ir-evidence-authority-"))
    try {
      await expect(readOptimizationEvidenceAuthority({
        rootDir: temp,
        evidence: {
          status: "evidence-ref",
          evidencePath: "missing.json",
          evidenceSha256: "0".repeat(64),
        },
      })).rejects.toThrow("optimization evidence is unavailable")

      const unknownBytes = Buffer.from("{}\n", "utf8")
      await writeFile(path.join(temp, "unknown.json"), unknownBytes)
      await expect(readOptimizationEvidenceAuthority({
        rootDir: temp,
        evidence: {
          status: "evidence-ref",
          evidencePath: "unknown.json",
          evidenceSha256: sha256Bytes(unknownBytes),
        },
      })).rejects.toThrow("unsupported optimization evidence schema")

      await expect(readOptimizationEvidenceAuthority({
        rootDir: temp,
        evidence: {
          status: "evidence-ref",
          evidencePath: "unknown.json",
          evidenceSha256: "f".repeat(64),
        },
      })).rejects.toThrow("optimization evidence digest mismatch")
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  test("recursively verifies cost-report quality evidence instead of trusting its reference", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "skill-ir-cost-authority-"))
    try {
      const gateBytes = await readFile(path.join(
        rootDir,
        "results/skill-ir/api-tester-schema-derived-artifact-development-v1/gate-report.json",
      ))
      await writeFile(path.join(temp, "quality.json"), gateBytes)
      const qualityEvidence = { path: "quality.json", sha256: sha256Bytes(gateBytes) }
      const measured = (value: number) => ({ status: "measured" as const, value })
      const report = buildOptimizationCostAccountingReport({
        skillId: "skill-1",
        experimentId: "recursive-cost-authority",
        quality: { equivalent: true, evidence: qualityEvidence },
        adaptation: {
          humanMinutes: 1,
          adapterLoc: 1,
          coreBranchDelta: 0,
          reusedArtifactKinds: ["schemas"],
          unautomatedSteps: ["review"],
        },
        production: {
          oneTime: {
            compile: { modelTokens: measured(10), durationMs: measured(10) },
            profile: { modelTokens: measured(0), durationMs: measured(0) },
            package: { modelTokens: measured(0), durationMs: measured(1), bytes: measured(64) },
          },
          runtime: {
            original: { samples: 4, aggregateModelTokens: 400, aggregateDurationMs: 400 },
            optimized: { samples: 4, aggregateModelTokens: 0, aggregateDurationMs: 4 },
            repairModelTokensPerRun: 0,
          },
        },
        research: {
          attempts: [],
          scorer: { modelTokens: measured(0), durationMs: measured(1) },
          repair: { modelTokens: measured(0), durationMs: measured(0) },
        },
        evidence: [qualityEvidence],
      })
      const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8")
      await writeFile(path.join(temp, "cost.json"), reportBytes)
      expect(await readOptimizationEvidenceAuthority({
        rootDir: temp,
        evidence: {
          status: "evidence-ref",
          evidencePath: "cost.json",
          evidenceSha256: sha256Bytes(reportBytes),
        },
      })).toMatchObject({ classification: "efficiency-positive" })

      const drifted = structuredClone(report)
      drifted.quality.evidence.sha256 = "9".repeat(64)
      const driftedBytes = Buffer.from(`${JSON.stringify(drifted, null, 2)}\n`, "utf8")
      await writeFile(path.join(temp, "cost.json"), driftedBytes)
      await expect(readOptimizationEvidenceAuthority({
        rootDir: temp,
        evidence: {
          status: "evidence-ref",
          evidencePath: "cost.json",
          evidenceSha256: sha256Bytes(driftedBytes),
        },
      })).rejects.toThrow("optimization evidence digest mismatch")
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  test("revalidates the stock API quality-positive before counting the current one", async () => {
    const report = await readAndEvaluateAuthoritativeMethodPortfolio({
      rootDir,
      portfolioPath: path.join(
        rootDir,
        "benchmarks/skill-ir/corpus/method-portfolio-authoritative.json",
      ),
    })
    expect(report.schemaVersion).toBe("skill-ir-method-portfolio-readiness/v5")
    expect(report.counts).toMatchObject({
      readinessEligibleDevelopmentPhenotypes: 1,
      qualityPositiveDevelopmentPhenotypes: 1,
      efficiencyPositiveDevelopmentPhenotypes: 0,
      fidelityPreservingDevelopmentPhenotypes: 1,
    })
    expect(report.evidenceAuthority.cases).toContainEqual(expect.objectContaining({
      skillId: "api-tester",
      evidenceSchemaVersion: "skill-ir-validated-artifact-development-gate-report/v1",
      classification: "quality-positive",
      qualityComparisonComplete: true,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
      qualityEquivalent: true,
      strictQualityImprovement: true,
    }))
    expect(report.evidenceAuthority.cases).toContainEqual(expect.objectContaining({
      skillId: "env-manager",
      classification: "fidelity-preserving",
      qualityEquivalent: true,
      strictQualityImprovement: false,
    }))
    expect(report.gates.twoEvidenceQualifiedPhenotypes).toBe(false)
    expect(report.gates.automationAndAdaptationConverging).toBe(false)
  })

  test("writes the authoritative readiness result without overwriting legacy v4", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "skill-ir-authoritative-readiness-"))
    const outputPath = path.join(temp, "readiness.json")
    try {
      const report = await writeAuthoritativeMethodPortfolioReadinessReport({
        rootDir,
        portfolioPath: path.join(
          rootDir,
          "benchmarks/skill-ir/corpus/method-portfolio-authoritative.json",
        ),
        outputPath,
      })
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
      expect(report.schemaVersion).toBe("skill-ir-method-portfolio-readiness/v5")
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
