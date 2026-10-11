import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
const api = await import("./executable-contract.ts").catch(() => ({} as any))
const source = "def local(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    if not who.allowed:\n        return False\n    item.sent = True\n    return item\n"
const cite = (startLine: number, endLine = startLine, text?: string) => ({ path: "app.py", startLine, endLine, ...(text ? { text } : {}) })
const declaration = (startLine: number, endLine: number, statements: unknown[]) => ({ schemaVersion: "authorization-question-declaration/v1", source: cite(startLine, endLine), statements })
const contract = () => ({ schemaVersion: "authorization-executable-contract/v1", id: "local-contract", scope: { kind: "function-contract", questionId: "q", root: cite(1, 2), upstream: ["Request authentication and dispatch are outside this local contract."] }, sourceDeclarations: [
  declaration(1, 2, [{ kind: "object", expression: "actor", as: "principal", because: "Actual formal" }, { kind: "object", expression: "target", as: "resource", because: "Actual formal" }, { kind: "dependency", at: cite(2, 2, "perform(actor, target)"), because: "Actual invocation" }, { kind: "statement", at: cite(2, 2, "return perform(actor, target)"), because: "Actual returned value" }]),
  declaration(4, 8, [{ kind: "object", expression: "who", as: "principal", because: "Actual formal" }, { kind: "object", expression: "item", as: "resource", because: "Actual formal" }, { kind: "condition", at: cite(5, 5, "not who.allowed"), test: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "who.allowed" } } }, authorizes: { principal: "who", resource: "item", when: "false" }, because: "False source test continues to the write" }, { kind: "statement", at: cite(6), because: "Source refusal returns" }, { kind: "effect", at: cite(7), principal: "who", resource: "item", because: "Actual field write" }, { kind: "statement", at: cite(8), because: "Actual object return" }]),
], queries: [{ property: "auth", effect: cite(7, 7, "item.sent = True"), guard: cite(5, 5, "not who.allowed") }], assumptions: [] })
async function fixture(read = true) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-local-contract-")); await writeFile(path.join(sourceRoot, "app.py"), source)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  if (read) await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 8 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect local: Authorization before the target write", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "Authorization before the target write" }] }, { id: "original-other", request: "Keep the remaining original question", premises: [] }] })
  return { tools, program }
}
test("an authored function contract uses the existing cross-call checker without relabeling helpers", async () => {
  const f = await fixture()
  try {
    expect(typeof api.compileExecutableContract).toBe("function")
    const result = await api.compileExecutableContract(contract(), f)
    expect(result.diagnostics).toEqual([])
    const checked = result.evaluation.questions.find((q: any) => q.questionId === "q").properties[0]
    expect(checked.status, JSON.stringify({ gaps: checked.gaps, missing: result.demands.map((d: any) => d.dependencies?.propertyQueries?.diagnostics), lowering: result.loweringDiagnostics, projection: result.materialProjection })).toBe("checked")
    expect(checked.traceDetails.some((t: any) => t.kind === "call")).toBe(true)
    expect(result.units.every((u: any) => u.role === "helper")).toBe(true)
    expect(result.materialUses.some((u: any) => u.kind === "function-root")).toBe(true)
    expect(result.materialUses.some((u: any) => u.kind === "call")).toBe(true)
    expect(result.scope.kind).toBe("function-contract")
    expect(result.requestOperationCertified).toBe(false)
    expect(f.program.questions.map(q => q.id)).toEqual(["q", "original-other"])
  } finally { await f.tools.verifySnapshot() }
})
test("unread, stale, wrong question and trusted verdict fields are rejected", async () => {
  const unread = await fixture(false)
  try { expect((await api.compileExecutableContract(contract(), unread)).diagnostics.some((d: any) => d.code === "contract-source-unread")).toBe(true) } finally { await unread.tools.verifySnapshot() }
  const f = await fixture()
  try {
    for (const [raw, code] of [[{ ...contract(), verdict: "checked" }, "contract-shape"], [{ ...contract(), scope: { ...contract().scope, questionId: "wrong" } }, "contract-question"], [{ ...contract(), sourceDeclarations: [{ ...contract().sourceDeclarations[0]!, source: { ...contract().sourceDeclarations[0]!.source, sha256: "stale" } }, contract().sourceDeclarations[1]] }, "contract-source-stale"]] as const) expect((await api.compileExecutableContract(raw, f)).diagnostics.some((d: any) => d.code === code)).toBe(true)
  } finally { await f.tools.verifySnapshot() }
})

test("class receiver citations resolve uniquely from original scope and reject a foreign receiver", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bf-contract-receiver-"))
  await writeFile(path.join(root, "app.py"), "class Box:\n    def local(self, actor, target):\n        return self.perform(actor, target)\n\n    def perform(self, who, item):\n        if not who.allowed:\n            return False\n        item.sent = True\n        return item\n\nclass Other:\n    pass\n")
  const tools = await createInquiryTools({ sourceRoot: root, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 12 })
  const f = await fixture(), raw: any = contract()
  raw.scope.root = { ...cite(2, 3), receiverClass: "Box" }
  raw.sourceDeclarations[0].source = { ...cite(2, 3), receiverClass: "Box" }
  raw.sourceDeclarations[1].source = { ...cite(5, 9), receiverClass: "Box" }
  for (const declaration of raw.sourceDeclarations) {
    declaration.statements.unshift({ kind: "object", expression: "self", as: "context", because: "Actual receiver formal" })
    for (const statement of declaration.statements) if (statement.at) { statement.at.startLine++; statement.at.endLine++; if (statement.at.text?.includes("perform(actor, target)")) statement.at.text = statement.at.text.replace("perform(actor, target)", "self.perform(actor, target)") }
  }
  raw.queries[0].effect = cite(8, 8, "item.sent = True"); raw.queries[0].guard = cite(6, 6, "not who.allowed")
  const result = await api.compileExecutableContract(raw, { tools, program: f.program })
  expect(result.diagnostics).toEqual([])
  expect(result.units.every((u: any) => u.receiverClass === "app.Box")).toBe(true)
  expect(result.materialUses.some((u: any) => u.kind === "call")).toBe(true)
  const foreign = structuredClone(raw); foreign.sourceDeclarations[1].source.receiverClass = "Other"
  expect((await api.compileExecutableContract(foreign, { tools, program: f.program })).diagnostics.some((d: any) => d.code === "contract-source-receiver")).toBe(true)
})

test("the same local source contract recomputes true false and unknown entry inputs without assuming its property", async () => {
  const f = await fixture(), program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect local: Reachability of the target write", premises: [], properties: [{ id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }] }, { id: "original-other", request: "Retain all original duties", premises: [] }] })
  for (const [inputs, expected] of [[{ actor: { allowed: true } }, "conditional"], [{ actor: { allowed: false } }, "unreachable"], [undefined, "conditional"]] as const) {
    const result = await api.compileExecutableContract(contract(), { tools: f.tools, program, inputs })
    expect(result.diagnostics).toEqual([])
    const property = result.evaluation.questions[0].properties[0]
    expect(property.status, JSON.stringify(property)).toBe("checked")
    expect(property.value, JSON.stringify({ property, rules: result.slice.rules, roots: result.functionRoots })).toBe(expected)
    expect(result.conditions).toEqual(inputs ?? {})
    expect(result.requestOperationCertified).toBe(false)
    const guard = result.slice.rules.find((r: any) => r.kind === "guard")
    if (inputs) expect(JSON.stringify(guard?.condition)).toContain(`\"literal\":${inputs.actor.allowed}`)
    else expect(JSON.stringify(guard?.condition)).toContain(".allowed")
  }
  expect((await api.compileExecutableContract(contract(), { tools: f.tools, program, inputs: { "$guard": true } })).diagnostics.some((d: any) => d.code === "contract-input-parameter")).toBe(true)
})
