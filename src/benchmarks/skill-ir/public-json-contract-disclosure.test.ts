import { describe, expect, test } from "bun:test"
import { auditPublicJsonContractDisclosure } from "./public-json-contract-disclosure.ts"

describe("public JSON contract disclosure", () => {
  test("passes when every evaluator-observed field is public", () => {
    expect(auditPublicJsonContractDisclosure({
      outputPath: "report.json",
      publicFieldPaths: [
        "/analysis",
        "/analysis/test",
        "/sampleSize",
        "/sampleSize/analyzed",
        "/sampleSize/analyzed/group1",
      ],
      evaluatorFieldPaths: [
        "/analysis/test",
        "/sampleSize/analyzed/group1",
      ],
    })).toEqual({
      schemaVersion: "skill-ir-public-json-contract-disclosure-audit/v1",
      outputPath: "report.json",
      status: "passed",
      counts: { publicFieldPaths: 5, evaluatorFieldPaths: 2, undisclosedEvaluatorFieldPaths: 0 },
      undisclosedEvaluatorFieldPaths: [],
    })
  })

  test("does not treat a declared parent object as disclosure of hidden child fields", () => {
    const report = auditPublicJsonContractDisclosure({
      outputPath: "power-analysis.json",
      publicFieldPaths: [
        "/analysis",
        "/sampleSize",
        "/sensitivity",
        "/sensitivity/*/inputEffect",
      ],
      evaluatorFieldPaths: [
        "/analysis/test",
        "/analysis/adjustedAlpha",
        "/sampleSize/analyzed/group1",
        "/sensitivity/*/inputEffect",
      ],
    })

    expect(report.status).toBe("failed")
    expect(report.undisclosedEvaluatorFieldPaths).toEqual([
      "/analysis/adjustedAlpha",
      "/analysis/test",
      "/sampleSize/analyzed/group1",
    ])
  })

  test("rejects duplicate or unsafe paths instead of weakening the comparison", () => {
    expect(() => auditPublicJsonContractDisclosure({
      outputPath: "report.json",
      publicFieldPaths: ["/analysis/test", "/analysis/test"],
      evaluatorFieldPaths: ["/analysis/test"],
    })).toThrow()
    expect(() => auditPublicJsonContractDisclosure({
      outputPath: "report.json",
      publicFieldPaths: ["analysis/test"],
      evaluatorFieldPaths: ["/analysis/test"],
    })).toThrow()
    expect(() => auditPublicJsonContractDisclosure({
      outputPath: "report.json",
      publicFieldPaths: ["/sensitivity/item*"],
      evaluatorFieldPaths: ["/sensitivity/*/inputEffect"],
    })).toThrow()
  })
})
