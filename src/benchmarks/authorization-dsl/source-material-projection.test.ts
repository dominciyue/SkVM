import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { createSourceMaterials } from "../../task-dsl/authorization/source-materials.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
const api = await import("./source-material-projection.ts").catch(() => ({} as any))
const content = "def entry(actor):\n    return helper(actor)\ndef helper(actor):\n    return actor\ndef unrelated(actor):\n    return actor\n"
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }, { id: "other", operationId: "op", intent: "scope", request: "Explain alternatives", premises: [] }] })
async function fixture() {
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  const unit = (name: string): any => { const s = index.symbols.find(s => s.name === name)!; return { questionId: "q", itemId: name, handle: name, op: "add", role: name === "entry" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, evidenceIds: ["ev"], start: "body", complete: true, coverage: "path", parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "returned", claim: "Test-authored source return", object: "actor", ...(name === "entry" ? { outcome: "allow" } : {}) }] }] } }
  const entry = unit("entry"), helper = unit("helper"), unrelated = unit("unrelated"), call = index.relatedCalls(entry.source.id)[0]!
  entry.blocks[0].steps.unshift({ kind: "call", name: "call", claim: "Actual source relation", sourceCallId: call.id, symbol: "helper", arguments: [{ parameter: "actor", object: "actor" }] })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "finite-control/v1" })
  const accept = (u: any) => store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
  return { index, entry, helper, unrelated, store, accept }
}
test("helper-only materials have no projection; a later actual entry uses only its reachable helper", async () => {
  const f = await fixture(); const helper = f.accept(f.helper); f.accept(f.unrelated)
  expect(api.projectSourceMaterials(program, [], f.store.snapshot(), f.index).units).toEqual([])
  const entry = f.accept(f.entry), projected = api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index)
  expect(projected.units).toHaveLength(4)
  expect(new Set(projected.uses.map((u: any) => u.materialId))).toEqual(new Set([entry.id, helper.id]))
  expect(projected.uses.filter((u: any) => u.kind === "call").every((u: any) => !!u.relationId && u.arguments[0].object === "actor")).toBe(true)
  expect(api.projectSourceMaterials(program, [], f.store.snapshot(), f.index).uses).toEqual([])
  expect(f.store.snapshot().materials.filter(m => m.current)).toHaveLength(3)
})
test("a foreign source call identity never adopts a same-named helper", async () => {
  const f = await fixture(); f.entry.blocks[0].steps[0].sourceCallId = "other-owner-call"; f.accept(f.helper); f.accept(f.entry)
  const projected = api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index)
  expect(projected.uses.filter((u: any) => u.kind === "call")).toEqual([])
  expect(projected.units.filter((u: any) => u.role === "helper")).toEqual([])
})

test("an exact call with a swapped actual argument cannot adopt otherwise valid helper material", async () => {
  const f = await fixture(); f.entry.blocks[0].steps[0].arguments[0].object = "different_actor"; f.accept(f.helper); f.accept(f.entry)
  expect(api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index).uses.filter((u: any) => u.kind === "call")).toEqual([])
})
test("production v3 persists helper-only material before any entry and emits no answer rules", async () => {
  const f = await fixture(), sourceRoot = await mkdtemp(path.join(os.tmpdir(), "aw-material-runtime-"))
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1" })
  f.accept(f.helper)
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v3" as any, sourceAssisted: true, initialSemanticUnits: [f.helper], initialSourceMaterials: f.store.snapshot() })
  expect((domain.report() as any).sourceMaterials.materials.filter((m: any) => m.current)).toHaveLength(1)
  expect((domain.report() as any).sourceMaterials.materials.find((m: any) => m.current).interpretationSource).toBe("test-authored")
  expect(domain.report().slice.rules).toEqual([])
})
