import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { buildSourceSkeleton } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import { lowerSourceInterpretation } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
const api = await import("./mechanisms.ts").catch(() => ({} as any))
test("frozen proposal qualification permits only the named account frontend changes and refuses semantic drift", () => {
  const frontend = ["src/benchmarks/authorization-dsl/inquiry-native.ts", "src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts", "src/benchmarks/authorization-dsl/inquiry-focus.ts", "src/adapters/codex-account.test.ts"]
  expect(api.qualifyMechanismVersion(frontend).eligible).toBe(true)
  for (const core of ["src/task-dsl/authorization/source-interpretation.ts", "src/task-dsl/authorization/semantic-flow.ts", "src/benchmarks/authorization-dsl/operation-links.ts", "src/unexpected.ts"]) expect(api.qualifyMechanismVersion([...frontend, core]).eligible).toBe(false)
})
async function fixture(source: string) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-mechanism-"))
  await writeFile(path.join(sourceRoot, "app.py"), source)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: source.trimEnd().split("\n").length })
  const symbol = tools.structure!.symbols.find(s => s.name === "entry")!, skeleton = await buildSourceSkeleton(tools.structure!, symbol, tools.evidence, undefined, "finite-control/v1", true)
  const binding = { itemId: "item", handle: "unit", questionId: "q", role: "entry" as const }
  return { tools, symbol, skeleton, binding }
}
test("source demand comparison retains identical original flow and annotations while exposing a dead-call requirement", async () => {
  const f = await fixture("def entry():\n    return False\n    audit()\n"), raw = { schemaVersion: "source-interpretation/v1", revision: f.skeleton.revision, annotations: [{ anchorId: f.skeleton.anchors.find(a => a.kind === "return")!.id, role: "context", explanation: "Anonymous original False return", returnOutcome: "deny" }], unresolved: [] }
  const before = JSON.stringify(raw), result = await api.compareSourceDemand(f.tools.structure!, f.symbol, f.tools.evidence, raw, f.binding)
  expect(result.sourceShapeAligned).toBe(true)
  expect(result.revisionRebindingOnly).toBe(true)
  expect(result.withDemand.accepted).toBe(true)
  expect(result.withoutDemand.accepted).toBe(false)
  expect(result.withoutDemand.diagnostics).toContain("source-interpretation-role-required")
  expect(result.withoutDemand.currentRequiredFields).toBe(2)
  expect(result.withoutDemand.pendingAnnotations).toBe(1)
  expect(result.withDemand.exclusions.map((e: any) => e.reason)).toContain("after-source-exit")
  expect(result.withDemand.pendingAnnotations).toBe(0)
  expect(JSON.stringify(raw)).toBe(before)
})
test("mechanism projection cannot silently replace actual recorded material uses", () => {
  const actual = [{ kind: "entry", operationId: "op", questionId: "q", materialId: "accepted", arguments: [] }]
  expect(api.assertRecordedMaterialUses(actual, structuredClone(actual))).toBeUndefined()
  expect(api.assertRecordedMaterialUses([{ ...actual[0], receiverClass: undefined }], actual)).toBeUndefined()
  expect(() => api.assertRecordedMaterialUses(actual, [{ ...actual[0], materialId: "other" }])).toThrow("recorded-material-use-mismatch")
  expect(() => api.assertRecordedMaterialUses(actual, undefined)).toThrow("recorded-material-use-mismatch")
})
test("mechanism analysis refuses an old draft revision instead of rebinding its semantics to current source", async () => {
  const f = await fixture("def entry():\n    return False\n")
  if (!api.compareSourceDemand) throw new Error("compareSourceDemand is absent")
  await expect(api.compareSourceDemand(f.tools.structure!, f.symbol, f.tools.evidence, { schemaVersion: "source-interpretation/v1", revision: "old", annotations: [], unresolved: [] }, f.binding)).rejects.toThrow("draft-revision-mismatch")
})
test("state comparison uses one source-lowered input and preserves an unknown failure while avoiding whole-question path overflow", async () => {
  const f = await fixture("def entry():\n" + Array.from({ length: 16 }, (_, i) => `    audit${i}()\n`).join("") + "    return True\n")
  const raw = { schemaVersion: "source-interpretation/v1", revision: f.skeleton.revision, annotations: f.skeleton.anchors.filter(a => ["call", "return"].includes(a.kind)).map(a => ({ anchorId: a.id, role: "context", explanation: "Anonymous test-authored shown source", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }
  const lowered = lowerSourceInterpretation(f.skeleton, raw, { ...f.binding, index: f.tools.structure, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  const units = [{ ...lowered.unit!, questionId: "q", source: f.skeleton.source, evidenceIds: f.tools.evidence.map(e => e.id) }], before = JSON.stringify(units), result = api.compareStateMerge(units)
  expect(result.withoutMerge.diagnostics).toContain("semantic-path-limit")
  expect(result.withoutMerge.terminalOutcomes).toBe(1)
  expect(result.withoutMerge.outcomes).not.toContain("allow")
  expect(result.withMerge.diagnostics).toContain("semantic-exception-type-unknown")
  expect(result.withMerge.diagnostics).not.toContain("semantic-path-limit")
  expect(result.withMerge.terminalOutcomes).toBe(2)
  expect(result.withMerge.outcomes).toContain("unknown")
  expect(result.withMerge.failureOriginsMerged).toBe(15)
  expect(JSON.stringify(units)).toBe(before)
})
