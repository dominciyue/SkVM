import { describe, expect, test } from "bun:test"
import {
  auditPublicJsonContractDisclosure,
  auditPublicJsonValueSemanticsDisclosure,
  type PublicJsonValueSemanticDeclaration,
  type PublicJsonValueSemanticCanary,
} from "./public-json-contract-disclosure.ts"

const semantics: PublicJsonValueSemanticDeclaration[] = [
  {
    id: "canonical-path-role",
    kind: "canonical-value",
    rule: "logical-data-file-path",
    targets: [{ role: "value", path: "/issues/*/affectedPath" }],
    description: "The affected path identifies the logical data file that exhibits the issue.",
  },
  {
    id: "path-representation-equivalence",
    kind: "representation-equivalence",
    rule: "posix-relative-path-equivalence",
    targets: [{ role: "value", path: "/issues/*/affectedPath" }],
    description: "Equivalent POSIX-relative spellings identify the same logical path.",
  },
  {
    id: "issue-element-identity",
    kind: "array-element-identity",
    rule: "code-path-field-composite-key",
    targets: [
      { role: "array", path: "/issues" },
      { role: "identity-code", path: "/issues/*/code" },
      { role: "identity-path", path: "/issues/*/affectedPath" },
    ],
    description: "Issue elements are identified by their declared composite key.",
  },
  {
    id: "path-normalization",
    kind: "normalization",
    rule: "posix-relative-no-dot-segments",
    targets: [{ role: "value", path: "/issues/*/affectedPath" }],
    description: "Paths use POSIX separators and contain no dot segments.",
  },
  {
    id: "summary-count-relationship",
    kind: "cross-field-relationship",
    rule: "count-equals-array-length",
    targets: [
      { role: "array", path: "/issues" },
      { role: "count", path: "/summary/issueCount" },
    ],
    description: "The summary issue count equals the number of issues.",
  },
]

function canariesFor(
  declaration: PublicJsonValueSemanticDeclaration,
): PublicJsonValueSemanticCanary[] {
  const roles = declaration.kind === "representation-equivalence"
      || declaration.kind === "array-element-identity"
      || declaration.kind === "normalization"
    ? ["canonical", "alternative-valid", "invalid"] as const
    : ["canonical", "invalid"] as const
  return roles.map((role) => ({
    id: `${declaration.id}-${role}`,
    semanticId: declaration.id,
    role,
    observed: role === "invalid" ? "rejected" as const : "accepted" as const,
  }))
}

describe("public JSON value-semantics disclosure", () => {
  test("passes all five semantic kinds with canonical and alternative-valid canaries", () => {
    const report = auditPublicJsonValueSemanticsDisclosure({
      outputPath: "report.json",
      publicSemantics: semantics,
      evaluatorSemantics: structuredClone(semantics),
      canaries: semantics.flatMap(canariesFor),
    })

    expect(report.status).toBe("passed")
    expect(report.counts).toEqual({
      publicSemantics: 5,
      evaluatorSemantics: 5,
      undisclosedEvaluatorSemantics: 0,
      mismatchedEvaluatorSemantics: 0,
      canaries: 13,
      missingCanaryRoles: 0,
      failedCanaries: 0,
    })
    expect(report.undisclosedEvaluatorSemanticIds).toEqual([])
    expect(report.mismatchedEvaluatorSemanticIds).toEqual([])
    expect(report.missingCanaryRoles).toEqual([])
    expect(report.failedCanaryIds).toEqual([])
  })

  test("fails when every pointer is public but evaluator value semantics remain hidden", () => {
    expect(auditPublicJsonContractDisclosure({
      outputPath: "bids-audit.json",
      publicFieldPaths: ["/issues/*/affectedPath"],
      evaluatorFieldPaths: ["/issues/*/affectedPath"],
    }).status).toBe("passed")

    const report = auditPublicJsonValueSemanticsDisclosure({
      outputPath: "bids-audit.json",
      publicSemantics: [],
      evaluatorSemantics: [semantics[0]],
      canaries: [],
    })

    expect(report.status).toBe("failed")
    expect(report.undisclosedEvaluatorSemanticIds).toEqual(["canonical-path-role"])
    expect(report.missingCanaryRoles).toEqual([{
      semanticId: "canonical-path-role",
      roles: ["canonical", "invalid"],
    }])
  })

  test("reports descriptor drift and canary disagreement without weakening exact matching", () => {
    const publicDeclaration = semantics[1]!
    const evaluatorDeclaration = {
      ...structuredClone(publicDeclaration),
      rule: "byte-exact-path",
    }
    const report = auditPublicJsonValueSemanticsDisclosure({
      outputPath: "report.json",
      publicSemantics: [publicDeclaration],
      evaluatorSemantics: [evaluatorDeclaration],
      canaries: [
        { id: "canonical", semanticId: publicDeclaration.id, role: "canonical", observed: "accepted" },
        { id: "alternative", semanticId: publicDeclaration.id, role: "alternative-valid", observed: "rejected" },
        { id: "invalid", semanticId: publicDeclaration.id, role: "invalid", observed: "rejected" },
      ],
    })

    expect(report.status).toBe("failed")
    expect(report.mismatchedEvaluatorSemanticIds).toEqual(["path-representation-equivalence"])
    expect(report.failedCanaryIds).toEqual(["alternative"])
    expect(() => auditPublicJsonValueSemanticsDisclosure({
      outputPath: "report.json",
      publicSemantics: [publicDeclaration, publicDeclaration],
      evaluatorSemantics: [evaluatorDeclaration],
      canaries: [],
    })).toThrow()
  })

  test("does not invent an alternative-valid representation for a canonical normalizer", () => {
    const normalizer = semantics.find((semantic) => semantic.kind === "normalization")!
    const report = auditPublicJsonValueSemanticsDisclosure({
      outputPath: "report.json",
      publicSemantics: [normalizer],
      evaluatorSemantics: [normalizer],
      canaries: [
        { id: "normalizer-canonical", semanticId: normalizer.id, role: "canonical", observed: "accepted" },
        { id: "normalizer-invalid", semanticId: normalizer.id, role: "invalid", observed: "rejected" },
      ],
    })

    expect(report.status).toBe("passed")
    expect(report.missingCanaryRoles).toEqual([])
  })
})
