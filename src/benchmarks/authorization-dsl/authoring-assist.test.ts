import { expect, test } from "bun:test"
import { createAuthorizationAuthoringDraft, renderAuthoringTask } from "./authoring-assist.ts"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"

const context = { schemaVersion: "authorization-authoring-context/v1", taskId: "task", repository: "https://example.test/repo", sourceRef: "r1", sourceRoot: "project", allowedFiles: ["entry.py", "helper.py"], entries: [{ entryKey: "update", path: "entry.py", startLine: 1, endLine: 4 }] }

test("host draft copies only known metadata and leaves policy, expectation and request missing", () => {
  const original = structuredClone(context), result = createAuthorizationAuthoringDraft(context)
  expect(result.status).toBe("needs-input")
  expect(result.draft.repository).toBe(context.repository)
  expect(result.draft.policies).toEqual({})
  expect(result.draft.scenarios).toEqual({})
  expect(result.entrySeed.dependencies).toEqual([])
  expect(result.entrySeed.entries).toEqual(context.entries)
  expect(result.diagnostics.some(d => d.path.startsWith("policies"))).toBe(true)
  expect(normalizeAuthorizationAuthoringInput(result.draft).status).toBe("needs-input")
  expect(context).toEqual(original)
})

test("the same author contract survives revision even when the original envelope was required", () => {
  const task = { publicBrief: "Assess at handler entry with owner presence unspecified.", outputContract: "Return only {assessment,evidenceRequest} JSON.", editScope: "Only declared domain fields; fixed source identity.", knownFields: context, fieldGuide: "Policies and expectations are authored." }
  const first = renderAuthoringTask(task), repair = renderAuthoringTask(task, { candidate: "bad JSON", diagnostics: [{ code: "invalid-json", path: "$", message: "Unexpected end" }] })
  for (const text of [task.publicBrief, task.outputContract, task.editScope, task.fieldGuide]) {
    expect(first).toContain(text)
    expect(repair).toContain(text)
  }
  expect(repair).toContain("bad JSON")
  expect(first).not.toContain("Diagnostics-only revision")
})

test("unsafe context entries and duplicate positions are rejected without fabricated facts", () => {
  expect(() => createAuthorizationAuthoringDraft({ ...context, allowedFiles: ["../secret"] })).toThrow()
  expect(() => createAuthorizationAuthoringDraft({ ...context, entries: [...context.entries, ...context.entries] })).toThrow()
  expect(() => createAuthorizationAuthoringDraft({ ...context, entries: [{ ...context.entries[0], entryKey: "__proto__" }] })).toThrow()
})
