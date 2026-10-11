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

test("call reachability checks the actual invocation prefix while preserving unknown callee effects", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-call-prefix-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def local(actor, target):\n    if not actor.allowed:\n        return False\n    return perform(target)\n\ndef perform(item):\n    mystery(item)\n    return item\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 8 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect local: Reachability of the perform invocation", premises: [], properties: [{ id: "invoke", kind: "call-reachability" as any, requirement: "Reachability of the perform invocation" }] }] })
  const raw = { schemaVersion: "authorization-executable-contract/v1", id: "call-prefix", scope: { kind: "function-contract", questionId: "q", root: cite(1, 4), upstream: ["Request authentication remains outside this local contract"] }, sourceDeclarations: [declaration(1, 4, [{ kind: "object", expression: "actor", as: "principal", because: "Actual formal" }, { kind: "object", expression: "target", as: "resource", because: "Actual formal" }, { kind: "condition", at: cite(2, 2, "not actor.allowed"), test: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, because: "Source rejection test" }, { kind: "statement", at: cite(3), because: "Actual refusal return" }, { kind: "dependency", at: cite(4, 4, "perform(target)"), because: "Actual call" }, { kind: "statement", at: cite(4, 4, "return perform(target)"), because: "Actual return" }]), declaration(6, 8, [{ kind: "object", expression: "item", as: "resource", because: "Actual callee formal" }, { kind: "dependency", at: cite(7, 7, "mystery(item)"), because: "Unknown external behavior retained" }, { kind: "statement", at: cite(8), because: "Actual return" }])], queries: [{ property: "invoke", effect: cite(4, 4, "perform(target)") }], assumptions: [{ text: "The invocation must not be assumed reachable", origin: "development-premise" }] }
  for (const [allowed, expected] of [[true, "reachable"], [false, "unreachable"], [undefined, "conditional"]] as const) {
    const result = await api.compileExecutableContract(raw, { tools, program, ...(allowed === undefined ? {} : { inputs: { actor: { allowed } } }) })
    const property = result.evaluation?.questions[0]?.properties[0]
    expect(result.diagnostics).toEqual([])
    expect(property?.status, JSON.stringify(property)).toBe("checked")
    expect(property?.value).toBe(expected)
    expect(property?.scope).toBe("current-proposed-call-prefix")
    expect(property?.calleeEffectsCertified).toBe(false)
    expect(property?.effectOccurrences).toEqual([])
    expect(property?.callOccurrences.length).toBeGreaterThan(0)
    expect(property?.traceDetails.some((r: any) => r.kind === "call")).toBe(true)
    expect(result.loweringDiagnostics.some((d: any) => d.code === "semantic-callee-uninterpreted")).toBe(true)
  }
  const nonCall = structuredClone(raw); nonCall.queries[0]!.effect = cite(2, 2, "not actor.allowed")
  const wrong = await api.compileExecutableContract(nonCall, { tools, program })
  expect(wrong.evaluation?.questions[0]?.properties[0]?.gaps).toContain("call-reference-required")
  const earlyRoot = await mkdtemp(path.join(os.tmpdir(), "bf-call-prefix-gap-"))
  await writeFile(path.join(earlyRoot, "app.py"), "def local(actor, target):\n    mystery(actor)\n    if not actor.allowed:\n        return False\n    return perform(target)\n\ndef perform(item):\n    mystery(item)\n    return item\n")
  const earlyTools = await createInquiryTools({ sourceRoot: earlyRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await earlyTools.execute("source_read", { path: "app.py", startLine: 1, endLine: 9 })
  const early: any = structuredClone(raw)
  early.scope.root.endLine++; early.sourceDeclarations[0].source.endLine++
  early.sourceDeclarations[1].source.startLine++; early.sourceDeclarations[1].source.endLine++
  for (const declaration of early.sourceDeclarations) for (const statement of declaration.statements) if (statement.at) { statement.at.startLine++; statement.at.endLine++ }
  early.sourceDeclarations[0].statements.push({ kind: "dependency", at: cite(2, 2, "mystery(actor)"), because: "Unknown behavior before the target invocation is decisive" })
  early.queries[0].effect = cite(5, 5, "perform(target)")
  const blocked = await api.compileExecutableContract(early, { tools: earlyTools, program, inputs: { actor: { allowed: true } } })
  expect(blocked.evaluation?.questions[0]?.properties[0]?.status).toBe("unknown")
})
test("a source predicate consumes the actual helper boolean return without authoring a generated binding", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-call-condition-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def inspect(actor, target):\n    if unrestricted(actor):\n        return target\n    return restrict(target)\n\ndef unrestricted(who):\n    if who is None:\n        return True\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 9 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Reachability of restricted lookup", premises: [], properties: [{ id: "lookup", kind: "call-reachability", requirement: "Reachability of restricted lookup" }] }] })
  const raw = { schemaVersion: "authorization-executable-contract/v1", id: "returned-condition", scope: { kind: "function-contract", questionId: "q", root: cite(1, 4), upstream: ["Request entry stays outside this local contract"] }, sourceDeclarations: [declaration(1, 4, [{ kind: "object", expression: "actor", as: "principal", because: "Actual input" }, { kind: "object", expression: "target", as: "resource", because: "Actual input" }, { kind: "dependency", at: cite(2, 2, "unrestricted(actor)"), as: "condition", because: "Actual helper controls the source branch" }, { kind: "condition", at: cite(2, 2, "unrestricted(actor)"), test: { op: "truthy", language: "python", value: { binding: "unrestricted(actor)" } }, because: "Use the current source invocation's actual return" }, { kind: "statement", at: cite(3), because: "Actual early return" }, { kind: "dependency", at: cite(4, 4, "restrict(target)"), because: "Unknown behavior stays after the selected invocation" }, { kind: "statement", at: cite(4, 4, "return restrict(target)"), because: "Actual restricted return" }]), declaration(6, 9, [{ kind: "object", expression: "who", as: "principal", because: "Actual helper input" }, { kind: "condition", at: cite(7, 7, "who is None"), test: { op: "is-null", value: { binding: "who" } }, because: "Actual null test" }, { kind: "statement", at: cite(8), because: "Actual True return" }, { kind: "statement", at: cite(9), because: "Actual False return" }])], queries: [{ property: "lookup", effect: cite(4, 4, "restrict(target)") }], assumptions: [] }
  for (const [inputs, expected] of [[{ actor: null }, "unreachable"], [{ actor: "person" }, "reachable"], [undefined, "conditional"]] as const) {
    const result = await api.compileExecutableContract(raw, { tools, program, inputs })
    expect(result.diagnostics).toEqual([])
    const property = result.evaluation.questions[0].properties[0]
    expect(property.status, JSON.stringify(property)).toBe("checked")
    expect(property.value, JSON.stringify({ expected, units: result.projectedUnits?.map((u: any) => ({ handle: u.handle, steps: u.blocks.flatMap((b: any) => b.steps).filter((s: any) => ["choose", "call", "return"].includes(s.kind)) })), rules: result.slice.rules.filter((r: any) => ["continue", "return"].includes(r.kind)).map((r: any) => ({ kind: r.kind, condition: r.condition, value: r.returnValue, origin: r.sourceOrigin })) })).toBe(expected)
    expect(new Set(property.traceDetails.map((r: any) => r.source?.id)).size).toBe(2)
    expect(result.materialUses.some((u: any) => u.kind === "call")).toBe(true)
  }
})
