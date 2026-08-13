import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  MethodPortfolioSchema,
  MethodSuccessorSelectionPolicySchema,
  evaluateMethodSuccessorSelection,
  evaluateMethodPortfolioReadiness,
  readMethodPortfolio,
  writeMethodPortfolioReadinessReport,
  writeMethodSuccessorSelectionReport,
} from "./method-portfolio.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const portfolioPath = path.join(rootDir, "benchmarks/skill-ir/corpus/method-portfolio.json")

function qualifiedCase(index: number): any {
  return {
    skillId: `skill-${index}`,
    upstreamIdentity: {
      repository: `https://example.test/repo-${index}`,
      commit: String(index).repeat(40).slice(0, 40),
      path: `skills/skill-${index}/SKILL.md`,
    },
    phenotypes: [`phenotype-${index}`],
    role: "method-development",
    methodSequence: index,
    contractQualified: true,
    benchmarkVersions: ["v2"],
    optimizationEvidence: index === 1 ? {
      classification: "quality-positive",
      evidencePath: `results/optimized/skill-${index}.json`,
      qualityComparisonComplete: true,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    } : index === 2 ? {
      classification: "efficiency-positive",
      evidencePath: `results/optimized/skill-${index}.json`,
      qualityComparisonComplete: true,
      allAttemptCostComplete: true,
      breakEvenComplete: true,
    } : {
      classification: "not-established",
      qualityComparisonComplete: false,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    },
    optimizationPath: index <= 2 ? {
      route: "direct-deterministic-artifact",
      reason: "source-contract-direct-compilation",
    } : {
      route: "stopped-before-dynamic",
      reason: "optimized-development-failed",
    },
    lifecycle: {
      benchmarkContract: { status: "passed", evidencePath: `results/contracts/skill-${index}.json` },
      baselineAdmission: { status: "passed", evidencePath: `results/baselines/skill-${index}.json` },
      staticFidelity: { status: "passed", evidencePath: `results/static/skill-${index}.json` },
      optimizedDevelopment: {
        status: index <= 2 ? "passed" : "failed",
        evidencePath: `results/optimized/skill-${index}.json`,
      },
      heldOutPromotion: { status: "not-run" },
    },
    automation: {
      generatesIr: true,
      generatesContract: true,
      generatesValidationPlan: true,
      generatesPackageCandidate: true,
    },
    adaptation: {
      measurementStatus: "prospective-measured",
      measurementStartedAt: "2026-08-01T00:00:00.000Z",
      measurementCompletedAt: "2026-08-01T01:00:00.000Z",
      humanMinutes: 70 - index * 5,
      adapterLoc: 140 - index * 10,
      artifactKinds: ["schemas"],
      reusedArtifactKinds: ["schemas"],
      coreBranchDelta: 0,
      unautomatedSteps: [],
    },
  }
}

function passingPortfolio(): any {
  const cases = Array.from({ length: 6 }, (_, index) => qualifiedCase(index + 1))
  return {
    schemaVersion: "skill-ir-method-portfolio/v3",
    portfolioId: "test-portfolio",
    minimumContractQualifiedCases: 6,
    requiredPhenotypes: cases.map((entry) => entry.phenotypes[0]),
    cases,
  }
}

function passingSelectionPolicy(): any {
  return {
    schemaVersion: "skill-ir-method-successor-selection-policy/v1",
    selectionId: "test-selection",
    selectedSkillId: "skill-1",
    targetPhenotype: "phenotype-1",
    selectionBoundary: "before-successor-contract",
    assessments: Array.from({ length: 6 }, (_, index) => ({
      skillId: `skill-${index + 1}`,
      artifactMechanism: index === 0 ? "deterministic-repair-package" : "none",
      informationComplementarity: index === 0 ? "high" : "low",
      nextRequiredStage: "benchmarkContract",
      exclusionReason: index === 0 ? null : "lower information complementarity",
    })),
  }
}

describe("method portfolio registry and readiness", () => {
  test("passes only when all five readiness dimensions are satisfied", () => {
    const report = evaluateMethodPortfolioReadiness(passingPortfolio())
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-method-portfolio-readiness/v3",
      passed: true,
      counts: {
        studiedCases: 6,
        contractQualifiedMethodCases: 6,
        readinessEligibleDevelopmentPhenotypes: 2,
        qualityPositiveDevelopmentPhenotypes: 1,
        efficiencyPositiveDevelopmentPhenotypes: 1,
        fidelityPreservingDevelopmentPhenotypes: 0,
        directDeterministicArtifactCases: 2,
        stoppedBeforeDynamicCases: 4,
      },
      gates: {
        enoughQualifiedCasesAndCoverage: true,
        lastThreeCoreBranchDeltaZero: true,
        automationAndAdaptationConverging: true,
        twoEvidenceQualifiedPhenotypes: true,
        noOpenMeasurementBlockers: true,
      },
    })
  })

  test("keeps each readiness gate independent", () => {
    const base = passingPortfolio()
    const insufficient = structuredClone(base)
    insufficient.cases[5]!.contractQualified = false
    insufficient.cases[5]!.lifecycle.benchmarkContract = {
      status: "failed",
      evidencePath: "results/contracts/skill-6.json",
      blocker: "benchmark-contract",
    }
    expect(evaluateMethodPortfolioReadiness(insufficient).gates.enoughQualifiedCasesAndCoverage).toBe(false)

    const coreDelta = structuredClone(base)
    coreDelta.cases[5]!.adaptation.coreBranchDelta = 1
    expect(evaluateMethodPortfolioReadiness(coreDelta).gates.lastThreeCoreBranchDeltaZero).toBe(false)

    const manual = structuredClone(base)
    manual.cases[5]!.automation.generatesPackageCandidate = false
    expect(evaluateMethodPortfolioReadiness(manual).gates.automationAndAdaptationConverging).toBe(false)

    const onePhenotype = structuredClone(base)
    onePhenotype.cases[1]!.optimizationEvidence.classification = "fidelity-preserving"
    onePhenotype.cases[1]!.optimizationEvidence.allAttemptCostComplete = false
    onePhenotype.cases[1]!.optimizationEvidence.breakEvenComplete = false
    const onePhenotypeReport = evaluateMethodPortfolioReadiness(onePhenotype)
    expect(onePhenotypeReport.gates.twoEvidenceQualifiedPhenotypes).toBe(false)
    expect(onePhenotypeReport.counts.fidelityPreservingDevelopmentPhenotypes).toBe(1)

    const blocked = structuredClone(base)
    blocked.cases[0]!.lifecycle.benchmarkContract = {
      status: "failed",
      evidencePath: "results/contracts/skill-1.json",
      blocker: "benchmark-contract",
    }
    blocked.cases[0]!.contractQualified = false
    expect(evaluateMethodPortfolioReadiness(blocked).gates.noOpenMeasurementBlockers).toBe(false)
  })

  test("rejects duplicate upstream skills, role conflicts, invalid costs, and invalid core deltas", () => {
    const duplicate = passingPortfolio()
    duplicate.cases[1]!.upstreamIdentity = duplicate.cases[0]!.upstreamIdentity
    expect(() => MethodPortfolioSchema.parse(duplicate)).toThrow("duplicate upstream skill")

    const replication = passingPortfolio()
    replication.cases[0]!.role = "untouched-replication" as "method-development"
    expect(() => MethodPortfolioSchema.parse(replication)).toThrow("non-method case")

    const negative = passingPortfolio()
    negative.cases[0]!.adaptation.humanMinutes = -1
    expect(() => MethodPortfolioSchema.parse(negative)).toThrow()

    const fractional = passingPortfolio()
    fractional.cases[0]!.adaptation.coreBranchDelta = 0.5
    expect(() => MethodPortfolioSchema.parse(fractional)).toThrow()

    const missingProspectiveCost = passingPortfolio()
    missingProspectiveCost.cases[0]!.adaptation.humanMinutes = null
    expect(() => MethodPortfolioSchema.parse(missingProspectiveCost)).toThrow("prospective adaptation evidence")

    const incompleteEfficiency = passingPortfolio()
    incompleteEfficiency.cases[1]!.optimizationEvidence.breakEvenComplete = false
    expect(() => MethodPortfolioSchema.parse(incompleteEfficiency)).toThrow("efficiency-positive")

    const historical = passingPortfolio()
    historical.cases[0]!.adaptation = {
      measurementStatus: "historical-unavailable",
      measurementStartedAt: null,
      measurementCompletedAt: null,
      humanMinutes: null,
      adapterLoc: null,
      artifactKinds: ["schemas"],
      reusedArtifactKinds: [],
      coreBranchDelta: null,
      unautomatedSteps: ["historical timing was not recorded prospectively"],
    }
    expect(MethodPortfolioSchema.parse(historical).cases[0]!.adaptation.measurementStatus)
      .toBe("historical-unavailable")
  })

  test("records an audited case whose distinguishability calibration has not run", () => {
    const pending = passingPortfolio()
    pending.cases[5]!.lifecycle.baselineAdmission = {
      status: "not-run",
      blocker: "distinguishability-not-run",
    }
    expect(MethodPortfolioSchema.parse(pending).cases[5]!.lifecycle.baselineAdmission)
      .toEqual({ status: "not-run", blocker: "distinguishability-not-run" })
  })

  test("keeps execution observability separate from contract qualification", () => {
    const blocked = passingPortfolio()
    blocked.cases[5]!.lifecycle.staticFidelity = {
      status: "blocked",
      blocker: "execution-observability",
    }
    const report = evaluateMethodPortfolioReadiness(blocked)
    expect(report.counts.contractQualifiedMethodCases).toBe(6)
    expect(report.gates.enoughQualifiedCasesAndCoverage).toBe(true)
    expect(report.gates.noOpenMeasurementBlockers).toBe(false)
    expect(report.gaps.openMeasurementBlockers).toContainEqual({
      skillId: "skill-6",
      stage: "staticFidelity",
      blocker: "execution-observability",
    })
  })

  test("derives qualification and phenotype counts from distinct lifecycle stages", () => {
    const portfolio = passingPortfolio()
    portfolio.cases[0]!.lifecycle.staticFidelity.status = "failed"
    portfolio.cases[0]!.lifecycle.optimizedDevelopment.status = "not-run"
    portfolio.cases[0]!.optimizationEvidence = {
      classification: "not-established",
      qualityComparisonComplete: false,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    }
    portfolio.cases[1]!.lifecycle.baselineAdmission = {
      status: "invalidated",
      blocker: "scorer-authority",
      evidencePath: "results/baselines/skill-2.json",
    }

    const report = evaluateMethodPortfolioReadiness(portfolio)
    expect(report.counts.contractQualifiedMethodCases).toBe(6)
    expect(report.counts.passedStaticFidelityCases).toBe(5)
    expect(report.counts.readinessEligibleDevelopmentPhenotypes).toBe(0)
    expect(report.gaps.openMeasurementBlockers).toContainEqual({
      skillId: "skill-2",
      stage: "baselineAdmission",
      blocker: "scorer-authority",
    })
  })

  test("rejects a compatibility summary that disagrees with benchmark contract lifecycle", () => {
    const portfolio = passingPortfolio()
    portfolio.cases[0]!.contractQualified = false
    expect(() => MethodPortfolioSchema.parse(portfolio)).toThrow("contractQualified summary drift")
  })

  test("derives a skill-neutral successor report and rejects post-hoc candidate omission", () => {
    const portfolio = passingPortfolio()
    const policy = passingSelectionPolicy()
    const report = evaluateMethodSuccessorSelection(portfolio, policy)
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-method-successor-selection-report/v1",
      selectedSkillId: "skill-1",
      targetPhenotype: "phenotype-1",
    })
    expect(report.candidates).toHaveLength(6)
    expect(report.candidates[0]).toEqual({
      skillId: "skill-1",
      phenotypeCoverage: ["phenotype-1"],
      benchmarkContractStatus: "passed",
      baselineAdmissionStatus: "passed",
      artifactMechanism: "deterministic-repair-package",
      informationComplementarity: "high",
      nextRequiredStage: "benchmarkContract",
      exclusionReason: null,
    })

    const omitted = structuredClone(policy)
    omitted.assessments.pop()
    expect(() => evaluateMethodSuccessorSelection(portfolio, omitted)).toThrow("exactly one assessment")

    const retrospectivelyExcluded = structuredClone(policy)
    retrospectivelyExcluded.assessments[0]!.exclusionReason = "failed later"
    expect(() => MethodSuccessorSelectionPolicySchema.parse(retrospectivelyExcluded))
      .toThrow("selected candidate cannot have an exclusion reason")
  })

  test("reports the real portfolio as not ready without inflating benchmark versions", async () => {
    const portfolio = await readMethodPortfolio({ rootDir, portfolioPath })
    const report = evaluateMethodPortfolioReadiness(portfolio)

    expect(portfolio.cases).toHaveLength(7)
    expect(report.passed).toBe(false)
    expect(report.counts).toMatchObject({
      studiedCases: 7,
      contractQualifiedMethodCases: 7,
      untouchedReplicationCases: 0,
    })
    expect(report.gaps.missingQualifiedCases).toBe(0)
    expect(report.gaps.openMeasurementBlockers).toEqual([
      { skillId: "zh-readme", stage: "baselineAdmission", blocker: "scorer-authority" },
    ])
    expect(portfolio.cases[1]).toMatchObject({
      skillId: "law-to-markdown",
      contractQualified: true,
      benchmarkVersions: ["v1", "v2-public-contract", "v3-public-output-abi"],
      lifecycle: {
        benchmarkContract: { status: "passed" },
        baselineAdmission: {
          status: "failed",
          blocker: "baseline-regression",
        },
        optimizedDevelopment: {
          status: "invalidated",
          blocker: "benchmark-contract",
        },
        heldOutPromotion: {
          status: "invalidated",
          blocker: "benchmark-contract",
        },
      },
      legacyDevelopmentEvidence: {
        status: "failed",
        resultPath: "results/skill-ir/law-to-markdown-v3-public-output-abi-calibration-v1/measurement-validity.json",
      },
    })
    expect(portfolio.cases[5]).toMatchObject({
      skillId: "zh-readme",
      role: "method-development",
      methodSequence: 6,
      contractQualified: true,
      benchmarkVersions: ["zh-readme-development-v1", "zh-readme-development-v2"],
      lifecycle: {
        benchmarkContract: { status: "passed" },
        baselineAdmission: {
          status: "invalidated",
          blocker: "scorer-authority",
          evidencePath: "results/skill-ir/zrm-pi-v2/measurement-validity.json",
        },
      },
    })
    expect(portfolio.cases[6]).toMatchObject({
      skillId: "i18n-helper",
      role: "method-development",
      methodSequence: 7,
      contractQualified: true,
      benchmarkVersions: [
        "react-i18next-v1",
        "v2-public-output-abi",
        "v3-array-semantics",
        "contribution-v1",
        "contribution-v2-public-semantics",
      ],
      lifecycle: {
        benchmarkContract: { status: "passed" },
        baselineAdmission: { status: "passed" },
        staticFidelity: {
          status: "failed",
          blocker: "quality-regression",
          evidencePath: "results/skill-ir/ihc-static-v4/gate-report.json",
        },
        optimizedDevelopment: {
          status: "blocked",
          blocker: "quality-regression",
        },
      },
    })
    expect(report.counts).toMatchObject({
      passedStaticFidelityCases: 2,
      readinessEligibleDevelopmentPhenotypes: 1,
      qualityPositiveDevelopmentPhenotypes: 1,
      efficiencyPositiveDevelopmentPhenotypes: 0,
      fidelityPreservingDevelopmentPhenotypes: 1,
      dynamicProfileCases: 0,
      directDeterministicArtifactCases: 2,
      staticSufficientCases: 1,
      stoppedBeforeDynamicCases: 4,
    })
    expect(report.gates.twoEvidenceQualifiedPhenotypes).toBe(false)
  })

  test("writes the readiness report as a stable machine-readable artifact", async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), "skvm-method-portfolio-"))
    const outputPath = path.join(outputRoot, "readiness.json")
    try {
      const report = await writeMethodPortfolioReadinessReport({ rootDir, portfolioPath, outputPath })
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
      expect(report.passed).toBe(false)
    } finally {
      await rm(outputRoot, { recursive: true, force: true })
    }
  })

  test("writes the successor selection report as compact evidence", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "skill-ir-successor-selection-"))
    const portfolioFile = path.join(temp, "portfolio.json")
    const policyFile = path.join(temp, "policy.json")
    const output = path.join(temp, "selection-report.json")
    try {
      await writeFile(portfolioFile, JSON.stringify(passingPortfolio()), "utf8")
      await writeFile(policyFile, JSON.stringify(passingSelectionPolicy()), "utf8")
      const report = await writeMethodSuccessorSelectionReport({
        rootDir: temp,
        portfolioPath: portfolioFile,
        policyPath: policyFile,
        outputPath: output,
      })
      expect(report.selectedSkillId).toBe("skill-1")
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual(report)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })
})
