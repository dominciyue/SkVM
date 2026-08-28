import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  AutomationReachabilityCatalogSchema,
  readAndEvaluateAutomationReachability,
  writeAutomationReachabilityReport,
} from "./automation-reachability.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const catalogPath = path.join(
  rootDir,
  "benchmarks/skill-ir/corpus/automation-reachability-v1.json",
)

describe("automation reachability authority", () => {
  test("accepts only digest-bound evidence references", () => {
    const catalog = {
      schemaVersion: "skill-ir-automation-reachability-catalog/v1",
      catalogId: "automation-reachability-v1",
      implementation: {
        path: "src/benchmarks/skill-ir/automation-reachability.ts",
        sha256: "2".repeat(64),
      },
      portfolioAuthority: {
        path: "benchmarks/skill-ir/corpus/method-portfolio-authoritative-efficiency.json",
        sha256: "0".repeat(64),
      },
      evidence: Object.fromEntries([
        "sourceOnlyConstruction",
        "thinDeclarationConstruction",
        "structuralExecution",
        "outputConstruction",
        "jsonPointerConstruction",
        "crossSkillDomainPlan",
        "genericDomainRepair",
        "reviewRequiredClosure",
      ].map((key) => [key, { path: `results/${key}.json`, sha256: "1".repeat(64) }])),
    }
    expect(AutomationReachabilityCatalogSchema.parse(catalog).catalogId)
      .toBe("automation-reachability-v1")

    const selfDeclared = structuredClone(catalog) as any
    selfDeclared.automationAndAdaptationConverging = true
    expect(() => AutomationReachabilityCatalogSchema.parse(selfDeclared)).toThrow()
  })

  test("separates the direct gate expression from flag qualification authority", async () => {
    const report = await readAndEvaluateAutomationReachability({ rootDir, catalogPath })

    expect(report.authority).toMatchObject({
      readinessSchemaVersion: "skill-ir-method-portfolio-readiness/v6",
      readinessPassed: false,
      twoEvidenceQualifiedPhenotypes: true,
      automationAndAdaptationConverging: false,
    })
    expect(report.evidenceAuthority.implementation.path)
      .toBe("src/benchmarks/skill-ir/automation-reachability.ts")
    expect(report.currentGate).toMatchObject({
      contractQualifiedCases: 7,
      automationIncompleteSkills: [
        "env-manager",
        "law-to-markdown",
        "experimental-design",
        "api-tester",
        "zh-code-reviewer",
        "zh-readme",
        "i18n-helper",
      ],
      missingAutomationOutputs: {
        generatesIr: 7,
        generatesContract: 5,
        generatesValidationPlan: 3,
        generatesPackageCandidate: 3,
      },
      adaptationEvidence: {
        prospectiveMeasuredCases: 1,
        historicalUnavailableCases: 6,
        humanMinutesKnownCases: 1,
        adapterLocKnownCases: 5,
        trendComputable: false,
      },
    })
    expect(report.gateInterpretation).toEqual({
      domainRuntimeIsDirectGateInput: false,
      directInputs: [
        "four-automation-booleans-per-qualified-case",
        "non-null-human-minutes-and-adapter-loc",
        "last-three-cost-means-not-above-first-three",
      ],
      currentPolicyRequiresDomainSemanticSufficiencyForFlagPromotion: true,
      implication: "domain-parity-is-not-in-the-expression-but-current-policy-makes-it-indirect-qualification-evidence",
    })
    expect(report.flagQualificationAuthority).toMatchObject({
      currentPortfolioAuthority: {
        automationFields: "self-declared-booleans",
        adaptationFields: "self-declared-cost-values",
        evidenceReferencesRequired: false,
        canary: {
          gateBefore: false,
          gateAfterUnreferencedFieldEdits: true,
          evidenceReferencesAdded: 0,
        },
      },
      sharedPolicy: {
        status: "prose-only-not-component-separable",
        requirements: [
          "source-isolation",
          "skill-ir-reference-validation",
          "domain-semantic-sufficiency",
          "catalog-runtime-package-parity-when-applicable",
        ],
      },
      flags: {
        generatesIr: {
          currentTrueCases: 0,
          generatedCandidateCases: 7,
          manualOracleCases: 6,
          exactSourceRuleMatches: 0,
          semanticParityEstablishedCases: 0,
          authorityQualifiedCases: 0,
          honestPromotionNow: false,
        },
        generatesContract: {
          currentTrueCases: 2,
          generatedCandidateCases: 7,
          thinDeclarationCases: 7,
          semanticParityEstablishedCases: 0,
          authorityQualifiedCases: 0,
          honestPromotionNow: false,
        },
        generatesValidationPlan: {
          currentTrueCases: 4,
          generatedCandidateCases: 7,
          realWorkdirCases: 7,
          exactManualComparisons: 2,
          semanticParityEstablishedCases: 0,
          authorityQualifiedCases: 0,
          honestPromotionNow: false,
        },
        generatesPackageCandidate: {
          currentTrueCases: 4,
          generatedCandidateCases: 7,
          sourceOnlyNonExecutableCases: 7,
          completeConstructionCases: 0,
          authorityQualifiedCases: 0,
          honestPromotionNow: false,
        },
      },
    })
  })

  test("accounts for measured adaptation work without backfilling the six historical nulls", async () => {
    const report = await readAndEvaluateAutomationReachability({ rootDir, catalogPath })
    expect(report.costReachability).toMatchObject({
      thinDeclarations: {
        totalHumanMinutes: 15,
        totalDeclarationLoc: 159,
        cases: [
          { skillId: "env-manager", humanMinutes: 3, declarationLoc: 24, adapterLoc: 0 },
          { skillId: "law-to-markdown", humanMinutes: 2, declarationLoc: 22, adapterLoc: 0 },
          { skillId: "experimental-design", humanMinutes: 2, declarationLoc: 21, adapterLoc: 0 },
          { skillId: "api-tester", humanMinutes: 2, declarationLoc: 23, adapterLoc: 0 },
          { skillId: "zh-code-reviewer", humanMinutes: 2, declarationLoc: 22, adapterLoc: 0 },
          { skillId: "zh-readme", humanMinutes: 1, declarationLoc: 20, adapterLoc: 0 },
          { skillId: "i18n-helper", humanMinutes: 3, declarationLoc: 27, adapterLoc: 0 },
        ],
      },
      otherMeasuredWork: {
        sourceOnlySharedCoreHumanMinutes: 28,
        structuralParityHumanMinutes: 3,
        structuralParityCatalogLoc: 297,
        partialOutputHumanMinutes: 8,
        partialOutputPreMeasurementCoreWork: "not-measured",
        jsonPointerHumanMinutes: 20,
        jsonPointerPreMeasurementCoreWork: "not-measured",
        envReviewHumanMinutes: 8,
        envReviewPatchLoc: 125,
      },
      closure: {
        historicalNullsMayBeBackfilled: false,
        thinDeclarationSegmentReusable: true,
        fullQualifiedAdaptationCostCompleteCases: 0,
        casesRequiringProspectiveQualificationMeasurement: 7,
        measuredScopesMayBeSummed: false,
      },
      trend: {
        currentPortfolio: "not-computable",
        thinDeclarationHumanMinutes: {
          firstThreeMean: 7 / 3,
          lastThreeMean: 2,
          passes: true,
        },
        declaredAdapterLocOnly: { firstThreeMean: 0, lastThreeMean: 0, passes: true },
        declarationLocAsUserEffort: {
          firstThreeMean: 67 / 3,
          lastThreeMean: 23,
          passes: false,
        },
        fullQualificationTrend: "not-established",
        verdict: "metric-boundary-dependent-and-not-yet-claimable",
      },
    })
    expect(report.decisions).toEqual({
      promoteCurrentAutomationFlags: "no-go",
      attackCurrentGateAsWritten: "no-go",
      phase3AReadinessAttack: "conditional-go",
      phase3BCloseout: "go",
      attackConditions: [
        "freeze-evidence-bound-component-flag-authority",
        "decide-structure-existence-versus-semantic-eligibility",
        "freeze-adaptation-cost-boundary-including-declaration-effort",
        "prospectively-measure-seven-qualified-case-adaptations",
        "recompute-convergence-with-zero-core-branch-delta",
      ],
      unresolvedProposition: "attack-readiness-or-close-out",
      stopBoundary: "user-decision-required-before-phase-3",
    })
    expect(report.phase2Accounting).toEqual({
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      priorEvidencePaidCallsDisclosed: 2,
    })
  })

  test("fails closed on evidence digest drift", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "automation-reachability-"))
    try {
      const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
      catalog.evidence.structuralExecution.sha256 = "0".repeat(64)
      const driftedPath = path.join(temp, "catalog.json")
      await writeFile(driftedPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
      await expect(readAndEvaluateAutomationReachability({ rootDir, catalogPath: driftedPath }))
        .rejects.toThrow("digest mismatch")
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  test("writes the exact derived report", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "automation-reachability-write-"))
    try {
      const outputPath = path.join(temp, "report.json")
      const report = await writeAutomationReachabilityReport({ rootDir, catalogPath, outputPath })
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
