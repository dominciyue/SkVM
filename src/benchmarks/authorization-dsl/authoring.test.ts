import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import {
  normalizeAuthorizationAuthoringInput,
  type AuthorizationAuthoringInputV1,
} from "./authoring.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"

const cleanupRoots: string[] = []
const repositoryRoot = path.resolve(import.meta.dir, "../../..")

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function valueAtPath(root: unknown, dottedPath: string): unknown {
  let current = root
  for (const segment of dottedPath.split(".")) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, unknown>)[segment]
    } else return undefined
  }
  return current
}

function setValueAtPath(root: unknown, dottedPath: string, value: unknown): void {
  const segments = dottedPath.split(".")
  let current = root
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) current = current[Number(segment)]
    else current = (current as Record<string, unknown>)[segment]
  }
  const finalSegment = segments.at(-1)!
  if (Array.isArray(current)) current[Number(finalSegment)] = structuredClone(value)
  else (current as Record<string, unknown>)[finalSegment] = structuredClone(value)
}

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "authoring-record-update",
    request: "Assess whether the declared member may update the selected record.",
    repository: "https://example.test/authoring/records",
    sourceRef: "authoring-ref-v1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-policy",
      kind: "task-requirement",
      text: "Only the record owner may update it.",
      location: "authoring.json#/task/policySources/0",
      revision: "authoring-policy-v1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The author controls this bounded synthetic requirement.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member who does not own the selected record.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A selected record." }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-foreign-update",
      principalId: "member",
      resourceId: "record",
      relation: "non-owner",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The task fixes an authenticated caller." }],
      policySourceId: "record-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The explicit source covers the declared entry; repository discovery is not claimed.",
    requiredAnalysis: ["Explain the principal, resource relation, visible control, and protected effect."],
    constraints: ["Use only the explicit source and do not execute the target."],
  }
}

function makeAuthoring(
  overrides: Partial<AuthorizationAuthoringInputV1> = {},
): AuthorizationAuthoringInputV1 {
  return {
    schemaVersion: "authorization-assessment-authoring/v1",
    sourceRoot: "project",
    sources: ["src/record.ts"],
    task: makeTask(),
    ...overrides,
  }
}

describe("normalizeAuthorizationAuthoringInput", () => {
  it("derives one deterministic source identity and the shared default profile without mutating author input", () => {
    const authoring = makeAuthoring({
      conditionAnalysisRequest: {
        schemaVersion: "authorization-condition-analysis-request/v1",
        requests: [{
          obligationId: "deny-foreign-update",
          conditionBindings: [{ id: "is-authenticated", name: "authenticated" }],
          maxBranches: 2,
        }],
      },
    })
    const before = structuredClone(authoring)
    const first = normalizeAuthorizationAuthoringInput(authoring)
    const second = normalizeAuthorizationAuthoringInput(authoring)

    expect(authoring).toEqual(before)
    expect(second).toEqual(first)
    expect(first.status).toBe("ready")
    if (first.status !== "ready") return
    expect(first.normalizedInput.sourceIdentity).toEqual({
      repository: authoring.task.repository,
      sourceRef: authoring.task.sourceRef,
    })
    expect(first.normalizedInput.analysisProfile).toEqual({
      id: "authorization-core-v1",
      origin: "derived",
    })
    expect(first.normalizedInput.analysisRequirements).toHaveLength(6)
    expect(first.normalizedInput.analysisRequirements?.map(requirement => requirement.kind)).toEqual([
      "entry-control",
      "identity-binding",
      "resource-binding",
      "authorization-decision",
      "effect-reachability",
      "external-assumption",
    ])
    expect(first.normalizedInput.conditionAnalysisRequest).toEqual(authoring.conditionAnalysisRequest)
    expect(first.provenance).toEqual(expect.objectContaining({
      sourceIdentity: "derived-from-task",
      analysisRequirements: "derived-from-authorization-core-v1",
      conditionAnalysisRequest: "author",
      sourceRefVerification: "authored",
    }))
  })

  it("returns all missing policy and expectation fields as needs-input instead of inventing them", () => {
    const incomplete = structuredClone(makeAuthoring()) as unknown as Record<string, unknown>
    const task = incomplete.task as Record<string, unknown>
    delete task.policySources
    const obligations = task.obligations as Array<Record<string, unknown>>
    delete obligations[0]!.expectation

    const result = normalizeAuthorizationAuthoringInput(incomplete)

    expect(result.status).toBe("needs-input")
    if (result.status !== "needs-input") return
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "author-policy-required",
        path: "task.policySources",
      }),
      expect.objectContaining({
        code: "author-expectation-required",
        path: "task.obligations.0.expectation",
      }),
    ]))
    expect(result.diagnostics.every(diagnostic => diagnostic.fix.length > 0)).toBe(true)
  })

  it("preserves explicit analysis requirements instead of replacing them with the default six", () => {
    const requirements = [{
      id: "author.control",
      kind: "authorization-decision" as const,
      obligationIds: ["deny-foreign-update"],
      question: "Which visible control decides this update?",
      applicability: "required" as const,
      prerequisiteIds: [],
    }]
    const result = normalizeAuthorizationAuthoringInput(makeAuthoring({
      analysisProfile: { id: "task-supplied", requirements },
    }))

    expect(result.status).toBe("ready")
    if (result.status !== "ready") return
    expect(result.normalizedInput.analysisProfile).toEqual({ id: "task-supplied", origin: "input" })
    expect(result.normalizedInput.analysisRequirements).toEqual(requirements)
    expect(result.provenance.analysisRequirements).toBe("author")
  })

  it("reports stale relationship references once without cascading default-profile diagnostics", () => {
    const authoring = makeAuthoring()
    authoring.task.principals[0]!.id = "records-auditor"
    authoring.task.resources[0]!.id = "audit-record"
    authoring.task.entries[0]!.id = "export-record"

    const stale = normalizeAuthorizationAuthoringInput(authoring)

    expect(stale.status).toBe("needs-input")
    if (stale.status !== "needs-input") return
    expect(stale.diagnostics.map(item => item.code)).toEqual([
      "author-task-dangling-reference",
      "author-task-dangling-reference",
      "author-task-dangling-reference",
    ])
    expect(stale.diagnostics.map(item => item.path)).toEqual([
      "task.obligations.0.entryIds.0",
      "task.obligations.0.principalId",
      "task.obligations.0.resourceId",
    ])

    authoring.task.obligations[0]!.principalId = "records-auditor"
    authoring.task.obligations[0]!.resourceId = "audit-record"
    authoring.task.obligations[0]!.entryIds = ["export-record"]
    const repaired = normalizeAuthorizationAuthoringInput(authoring)
    expect(repaired.status).toBe("ready")
    if (repaired.status === "ready") {
      expect(repaired.analysisRequirements).toHaveLength(6)
      expect(repaired.analysisRequirements.map(item => item.question)).not.toContain(
        authoring.task.requiredAnalysis[0],
      )
    }
  })

  it("produces a separate strict input that uses the ordinary path checks and a ready condition plan", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-authoring-normalize-"))
    cleanupRoots.push(root)
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(path.join(root, "project", "src", "record.ts"), [
      "export async function updateRecord(request: Request) {",
      "  const principal = request.user",
      "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
      "  return persistUpdate(request.record)",
      "}",
    ].join("\n"), "utf8")
    const authoring = makeAuthoring({
      conditionAnalysisRequest: {
        schemaVersion: "authorization-condition-analysis-request/v1",
        requests: [{
          obligationId: "deny-foreign-update",
          conditionBindings: [{ id: "is-authenticated", name: "authenticated" }],
          maxBranches: 2,
        }],
      },
    })
    const authoringPath = path.join(root, "authoring.json")
    const normalizedPath = path.join(root, "assessment.json")
    const originalBytes = `${JSON.stringify(authoring, null, 2)}\n`
    await writeFile(authoringPath, originalBytes, "utf8")

    const normalization = normalizeAuthorizationAuthoringInput(
      JSON.parse(await readFile(authoringPath, "utf8")),
    )
    expect(normalization.status).toBe("ready")
    if (normalization.status !== "ready") return
    await writeFile(normalizedPath, `${JSON.stringify(normalization.normalizedInput, null, 2)}\n`, "utf8")
    const loaded = await loadLocalAuthorizationInput(normalizedPath)

    expect(await readFile(authoringPath, "utf8")).toBe(originalBytes)
    expect(loaded.status).toBe("valid")
    if (loaded.status !== "valid") return
    expect(loaded.sourceBundle.files.map(file => file.relativePath)).toEqual(["src/record.ts"])
    expect(loaded.analysisProfile).toEqual({ id: "authorization-core-v1", origin: "derived" })
    expect(loaded.conditionPlan?.status).toBe("ready")
    expect(loaded.conditionPlan?.entries.map(entry => entry.obligationId)).toEqual([
      "deny-foreign-update::update-record",
    ])
  })

  it("replays the recorded agent-assisted principal/resource/relation/entry/condition change", async () => {
    const authoringPath = path.join(repositoryRoot, "examples", "authorization-assessment", "authoring.json")
    const experiencePath = path.join(
      repositoryRoot,
      "results",
      "skill-ir",
      "skill-dsl-research",
      "development",
      "authorization-transfer-value-v1",
      "authoring",
      "y5-agent-assisted-authoring-v1.json",
    )
    const originalBytes = await readFile(authoringPath, "utf8")
    const authoring = JSON.parse(originalBytes) as unknown
    const experience = JSON.parse(await readFile(experiencePath, "utf8")) as {
      sourceAuthoringSha256: string
      editCount: number
      editsByCategory: Record<string, number>
      edits: Array<{ stage: "draft" | "repair"; path: string; from: unknown; to: unknown }>
      checks: Array<{
        status: "ready" | "needs-input"
        diagnostics: Array<{ code: string; path: string }>
        normalizedInputSha256?: string
        derivedRequirementCount?: number
      }>
      accounting: {
        normalizationChecks: number
        humanParticipants: number
        humanTimeMinutes: number | null
        humanSavingsClaimed: boolean
        providerCalls: number
        targetExecutions: number
      }
    }

    expect(sha256(originalBytes)).toBe(experience.sourceAuthoringSha256)
    expect(experience.edits).toHaveLength(experience.editCount)
    expect(Object.values(experience.editsByCategory).reduce((sum, count) => sum + count, 0)).toBe(
      experience.editCount,
    )
    const baseline = normalizeAuthorizationAuthoringInput(authoring)
    expect(baseline.status).toBe(experience.checks[0]!.status)

    const changed = structuredClone(authoring)
    for (const edit of experience.edits.filter(item => item.stage === "draft")) {
      expect(valueAtPath(changed, edit.path)).toEqual(edit.from)
      setValueAtPath(changed, edit.path, edit.to)
    }
    const stale = normalizeAuthorizationAuthoringInput(changed)
    expect(stale.status).toBe(experience.checks[1]!.status)
    expect(stale.diagnostics.map(item => ({ code: item.code, path: item.path }))).toEqual(
      experience.checks[1]!.diagnostics,
    )

    for (const edit of experience.edits.filter(item => item.stage === "repair")) {
      expect(valueAtPath(changed, edit.path)).toEqual(edit.from)
      setValueAtPath(changed, edit.path, edit.to)
    }
    const final = normalizeAuthorizationAuthoringInput(changed)
    expect(final.status).toBe(experience.checks[2]!.status)
    if (final.status !== "ready") return
    const expectedNormalizedHash = experience.checks[2]!.normalizedInputSha256
    const expectedRequirementCount = experience.checks[2]!.derivedRequirementCount
    if (!expectedNormalizedHash || expectedRequirementCount === undefined) {
      throw new Error("Final authoring experience check must bind its normalized hash and requirement count.")
    }
    expect(sha256(JSON.stringify(final.normalizedInput))).toBe(
      expectedNormalizedHash,
    )
    expect(final.analysisRequirements).toHaveLength(expectedRequirementCount)
    expect(experience.accounting).toEqual(expect.objectContaining({
      normalizationChecks: 3,
      humanParticipants: 0,
      humanTimeMinutes: null,
      humanSavingsClaimed: false,
      providerCalls: 0,
      targetExecutions: 0,
    }))
    expect(await readFile(authoringPath, "utf8")).toBe(originalBytes)
  })
})
