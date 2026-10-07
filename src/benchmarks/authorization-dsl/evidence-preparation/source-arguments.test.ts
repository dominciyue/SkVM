import { expect, test } from "bun:test"
import { buildStructureIndex } from "./structure-index.ts"
const api = await import("./source-arguments.ts").catch(() => ({} as any))

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
test("an implicit capture cannot be passed as a new Python keyword", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    def guard():\n        return actor\n    guard(actor=actor)\n" }], { repository: "anonymous", sourceRef: "r" })
  const caller = index.symbols.find(s => s.name === "entry")!, target = index.symbols.find(s => s.name === "guard")!
  expect(api.sourceArgumentBindings(index, index.relatedCalls(caller.id)[0]!, target).gap).toBe("source-arguments-unexpected")
})

test("a returned callable binds captures from creation plus its actual result instance", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def create(principal):\n    def guard(flag=False):\n        return principal\n    return guard\ndef entry(actor):\n    check = create(actor)\n    check()\n" }], { repository: "anonymous", sourceRef: "r" })
  const factory = index.symbols.find(s => s.name === "create")!, target = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!, binding = api.sourceArgumentBindings(index, call, target)
  expect(binding.gap).toBeUndefined()
  expect(binding.bindings).toEqual([{ parameter: "flag", expression: "False", literalKnown: true, literalValue: false }, { parameter: "principal", expression: "actor", literalKnown: false, captureOwnerId: factory.id }, { parameter: api.sourceCallableParameter(target.id), expression: "check", literalKnown: false, captureOwnerId: factory.id }])
  expect(api.sourceArgumentBindings(index, { ...call, callableBinding: { ...call.callableBinding!, creationCallId: "foreign" } }, target).bindings).toEqual([])
  expect(api.sourceArgumentBindings(index, { ...call, callableBinding: { ...call.callableBinding!, captures: [{ parameter: "principal", expression: "other_actor", literalKnown: false }] } }, target).bindings).toEqual([])
})
