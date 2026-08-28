import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  AutomationComponentAuthorityCatalogSchema,
  readAndEvaluateAutomationComponentAuthority,
  writeAuthoritativeAutomationReadinessReport,
} from "./method-portfolio-automation-authority.ts"
import { evaluateMethodPortfolioReadiness } from "./method-portfolio.ts"
import { sha256Bytes } from "./source-fixture.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const catalogPath = path.join(
  rootDir,
  "benchmarks/skill-ir/corpus/method-portfolio-authoritative-automation.json",
)

function repositoryRelative(absolutePath: string): string {
  return path.relative(rootDir, absolutePath).replaceAll("\\", "/")
}

async function writeJson(absolutePath: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
  await writeFile(absolutePath, bytes)
  return bytes
}

describe("method portfolio automation component authority", () => {
  test("catalog accepts only digest-bound evidence and a closed cost policy", () => {
    const digestRef = (relativePath: string) => ({ path: relativePath, sha256: "1".repeat(64) })
    const catalog = {
      schemaVersion: "skill-ir-automation-component-authority-catalog/v1",
      catalogId: "method-portfolio-automation-authority-001",
      implementation: digestRef("src/benchmarks/skill-ir/method-portfolio-automation-authority.ts"),
      portfolioAuthority: digestRef("benchmarks/skill-ir/corpus/method-portfolio-authoritative-efficiency.json"),
      evidence: {
        sourceOnlyConstruction: digestRef("results/source-only.json"),
        thinDeclarationConstruction: digestRef("results/thin.json"),
        structuralExecution: digestRef("results/structural.json"),
        jsonPointerConstruction: digestRef("results/pointer.json"),
        crossSkillDomainPlan: digestRef("results/cross-skill.json"),
        genericDomainRepair: digestRef("results/repair.json"),
        reviewRequiredClosure: digestRef("results/review.json"),
      },
      costBoundary: {
        scope: "full-qualified-adaptation",
        declarationEffortIncluded: true,
        userInputLocMetric: "physical-declaration-loc-plus-qualification-adapter-loc",
        reusableMeasuredSegments: ["thin-task-declaration-authoring"],
        excludedOverlappingOrDifferentScopeSegments: [
          "shared-core-development",
          "structural-parity-catalog",
          "partial-output-integration",
          "json-pointer-integration",
          "review-required-patch",
        ],
        fullQualificationRequires: [
          "declaration-human-minutes",
          "physical-declaration-loc",
          "qualification-human-minutes",
          "qualification-adapter-loc",
          "core-branch-delta",
        ],
        historicalNullsMayBeBackfilled: false,
        measuredScopesMayBeSummed: false,
      },
    }
    expect(AutomationComponentAuthorityCatalogSchema.parse(catalog).catalogId)
      .toBe("method-portfolio-automation-authority-001")

    for (const [field, value] of [
      ["automationAndAdaptationConverging", true],
      ["generatesIr", true],
      ["humanMinutes", 1],
      ["eligibility", true],
    ] as const) {
      const selfDeclared = structuredClone(catalog) as Record<string, unknown>
      selfDeclared[field] = value
      expect(() => AutomationComponentAuthorityCatalogSchema.parse(selfDeclared)).toThrow()
    }
  })

  test("derives all four component qualifications and full cost as incomplete from frozen evidence", async () => {
    const report = await readAndEvaluateAutomationComponentAuthority({ rootDir, catalogPath })

    expect(report.schemaVersion).toBe("skill-ir-method-portfolio-readiness/v7")
    expect(report.passed).toBe(false)
    expect(report.gates).toMatchObject({
      twoEvidenceQualifiedPhenotypes: true,
      lastThreeCoreBranchDeltaZero: true,
      automationAndAdaptationConverging: false,
    })
    expect(report.automationEvidenceAuthority.derivationBoundary).toEqual({
      basePortfolioAutomationFieldsConsumed: false,
      basePortfolioAdaptationCostFieldsConsumed: false,
      candidatePresenceIsQualification: false,
      reviewRequiredClosureIsAutomatic: false,
    })
    expect(report.automationEvidenceAuthority.summary).toMatchObject({
      qualifiedMethodCases: 7,
      candidateCases: {
        generatesIr: 7,
        generatesContract: 7,
        generatesValidationPlan: 7,
        generatesPackageCandidate: 7,
      },
      authorityQualifiedCases: {
        generatesIr: 0,
        generatesContract: 0,
        generatesValidationPlan: 0,
        generatesPackageCandidate: 0,
      },
      completeFullQualifiedAdaptationCostCases: 0,
      fullQualificationTrend: "not-established",
      automationAndAdaptationConverging: false,
    })
    expect(report.automationEvidenceAuthority.cases).toHaveLength(7)
    const evidenceKeys = new Set(Object.keys(report.automationEvidenceAuthority.evidence))
    for (const entry of report.automationEvidenceAuthority.cases) {
      expect(Object.values(entry.components).every((component) =>
        component.candidateGenerated && !component.authorityQualified)).toBe(true)
      for (const component of Object.values(entry.components)) {
        for (const criterion of component.criteria) {
          expect(criterion.evidence.every((key) =>
            typeof key === "string" && evidenceKeys.has(key))).toBe(true)
        }
      }
      expect(entry.adaptation.declarationSegment.status).toBe("measured")
      expect(entry.adaptation.fullQualifiedCost).toEqual({
        status: "not-established",
        humanMinutes: null,
        userInputLoc: null,
        coreBranchDelta: 0,
      })
    }
    expect(JSON.stringify(report.automationEvidenceAuthority.cases)).not.toContain('"path":')
  })

  test("cannot be flipped by self-declared base flag and cost edits even when all digests are updated", async () => {
    const temp = await mkdtemp(path.join(rootDir, "results/skill-ir/automation-authority-canary-"))
    try {
      const originalCatalog = JSON.parse(await readFile(catalogPath, "utf8"))
      const originalRegistryPath = path.join(rootDir, ...originalCatalog.portfolioAuthority.path.split("/"))
      const registry = JSON.parse(await readFile(originalRegistryPath, "utf8"))
      const originalBasePath = path.join(rootDir, ...registry.basePortfolio.path.split("/"))
      const base = JSON.parse(await readFile(originalBasePath, "utf8"))

      for (const entry of base.cases.filter((candidate: any) =>
        candidate.role === "method-development" && candidate.contractQualified)) {
        entry.automation = {
          generatesIr: true,
          generatesContract: true,
          generatesValidationPlan: true,
          generatesPackageCandidate: true,
        }
        entry.adaptation.measurementStatus = "prospective-measured"
        entry.adaptation.measurementStartedAt = "2026-08-28T00:00:00.000Z"
        entry.adaptation.measurementCompletedAt = "2026-08-28T00:01:00.000Z"
        entry.adaptation.humanMinutes = 300 - entry.methodSequence * 20
        entry.adaptation.adapterLoc = 100 - entry.methodSequence * 5
        entry.adaptation.coreBranchDelta = 0
      }
      expect(evaluateMethodPortfolioReadiness(base).gates.automationAndAdaptationConverging).toBe(true)

      const basePath = path.join(temp, "base.json")
      const baseBytes = await writeJson(basePath, base)
      registry.basePortfolio = { path: repositoryRelative(basePath), sha256: sha256Bytes(baseBytes) }
      const registryPath = path.join(temp, "optimization-authority.json")
      const registryBytes = await writeJson(registryPath, registry)
      originalCatalog.portfolioAuthority = {
        path: repositoryRelative(registryPath),
        sha256: sha256Bytes(registryBytes),
      }
      const attackedCatalogPath = path.join(temp, "automation-authority.json")
      await writeJson(attackedCatalogPath, originalCatalog)

      const attacked = await readAndEvaluateAutomationComponentAuthority({
        rootDir,
        catalogPath: attackedCatalogPath,
      })
      expect(attacked.gates.automationAndAdaptationConverging).toBe(false)
      expect(attacked.automationEvidenceAuthority.summary.authorityQualifiedCases).toEqual({
        generatesIr: 0,
        generatesContract: 0,
        generatesValidationPlan: 0,
        generatesPackageCandidate: 0,
      })

      base.cases[0].automation.generatesIr = false
      await writeJson(basePath, base)
      await expect(readAndEvaluateAutomationComponentAuthority({
        rootDir,
        catalogPath: attackedCatalogPath,
      })).rejects.toThrow("digest mismatch")
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  test("keeps declaration effort in the boundary without summing overlapping work", async () => {
    const report = await readAndEvaluateAutomationComponentAuthority({ rootDir, catalogPath })
    expect(report.automationEvidenceAuthority.costBoundary).toMatchObject({
      scope: "full-qualified-adaptation",
      declarationEffortIncluded: true,
      userInputLocMetric: "physical-declaration-loc-plus-qualification-adapter-loc",
      reusableMeasuredSegments: ["thin-task-declaration-authoring"],
      historicalNullsMayBeBackfilled: false,
      measuredScopesMayBeSummed: false,
    })
    expect(report.automationEvidenceAuthority.costEvidence).toEqual({
      declarationHumanMinutes: 15,
      physicalDeclarationLoc: 159,
      qualificationHumanMinutes: null,
      qualificationAdapterLoc: null,
      completeCases: 0,
      trend: "not-established",
    })
  })

  test("writes the exact derived readiness successor", async () => {
    const temp = await mkdtemp(path.join(rootDir, "results/skill-ir/automation-authority-write-"))
    try {
      const outputPath = path.join(temp, "readiness.json")
      const report = await writeAuthoritativeAutomationReadinessReport({ rootDir, catalogPath, outputPath })
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
