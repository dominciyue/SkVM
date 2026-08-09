import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  MethodPortfolioSchema,
  evaluateMethodPortfolioReadiness,
  readMethodPortfolio,
  writeMethodPortfolioReadinessReport,
} from "./method-portfolio.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const portfolioPath = path.join(rootDir, "benchmarks/skill-ir/corpus/method-portfolio.json")

function qualifiedCase(index: number) {
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
    developmentGate: { status: index <= 2 ? "passed" : "failed" },
    automation: {
      generatesIr: true,
      generatesContract: true,
      generatesValidationPlan: true,
      generatesPackageCandidate: true,
    },
    adaptation: {
      humanMinutes: 70 - index * 5,
      adapterLoc: 140 - index * 10,
      artifactKinds: ["schemas"],
      coreBranchDelta: 0,
      unautomatedSteps: [],
    },
    blockers: [] as string[],
  }
}

function passingPortfolio() {
  const cases = Array.from({ length: 6 }, (_, index) => qualifiedCase(index + 1))
  return {
    schemaVersion: "skill-ir-method-portfolio/v1",
    portfolioId: "test-portfolio",
    minimumContractQualifiedCases: 6,
    requiredPhenotypes: cases.map((entry) => entry.phenotypes[0]),
    cases,
  }
}

describe("method portfolio registry and readiness", () => {
  test("passes only when all five readiness dimensions are satisfied", () => {
    const report = evaluateMethodPortfolioReadiness(passingPortfolio())
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-method-portfolio-readiness/v1",
      passed: true,
      counts: { studiedCases: 6, contractQualifiedMethodCases: 6, passedDevelopmentPhenotypes: 2 },
      gates: {
        enoughQualifiedCasesAndCoverage: true,
        lastThreeCoreBranchDeltaZero: true,
        automationAndAdaptationConverging: true,
        twoPhenotypesPassedDevelopment: true,
        noOpenMeasurementBlockers: true,
      },
    })
  })

  test("keeps each readiness gate independent", () => {
    const base = passingPortfolio()
    const insufficient = structuredClone(base)
    insufficient.cases[5]!.contractQualified = false
    expect(evaluateMethodPortfolioReadiness(insufficient).gates.enoughQualifiedCasesAndCoverage).toBe(false)

    const coreDelta = structuredClone(base)
    coreDelta.cases[5]!.adaptation.coreBranchDelta = 1
    expect(evaluateMethodPortfolioReadiness(coreDelta).gates.lastThreeCoreBranchDeltaZero).toBe(false)

    const manual = structuredClone(base)
    manual.cases[5]!.automation.generatesPackageCandidate = false
    expect(evaluateMethodPortfolioReadiness(manual).gates.automationAndAdaptationConverging).toBe(false)

    const onePhenotype = structuredClone(base)
    onePhenotype.cases[1]!.developmentGate.status = "failed"
    expect(evaluateMethodPortfolioReadiness(onePhenotype).gates.twoPhenotypesPassedDevelopment).toBe(false)

    const blocked = structuredClone(base)
    blocked.cases[0]!.blockers = ["benchmark-contract"]
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
  })

  test("records an audited case whose distinguishability calibration has not run", () => {
    const pending = passingPortfolio()
    pending.cases[5]!.blockers = ["distinguishability-not-run"]
    expect(MethodPortfolioSchema.parse(pending).cases[5]!.blockers).toEqual(["distinguishability-not-run"])
  })

  test("keeps execution observability separate from contract qualification", () => {
    const blocked = passingPortfolio()
    blocked.cases[5]!.blockers = ["execution-observability"]
    const report = evaluateMethodPortfolioReadiness(blocked)
    expect(report.counts.contractQualifiedMethodCases).toBe(6)
    expect(report.gates.enoughQualifiedCasesAndCoverage).toBe(true)
    expect(report.gates.noOpenMeasurementBlockers).toBe(false)
    expect(report.gaps.openMeasurementBlockers).toContainEqual({
      skillId: "skill-6",
      blocker: "execution-observability",
    })
  })

  test("reports the real portfolio as not ready without inflating benchmark versions", async () => {
    const portfolio = await readMethodPortfolio({ rootDir, portfolioPath })
    const report = evaluateMethodPortfolioReadiness(portfolio)

    expect(portfolio.cases).toHaveLength(7)
    expect(report.passed).toBe(false)
    expect(report.counts).toMatchObject({
      studiedCases: 7,
      contractQualifiedMethodCases: 6,
      untouchedReplicationCases: 0,
    })
    expect(report.gaps.missingQualifiedCases).toBe(0)
    expect(report.gaps.openMeasurementBlockers.length).toBeGreaterThan(0)
    expect(portfolio.cases[1]).toMatchObject({
      skillId: "law-to-markdown",
      contractQualified: true,
      benchmarkVersions: ["v1", "v2-public-contract", "v3-public-output-abi"],
      developmentGate: {
        status: "failed",
        resultPath: "results/skill-ir/law-to-markdown-v3-public-output-abi-calibration-v1/measurement-validity.json",
      },
      blockers: ["heldout-regression"],
    })
    expect(portfolio.cases[5]).toMatchObject({
      skillId: "zh-readme",
      role: "method-development",
      methodSequence: 6,
      contractQualified: true,
      benchmarkVersions: ["zh-readme-development-v1", "zh-readme-development-v2"],
      developmentGate: {
        status: "failed",
        resultPath: "results/skill-ir/zrm-pi-v2/gate-report.json",
      },
      blockers: ["scorer-authority"],
    })
    expect(portfolio.cases[6]).toMatchObject({
      skillId: "i18n-helper",
      role: "method-development",
      methodSequence: 7,
      contractQualified: true,
      benchmarkVersions: ["react-i18next-v1", "v2-public-output-abi", "v3-array-semantics"],
      developmentGate: {
        status: "failed",
        resultPath: "results/skill-ir/i18n-helper-v3-execution-observable-calibration-v3/gate-report.json",
      },
      blockers: ["baseline-saturation"],
    })
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
})
