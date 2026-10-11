import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
const api = await import("./question-workflow.ts").catch(() => ({} as any))
const source = "def perform(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return target\n"
async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "be-domain-declaration-")); await writeFile(path.join(sourceRoot, "app.py"), source)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 5 })
  const skeleton = (await tools.sourceSkeleton(tools.structure!.symbols.find(s => s.name === "perform")!.id))!
  return { skeleton, options: { transactionId: "host-owned", questionId: "q", references: [] } }
}
const declaration = () => ({ schemaVersion: "authorization-question-declaration/v1", source: { path: "app.py", startLine: 1, endLine: 5 }, statements: [
  { kind: "object", expression: "actor", as: "principal", because: "Actual source formal actor" },
  { kind: "object", expression: "target", as: "resource", because: "Actual source formal target" },
  { kind: "condition", at: { startLine: 2, text: "not actor.allowed" }, test: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, authorizes: { principal: "actor", resource: "target", when: "false" }, because: "Failed source authorization exits before the target write" },
  { kind: "statement", at: { startLine: 3 }, outcome: "deny", because: "Actual rejected return" },
  { kind: "effect", at: { startLine: 4 }, principal: "actor", resource: "target", because: "Actual source target field write" },
  { kind: "statement", at: { startLine: 5 }, outcome: "unknown", because: "Actual returned object" },
] })
test("source-supported domain statements compile mechanical identities without a slot form", async () => {
  const f = await fixture(); expect(typeof api.compileQuestionDeclaration).toBe("function")
  const compiled = api.compileQuestionDeclaration(f.skeleton, declaration(), f.options)
  expect(compiled.diagnostics).toEqual([])
  expect(compiled.edit.transactionId).toBe("host-owned")
  expect(compiled.edit.edits.filter((e: any) => e.field === "role")).toHaveLength(6)
  const view = api.questionDeclarationView(f.skeleton, { question: { id: "q", request: "Authorization before the write" } })
  expect(JSON.stringify(view)).not.toContain("anchorId")
  expect(JSON.stringify(view)).not.toContain("transactionId")
  expect(view.instruction).toContain("unresolved")
  expect(view.predicateGuide).toContain('op:"truthy"')
  expect(view.predicateGuide).toContain('language:"python"|"go"')
})
test("free-text conditions are rejected rather than interpreted as a finite predicate", async () => {
  const f = await fixture(), raw = declaration()
  ;(raw.statements[2] as any).test = { expression: "not actor.allowed" }
  expect(api.compileQuestionDeclaration(f.skeleton, raw, f.options).diagnostics.some((d: any) => d.code === "source-edit-predicate-unsupported")).toBe(true)
})
test("a stale source, unshown object and ambiguous citation remain named domain gaps", async () => {
  const f = await fixture()
  for (const [raw, code] of [
    [{ ...declaration(), source: { ...declaration().source, sha256: "stale" } }, "question-source-stale"],
    [{ ...declaration(), statements: [{ kind: "effect", at: { startLine: 4 }, principal: "invented", resource: "target", because: "Unsupported object" }] }, "question-object-unresolved"],
    [{ ...declaration(), statements: [{ kind: "statement", at: { startLine: 1, endLine: 5 }, because: "Ambiguous whole body" }] }, "question-source-ambiguous"],
  ] as const) expect(api.compileQuestionDeclaration(f.skeleton, raw, f.options).diagnostics.some((d: any) => d.code === code)).toBe(true)
})
