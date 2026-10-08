import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { evaluateControlPaths, controlObjectDiagnostics } from "./control-conclusion.ts"
import type { SemanticBlock, BoundSemanticBlock } from "./semantic-flow.ts"
const api = await import("./semantic-flow.ts").catch(() => ({} as any))
const plan = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Role is admin. Flag is true.", premises: [] }] })
const eq = (binding: string, value: unknown) => ({ op: "eq", left: { binding }, right: { literal: value } })
const block = (name: string, steps: unknown[]) => ({ name, steps })
const unit = (blocks: any[], extra = {}) => ({ questionId: "q", evidenceIds: ["ev"], itemId: "work", handle: "entry", op: "add", role: "entry", start: "main", complete: true, fallthrough: "allow", parameters: [], blocks, ...extra })
function lower(units: unknown[], bindings: unknown[] = [], options: { propertyDirected?: boolean } = {}) {
  expect(typeof api.lowerSemanticFlow).toBe("function")
  const lowered = api.lowerSemanticFlow(units, options)
  const merged = mergeControlSlice(createControlSlice(), { ...lowered.delta, bindings }, plan, { questionIds: ["q"], shownEvidenceIds: ["ev"] })
  expect(merged.diagnostics).toEqual([])
  const evaluated = evaluateControlPaths(merged.state)
  return { ...lowered, slice: merged.state, ...evaluated, diagnostics: [...lowered.diagnostics, ...evaluated.diagnostics] }
}
const known = (key: string, value: unknown, text: string) => ({ questionId: "q", key, value, text, origin: "user" })
test("fresh class namespace functions retain separate actual outer environments", () => {
  const factory = unit([block("main", [{ kind: "assign-value", name: "class", claim: "This invocation creates a class", result: "Local", value: { literal: "class" }, sourceClass: { targetId: "class", targetSha256: "sha", scope: "definition", namespace: true, bases: [] } }, { kind: "assign-value", name: "function", claim: "This method captures this invocation's flag", result: "read", value: { literal: "function" }, sourceCallable: { targetId: "read", targetSha256: "sha", captures: [{ parameter: "flag", object: "flag" }] } }, { kind: "transform", name: "namespace", claim: "Class retains the actual function", object: "Local", field: "read", source: "read" }, { kind: "return", name: "return", valueFrom: "Local", claim: "Return the actual class" }])], { role: "helper", handle: "factory", coverage: "path", parameters: [{ name: "flag", type: "value" }] })
  const read = unit([block("main", [{ kind: "return", name: "read", valueFrom: "flag", claim: "Return this method's captured flag" }])], { role: "helper", handle: "read", coverage: "path", parameters: [{ name: "flag", type: "value" }], source: { id: "read", sha256: "sha", path: "app.py", startLine: 1, endLine: 2 } })
  const root = unit([block("main", [{ kind: "bind", name: "yes", type: "value", value: true, claim: "First flag" }, { kind: "bind", name: "no", type: "value", value: false, claim: "Second flag" }, ...["first", "second"].map((name, i) => ({ kind: "call", name: `create-${name}`, symbol: "factory", callee: "factory", result: name, arguments: [{ parameter: "flag", object: i ? "no" : "yes" }], claim: "Execute this factory" })), ...["first", "second"].map(name => ({ kind: "call", name: `read-${name}`, symbol: `${name}.read`, callee: "read", result: `flag-${name}`, arguments: [], callableRead: { object: `${name}.read`, targetId: "read", targetSha256: "sha" }, claim: "Read this class's actual function" })), { kind: "choose", name: "separate", cases: [{ condition: { op: "all", args: [eq("flag-first", true), eq("flag-second", false)] }, body: "deny" }], otherwise: "allow", claim: "Observe separate environments" }]), block("deny", [{ kind: "reject", name: "deny", failureKind: "authorization", claim: "Both original environments retained" }]), block("allow", [{ kind: "return", name: "allow", outcome: "allow", claim: "Conflated environments" }])], { coverage: "path" }), r = api.lowerSemanticFlow([root, factory, read], { propertyDirected: true })
  expect(r.diagnostics).toEqual([]); expect(r.delta.rules.filter((r: any) => r.terminal).map((r: any) => r.outcome)).toEqual(["deny"])
  expect(new Set(r.fieldChanges.map((r: any) => r.object)).size).toBe(2)
})

for (const mode of ["inherited", "base-write", "override", "method", "diamond", "unknown-base", "module-base", "duplicate", "hook", "protocol-after", "inconsistent"]) test(`actual class namespace inheritance preserves current object state: ${mode}`, () => {
  const cls = (result: string, bases: string[] = []) => ({ kind: "assign-value", name: `create-${result}`, claim: "Actual ordinary class namespace", result, value: { literal: result }, sourceClass: { targetId: result, targetSha256: "sha", scope: "definition", namespace: true, bases } })
  const steps: any[] = [cls("Base"), { kind: "transform", name: "base-field", claim: "Original base namespace", object: "Base", field: "flag", value: true }]
  if (mode === "module-base") steps[0].sourceClass = { targetId: "Base", targetSha256: "sha" }
  if (mode === "hook") steps.push({ kind: "transform", name: "hook", claim: "Unmodeled subclass hook", object: "Base", field: "__init_subclass__", value: null })
  if (mode === "method") steps.push({ kind: "assign-value", name: "function", claim: "Current function object", result: "guard", value: { literal: "guard" }, sourceCallable: { targetId: "guard", targetSha256: "sha", captures: [] } }, { kind: "transform", name: "method", claim: "Actual ordinary namespace function", object: "Base", field: "guard", source: "guard" })
  if (mode === "inconsistent") steps.push(cls("Left", ["Base"]), cls("Right", ["Base"]), cls("LR", ["Left", "Right"]), cls("RL", ["Right", "Left"]))
  if (mode === "diamond") steps.push(cls("Left", ["Base"]), cls("Right", ["Base"]), { kind: "transform", name: "right-field", claim: "C3 must consult Right before Base", object: "Right", field: "flag", value: false })
  steps.push(cls("Local", mode === "unknown-base" ? ["missing"] : mode === "duplicate" ? ["Base", "Base"] : mode === "inconsistent" ? ["LR", "RL"] : mode === "diamond" ? ["Left", "Right"] : ["Base"]))
  if (mode === "protocol-after") steps.push({ kind: "transform", name: "replace-bases", claim: "Changing the class protocol invalidates the old namespace proof", object: "Base", field: "__bases__", value: [] })
  if (mode === "base-write") steps.push({ kind: "transform", name: "later", claim: "Later base write remains visible", object: "Base", field: "flag", value: false })
  if (mode === "override") steps.push({ kind: "transform", name: "override", claim: "Child write stays on child", object: "Local", field: "flag", value: false })
  if (mode === "method") steps.push({ kind: "call", name: "invoke", symbol: "Local.guard", callee: "guard", arguments: [], callableRead: { object: "Local.guard", targetId: "guard", targetSha256: "sha" }, claim: "Read the actual inherited function object" })
  steps.push({ kind: "choose", name: "state", claim: "Observe current namespace", cases: [{ condition: { op: "all", args: [eq("Base.flag", mode === "base-write" ? false : true), eq("Local.flag", ["base-write", "override", "diamond"].includes(mode) ? false : true)] }, body: "deny" }], otherwise: "allow" })
  const root = unit([block("main", steps), block("deny", [{ kind: "reject", name: "deny", failureKind: "authorization", claim: "Actual inherited or own state" }]), block("allow", [{ kind: "return", name: "allow", outcome: "allow", claim: "Wrong namespace state" }])], { coverage: "path" }), guard = unit([block("main", [{ kind: "reject", name: "guard-deny", failureKind: "authorization", claim: "Actual inherited function runs" }])], { role: "helper", handle: "guard", coverage: "path", source: { id: "guard", sha256: "sha", path: "app.py", startLine: 1, endLine: 2 } })
  expect(api.SemanticStepSchema.safeParse(steps[0]).success).toBe(true)
  const r = api.lowerSemanticFlow([root, guard], { propertyDirected: true }), valid = ["inherited", "base-write", "override", "method", "diamond"].includes(mode)
  expect(r.diagnostics.map((d: any) => d.code)).toEqual(valid ? [] : [["hook", "protocol-after"].includes(mode) ? "source-class-protocol-written" : "source-class-base-unresolved"])
  expect(r.delta.rules.filter((r: any) => r.terminal).map((r: any) => r.outcome)).toEqual(valid ? ["deny"] : [undefined])
})

test("each executed local class definition creates a fresh object across helper invocations", () => {
  const creation = { kind: "assign-value", name: "created", claim: "Actual local class definition", result: "Local", value: { literal: "same-class-source" }, sourceClass: { targetId: "local-class", targetSha256: "sha", scope: "definition" } }
  expect(api.SemanticStepSchema.safeParse(creation).success).toBe(true)
  const make = unit([block("main", [creation, { kind: "transform", name: "field", claim: "This invocation's class field", object: "Local", field: "flag", source: "flag" }, { kind: "return", name: "result", claim: "Return this class", valueFrom: "Local" }])], { role: "helper", handle: "make", coverage: "path", parameters: [{ name: "flag", type: "value" }] })
  const root = unit([block("main", [{ kind: "bind", name: "yes", type: "value", value: true, claim: "First actual argument" }, { kind: "bind", name: "no", type: "value", value: false, claim: "Second actual argument" }, { kind: "call", name: "first", symbol: "make", callee: "make", result: "first", arguments: [{ parameter: "flag", object: "yes" }], claim: "First definition" }, { kind: "call", name: "second", symbol: "make", callee: "make", result: "second", arguments: [{ parameter: "flag", object: "no" }], claim: "Second definition" }, { kind: "choose", name: "actual", claim: "Independent class state", cases: [{ condition: { op: "all", args: [eq("first.flag", true), eq("second.flag", false)] }, body: "deny" }], otherwise: "allow" }]), block("deny", [{ kind: "reject", name: "deny", claim: "Both actual fields", failureKind: "authorization" }]), block("allow", [{ kind: "return", name: "allow", claim: "Merged objects would reach this wrong branch", outcome: "allow" }])], { coverage: "path" })
  const r = api.lowerSemanticFlow([root, make], { propertyDirected: true })
  expect(r.diagnostics).toEqual([])
  expect(r.delta.rules.filter((r: any) => r.terminal).map((r: any) => r.outcome)).toEqual(["deny"])
  expect(new Set(r.fieldChanges.map((r: any) => r.object)).size).toBe(2)
})

for (const mode of ["direct", "return", "alias", "field", "repeat", "different", "literal", "overwrite"]) test(`source class references preserve the actual transformed object: ${mode}`, () => {
  const read = (result: string, targetId = "class-source") => ({ kind: "assign-value", name: `class-${result}`, claim: "Read current source class object", result, value: { literal: "class-token" }, sourceClass: { targetId, targetSha256: "class-sha" } })
  expect(api.SemanticStepSchema.safeParse(read("first")).success).toBe(true)
  const decorate = unit([block("main", [{ kind: "transform", name: "change", claim: "Actual decorator changes class field", object: "cls", field: "enabled", value: true }, { kind: "return", name: "returned", claim: "Return actual class object", valueFrom: "cls" }])], { role: "helper", handle: "decorate", coverage: "path", parameters: [{ name: "cls", type: "value" }] })
  const steps: any[] = [read("first"), { kind: "call", name: "apply", claim: "Apply actual source decorator", symbol: "decorate", callee: "decorate", result: "returned", arguments: [{ parameter: "cls", object: "first" }] }]
  let selected = "first"
  if (mode === "return") selected = "returned"
  if (mode === "alias") { steps.push({ kind: "assign-value", name: "alias", claim: "Preserve class identity", result: "alias", value: { binding: "returned" } }); selected = "alias" }
  if (mode === "field") { steps.push({ kind: "transform", name: "store", claim: "Store actual class object", object: "context", field: "cls", source: "returned" }); selected = "context.cls" }
  if (mode === "repeat" || mode === "different") { steps.push(read("second", mode === "repeat" ? "class-source" : "other-class-source")); selected = "second" }
  if (mode === "literal" || mode === "overwrite") { steps.push({ kind: "assign-value", name: "replace", claim: "A plain token cannot preserve the source object", result: mode === "literal" ? "token" : "first", value: { literal: "class-token" } }); selected = mode === "literal" ? "token" : "first" }
  steps.push({ kind: "choose", name: "state", claim: "Observe actual class modification", cases: [{ condition: eq(`${selected}.enabled`, true), body: "denied" }], otherwise: "other" })
  const root = unit([block("main", steps), block("denied", [{ kind: "reject", name: "denied", claim: "Modified class reaches this branch", failureKind: "authorization" }]), block("other", [{ kind: "return", name: "other", claim: "Other class or value", outcome: "allow" }])], { coverage: "path", parameters: [{ name: "context", type: "configuration" }] }), r = api.lowerSemanticFlow([root, decorate], { propertyDirected: true })
  expect(r.diagnostics).toEqual([])
  expect(r.delta.rules.filter((r: any) => r.terminal).map((r: any) => r.outcome)).toEqual(["direct", "return", "alias", "field", "repeat"].includes(mode) ? ["deny"] : ["deny", "allow"])
})

for (const mode of ["binding", "function", "method", "read", "invoke"]) test(`source class metadata cannot fabricate function invocation: ${mode}`, () => {
  const creation: any = { kind: "assign-value", name: "class", claim: "Current class reference", result: "cls", value: { literal: "token" }, sourceClass: { targetId: "class-source", targetSha256: "sha" } }
  if (mode === "binding") creation.value = { binding: "unknown" }
  if (mode === "function") creation.sourceCallable = { targetId: "function-source", targetSha256: "sha", captures: [] }
  if (mode === "method") creation.boundMethod = { receiver: "self", targetId: "function-source", targetSha256: "sha" }
  if (mode === "read") creation.methodRead = { receiver: "self", method: "guard" }
  const root = unit([block("main", [creation, { kind: "call", name: "invoke", claim: "A class token supplies no source function", symbol: "cls", callee: "guard", arguments: [], callableRead: { object: "cls", targetId: "class-source", targetSha256: "sha" } }])], { coverage: "path", parameters: [{ name: "self", type: "value" }] }), guard = unit([block("main", [{ kind: "reject", name: "denied", claim: "This function must not run", failureKind: "authorization" }])], { role: "helper", handle: "guard" }), r = api.lowerSemanticFlow([root, guard], { propertyDirected: true })
  expect(r.diagnostics.map((d: any) => d.code)).toEqual([mode === "invoke" ? "source-callable-value-unresolved" : "source-class-creation-unresolved"])
  expect(r.delta.rules.some((r: any) => r.failureKind === "authorization")).toBe(false)
})

for (const mode of ["direct", "parameter", "helper-return", "field", "alias", "overwrite", "literal-token", "wrong-target", "wrong-sha", "missing-capture", "wrong-type", "conflicting-capture", "stale-source", "function-write", "unbound-capture"]) test(`source callable values invoke their actual captured environment: ${mode}`, () => {
  const reference = { targetId: "guard-source", targetSha256: "guard-sha" }, capture: any = { kind: "assign-value", name: "capture", claim: "Create source function with its actual environment", result: "callback", value: { literal: "function-token" }, sourceCallable: { ...reference, captures: [{ parameter: "flag", object: "flag" }] } }, read: any = { object: "callback", ...reference }
  const invoke: any = { kind: "call", name: "invoke", claim: "Invoke the actual source function", symbol: "callback", callee: "guard", arguments: [{ parameter: "actor", object: "actor" }], callableRead: read }
  if (mode === "wrong-target") read.targetId = "other-source"
  if (mode === "wrong-sha") read.targetSha256 = "old-sha"
  if (mode === "missing-capture") capture.sourceCallable.captures = []
  if (mode === "unbound-capture") capture.sourceCallable.captures[0].object = "missing"
  if (mode === "conflicting-capture") invoke.arguments.push({ parameter: "flag", object: "other" })
  expect(api.SemanticStepSchema.safeParse(capture).success).toBe(true)
  expect(api.SemanticStepSchema.safeParse(invoke).success).toBe(true)
  const relayCall = { ...invoke, callableRead: { ...read, object: "operation" } }, relay = unit([block("main", [relayCall, { kind: "return", name: "done", claim: "Relay returns" }])], { handle: "relay", role: "helper", parameters: [{ name: "operation", type: "value" }, { name: "actor", type: "principal" }] }), identity = unit([block("main", [{ kind: "return", name: "same", claim: "Return the passed function object", valueFrom: "operation" }])], { handle: "identity", role: "helper", coverage: "path", parameters: [{ name: "operation", type: "value" }] })
  const prefix: any[] = [{ kind: "bind", name: "flag", claim: "Original captured source value", type: "value", value: true }, { kind: "bind", name: "other", claim: "Unrelated caller value", type: "value", value: false }, capture]
  if (mode === "overwrite" || mode === "literal-token") prefix.push({ kind: "assign-value", name: "replace", claim: "Replace the function with a plain literal", result: "callback", value: { literal: mode === "literal-token" ? "function-token" : null } })
  if (mode === "function-write") prefix.push({ kind: "transform", name: "mutate-function", claim: "Unknown function attribute transformation", object: "callback", field: "__code__", value: null })
  if (mode === "field") { prefix.push({ kind: "transform", name: "store", claim: "Store actual function value", object: "context", field: "operation", source: "callback" }); read.object = "context.operation" }
  if (mode === "alias") { prefix.push({ kind: "assign-value", name: "copy", claim: "Copy the actual function reference", result: "copied", value: { binding: "callback" } }, { kind: "assign-value", name: "replace-original", claim: "Later original local replacement", result: "callback", value: { literal: null } }); read.object = "copied" }
  if (mode === "helper-return") { prefix.push({ kind: "call", name: "identity", claim: "Pass and return original function", symbol: "identity", callee: "identity", arguments: [{ parameter: "operation", object: "callback" }], result: "returned" }); read.object = "returned" }
  prefix.push({ kind: "assign-value", name: "replace-local-flag", claim: "Caller local changes after capture", result: "flag", value: { literal: false } })
  const called = mode === "parameter" ? { kind: "call", name: "relay", claim: "Pass function as an actual argument", symbol: "relay", callee: "relay", arguments: [{ parameter: "operation", object: "callback" }, { parameter: "actor", object: "actor" }] } : invoke
  const guard = unit([block("main", [{ kind: "choose", name: "flag", claim: "Read original captured flag", cases: [{ condition: eq("flag", true), body: "denied" }], otherwise: "allowed" }]), block("denied", [{ kind: "reject", name: "deny", claim: "Original function rejects", failureKind: "authorization" }]), block("allowed", [{ kind: "return", name: "allow", claim: "Function returns" }])], { handle: "guard", role: "helper", coverage: "path", parameters: [{ name: "actor", type: "principal" }, { name: "flag", type: mode === "wrong-type" ? "principal" : "value" }], source: { id: "guard-source", sha256: mode === "stale-source" ? "new-sha" : "guard-sha", path: "app.py", startLine: 1, endLine: 4 } })
  const root = unit([block("main", [...prefix, called, { kind: "effect", name: "write", claim: "Following protected effect" }])], { coverage: "path", parameters: [{ name: "actor", type: "principal" }, { name: "context", type: "configuration" }] }), r = api.lowerSemanticFlow([root, relay, identity, guard], { propertyDirected: true }), valid = ["direct", "parameter", "helper-return", "field", "alias"].includes(mode)
  expect(r.delta.rules.some((r: any) => r.failureKind === "authorization")).toBe(valid)
  expect(r.delta.rules.some((r: any) => r.kind === "effect")).toBe(false)
  if (!valid) expect(r.diagnostics.length).toBeGreaterThan(0)
})

test("two factory invocations retain distinct environments for the same source callable body", () => {
  const reference = { targetId: "read-source", targetSha256: "read-sha" }, factory = unit([block("main", [{ kind: "assign-value", name: "definition", claim: "Original local definition", result: "callback", value: { literal: "same-body-token" }, sourceCallable: { ...reference, captures: [{ parameter: "flag", object: "flag" }] } }, { kind: "return", name: "return", claim: "Return actual closure", valueFrom: "callback" }])], { role: "helper", handle: "factory", coverage: "path", parameters: [{ name: "flag", type: "value" }] }), read = unit([block("main", [{ kind: "return", name: "value", claim: "Read this closure environment", valueFrom: "flag" }])], { role: "helper", handle: "read", coverage: "path", parameters: [{ name: "flag", type: "value" }], source: { id: reference.targetId, sha256: reference.targetSha256, path: "app.py", startLine: 1, endLine: 2 } })
  const root = unit([block("main", [{ kind: "bind", name: "false", claim: "First factory value", type: "value", value: false }, { kind: "bind", name: "true", claim: "Second factory value", type: "value", value: true }, ...["first", "second"].map((name, i) => ({ kind: "call", name: `create-${name}`, claim: "Run original factory", symbol: "factory", callee: "factory", arguments: [{ parameter: "flag", object: i ? "true" : "false" }], result: name })), ...["first", "second"].map(name => ({ kind: "call", name: `invoke-${name}`, claim: "Invoke this actual closure", symbol: name, callee: "read", arguments: [], result: `value-${name}`, callableRead: { object: name, ...reference } })), { kind: "choose", name: "separate", claim: "Both environments retain original values", cases: [{ condition: { op: "all", args: [eq("value-first", false), eq("value-second", true)] }, body: "correct" }], otherwise: "wrong" }]), block("correct", [{ kind: "reject", name: "deny", claim: "Expected distinct original values", failureKind: "authorization" }]), block("wrong", [{ kind: "effect", name: "write", claim: "Environment conflation would reach this effect" }])], { coverage: "path" }), r = api.lowerSemanticFlow([root, factory, read], { propertyDirected: true })
  expect(r.diagnostics).toEqual([])
  expect(r.delta.rules.some((r: any) => r.failureKind === "authorization")).toBe(true)
  expect(r.delta.rules.some((r: any) => r.kind === "effect")).toBe(false)
})

for (const mode of ["module", "fresh", "module-captures"]) test(`repeated module references share the original function identity: ${mode}`, () => {
  const reference = { targetId: "guard-source", targetSha256: "guard-sha" }, create = (result: string) => ({ kind: "assign-value", name: `read-${result}`, claim: "Read or create original current function", result, value: { literal: "function-token" }, sourceCallable: { ...reference, ...(mode !== "fresh" ? { scope: "module" } : {}), captures: mode === "module-captures" ? [{ parameter: "flag", object: "flag" }] : [] } })
  expect(api.SemanticStepSchema.safeParse(create("first")).success).toBe(true)
  const root = unit([block("main", [{ kind: "bind", name: "flag", claim: "Source value", type: "value", value: true }, create("first"), { kind: "transform", name: "write-function", claim: "Attribute write on first actual reference", object: "first", field: "__code__", value: null }, create("second"), { kind: "call", name: "invoke", claim: "Invoke second reference", symbol: "second", callee: "guard", arguments: [], callableRead: { object: "second", ...reference } }])], { coverage: "path" }), guard = unit([block("main", [{ kind: "reject", name: "denied", claim: "Original target rejects", failureKind: "authorization" }])], { role: "helper", handle: "guard", coverage: "path", source: { id: reference.targetId, sha256: reference.targetSha256, path: "app.py", startLine: 1, endLine: 2 } }), r = api.lowerSemanticFlow([root, guard], { propertyDirected: true })
  expect(r.diagnostics.map((d: any) => d.code)).toEqual(mode === "fresh" ? [] : [mode === "module" ? "source-callable-attributes-written" : "source-callable-creation-unresolved"])
  expect(r.delta.rules.some((r: any) => r.failureKind === "authorization")).toBe(mode === "fresh")
})

for (const mode of ["stored", "helper", "later-method-store", "overwritten", "unknown-overwrite", "class-overwrite", "other-receiver", "literal-token", "wrong-target", "wrong-sha"]) test(`bound field methods keep their actual capture and current field value: ${mode}`, () => {
  const reference = { receiver: "self", targetId: "guard-source", targetSha256: "guard-sha" }, capture: any = { kind: "assign-value", name: "capture", claim: "Capture original ordinary bound method", result: "method", value: { literal: "method-token" }, methodRead: { receiver: "self", method: "guard" }, boundMethod: reference }, store: any = { kind: "transform", name: "store", claim: "Store the captured method", object: "self", field: "handler", source: "method" }
  const setup = unit([block("main", [capture, store, { kind: "return", name: "done", claim: "Setup returns" }])], { handle: "setup", role: "helper", parameters: [{ name: "self", type: "configuration" }] })
  const invoke: any = { kind: "call", name: "invoke", claim: "Invoke only the captured field method", symbol: "self.handler", callee: "guard", arguments: [{ parameter: "self", object: mode === "other-receiver" ? "other" : "self" }], fieldMethodRead: { object: "self.handler", ...reference, receiver: mode === "other-receiver" ? "other" : "self" } }
  if (mode === "wrong-target") invoke.fieldMethodRead.targetId = "other-source"
  if (mode === "wrong-sha") invoke.fieldMethodRead.targetSha256 = "other-sha"
  expect(api.SemanticStepSchema.safeParse(capture).success).toBe(true)
  expect(api.SemanticStepSchema.safeParse(invoke).success).toBe(true)
  const prefix: any[] = mode === "helper" ? [{ kind: "call", name: "setup", claim: "Execute setup", symbol: "setup", callee: "setup", arguments: [{ parameter: "self", object: "self" }] }] : mode === "literal-token" ? [{ ...store, source: undefined, value: "method-token" }] : [capture, store]
  if (mode === "overwritten" || mode === "later-method-store") prefix.push({ kind: "transform", name: "overwrite", claim: "Actual later field store", object: "self", field: mode === "overwritten" ? "handler" : "guard", value: null })
  if (mode === "unknown-overwrite" || mode === "class-overwrite") prefix.push({ kind: "transform", name: "overwrite-unknown", claim: "Unknown original value still replaces the old field", object: "self", field: mode === "class-overwrite" ? "__class__" : "handler", source: "other" })
  const root = unit([block("main", [...prefix, invoke, { kind: "effect", name: "write", claim: "Following write" }, { kind: "return", name: "done", claim: "Entry returns", outcome: "allow" }])], { parameters: [{ name: "self", type: "configuration" }, { name: "other", type: "configuration" }] }), guard = unit([block("main", [{ kind: "reject", name: "denied", claim: "Original guard rejects", failureKind: "authorization" }])], { handle: "guard", role: "helper", parameters: [{ name: "self", type: "configuration" }] })
  const r = lower([root, setup, guard]), valid = ["stored", "helper", "later-method-store"].includes(mode)
  expect(r.delta.rules.some((r: any) => r.failureKind === "authorization")).toBe(valid)
  expect(r.delta.rules.some((r: any) => r.kind === "effect")).toBe(false)
  if (!valid) expect(r.diagnostics.map((d: any) => d.code)).toContain("source-field-method-value-unresolved")
})
test("explicit alternatives clone their common continuation instead of ANDing mutually exclusive guards", () => {
  const r = lower([unit([block("main", [{ kind: "choose", name: "role", claim: "if else", cases: [{ condition: eq("role", "admin"), body: "admin" }], otherwise: "member" }, { kind: "effect", name: "write", claim: "mutation" }]), block("admin", []), block("member", [])])], [known("role", "admin", "Role is admin.")])
  expect(r.paths.map((p: any) => p.predicate.truth).sort()).toEqual(["false", "true"])
  expect(r.paths.filter((p: any) => p.state === "checked")).toHaveLength(1)
  expect(r.paths.find((p: any) => p.state === "checked").protectedEffect).toBe("performed")
  expect(r.slice.rules.filter((n: any) => n.kind === "effect")).toHaveLength(2)
})
test("independent sequential guards remain a conjunction and unspecified premises keep both alternatives", () => {
  const guards = [{ kind: "guard", name: "a", claim: "first", condition: eq("role", "admin") }, { kind: "guard", name: "b", claim: "second", condition: eq("flag", false) }]
  const r = lower([unit([block("main", [...guards, { kind: "effect", name: "write", claim: "mutation" }])])], [known("role", "admin", "Role is admin."), known("flag", true, "Flag is true.")])
  expect(r.paths[0].state).toBe("inapplicable")
  const u = lower([unit([block("main", [{ kind: "choose", name: "role", claim: "if else", cases: [{ condition: eq("role", "admin"), body: "yes" }], otherwise: "no" }]), block("yes", [{ kind: "return", name: "yes", claim: "permitted", outcome: "allow" }]), block("no", [{ kind: "reject", name: "no", claim: "denied" }])])])
  expect(u.paths.map((p: any) => p.predicate.truth)).toEqual(["unknown", "unknown"])
  expect(u.paths.map((p: any) => p.disposition).sort()).toEqual(["allow", "deny"])
})
test("a missing alternative is an explicit gap, not an invented complement or completed outcome", () => {
  const r = lower([unit([block("main", [{ kind: "choose", name: "only", claim: "incomplete selection", cases: [{ condition: eq("role", "admin"), body: "yes" }] }]), block("yes", [])])])
  expect(r.diagnostics.map((d: any) => d.code)).toContain("choice-uncovered")
  expect(r.paths.some((p: any) => p.gaps.some((g: string) => g.includes("choice-uncovered")))).toBe(true)
})
test("helper early success returns to caller without claiming its skipped protected mutation", () => {
  const helper = unit([block("main", [{ kind: "choose", name: "exists", claim: "existing object", cases: [{ condition: eq("exists", true), body: "old" }], otherwise: "new" }, { kind: "effect", name: "insert", claim: "actual insertion" }]), block("old", [{ kind: "return", name: "noop", claim: "success without insert", value: true }]), block("new", [])], { handle: "save", role: "helper" })
  const r = lower([unit([block("main", [{ kind: "call", name: "save", claim: "calls save", symbol: "save", callee: "save", arguments: [] }, { kind: "return", name: "ok", claim: "endpoint success", outcome: "allow", value: true }])]), helper])
  expect(r.paths.map((p: any) => p.protectedEffect).sort()).toEqual(["none", "performed"])
  expect(r.paths.every((p: any) => p.disposition === "allow")).toBe(true)
})
test("same local name in caller and helper is a different object unless an argument alias is explicit", () => {
  const common = [{ kind: "bind", name: "caller", type: "principal", claim: "caller" }, { kind: "bind", name: "doc", type: "resource", claim: "input" }, { kind: "guard", name: "permission", claim: "input check", principal: "caller", resource: "doc" }]
  const helper = unit([block("main", [{ kind: "bind", name: "doc", type: "resource", claim: "separate output" }, { kind: "effect", name: "write", claim: "write output", principal: "actor", resource: "doc", authorizedBy: ["entry.permission"] }])], { handle: "helper", role: "helper", parameters: [{ name: "actor", type: "principal" }] })
  const r = lower([unit([block("main", [...common, { kind: "call", name: "helper", claim: "call", symbol: "helper", callee: "helper", arguments: [{ parameter: "actor", object: "caller" }] }])]), helper])
  expect(controlObjectDiagnostics(r.slice).map(d => d.code)).toContain("control-object-mismatch")
})
test("explicit entry parameters supply typed identities to mapped helper parameters without known values", () => {
  const root = unit([block("main", [{ kind: "guard", name: "permission", claim: "Explicit object check", principal: "actor", resource: "target" }, { kind: "call", name: "invoke", claim: "Calls helper", symbol: "helper", callee: "helper", arguments: [{ parameter: "who", object: "actor" }, { parameter: "dest", object: "target" }, { parameter: "context", object: "request" }] }])], { parameters: [{ name: "actor", type: "principal" }, { name: "target", type: "resource" }, { name: "request", type: "configuration" }] })
  const helper = unit([block("main", [{ kind: "effect", name: "write", claim: "Actual mutation", principal: "who", resource: "dest", authorizedBy: ["entry.permission"] }])], { handle: "helper", role: "helper", parameters: [{ name: "who", type: "principal" }, { name: "dest", type: "resource" }, { name: "context", type: "configuration" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(controlObjectDiagnostics(r.slice)).toEqual([])
  expect(r.paths[0].complete).toBe(true)
  expect(r.paths[0].protectedEffect).toBe("performed")
  expect(r.slice.bindings).toEqual([])
  expect(r.slice.rules.filter((n: any) => n.kind === "binding").map((n: any) => n.bindingKind).sort()).toEqual(["configuration", "principal", "resource"])
})
test("unbound helper arguments name the missing mapping and the actual type mismatch", () => {
  const helper = unit([block("main", [])], { handle: "helper", role: "helper", parameters: [{ name: "actor", type: "principal" }, { name: "target", type: "resource" }] })
  const r = lower([unit([block("main", [{ kind: "bind", name: "context", type: "configuration", claim: "Explicit configuration" }, { kind: "call", name: "invoke", claim: "Helper call", symbol: "helper", callee: "helper", arguments: [{ parameter: "actor", object: "context" }] }])]), helper])
  const message = r.diagnostics.filter((d: any) => d.code === "semantic-argument-unbound").map((d: any) => d.message).join("\n")
  expect(message).toContain("actor")
  expect(message).toContain("principal")
  expect(message).toContain("context")
  expect(message).toContain("configuration")
  expect(message).toContain("target")
  expect(r.paths[0].complete).toBe(false)
})
test("an entry return without a permission outcome names its local source step without guessing from its scalar", () => {
  const r = lower([unit([block("main", [{ kind: "return", name: "response", claim: "Scalar result only", value: true, outcome: "unknown" }])])])
  const diagnostic = r.diagnostics.find((d: any) => d.code === "entry-return-outcome-unspecified")
  expect(diagnostic).toBeDefined()
  expect(diagnostic.message).toContain("main.response")
  expect(r.paths[0].disposition).toBe("unknown")
  expect(r.paths[0].complete).toBe(false)
})
test("unread call, block cycle and expansion limits remain named unresolved terminals", () => {
  const call = lower([unit([block("main", [{ kind: "call", name: "gate", claim: "decisive callee", symbol: "gate", callee: "unread", arguments: [] }])])])
  expect(call.delta.dependencies).toHaveLength(1)
  expect(call.paths[0].protectedEffect).toBe("unresolved")
  const cyclic = lower([unit([block("main", [{ kind: "choose", name: "cycle", claim: "recursive body", cases: [{ condition: eq("flag", true), body: "main" }], otherwise: "other" }]), block("other", [])])])
  expect(cyclic.diagnostics.map((d: any) => d.code)).toContain("semantic-cycle")
  const large = lower([unit([block("main", Array.from({ length: 140 }, (_, i) => ({ kind: "guard", name: `g${i}`, claim: "guard" })))])])
  expect(large.diagnostics.map((d: any) => d.code)).toContain("semantic-node-limit")
  expect(large.paths.every((p: any) => !p.complete)).toBe(true)
})

test("static source relations are retained without creating calls, permissions or effects", () => {
  const step = { kind: "context", name: "route", relationship: "route-registration", claim: "The original router registers this handler" }
  expect(api.SemanticStepSchema.safeParse(step).success).toBe(true)
  const r = lower([unit([block("main", [step, { kind: "return", name: "done", claim: "Registration only", outcome: "allow" }])])])
  expect(r.delta.dependencies).toEqual([])
  expect(r.slice.rules.filter((r: any) => ["call", "guard", "effect"].includes(r.kind))).toEqual([])
  expect(r.slice.rules.some((r: any) => r.kind === "continue" && r.claim === step.claim)).toBe(true)
  expect(r.paths[0].protectedEffect).toBe("none")
})

test("source finite values follow explicit value arguments and aliases without becoming user premises", () => {
  const helper = unit([block("main", [{ kind: "choose", name: "constant", claim: "Source compares the explicit argument", cases: [{ condition: eq("requested", "edit"), body: "yes" }], otherwise: "no" }]), block("yes", [{ kind: "return", name: "yes", claim: "Matched", value: true }]), block("no", [{ kind: "return", name: "no", claim: "Unmatched", value: false }])], { handle: "gate", role: "helper", parameters: [{ name: "requested", type: "value" }] })
  const root = unit([block("main", [{ kind: "bind", name: "source_mode", type: "value", value: "edit", claim: "Literal visible in the original source" }, { kind: "bind", name: "alias", type: "value", aliasOf: "source_mode", claim: "Explicit source alias" }, { kind: "call", name: "gate", symbol: "gate", callee: "gate", arguments: [{ parameter: "requested", object: "alias" }], result: "permitted", claim: "Pass this literal" }, { kind: "guard", name: "required", condition: eq("permitted", true), claim: "Only true continues" }])])
  expect(api.SemanticStepSchema.safeParse(root.blocks[0].steps[0]).success).toBe(true)
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.paths.map((p: any) => p.predicate.truth).sort()).toEqual(["false", "true"])
  expect(r.slice.bindings).toEqual([])
  expect(r.delta.rules.find((n: any) => n.bindingName === "source_mode").sourceOrigin.step).toBe("source_mode")
  const unknown = lower([unit([block("main", [{ kind: "call", name: "gate", symbol: "gate", callee: "gate", arguments: [{ parameter: "requested", object: "source_mode" }], claim: "Unknown entry argument" }])], { parameters: [{ name: "source_mode", type: "value" }] }), helper])
  expect(unknown.paths.every((p: any) => p.predicate.truth === "unknown")).toBe(true)
})

test("finite field writes survive helper aliases, distinguish empty arrays from null, and preserve unrelated unknown fields", () => {
  const helper = unit([block("main", [{ kind: "transform", name: "clear", object: "input", field: "labels", value: [], claim: "Source writes an empty array" }, { kind: "return", name: "done", claim: "Return to caller" }])], { handle: "clear", role: "helper", parameters: [{ name: "input", type: "configuration" }] })
  expect(api.SemanticStepSchema.safeParse(helper.blocks[0].steps[0]).success).toBe(true)
  const root = unit([block("main", [{ kind: "bind", name: "alias", type: "configuration", aliasOf: "form", claim: "Same form" }, { kind: "call", name: "clear", symbol: "clear", callee: "clear", arguments: [{ parameter: "input", object: "alias" }], claim: "Clear only labels" }, { kind: "guard", name: "array", condition: { op: "not", arg: { op: "is-null", value: { binding: "form.labels" } } }, claim: "Empty array is not null" }, { kind: "guard", name: "project", condition: eq("form.projects", "unknown"), claim: "Project input still unspecified" }])], { parameters: [{ name: "form", type: "configuration" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.fieldChanges).toEqual([expect.objectContaining({ field: "labels", value: [], evidenceIds: ["ev"] })])
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".projects")])
})

test("ordinary method reads check actual receiver stores including unknown overwrites and eager defaults", () => {
  const methodRead = { receiver: "left", method: "guard", defaultMethod: "fallback" }
  const read = { kind: "assign-value", name: "created", result: "handler", value: { literal: "ordinary-method" }, methodRead, claim: "Actual ordinary source method reference" }
  expect(api.SemanticStepSchema.safeParse(read).success).toBe(true)
  for (const field of ["guard", "fallback", "__class__", "guard.__code__"]) {
    const helper = unit([block("main", [{ kind: "transform", name: "overwrite", object: "receiver", field, source: "unknown", claim: "An explicit unknown source store still replaces the slot" }, { kind: "return", name: "done", claim: "Return" }])], { handle: "prepare", role: "helper", parameters: [{ name: "receiver", type: "configuration" }, { name: "unknown", type: "value" }] })
    const root = unit([block("main", [{ kind: "call", name: "prepare", symbol: "prepare", callee: "prepare", arguments: [{ parameter: "receiver", object: "left" }, { parameter: "unknown", object: "unknown" }], claim: "Pass this receiver identity" }, read, { kind: "effect", name: "write", claim: "Following operation" }])], { parameters: [{ name: "left", type: "configuration" }, { name: "unknown", type: "value" }] })
    const r = lower([root, helper])
    expect(r.diagnostics.map((d: any) => d.code)).toContain("source-method-slot-written")
    expect(r.delta.rules.some((r: any) => r.kind === "effect")).toBe(false)
  }
  const untouched = unit([block("main", [{ kind: "transform", name: "other", object: "right", field: "guard", value: null, claim: "A distinct receiver" }, { kind: "transform", name: "data", object: "left", field: "request", value: null, claim: "An unrelated data field" }, read, { kind: "transform", name: "later", object: "left", field: "guard", value: null, claim: "Does not change the earlier copied method" }, { kind: "guard", name: "copied", condition: eq("handler", "ordinary-method"), claim: "Retain the original bound method value" }])], { parameters: [{ name: "left", type: "configuration" }, { name: "right", type: "configuration" }] })
  expect(lower([untouched]).diagnostics).toEqual([])
  expect(lower([untouched]).paths[0].predicate.truth).toBe("true")
})

test("a method read cannot manufacture a receiver or take untouched state from user values", () => {
  const methodRead = { receiver: "missing", method: "guard" }, read = { kind: "assign-value", name: "created", result: "handler", value: { literal: "ordinary-method" }, methodRead, claim: "Missing ordinary source receiver" }
  const r = lower([unit([block("main", [read])])], [known("missing.guard", false, "Flag is true.")])
  expect(r.diagnostics.map((d: any) => d.code)).toContain("semantic-method-receiver-unbound")
  expect(r.paths.every((p: any) => !p.complete)).toBe(true)
  for (const malformed of [{ receiver: "left" }, { receiver: "left", method: "guard", ignored: true }, { receiver: "left", method: "guard", defaultMethod: "" }]) expect(api.SemanticStepSchema.safeParse({ ...read, methodRead: malformed }).success).toBe(false)
})

test("source values cannot attach to principals, conflict with aliases, nest unbounded data, or leak into a same-named helper local", () => {
  for (const step of [{ kind: "bind", name: "actor", type: "principal", value: true, claim: "Invalid literal actor" }, { kind: "bind", name: "alias", type: "value", aliasOf: "other", value: true, claim: "Two conflicting origins" }]) expect(api.semanticBlockDiagnostics(unit([block("main", [step])])).map((d: any) => d.code)).toContain("semantic-source-value-invalid")
  for (const value of [Array.from({ length: 65 }, () => 1), { nested: [] }, [[1]]]) expect(api.SemanticStepSchema.safeParse({ kind: "bind", name: "constant", type: "value", value, claim: "Bounded source value" }).success).toBe(false)
  const helper = unit([block("main", [{ kind: "bind", name: "constant", type: "value", claim: "Different unknown local" }, { kind: "guard", name: "check", condition: eq("constant", true), claim: "No caller name alias" }, { kind: "return", name: "end", claim: "Return" }])], { handle: "helper", role: "helper" })
  const root = unit([block("main", [{ kind: "bind", name: "constant", type: "value", value: true, claim: "Caller literal" }, { kind: "call", name: "invoke", symbol: "helper", callee: "helper", arguments: [], claim: "No mapping" }])])
  expect(lower([root, helper]).paths[0].predicate.truth).toBe("unknown")
})

test("finite maps copied from explicit values and later unknown writes never retain a stale literal", () => {
  const root = unit([block("main", [{ kind: "bind", name: "settings", type: "value", value: { mode: "edit" }, claim: "Source finite map" }, { kind: "transform", name: "copy", object: "form", field: "settings", source: "settings", claim: "Copy this explicit value" }, { kind: "guard", name: "copied", condition: eq("mode", "edit"), claim: "Source lookup", }, { kind: "transform", name: "forget", object: "form", field: "settings", source: "unknown", claim: "Source overwrites with unknown input" }, { kind: "guard", name: "missing", condition: { op: "has-key", map: { binding: "form.settings" }, key: { literal: "mode" } }, claim: "Overwritten value remains unknown" }])], { parameters: [{ name: "form", type: "configuration" }, { name: "unknown", type: "value" }] })
  root.blocks[0].steps[2].condition = { op: "eq", left: { lookup: { map: { binding: "form.settings" }, key: { literal: "mode" } } }, right: { literal: "edit" } }
  const r = lower([root])
  expect(r.diagnostics).toEqual([])
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "copied").condition.left.lookup.map).toEqual({ literal: { mode: "edit" } })
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".settings")])
})

test("explicit object fields can be value arguments but cannot acquire an inferred resource type", () => {
  const root = unit([block("main", [{ kind: "transform", name: "set", object: "form", field: "labels", value: ["edit"], claim: "Source writes a finite field" }, { kind: "call", name: "pass", symbol: "helper", callee: "helper", arguments: [{ parameter: "labels", object: "form.labels" }], claim: "Pass precisely that field" }])], { parameters: [{ name: "form", type: "configuration" }] })
  const helper = unit([block("main", [{ kind: "guard", name: "member", condition: { op: "member", value: { literal: "edit" }, set: { binding: "labels" } }, claim: "Examine the supplied list" }, { kind: "return", name: "end", claim: "Return" }])], { handle: "helper", role: "helper", parameters: [{ name: "labels", type: "value" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.paths[0].predicate.truth).toBe("true")
  const invalid = lower([root, { ...helper, parameters: [{ name: "labels", type: "resource" }] }])
  expect(invalid.diagnostics.map((d: any) => d.code)).toContain("semantic-argument-unbound")
})

test("finite map field projections agree with whole-map lookup and unknown overwrites preserve only other fields", () => {
  const root = unit([block("main", [{ kind: "bind", name: "settings", type: "value", value: { mode: "read", other: "keep" }, claim: "Finite source map" }, { kind: "guard", name: "initial", condition: eq("settings.mode", "read"), claim: "Project the source key" }, { kind: "transform", name: "write", object: "settings", field: "mode", value: "edit", claim: "Change one known source field" }, { kind: "guard", name: "updated", condition: { op: "eq", left: { lookup: { map: { binding: "settings" }, key: { literal: "mode" } } }, right: { literal: "edit" } }, claim: "Whole-map lookup sees the new field" }, { kind: "transform", name: "unknown", object: "settings", field: "mode", source: "input", claim: "Unknown input overwrites the field" }, { kind: "guard", name: "other", condition: eq("settings.other", "keep"), claim: "Unrelated field survives" }, { kind: "guard", name: "unknown-value", condition: eq("settings.mode", "edit"), claim: "Do not reuse stale source literal" }])], { parameters: [{ name: "input", type: "value" }] })
  const r = lower([root])
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "initial").condition.left).toEqual({ literal: "read" })
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "updated").condition.left.lookup.map).toEqual({ literal: { mode: "edit", other: "keep" } })
  expect(r.delta.rules.find((n: any) => n.sourceOrigin.step === "other").condition.left).toEqual({ literal: "keep" })
  expect(r.paths[0].predicate.truth).toBe("unknown")
  expect(r.paths[0].predicate.missingBindings).toEqual([expect.stringContaining(".mode")])
})

test("typed field aliases name their mismatch and an explicit source field bind preserves resource identity", () => {
  const broken = unit([block("main", [{ kind: "bind", name: "target", type: "resource", aliasOf: "ctx.target", claim: "Invalid inferred resource alias" }])], { parameters: [{ name: "ctx", type: "configuration" }] })
  const d = lower([broken]).diagnostics.find((d: any) => d.code === "semantic-alias-missing")
  expect(d.message).toContain('"target" (resource)')
  expect(d.message).toContain('"ctx.target" (value)')
  const root = unit([block("main", [{ kind: "bind", name: "ctx.target", type: "resource", claim: "Shown source identifies the target field as this resource" }, { kind: "bind", name: "target", type: "resource", aliasOf: "ctx.target", claim: "Explicit same-type alias" }, { kind: "guard", name: "check", resource: "target", principal: "actor", claim: "Check this target" }, { kind: "call", name: "invoke", symbol: "helper", callee: "helper", arguments: [{ parameter: "target", object: "target" }, { parameter: "actor", object: "actor" }], claim: "Pass this checked resource" }])], { parameters: [{ name: "ctx", type: "configuration" }, { name: "actor", type: "principal" }] })
  const helper = unit([block("main", [{ kind: "effect", name: "write", resource: "target", principal: "actor", authorizedBy: ["entry.check"], claim: "Use the exact mapped resource" }, { kind: "return", name: "done", claim: "Return" }])], { handle: "helper", role: "helper", parameters: [{ name: "target", type: "resource" }, { name: "actor", type: "principal" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(controlObjectDiagnostics(r.slice)).toEqual([])
  expect(r.slice.rules.find((n: any) => n.kind === "effect").resource).toBe(r.slice.rules.find((n: any) => n.kind === "guard").resource)
})

test("explicit field object writes preserve the same typed identity across receiver aliases and helpers", () => {
  const store = unit([block("main", [{ kind: "transform", name: "store", object: "self", field: "target", source: "target", claim: "Store this exact resource" }, { kind: "return", name: "done", claim: "Return" }])], { handle: "store", role: "helper", parameters: [{ name: "self", type: "configuration" }, { name: "target", type: "resource" }] })
  const check = unit([block("main", [{ kind: "guard", name: "checked", resource: "target", principal: "actor", claim: "Check the supplied actual resource" }, { kind: "return", name: "done", claim: "Return" }])], { handle: "check", role: "helper", parameters: [{ name: "actor", type: "principal" }, { name: "target", type: "resource" }] })
  const root = unit([block("main", [{ kind: "bind", name: "same", type: "configuration", aliasOf: "ctx", claim: "Same receiver" }, { kind: "call", name: "store", symbol: "store", callee: "store", arguments: [{ parameter: "self", object: "same" }, { parameter: "target", object: "original" }], claim: "Initialize receiver field" }, { kind: "call", name: "check", symbol: "check", callee: "check", arguments: [{ parameter: "actor", object: "actor" }, { parameter: "target", object: "ctx.target" }], claim: "Read exactly the stored field" }])], { parameters: [{ name: "ctx", type: "configuration" }, { name: "original", type: "resource" }, { name: "actor", type: "principal" }] })
  const r = lower([root, store, check])
  expect(r.diagnostics).toEqual([])
  expect(r.slice.rules.find((s: any) => s.kind === "guard").resource).toBe(r.slice.rules.find((s: any) => s.bindingName === "original").bindingKey)
})

test("field overwrites retire slot identity without changing copied aliases or another receiver", () => {
  const root = unit([block("main", [{ kind: "transform", name: "first", object: "left", field: "target", source: "original", claim: "Left holds original" }, { kind: "transform", name: "second", object: "right", field: "target", source: "replacement", claim: "Right holds replacement" }, { kind: "bind", name: "copied", type: "resource", aliasOf: "left.target", claim: "Copy original identity before overwrite" }, { kind: "transform", name: "overwrite", object: "left", field: "target", source: "replacement", claim: "Overwrite only left slot" }, { kind: "guard", name: "copied-check", resource: "copied", claim: "Old alias still original" }, { kind: "guard", name: "current-check", resource: "left.target", claim: "Current left is replacement" }, { kind: "guard", name: "other-check", resource: "right.target", claim: "Right remains replacement" }, { kind: "transform", name: "unknown", object: "left", field: "target", source: "unknown", claim: "Unknown scalar removes typed resource slot" }, { kind: "bind", name: "invalid", type: "resource", aliasOf: "left.target", claim: "Must not borrow stale resource type" }])], { parameters: [{ name: "left", type: "configuration" }, { name: "right", type: "configuration" }, { name: "original", type: "resource" }, { name: "replacement", type: "resource" }, { name: "unknown", type: "value" }] })
  const r = lower([root]), resources = r.slice.rules.filter((s: any) => s.kind === "guard").map((s: any) => s.resource)
  expect(resources[0]).toBe(r.slice.rules.find((s: any) => s.bindingName === "original").bindingKey)
  expect(resources.slice(1)).toEqual(Array(2).fill(r.slice.rules.find((s: any) => s.bindingName === "replacement").bindingKey))
  expect(r.diagnostics.map((d: any) => d.code)).toEqual(["semantic-alias-missing"])
})

test("nested field stores follow the bound child object and literal overwrite removes typed field assertions", () => {
  const root = unit([block("main", [{ kind: "bind", name: "ctx.target", type: "resource", claim: "Explicit initial source field interpretation" }, { kind: "transform", name: "child", object: "ctx", field: "child", source: "child", claim: "Actual child identity" }, { kind: "transform", name: "target", object: "ctx.child", field: "target", source: "original", claim: "Write the child slot" }, { kind: "bind", name: "read", type: "resource", aliasOf: "child.target", claim: "Read through other child alias" }, { kind: "guard", name: "read-check", resource: "read", claim: "Same actual resource" }, { kind: "transform", name: "literal", object: "ctx", field: "target", value: null, claim: "Literal replaces initial resource field" }, { kind: "bind", name: "invalid", type: "resource", aliasOf: "ctx.target", claim: "Old typed field assertion is stale" }])], { parameters: [{ name: "ctx", type: "configuration" }, { name: "child", type: "configuration" }, { name: "original", type: "resource" }] })
  const r = lower([root])
  expect(r.slice.rules.find((s: any) => s.kind === "guard").resource).toBe(r.slice.rules.find((s: any) => s.bindingName === "original").bindingKey)
  expect(r.diagnostics.map((d: any) => d.code)).toEqual(["semantic-alias-missing"])
})

const finiteUnit = (blocks: any[], extra = {}) => unit(blocks, { coverage: "path", ...extra })
test("a helper returns the actual typed field identity after its source write", () => {
  const helper = finiteUnit([block("main", [{ kind: "transform", name: "store", object: "self", field: "target", source: "target", claim: "Store the supplied resource" }, { kind: "return", name: "returned", object: "self.target", claim: "Return the current resource field" }])], { handle: "helper", role: "helper", parameters: [{ name: "self", type: "configuration" }, { name: "target", type: "resource" }] })
  const root = finiteUnit([block("main", [{ kind: "call", name: "invoke", symbol: "helper", callee: "helper", arguments: [{ parameter: "self", object: "ctx" }, { parameter: "target", object: "original" }], result: "returned", claim: "Keep actual returned identity" }, { kind: "guard", name: "checked", resource: "returned", claim: "Check returned resource" }, { kind: "return", name: "done", outcome: "allow", claim: "Normal source exit" }])], { parameters: [{ name: "ctx", type: "configuration" }, { name: "original", type: "resource" }] })
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.slice.rules.find((s: any) => s.kind === "guard").resource).toBe(r.slice.rules.find((s: any) => s.bindingName === "original").bindingKey)
})
const parseFinite = ({ questionId, evidenceIds, ...semantic }: any) => api.SemanticBlockSchema.safeParse(semantic)
test("finite try matches an explicit exception and finally runs before handler return", () => {
  const root = finiteUnit([
    block("main", [{ kind: "try", name: "protected", claim: "try except else finally", body: "attempt", handlers: [{ exceptionTypes: ["Denied"], catchesAll: false, body: "denied" }], otherwise: "normal", finally: "cleanup" }, { kind: "effect", name: "after", claim: "after protected region" }]),
    block("attempt", [{ kind: "raise", name: "raise", claim: "Explicit rejection", exceptionType: "Denied", failureKind: "authorization" }]),
    block("denied", [{ kind: "return", name: "denied", claim: "Forbidden response", outcome: "deny" }]),
    block("normal", [{ kind: "effect", name: "normal", claim: "else only on normal completion" }]),
    block("cleanup", [{ kind: "effect", name: "cleanup", claim: "finally always runs" }]),
  ])
  expect(parseFinite(root).success).toBe(true)
  const r = lower([root])
  expect(r.paths).toHaveLength(1)
  expect(r.paths[0].disposition).toBe("deny")
  expect(r.delta.rules.filter((r: any) => r.kind === "effect").map((r: any) => r.sourceOrigin.step)).toEqual(["cleanup"])
  expect(r.delta.rules.at(-1).terminal).toBe(true)
})

test("finally overrides a pending return and normal try alone reaches else", () => {
  const root = finiteUnit([block("main", [{ kind: "try", name: "protected", claim: "try finally", body: "attempt", handlers: [], otherwise: "normal", finally: "cleanup" }]), block("attempt", [{ kind: "return", name: "allowed", claim: "Pending success", outcome: "allow" }]), block("normal", [{ kind: "effect", name: "normal", claim: "Not reached after a return" }]), block("cleanup", [{ kind: "raise", name: "cleanup-fails", claim: "Finally overrides success", exceptionType: "Fault", failureKind: "operation" }])])
  const r = lower([root])
  expect(r.delta.rules.at(-1).failureKind).toBe("operation")
  expect(r.paths[0].disposition).not.toBe("allow")
  expect(r.delta.rules.filter((r: any) => r.kind === "effect")).toEqual([])
})

test("Python short circuit skips RHS and retains a false scalar without boolean coercion", () => {
  const root = finiteUnit([block("main", [{ kind: "short-circuit", name: "and", claim: "0 and RHS", operator: "and", language: "python", left: { literal: 0 }, right: { literal: true }, body: "rhs", result: "answer" }, { kind: "guard", name: "raw-zero", claim: "Raw source value", condition: eq("answer", 0) }, { kind: "return", name: "done", claim: "Endpoint outcome", outcome: "allow" }]), block("rhs", [{ kind: "effect", name: "rhs-effect", claim: "Only if left is true" }])])
  const r = lower([root])
  expect(r.paths.filter((p: any) => p.state === "checked")).toHaveLength(1)
  expect(r.paths.find((p: any) => p.state === "checked").protectedEffect).toBe("none")
  expect(r.delta.rules.find((r: any) => r.sourceOrigin.step === "raw-zero" && r.condition.left.literal === 0)).toBeDefined()
})

test("literal loop honors continue, break and else without executing later iterations", () => {
  const root = finiteUnit([block("main", [{ kind: "loop", name: "loop", claim: "for value in [0,1,2]", target: "value", iterable: [0, 1, 2], body: "iteration", otherwise: "exhausted" }, { kind: "return", name: "done", claim: "Complete endpoint", outcome: "allow" }]), block("iteration", [{ kind: "choose", name: "exit", claim: "Source loop exits", cases: [{ condition: eq("value", 0), body: "skip" }, { condition: eq("value", 1), body: "break" }], otherwise: "write" }]), block("skip", [{ kind: "continue", name: "continue", claim: "Next iteration" }]), block("break", [{ kind: "break", name: "break", claim: "Leave loop" }]), block("write", [{ kind: "effect", name: "write", claim: "Never reached for this source list" }]), block("exhausted", [{ kind: "effect", name: "else", claim: "Only on exhaustion" }])])
  expect(parseFinite(root).success).toBe(true)
  const r = lower([root])
  const checked = r.paths.filter((p: any) => p.state === "checked")
  expect(checked).toHaveLength(1)
  expect(checked[0].protectedEffect).toBe("none")
})

test("a reached context exit is unknown while an earlier independent return stays complete", () => {
  const root = finiteUnit([block("main", [{ kind: "choose", name: "choice", claim: "Optional context", cases: [{ condition: eq("flag", true), body: "early" }], otherwise: "context" }]), block("early", [{ kind: "return", name: "done", claim: "Before unsupported context", outcome: "allow" }]), block("context", [{ kind: "with", name: "with", claim: "Context protocol not interpreted", enter: "enter", body: "body", exitUnknown: true }]), block("enter", []), block("body", [{ kind: "effect", name: "write", claim: "Body effect" }])], { complete: false })
  const r = lower([root], [known("flag", true, "Flag is true.")])
  expect(r.paths.find((p: any) => p.state === "checked").complete).toBe(true)
  expect(r.paths.find((p: any) => p.state === "checked").disposition).toBe("allow")
  expect(r.delta.rules.some((r: any) => r.gap === "semantic-context-exit-unknown")).toBe(true)
})

test("a short-circuit raw value maps into a helper parameter and its explicit raise reaches caller finally", () => {
  const helper = finiteUnit([block("main", [{ kind: "choose", name: "zero", claim: "Raw value is zero", cases: [{ condition: eq("value", 0), body: "denied" }], otherwise: "ok" }]), block("denied", [{ kind: "raise", name: "denied", claim: "Explicit exception", exceptionType: "Denied", failureKind: "authorization" }]), block("ok", [{ kind: "return", name: "ok", claim: "Return value", value: true }])], { handle: "helper", role: "helper", parameters: [{ name: "value", type: "value" }] })
  const root = finiteUnit([block("main", [{ kind: "short-circuit", name: "raw", claim: "0 and unknown", operator: "and", language: "python", left: { literal: 0 }, right: { binding: "unknown" }, body: "rhs", result: "raw" }, { kind: "try", name: "protected", claim: "Catch helper", body: "invoke", handlers: [{ exceptionTypes: ["Denied"], catchesAll: false, body: "caught" }], finally: "cleanup" }]), block("rhs", []), block("invoke", [{ kind: "call", name: "helper", symbol: "helper", callee: "helper", arguments: [{ parameter: "value", object: "raw" }], claim: "Pass raw value" }]), block("caught", [{ kind: "return", name: "denied", claim: "Denied response", outcome: "deny" }]), block("cleanup", [{ kind: "effect", name: "cleanup", claim: "Cleanup caller" }])])
  const r = lower([root, helper])
  expect(r.diagnostics).toEqual([])
  expect(r.paths).toHaveLength(1)
  expect(r.paths[0].disposition).toBe("deny")
  expect(r.delta.rules.filter((r: any) => r.kind === "effect").map((r: any) => r.sourceOrigin.step)).toEqual(["cleanup"])
})

test("an unknown call exception can enter a typed handler or propagate without claiming a completed effect", () => {
  const root = finiteUnit([block("main", [{ kind: "try", name: "protected", claim: "Unknown call failure", body: "invoke", handlers: [{ exceptionTypes: ["Denied"], catchesAll: false, body: "caught" }], otherwise: "normal" }]), block("invoke", [{ kind: "effect", name: "write", claim: "May fail before effect", mayRaise: true }]), block("caught", [{ kind: "return", name: "denied", claim: "Denied response", outcome: "deny" }]), block("normal", [{ kind: "return", name: "allowed", claim: "Normal response", outcome: "allow" }])])
  const r = lower([root])
  expect(r.paths.map((p: any) => p.disposition).sort()).toEqual(["allow", "deny", "unknown"])
  expect(r.paths.find((p: any) => p.disposition === "deny").protectedEffect).toBe("none")
  expect(r.paths.find((p: any) => p.disposition === "unknown").gaps).toContain("semantic-exception-type-unknown")
})

test("an uncertain earlier handler is considered before a later exact or catch-all handler", () => {
  const root = finiteUnit([block("main", [{ kind: "try", name: "ordered", claim: "Source handler order", body: "raise", handlers: [{ exceptionTypes: ["dynamic_type"], unknownType: true, catchesAll: false, body: "early" }, { exceptionTypes: ["Denied"], catchesAll: false, body: "late" }] }]), block("raise", [{ kind: "raise", name: "raised", claim: "Known exception", exceptionType: "Denied", failureKind: "authorization" }]), block("early", [{ kind: "return", name: "early", claim: "Earlier handler", outcome: "allow" }]), block("late", [{ kind: "return", name: "late", claim: "Later exact handler", outcome: "deny" }])])
  const r = lower([root])
  expect(r.paths.map((p: any) => p.disposition).sort()).toEqual(["allow", "deny"])
  const unknown = structuredClone(root); (unknown.blocks[1]!.steps[0] as any).exceptionType = undefined
  ;(unknown.blocks[0]!.steps[0] as any).handlers = [{ exceptionTypes: ["Denied"], catchesAll: false, body: "early" }, { exceptionTypes: [], catchesAll: true, body: "late" }]
  expect(lower([unknown]).paths.map((p: any) => p.disposition).sort()).toEqual(["allow", "deny"])
})

function contexts(count: number): SemanticBlock["blocks"][number]["steps"] {
  return Array.from({ length: count }, (_, i) => ({ kind: "context", name: "context" + i, claim: "Interpreted source context, no authorization object change", relationship: "dispatch-binding", mayRaise: true }))
}
for (const count of [16, 64]) test("property evaluation keeps normal authorization and unknown failures for " + count + " equivalent contexts", () => {
  const root: BoundSemanticBlock = { ...finiteUnit([block("main", [...contexts(count), { kind: "return", name: "allowed", claim: "Normal source authorization exit", outcome: "allow" }])]), role: "entry", op: "add", fallthrough: "allow" }
  expect(parseFinite(root).success).toBe(true)
  const original = lower([root])
  expect(original.diagnostics.map((d: { code: string }) => d.code)).toContain(count === 16 ? "semantic-path-limit" : "semantic-node-limit")
  const current = lower([root], [], { propertyDirected: true })
  expect(current.diagnostics.some((d: { code: string }) => /semantic-(path|node)-limit/.test(d.code))).toBe(false)
  expect(current.paths.map((p: { disposition: string }) => p.disposition).sort()).toEqual(["allow", "unknown"])
  expect(current.paths.find((p: { disposition: string }) => p.disposition === "unknown").complete).toBe(false)
  expect(current.propertyMetrics.contextOriginsRepresented).toBe(count)
  expect(current.propertyMetrics.failureOriginsMerged).toBe(count - 1)
  expect(current.delta.rules.length).toBeLessThan(16)
  const summary = current.propertySummaries[0], failure = current.delta.rules.find((r: { key: string }) => r.key === summary.exceptionRuleKey), normal = current.delta.rules.find((r: { key: string }) => r.key === summary.normalRuleKey)
  expect(failure.sourceOrigin.steps).toEqual(contexts(count).map(s => s.name))
  expect(normal.sourceOrigin.steps).toEqual(contexts(count).map(s => s.name))
  expect(failure.sourceOrigin.step).not.toBe("context0")
  expect(failure.claim).toContain("possible origins")
})

test("property context summaries do not cross effects, resource replacement or an unknown setter", () => {
  const root = finiteUnit([block("main", [
    { kind: "bind", name: "old", type: "resource", claim: "Original resource" },
    ...contexts(16),
    { kind: "effect", name: "write-old", resource: "old", claim: "Possible completed earlier effect", mayRaise: true },
    { kind: "bind", name: "replacement", bindingName: "old", type: "resource", claim: "A distinct resource replaces the original" },
    ...contexts(16).map(step => ({ ...step, name: "after-" + step.name })),
    { kind: "call", name: "setter", symbol: "unknown_setter", resource: "old", arguments: [], claim: "Unknown mutation cannot be omitted" },
    { kind: "return", name: "allowed", outcome: "allow", claim: "Only after the setter is understood" },
  ])])
  const r = lower([root], [], { propertyDirected: true })
  expect(r.diagnostics.map((d: { code: string }) => d.code)).toContain("semantic-callee-uninterpreted")
  expect(r.diagnostics.some((d: { code: string }) => /semantic-(path|node)-limit/.test(d.code))).toBe(false)
  // The existing public effect status is unresolved on a reached source gap.
  // Check the actual completed-effect ancestry to distinguish failure order.
  const effectCounts = r.paths.map((p: { nodeKeys: string[] }) => r.delta.rules.filter((n: { kind: string; key: string }) => n.kind === "effect" && p.nodeKeys.includes(n.key)).length)
  expect(effectCounts.sort()).toEqual([0, 0, 1, 1])
  expect(r.propertySummaries.map((s: { sourceSteps: string[] }) => s.sourceSteps.length)).toEqual([16, 16])
  expect(r.delta.dependencies).toHaveLength(1)
  expect(r.paths.every((p: { disposition: string }) => p.disposition === "unknown")).toBe(true)
})

test("property merged failures still enter ordered typed handlers and execute finally before return", () => {
  const root = finiteUnit([
    block("main", [{ kind: "try", name: "try", claim: "Ordered exception region", body: "attempt",
      handlers: [{ exceptionTypes: ["Denied"], catchesAll: false, body: "deny" }, { exceptionTypes: [], catchesAll: true, body: "failure" }], finally: "cleanup" }]),
    block("attempt", [...contexts(64), { kind: "return", name: "allowed", outcome: "allow", claim: "Normal source outcome" }]),
    block("deny", [{ kind: "return", name: "denied", outcome: "deny", claim: "Authorization failure" }]),
    block("failure", [{ kind: "return", name: "failed", outcome: "unknown", claim: "Other runtime failures remain unknown" }]),
    block("cleanup", [{ kind: "effect", name: "cleanup", claim: "Cleanup before every exit" }]),
  ])
  const r = lower([root], [], { propertyDirected: true })
  expect(r.diagnostics.some((d: { code: string }) => /semantic-(path|node)-limit/.test(d.code))).toBe(false)
  expect(r.paths.map((p: { disposition: string }) => p.disposition).sort()).toEqual(["allow", "deny", "unknown"])
  expect(r.delta.rules.filter((n: { kind: string }) => n.kind === "effect")).toHaveLength(3)
})

test("a limited question withdraws its field changes without erasing another original question", () => {
  const bad = finiteUnit([block("main", [{ kind: "bind", name: "r", type: "resource", claim: "Source resource" }, { kind: "transform", name: "write-field", object: "r", field: "flag", value: true, claim: "Source write" }, ...Array.from({ length: 128 }, (_, i) => ({ kind: "guard", name: "guard" + i, condition: eq("flag", true), claim: "Independent condition" }))])])
  const good = finiteUnit([block("main", [{ kind: "return", name: "allowed", outcome: "allow", claim: "Other original question" }])], { questionId: "independent" })
  const r = api.lowerSemanticFlow([bad, good], { propertyDirected: true })
  expect(r.diagnostics.some((d: { questionId: string; code: string }) => d.questionId === "q" && d.code === "semantic-node-limit")).toBe(true)
  expect(r.fieldChanges).toHaveLength(0)
  expect(r.delta.rules.some((n: { questionId: string; kind: string; outcome: string }) => n.questionId === "independent" && n.kind === "return" && n.outcome === "allow")).toBe(true)
})

test("property summaries preserve guard conditions and distinct resource identities after replacement", () => {
  const root = finiteUnit([block("main", [{ kind: "bind", name: "actor", type: "principal", claim: "Source actor" }, { kind: "bind", name: "old", type: "resource", claim: "First resource" }, { kind: "guard", name: "gate", principal: "actor", resource: "old", condition: eq("flag", true), claim: "Source condition" }, ...contexts(64), { kind: "bind", name: "new", bindingName: "old", type: "resource", claim: "Source resource replacement" }, { kind: "effect", name: "write", principal: "actor", resource: "old", authorizedBy: ["gate"], claim: "Effect on new resource" }, { kind: "return", name: "allowed", outcome: "allow", claim: "Normal source exit" }])])
  const r = lower([root], [], { propertyDirected: true }), guard = r.delta.rules.find((n: { kind: string }) => n.kind === "guard"), effect = r.delta.rules.find((n: { kind: string }) => n.kind === "effect")
  expect(r.diagnostics.some((d: { code: string }) => /semantic-(path|node)-limit/.test(d.code))).toBe(false)
  expect(guard.condition).toEqual(eq("flag", true)); expect(effect.resource).not.toBe(guard.resource)
  expect(r.propertySummaries[0].sourceSteps).toHaveLength(64)
})

test("finally overrides a merged pending exception and skipped short circuit context is never represented", () => {
  const root = finiteUnit([block("main", [{ kind: "try", name: "region", body: "body", handlers: [], finally: "cleanup", claim: "Source finally" }, { kind: "effect", name: "late", claim: "Unreachable late effect" }]), block("body", [...contexts(64), { kind: "return", name: "allowed", outcome: "allow", claim: "Normal return" }]), block("cleanup", [{ kind: "return", name: "override", outcome: "deny", claim: "Finally overrides both exits" }])])
  const r = lower([root], [], { propertyDirected: true })
  expect(r.paths.map((p: { disposition: string }) => p.disposition)).toEqual(["deny", "deny"])
  expect(r.delta.rules.some((n: { kind: string }) => n.kind === "effect")).toBe(false)
  const skipped = finiteUnit([block("main", [{ kind: "short-circuit", name: "skip", operator: "and", language: "python", left: { literal: false }, right: { literal: true }, body: "rhs", result: "answer", claim: "False skips RHS" }, { kind: "return", name: "done", outcome: "allow", claim: "Normal exit" }]), block("rhs", contexts(64))])
  const s = lower([skipped], [], { propertyDirected: true })
  expect(s.paths.map((p: { disposition: string }) => p.disposition)).toEqual(["allow"])
  expect(s.propertyMetrics.contextOriginsRepresented).toBe(0)
})
