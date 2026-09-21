import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function makeTask(overrides: Partial<AuthorizationTaskV0> = {}): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "arbitrary-local-record-task",
    request: "Assess whether a member may update the declared record.",
    repository: "https://example.test/arbitrary/records",
    sourceRef: "local-ref-17",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-policy",
      kind: "task-requirement",
      text: "Only an owner may update the record.",
      location: "assessment.json#/task/policySources/0",
      revision: "local-policy-v1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The task author owns the bounded requirement.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member who is not the record owner.",
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
    requiredAnalysis: ["Trace the caller, record, strongest control, and update effect."],
    constraints: ["Use only the explicit source and do not execute the target."],
    ...overrides,
  }
}

async function makeFixture(inputOverrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-local-input-"))
  cleanupRoots.push(root)
  const projectRoot = path.join(root, "project")
  await mkdir(path.join(projectRoot, "src"), { recursive: true })
  await writeFile(path.join(projectRoot, "src", "record.ts"), [
    "export async function updateRecord(request: Request) {",
    "  const principal = request.user",
    "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
    "  return persistUpdate(request.record)",
    "}",
  ].join("\n"), "utf8")
  const task = makeTask()
  const input = {
    schemaVersion: "authorization-assessment-input/v1",
    sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef },
    sourceRoot: "./project",
    sources: ["src/record.ts"],
    task,
    ...inputOverrides,
  }
  const inputPath = path.join(root, "assessment.json")
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8")
  return { root, projectRoot, inputPath, input, task }
}

describe("loadLocalAuthorizationInput", () => {
  it("loads ordinary source paths without a manifest or oracle and instantiates the common profile", async () => {
    const fixture = await makeFixture()
    const loaded = await loadLocalAuthorizationInput(fixture.inputPath)

    expect(loaded.status).toBe("valid")
    if (loaded.status !== "valid") return
    expect(loaded.task.taskId).toBe("arbitrary-local-record-task")
    expect(loaded.sourceBundle.repository).toBe(fixture.task.repository)
    expect(loaded.sourceBundle.sourceRef).toBe("local-ref-17")
    expect(loaded.sourceBundle.files.map(file => file.relativePath)).toEqual(["src/record.ts"])
    expect(loaded.analysisProfile).toEqual({ id: "authorization-core-v1", origin: "default" })
    expect(loaded.analysisRequirements).toHaveLength(6)
    expect(loaded.analysisPlan.status).toBe("ready")
    expect(loaded.analysisPlan.entries).toHaveLength(6)
    expect(JSON.stringify(loaded)).not.toContain("manifest")
    expect(JSON.stringify(loaded)).not.toContain("oracle")
  })

  it("keeps explicit requirements and records their profile origin", async () => {
    const fixture = await makeFixture({
      analysisRequirements: [{
        id: "task.control",
        kind: "authorization-decision",
        obligationIds: ["deny-foreign-update"],
        question: "Which visible control decides this update?",
        applicability: "required",
        prerequisiteIds: [],
      }],
    })
    const loaded = await loadLocalAuthorizationInput(fixture.inputPath)

    expect(loaded.status).toBe("valid")
    if (loaded.status === "valid") {
      expect(loaded.analysisProfile).toEqual({ id: "task-supplied", origin: "input" })
      expect(loaded.analysisRequirements.map(requirement => requirement.id)).toEqual(["task.control"])
    }
  })

  it("rejects source identity drift and invalid locations before a host can run", async () => {
    const refMismatch = await makeFixture({
      sourceIdentity: {
        repository: "https://example.test/arbitrary/records",
        sourceRef: "different-ref",
      },
    })
    const mismatched = await loadLocalAuthorizationInput(refMismatch.inputPath)
    expect(mismatched.status).toBe("invalid")
    if (mismatched.status === "invalid") {
      expect(mismatched.diagnostics).toContainEqual(expect.objectContaining({ code: "source-identity-mismatch" }))
    }

    const badLocation = await makeFixture({ task: makeTask({
      entries: [{
        id: "update-record",
        name: "updateRecord",
        locations: [{ path: "src/not-loaded.ts", startLine: 1, endLine: 1 }],
      }],
    }) })
    const invalidLocation = await loadLocalAuthorizationInput(badLocation.inputPath)
    expect(invalidLocation.status).toBe("invalid")
    if (invalidLocation.status === "invalid") {
      expect(invalidLocation.diagnostics).toContainEqual(expect.objectContaining({
        code: "declaration-source-location-invalid",
        path: "task.entries.0.locations.0",
      }))
    }
  })

  it("reports missing, escaping, and duplicate-normalized source paths without widening the read", async () => {
    const missing = await makeFixture({ sources: ["src/missing.ts"] })
    const missingResult = await loadLocalAuthorizationInput(missing.inputPath)
    expect(missingResult.status).toBe("invalid")
    if (missingResult.status === "invalid") {
      expect(missingResult.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-input" }))
    }

    const duplicate = await makeFixture({ sources: ["src/record.ts", "src/./record.ts"] })
    const duplicateResult = await loadLocalAuthorizationInput(duplicate.inputPath)
    expect(duplicateResult.status).toBe("invalid")
    if (duplicateResult.status === "invalid") {
      expect(duplicateResult.diagnostics).toContainEqual(expect.objectContaining({
        code: "duplicate-source-path",
        path: "sources.1",
      }))
    }

    const escapedRoot = await makeFixture({ sourceRoot: "../outside" })
    const escapedRootResult = await loadLocalAuthorizationInput(escapedRoot.inputPath)
    expect(escapedRootResult.status).toBe("invalid")
    if (escapedRootResult.status === "invalid") {
      expect(escapedRootResult.diagnostics).toContainEqual(expect.objectContaining({ code: "unsafe-source-root" }))
    }
  })

  it("rejects a source symlink that resolves outside sourceRoot", async () => {
    const fixture = await makeFixture({ sources: ["src/linked.ts"] })
    const outside = path.join(fixture.root, "outside.ts")
    await writeFile(outside, "export const secret = true\n", "utf8")
    await symlink(outside, path.join(fixture.projectRoot, "src", "linked.ts"), "file")

    const loaded = await loadLocalAuthorizationInput(fixture.inputPath)
    expect(loaded.status).toBe("invalid")
    if (loaded.status === "invalid") {
      expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "symlink-escape" }))
    }
  })

  it("rejects a sourceRoot junction that resolves outside the input directory", async () => {
    const fixture = await makeFixture({ sourceRoot: "linked-project" })
    const outsideRoot = await mkdtemp(path.join(tmpdir(), "skvm-authorization-external-root-"))
    cleanupRoots.push(outsideRoot)
    await mkdir(path.join(outsideRoot, "src"), { recursive: true })
    await writeFile(path.join(outsideRoot, "src", "record.ts"), [
      "export async function updateRecord(request: Request) {",
      "  const principal = request.user",
      "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
      "  return persistUpdate(request.record)",
      "}",
    ].join("\n"), "utf8")
    await symlink(outsideRoot, path.join(fixture.root, "linked-project"), "junction")

    const loaded = await loadLocalAuthorizationInput(fixture.inputPath)
    expect(loaded.status).toBe("invalid")
    if (loaded.status === "invalid") {
      expect(loaded.diagnostics).toContainEqual(expect.objectContaining({
        code: "unsafe-source-root",
        path: "sourceRoot",
      }))
    }
  })
})
