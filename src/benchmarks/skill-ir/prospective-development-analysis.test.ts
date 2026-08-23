import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { validateProspectiveDevelopmentAnalysisPolicy } from "./prospective-development-analysis"

const rootDir = path.resolve(import.meta.dir, "../../..")
const policyPath = "benchmarks/skill-ir/pilots/bids/prospective-development-analysis-policy.json"

describe("prospective development analysis policy", () => {
  test("freezes paired contribution, static, and artifact estimands before matrix execution", async () => {
    const policy = await validateProspectiveDevelopmentAnalysisPolicy(
      JSON.parse(await readFile(path.join(rootDir, policyPath), "utf8")), rootDir,
    )
    expect(policy.denominator).toEqual({ modelRows: 12, deterministicControlRows: 4 })
    expect(policy.estimands.map((item) => item.id)).toEqual([
      "original-minus-no-skill",
      "ir-static-minus-original",
      "validated-artifact-minus-original",
    ])
    expect(policy.measurementEligibility).toMatchObject({
      requiredModelRows: 12,
      requiredScoredModelRows: 12,
      maximumActiveExecutionFailures: 1,
      maximumParserOrRuntimeBlockers: 0,
    })
    expect(policy.dynamicTrigger).toEqual({
      mode: "residual-driven-only",
      maximumConditionalPaidCalls: 4,
      authorized: false,
    })
    expect(policy.authorizations).toEqual({ modelMatrix: true, deterministicControl: true, dynamic: false, heldOut: false })
  })

  test("fails closed against a stale qualification digest", async () => {
    const policy = JSON.parse(await readFile(path.join(rootDir, policyPath), "utf8"))
    policy.qualification.sha256 = "0".repeat(64)
    await expect(validateProspectiveDevelopmentAnalysisPolicy(policy, rootDir)).rejects.toThrow("digest mismatch")
  })
})
