import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  PartialBenefitReentryPolicySchema,
  evaluatePartialBenefitReentry,
  readAndEvaluatePartialBenefitReentry,
} from "./partial-benefit-reentry.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const policyPath = path.join(
  rootDir,
  "benchmarks/skill-ir/corpus/partial-benefit-reentry/api-tester-v1.json",
)
const gatePath = path.join(rootDir, "results/skill-ir/at-pi-v1/gate-report.json")

async function inputs() {
  const policy = JSON.parse(await readFile(policyPath, "utf8"))
  const gate = JSON.parse(await readFile(gatePath, "utf8"))
  return { policy, gate }
}

describe("prospective partial-benefit re-entry", () => {
  test("admits the frozen API Tester evidence without changing its failed gate", async () => {
    const report = await readAndEvaluatePartialBenefitReentry({ rootDir, policyPath })

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-partial-benefit-reentry-report/v1",
      policyId: "api-tester-partial-benefit-reentry-v1",
      skillId: "api-tester",
      admitted: true,
      oldGatePassed: false,
      gates: {
        completeRows: true,
        completePairs: true,
        zeroInfrastructure: true,
        distinguishable: true,
        originalPositivePair: true,
        originalMeanAboveNoSkill: true,
        sourceAttributableResidual: true,
        oldGateStillFailed: true,
      },
      claimBoundary: {
        methodDevelopmentOnly: true,
        createsBaseIr: false,
        permitsHeldOut: false,
        untouchedReplication: false,
        rewritesOldGate: false,
      },
    })
  })

  test("rejects incomplete, infrastructure, indistinguishable, and non-positive evidence", async () => {
    const { policy, gate } = await inputs()
    const cases = [
      { ...gate, counts: { ...gate.counts, observedRows: 7 } },
      { ...gate, counts: { ...gate.counts, infrastructureFailures: 1 } },
      { ...gate, counts: { ...gate.counts, differingPairs: 0 } },
      {
        ...gate,
        systems: { ...gate.systems, original: { ...gate.systems.original, meanScore: 0.1 } },
        pairs: gate.pairs.map((pair: Record<string, unknown>) => ({ ...pair, scoreDelta: -0.1 })),
      },
    ]

    for (const candidate of cases) {
      expect(evaluatePartialBenefitReentry(policy, candidate).admitted).toBe(false)
    }
  })

  test("rejects policy drift, forbidden gold sinks, and a source digest mismatch", async () => {
    const { policy, gate } = await inputs()
    expect(() => PartialBenefitReentryPolicySchema.parse({
      ...policy,
      admission: { ...policy.admission, minimumDifferingPairs: 0 },
    })).toThrow()
    expect(() => PartialBenefitReentryPolicySchema.parse({
      ...policy,
      residual: { ...policy.residual, evaluatorPayload: { expected: ["TEST_ONLY_GOLD"] } },
    })).toThrow()
    await expect(readAndEvaluatePartialBenefitReentry({
      rootDir,
      policyPath,
      sourceDigestOverride: "0".repeat(64),
    })).rejects.toThrow("digest mismatch")
    expect(gate.passed).toBe(false)
  })
})
