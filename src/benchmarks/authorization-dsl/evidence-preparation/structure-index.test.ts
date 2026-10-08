import { expect, test } from "bun:test"
import { buildStructureIndex } from "./structure-index.ts"

test("module decorator cannot read a function before its actual declaration", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "@replace\nclass Local:\n    allowed = False\ndef replace(cls):\n    return cls\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.symbols.find(s => s.name === "Local")!.moduleClassDefinition?.gap).toBe("source-class-definition-decorator-unresolved")
})
for (const mode of ["class", "instance"]) test("module class method protocol remains explicit until its environment is executed: " + mode, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Local:\n    def guard(self):\n        return self\n" + (mode === "instance" ? "instance = Local()\ninstance.guard()\n" : "Local.guard(Local)\n") }], { repository: "anonymous", sourceRef: "r" }), module = index.symbols.find(s => s.kind === "module")!, call = index.relatedCalls(module.id).find(c => c.expression.endsWith(".guard"))!
  expect(call.resolution).toBe("unresolved"); expect(call.gap).toBe("source-module-class-method-unmodeled"); expect(index.symbols.find(s => s.name === "guard")!.classMethod).toBeUndefined()
})

for (const mode of ["field", "inherited", "instance", "decorator", "replacement", "branch"]) test("module initialization records original class and callable creation: " + mode, async () => {
  const decoration = ["decorator", "replacement"].includes(mode), content = (decoration ? "def replace(cls):\n" + (mode === "replacement" ? "    class Other(cls):\n        allowed = True\n    return Other\n" : "    cls.allowed = True\n    return cls\n") : "") + (mode === "inherited" ? "class Base:\n    allowed = True\n" : "") + (mode === "branch" ? "if True:\n    class Local:\n        allowed = True\n" : (decoration ? "@replace\n" : "") + "class Local" + (mode === "inherited" ? "(Base)" : "") + ":\n    allowed = " + (decoration ? "False" : "True") + "\n") + "def check(value):\n    if value.allowed:\n        raise Denied\n    return value\n" + (mode === "instance" ? "instance = Local()\ncheck(instance)\n" : "check(Local)\n"), index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), module = index.symbols.find(s => s.kind === "module")!, cls = index.symbols.find(s => s.name === "Local")!, check = index.symbols.find(s => s.name === "check")!
  expect(module).toBeDefined(); expect(module.parameters).toEqual([]); expect(module.startLine).toBe(1); expect(module.endLine).toBe(content.replace(/\n$/, "").split("\n").length)
  expect(cls.qualifiedName).toBe("app.Local"); expect(check.qualifiedName).toBe("app.check"); expect(check.localCallable).toBeUndefined(); expect(check.valueCallable).toBeUndefined()
  expect(cls.classDefinition).toBeUndefined(); expect(cls.moduleClassDefinition?.ownerId).toBe(module.id); expect(cls.moduleClassDefinition?.gap).toBeUndefined()
  expect(module.moduleInitialization?.functions.find(f => f.targetId === check.id)?.definition.gap).toBeUndefined()
  const call = index.relatedCalls(module.id).find(c => c.expression === "check")!
  expect(call.moduleCallable).toEqual({ targetId: check.id, targetSha256: check.sha256 }); expect(call.resolution).toBe("resolved"); expect(call.argumentFacts?.[0]?.classValue).toBeUndefined()
  if (mode === "inherited") expect(cls.moduleClassDefinition!.bases[0]!.targetId).toBe(index.symbols.find(s => s.name === "Base")!.id)
  if (mode === "instance") expect(index.relatedCalls(module.id).find(c => c.expression === "Local")!.classConstructor?.classId).toBe(cls.id)
  if (mode === "branch") expect(cls.moduleClassDefinition!.controls.map(c => c.kind)).toEqual(["branch"])
})

for (const mode of ["annotation", "default-call", "mutable-default", "wrapped", "rebound", "before-definition", "argument-call"]) test("module callable initialization retains unsupported declaration and call boundaries: " + mode, async () => {
  const declaration = (mode === "wrapped" ? "@unknown\n" : "") + "def check(value" + (mode === "annotation" ? ": Item" : mode === "default-call" ? "=create()" : mode === "mutable-default" ? "=[]" : "") + "):\n    return value\n", content = (mode === "before-definition" ? "check(None)\n" : "") + declaration + (mode === "rebound" ? "check = None\n" : "") + "check(" + (mode === "argument-call" ? "create()" : "None") + ")\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), module = index.symbols.find(s => s.kind === "module")!
  expect(module).toBeDefined()
  const calls = index.relatedCalls(module.id).filter(c => c.expression === "check"), call = mode === "before-definition" ? calls[0]! : calls.at(-1)!
  expect(call.moduleCallable).toBeUndefined(); expect(call.resolution).toBe("unresolved"); expect(call.gap).toMatch(/^source-module-callable-/)
})

for (const mode of ["direct", "diamond", "renamed", "argument"]) test("local super source retains actual C3 successor candidates and original read order: " + mode, async () => {
  const diamond = mode === "diamond", receiver = mode === "renamed" ? "this" : "self", content = "def entry(actor):\n    class Base:\n        def guard(self, item):\n            return item\n    class " + (diamond ? "Left" : "Local") + "(Base):\n        def relay(" + receiver + ", item):\n            return super().guard(" + (mode === "argument" ? "prepare(item)" : "item") + ")\n" + (diamond ? "    class Right(Base):\n        def guard(self, item):\n            return item\n    class Local(Left, Right):\n        pass\n" : "") + "    instance = Local()\n    return instance.relay(actor)\ndef prepare(item):\n    return item\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), method = index.symbols.find(s => s.name === "relay")!, calls = index.relatedCalls(method.id), call = calls.find(c => c.expression === "super().guard")!, proof = call.superMethod!
  expect(call.gap).toBeUndefined(); expect(proof).toBeDefined(); expect(proof.receiver).toBe(receiver)
  expect(proof.choices).toHaveLength(diamond ? 2 : 1); expect(call.candidateIds).toEqual(proof.choices.map(c => c.targetId))
  expect(content.slice(proof.source.startIndex, proof.source.endIndex)).toBe("super().guard")
  expect(proof.argumentEvents).toHaveLength(mode === "argument" ? 1 : 0)
  expect(calls.find(c => c.expression === "super")!.superContext?.outerCallId).toBe(call.id)
})
for (const count of [15, 16]) test("super successor candidates respect the existing finite capacity: " + count, async () => {
  const content = "def entry():\n    class Base:\n        def guard(self):\n            return self\n    class Left(Base):\n        def relay(self):\n            return super().guard()\n" + Array.from({ length: count }, (_, i) => "    class Right" + i + "(Base):\n        def guard(self):\n            return self\n    class Child" + i + "(Left, Right" + i + "):\n        pass\n").join("") + "    return Left\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "relay")!.id).find(c => c.expression === "super().guard")!
  expect(call.superMethod?.choices.length).toBe(count === 15 ? 16 : undefined)
  expect(call.gap).toBe(count === 15 ? undefined : "source-class-super-targets-unmodeled")
})

for (const mode of ["read", "super", "renamed"]) test("ordinary namespace method records the original implicit class cell: " + mode, async () => {
  const content = "def entry(actor):\n    class Local:\n        def guard(" + (mode === "renamed" ? "this" : "self") + ", item):\n            return " + (mode === "read" ? "__class__" : "super().guard(item)") + "\n    return Local\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), cls = index.symbols.find(s => s.name === "Local")!, method = index.symbols.find(s => s.name === "guard")!, proof = cls.classDefinition!.methods[0]!
  expect(cls.classDefinition!.gap).toBeUndefined(); expect(method.classMethod?.classCell).toBeDefined()
  expect(proof.classCell).toEqual(method.classMethod!.classCell); expect(content.slice(proof.classCell!.startIndex, proof.classCell!.endIndex)).toBe(mode === "read" ? "__class__" : "super")
  if (mode !== "read") expect(index.relatedCalls(method.id).filter(c => ["super", "super().guard"].includes(c.expression)).map(c => c.gap)).toEqual(["source-class-super-unmodeled", "source-class-super-unmodeled"])
})
for (const mode of ["super-parameter", "super-local", "super-outer", "super-module", "super-args", "super-value", "class-parameter", "class-local"]) test("class cell keeps shadowing and unsupported super forms named: " + mode, async () => {
  const content = (mode === "super-module" ? "super = None\n" : "") + "def entry(" + (mode === "super-outer" ? "super" : "") + "):\n    class Local:\n        def guard(self" + (mode === "super-parameter" ? ", super" : mode === "class-parameter" ? ", __class__" : "") + "):\n" + (mode === "super-local" ? "            super = None\n" : mode === "class-local" ? "            __class__ = None\n" : "") + "            return " + (mode.startsWith("class-") ? "__class__" : mode === "super-args" ? "super(Local, self).guard()" : mode === "super-value" ? "super" : "super().guard()") + "\n    return Local\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect(index.symbols.find(s => s.name === "Local")!.classDefinition!.gap).toBeDefined()
})

for (const mode of ["direct", "inherited", "self", "field"]) test("ordinary local constructor and actual instance methods retain source identity: " + mode, async () => {
  const method = "        def guard(self, item):\n            return item\n", body = mode === "inherited" ? "    class Base:\n" + method + "    class Local(Base):\n        allowed = False\n" : "    class Local:\n" + method + (mode === "self" ? "        def relay(self, item):\n            return self.guard(item)\n" : ""), content = "def entry(actor, holder):\n" + body + (mode === "field" ? "    holder.instance = Local()\n    return holder.instance\n" : "    instance = Local()\n    return instance." + (mode === "self" ? "relay" : "guard") + "(actor)\n"), index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!, cls = index.symbols.find(s => s.name === "Local")!, calls = index.relatedCalls(entry.id), creation = calls.find(c => c.expression === "Local")!
  expect(creation.resolution).toBe("resolved"); expect(creation.candidateIds).toEqual([])
  expect(creation.classConstructor).toEqual(expect.objectContaining({ classId: cls.id, classSha256: cls.sha256, classObject: "Local", result: mode === "field" ? expect.stringMatching(/^result-/) : "instance" }))
  if (mode !== "field") {
    const methodCall = calls.find(c => c.expression.startsWith("instance."))!
    expect(methodCall.classInstanceCall?.classId).toBe(cls.id); expect(methodCall.classInstanceCall?.creationCallId).toBe(creation.id); expect(methodCall.resolution).toBe("resolved")
    if (mode === "self") { const relay = index.symbols.find(s => s.name === "relay")!, call = index.relatedCalls(relay.id).find(c => c.expression === "self.guard")!; expect(call.classInstanceCall?.receiver).toBe("self"); expect(call.resolution).toBe("resolved") }
  }
})

for (const mode of ["args", "init", "new", "descriptor", "late", "replace", "parameter", "wrapped"]) test("ordinary default constructor preserves custom or unstable boundaries: " + mode, async () => {
  const method = mode === "init" ? "        def __init__(self):\n            pass\n" : mode === "new" ? "        def __new__(cls):\n            return cls\n" : mode === "descriptor" ? "        def __getattr__(self, key):\n            return key\n" : "        allowed = False\n", content = "def entry(" + (mode === "parameter" ? "Local, " : "") + "actor):\n" + (mode === "late" ? "    first = Local()\n" : "") + (mode === "wrapped" ? "    @unknown\n" : "") + "    class Local:\n" + method + (mode === "replace" ? "    Local = None\n" : "") + "    instance = Local(" + (mode === "args" ? "actor" : "") + ")\n    return instance\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!, calls = index.relatedCalls(entry.id).filter(c => c.expression === "Local")
  const creation = mode === "late" ? calls[0]! : calls.at(-1)!
  expect(creation.classConstructor).toBeUndefined(); expect(creation.resolution).toBe("unresolved")
})

for (const mode of ["rebound", "nested-argument"]) test("instance method candidates retain binding and original callee order boundaries: " + mode, async () => {
  const content = "def other(actor):\n    return actor\ndef entry(actor):\n    class Local:\n        def guard(self, item):\n            return item\n    instance = Local()\n" + (mode === "rebound" ? "    instance = actor\n" : "") + "    return instance.guard(" + (mode === "nested-argument" ? "other(actor)" : "actor") + ")\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "instance.guard")!
  expect(call.classInstanceCall).toBeUndefined(); expect(call.resolution).toBe("unresolved")
})

for (const mode of ["direct", "ancestor"]) test("ordinary constructors require a completely known default construction protocol: " + mode, async () => {
  const content = "def entry(Base, actor):\n" + (mode === "ancestor" ? "    class Parent(Base):\n        allowed = False\n" : "") + "    class Local(" + (mode === "ancestor" ? "Parent" : "Base") + "):\n        def guard(self, item):\n            return item\n    instance = Local()\n    return instance.guard(actor)\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, creation = index.relatedCalls(owner.id).find(c => c.expression === "Local")!
  expect(index.symbols.find(s => s.name === "Local")!.classDefinition!.gap).toBeUndefined()
  expect(creation.classConstructor).toBeUndefined(); expect(creation.gap).toBe("source-class-constructor-unmodeled")
  expect(index.relatedCalls(owner.id).find(c => c.expression === "instance.guard")!.classInstanceCall).toBeUndefined()
})

for (const mode of ["parameter", "local", "conditional", "call"]) test(`dynamic identifier base retains its actual lexical binding and preparation: ${mode}`, async () => {
  const prepare = mode === "parameter" ? "" : mode === "conditional" ? "    selected = base\n    if flag:\n        selected = other\n" : mode === "call" ? "    selected = select(base)\n" : "    selected = base\n", expression = mode === "parameter" ? "base" : "selected"
  const content = "def build(base, other, flag, actor):\n" + prepare + "    class Child(" + expression + "):\n        def guard(item):\n            return item\n    Child.guard(actor)\n    return Child\n" + (mode === "call" ? "def select(value):\n    return value\n" : ""), index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "build")!, child = index.symbols.find(s => s.name === "Child")!, proof = child.classDefinition!
  expect(proof.gap).toBeUndefined()
  expect(proof.bases).toEqual([expect.objectContaining({ expression, binding: { ownerId: owner.id, ownerSha256: owner.sha256 }, assignments: expect.any(Array) })])
  expect((proof.bases[0] as any).targetId).toBeUndefined(); expect((proof.bases[0] as any).assignments).toHaveLength(mode === "parameter" ? 0 : mode === "conditional" ? 2 : 1)
  const call = index.relatedCalls(owner.id).find(c => c.expression === "Child.guard")!
  expect(call.classNamespaceCall?.targetId).toBe(index.symbols.find(s => s.name === "guard")!.id); expect(call.resolution).toBe("resolved")
})

test("dynamic base parameters shadow module names without borrowing their class identity", async () => {
  const content = "class Base:\n    allowed = True\ndef build(Base):\n    class Child(Base):\n        allowed = False\n    return Child\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "build")!, base = index.symbols.find(s => s.name === "Child")!.classDefinition!.bases[0] as any
  expect(base).toBeDefined(); expect(base.binding?.ownerId).toBe(owner.id); expect(base.targetId).toBeUndefined()
})

for (const mode of ["inherited", "field-shadow"]) test(`dynamic parent does not lend a static inherited method candidate: ${mode}`, async () => {
  const content = "def guard(actor):\n    return actor\ndef build(base, actor):\n    class Child(base):\n" + (mode === "field-shadow" ? "        def guard(item):\n            return item\n        guard = None\n" : "        allowed = False\n") + "    return Child.guard(actor)\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "build")!, call = index.relatedCalls(owner.id).find(c => c.expression === "Child.guard")!
  expect(index.symbols.find(s => s.name === "Child")!.classDefinition!.gap).toBeUndefined()
  expect(call.classNamespaceCall).toBeUndefined(); expect(call.candidateIds).toEqual([]); expect(call.resolution).toBe("unresolved")
})

for (const mode of ["late", "augmented", "delete", "loop", "walrus", "global", "nonlocal", "attribute", "call", "duplicate", "module"]) test(`dynamic base retains unsupported writer and expression boundaries: ${mode}`, async () => {
  const prefix = mode === "global" ? "    global base\n" : mode === "nonlocal" ? "    nonlocal base\n" : mode === "augmented" ? "    base += 1\n" : mode === "delete" ? "    del base\n" : mode === "loop" ? "    for base in []:\n        pass\n" : mode === "walrus" ? "    if (base := other):\n        pass\n" : "", expression = mode === "attribute" ? "base.child" : mode === "call" ? "base()" : mode === "duplicate" ? "base, base" : "base"
  const content = "class base:\n    allowed = True\ndef build(" + (mode === "module" ? "" : "base, other") + "):\n" + prefix + "    class Child(" + expression + "):\n        allowed = False\n" + (mode === "late" ? "    base = other\n" : "") + "    return Child\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect(index.symbols.find(s => s.name === "Child")!.classDefinition!.gap).toBeDefined()
})

for (const kind of ["returned", "class", "helper"]) test(`stable parameter assignments before ${kind} creation retain their exact capture preparation`, async () => {
  const nested = kind === "class" ? "    class Local:\n        def check(item):\n            return flag\n    return Local.check(actor)\n" : "    def check(item):\n        return flag\n" + (kind === "returned" ? "    return check\n" : "    return check(actor)\n")
  const content = "def create(flag, actor):\n    if flag:\n        flag = False\n" + nested + (kind === "returned" ? "def entry(actor):\n    check = create(True, actor)\n    return check(actor)\n" : ""), index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), create = index.symbols.find(s => s.name === "create")!, check = index.symbols.find(s => s.name === "check")!, proof = check.classMethod ?? check.valueCallable ?? check.localCallable!
  expect(proof).toBeDefined(); expect("gap" in proof ? proof.gap : undefined).toBeUndefined()
  expect(proof.captures).toEqual([expect.objectContaining({ name: "flag", binding: { ownerId: create.id, ownerSha256: create.sha256 }, assignments: [expect.objectContaining({ name: "flag", valueExpression: "False", literalKnown: true, literalValue: false, controls: [expect.objectContaining({ branch: "true" })] })] })])
  if (kind === "returned") { const call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!; expect(call.resolution).toBe("resolved"); expect(call.callableBinding!.captures).toEqual([expect.objectContaining({ parameter: "flag", expression: "flag", literalKnown: false, environmentBinding: expect.objectContaining({ ownerId: create.id, assignmentAnchors: proof.captures[0]!.assignments!.map((a: any) => a.anchorId) }) })]) }
})

test("ancestor preparation completes before the first returned closure creation boundary", async () => {
  const content = "def create(flag):\n    flag = False\n    def decorator(actor):\n        def check(item):\n            return flag\n        class Local:\n            def guard(item):\n                return check(item)\n        Local.guard(actor)\n        return actor\n    return decorator\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), decorator = index.symbols.find(s => s.name === "decorator")!, check = index.symbols.find(s => s.name === "check")!
  expect(decorator.returnedCallable!.gap).toBeUndefined(); expect(check.valueCallable!.gap).toBeUndefined()
  expect((decorator.valueCallable!.captures[0] as any).assignments).toHaveLength(1)
})

for (const mode of ["late", "intervening", "augmented", "delete", "loop", "walrus"]) test(`parameter capture preparation preserves unsupported post-creation or complex writes: ${mode}`, async () => {
  const prepare = mode === "augmented" ? "    flag += 1\n" : mode === "delete" ? "    del flag\n" : mode === "loop" ? "    for flag in [True]:\n        pass\n" : mode === "walrus" ? "    if (flag := True):\n        pass\n" : ""
  const content = mode === "intervening" ? "def create(flag):\n    def decorator(actor):\n        def check(item):\n            return flag\n        return check(actor)\n    flag = False\n    return decorator\n" : `def create(flag):\n${prepare}    def check(item):\n        return flag\n${mode === "late" ? "    flag = False\n" : ""}    return check\n`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), check = index.symbols.find(s => s.name === "check")!
  expect(check.localCallable!.gap).toBeDefined()
  if (mode === "intervening") expect(index.symbols.find(s => s.name === "decorator")!.returnedCallable!.gap).toBeDefined()
  else expect(check.valueCallable?.gap ?? check.returnedCallable?.gap).toBeDefined()
})

for (const returned of [false, true]) test(`class methods capture actual stable local function definitions: ${returned}`, async () => {
  const nested = "    def check(item):\n        return flag\n    class Local:\n        def guard(actor):\n            return check(actor)\n    Local.guard(actor)\n    return actor\n", content = returned ? "def create(flag):\n    def decorator(actor):\n" + nested.split("\n").filter(Boolean).map(s => "    " + s).join("\n") + "\n    return decorator\n" : "def make(flag, actor):\n" + nested
  const index = await buildStructureIndex([{ path: "app.py", content: "def check(item):\n    raise Denied\n" + content }], { repository: "anonymous", sourceRef: "r" }), helper = index.symbols.find(s => s.name === "check" && s.localCallable)!, method = index.symbols.find(s => s.name === "guard")!, cls = index.symbols.find(s => s.name === "Local")!, owner = index.symbols.find(s => s.id === cls.classDefinition!.ownerId)!, call = index.relatedCalls(method.id).find(c => c.expression === "check")!
  expect(helper.valueCallable).toBeDefined(); expect(helper.valueCallable!.gap).toBeUndefined()
  expect(cls.classDefinition!.gap).toBeUndefined()
  expect(method.classMethod!.captures).toEqual([expect.objectContaining({ name: "check", binding: { ownerId: owner.id, ownerSha256: owner.sha256 }, callable: { targetId: helper.id, targetSha256: helper.sha256 } })])
  expect((call as any).capturedCallable).toEqual({ ownerId: method.id, name: "check", targetId: helper.id, targetSha256: helper.sha256, binding: { ownerId: owner.id, ownerSha256: owner.sha256 } })
  expect(call.candidateIds).toEqual([helper.id]); expect(call.resolution).toBe("resolved")
  if (returned) { expect(owner.returnedCallable?.gap).toBeUndefined(); expect(owner.valueCallable?.captures.map(c => c.name)).toEqual(["flag"]) }
})

for (const mode of ["before", "rebound", "conditional", "wrapped", "generator", "capture-rebound", "escape", "nonlocal", "recursive", "mutable-default"]) test(`local function object captures retain unsupported cell and definition boundaries: ${mode}`, async () => {
  const helper = `${mode === "wrapped" ? "    @unknown\n" : ""}${mode === "conditional" ? "    if flag:\n    " : ""}    def check(${mode === "mutable-default" ? "item=[]" : "item"}):\n${mode === "nonlocal" ? "        nonlocal flag\n" : ""}        ${mode === "generator" ? "yield item" : mode === "recursive" ? "return check(item)" : "return flag"}\n`, cls = "    class Local:\n        def guard(actor):\n            return check(actor)\n"
  const content = `def make(flag, actor):\n${mode === "before" ? cls + helper : helper + cls}${mode === "rebound" ? "    check = None\n" : mode === "capture-rebound" ? "    flag = False\n" : mode === "escape" ? "    alias = check\n" : ""}    Local.guard(actor)\n`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), local = index.symbols.find(s => s.name === "Local")!, guard = index.symbols.find(s => s.name === "guard")!
  expect(local.classDefinition!.gap).toBeDefined()
  expect(index.relatedCalls(guard.id)[0]!.candidateIds).toEqual([])
})

test("local helper definitions with a nonlocal binding cannot become snapshot class captures", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def outer(check):\n    def make(flag, actor):\n        nonlocal check\n        def check(item):\n            return flag\n        class Local:\n            def guard(actor):\n                return check(actor)\n        return Local.guard(actor)\n    return make\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.symbols.find(s => s.name === "Local")!.classDefinition!.gap).toBeDefined()
})

test("captured helper calls with argument actions keep an explicit evaluation order boundary", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def make(flag, actor):\n    def check(item):\n        return flag\n    class Local:\n        def guard(actor):\n            return check(prepare(actor))\n    return Local.guard(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), guard = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(guard.id).find(c => c.expression === "check")!
  expect(call.gap).toBe("source-callable-capture-call-order-unmodeled"); expect(call.candidateIds).toEqual([])
})

for (const kind of ["class", "local"]) test(`returned bodies relay stable ancestor parameters needed only by an inner ${kind}`, async () => {
  const nested = kind === "class" ? "        class Local:\n            def guard(actor):\n                return flag\n        Local.guard(actor)\n" : "        def guard(actor):\n            return flag\n        guard(actor)\n"
  const content = `def create(flag):\n    def decorator(actor):\n${nested}        return actor\n    return decorator\ndef entry(actor):\n    wrapper = create(True)\n    wrapper(actor)\n`, index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), create = index.symbols.find(s => s.name === "create")!, decorator = index.symbols.find(s => s.name === "decorator")!, guard = index.symbols.find(s => s.name === "guard")!
  expect(decorator.returnedCallable?.gap).toBeUndefined()
  expect(decorator.valueCallable?.captures).toEqual([expect.objectContaining({ name: "flag", binding: { ownerId: create.id, ownerSha256: create.sha256 }, relay: [expect.objectContaining({ targetId: guard.id, targetSha256: guard.sha256 })] })])
  expect((kind === "class" ? guard.classMethod : guard.localCallable)?.captures).toEqual([expect.objectContaining({ name: "flag", binding: { ownerId: create.id, ownerSha256: create.sha256 } })])
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "wrapper")!.resolution).toBe("resolved")
})

for (const mode of ["root-rebound", "nonlocal", "intermediate-local", "global", "match", "lambda", "wrapped-helper", "mutable-default"]) test(`transitive captures retain mutable cell and unknown nested boundaries: ${mode}`, async () => {
  const content = `def create(flag):\n    def decorator(actor):\n${mode === "intermediate-local" ? "        flag = False\n" : mode === "global" ? "        global flag\n" : mode === "match" ? "        match actor:\n            case flag:\n                pass\n" : ""}${mode === "lambda" ? "        operation = lambda: flag\n" : `${mode === "wrapped-helper" ? "        @unknown\n" : ""}        def guard(${mode === "mutable-default" ? "value=[]" : ""}):\n${mode === "nonlocal" ? "            nonlocal flag\n" : ""}            return flag\n        guard()\n`}        return actor\n${mode === "root-rebound" ? "    flag = False\n" : ""}    return decorator\n`, index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), decorator = index.symbols.find(s => s.name === "decorator")!
  expect(decorator.returnedCallable?.gap).toBeDefined()
  expect(decorator.valueCallable?.gap ?? decorator.returnedCallable?.gap).toBeDefined()
})

for (const imported of [false, true]) test(`a class method ancestor parameter shadows a same-named external callable: ${imported}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `${imported ? "from other import operation\n" : "def operation(item):\n    raise Denied\n"}def create(operation):\n    def decorator(actor):\n        class Local:\n            def guard(item):\n                return operation(item)\n        Local.guard(actor)\n        return actor\n    return decorator\n` }, ...imported ? [{ path: "other.py", content: "def operation(item):\n    raise Denied\n" }] : []], { repository: "anonymous", sourceRef: "r" }), guard = index.symbols.find(s => s.name === "guard")!, call = index.relatedCalls(guard.id).find(c => c.expression === "operation")!
  expect(guard.classMethod?.captures.map(c => c.name)).toEqual(["operation"])
  expect(call.resolution).toBe("unresolved"); expect(call.candidateIds).toEqual([])
})

test("an intervening parameter is the actual class method capture binding", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def create(flag):\n    def decorator(flag, actor):\n        class Local:\n            def guard(item):\n                return flag\n        Local.guard(actor)\n        return actor\n    return decorator\n" }], { repository: "anonymous", sourceRef: "r" }), decorator = index.symbols.find(s => s.name === "decorator")!, guard = index.symbols.find(s => s.name === "guard")!
  expect(decorator.valueCallable?.captures).toEqual([])
  expect(guard.classMethod?.captures).toEqual([expect.objectContaining({ name: "flag", binding: { ownerId: decorator.id, ownerSha256: decorator.sha256 } })])
})

for (const count of [16, 17]) test(`relayed stable parameter captures respect the existing callable capacity: ${count}`, async () => {
  const names = Array.from({ length: count }, (_, i) => `p${i}`), index = await buildStructureIndex([{ path: "app.py", content: `def create(${names.join(", ")}):\n    def decorator(actor):\n        def guard():\n            return ${names.join(" and ")}\n        guard()\n        return actor\n    return decorator\n` }], { repository: "anonymous", sourceRef: "r" }), decorator = index.symbols.find(s => s.name === "decorator")!, guard = index.symbols.find(s => s.name === "guard")!
  expect(guard.localCallable?.gap).toBe(count === 16 ? undefined : "source-local-capture-limit")
  expect(decorator.returnedCallable?.gap).toBe(count === 16 ? undefined : "source-returned-callable-nested-scope-unmodeled")
  if (count === 16) expect(decorator.valueCallable?.captures.map(c => c.name)).toEqual(names)
})

for (const mode of ["base", "metaclass", "wrapped-method", "body-call", "formatted-string", "slots", "classcell", "annotation", "parameter", "local-shadow", "rebound", "async", "loop"]) test(`local class definition preserves unsupported namespace and decorator boundaries: ${mode}`, async () => {
  const body = mode === "wrapped-method" ? "        @unknown\n        def method(self):\n            return True\n" : mode === "body-call" ? "        flag = unknown()\n" : mode === "formatted-string" ? "        f'{unknown()}'\n" : mode === "slots" ? "        __slots__ = 123\n" : mode === "classcell" ? "        __classcell__ = False\n" : mode === "annotation" ? "        flag: unknown() = False\n" : "        flag = False\n"
  const content = `def decorate(cls):\n    return cls\n${mode === "rebound" ? "decorate = unknown()\n" : ""}${mode === "async" ? "async " : ""}def entry(${mode === "parameter" ? "decorate" : ""}):\n${mode === "local-shadow" ? "    decorate = None\n" : ""}${mode === "loop" ? "    for item in [True]:\n" : ""}${mode === "loop" ? "        " : "    "}@decorate\n${mode === "loop" ? "        " : "    "}class Local${mode === "base" ? "(Base)" : mode === "metaclass" ? "(metaclass=Meta)" : ""}:\n${mode === "loop" ? body.replace(/^/gm, "    ").trimEnd() + "\n" : body}    return Local\n`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), local = index.symbols.find(s => s.name === "Local")!
  expect(local.classDefinition).toBeDefined()
  expect(local.classDefinition!.gap).toBeDefined()
})

for (const mode of ["async", "generator", "dunder", "super", "classcell", "annotation", "default-action", "mutable-default", "nested", "capture-local", "capture-rebound", "capture-outer-rebound", "before", "rebound", "nested-argument", "field-shadow"]) test(`class namespace source keeps unsupported method and invocation boundaries: ${mode}`, async () => {
  const body = mode === "generator" ? "            yield actor\n" : mode === "super" ? "            return super(Other, actor).guard(actor)\n" : mode === "classcell" ? "            __class__ = None\n            return __class__\n" : mode === "nested" ? "            def inner():\n                return actor\n            return inner()\n" : ["capture-local", "capture-rebound", "capture-outer-rebound"].includes(mode) ? "            return flag\n" : "            return actor\n"
  const source = `def outer(flag):\n    return flag\ndef entry(${mode === "capture-rebound" ? "flag, " : ""}actor):\n${mode === "capture-local" ? "    flag = True\n" : mode === "capture-outer-rebound" ? "    def factory():\n        return flag\n" : ""}${mode === "before" ? "    Local.guard(actor)\n" : ""}    class Local:\n        ${mode === "async" ? "async " : ""}def ${mode === "dunder" ? "__getattr__" : "guard"}(${mode === "annotation" ? "actor: Unknown" : mode === "default-action" ? "actor=unknown()" : mode === "mutable-default" ? "actor=[]" : "actor"}):\n${body}${mode === "field-shadow" ? "        guard = None\n" : ""}${mode === "capture-rebound" ? "    flag = False\n" : mode === "rebound" ? "    Local = None\n" : ""}    Local.guard(${mode === "nested-argument" ? "outer(actor)" : "actor"})\n`
  const content = mode === "capture-outer-rebound" ? "def outer(flag):\n" + source.slice(source.indexOf("def entry(")).split("\n").filter(Boolean).map(line => "    " + line).join("\n") + "\n    flag = False\n" : source
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!, cls = index.symbols.find(s => s.name === "Local")!
  if (["before", "rebound", "nested-argument", "field-shadow"].includes(mode)) { const call = index.relatedCalls(entry.id).filter(c => c.expression === "Local.guard")[0]!; expect(call.classNamespaceCall).toBeUndefined(); expect(call.resolution).toBe("unresolved") }
  else expect(cls.classDefinition!.gap).toBeDefined()
})

for (const count of [16, 17]) test(`local class base facts respect the existing native metadata capacity: ${count}`, async () => {
  const content = "def entry():\n" + Array.from({ length: count }, (_, i) => `    class Base${i}:\n        pass\n`).join("") + `    class Local(${Array.from({ length: count }, (_, i) => `Base${i}`).join(", ")}):\n        pass\n    return Local\n`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), proof = index.symbols.find(s => s.name === "Local")!.classDefinition!
  expect(proof.gap).toBe(count === 16 ? undefined : "source-class-definition-base-unmodeled")
})

test("function-valued parameter attribute writes retain possible source function protocol", async () => {
  const index = await buildStructureIndex([{ path: "caller.py", content: "from callbacks import guard\nfrom consumer import consume\ndef entry(actor):\n    consume(guard, actor)\n" }, { path: "callbacks.py", content: "def guard(subject):\n    raise Denied\n" }, { path: "consumer.py", content: "def consume(operation, actor):\n    alias = operation\n    alias.__code__ = actor\n    return actor\n" }], { repository: "anonymous", sourceRef: "r" }), consumer = index.symbols.find(s => s.name === "consume")!, target = index.symbols.find(s => s.name === "guard")!, store = index.fieldStores(consumer.id)[0]!
  expect(store.gap).toBe("skeleton-function-attribute-write-unmodeled")
  expect(store.functionCandidateIds).toEqual([target.id])
  expect(store.sources.map(s => s.path)).toContain("caller.py")
})

test("a generator consumer cannot execute its function-valued parameter at creation", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    consume(guard, actor)\ndef guard(subject):\n    raise Denied\ndef consume(operation, actor):\n    yield actor\n    operation(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), consumer = index.symbols.find(s => s.name === "consume")!, call = index.relatedCalls(consumer.id).find(c => c.expression === "operation")!
  expect(call.callableParameter).toBeUndefined()
  expect(call.gap).toBe("source-callable-parameter-owner-unmodeled")
})

for (const mode of ["generator", "wrapped", "async", "module-rebound", "parameter-shadow", "local-shadow", "capture-rebound", "nonlocal", "conditional-definition", "escape"]) test(`source function values retain unsupported original execution boundaries: ${mode}`, async () => {
  const local = ["capture-rebound", "nonlocal", "conditional-definition", "escape"].includes(mode), definition = `${mode === "wrapped" ? "@decorate\n" : ""}${mode === "async" ? "async " : ""}def guard(subject):\n    ${mode === "generator" ? "yield subject\n    " : ""}raise Denied\n`, content = local ? `def entry(flag, actor):\n${mode === "conditional-definition" ? "    if flag:\n    " : ""}    def guard(subject):\n${mode === "nonlocal" ? "        nonlocal flag\n" : ""}        if flag:\n            raise Denied\n        return subject\n${mode === "capture-rebound" ? "    flag = False\n" : mode === "escape" ? "    alias = guard\n" : ""}    consume(guard, actor)\n` : definition + `${mode === "module-rebound" ? "guard = unknown()\n" : ""}def entry(${mode === "parameter-shadow" ? "guard, " : ""}actor):\n${mode === "local-shadow" ? "    guard = actor\n" : ""}    consume(guard, actor)\n`
  const index = await buildStructureIndex([{ path: "app.py", content: content + "def consume(operation, actor):\n    operation(actor)\n" }], { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!, consumer = index.symbols.find(s => s.name === "consume")!
  expect(index.relatedCalls(entry.id).find(c => c.expression === "consume")!.argumentFacts![0]!.callableValue).toBeUndefined()
  expect(index.relatedCalls(consumer.id)[0]!.callableParameter).toBeUndefined()
})

for (const local of [false, true]) test(`function parameter calls retain current callable inputs and creation source: ${local}`, async () => {
  const content = local ? "def entry(actor, flag):\n    def guard(subject):\n        if flag:\n            raise Denied\n        return subject\n    consume(guard, actor)\ndef consume(operation, actor):\n    operation(actor)\n" : "def entry(actor):\n    consume(guard, actor)\ndef guard(subject):\n    raise Denied\ndef consume(operation, actor):\n    operation(actor)\n", index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), consumer = index.symbols.find(s => s.name === "consume")!, target = index.symbols.find(s => s.name === "guard")!, entry = index.symbols.find(s => s.name === "entry")!, supplied: any = index.relatedCalls(entry.id).find(c => c.expression === "consume")!.argumentFacts![0], call: any = index.relatedCalls(consumer.id).find(c => c.expression === "operation")!
  expect(supplied.callableValue).toEqual(expect.objectContaining({ targetId: target.id, targetSha256: target.sha256, kind: local ? "local" : "module" }))
  expect(call.callableParameter).toEqual(expect.objectContaining({ schemaVersion: "source-callable-parameter/v1", name: "operation" }))
  expect(call.candidateIds).toEqual([target.id])
  expect(content.slice(supplied.callableValue.source.startIndex, supplied.callableValue.source.endIndex)).toBe("guard")
  if (local) expect((target as any).valueCallable.captures.map((c: any) => c.name)).toEqual(["flag"])
})

for (const mode of ["generator", "wrapped", "async"]) test(`local callable values require an ordinary actual owner invocation: ${mode}`, async () => {
  const content = `${mode === "wrapped" ? "@decorate\n" : ""}${mode === "async" ? "async " : ""}def setup(flag, actor):\n${mode === "generator" ? "    yield actor\n" : ""}    def guard(subject):\n        if flag:\n            raise Denied\n        return subject\n    consume(guard, actor)\ndef consume(operation, actor):\n    operation(actor)\n`, index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), source = index.symbols.find(s => s.name === "setup")!, guard = index.symbols.find(s => s.name === "guard")!
  expect(guard.valueCallable?.gap).toBe("source-callable-value-owner-unmodeled")
  expect(index.relatedCalls(source.id).find(c => c.expression === "consume")!.argumentFacts![0]!.callableValue).toBeUndefined()
})

for (const mode of ["ordinary", "receiver-rebound", "cross-receiver", "wrapped-class", "wrapped-owner", "static-target", "async-target", "descriptor", "missing-base", "conditional-expression", "nested-outer", "loop", "plain-arguments"]) test(`early method capture facts stay within ordinary source boundaries: ${mode}`, async () => {
  const invoke = mode === "plain-arguments" ? "self.guard(actor)" : mode === "cross-receiver" ? "actor.guard(self.prepare(actor))" : "self.guard(self.prepare(actor))", statement = mode === "conditional-expression" ? `${invoke} if actor else False` : mode === "nested-outer" ? `outer(${invoke})` : invoke
  const content = `${mode === "wrapped-class" ? "@decorate\n" : ""}class Gate${mode === "missing-base" ? "(Unknown)" : ""}:\n${mode === "wrapped-owner" ? "    @decorate\n" : ""}    def entry(self, actor):\n${mode === "receiver-rebound" ? "        self = actor\n" : ""}${mode === "loop" ? `        while actor:\n            ${statement}\n` : `        ${statement}\n`}    def prepare(self, actor):\n        return actor\n${mode === "static-target" ? "    @staticmethod\n" : ""}    ${mode === "async-target" ? "async " : ""}def guard(self, actor):\n        return actor\n${mode === "descriptor" ? "    def __getattribute__(self, name):\n        return dynamic(name)\n" : ""}`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, call = index.relatedCalls(owner.id, "app.Gate").find(c => c.expression.endsWith(".guard"))!
  if (mode === "ordinary") {
    expect(call.methodCapture).toEqual(expect.objectContaining({ schemaVersion: "source-method-capture/v1", receiver: "self", receiverClass: "app.Gate", method: "guard", sourceCallId: call.id, targetSha256: index.symbols.find(s => s.name === "guard")!.sha256, controls: [] }))
    expect(content.slice(call.methodCapture!.source.startIndex, call.methodCapture!.source.endIndex)).toBe("self.guard")
    expect(call.methodCapture!.argumentEvents).toHaveLength(1)
  } else expect(call.methodCapture).toBeUndefined()
})

for (const mode of ["ordinary", "receiver-rebound", "cross-receiver", "wrapped-class", "static-target", "descriptor", "missing-base"]) test(`field method source proofs retain ordinary receiver boundaries: ${mode}`, async () => {
  const content = `${mode === "wrapped-class" ? "@decorate\n" : ""}class Gate${mode === "missing-base" ? "(Unknown)" : ""}:\n    def entry(self, actor):\n${mode === "receiver-rebound" ? "        self = actor\n" : ""}        ${mode === "cross-receiver" ? "actor" : "self"}.handler = self.guard\n        return self.handler(actor)\n${mode === "static-target" ? "    @staticmethod\n" : ""}    def guard(self, actor):\n        return actor\n${mode === "descriptor" ? "    def __getattribute__(self, name):\n        return dynamic(name)\n" : ""}`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, stores = index.methodStores(owner.id, "app.Gate"), call = index.relatedCalls(owner.id, "app.Gate").find(c => c.expression === "self.handler")!
  if (mode === "ordinary") {
    expect(stores).toHaveLength(1)
    expect(stores[0]).toEqual(expect.objectContaining({ receiver: "self", receiverClass: "app.Gate", field: "handler", method: "guard", targetSha256: index.symbols.find(s => s.name === "guard")!.sha256, controls: [] }))
    expect(call.methodField?.choices[0]?.stores).toEqual(stores)
  } else {
    expect(stores).toEqual([])
    expect(call.methodField).toBeUndefined()
    expect(call.gap).toMatch(/^source-field-method-/)
  }
})

test("imported module instances bind their actual class methods across source roots and aliases", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/store.py", content: "class Table:\n    def get(self, key):\n        return key\n    def get_for(self, key, actor):\n        return key\nRecords = Table()\n" },
    { path: "backend/pkg/entry.py", content: "from pkg.store import Records as Repo\nimport pkg.store as models\ndef entry(key, actor):\n    first = Repo.get(key)\n    second = models.Records.get_for(key, actor)\n    unknown.get(key)\n    return first\n" },
    { path: "decoy.py", content: "class Table:\n    def get(self, key):\n        return None\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  for (const [expression, method] of [["Repo.get", "get"], ["models.Records.get_for", "get_for"]]) {
    const call = index.calls.find(c => c.expression === expression)!
    expect(call.resolution).toBe("resolved")
    expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === `backend.pkg.store.Table.${method}`)!.id])
    expect(call.receiverClass).toBe("backend.pkg.store.Table")
  }
  expect(index.calls.find(c => c.expression === "unknown.get")!.resolution).toBe("unresolved")
})

test("unique module receiver proofs retain the declaration bytes and never leak through shadowing", async () => {
  const store = "class Registry:\n    def find(self, owner_id):\n        return owner_id\nReady = Registry()\nRebound = Registry()\nRebound = unknown()\n"
  const index = await buildStructureIndex([
    { path: "lib/catalog.py", content: store },
    { path: "entry.py", content: "from lib.catalog import Ready as repo\nfrom lib.catalog import Rebound\ndef entry(actor):\n    return repo.find(actor.id)\ndef shadow(repo):\n    return repo.find(0)\ndef rebound():\n    return Rebound.find(0)\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.qualifiedName === "entry.entry")!
  const call: any = index.relatedCalls(entry.id)[0]!
  expect(call.receiverBinding).toEqual({ schemaVersion: "source-module-instance/v1", name: "lib.catalog.Ready", className: "lib.catalog.Registry", classSha256: index.symbols.find(s => s.qualifiedName === "lib.catalog.Registry")!.sha256, source: { path: "lib/catalog.py", sha256: index.symbols.find(s => s.qualifiedName === "lib.catalog.Registry")!.sha256, startLine: 4, endLine: 4 } })
  for (const name of ["shadow", "rebound"]) expect((index.relatedCalls(index.symbols.find(s => s.qualifiedName === `entry.${name}`)!.id)[0] as any).receiverBinding).toBeUndefined()
})

test("consumer alias rebindings and source-visible module attribute writes withdraw receiver proofs", async () => {
  for (const change of ["repo = unknown()\n", "if flag:\n    repo = unknown()\n", "def change():\n    global repo\n    repo = unknown()\n", "import catalog as storage\nstorage.Ready = unknown()\n"]) {
    const index = await buildStructureIndex([
      { path: "catalog.py", content: "class Registry:\n    def find(self):\n        return True\nReady = Registry()\n" },
      { path: "entry.py", content: "from catalog import Ready as repo\n" + change + "def entry():\n    return repo.find()\n" },
    ], { repository: "anonymous", sourceRef: "r" })
    const call: any = index.relatedCalls(index.symbols.find(s => s.qualifiedName === "entry.entry")!.id)[0]!
    expect(call.receiverBinding).toBeUndefined()
    expect(call.resolution).toBe("unresolved")
  }
})

test("local module instances bind without inferring dynamic or rebound receivers", async () => {
  const content = "class Table:\n    def get(self, key):\n        return key\nReady = Table()\nDynamic = factory()\nRebound = Table()\nRebound = other()\nConditional = Table()\nif flag:\n    Conditional = other()\ndef entry(key):\n    Ready.get(key)\n    Dynamic.get(key)\n    Rebound.get(key)\n    Conditional.get(key)\n"
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "Ready.get")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Table.get")!.id])
  for (const name of ["Dynamic", "Rebound", "Conditional"]) expect(index.calls.find(c => c.expression === `${name}.get`)!.resolution).toBe("unresolved")
})

test("parameters and local values shadow imported instances while typed local constructors remain usable", async () => {
  const index = await buildStructureIndex([
    { path: "store.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\n" },
    { path: "entry.py", content: "from store import Store\nclass Other:\n    def get(self):\n        return False\ndef parameter(Store):\n    return Store.get()\ndef literal():\n    Store = None\n    return Store.get()\ndef dynamic():\n    Store = factory()\n    return Store.get()\ndef local():\n    Store = Other()\n    return Store.get()\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["parameter", "literal", "dynamic"]) {
    const owner = index.symbols.find(s => s.qualifiedName === `entry.${name}`)!
    expect(index.relatedCalls(owner.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
  }
  const local = index.symbols.find(s => s.qualifiedName === "entry.local")!
  expect(index.relatedCalls(local.id).find(c => c.expression === "Store.get")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "entry.Other.get")!.id])
})

test("an imported instance does not pick one of two source modules with the same suffix", async () => {
  const content = "class Table:\n    def get(self):\n        return True\nStore = Table()\n"
  const index = await buildStructureIndex([{ path: "one/pkg/store.py", content }, { path: "two/pkg/store.py", content }, { path: "entry.py", content: "from pkg.store import Store\ndef entry():\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
})

test("non-call module rebinding and a loop-local name do not leak the original instance", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\nfor Store in values:\n    pass\nClean = Table()\ndef entry():\n    Store.get()\n    for Clean in values:\n        Clean.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["Store", "Clean"]) expect(index.calls.find(c => c.expression === `${name}.get`)!.resolution).toBe("unresolved")
})

test("instance declaration file changes invalidate candidate dependencies even when its class file is unchanged", async () => {
  const files = [{ path: "table.py", content: "class Table:\n    def get(self):\n        return True\n" }, { path: "binding.py", content: "from table import Table\nStore = Table(1)\n" }, { path: "entry.py", content: "from binding import Store\ndef entry():\n    return Store.get()\n" }]
  const first = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" })
  const second = await buildStructureIndex(files.map(f => f.path === "binding.py" ? { ...f, content: f.content.replace("Table(1)", "Table(2)") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(second.calls.find(c => c.expression === "Store.get")!.resolution).toBe("resolved")
  expect(second.candidateRevision("table.Table", "get")).not.toBe(first.candidateRevision("table.Table", "get"))
})

test("local imports and nested declarations shadow a module instance", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\ndef imported():\n    from unknown import Store\n    return Store.get()\ndef nested():\n    class Store:\n        pass\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["imported", "nested"]) expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === `app.${name}`)!.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
})

test("conditional imports and global writes invalidate the initial module instance", async () => {
  for (const changed of ["if flag:\n    from unknown import Store\n", "def change():\n    global Store\n    Store = unknown()\n"]) {
    const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\n" + changed + "def entry():\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
    expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
  }
})

test("FastAPI constructor aliases, constant prefixes and includes bind the decorated handler", async () => {
  const index = await buildStructureIndex([
    { path: "api/items.py", content: 'from fastapi import APIRouter as Router\nBASE = "/items"\nrouter = Router(prefix=BASE)\n@router.post("/create")\ndef create_item(request):\n    return request\n' },
    { path: "app.py", content: 'import fastapi as web\nfrom api.items import router as items\napp = web.FastAPI()\napp.include_router(items, prefix="/v1")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const handler = index.symbols.find(s => s.qualifiedName === "api.items.create_item")!
  expect(index.routes).toContainEqual(expect.objectContaining({ method: "POST", path: "/v1/items/create", candidateIds: [handler.id], model: "fastapi-source-router/v1" }))
  expect(index.routes.every(r => r.handlerExpression === "create_item")).toBe(true)
})

test("dynamic prefixes and pseudo routers remain gaps, while duplicate real bindings stay visible", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import APIRouter\nrouter = APIRouter()\ndynamic = APIRouter(prefix=get_prefix())\nfake = Logger()\n@router.post("/items")\ndef first(x):\n    return x\n@router.post("/items")\ndef second(x):\n    return x\n@dynamic.post("/hidden")\ndef hidden(x):\n    return x\n@fake.post("/fake")\ndef decoy(x):\n    return x\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["/items", "/items"])
  expect(index.diagnostics).toContainEqual(expect.objectContaining({ path: "app.py", code: "route-prefix-dynamic", line: 11 }))
  expect(index.diagnostics).toContainEqual(expect.objectContaining({ path: "app.py", code: "route-router-unresolved", line: 14 }))
})
test("unknown include_router parents cannot promote a child into a mounted request route", async () => {
  for (const constructor of ["Fake()", "factory()", "unknown"]) {
    const index = await buildStructureIndex([{ path: "app.py", content: `from fastapi import APIRouter\nrouter = APIRouter()\napp = ${constructor}\napp.include_router(router)\n@router.post("/work")\ndef endpoint():\n    return True\n` }], { repository: "anonymous", sourceRef: "r" })
    expect(index.routes).toEqual([])
    expect(index.diagnostics).toContainEqual(expect.objectContaining({ handlerId: index.symbols.find(s => s.name === "endpoint")!.id, code: "route-prefix-dynamic" }))
  }
})
test("an imported dependency cannot retain a function replaced in its defining module", async () => {
  const index = await buildStructureIndex([{ path: "auth.py", content: "def verify():\n    return True\nverify = replacement\n" }, { path: "app.py", content: 'from fastapi import APIRouter, Depends\nfrom auth import verify\nrouter = APIRouter()\n@router.post("/work")\ndef endpoint(actor=Depends(verify)):\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.requestDependencies(index.symbols.find(s => s.name === "endpoint")!.id)).toContainEqual(expect.objectContaining({ resolution: "unresolved", gap: "framework-dependency-target-rebound" }))
})

test("cross-root import aliases and multiple static mounts preserve all route alternatives", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/items.py", content: 'from fastapi import APIRouter\nrouter = APIRouter(prefix="/items")\n@router.post("/create")\ndef create(x):\n    return x\n' },
    { path: "backend/pkg/main.py", content: 'from fastapi import FastAPI\nfrom pkg.items import router\napp = FastAPI()\napp.include_router(router, prefix="/v1")\napp.include_router(router, prefix="/v2")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["/v1/items/create", "/v2/items/create"])
})

test("runtime settings and traversal order do not change source identities or structural revisions", async () => {
  const files = [{ path: "app.py", content: "def outer(x):\n    return inner(x)\ndef inner(x):\n    return x\n" }, { path: "other.py", content: "def unrelated():\n    return False\n" }]
  const first = { repository: "fixture", sourceRef: "r", sourceRoot: "D:/a", maxToolCalls: 24 }
  const a = await buildStructureIndex(files, first)
  const second = { ...first, sourceRoot: "D:/b", maxToolCalls: 64 }
  const b = await buildStructureIndex([...files].reverse(), second)
  expect(a.symbols.map(s => s.id)).toEqual(b.symbols.map(s => s.id))
  expect(a.calls.map(c => c.id)).toEqual(b.calls.map(c => c.id))
  expect(a.revision).toBe(b.revision)
  expect(a.candidateRevision("app.outer", "outer")).toBe(b.candidateRevision("app.outer", "outer"))
  const changedRef = await buildStructureIndex(files, { ...first, sourceRef: "other" })
  const changedBytes = await buildStructureIndex([{ ...files[0]!, content: files[0]!.content.replace("return x", "return False") }, files[1]!], first)
  expect(changedRef.symbols[0]!.id).not.toBe(a.symbols[0]!.id)
  expect(changedRef.revision).not.toBe(a.revision)
  expect(changedBytes.symbols[0]!.id).not.toBe(a.symbols[0]!.id)
})

test("Python alias and inheritance bind actual overrides, not unique lexical names", async () => {
  const index = await buildStructureIndex([
    { path: "pkg/base.py", content: "class Base:\n    def create(self, request):\n        return request\n" },
    { path: "pkg/other.py", content: "def create(request):\n    return None\n# def fake():\n" },
    { path: "pkg/view.py", content: "from pkg.base import Base as Parent\nclass View(Parent):\n    def create(self, request):\n        return self.check(request)\n    def check(self, request):\n        return request\nclass Child(View):\n    pass\n" },
  ], { repository: "fixture", sourceRef: "r" })
  expect(index.lookupMethod("pkg.view.Child", "create").map(s => s.qualifiedName)).toEqual(["pkg.view.View.create"])
  expect(index.symbols.some(s => s.name === "fake")).toBe(false)
  const call = index.calls.find(c => c.expression === "self.check")!
  expect(call.resolution).toBe("resolved")
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "pkg.view.View.check")!.id])
  expect(call.arguments).toEqual(["request"])
  expect(index.lookupMethod("pkg.other", "create")).toEqual([])
})
test("Go imported alias, receiver type and returned object remain source-bound", async () => {
  const index = await buildStructureIndex([
    { path: "svc/service.go", content: "package svc\ntype Service struct {}\nfunc (s *Service) Create(x *Item) *Item { return x }\nfunc Create(x *Item) *Item { return x }\n" },
    { path: "api/handler.go", content: 'package api\nimport alias "example/svc"\nfunc Handle(s *alias.Service, x *alias.Item) { s.Create(x); alias.Create(x); unknown.Create(x) }\n' },
  ], { repository: "fixture", sourceRef: "r" })
  const method = index.calls.find(c => c.expression === "s.Create")!
  expect(method.resolution).toBe("resolved")
  expect(index.symbols.find(s => s.id === method.candidateIds[0])!.qualifiedName).toBe("svc.Service.Create")
  expect(index.calls.find(c => c.expression === "alias.Create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "svc.Create")!.id])
  expect(index.calls.find(c => c.expression === "unknown.Create")!.resolution).toBe("unresolved")
  expect(index.symbols.find(s => s.qualifiedName === "svc.Service.Create")!.returns).toContain("*Item")
})
test("candidate revision detects new override while old read file is unchanged", async () => {
  const files = [{ path: "base.py", content: "class Base:\n    def create(self):\n        return self\n" }, { path: "child.py", content: "from base import Base\nclass Child(Base):\n    pass\n" }]
  const a = await buildStructureIndex(files, { repository: "fixture", sourceRef: "r" })
  files[1]!.content = "from base import Base\nclass Child(Base):\n    def create(self):\n        return None\n"
  const b = await buildStructureIndex(files, { repository: "fixture", sourceRef: "r" })
  expect(a.candidateRevision("child.Child", "create")).not.toBe(b.candidateRevision("child.Child", "create"))
  expect(a.lookupMethod("child.Child", "create")[0]!.path).toBe("base.py")
  expect(b.lookupMethod("child.Child", "create")[0]!.path).toBe("child.py")
})
test("route callbacks bind their actual imported handler and preserve middleware/parameter syntax", async () => {
  const index = await buildStructureIndex([{ path: "api/route.go", content: 'package api\nimport handlers "example/handler"\nfunc Routes(m Router) { m.Post("/items", token(), reader(), handlers.Create) }\n' }, { path: "handler/create.go", content: "package handler\nfunc Create(ctx *Context) {}\n" }, { path: "other/create.go", content: "package other\nfunc Create() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes).toContainEqual(expect.objectContaining({ method: "POST", path: "/items", handlerExpression: "handlers.Create", candidateIds: [index.symbols.find(s => s.qualifiedName === "handler.Create")!.id], middlewareExpressions: ["token()", "reader()"] }))
  expect(index.routes.some(r => r.candidateIds.includes(index.symbols.find(s => s.qualifiedName === "other.Create")!.id))).toBe(false)
})
test("declared returned-object assignment binds a receiver, while dynamic returns stay unresolved", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Item:\n    def check(self):\n        return True\ndef lookup() -> Item:\n    return Item()\ndef dynamic():\n    return external()\ndef create():\n    selected = lookup()\n    selected.check()\n    other = dynamic()\n    other.check()\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "selected.check")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Item.check")!.id])
  expect(index.calls.find(c => c.expression === "other.check")!.resolution).toBe("unresolved")
})
test("chained Go combo registration uses enclosing group paths without inventing a path argument", async () => {
  const index = await buildStructureIndex([{ path: "api.go", content: 'package api\nimport h "example/handler"\nfunc Routes(m Router) { m.Group("/items", func() { m.Combo("").Get(h.List).Post(token(), h.Create) }) }\n' }, { path: "handler/h.go", content: "package handler\nfunc Create() {}\nfunc List() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes.find(r => r.method === "POST")).toMatchObject({ path: "/items", handlerExpression: "h.Create", middlewareExpressions: ["token()"] })
})
test("multiline Go chained verbs keep the exact nested route, middleware and handler", async () => {
  const index = await buildStructureIndex([{ path: "api.go", content: 'package api\nimport h "example/handler"\nfunc Routes(m Router) {\n m.Group("/objects", func() {\n  m.Group("/{id}", func() {\n   m.Combo("").Get(h.List).\n    Post(token(), h.Create)\n  })\n })\n}\n' }, { path: "handler/h.go", content: "package handler\nfunc Create() {}\nfunc List() {}\n" }], { repository: "fixture", sourceRef: "r" })
  const create = index.symbols.find(s => s.qualifiedName === "handler.Create")!
  expect(index.routes.filter(r => r.method === "POST")).toEqual([expect.objectContaining({ path: "/objects/{id}", handlerExpression: "h.Create", candidateIds: [create.id], middlewareExpressions: ["token()"], startLine: 6, endLine: 7 })])
})
test("permission class aliases resolve only to their actual imported class", async () => {
  const index = await buildStructureIndex([{ path: "permissions.py", content: "class P:\n    def has_permission(self):\n        return True\n" }, { path: "other.py", content: "class P:\n    def has_permission(self):\n        return False\n" }, { path: "view.py", content: "from permissions import P as Alias\nclass V:\n    permission_classes = (Alias,)\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.resolveName("Alias", "view.py").map(s => s.qualifiedName)).toEqual(["permissions.P"])
})

test("a qualified Go import keeps its longest actual module match instead of a shorter homonym", async () => {
  const index = await buildStructureIndex([{ path: "api/api.go", content: 'package api\nimport h "example/a/handler"\nfunc Entry() { h.Create() }\n' }, { path: "a/handler/create.go", content: "package handler\nfunc Create() {}\n" }, { path: "handler/create.go", content: "package handler\nfunc Create() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "h.Create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "a/handler.Create")!.id])
})

test("Python literal prefixes preserve source router registrations and dynamic formatted paths stay gaps", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/views.py", content: "class APIView:\n    pass\n" }, { path: "app.py", content: 'from rest_framework.views import APIView\nclass View(APIView):\n    pass\nrouter.register(r"items", View)\nrouter.register(u\'other\', View)\nrouter.register(f"{name}", View)\n' }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["items", "other"])
})

test("inherited self calls retain the actual receiver for downstream overrides", async () => {
  const index = await buildStructureIndex([{ path: "base.py", content: "class Base:\n    def create(self):\n        return self.check()\n    def check(self):\n        return True\n" }, { path: "view.py", content: "from base import Base\nclass View(Base):\n    def check(self):\n        return False\n" }], { repository: "fixture", sourceRef: "r" })
  const create = index.lookupMethod("view.View", "create")[0]!
  const call: any = index.relatedCalls(create.id, "view.View")[0]!
  expect(call.receiverClass).toBe("view.View")
  expect(call.candidateIds).toEqual([index.lookupMethod("view.View", "check")[0]!.id])
})

test("zero-argument super follows the actual C3 receiver after the defining class", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class First:\n    def create(self):\n        return super().create()\nclass Base:\n    def create(self):\n        return self.check()\nclass Other:\n    def create(self):\n        return False\nclass View(First, Base):\n    def check(self):\n        return True\nclass Alternate(First, Other):\n    pass\nclass Dynamic(First):\n    def create(self):\n        return super(unknown, self).create()\n" }], { repository: "fixture", sourceRef: "r" })
  const first = index.lookupMethod("app.View", "create")[0]!
  const call = index.relatedCalls(first.id, "app.View").find(c => c.expression === "super().create")!
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Base.create")!.id])
  expect(call.receiverClass).toBe("app.View")
  expect(index.relatedCalls(first.id, "app.Alternate").find(c => c.expression === "super().create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Other.create")!.id])
  expect(index.relatedCalls(index.lookupMethod("app.Dynamic", "create")[0]!.id, "app.Dynamic").find(c => c.expression === "super(unknown, self).create")!.resolution).toBe("unresolved")
})

test("current route middleware facts retain actual registration context and constructor/entry sources", async () => {
  const index = await buildStructureIndex([
    { path: "api.py", content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/work")\ndef endpoint():\n    return True\n' },
    { path: "guards.py", content: "class Guard:\n    def __init__(self, app, flag=False):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        await self.app(scope, receive, send)\n" },
    { path: "main.py", content: 'from fastapi import FastAPI\nfrom api import router\nfrom guards import Guard as Filter\napp = FastAPI()\nif enabled:\n    app.add_middleware(Filter, flag=True)\napp.include_router(router, prefix="/v1")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const middleware = (index as any).requestMiddleware(index.routes[0]!.id)
  expect(middleware).toHaveLength(1)
  expect(middleware[0]).toMatchObject({ sourceCallId: index.calls.find(c => c.expression === "app.add_middleware")!.id, expression: "Filter", qualifiedName: "guards.Guard", arguments: ["flag=True"], receiverClass: "guards.Guard", registrationContext: [{ kind: "if_statement", expression: "enabled" }], executionOrder: "unproven" })
  expect(middleware[0].methodCandidates.map((m: any) => index.symbols.find(s => s.id === m.candidateId)!.qualifiedName)).toEqual(["guards.Guard.__init__", "guards.Guard.__call__"])
  expect(middleware[0].source).toMatchObject({ path: "main.py", startLine: 6, endLine: 6 })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
})

test("middleware metadata never selects an unrelated namesake or a rebound class", async () => {
  for (const replace of ["", "Filter = replacement\n"]) {
    const index = await buildStructureIndex([
      { path: "main.py", content: 'from fastapi import FastAPI\nfrom external import Cors as Filter\napp = FastAPI()\n' + replace + 'app.add_middleware(Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
      { path: "decoy.py", content: "class Cors:\n    async def __call__(self, scope, receive, send):\n        return None\n" },
    ], { repository: "anonymous", sourceRef: "r" })
    const middleware = (index as any).requestMiddleware(index.routes[0]!.id)
    expect(middleware[0].methodCandidates).toEqual([])
    expect(middleware[0].gap).toBe(replace ? "framework-middleware-target-rebound" : "framework-middleware-source-missing")
  }
})

test("a source alias that modifies the real application cannot leave its route closed", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = app\nalias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
})

test("middleware parameter shadowing cannot borrow a module class candidate", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\nclass Filter:\n    async def __call__(self, scope, receive, send):\n        return None\napp = FastAPI()\ndef configure(Filter):\n    app.add_middleware(Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware.methodCandidates).toEqual([])
  expect(middleware.gap).toBe("framework-middleware-target-shadowed")
})

test("a source-root-qualified BaseHTTPMiddleware still offers the actual dispatch override", async () => {
  const index = await buildStructureIndex([
    { path: "vendor/starlette/middleware/base.py", content: "class BaseHTTPMiddleware:\n    def __init__(self, app):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        return await self.dispatch(scope, self.app)\n    async def dispatch(self, request, call_next):\n        return await call_next(request)\n" },
    { path: "app.py", content: 'from fastapi import FastAPI\nfrom starlette.middleware.base import BaseHTTPMiddleware\nclass Header(BaseHTTPMiddleware):\n    async def dispatch(self, request, call_next):\n        response = await call_next(request)\n        response.headers.update(extra_headers)\n        return response\napp = FastAPI()\napp.add_middleware(Header)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware.methodCandidates.map(m => index.symbols.find(s => s.id === m.candidateId)!.qualifiedName)).toContain("app.Header.dispatch")
  expect(middleware.receiverClass).toBe("app.Header")
  expect(middleware.gap).toBeUndefined()
})

test("middleware configuration preserves repeated positional expressions after its target", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\nclass Filter:\n    async def __call__(self, scope, receive, send):\n        return None\napp = FastAPI()\napp.add_middleware(Filter, Filter, option=Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.requestMiddleware(index.routes[0]!.id)[0]!.arguments).toEqual(["Filter", "option=Filter"])
})

test("a rebound potential application alias is explicitly uncertain rather than a proven registration", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = app\nalias = replacement\nalias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware).toMatchObject({ registrationBinding: "possible", gap: "framework-middleware-router-alias-unresolved" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-alias-unresolved")
})

test("cross-root imported application aliases retain the real modification and its binding proof", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/main.py", content: 'from fastapi import FastAPI\napp = FastAPI()\n@app.post("/work")\ndef endpoint():\n    return True\n' },
    { path: "backend/pkg/binding.py", content: "from pkg.main import app\nalias = app\n" },
    { path: "backend/pkg/configure.py", content: "from pkg.binding import alias\nalias.add_middleware(Unknown)\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
  expect(index.requestMiddleware(index.routes[0]!.id)).toContainEqual(expect.objectContaining({ routerName: "backend.pkg.main.app", registrationBinding: "resolved", source: expect.objectContaining({ path: "backend/pkg/configure.py" }) }))
})

test("a function's global alias write retains its possible application modification", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = None\ndef configure():\n    global alias\n    alias = app\n    alias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-alias-unresolved")
  expect(index.requestMiddleware(index.routes[0]!.id)[0]!).toMatchObject({ registrationBinding: "possible", registrationContext: [{ kind: "function_definition", expression: "configure" }] })
})

const drfSources = [
  { path: "rest_framework/decorators.py", content: "def action(methods=None, detail=None, url_path=None, **kwargs):\n    def decorator(func):\n        func.mapping = MethodMapper(func, methods)\n        return func\n    return decorator\nclass MethodMapper(dict):\n    def __init__(self, action, methods):\n        for method in methods:\n            self[method] = action.__name__\n    def post(self, func):\n        return func\n" },
  { path: "rest_framework/routers.py", content: "class BaseRouter:\n    def register(self, prefix, viewset):\n        return viewset\nclass Router(BaseRouter):\n    def get_routes(self, viewset):\n        return viewset.get_extra_actions()\n    def _get_dynamic_route(self, route, action):\n        return action.mapping\n    def get_method_map(self, viewset, mapping):\n        return mapping\n    def get_urls(self):\n        return []\n" },
  { path: "rest_framework/viewsets.py", content: "class ViewSet:\n    def as_view(cls, actions=None):\n        return actions\n    def get_extra_actions(cls):\n        return []\n    def dispatch(self, request):\n        return request\n" },
]
test("DRF action declarations retain HTTP mapping sources and actual inherited receiver", async () => {
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content: "from rest_framework.decorators import action as route\nfrom rest_framework.viewsets import ViewSet\nfrom rest_framework.routers import Router\nclass Parent(ViewSet):\n    @route(methods=['GET'], detail=True, url_path='fetch')\n    def fetch(self, request):\n        return request\n    @fetch.mapping.post\n    def replace(self, request):\n        return request\nclass Child(Parent):\n    pass\nrouter = Router()\nrouter.register('items', Child)\n" }], { repository: "anonymous", sourceRef: "r" })
  const facts = (index as any).requestActions("app.Child")
  expect(facts).toHaveLength(1)
  expect(facts[0]).toMatchObject({ receiverClass: "app.Child", actionName: "fetch", detail: true, urlPath: "fetch", invocation: "unproven", model: "drf-source-action/v1" })
  expect(facts[0].methodMappings.map((m: any) => [m.method, m.actionName, m.candidateIds])).toEqual([["GET", "fetch", [index.lookupMethod("app.Child", "fetch")[0]!.id]], ["POST", "replace", [index.lookupMethod("app.Child", "replace")[0]!.id]]])
  expect(facts[0].sourceCallId).toBe(index.calls.find(c => c.expression === "route")!.id)
  expect(facts[0].routeIds).toEqual([index.routes[0]!.id])
  expect(facts[0].sourceCandidates.map((c: any) => index.symbols.find(s => s.id === c.candidateId)!.qualifiedName)).toContain("rest_framework.viewsets.ViewSet.as_view")
  expect(facts[0].gap).toBeUndefined()
  facts[0].methodMappings[0].method = "DELETE"
  expect((index as any).requestActions("app.Child")[0].methodMappings[0].method).toBe("GET")
})
test("an undecorated override removes the inherited DRF action instead of borrowing its HTTP mapping", async () => {
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content: "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass Parent(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\nclass Child(Parent):\n    def fetch(self, request):\n        return request\n" }], { repository: "anonymous", sourceRef: "r" })
  expect((index as any).requestActions("app.Parent")).toHaveLength(1)
  expect((index as any).requestActions("app.Child")).toEqual([])
})
for (const [change, code] of [["action = replacement\n", "framework-action-constructor-rebound"], ["methods=verbs", "framework-action-methods-dynamic"], ["permission_classes=[Other]", "framework-action-options-unmodeled"], ["@wrapper\n    ", "framework-action-wrapper-unmodeled"]] as const) test(`DRF mapping retains ${code}`, async () => {
  let content = "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass View(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n"
  content = change.includes("replacement") ? content.replace("class View", change + "class View") : change.startsWith("@") ? content.replace("@action", change + "@action") : content.replace("methods=['get']", change)
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect((index as any).requestActions("app.View")[0].gap).toBe(code)
})
test("a missing qualified action source never borrows a same-named local factory", async () => {
  const index = await buildStructureIndex([...drfSources.filter(f => !f.path.endsWith("decorators.py")), { path: "decoy.py", content: "def action(x):\n    return x\n" }, { path: "app.py", content: "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass View(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).requestActions("app.View")[0]
  expect(fact.gap).toBe("framework-action-source-missing")
  expect(fact.sourceCandidates.some((c: any) => index.symbols.find(s => s.id === c.candidateId)?.qualifiedName === "decoy.action")).toBe(false)
})
test("located action and mapper bodies do not prove the declared HTTP mapping", async () => {
  const index = await buildStructureIndex([...drfSources.map(f => f.path.endsWith("decorators.py") ? { ...f, content: "def action(methods=None, detail=None):\n    return None\nclass MethodMapper:\n    def __init__(self, action, methods):\n        return None\n" } : f), { path: "app.py", content: "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass View(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).requestActions("app.View")[0]
  expect(fact).toMatchObject({ mappingBinding: "unproven", invocation: "unproven" })
  expect(fact.sourceCandidates.map((c: any) => index.symbols.find(s => s.id === c.candidateId)!.qualifiedName)).toContain("rest_framework.decorators.action")
})
test("an inherited method mapper resolves its mapped name on the current request class", async () => {
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content: "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass Parent(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n    @fetch.mapping.post\n    def replace(self, request):\n        return request\nclass Child(Parent):\n    def replace(self, request):\n        return None\n" }], { repository: "anonymous", sourceRef: "r" })
  const mapping = (index as any).requestActions("app.Child")[0].methodMappings.find((m: any) => m.method === "POST")
  expect(mapping.candidateIds).toEqual([index.lookupMethod("app.Child", "replace")[0]!.id])
  expect(mapping.sourceId).toBe(index.lookupMethod("app.Parent", "replace")[0]!.id)
})
for (const [change, code] of [["    action = replacement\n", "framework-action-constructor-shadowed"], ["View.fetch = replacement\n", "framework-action-receiver-binding-unresolved"]] as const) test(`source class binding retains ${code}`, async () => {
  const content = "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass View(ViewSet):\n" + (change.startsWith(" ") ? change : "") + "    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n" + (change.startsWith(" ") ? "" : change)
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect((index as any).requestActions("app.View")[0].gap).toBe(code)
})
test("a register namesake retains a DRF route lead with an unproven receiver", async () => {
  const index = await buildStructureIndex([...drfSources, { path: "app.py", content: "from rest_framework.decorators import action\nfrom rest_framework.viewsets import ViewSet\nclass View(ViewSet):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\nclass Fake:\n    def register(self, prefix, viewset):\n        return None\nrouter = Fake()\nrouter.register('items', View)\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-drf-router-binding-unresolved")
  expect((index as any).requestActions("app.View")[0].routeIds).toEqual([index.routes[0]!.id])
})
test("a source-proven class identity subscription preserves inherited dispatch through aliases", async () => {
  const index = await buildStructureIndex([
    { path: "base.py", content: "class Base:\n    def __class_getitem__(cls, *args, **kwargs):\n        return cls\n    def dispatch(self, request):\n        return request\nclass Parent(Base):\n    pass\n" },
    { path: "app.py", content: "from base import Parent as Generic\nclass View(Generic[Unknown]):\n    pass\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  expect(index.lookupMethod("app.View", "dispatch").map(s => s.qualifiedName)).toEqual(["base.Base.dispatch"])
  expect(index.linearize("app.View")).toEqual(["app.View", "base.Parent", "base.Base"])
})
for (const body of ["return Other", "audit()\n        return cls", "if flag:\n            return cls\n        return Other"]) test(`a class subscription with ${body.split("\n")[0]} cannot borrow the unsubscribed base`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def __class_getitem__(cls, item):\n        " + body + "\n    def dispatch(self, request):\n        return request\nclass View(Base[Unknown]):\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.lookupMethod("app.View", "dispatch")).toEqual([])
})
for (const declaration of ["async def __class_getitem__(cls, item):", "def __class_getitem__(cls, item):"]) test(`class subscription respects ${declaration.startsWith("async") ? "async return" : "an explicit metaclass"}`, async () => {
  const content = "class Meta:\n    def __getitem__(self, item):\n        return Other\nclass Base" + (declaration.startsWith("async") ? ":" : "(metaclass=Meta):") + "\n    " + declaration + "\n        return cls\n    def dispatch(self, request):\n        return request\nclass View(Base[Unknown]):\n    pass\n"
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect(index.lookupMethod("app.View", "dispatch")).toEqual([])
})

const classDecoratorSources = [
  { path: "helpers.py", content: "def isolate(cls, name):\n    return getattr(cls, name)\n" },
  { path: "wrappers.py", content: "from helpers import isolate\ndef factory(**options):\n    def apply(cls):\n        isolate(cls, 'handle')\n        return cls\n    return apply\ndef configure(flag=True):\n    return flag\ndef direct(cls):\n    return cls\n" },
]
test("generic class decorators retain exact factories, returned closure and argument source without adopting a transformation", async () => {
  const index = await buildStructureIndex([...classDecoratorSources, { path: "app.py", content: "from wrappers import factory as transform, configure\n@transform(handle=configure(flag=False))\nclass Parent:\n    def handle(self):\n        return True\nclass Child(Parent):\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  const parent = index.symbols.find(s => s.qualifiedName === "app.Parent")!, fact = (index as any).classDecorators("app.Child")[0]
  expect(parent.decorators?.[0]).toMatchObject({ expression: "transform", sourceCallId: index.calls.find(c => c.expression === "transform")!.id })
  expect(fact).toMatchObject({ receiverClass: "app.Child", declaringClass: "app.Parent", sourceId: parent.id, expression: "transform", arguments: ["handle=configure(flag=False)"], invocation: "unproven", transformation: "unproven", model: "source-class-decorator/v1" })
  const candidates = fact.sourceCandidates.map((c: any) => [c.role, index.symbols.find(s => s.id === c.candidateId)!.qualifiedName])
  expect(candidates).toContainEqual(["factory", "wrappers.factory"])
  expect(candidates).toContainEqual(["returned-callable", "wrappers.factory.apply"])
  expect(candidates).toContainEqual(["argument-call", "wrappers.configure"])
  expect(candidates).toContainEqual(["helper", "helpers.isolate"])
  expect(fact.gap).toBeUndefined()
  expect(parent.attributes.bindingWrapped).toBe("true")
  fact.sourceCandidates.length = 0
  expect((index as any).classDecorators("app.Child")[0].sourceCandidates.length).toBeGreaterThan(0)
})
test("a bare class decorator retains its declaration rather than inventing an explicit call", async () => {
  const index = await buildStructureIndex([...classDecoratorSources, { path: "app.py", content: "from wrappers import direct\n@direct\nclass View:\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).classDecorators("app.View")[0]
  expect(fact.sourceCallId).toBeUndefined()
  expect(fact.sourceCandidates.map((c: any) => [c.role, index.symbols.find(s => s.id === c.candidateId)!.qualifiedName])).toEqual([["decorator", "wrappers.direct"]])
  expect(fact.invocation).toBe("unproven")
})
test("class decorator sources never borrow a same-name factory from another module", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "from missing import factory\n@factory()\nclass View:\n    pass\n" }, { path: "decoy.py", content: "def factory():\n    return None\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).classDecorators("app.View")[0]
  expect(fact.sourceCandidates).toEqual([])
  expect(fact.gap).toBe("source-class-decorator-source-missing")
})
for (const [change, code] of [["factory = replacement\n", "source-class-decorator-target-rebound"], ["@factory()[key]\n", "source-class-decorator-target-dynamic"], ["if flag:\n    @factory()\n    class View:\n        pass\n", "source-class-decorator-definition-binding-unresolved"]] as const) test(`generic class decorator keeps ${code}`, async () => {
  const content = "from wrappers import factory\n" + (change.startsWith("if") ? change : (change.startsWith("@") ? change : change + "@factory()\n") + "class View:\n    pass\n")
  const index = await buildStructureIndex([...classDecoratorSources, { path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect((index as any).classDecorators("app.View")[0].gap).toBe(code)
})
test("a lexically shadowed class decorator does not borrow the imported factory", async () => {
  const index = await buildStructureIndex([...classDecoratorSources, { path: "app.py", content: "from wrappers import factory\ndef build(factory):\n    @factory()\n    class View:\n        pass\n    return View\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).classDecorators("app.build.View")[0]
  expect(fact.gap).toBe("source-class-decorator-definition-binding-unresolved")
  expect(fact.sourceCandidates).toEqual([])
})
for (const declaration of ["async def factory():", "@unknown\ndef factory():", "def factory():"]) test(`class decorator callable source respects ${declaration.split("\n")[0]}`, async () => {
  const source = declaration + "\n    return external\n"
  const index = await buildStructureIndex([{ path: "wrappers.py", content: source }, { path: "app.py", content: "from wrappers import factory\n@factory()\nclass View:\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  expect((index as any).classDecorators("app.View")[0].gap).toBe(declaration.startsWith("def") ? "source-class-decorator-return-unresolved" : "source-class-decorator-callable-binding-unresolved")
})
test("a reassigned returned local callable is not offered as the original closure", async () => {
  const index = await buildStructureIndex([{ path: "wrappers.py", content: "def factory():\n    def apply(cls):\n        return cls\n    apply = external\n    return apply\n" }, { path: "app.py", content: "from wrappers import factory\n@factory()\nclass View:\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  const fact = (index as any).classDecorators("app.View")[0]
  expect(fact.gap).toBe("source-class-decorator-return-unresolved")
  expect(fact.sourceCandidates.some((c: any) => c.role === "returned-callable")).toBe(false)
})
test("repeated exact receiver definitions keep their sources as ambiguous leads with a named binding gap", async () => {
  const index = await buildStructureIndex([...classDecoratorSources, { path: "app.py", content: "from wrappers import factory\n@factory()\nclass View:\n    pass\n@factory()\nclass View:\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  const facts = (index as any).classDecorators("app.View")
  expect(facts).toHaveLength(2)
  expect(facts.every((f: any) => f.gap === "source-class-decorator-receiver-binding-unresolved" && f.invocation === "unproven")).toBe(true)
})
test("an incomplete unrelated definition cannot abort class decorator source indexing", async () => {
  const index = await buildStructureIndex([...classDecoratorSources, { path: "broken.py", content: "def ():\n    return None\n" }, { path: "app.py", content: "from wrappers import direct\n@direct\nclass View:\n    pass\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.diagnostics.some(d => d.code === "structure-parse-partial" && d.path === "broken.py")).toBe(true)
  expect((index as any).classDecorators("app.View")).toHaveLength(1)
})

test("a unique directly called local function binds its stable outer parameter without borrowing a module namesake", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def guard():\n    return True\ndef entry(actor):\n    def guard():\n        if actor.blocked:\n            raise Forbidden\n        return actor\n    guard()\n    return actor\n" }], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.qualifiedName === "app.entry")!, local = index.symbols.find(s => s.qualifiedName === "app.entry.guard")!, call = index.relatedCalls(entry.id).find(c => c.expression === "guard")!
  expect(call.candidateIds).toEqual([local.id])
  expect((local as any).localCallable).toMatchObject({ schemaVersion: "source-local-callable/v1", ownerId: entry.id, ownerSha256: entry.sha256, captures: [{ name: "actor", use: { startLine: 5, endLine: 5 } }] })
  expect((local as any).localCallable.gap).toBeUndefined()
})
for (const [body, code] of [
  ["    actor = replacement\n    guard()\n", "source-local-capture-rebound"],
  ["    consume(guard)\n    guard()\n", "source-local-callable-escape-unmodeled"],
  ["    guard = replacement\n    guard()\n", "source-local-callable-binding-unresolved"],
] as const) test(`local callable keeps ${code} instead of falling back to a global namesake`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def guard():\n    return True\ndef entry(actor):\n    def guard():\n        return actor\n" + body }], { repository: "anonymous", sourceRef: "r" })
  const call = index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id).find(c => c.expression === "guard")!
  expect(call.resolution).toBe("unresolved")
  expect(call.candidateIds).toEqual([])
  expect(call.gap).toBe(code)
})
test("a callable parameter cannot borrow an unqualified module function", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def guard():\n    return True\ndef entry(guard):\n    return guard()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id)[0]!.resolution).toBe("unresolved")
})
for (const mode of ["ordinary", "import", "parameter", "local", "rebound", "wrapped", "base", "metaclass", "conditional"]) test(`source class argument qualification retains actual module binding: ${mode}`, async () => {
  const declaration = mode === "wrapped" ? "@change\nclass Gate:\n    pass\n" : mode === "base" ? "class Gate(Base):\n    pass\n" : mode === "metaclass" ? "class Gate(metaclass=Meta):\n    pass\n" : mode === "conditional" ? "if configured:\n    class Gate:\n        pass\n" : "class Gate:\n    pass\n"
  const files = [{ path: "types.py", content: declaration }, { path: "app.py", content: `${mode === "import" ? "from types import Gate" : declaration}\ndef consume(cls):\n    return cls\ndef entry(${mode === "parameter" ? "Gate" : ""}):\n${mode === "local" || mode === "rebound" ? "    Gate = replacement\n" : ""}    consume(Gate)\n` }]
  const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), source = index.symbols.find(s => s.qualifiedName === "app.entry")!, call = index.relatedCalls(source.id)[0]!, proof = (call.argumentFacts![0] as any).classValue
  if (["ordinary", "import"].includes(mode)) {
    expect(proof).toMatchObject({ schemaVersion: "source-class-value/v1", expression: "Gate", targetId: index.symbols.find(s => s.qualifiedName === `${mode === "import" ? "types" : "app"}.Gate`)!.id, controls: [] })
    expect(call.argumentFacts![0]!.callableValue).toBeUndefined()
  } else expect(proof).toBeUndefined()
})
for (const declaration of ["async def guard():", "@other\n    def guard():", "def guard(flag=unknown()):", "def guard(actor: unknown()):"]) test(`local callable definition retains ${declaration.split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    " + declaration + "\n        return actor\n    guard()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id).find(c => c.expression === "guard")!.resolution).toBe("unresolved")
  expect((index.symbols.find(s => s.qualifiedName === "app.entry.guard") as any).localCallable.gap).toBe("source-local-callable-definition-unmodeled")
})
test("outer local values and nonlocal capture are explicit boundaries", async () => {
  for (const body of ["def entry(actor):\n    selected = actor\n    def guard():\n        return selected\n    guard()\n", "def entry(actor):\n    def guard():\n        nonlocal actor\n        return actor\n    guard()\n"]) {
    const index = await buildStructureIndex([{ path: "app.py", content: body }], { repository: "anonymous", sourceRef: "r" }), local = index.symbols.find(s => s.qualifiedName === "app.entry.guard")!
    expect((local as any).localCallable.gap).toMatch(/^source-local-capture-/)
    expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id).find(c => c.expression === "guard")!.resolution).toBe("unresolved")
  }
})
test("a call before its local declaration cannot borrow the later callable", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    guard()\n    def guard():\n        return actor\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id)[0]!.resolution).toBe("unresolved")
})

test("a local generator call cannot execute its body as an ordinary helper", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor):\n    def guard():\n        yield actor\n        raise Forbidden\n    guard()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!.gap).toBe("source-local-callable-definition-unmodeled")
})
for (const prefix of ["    match value:\n        case actor:\n            pass\n", "    def replace():\n        nonlocal actor\n        actor = replacement\n    replace()\n"]) test(`a capture is not stable across another source cell binding: ${prefix.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "def entry(actor, value):\n" + prefix + "    def guard():\n        return actor\n    guard()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "guard")!.gap).toMatch(/^source-local-capture-/)
})

const publicSources = [
  { path: "package/__init__.py", content: "from package.bridge import Actual as Public\n" },
  { path: "package/bridge.py", content: "from package.implementation import Base as Actual\nfrom package.implementation import helper as inspect\n" },
  { path: "package/implementation.py", content: "class Base:\n    def check(self, actor):\n        return actor\ndef helper(actor):\n    return actor\n" },
  { path: "app.py", content: "from package import Public\nfrom package.bridge import inspect\nclass Entry(Public):\n    def entry(self, actor):\n        inspect(actor)\n        return self.check(actor)\n" },
]
test("a current public import chain binds its exact original class and function sources", async () => {
  const index = await buildStructureIndex(publicSources, { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!
  expect(index.linearize("app.Entry")).toEqual(["app.Entry", "package.implementation.Base"])
  expect(index.resolveName("Public", "app.py").map(s => s.qualifiedName)).toEqual(["package.implementation.Base"])
  const call = index.relatedCalls(entry.id).find(c => c.expression === "inspect")!
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.name === "helper")!.id])
  expect((call as any).bindingSources.map((s: any) => s.path)).toEqual(["package/bridge.py"])
  expect((index as any).classBindingSources("app.Entry").map((s: any) => s.path).sort()).toEqual(["package/__init__.py", "package/bridge.py"])
})
for (const replacement of ["from package.bridge import Actual as Public\nPublic = replacement\n", "if configured:\n    from package.bridge import Actual as Public\n", "import package.bridge as bridge\nfrom package.bridge import Actual as Public\nbridge.Actual = replacement\n"]) test(`public import binding stays unresolved: ${replacement.trim().split("\n").at(-1)}`, async () => {
  const index = await buildStructureIndex(publicSources.map(s => s.path === "package/__init__.py" ? { ...s, content: replacement } : s).map(s => s.path === "app.py" ? { ...s, content: "from package import Public\ndef entry():\n    return Public()\n" } : s), { repository: "anonymous", sourceRef: "r" })
  const call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-import-reexport-/)
})
test("rebound terminal definitions and cyclic public imports cannot supply the original target", async () => {
  for (const extra of ["\nBase = replacement\n", ""]) {
    const files = extra ? publicSources.map(s => s.path === "package/implementation.py" ? { ...s, content: s.content + extra } : s) : publicSources.map(s => s.path === "package/bridge.py" ? { ...s, content: "from package import Public as Actual\n" } : s)
    const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" })
    expect(index.resolveName("Public", "app.py")).toEqual([])
    expect(index.lookupMethod("app.Entry", "check")).toEqual([])
  }
})
test("duplicate public source modules never choose a shorter namesake target", async () => {
  const files = [{ path: "one/package/__init__.py", content: "from one.implementation import helper as inspect\n" }, { path: "two/package/__init__.py", content: "from two.implementation import helper as inspect\n" }, { path: "one/implementation.py", content: "def helper():\n    return True\n" }, { path: "two/implementation.py", content: "def helper():\n    return False\n" }, { path: "app.py", content: "from package import inspect\ndef entry():\n    return inspect()\n" }]
  const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toBe("source-import-reexport-ambiguous")
})
test("class source revisions include only selected import hop bytes", async () => {
  const build = (files: typeof publicSources) => buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), original = await build(publicSources)
  const commented = await build(publicSources.map(s => s.path === "package/__init__.py" ? { ...s, content: s.content + "# changed selected binding source\n" } : s))
  const unrelated = await build([...publicSources, { path: "other/__init__.py", content: "from package.implementation import Base\n" }])
  expect(commented.candidateRevision("app.Entry", "check")).not.toBe(original.candidateRevision("app.Entry", "check"))
  expect(unrelated.candidateRevision("app.Entry", "check")).toBe(original.candidateRevision("app.Entry", "check"))
})

test("a real public module wins over a different-root suffix namesake", async () => {
  const index = await buildStructureIndex([...publicSources, { path: "decoy/package.py", content: "class Public:\n    def check(self, actor):\n        return False\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.linearize("app.Entry")).toEqual(["app.Entry", "package.implementation.Base"])
})
test("conditional terminal definitions and rebound consuming imports retain their public boundary", async () => {
  const conditional = await buildStructureIndex(publicSources.map(s => s.path === "package/implementation.py" ? { ...s, content: "if configured:\n    class Base:\n        pass\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(conditional.resolveName("Public", "app.py")).toEqual([])
  const rebound = await buildStructureIndex(publicSources.map(s => s.path === "app.py" ? { ...s, content: "from package.bridge import inspect\ninspect = replacement\ndef entry(actor):\n    return inspect(actor)\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(rebound.relatedCalls(rebound.symbols.find(s => s.name === "entry")!.id)[0]!.gap).toBe("source-import-reexport-consumer-binding-unresolved")
})
test("unmodeled relative public imports retain a named boundary", async () => {
  const index = await buildStructureIndex(publicSources.map(s => s.path === "package/__init__.py" ? { ...s, content: "from .bridge import Actual as Public\n" } : s).map(s => s.path === "app.py" ? { ...s, content: "from package import Public\ndef entry():\n    return Public()\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!.gap).toBe("source-import-reexport-relative-unmodeled")
})
test("class decorator source footprints include the selected public base binding bytes", async () => {
  const files = publicSources.map(s => s.path === "app.py" ? { ...s, content: s.content.replace("class Entry(Public):", "def decorate(cls):\n    return cls\n@decorate\nclass Entry(Public):") } : s)
  const original = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), changed = await buildStructureIndex(files.map(s => s.path === "package/__init__.py" ? { ...s, content: s.content + "# current public source\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(original.classDecorators("app.Entry")[0]!.bindingSources!.map(s => s.path).sort()).toEqual(["package/__init__.py", "package/bridge.py"])
  expect(changed.classDecorators("app.Entry")).not.toEqual(original.classDecorators("app.Entry"))
})
test("a partial public or terminal module cannot prove a current import chain", async () => {
  for (const sourcePath of ["package/__init__.py", "package/implementation.py"]) {
    const index = await buildStructureIndex(publicSources.map(s => s.path === sourcePath ? { ...s, content: s.content + "def ():\n    pass\n" } : s).map(s => s.path === "app.py" ? { ...s, content: "from package import Public\ndef entry():\n    return Public()\n" } : s), { repository: "anonymous", sourceRef: "r" })
    const call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!
    expect(call.resolution).toBe("unresolved")
    expect(call.gap).toMatch(/^source-import-reexport-/)
  }
})
test("a module receiver retains its constructor's selected public import bytes", async () => {
  const files = [{ path: "package/__init__.py", content: "from implementation import Gate\n" }, { path: "implementation.py", content: "class Gate:\n    def check(self, actor):\n        return actor\n" }, { path: "receivers.py", content: "from package import Gate\ngate = Gate()\n" }, { path: "app.py", content: "from receivers import gate\ndef entry(actor):\n    return gate.check(actor)\n" }]
  const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.name === "check")!.id])
  expect(call.bindingSources!.map(s => s.path)).toEqual(["package/__init__.py"])
})
test("a rebound consuming class alias cannot supply an inherited method or module receiver", async () => {
  const inherited = await buildStructureIndex(publicSources.map(s => s.path === "app.py" ? { ...s, content: s.content.replace("class Entry(Public):", "Public = replacement\nclass Entry(Public):") } : s), { repository: "anonymous", sourceRef: "r" })
  expect(inherited.lookupMethod("app.Entry", "check")).toEqual([])
  const receiver = await buildStructureIndex([{ path: "package/__init__.py", content: "from implementation import Gate\n" }, { path: "implementation.py", content: "class Gate:\n    def check(self):\n        return True\n" }, { path: "app.py", content: "from package import Gate\nGate = replacement\ngate = Gate()\ndef entry():\n    return gate.check()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(receiver.relatedCalls(receiver.symbols.find(s => s.name === "entry")!.id)[0]!.resolution).toBe("unresolved")
})

test("an unaliased dotted import binds the top package without duplicating its module suffix", async () => {
  const files = [{ path: "package/__init__.py", content: "def check():\n    return True\n" }, { path: "package/bridge.py", content: "def check():\n    return False\n" }, { path: "app.py", content: "import package.bridge\nimport package.bridge as bridge\ndef entry():\n    package.check()\n    package.bridge.check()\n    return bridge.check()\n" }]
  const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!
  expect(index.relatedCalls(entry.id).map(call => call.candidateIds.map(id => index.symbols.find(s => s.id === id)!.qualifiedName))).toEqual([["package.check"], ["package.bridge.check"], ["package.bridge.check"]])
})

test("a rebound public annotation cannot prove its original receiver class", async () => {
  const index = await buildStructureIndex(publicSources.map(s => s.path === "app.py" ? { ...s, content: "from package import Public\nPublic = replacement\ndef entry(actor: Public):\n    return actor.check(actor)\n" } : s), { repository: "anonymous", sourceRef: "r" })
  const call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)[0]!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toBe("source-import-reexport-consumer-binding-unresolved")
})

test("dependency facts retain the selected public callable binding bytes", async () => {
  const files = publicSources.map(s => s.path === "app.py" ? { ...s, content: "from fastapi import Depends\nfrom package.bridge import inspect\ndef entry(actor=Depends(inspect)):\n    return actor\n" } : s)
  const original = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), changed = await buildStructureIndex(files.map(s => s.path === "package/bridge.py" ? { ...s, content: s.content + "# current selected export\n" } : s), { repository: "anonymous", sourceRef: "r" })
  const entry = original.symbols.find(s => s.name === "entry")!, facts = original.requestDependencies(entry.id)
  expect(facts[0]!.resolution).toBe("resolved")
  expect(changed.requestDependencies(entry.id)).not.toEqual(facts)
  expect((facts[0] as any).bindingSources.map((s: any) => s.path)).toEqual(["package/bridge.py"])
})

test("class decorator helper work retains the selected public callable binding bytes", async () => {
  const files = publicSources.map(s => s.path === "app.py" ? { ...s, content: "from package.bridge import inspect\ndef decorate(cls):\n    inspect(cls)\n    return cls\n@decorate\nclass Entry:\n    pass\n" } : s)
  const original = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), changed = await buildStructureIndex(files.map(s => s.path === "package/bridge.py" ? { ...s, content: s.content + "# current selected export\n" } : s), { repository: "anonymous", sourceRef: "r" })
  const facts = original.classDecorators("app.Entry")
  expect(facts[0]!.sourceCandidates.some(c => c.role === "helper" && original.symbols.find(s => s.id === c.candidateId)?.name === "helper")).toBe(true)
  expect(changed.classDecorators("app.Entry")).not.toEqual(facts)
  expect(facts[0]!.bindingSources!.map(s => s.path)).toEqual(["package/bridge.py"])
})

for (const expression of ["check", "create(actor)"]) test(`a current factory result supplies a real callable parameter source: ${expression}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `def create(principal):\n    def guard(subject):\n        selected = principal\n        return subject\n    return guard\ndef consume(operation, subject):\n    operation(subject)\ndef entry(actor):\n${expression === "check" ? "    check = create(actor)\n" : ""}    consume(${expression}, actor)\n` }], { repository: "anonymous", sourceRef: "r" }), guard = index.symbols.find(s => s.name === "guard")!, consume = index.symbols.find(s => s.name === "consume")!, entry = index.symbols.find(s => s.name === "entry")!
  expect(guard.valueCallable).toMatchObject({ name: "guard", captures: [{ name: "principal" }] })
  expect(guard.valueCallable?.gap).toBeUndefined()
  expect(index.relatedCalls(entry.id).find(c => c.expression === "consume")!.argumentFacts![0]!.callableValue).toMatchObject({ kind: "returned", targetId: guard.id, targetSha256: guard.sha256 })
  expect(index.relatedCalls(consume.id)[0]!.callableParameter?.choices.map(c => c.targetId)).toEqual([guard.id])
})

const returnedSources = [{ path: "factory.py", content: "def create(principal):\n    def guard(flag=False):\n        selected = principal\n        raise Denied\n    return guard\n" }, { path: "app.py", content: "from factory import create\ndef entry(actor, decoy):\n    check = create(actor)\n    check()\n    write()\n" }]
test("a returned callable uses the exact current factory result and stable capture environment", async () => {
  const index = await buildStructureIndex(returnedSources, { repository: "anonymous", sourceRef: "r" }), entry = index.symbols.find(s => s.name === "entry")!, guard = index.symbols.find(s => s.name === "guard")!, calls = index.relatedCalls(entry.id)
  const call = calls.find(c => c.expression === "check")!
  expect(call.candidateIds).toEqual([guard.id])
  expect((call as any).callableBinding).toMatchObject({ name: "check", creationCallId: calls.find(c => c.expression === "create")!.id, factoryId: index.symbols.find(s => s.name === "create")!.id, captures: [{ parameter: "principal", expression: "actor", literalKnown: false }] })
  expect((guard as any).returnedCallable.gap).toBeUndefined()
  expect(guard.localCallable!.gap).toBe("source-local-callable-escape-unmodeled")
})
for (const statement of ["    check = create(actor)\n    check = replacement\n", "    if configured:\n        check = create(actor)\n"]) test(`a returned callable cannot borrow an unproved creation environment: ${statement.trim().split("\n").at(-1)}`, async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "app.py" ? { ...s, content: "from factory import create\ndef entry(actor, decoy):\n" + statement + "    check()\n" } : s), { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-returned-callable-/)
})
for (const statement of ["    actor = decoy\n    check = create(actor)\n", "    check = create(actor)\n    callback(check)\n"]) test(`a returned object's source survives caller binding changes and argument reads: ${statement.trim().split("\n").at(-1)}`, async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "app.py" ? { ...s, content: "from factory import create\ndef entry(actor, decoy):\n" + statement + "    check()\n" } : s), { repository: "anonymous", sourceRef: "r" }), calls = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id), call = calls.find(c => c.expression === "check")!
  expect(call.resolution).toBe("resolved")
  expect(call.callableBinding?.captures).toEqual([{ parameter: "principal", expression: "actor", literalKnown: false }])
  if (statement.includes("callback")) expect(calls.find(c => c.expression === "callback")!.resolution).toBe("unresolved")
})
test("separate factory results retain separate actual captured values and callable instances", async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "app.py" ? { ...s, content: "from factory import create\ndef entry(actor, decoy):\n    first = create(actor)\n    second = create(decoy)\n    first()\n    second()\n" } : s), { repository: "anonymous", sourceRef: "r" })
  const calls = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).filter(c => c.callableBinding)
  expect(calls.map(c => [c.callableBinding!.name, c.callableBinding!.captures[0]!.expression])).toEqual([["first", "actor"], ["second", "decoy"]])
  expect(new Set(calls.map(c => c.callableBinding!.creationCallId)).size).toBe(2)
})
for (const source of ["def create(principal):\n    @decorate\n    def guard():\n        return principal\n    return guard\n", "def create(principal):\n    def guard():\n        return principal\n    guard.metadata = principal\n    return guard\n", "def create(principal):\n    def guard():\n        nonlocal principal\n        return principal\n    return guard\n", "def create(principal):\n    def guard():\n        return principal\n    if principal:\n        return guard\n    return replacement\n"]) test(`a returned source proof does not waive factory or capture mechanics: ${source.split("\n")[2]!.trim()}`, async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "factory.py" ? { ...s, content: source } : s), { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-returned-callable-/)
})
test("a rebound source factory cannot prove a callable result from the old definition", async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "factory.py" ? { ...s, content: s.content + "create = replacement\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!.gap).toBe("source-returned-callable-factory-binding-unresolved")
})
for (const body of ["        return lambda value=principal.check(): value\n", "        def child(value=principal.check()):\n            return principal\n        return child\n"]) test(`a returned callable cannot omit a nested scope environment: ${body.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex(returnedSources.map(s => s.path === "factory.py" ? { ...s, content: "def create(principal):\n    def guard():\n" + body + "    return guard\n" } : s), { repository: "anonymous", sourceRef: "r" })
  expect(index.symbols.find(s => s.name === "guard")!.returnedCallable!.gap).toBe("source-returned-callable-nested-scope-unmodeled")
  expect(index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "check")!.gap).toBe("source-returned-callable-nested-scope-unmodeled")
})
test("a constructor assigned to a field cannot retype its owning receiver", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Service:\n    def handle(self):\n        return 'decoy'\nclass Container:\n    def handle(self):\n        return 'actual'\n    def entry(self):\n        self.service = Service()\n        return self.handle()\n" }], { repository: "anonymous", sourceRef: "r" }), calls = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id)
  expect(calls.find(c => c.expression === "self.handle")!.candidateIds).toEqual([index.symbols.find(s => s.name === "handle" && s.className === "app.Container")!.id])
  expect(calls.find(c => c.expression === "Service")!.resultNames).toEqual(["self.service"])
})

test("a local bound method alias retains the actual receiver and override at its own creation", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def guard(self, actor):\n        return actor\nclass Gate(Base):\n    def entry(this, actor):\n        handler = this.guard; return handler(actor)\n    def guard(self, actor):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, call = index.relatedCalls(owner.id, "app.Gate").find(c => c.expression === "handler")!, target = index.symbols.find(s => s.name === "guard" && s.className === "app.Gate")!
  expect(call.resolution).toBe("resolved")
  expect(call.candidateIds).toEqual([target.id])
  expect(call).toMatchObject({ receiver: "this", receiverClass: "app.Gate", methodBinding: { schemaVersion: "source-method-alias/v1", name: "handler", receiver: "this", method: "guard", targetId: target.id, targetSha256: target.sha256, source: { path: "app.py", sha256: owner.sha256, startLine: 6, endLine: 6 } } })
})
test("an inherited method alias uses its actual subclass but rejects an unrelated receiver context", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def entry(self, actor):\n        handler = self.guard\n        return handler(actor)\n    def guard(self, actor):\n        return actor\nclass Gate(Base):\n    def guard(self, actor):\n        raise Denied\nclass Other:\n    def guard(self, actor):\n        return actor\n" }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!
  expect(index.relatedCalls(owner.id, "app.Gate")[0]!.candidateIds).toEqual([index.symbols.find(s => s.name === "guard" && s.className === "app.Gate")!.id])
  expect(index.relatedCalls(owner.id, "app.Other")[0]!.resolution).toBe("unresolved")
  expect(index.relatedCalls(owner.id, "app.Other")[0]!.gap).toBe("source-method-alias-class-binding-unresolved")
})
for (const body of ["        if configured:\n            handler = self.guard\n        return handler(actor)\n", "        handler = self.guard\n        handler = replacement\n        return handler(actor)\n", "        handler = self.guard\n        self = replacement\n        return handler(actor)\n", "        handler = self.guard\n        keep(handler)\n        return handler(actor)\n", "        handler(actor)\n        handler = self.guard\n", "        handler = self.guard\n        self.guard += replacement\n        return handler(actor)\n", "        handler = self.guard\n        setattr(self, name, replacement)\n        return handler(actor)\n", "        handler = other.guard\n        return handler(actor)\n"]) test(`a local method alias keeps an unproved source binding named: ${body.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, other):\n${body}    def guard(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-method-alias-/)
})
for (const extra of ["    def __getattribute__(self, name):\n        return replacement\n", "    @property\n    def guard(self):\n        return replacement\n", "    @staticmethod\n    def guard(actor):\n        return actor\n", "    @classmethod\n    def guard(cls, actor):\n        return actor\n", "    @decorate\n    def guard(self, actor):\n        return actor\n", "    async def guard(self, actor):\n        return actor\n"]) test(`a source method alias does not waive a descriptor or wrapped target: ${extra.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor):\n        handler = self.guard\n        return handler(actor)\n${extra}` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-method-alias-/)
})
for (const definition of ["    @staticmethod\n    def entry(receiver, actor):\n", "    @classmethod\n    def entry(receiver, actor):\n", "    @decorate\n    def entry(receiver, actor):\n", "    async def entry(receiver, actor):\n"]) test(`a source method alias requires an ordinary instance method owner: ${definition.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n${definition}        handler = receiver.guard\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!
  for (const receiverClass of [undefined, "app.Gate"]) {
    const call = index.relatedCalls(owner.id, receiverClass).find(c => c.expression === "handler")!
    expect(call.resolution).toBe("unresolved")
    expect(call.gap).toBe("source-method-alias-owner-unmodeled")
    expect(call.methodBinding).toBeUndefined()
  }
})
test("conditional ordinary method values retain each creation and actual receiver target", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def entry(this, actor, selected):\n        if selected:\n            handler = this.guard\n        else:\n            handler = this.fallback\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor):\n        return actor\nclass Gate(Base):\n    def guard(self, actor):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, call = index.relatedCalls(owner.id, "app.Gate").find(c => c.expression === "handler")!
  expect(call.resolution).toBe("ambiguous")
  expect(call.receiver).toBe("this")
  expect(call.methodChoices).toMatchObject({ schemaVersion: "source-method-choice/v1", name: "handler", receiver: "this", choices: [{ method: "guard", targetId: index.symbols.find(s => s.name === "guard" && s.className === "app.Gate")!.id, controls: [{ branch: "true" }] }, { method: "fallback", targetId: index.symbols.find(s => s.name === "fallback")!.id, controls: [{ branch: "false" }] }] })
  expect(call.methodChoices!.choices[0]!.source.startLine).toBe(4)
  expect(index.relatedCalls(owner.id, "other.Gate").find(c => c.expression === "handler")!.gap).toBe("source-method-choice-class-binding-unresolved")
})
for (const body of [
  "        handler = self.guard\n        handler = self.fallback\n        handler = replacement\n",
  "        handler = self.guard\n        handler = other.fallback\n",
  "        handler = self.guard\n        handler = self.fallback\n        keep(handler)\n",
  "        handler = self.guard\n        handler = self.fallback\n        self = other\n",
  "        handler = self.guard\n        handler = self.fallback\n        setattr(self, 'fallback', replacement)\n",
  "        handler = self.guard\n        handler = self.fallback\n        self.fallback += replacement\n",
  "        try:\n            handler = self.guard\n        except Failed:\n            handler = self.fallback\n",
  "        handler = self.guard\n        for item in items:\n            handler = self.fallback\n",
  "        if selected:\n            handler = self.guard\n        elif other:\n            handler = self.fallback\n",
  "        handler = self.guard\n        handler = self.fallback\n        def inner():\n            return handler(actor)\n",
]) test(`unproved finite method choices remain named: ${body.trim().split("\n")[0]} ${body.length}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, other):\n${body}        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.resolution).toBe("unresolved")
  expect(call.gap).toMatch(/^source-method-choice-/)
})
for (const definition of ["    @staticmethod\n    def entry(self, actor):\n", "    @classmethod\n    def entry(self, actor):\n", "    @decorate\n    def entry(self, actor):\n", "    async def entry(self, actor):\n"]) test(`finite method choices require an ordinary owner: ${definition.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n${definition}        handler = self.guard\n        handler = self.fallback\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id, "app.Gate").find(c => c.expression === "handler")!
  expect(call.gap).toBe("source-method-choice-owner-unmodeled")
  expect(call.methodChoices).toBeUndefined()
})
for (const target of ["    @property\n    def fallback(self):\n        return replacement\n", "    @staticmethod\n    def fallback(actor):\n        return actor\n", "    @classmethod\n    def fallback(cls, actor):\n        return actor\n", "    async def fallback(self, actor):\n        return actor\n"]) test(`finite method choices retain an unproved target boundary: ${target.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor):\n        handler = self.guard\n        handler = self.fallback\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n${target}` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.gap).toBe("source-method-choice-target-unmodeled")
  expect(call.methodChoices).toBeUndefined()
})

test("getattr preserves its actual selector occurrence and compatible current method targets", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def entry(this, actor, selector):\n        handler = getattr(this, selector, this.fallback)\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor):\n        return actor\nclass Gate(Base):\n    def guard(self, actor):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" }), owner = index.symbols.find(s => s.name === "entry")!, calls = index.relatedCalls(owner.id, "app.Gate"), call = calls.find(c => c.expression === "handler")!
  expect(call.methodLookup).toMatchObject({ schemaVersion: "source-method-lookup/v2", name: "handler", receiver: "this", creationCallId: calls.find(c => c.expression === "getattr")!.id, selector: { expression: "selector", literalKnown: false }, fallbackExpression: "this.fallback", choices: [{ method: "guard", targetId: index.symbols.find(s => s.name === "guard" && s.className === "app.Gate")!.id }, { method: "fallback" }] })
  expect(call.candidateIds).toHaveLength(2)
  expect(index.relatedCalls(owner.id, "other.Gate").find(c => c.expression === "handler")!.gap).toBe("source-method-lookup-class-binding-unresolved")
})
test("a literal getattr selector narrows before the candidate limit and preserves eager default provenance", async () => {
  const content = `class Gate:\n    def entry(self, actor):\n        handler = getattr(self, 'guard', self.fallback)\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor):\n        return actor\n${Array.from({ length: 17 }, (_, i) => `    def other${i}(self, actor):\n        return actor\n`).join("")}`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!, target = index.symbols.find(s => s.name === "guard")!
  expect(call.resolution).toBe("resolved")
  expect(call.candidateIds).toEqual([target.id])
  expect(call.methodLookup!.choices.map(c => c.method)).toEqual(["guard"])
  expect(call.methodLookup!.fallbackTarget!.targetId).toBe(index.symbols.find(s => s.name === "fallback")!.id)
})
for (const body of [
  "        handler = getattr(self, selector)\n        handler = replacement\n",
  "        for selected in values:\n            handler = getattr(self, selector)\n",
  "        handler = getattr(self, selector)\n        keep(handler)\n",
  "        handler = getattr(other, selector)\n",
  "        handler = getattr(self, selector)\n        setattr(self, 'guard', replacement)\n",
  "        handler = getattr(self, selector, unknown_default)\n",
  "        getattr = replacement\n        handler = getattr(self, selector)\n",
]) test(`unproved getattr values remain named: ${body.length} ${body.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, selector, other):\n${body}        return handler(actor)\n    def guard(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.gap).toMatch(/^source-method-lookup-/)
  expect(call.methodLookup).toBeUndefined()
})
for (const definition of ["    @staticmethod\n    def entry(self, actor, selector):\n", "    @classmethod\n    def entry(self, actor, selector):\n", "    @decorate\n    def entry(self, actor, selector):\n", "    async def entry(self, actor, selector):\n"]) test(`getattr owner requires an ordinary instance: ${definition.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n${definition}        handler = getattr(self, selector)\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id, "app.Gate").find(c => c.expression === "handler")!
  expect(call.gap).toBe("source-method-lookup-owner-unmodeled")
})
for (const definition of ["    @property\n    def fallback(self):\n        return other\n", "    @staticmethod\n    def fallback(actor):\n        return actor\n", "    @classmethod\n    def fallback(cls, actor):\n        return actor\n", "    async def fallback(self, actor):\n        return actor\n"]) test(`getattr eagerly evaluated default must remain ordinary: ${definition.trim().split("\n")[0]}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, selector):\n        handler = getattr(self, selector, self.fallback)\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n${definition}` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.gap).toBe("source-method-lookup-default-unmodeled")
})
for (const name of ["__getattr__", "__getattribute__"]) test(`getattr keeps current custom attribute protocol named: ${name}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, selector):\n        handler = getattr(self, selector)\n        return handler(actor)\n    def guard(self, actor):\n        return actor\n    def ${name}(self, name):\n        return other\n` }], { repository: "anonymous", sourceRef: "r" }), call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!
  expect(call.gap).toBe("source-method-lookup-descriptor-unmodeled")
})

for (const [body, creationPath, callPath, alternatePath] of [
  ["        try:\n            if selected:\n                handler = getattr(self, 'guard', self.fallback)\n            else:\n                handler = self.fallback\n            return handler(actor)\n        except Denied:\n            return False\n", ["body", "true"], ["body"], ["body", "false"]],
  ["        if selected:\n            handler = getattr(self, 'guard')\n        return handler(actor)\n", ["true"], [], undefined],
  ["        try:\n            handler = self.fallback\n        except Denied:\n            handler = getattr(self, 'guard')\n        finally:\n            handler(actor)\n", ["handler"], ["finally"], ["body"]],
] as const) test(`conditional getattr keeps its original control regions: ${creationPath.join("/")}`, async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: `class Gate:\n    def entry(self, actor, selected):\n${body}    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n` }], { repository: "anonymous", sourceRef: "r" })
  const call = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).find(c => c.expression === "handler")!, proof: any = call.methodLookup
  expect(call.gap).toBeUndefined()
  expect(proof).toMatchObject({ schemaVersion: "source-method-lookup/v2", name: "handler", receiver: "self" })
  expect(proof.controls.map((c: any) => c.branch ?? c.region)).toEqual(creationPath)
  expect(proof.callControls.map((c: any) => c.branch ?? c.region)).toEqual(callPath)
  expect(proof.alternatives[0]?.controls.map((c: any) => c.branch ?? c.region)).toEqual(alternatePath)
  expect(proof.choices.map((c: any) => [c.method, c.lookup])).toEqual(alternatePath ? [["guard", true], ["fallback", false]] : [["guard", true]])
})

test("getattr uses with different argument shapes retain a named shared-creation boundary", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Gate:\n    def entry(self, actor, other, selector):\n        handler = getattr(self, selector)\n        handler(actor)\n        return handler(actor, other)\n    def guard(self, actor):\n        return actor\n    def fallback(self, actor, other):\n        return other\n" }], { repository: "anonymous", sourceRef: "r" })
  const calls = index.relatedCalls(index.symbols.find(s => s.name === "entry")!.id).filter(c => c.expression === "handler")
  expect(calls).toHaveLength(2)
  for (const call of calls) {
    expect(call.gap).toBe("source-method-lookup-call-shape-unmodeled")
    expect(call.methodLookup).toBeUndefined()
  }
})
