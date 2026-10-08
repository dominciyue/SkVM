import { expect, test } from "bun:test"
import { buildStructureIndex } from "./structure-index.ts"
const api = await import("./source-arguments.ts").catch(() => ({} as any))

test("module argument binding revalidates original initialization and actual function identity", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def check(value):\n    return value\ncheck(None)\n" }], { repository: "anonymous", sourceRef: "r" }), module = index.symbols.find(s => s.kind === "module")!, target = index.symbols.find(s => s.name === "check")!, call = index.relatedCalls(module.id).find(c => c.expression === "check")!
  expect(api.sourceArgumentBindings(index, call, target).gap).toBeUndefined()
  for (const mode of ["proof-sha", "owner", "arguments", "target-sha", "target-parameters"]) {
    const changed = structuredClone(call), altered = structuredClone(target)
    if (mode === "proof-sha") changed.moduleCallable!.targetSha256 = "foreign"
    if (mode === "owner") changed.ownerId = target.id
    if (mode === "arguments") changed.argumentFacts![0]!.expression = "foreign"
    if (mode === "target-sha") altered.sha256 = "foreign"
    if (mode === "target-parameters") altered.parameters[0]!.name = "foreign"
    expect(api.sourceArgumentBindings(index, changed, altered).gap).toBe("source-arguments-module-callable-unresolved")
  }
})

test("actual local super binding preserves the renamed receiver and rejects altered proof", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    class Base:\n        def guard(self, item):\n            return item\n    class Local(Base):\n        def relay(this, item):\n            return super().guard(item)\n    instance = Local()\n    return instance.relay(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), method = index.symbols.find(s => s.name === "relay")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(method.id).find(c => c.expression === "super().guard")!
  expect(call.superMethod).toBeDefined()
  expect(api.sourceArgumentBindings(index, call, target).bindings.map((b: any) => [b.parameter, b.expression])).toEqual([["self", "this"], ["item", "item"]])
  for (const field of ["receiver", "classId", "classSha256", "creationAnchorId"]) {
    const changed = structuredClone(call); (changed.superMethod as any)[field] = "foreign"
    expect(api.sourceArgumentBindings(index, changed, target).gap).toBe("source-arguments-super-method-unresolved")
  }
})

async function fixture(signature = "self, actor, *args, **kwargs", target = "self, actor, *rest, **options", expression = "self.guard(actor, *args, **kwargs)", prefix = "") {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(${signature}):\n${prefix}        return ${expression}\n    def guard(${target}):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" })
  const caller = index.symbols.find(s => s.name === "entry")!, callee = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(caller.id, "app.Gate").find(c => c.expression === "self.guard")!
  return { index, caller, callee, call, bind: () => api.sourceArgumentBindings(index, call, callee) }
}

test("Python signatures retain actual variadic and keyword/positional boundaries", async () => {
  const f = await fixture("self, actor, /, *args, required, optional=None, **kwargs")
  expect(f.caller.parameters.map(p => [p.name, p.kind])).toEqual([["self", "positional-only"], ["actor", "positional-only"], ["args", "variadic-positional"], ["required", "keyword-only"], ["optional", "keyword-only"], ["kwargs", "variadic-keyword"]])
})

test("source forwarding adopts the exact receiver and both declared argument packs", async () => {
  const f = await fixture(), result = f.bind()
  expect(result.gap).toBeUndefined()
  expect(result.bindings.map((b: any) => [b.parameter, b.expression])).toEqual([["self", "self"], ["actor", "actor"], ["rest", "args"], ["options", "kwargs"]])
})

test("absent variadic inputs are explicit empty source packs", async () => {
  const f = await fixture("self, actor", undefined, "self.guard(actor)")
  expect(f.bind().bindings.filter((b: any) => b.literalKnown).map((b: any) => [b.parameter, b.literalValue])).toEqual([["rest", []], ["options", {}]])
})

for (const [signature, target, expression, prefix] of [
  ["self, actor, extra, **kwargs", "self, actor, *rest, **options", "self.guard(actor, *extra, **kwargs)", ""],
  ["self, actor, *args, **kwargs", "self, actor, *rest, **options", "self.guard(actor, *args, **kwargs)", "        args = replacement\n"],
  ["self, actor, *args, **kwargs", "self, actor, *rest, **options", "self.guard(actor, *args, **kwargs)", "        alias = kwargs\n        alias.update(replacement)\n"],
  ["self, actor, *args, **kwargs", "self, renamed, *rest, **options", "self.guard(actor, *args, **kwargs)", ""],
  ["self, actor, *args, **kwargs", "self, actor, pk=None", "self.guard(actor, *args, **kwargs)", ""],
  ["self, actor, *args, **kwargs", "self, actor, *rest, **options", "self.guard(actor, *args, *args, **kwargs)", ""],
  ["self, actor, *args, **kwargs", "self, actor, *rest, **options", "self.guard(actor, *args, **kwargs, **kwargs)", ""],
] as const) test(`unproven source pack remains unresolved: ${target}; ${expression}; ${prefix.trim()}`, async () => {
  const f = await fixture(signature, target, expression, prefix)
  expect(f.bind().gap).toMatch(/^source-arguments-/)
  expect(f.bind().bindings).toEqual([])
})

test("explicit duplicate, extra and positional-only keywords are not discarded", async () => {
  for (const [target, expression] of [["self, actor", "self.guard(actor, actor=actor)"], ["self, actor", "self.guard(actor, surplus=True)"], ["self, actor, /", "self.guard(actor=actor)"]]) {
    const f = await fixture("self, actor", target, expression)
    expect(f.bind().gap).toMatch(/^source-arguments-/)
  }
})

test("literal direct arguments and declared defaults preserve their source values", async () => {
  const f = await fixture("self, actor", "self, actor, flag=False", "self.guard(actor)")
  expect(f.bind().bindings.at(-1)).toMatchObject({ parameter: "flag", expression: "False", literalKnown: true, literalValue: false })
})

test("zero-argument super forwards the actual receiver rather than a new super value", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def guard(self, actor, *rest, **options):\n        return actor\nclass Gate(Base):\n    def entry(self, actor, *args, **kwargs):\n        return super().guard(actor, *args, **kwargs)\n" }], { repository: "anonymous", sourceRef: "r" })
  const caller = index.symbols.find(s => s.name === "entry")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(caller.id, "app.Gate").find(c => c.expression === "super().guard")!
  expect(api.sourceArgumentBindings(index, call, target).bindings.map((b: any) => [b.parameter, b.expression])).toEqual([["self", "self"], ["actor", "actor"], ["rest", "args"], ["options", "kwargs"]])
})

test("an unknown positional pack may collide with a regular parameter supplied by keyword", async () => {
  const f = await fixture(undefined, undefined, "self.guard(actor=actor, *args, **kwargs)")
  expect(f.bind().gap).toBe("source-arguments-position-unresolved")
  expect(f.bind().bindings).toEqual([])
})

test("an untouched kwargs pack excludes the caller's regular parameter keyword", async () => {
  const f = await fixture("self, actor, **kwargs", "self, actor, **options", "self.guard(actor=actor, **kwargs)")
  expect(f.bind().gap).toBeUndefined()
  expect(f.bind().bindings.map((b: any) => [b.parameter, b.expression])).toEqual([["self", "self"], ["actor", "actor"], ["options", "kwargs"]])
})

test("local capture binding is implicit and retains the actual owner source", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    def guard(flag=False):\n        return actor\n    guard()\n" }], { repository: "anonymous", sourceRef: "r" })
  const caller = index.symbols.find(s => s.name === "entry")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(caller.id)[0]!, binding = api.sourceArgumentBindings(index, call, target)
  expect(target.parameters.map(p => p.name)).toEqual(["flag"])
  expect(binding.gap).toBeUndefined()
  expect(binding.bindings).toEqual([{ parameter: "flag", expression: "False", literalKnown: true, literalValue: false }, { parameter: "actor", expression: "actor", literalKnown: false, captureOwnerId: caller.id }])
  expect(api.sourceArgumentBindings(index, { ...call, ownerId: target.id }, target).bindings).toEqual([])
  expect(api.sourceArgumentBindings(index, call, { ...target, localCallable: { ...target.localCallable!, captures: [{ ...target.localCallable!.captures[0]!, name: "different_actor" }] } }).bindings).toEqual([])
})


test("instance method binder requires the current creation and receiver proof and explicit self", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    class Local:\n        def guard(self, item):\n            return item\n    instance = Local()\n    return instance.guard(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "instance.guard")!
  expect(call.classInstanceCall).toBeDefined()
  expect(api.sourceArgumentBindings(index, call, target).bindings).toEqual([{ parameter: "self", expression: "instance", literalKnown: false }, { parameter: "item", expression: "actor", literalKnown: false }])
  for (const property of ["classId", "classSha256", "creationCallId", "receiver"]) {
    const forged: any = structuredClone(call); forged.classInstanceCall[property] = "foreign"
    expect(api.sourceArgumentBindings(index, forged, target).gap).toBe("source-arguments-instance-method-unresolved")
  }
})

test("prepared returned environments cannot claim the initial factory literal or forged preparation anchors", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def create(flag):\n    flag = False\n    def check(item):\n        return flag\n    return check\ndef entry(actor):\n    operation = create(True)\n    return operation(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), target = index.symbols.find(s => s.name === "check")!, call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "operation")!
  expect(api.sourceArgumentBindings(index, call, target).bindings).toEqual([{ parameter: "item", expression: "actor", literalKnown: false }])
  expect(call.callableBinding!.captures[0]!.literalKnown).toBe(false)
  for (const mode of ["literal", "anchors", "owner"]) {
    const forged: any = structuredClone(call), capture = forged.callableBinding.captures[0]
    if (mode === "literal") { capture.literalKnown = true; capture.literalValue = true }
    if (mode === "anchors") capture.environmentBinding.assignmentAnchors = []
    if (mode === "owner") capture.environmentBinding.ownerId = "foreign"
    expect(api.sourceArgumentBindings(index, forged, target).gap).toBe("source-arguments-returned-callable-unresolved")
  }
})
test("a captured local helper binds only explicit arguments and rejects forged source capture proofs", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def make(flag, actor):\n    def check(item):\n        return flag\n    class Local:\n        def guard(actor):\n            return check(actor)\n    return Local.guard(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), method = index.symbols.find(s => s.name === "guard")!, helper = index.symbols.find(s => s.name === "check")!, call = index.relatedCalls(method.id)[0]!, binding = api.sourceArgumentBindings(index, call, helper)
  expect(binding.gap).toBeUndefined(); expect(binding.bindings).toEqual([{ parameter: "item", expression: "actor", literalKnown: false }])
  for (const field of ["targetId", "targetSha256", "ownerId", "binding"]) {
    const forged: any = structuredClone(call); forged.capturedCallable[field] = field === "binding" ? { ownerId: "foreign", ownerSha256: "foreign" } : "foreign"
    expect(api.sourceArgumentBindings(index, forged, helper).gap).toBe("source-arguments-captured-callable-unresolved")
  }
})
test("transitive implicit arguments retain the original capture owner rather than the relay owner", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def create(flag):\n    def decorator(actor):\n        def guard(item):\n            return flag\n        guard(actor)\n        return actor\n    return decorator\n" }], { repository: "anonymous", sourceRef: "r" }), origin = index.symbols.find(s => s.name === "create")!, relay = index.symbols.find(s => s.name === "decorator")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(relay.id).find(c => c.expression === "guard")!, bound = api.sourceArgumentBindings(index, call, target)
  expect(bound.gap).toBeUndefined()
  expect(bound.bindings.find((b: any) => b.parameter === "flag")).toEqual({ parameter: "flag", expression: "flag", literalKnown: false, captureOwnerId: origin.id })
  const forged = structuredClone(target); forged.localCallable!.captures[0]!.binding!.ownerId = relay.id
  expect(api.sourceArgumentBindings(index, call, forged).gap).toBe("source-arguments-local-callable-unresolved")
})
test("an implicit capture cannot be passed as a new Python keyword", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    def guard():\n        return actor\n    guard(actor=actor)\n" }], { repository: "anonymous", sourceRef: "r" })
  const caller = index.symbols.find(s => s.name === "entry")!, target = index.symbols.find(s => s.name === "guard")!
  expect(api.sourceArgumentBindings(index, index.relatedCalls(caller.id)[0]!, target).gap).toBe("source-arguments-unexpected")
})

test("a returned callable binds only source arguments and reads captures from the actual object", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def create(principal):\n    def guard(flag=False):\n        return principal\n    return guard\ndef entry(actor):\n    check = create(actor)\n    check()\n" }], { repository: "anonymous", sourceRef: "r" })
  const target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!, binding = api.sourceArgumentBindings(index, call, target)
  expect(binding.gap).toBeUndefined()
  expect(binding.bindings).toEqual([{ parameter: "flag", expression: "False", literalKnown: true, literalValue: false }])
  expect(api.sourceArgumentBindings(index, { ...call, callableBinding: { ...call.callableBinding!, creationCallId: "foreign" } }, target).bindings).toEqual([])
  expect(api.sourceArgumentBindings(index, { ...call, callableBinding: { ...call.callableBinding!, captures: [{ parameter: "principal", expression: "other_actor", literalKnown: false }] } }, target).bindings).toEqual([])
})

test("a method alias uses the same actual receiver and pack binder but rejects a foreign creation proof", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Gate:\n    def entry(self, actor, *args, **kwargs):\n        handler = self.guard\n        return handler(actor, *args, **kwargs)\n    def guard(self, actor, *rest, **options):\n        return actor\n" }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(owner.id)[0]!, bound = api.sourceArgumentBindings(index, call, target)
  expect(bound.gap).toBeUndefined()
  expect(bound.bindings.map((b: any) => [b.parameter, b.expression])).toEqual([["self", "self"], ["actor", "actor"], ["rest", "args"], ["options", "kwargs"]])
  expect(api.sourceArgumentBindings(index, { ...call, methodBinding: { ...call.methodBinding!, source: { ...call.methodBinding!.source, sha256: "foreign" } } }, target).gap).toBe("source-arguments-method-alias-unresolved")
  expect(api.sourceArgumentBindings(index, { ...call, receiver: "different_receiver" }, target).bindings).toEqual([])
})
test("finite method choices bind each actual target signature without accepting foreign proof or receiver", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Gate:\n    def entry(self, actor, *args, **kwargs):\n        handler = self.guard\n        handler = self.fallback\n        return handler(actor, *args, **kwargs)\n    def guard(self, actor, *rest, **options):\n        return actor\n    def fallback(self, actor, *tail, **other):\n        return actor\n" }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  for (const target of index.symbols.filter(s => ["guard", "fallback"].includes(s.name))) {
    const bound = api.sourceArgumentBindings(index, call, target)
    expect(bound.gap).toBeUndefined()
    expect(bound.bindings.map((b: any) => b.expression)).toEqual(["self", "actor", "args", "kwargs"])
    const forged = structuredClone(call); forged.methodChoices!.choices[0]!.source.sha256 = "foreign"
    expect(api.sourceArgumentBindings(index, forged, target).gap).toBe("source-arguments-method-choice-unresolved")
    expect(api.sourceArgumentBindings(index, { ...call, receiver: "other" }, target).bindings).toEqual([])
  }
})
test("getattr method targets use current self and pack mappings and reject a foreign lookup", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Gate:\n    def entry(self, actor, selector, *args, **kwargs):\n        handler = getattr(self, selector)\n        return handler(actor, *args, **kwargs)\n    def guard(self, actor, *rest, **options):\n        return actor\n" }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!, target = index.symbols.find(s => s.name === "guard")!
  const bound = api.sourceArgumentBindings(index, call, target)
  expect(bound.gap).toBeUndefined()
  expect(bound.bindings.map((b: any) => b.expression)).toEqual(["self", "actor", "args", "kwargs"])
  const forged = structuredClone(call); forged.methodLookup!.selector.expression = "other_selector"
  expect(api.sourceArgumentBindings(index, forged, target).gap).toBe("source-arguments-method-lookup-unresolved")
  expect(api.sourceArgumentBindings(index, { ...call, receiver: "other" }, target).bindings).toEqual([])
})
