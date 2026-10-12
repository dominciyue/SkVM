import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
const api = await import("./executable-contract.ts").catch(() => ({} as any))
test("a root rejection still reports local resource defects for the same repair pass", async () => {
  const f = await fixture(), raw: any = contract()
  raw.scope.root.startLine = 99
  raw.resourceWorkflow = { inputs: [], steps: [{ id: "broken", op: "return", value: { ref: "missing" } }] }
  const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(r.units).toEqual([])
  expect(r.diagnostics.some((d: any) => d.path === "resourceWorkflow.steps.0.source")).toBe(true)
})
test("progressive author subset of scenario inputs does not throw or invent undeclared facts", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: ["request"], steps: [{ id: "result", op: "return", value: { ref: "request" }, source: cite(8) }] }
  const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive", resourceInputs: { request: 7, other: 9 } })
  expect(r.resourceExecution.returned).toBe(7)
  expect(r.resourceExecution.inputs.other).toBeUndefined()
  expect(r.diagnostics.some((d: any) => d.code === "contract-resource-input-unused")).toBe(true)
})

test("progressive resource draft preserves valid work beside a bad value step", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [
    { id: "kept", op: "value", value: { literal: 7 }, source: cite(1, 2), because: "Finite source example" },
    { id: "broken", op: "value", value: { madeUp: true }, source: cite(1, 2) },
    { id: "result", op: "return", value: { ref: "kept" }, source: cite(8), because: "Independent return" },
  ] }
  const result = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(result.units.length).toBeGreaterThan(0)
  expect(result.resourceExecution.values.kept).toBe(7)
  expect(result.resourceExecution.returned).toBe(7)
  expect(result.diagnostics.some((d: any) => d.path.includes("steps.1"))).toBe(true)
})

test("progressive resource failures preserve ordered control barriers and reject ambiguous identities", async () => {
  const f = await fixture()
  for (const bad of [
    { id: "bad", op: "guard", test: { nonsense: true }, failure: "deny", source: cite(5) },
    { id: "bad", op: "return", value: { nonsense: true }, source: cite(5) },
    { id: "bad", op: "invented", source: cite(5) },
    { id: "bad", op: "guard", test: { op: "literal", value: true }, failure: "deny" },
  ]) {
    const raw: any = contract()
    raw.resourceWorkflow = { inputs: [], steps: [bad, { id: "result", op: "return", value: { literal: 7 }, source: cite(8), because: "Return" }] }
    const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
    expect(r.resourceExecution?.returned).toBe(7)
    expect(r.resourceExecution.conditions.length).toBeGreaterThan(0)
    expect(r.resourceExecution.events.at(-1).outcome).toBe("conditional")
  }
  const raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [1, 2].map(value => ({ id: "dup", op: "value", value: { literal: value }, source: cite(1, 2), because: "Ambiguous" })) }
  raw.resourceWorkflow.steps.push({ id: "result", op: "return", value: { ref: "dup" }, source: cite(8), because: "Unknown" })
  const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(r.resourceExecution).toBeDefined()
  expect(r.resourceExecution.values.dup).toBeUndefined()
  expect(r.resourceExecution.returned).toBeUndefined()
})

test("missing explanation is nonsemantic and post-return errors do not poison executed results", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [
    { id: "result", op: "return", value: { literal: 7 }, source: cite(8) },
    { id: "bad", op: "guard", test: { nonsense: true }, source: cite(5) },
  ] }
  const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(r.resourceExecution?.returned).toBe(7)
  expect(r.resourceExecution.status).toBe("computed")
  expect(r.diagnostics.length).toBeGreaterThan(0)
  expect((await api.compileExecutableContract(raw, f)).units).toEqual([])
})

test("resource source symbols normalize uniquely and missing sources stay local", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [
    { id: "missing", op: "value", value: { literal: 4 } },
    { id: "undefined", op: "value", value: { ref: "not_defined" }, source: cite(1, 2) },
    { id: "result", op: "return", value: { literal: 7 }, source: { path: "app.py", symbol: "local" }, sources: [{ path: "app.py", symbol: "perform" }] },
  ] }
  const r = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(r.resourceExecution?.returned).toBe(7)
  expect(r.resourceExecution.values.missing).toBeUndefined()
  expect(r.resourceExecution.gaps).toContain("not_defined")
  expect(r.resourceExecution.events.at(-1).sources[0].startLine).toBe(4)
})

test("progressive compilation retains independent valid owners and isolates a malformed sibling", async () => {
  const f = await fixture(), raw: any = contract()
  raw.sourceDeclarations.push({ source: { path: "app.py", startLine: 100 }, statements: [{ kind: "invented" }] })
  const strict = await api.compileExecutableContract(raw, f)
  expect(strict.units).toEqual([])
  const progressive = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(progressive.units.length).toBe(2)
  expect(progressive.diagnostics.length).toBeGreaterThan(0)
  expect(progressive.evaluation.questions[0].properties[0].status).toBe("checked")
  expect(progressive.materialUses.some((u: any) => u.kind === "call")).toBe(true)
})

test("progressive missing decisive helper remains unknown while root is retained", async () => {
  const f = await fixture(), raw: any = contract()
  raw.sourceDeclarations.pop()
  const result = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(result.units.length).toBe(1)
  expect(result.evaluation.questions[0].properties[0].status).toBe("unknown")
})

test("thin authored input fills mechanical versions and unique source owners without guessing meaning", async () => {
  const f = await fixture(), raw: any = contract()
  delete raw.schemaVersion
  raw.description = "Nonsemantic author note"
  raw.scope.root = { path: "app.py", symbol: "local" }
  for (const [i, d] of raw.sourceDeclarations.entries()) { delete d.schemaVersion; d.source = { path: "app.py", symbol: i ? "perform" : "local" } }
  const result = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(result.diagnostics).toEqual([])
  expect(result.units.length).toBe(2)
  expect(result.normalizations.length).toBeGreaterThan(0)
  expect(result.contract.scope.root.startLine).toBe(1)
  raw.sourceDeclarations[1].statements[2].test = { op: "allow-because-owner" }
  const bad = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive" })
  expect(bad.diagnostics.length).toBeGreaterThan(0)
  expect(bad.evaluation.questions[0].properties[0].status).toBe("unknown")
})

test("resource summaries share contract source coverage and preserve independent source-current steps", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: ["request"], steps: [{ id: "identity", op: "value", value: { field: { of: { ref: "request" }, key: "id" } }, source: cite(1, 2), because: "Authored source summary" }, { id: "result", op: "return", value: { ref: "identity" }, source: { ...cite(8), sha256: "stale" }, because: "Must reject changed evidence" }] }
  const strict = await api.compileExecutableContract(raw, { ...f, resourceInputs: { request: { id: 7 } } })
  expect(strict.units).toEqual([])
  const result = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive", resourceInputs: { request: { id: 7 } } })
  expect(result.resourceExecution.values.identity).toBe(7)
  expect(result.resourceExecution.returned).toBeUndefined()
  expect(result.resourceExecution.gaps).toContain("resource-source-stale:app.py")
  raw.resourceWorkflow.steps[1].source = cite(8)
  const current = await api.compileExecutableContract(raw, { ...f, resourceInputs: { request: { id: 7 } } })
  expect(current.resourceExecution.returned).toBe(7)
  expect(current.resourceExecution.events.every((e: any) => e.source.sha256)).toBe(true)
  raw.resourceWorkflow.steps[1].sources = [{ ...cite(5), sha256: "stale-helper" }]
  const dependent = await api.compileExecutableContract(raw, { ...f, executionPolicy: "progressive", resourceInputs: { request: { id: 7 } } })
  expect(dependent.resourceExecution.values.identity).toBe(7)
  expect(dependent.resourceExecution.returned).toBeUndefined()
  expect(dependent.resourceExecution.gaps).toContain("resource-source-stale:app.py")
})
const source = "def local(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    if not who.allowed:\n        return False\n    item.sent = True\n    return item\n"
const cite = (startLine: number, endLine = startLine, text?: string) => ({ path: "app.py", startLine, endLine, ...(text ? { text } : {}) })
const declaration = (startLine: number, endLine: number, statements: unknown[]) => ({ schemaVersion: "authorization-question-declaration/v1", source: cite(startLine, endLine), statements })
test("valid unreachable guard is diagnosed without moving it or rejecting the prior computed return", async () => {
  const f = await fixture(), raw: any = contract()
  raw.resourceWorkflow = { inputs: [], steps: [
    { id: "result", op: "return", value: { literal: 7 }, source: cite(8) },
    { id: "permission", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "denied", source: cite(5) },
  ] }
  for (const executionPolicy of ["strict", "progressive"] as const) {
    const r = await api.compileExecutableContract(raw, { ...f, executionPolicy })
    expect(r.resourceExecution.returned).toBe(7)
    expect(r.resourceExecution.events.map((e: any) => e.id)).toEqual(["result"])
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ code: "contract-resource-unreachable", severity: "warning", message: expect.stringContaining("permission") }))
    expect(r.diagnostics.find((d: any) => d.code === "contract-resource-unreachable").message).toContain("stepOrder")
  }
})
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
test("identical call text in one predicate is rejected instead of selecting an arbitrary invocation", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-call-condition-ambiguous-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def local(actor):\n    if check(actor) and check(actor):\n        return True\n    return False\n\ndef check(who):\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 7 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect the local branch", premises: [] }] })
  const test = { op: "all", args: Array.from({ length: 2 }, () => ({ op: "truthy", language: "python", value: { binding: "check(actor)" } })) }
  const raw = { schemaVersion: "authorization-executable-contract/v1", id: "ambiguous-return", scope: { kind: "function-contract", questionId: "q", root: cite(1, 4), upstream: ["Request duties remain outside the contract"] }, sourceDeclarations: [declaration(1, 4, [{ kind: "object", expression: "actor", as: "principal", because: "Actual formal" }, { kind: "condition", at: cite(2, 2, "check(actor) and check(actor)"), test, because: "Two actual calls have the same text" }, { kind: "statement", at: cite(3), because: "Actual return" }, { kind: "statement", at: cite(4), because: "Actual fallback" }])], queries: [], assumptions: [] }
  const result = await api.compileExecutableContract(raw, { tools, program })
  expect(result.diagnostics.some((diagnostic: any) => diagnostic.code === "source-interpretation-predicate-call-ambiguous"), JSON.stringify(result.diagnostics)).toBe(true)
  expect(result.units).toEqual([])
  expect(result.materialUses).toEqual([])
  expect(result.evaluation).toBeUndefined()
})
