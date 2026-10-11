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
