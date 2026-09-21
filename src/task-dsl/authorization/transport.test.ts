import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  buildAuthorizationSourceCatalog,
  type SourceBundle,
} from "../../benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import type { AuthorizationTaskV0 } from "./schema.ts"
import {
  AuthorizationWireResultV1Schema,
  AuthorizationWireResultV2Schema,
  AuthorizationWireResultV3Schema,
  normalizeAuthorizationWireResult,
  normalizeAuthorizationWireResultV2,
  normalizeAuthorizationWireResultV3,
} from "./transport.ts"

const sourcePath = "inputs/generic/source.ts"
const sourceContent = [
  "export async function save(request: Request) {",
  "  const principal = request.user",
  "  if (!await canSave(principal, request.itemId)) throw new Error('denied')",
  "  return persist(request.itemId)",
  "}",
].join("\n")

function task(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "generic-save",
    request: "Can a member save an unrelated item?",
    repository: "https://example.test/generic/save",
    sourceRef: "save-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "save-policy",
      kind: "task-policy",
      text: "Only a permitted principal may save the item.",
      location: "task.policy",
      revision: "policy-r1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "The author owns the bounded rule." },
    }],
    principals: [{ id: "member", role: "member", description: "No save grant.", startingCapabilities: [] }],
    resources: [{ id: "item", type: "item", description: "An unrelated item." }],
    entries: [{ id: "save", name: "save", locations: [{ path: sourcePath, startLine: 20, endLine: 24 }] }],
    obligations: [{
      id: "deny-save",
      principalId: "member",
      resourceId: "item",
      relation: "unrelated-no-grant",
      operation: "save",
      expectation: "deny",
      conditions: [],
      policySourceId: "save-policy",
      entryIds: ["save"],
    }],
    scopeAssurance: "The fixed crop covers only the declared path.",
    requiredAnalysis: ["Trace principal, control, and effect."],
    constraints: ["Use only the fixed source."],
  }
}

function bundle(sourceRef = "save-r1"): SourceBundle {
  return {
    repository: "https://example.test/generic/save",
    sourceRef,
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: [{
      relativePath: sourcePath,
      content: sourceContent,
      sha256: createHash("sha256").update(sourceContent, "utf8").digest("hex"),
      cropRange: { startLine: 20, endLine: 24 },
      originalLocations: ["src/save.ts:120-124"],
    }],
  }
}

function sourceId(sourceBundle = bundle()): string {
  const built = buildAuthorizationSourceCatalog(sourceBundle)
  if (!built.success) throw new Error("test source bundle must be valid")
  return built.catalog.sources[0]!.sourceId
}

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const citation = (line: number) => ({ sourceId: sourceId(), startLine: line, endLine: line })
  return {
    schemaVersion: "source-authorization-assessment-wire/v1",
    results: [{
      obligationId: "deny-save::save",
      conclusion: "source_refuted",
      explanation: "The visible canSave control prevents the unauthorized effect.",
      facts: {
        entry: [{ statement: "The declared entry starts here.", citations: [citation(20)] }],
        binding: [{ statement: "The request user is the principal.", citations: [citation(21)] }],
        control: [{ statement: "canSave denies the request.", citations: [citation(22)] }],
        effect: [{ statement: "Persistence follows the control.", citations: [citation(23)] }],
        condition: [],
      },
    }],
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "Only the declared path was assessed; discovery was not tested.",
    },
    ...overrides,
  }
}

function normalize(input: unknown, sourceBundle = bundle()) {
  return normalizeAuthorizationWireResult({
    compiled: compileAuthorizationTask(task()),
    sourceBundle,
    input,
  })
}

describe("AuthorizationWireResultV1", () => {
  it("lets the host bind canonical metadata and exact source quotations", () => {
    const normalized = normalize(wire())

    expect(normalized.status).toBe("valid")
    expect(normalized.diagnostics).toEqual([])
    expect(normalized.wireResult?.results[0]).toEqual(expect.objectContaining({
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }))
    expect(normalized.result).toEqual(expect.objectContaining({
      schemaVersion: "source-authorization-assessment-result/v0",
      taskId: "generic-save",
      repository: "https://example.test/generic/save",
      sourceRef: "save-r1",
    }))
    expect(normalized.result?.results[0]?.facts.control[0]?.citations[0]).toEqual({
      path: sourcePath,
      startLine: 22,
      endLine: 22,
      quote: "  if (!await canSave(principal, request.itemId)) throw new Error('denied')",
    })
  })

  it("rejects missing semantic fields and malformed array items without guessing", () => {
    const missing = wire()
    delete (missing.results as Array<Record<string, unknown>>)[0]!.explanation
    const malformed = wire()
    ;(malformed.results as Array<Record<string, unknown>>).push("not-an-obligation" as unknown as Record<string, unknown>)

    for (const candidate of [missing, malformed]) {
      const normalized = normalize(candidate)
      expect(normalized.status).toBe("invalid")
      expect(normalized.result).toBeUndefined()
      expect(normalized.diagnostics).toContainEqual(expect.objectContaining({ code: "wire-schema-invalid" }))
    }
  })

  it("refuses canonical results for duplicate, foreign, and missing obligation IDs", () => {
    const duplicate = wire()
    ;(duplicate.results as unknown[]).push(structuredClone((duplicate.results as unknown[])[0]))
    const foreign = wire()
    ;((foreign.results as Array<Record<string, unknown>>)[0]!).obligationId = "invented::save"
    const missing = wire()
    missing.results = []

    const duplicateResult = normalize(duplicate)
    expect(duplicateResult.status).toBe("invalid")
    expect(duplicateResult.result).toBeUndefined()
    expect(duplicateResult.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      "duplicate-obligation-result",
    ]))

    const foreignResult = normalize(foreign)
    expect(foreignResult.status).toBe("invalid")
    expect(foreignResult.result).toBeUndefined()
    expect(foreignResult.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      "foreign-obligation-result",
      "missing-obligation-result",
    ]))

    const missingResult = normalize(missing)
    expect(missingResult.status).toBe("invalid")
    expect(missingResult.result).toBeUndefined()
    expect(missingResult.diagnostics).toContainEqual(expect.objectContaining({
      code: "missing-obligation-result",
    }))
  })

  it("rejects stale source IDs, cross-source ranges, and a bundle from another ref", () => {
    const stale = wire()
    const controlCitation = (((stale.results as Array<Record<string, any>>)[0]!).facts.control[0].citations[0])
    controlCitation.sourceId = "src-0000000000000000"
    const staleResult = normalize(stale)
    expect(staleResult.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-source-id" }))

    const crossing = wire()
    const crossingCitation = (((crossing.results as Array<Record<string, any>>)[0]!).facts.control[0].citations[0])
    crossingCitation.endLine = 25
    const crossingResult = normalize(crossing)
    expect(crossingResult.diagnostics).toContainEqual(expect.objectContaining({ code: "citation-out-of-range" }))

    const wrongRef = bundle("save-r2")
    const wrongRefResult = normalize(wire(), wrongRef)
    expect(wrongRefResult.diagnostics).toContainEqual(expect.objectContaining({ code: "source-ref-mismatch" }))
  })

  it("requires decisive missing facts and observations only for unknown", () => {
    const candidate = wire()
    const result = (candidate.results as Array<Record<string, unknown>>)[0]!
    result.conclusion = "unknown"

    const incomplete = normalize(candidate)
    expect(incomplete.status).toBe("invalid")
    expect(incomplete.result).toBeUndefined()
    expect(incomplete.diagnostics).toContainEqual(expect.objectContaining({ code: "uninformative-unknown" }))

    result.decisiveMissingFacts = ["The deployment role mapping is absent."]
    result.suggestedObservations = ["Inspect the deployment role mapping."]
    const complete = normalize(candidate)
    expect(complete.status).toBe("valid")
  })

  it("keeps request metadata, canonical paths, and quotes out of the model wire", () => {
    const withCanonicalFields = wire({
      taskId: "model-copied-task",
      repository: "https://wrong.test/repository",
      sourceRef: "wrong-ref",
    })
    const parsed = AuthorizationWireResultV1Schema.safeParse(withCanonicalFields)

    expect(parsed.success).toBe(false)
    const serializedSchemaShape = Object.keys(AuthorizationWireResultV1Schema.shape)
    expect(serializedSchemaShape).toEqual(["schemaVersion", "results", "scopeClaim"])
  })
})

describe("AuthorizationWireResultV2", () => {
  it("normalizes the same canonical v0 result and retains a versioned coverage sidecar", () => {
    const v1 = wire()
    const v2 = {
      ...v1,
      schemaVersion: "source-authorization-assessment-wire/v2",
      coverage: [{
        requirementId: "control",
        obligationId: "deny-save::save",
        status: "addressed" as const,
        explanation: "The control fact answers the analysis question.",
        factPointers: ["/results/0/facts/control/0"],
      }],
    }
    const normalized = normalizeAuthorizationWireResultV2({
      compiled: compileAuthorizationTask(task()),
      sourceBundle: bundle(),
      input: v2,
    })

    expect(normalized.status).toBe("valid")
    expect(normalized.normalizerVersion).toBe("authorization-wire-normalizer/v2")
    expect(normalized.result?.schemaVersion).toBe("source-authorization-assessment-result/v0")
    expect(normalized.coverage).toEqual(v2.coverage)
    expect(normalized.wireResult?.schemaVersion).toBe("source-authorization-assessment-wire/v2")
  })

  it("keeps coverage strict and leaves the v1 schema unchanged", () => {
    const v1 = wire()
    const missingCoverage = {
      ...v1,
      schemaVersion: "source-authorization-assessment-wire/v2",
    }
    const malformedCoverage = {
      ...missingCoverage,
      coverage: [{
        requirementId: "control",
        obligationId: "deny-save::save",
        status: "addressed",
        explanation: "Answered.",
        factPointers: [],
        expectedFinding: "deny",
      }],
    }

    expect(AuthorizationWireResultV2Schema.safeParse(missingCoverage).success).toBe(false)
    expect(AuthorizationWireResultV2Schema.safeParse(malformedCoverage).success).toBe(false)
    expect(AuthorizationWireResultV1Schema.safeParse(v1).success).toBe(true)
    expect(AuthorizationWireResultV1Schema.safeParse({ ...v1, coverage: [] }).success).toBe(false)
  })
})

describe("AuthorizationWireResultV3", () => {
  it("retains a versioned condition sidecar while preserving canonical v0 and coverage", () => {
    const v3 = {
      ...wire(),
      schemaVersion: "source-authorization-assessment-wire/v3",
      coverage: [{
        requirementId: "control",
        obligationId: "deny-save::save",
        status: "addressed" as const,
        explanation: "The control fact answers the analysis question.",
        factPointers: ["/results/0/facts/control/0"],
      }],
      conditionAnalysis: {
        schemaVersion: "authorization-condition-analysis-result/v1" as const,
        analyses: [{
          obligationId: "deny-save::save",
          branches: [{
            id: "not-permitted-blocked",
            obligationId: "deny-save::save",
            assumptions: [{ conditionId: "is-permitted", value: "false" as const }],
            effect: "blocked" as const,
            explanation: "The visible control blocks an unpermitted caller.",
            factPointers: ["/results/0/facts/control/0"],
            missingFacts: [],
          }],
          unexaminedConditionIds: [],
          completeness: "bounded" as const,
          limitations: [],
        }],
      },
    }
    const normalized = normalizeAuthorizationWireResultV3({
      compiled: compileAuthorizationTask(task()),
      sourceBundle: bundle(),
      input: v3,
    })

    expect(normalized.status).toBe("valid")
    expect(normalized.normalizerVersion).toBe("authorization-wire-normalizer/v3")
    expect(normalized.result?.schemaVersion).toBe("source-authorization-assessment-result/v0")
    expect(normalized.coverage).toEqual(v3.coverage)
    expect(normalized.conditionAnalysis).toEqual(v3.conditionAnalysis)
    expect(normalized.wireResult?.schemaVersion).toBe("source-authorization-assessment-wire/v3")
  })

  it("keeps the old wire schemas strict when the condition sidecar is present", () => {
    const conditionAnalysis = {
      schemaVersion: "authorization-condition-analysis-result/v1",
      analyses: [],
    }
    const v1 = wire({ conditionAnalysis })
    const v2 = {
      ...wire(),
      schemaVersion: "source-authorization-assessment-wire/v2",
      coverage: [],
      conditionAnalysis,
    }

    expect(AuthorizationWireResultV1Schema.safeParse(v1).success).toBe(false)
    expect(AuthorizationWireResultV2Schema.safeParse(v2).success).toBe(false)
    expect(AuthorizationWireResultV3Schema.safeParse({
      ...v2,
      schemaVersion: "source-authorization-assessment-wire/v3",
    }).success).toBe(true)
  })
})
