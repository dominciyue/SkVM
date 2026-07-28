import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  buildBenchmarkEvidenceReport,
  compareMeasurementContracts,
  evidenceRef,
  projectRawRuntimeEvidence,
  summarizeRunnerBoundary,
  summarizeSkillOptimization,
  verifyEvidenceRefs,
} from "./benchmark-evidence.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })))
})

function audit(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "skill-ir-benchmark-contract-audit-run-report/v1",
    auditId: "audit",
    skillId: "experimental-design",
    staticStatus: "failed",
    status: "failed",
    counts: { tasks: 2, criteria: 6, requirements: 13, canaries: 8 },
    canaries: [
      { id: "a", role: "alternative-valid", expectedPass: true, actualPass: true, status: "matched" },
      { id: "b", role: "alternative-valid", expectedPass: true, actualPass: false, status: "mismatched" },
    ],
    issues: [
      { code: "CANARY_OUTCOME_MISMATCH", subjectId: "b" },
      { code: "EXACT_CONTRACT_NOT_PUBLIC", subjectId: "private" },
    ],
    claimBoundary: "not task success",
    ...overrides,
  }
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "skill-ir-pre-ir-calibration-gate-report/v1",
    calibrationId: "calibration",
    methodEvidence: false,
    passed: false,
    counts: {
      expectedRows: 8,
      observedRows: 8,
      expectedPairs: 4,
      completePairs: 4,
      infrastructureFailures: 4,
      noSkillSemanticFailures: 1,
      comparablePairs: 1,
      differingPairs: 1,
    },
    systems: {
      "no-skill": { rows: 4, successes: 2, meanScore: 0.525, inputTokens: 1, outputTokens: 1, aggregateTokens: 2 },
      original: { rows: 4, successes: 0, meanScore: 0.0625, inputTokens: 1, outputTokens: 1, aggregateTokens: 2 },
    },
    gates: {
      completeRows: true,
      completePairs: true,
      zeroInfrastructure: false,
      noSkillNonSaturated: true,
      distinguishable: true,
    },
    interpretation: { heldOutAllowed: false, entersMainClaim: false },
    ...overrides,
  }
}

describe("benchmark measurement evidence", () => {
  test("proves v2 dominance only from measurement-contract dimensions", () => {
    const v1 = audit()
    const v2 = audit({
      skillId: "experimental-design-v2",
      staticStatus: "passed",
      status: "passed",
      counts: { tasks: 2, criteria: 5, requirements: 10, canaries: 42 },
      canaries: Array.from({ length: 42 }, (_, index) => ({
        id: `c-${index}`,
        role: index < 10 ? "alternative-valid" : "invalid-control",
        expectedPass: index < 10,
        actualPass: index < 10,
        status: "matched",
      })),
      issues: [],
    })
    const materialization = {
      schemaVersion: "skill-ir-materialization-audit-report/v1",
      auditId: "materialization",
      contractRevision: "materialized-delta/v1",
      status: "passed",
      counts: { tasks: 2, arms: 4, checks: 36, passed: 36 },
      arms: [],
      issues: [],
      claimBoundary: "not task success",
    }

    const result = compareMeasurementContracts(v1, v2, materialization)
    expect(result.conclusion).toBe("v2-measurement-contract-dominates")
    expect(result.proof.noRegressions).toBe(true)
    expect(result.proof.strictImprovements).toContain("canary-match-rate")
    expect(result.v1.alternativeValidRejected).toBe(1)
    expect(result.v2.alternativeValidRejected).toBe(0)
    expect(result.claimBoundary.skillOptimizationProven).toBe(false)
  })

  test("fails closed when v2 regresses on an audited measurement dimension", () => {
    const v1 = audit({ status: "passed", staticStatus: "passed", issues: [] })
    const v2 = audit({ status: "passed", staticStatus: "passed", issues: [
      { code: "EXACT_CONTRACT_NOT_PUBLIC", subjectId: "new-private" },
    ] })
    const materialization = {
      schemaVersion: "skill-ir-materialization-audit-report/v1",
      auditId: "materialization",
      contractRevision: "materialized-delta/v1",
      status: "passed",
      counts: { tasks: 2, arms: 4, checks: 1, passed: 1 },
      arms: [], issues: [], claimBoundary: "not task success",
    }
    expect(() => compareMeasurementContracts(v1, v2, materialization))
      .toThrow("measurement regression")
  })
})

describe("runner boundary evidence", () => {
  test("separates a shared orchestrator from unproven crash causality", () => {
    const result = summarizeRunnerBoundary({
      v1Plan: {
        frozenRunnerPaths: ["src/benchmarks/skill-ir/real-agent-run.ts"],
        adapter: "bare-agent",
        commands: [["bun", "run", "skvm", "run"]],
        initialWorkdirManifestRows: 0,
        nodeHttpHelperBound: false,
      },
      v2Plan: {
        frozenRunnerPaths: ["src/benchmarks/skill-ir/real-agent-run.ts"],
        adapter: "bare-agent",
        commands: [["pinned-bun.exe", "run", "src/index.ts", "run"]],
        initialWorkdirManifestRows: 8,
        nodeHttpHelperBound: true,
      },
      v1Raw: { rows: 8, bunInternalAssertions: 0, nonzeroExits: 0 },
      v2Raw: { rows: 8, bunInternalAssertions: 4, nonzeroExits: 4 },
    })
    expect(result.sharedMatrixRunner).toBe(true)
    expect(result.sharedAdapter).toBe(true)
    expect(result.differences).toEqual([
      "command-entry",
      "initial-workdir-manifest",
      "node-http-helper",
    ])
    expect(result.conclusion).toBe("runner-only-cause-not-established")
    expect(result.paidRerunAllowed).toBe(false)
  })
})

describe("current Skill optimization ledger", () => {
  test("keeps mechanism, development, held-out, and benchmark evidence distinct", () => {
    const ledger = summarizeSkillOptimization({
      envManager: {
        pairedGenerations: 3,
        preMeanScore: 0.9,
        postMeanScore: 1,
        infrastructureFailures: 1,
        developmentGatePassed: false,
        heldOutExecuted: false,
      },
      lawToMarkdown: {
        developmentGatePassed: true,
        developmentArtifactMean: 0.925,
        developmentStaticMean: 0.8,
        heldOutGatePassed: false,
        heldOutArtifactMean: 0.725,
        heldOutStaticMean: 0.8375,
        heldOutRegressions: 2,
        breakEvenAvailable: false,
      },
      experimentalDesign: {
        measurementContractPassed: true,
        baselineGatePassed: false,
        infrastructureFailures: 4,
        comparablePairs: 1,
        baseIrAuditAllowed: false,
        heldOutExecuted: false,
      },
    })
    expect(ledger.projectStatus).toBe("partial-mechanism-evidence")
    expect(ledger.skills[0]!.status).toBe("development-mechanism-positive-gate-failed")
    expect(ledger.skills[1]!.status).toBe("development-positive-heldout-regressed")
    expect(ledger.skills[2]!.status).toBe("measurement-valid-baseline-blocked")
    expect(ledger.claims.crossSkillStabilityImproved).toBe(false)
    expect(ledger.claims.tokenBreakEvenProven).toBe(false)
  })
})

describe("combined report", () => {
  test("never promotes operational evidence into an optimization claim", () => {
    const report = buildBenchmarkEvidenceReport({
      measurement: {
        conclusion: "v2-measurement-contract-dominates",
        proof: { noRegressions: true, strictImprovements: ["canary-match-rate"] },
      },
      operational: {
        v1: gate({ counts: { ...gate().counts, infrastructureFailures: 0, comparablePairs: 4 } }),
        v2: gate(),
      },
      runnerBoundary: {
        conclusion: "runner-only-cause-not-established",
        paidRerunAllowed: false,
      },
      optimization: {
        projectStatus: "partial-mechanism-evidence",
      },
    })
    expect(report.claimBoundary.v2MeasurementContractBetterSupported).toBe(true)
    expect(report.claimBoundary.v2RealDiscriminationProven).toBe(false)
    expect(report.claimBoundary.fullSkillOptimizationClaimProven).toBe(false)
    expect(report.claimBoundary.heldOutGeneralizationProven).toBe(false)
  })
})

describe("evidence provenance", () => {
  test("detects evidence mutation after a report is generated", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-ir-benchmark-evidence-"))
    temporaryRoots.push(root)
    const path = join(root, "audit.json")
    await writeFile(path, "{\"status\":\"passed\"}\n", "utf8")
    const ref = await evidenceRef(root, path)
    expect(ref.path).toBe("audit.json")
    await expect(verifyEvidenceRefs(root, [ref])).resolves.toBeUndefined()

    await writeFile(path, "{\"status\":\"failed\"}\n", "utf8")
    await expect(verifyEvidenceRefs(root, [ref])).rejects.toThrow("digest mismatch")
  })

  test("projects raw rows without retaining stream bodies", () => {
    const raw = [
      JSON.stringify({ exitCode: 0, durationMs: 10, stderr: "", stdout: "model text" }),
      JSON.stringify({
        exitCode: 3,
        durationMs: 30,
        stderr: "panic(main thread): Internal assertion failure; Bun has crashed",
        stdout: "partial model text",
      }),
    ].join("\n")
    const result = projectRawRuntimeEvidence(raw)
    expect(result).toEqual({
      rows: 2,
      bunInternalAssertions: 1,
      nonzeroExits: 1,
      durationMs: { minimum: 10, median: 20, maximum: 30 },
    })
    expect(JSON.stringify(result)).not.toContain("model text")
    expect(JSON.stringify(result)).not.toContain("panic(main thread)")
  })
})
