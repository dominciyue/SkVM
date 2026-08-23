import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { buildBidsValueSemanticsPreflight } from "./bids-value-semantics-preflight.ts"

const rootDir = process.cwd()
const publicInterfacePath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/bids/public-interface.json",
)
const oldAuditPath = path.join(rootDir, "results/skill-ir/bids-contract-audit-v1/report.json")
const residualAuditPath = path.join(
  rootDir,
  "results/skill-ir/bids-prospective-development-v1/residual-audit.json",
)

describe("BIDS v1 value-semantics preflight", () => {
  test("blocks before paid execution when pointer disclosure passes but value semantics are hidden", async () => {
    const [publicBefore, oldAuditBefore, residualBefore] = await Promise.all([
      readFile(publicInterfacePath),
      readFile(oldAuditPath),
      readFile(residualAuditPath),
    ])

    const report = await buildBidsValueSemanticsPreflight({ rootDir })

    expect(report.status).toBe("blocked-before-paid")
    expect(report.pointerDisclosure.status).toBe("passed")
    expect(report.pointerDisclosure.counts).toEqual({
      publicFieldPaths: 17,
      evaluatorFieldPaths: 17,
      undisclosedEvaluatorFieldPaths: 0,
    })
    expect(report.valueSemanticsDisclosure.status).toBe("failed")
    expect(report.valueSemanticsDisclosure.counts).toEqual({
      publicSemantics: 2,
      evaluatorSemantics: 7,
      undisclosedEvaluatorSemantics: 5,
      mismatchedEvaluatorSemantics: 0,
      canaries: 17,
      missingCanaryRoles: 0,
      failedCanaries: 0,
    })
    expect(report.valueSemanticsDisclosure.undisclosedEvaluatorSemanticIds).toEqual([
      "affected-path-canonical-role",
      "evidence-path-canonical-role",
      "issue-element-identity",
      "report-path-normalization",
      "summary-count-relationship",
    ])
    expect(report.historicalEvidence).toEqual({
      pointerAuditPreserved: true,
      residualInvalidityPreserved: true,
      residualAuditConsumed: true,
      modelOutputContentConsumed: false,
      heldOutConsumed: false,
    })
    expect(report.authorizations).toEqual({
      qualification: false,
      paidExecution: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    })

    const [publicAfter, oldAuditAfter, residualAfter] = await Promise.all([
      readFile(publicInterfacePath),
      readFile(oldAuditPath),
      readFile(residualAuditPath),
    ])
    expect(publicAfter).toEqual(publicBefore)
    expect(oldAuditAfter).toEqual(oldAuditBefore)
    expect(residualAfter).toEqual(residualBefore)
  })

  test("binds only public, scorer, development, and frozen audit evidence", async () => {
    const report = await buildBidsValueSemanticsPreflight({ rootDir })
    const paths = report.inputs.map((input) => input.path)

    expect(paths).toContain("benchmarks/skill-ir/pilots/bids/public-interface.json")
    expect(paths).toContain("src/bench/evaluators/bids-grade.ts")
    expect(paths).toContain("src/benchmarks/skill-ir/bids-value-semantics-preflight.ts")
    expect(paths).toContain("results/skill-ir/bids-contract-audit-v1/report.json")
    expect(paths).toContain("results/skill-ir/bids-prospective-development-v1/residual-audit.json")
    expect(paths.some((inputPath) => /held.?out|raw-runs|model-output|workdirs/iu.test(inputPath))).toBe(false)
  })
})
