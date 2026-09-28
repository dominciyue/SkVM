import { expect, test } from "bun:test"
import { normalizeAuthorizationAuthoringInput } from "../authoring.ts"
import { authorizationScopePreview } from "./scope.ts"
import type { AuthorizationEvidenceRequest } from "./schema.ts"

test("three supports preserve two scenarios while explicit analysis entries still expand", () => {
  const input = {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: "scope", request: "Assess the two requested scenarios.",
    repository: "https://example.test/records", sourceRef: "r1", sourceRoot: "source", sources: ["entry.ts"],
    policies: { p: { text: "Owners may update; others may not.", location: "brief", revision: "r1", acceptance: "accepted", reason: "Author instruction" } },
    principals: { m: { role: "member" } }, resources: { r: { type: "record" } },
    entries: { update: { name: "update", locations: [{ path: "entry.ts", startLine: 1, endLine: 3 }] } },
    scenarios: {
      own: { principal: "m", resource: "r", policy: "p", entries: ["update"], relation: "owner", operation: "update", expectation: "allow" },
      foreign: { principal: "m", resource: "r", policy: "p", entries: ["update"], relation: "non-owner", operation: "update", expectation: "deny" },
    },
  }
  const lowered = normalizeAuthorizationAuthoringInput(input)
  if (lowered.status !== "ready") throw new Error(JSON.stringify(lowered.diagnostics))
  const request: AuthorizationEvidenceRequest = { schemaVersion: "authorization-evidence-request/v2", sourceRoot: "source", allowedFiles: ["entry.ts", "support.ts"], entries: [{ entryKey: "update", path: "entry.ts", startLine: 1, endLine: 3 }], dependencies: [1, 2, 3].map(i => ({ id: `support-${i}`, from: "update", path: "support.ts", startLine: i, endLine: i, reason: "other", basis: "author" })), limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } }
  const original = authorizationScopePreview(lowered.normalizedInput.task, request)
  expect(original).toMatchObject({ analysisEntries: 1, declaredScenarios: 2, expandedObligations: 2, supportDependencies: 3 })
  expect(original.supports.map(s => s.from)).toEqual(["update", "update", "update"])
  const task = structuredClone(lowered.normalizedInput.task)
  task.entries.push({ id: "entry:inspect", name: "inspect", locations: [{ path: "entry.ts", startLine: 5, endLine: 7 }] })
  for (const obligation of task.obligations) obligation.entryIds.push("entry:inspect")
  expect(authorizationScopePreview(task, request)).toMatchObject({ analysisEntries: 2, declaredScenarios: 2, expandedObligations: 4, supportDependencies: 3 })
})
