import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import type { SourceBundle } from "../../benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "./schema.ts"
import { assessAuthorizationResultChange, validateAuthorizationResult } from "./result.ts"

const sourceContent = [
  "export async function updateRecord(request: Request) {",
  "  const principal = request.user",
  "  if (!await canWrite(principal, request.recordId)) throw new Error('denied')",
  "  return persistUpdate(request.recordId, request.body)",
  "}",
].join("\n")

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "generic-record-update",
    request: "Determine whether a member can update an unrelated record.",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-write-policy",
      kind: "project-policy",
      text: "Only owners or explicit write grantees may update a record.",
      location: "POLICY.md#write",
      revision: "policy-r1",
      acceptance: {
        status: "accepted",
        actorRole: "repository-owner",
        reason: "The repository owner accepts the policy for this task.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member without a write grant on the selected record.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{
      id: "record",
      type: "record",
      description: "An existing unrelated record.",
    }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "inputs/sample/source.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-unrelated-update",
      principalId: "member",
      resourceId: "record",
      relation: "unrelated-no-write-grant",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The entry has a signed-in principal." }],
      policySourceId: "record-write-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The fixed crop contains the declared entry path; discovery is not tested.",
    requiredAnalysis: ["Trace binding, strongest control, and effect."],
    constraints: ["Use only fixed source."],
  }
}

function makeBundle(content = sourceContent, sourceRef = "records-r1"): SourceBundle {
  return {
    repository: "https://example.test/acme/records",
    sourceRef,
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: [{
      relativePath: "inputs/sample/source.ts",
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      cropRange: { startLine: 1, endLine: content.split("\n").length },
      originalLocations: ["src/records.ts:10-14"],
    }],
  }
}

function evidence(statement: string, startLine: number, quote: string) {
  return [{
    statement,
    citations: [{
      path: "inputs/sample/source.ts",
      startLine,
      endLine: startLine,
      quote,
    }],
  }]
}

function makeAnswer(): AuthorizationResultV0 {
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: "generic-record-update",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    results: [{
      obligationId: "deny-unrelated-update::update-record",
      conclusion: "source_refuted",
      explanation: "The entry binds the member and record, then stops an unauthorized update before persistence.",
      facts: {
        entry: evidence("The declared update entry begins here.", 1, "export async function updateRecord"),
        binding: evidence("The request user supplies the principal binding.", 2, "const principal = request.user"),
        control: evidence("The strongest visible write control denies a failed canWrite check.", 3, "if (!await canWrite"),
        effect: evidence("The protected persistence effect occurs only after the control.", 4, "return persistUpdate"),
        condition: evidence("The checked principal is the authenticated request user.", 2, "request.user"),
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "The declared update-record obligation is disposed; source discovery was not tested.",
    },
  }
}

describe("validateAuthorizationResult", () => {
  it("keeps deterministic evidence presence separate from semantic support", () => {
    const checked = validateAuthorizationResult(compileAuthorizationTask(makeTask()), makeAnswer(), makeBundle())

    expect(checked.structure.status).toBe("valid")
    expect(checked.declared).toEqual(expect.objectContaining({
      total: 1,
      disposed: 1,
      pending: 0,
      status: "all-disposed",
    }))
    expect(checked.discovery.status).toBe("not-tested")
    expect(checked.evidencePresence[0]?.status).toBe("present")
    expect(checked.evidenceSupport[0]?.status).toBe("unreviewed")
  })

  it("reports missing, duplicate, and foreign obligation results independently", () => {
    const compiled = compileAuthorizationTask(makeTask())
    const missing = makeAnswer()
    missing.results = []
    const missingChecked = validateAuthorizationResult(compiled, missing, makeBundle())
    expect(missingChecked.declared.pending).toBe(1)
    expect(missingChecked.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-obligation-result" }))

    const duplicate = makeAnswer()
    duplicate.results.push(structuredClone(duplicate.results[0]!))
    const duplicateChecked = validateAuthorizationResult(compiled, duplicate, makeBundle())
    expect(duplicateChecked.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-obligation-result" }))

    const foreign = makeAnswer()
    foreign.results.push({
      ...structuredClone(foreign.results[0]!),
      obligationId: "not-declared::entry",
    })
    const foreignChecked = validateAuthorizationResult(compiled, foreign, makeBundle())
    expect(foreignChecked.diagnostics).toContainEqual(expect.objectContaining({ code: "foreign-obligation-result" }))
  })

  it("rejects a mismatched source ref without discarding the historical result bytes", () => {
    const answer = makeAnswer()
    answer.sourceRef = "records-r2"

    const checked = validateAuthorizationResult(compileAuthorizationTask(makeTask()), answer, makeBundle())

    expect(checked.structure.status).toBe("invalid")
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({ code: "source-ref-mismatch" }))
    expect(checked.parsedResult?.sourceRef).toBe("records-r2")
  })

  it("detects out-of-range locations and quotations absent from the cited range", () => {
    const outOfRange = makeAnswer()
    outOfRange.results[0]!.facts.control[0]!.citations[0]!.startLine = 99
    outOfRange.results[0]!.facts.control[0]!.citations[0]!.endLine = 99
    const rangeChecked = validateAuthorizationResult(
      compileAuthorizationTask(makeTask()),
      outOfRange,
      makeBundle(),
    )
    expect(rangeChecked.evidencePresence[0]?.status).toBe("invalid")
    expect(rangeChecked.diagnostics).toContainEqual(expect.objectContaining({ code: "citation-out-of-range" }))

    const wrongQuote = makeAnswer()
    wrongQuote.results[0]!.facts.control[0]!.citations[0]!.quote = "allowEverything()"
    const quoteChecked = validateAuthorizationResult(
      compileAuthorizationTask(makeTask()),
      wrongQuote,
      makeBundle(),
    )
    expect(quoteChecked.evidencePresence[0]?.status).toBe("invalid")
    expect(quoteChecked.diagnostics).toContainEqual(expect.objectContaining({ code: "citation-text-mismatch" }))
  })

  it("lets a sink-only citation be present but never upgrades support", () => {
    const answer = makeAnswer()
    answer.results[0]!.facts.entry = []
    answer.results[0]!.facts.binding = []
    answer.results[0]!.facts.control = []
    answer.results[0]!.facts.condition = []

    const checked = validateAuthorizationResult(compileAuthorizationTask(makeTask()), answer, makeBundle())

    expect(checked.evidencePresence[0]?.status).toBe("present")
    expect(checked.evidenceSupport[0]?.status).toBe("unreviewed")
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({
      code: "missing-fact-group",
      path: "results.0.facts.control",
    }))
  })

  it("rejects repository completeness while retaining a valid declared result", () => {
    const answer = makeAnswer()
    answer.scopeClaim = {
      kind: "repository-all-entries",
      statement: "All authorization paths in the repository were checked.",
    }

    const checked = validateAuthorizationResult(compileAuthorizationTask(makeTask()), answer, makeBundle())

    expect(checked.declared.disposed).toBe(1)
    expect(checked.completeness.status).toBe("rejected")
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({ code: "unsupported-completeness" }))
  })

  it("requires useful unknown details without treating unknown itself as failure", () => {
    const answer = makeAnswer()
    answer.results[0]!.conclusion = "unknown"
    answer.results[0]!.decisiveMissingFacts = []
    answer.results[0]!.suggestedObservations = []

    const checked = validateAuthorizationResult(compileAuthorizationTask(makeTask()), answer, makeBundle())

    expect(checked.diagnostics).toContainEqual(expect.objectContaining({ code: "uninformative-unknown" }))
    expect(checked.declared.disposed).toBe(1)
  })

  it("does not report 100 percent completion for an empty declared set", () => {
    const task = makeTask()
    task.obligations = []
    const answer = makeAnswer()
    answer.results = []

    const checked = validateAuthorizationResult(compileAuthorizationTask(task), answer, makeBundle())

    expect(checked.declared.status).toBe("needs-input")
    expect(checked.declared.completionPercent).toBeNull()
  })
})

describe("assessAuthorizationResultChange", () => {
  it("marks relevant source and policy changes for review", () => {
    const compiled = compileAuthorizationTask(makeTask())
    const checked = validateAuthorizationResult(compiled, makeAnswer(), makeBundle())

    const sourceChanged = assessAuthorizationResultChange(
      checked.dependencySnapshot,
      compiled,
      makeBundle(`${sourceContent}\n// changed`),
    )
    expect(sourceChanged.status).toBe("needs-review")
    expect(sourceChanged.reasons).toContain("relevant-source-changed")

    const policyChangedTask = makeTask()
    policyChangedTask.policySources[0]!.revision = "policy-r2"
    const policyChanged = assessAuthorizationResultChange(
      checked.dependencySnapshot,
      compileAuthorizationTask(policyChangedTask),
      makeBundle(),
    )
    expect(policyChanged.status).toBe("needs-review")
    expect(policyChanged.reasons).toContain("policy-changed")
  })

  it("requires and records a bounded reuse basis for a new ref with unchanged dependencies", () => {
    const compiled = compileAuthorizationTask(makeTask())
    const checked = validateAuthorizationResult(compiled, makeAnswer(), makeBundle())
    const nextTask = makeTask()
    nextTask.sourceRef = "records-r2"
    const nextCompiled = compileAuthorizationTask(nextTask)
    const nextBundle = makeBundle(sourceContent, "records-r2")

    const withoutBasis = assessAuthorizationResultChange(
      checked.dependencySnapshot,
      nextCompiled,
      nextBundle,
    )
    expect(withoutBasis.status).toBe("needs-review")
    expect(withoutBasis.reasons).toContain("source-ref-changed")

    const withBasis = assessAuthorizationResultChange(
      checked.dependencySnapshot,
      nextCompiled,
      nextBundle,
      {
        relevantEntryUniverseUnchanged: true,
        reason: "All allowlisted authorization bytes and the bounded entry universe are unchanged.",
      },
    )
    expect(withBasis).toEqual(expect.objectContaining({
      status: "reusable",
      previousSourceRef: "records-r1",
      nextSourceRef: "records-r2",
      reuseBasis: expect.objectContaining({ relevantEntryUniverseUnchanged: true }),
    }))
  })
})
