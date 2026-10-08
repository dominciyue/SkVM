import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { createSourceMaterials } from "../../task-dsl/authorization/source-materials.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { lowerSemanticFlow } from "../../task-dsl/authorization/semantic-flow.ts"
import { lowerSourceInterpretation } from "../../task-dsl/authorization/source-interpretation.ts"
import { sourceRelationRevision } from "./operation-work.ts"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
const api = await import("./source-material-projection.ts").catch(() => ({} as any))
const content = "def entry(actor):\n    return helper(actor)\ndef helper(actor):\n    return actor\ndef unrelated(actor):\n    return actor\n"
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }, { id: "other", operationId: "op", intent: "scope", request: "Explain alternatives", premises: [] }] })


for (const mode of ["parameter", "local", "conditional", "call", "duplicate-actual", "module-marker"]) test(`dynamic base creation uses actual namespace objects across calls and returns: ${mode}`, async () => {
  const conditional = mode === "conditional", expression = ["parameter", "duplicate-actual", "module-marker"].includes(mode) ? "base" : "selected", prepare = ["parameter", "duplicate-actual", "module-marker"].includes(mode) ? "" : conditional ? "    selected = base\n    if flag:\n        selected = other\n" : mode === "call" ? "    selected = select(base)\n" : "    selected = base\n"
  const content = (mode === "module-marker" ? "class External:\n    allowed = False\n" : "") + "def entry(subject):\n    class First:\n        allowed = False\n    class Second:\n        allowed = True\n" + (mode === "module-marker" ? "    first = build(External, First, False, subject)\n" : mode === "duplicate-actual" ? "    first = build(First, First, False, subject)\n" : conditional ? "    first = build(Second, First, True, subject)\n" : "    first = build(First, Second, False, subject)\n") + "    if first.allowed:\n        raise Denied\n" + (conditional ? "    second = build(First, Second, True, subject)\n" : "    second = build(Second, First, False, subject)\n") + "    if second.allowed:\n        raise Denied\n    write(subject)\n    return True\ndef build(base, other, flag, actor):\n" + prepare + "    class Child(" + (mode === "duplicate-actual" ? "base, other" : expression) + "):\n        def guard(item):\n            return item\n    Child.guard(actor)\n    return Child\n" + (mode === "call" ? "def select(value):\n    return value\n" : "")
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-dynamic-base-")); await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = [], build = index.symbols.find(s => s.name === "build")!, child = index.symbols.find(s => s.name === "Child")!
  expect(child.classDefinition!.gap).toBeUndefined()
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!; expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise", "condition", "assignment"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject", "item"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" && a.call?.expression === "write" ? "effect" : ["call", "condition"].includes(a.kind) || a.kind === "assignment" && a.name === "selected" ? "condition" : "context", explanation: "Anonymous actual dynamic namespace base", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: a.text }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.id, handle: source.id, questionId: "q", role: source.name === "entry" ? "entry" : "helper" }); expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual dynamic inheritance", premises: [] }] })
  const project = (adopted = units, current = index) => { const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }); for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored"); return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true }) }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(mode === "call" ? 4 : 3)
  if (["duplicate-actual", "module-marker"].includes(mode)) { expect(lowered.diagnostics.map(d => d.code)).toContain("source-class-base-unresolved"); return }
  expect(lowered.diagnostics).toEqual([]); expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"]); expect(lowered.delta.rules.filter(r => r.kind === "effect")).toHaveLength(0)
  for (const mutation of ["wrong-base", "extra-writer", "missing-write", "wrong-write", "early-create", "outside-control"]) {
    if (["missing-write", "wrong-write", "early-create"].includes(mutation) && mode === "parameter" || mutation === "outside-control" && !conditional) continue
    const changed = structuredClone(units), owner = changed.find(u => u.source.id === build.id), root = owner.blocks.find((b: any) => b.name === owner.start), creation = root.steps.find((s: any) => s.sourceClass), writerBlock = owner.blocks.find((b: any) => b.steps.some((s: any) => (s.result === "selected" || s.bindingName === "selected") && (conditional ? b.name !== owner.start : true))), writer = writerBlock?.steps.find((s: any) => s.result === "selected" || s.bindingName === "selected")
    if (mutation === "wrong-base") creation.sourceClass.bases = ["other"]
    if (mutation === "extra-writer") root.steps.splice(root.steps.indexOf(creation), 0, { kind: "assign-value", name: "forged-base-writer", claim: "Source-absent base replacement", result: expression, value: { binding: "other" } })
    if (mutation === "missing-write") writerBlock.steps = writerBlock.steps.filter((s: any) => s !== writer)
    if (mutation === "wrong-write") { if (writer.kind === "call") writer.result = "foreign"; else writer.value = { binding: conditional ? "base" : "other" } }
    if (mutation === "early-create") { root.steps.splice(root.steps.indexOf(creation), 1); root.steps.unshift(creation) }
    if (mutation === "outside-control") { writerBlock.steps = writerBlock.steps.filter((s: any) => s !== writer); root.steps.splice(root.steps.indexOf(creation), 0, writer) }
    expect(lowerSemanticFlow(project(changed).units, { compositional: true, propertyDirected: true }).diagnostics.length).toBeGreaterThan(0)
  }
  expect(project(units, await buildStructureIndex([{ path: "app.py", content: content.replace("allowed = False", "allowed = True") }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual([])
})

for (const mode of ["literal", "conditional", "call", "ancestor", "multiple", "identity"]) test(`actual captured parameter environment follows completed preparation writes: ${mode}`, async () => {
  const write = mode === "conditional" ? "    if flag:\n        flag = False\n" : mode === "call" ? "    flag = prepare(flag)\n" : mode === "multiple" ? "    flag = True\n    flag = False\n" : mode === "identity" ? "    flag = flag\n" : "    flag = False\n", nested = mode === "ancestor" ? "    def decorator(actor):\n        def check(item):\n            if flag:\n                raise Denied\n            return item\n        class Local:\n            def guard(item):\n                return check(item)\n        Local.guard(actor)\n        return actor\n    return decorator\n" : "    def check(item):\n        if flag:\n            raise Denied\n        return item\n    return check\n", content = "def entry(subject):\n" + (mode === "identity" ? "    first = create(False)\n    second = create(True)\n    first(subject)\n    second(subject)\n" : "    operation = create(True)\n    operation(subject)\n") + "    return True\ndef create(flag):\n" + write + nested + (mode === "call" ? "def prepare(value):\n    return False\n" : "")
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-capture-preparation-")); await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = [], create = index.symbols.find(s => s.name === "create")!
  expect(index.symbols.find(s => s.name === (mode === "ancestor" ? "decorator" : "check"))!.returnedCallable!.gap).toBeUndefined()
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!; expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise", "condition", "assignment"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject", "item"].includes(a.name!) ? "principal" : "condition" : ["call", "condition"].includes(a.kind) || a.kind === "assignment" && a.name === "flag" ? "condition" : "context", explanation: "Anonymous actual capture preparation", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: a.text }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.id, handle: source.id, questionId: "q", role: source.name === "entry" ? "entry" : "helper" }); expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual prepared capture", premises: [] }] })
  const project = (adopted = units, current = index) => { const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }); for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored"); return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true }) }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }), expectedUses = ["ancestor", "identity"].includes(mode) ? 4 : 2
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(expectedUses + (mode === "call" ? 1 : 0)); expect(lowered.diagnostics).toEqual([]); expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual([mode === "identity" ? "deny" : "allow"])
  const original = units.find(u => u.source.id === create.id), writer = original.blocks.flatMap((b: any) => b.steps).find((s: any) => s.result === "flag" || s.bindingName === "flag" || s.kind === "bind" && s.name === "flag")
  expect(writer).toBeDefined()
  for (const mutation of ["missing-write", "wrong-write", "early-create", "outside-control", "extra-write"]) {
    if (mutation === "outside-control" && mode !== "conditional") continue
    const changed = structuredClone(units), owner = changed.find(u => u.source.id === create.id), body = owner.blocks.find((b: any) => b.steps.some((s: any) => s.name === writer.name)), step = body.steps.find((s: any) => s.name === writer.name), root = owner.blocks.find((b: any) => b.name === owner.start)
    if (mutation === "missing-write") body.steps = body.steps.filter((s: any) => s !== step)
    if (mutation === "wrong-write") { if (step.kind === "call") step.result = "foreign"; else if (step.kind === "assign-value") step.value = { literal: true }; else step.value = !step.value }
    if (mutation === "early-create") { const created = root.steps.find((s: any) => s.sourceCallable); root.steps.splice(root.steps.indexOf(created), 1); root.steps.unshift(created) }
    if (mutation === "outside-control") { body.steps = body.steps.filter((s: any) => s !== step); root.steps.splice(root.steps.findIndex((s: any) => s.sourceCallable), 0, step) }
    if (mutation === "extra-write") root.steps.splice(root.steps.findIndex((s: any) => s.sourceCallable), 0, { kind: "bind", name: "forged-flag-writer", bindingName: "flag", claim: "Forged writer absent from source", type: "value", value: true })
    expect(lowerSemanticFlow(project(changed).units, { compositional: true, propertyDirected: true }).diagnostics.length).toBeGreaterThan(0)
  }
  expect(project(units, await buildStructureIndex([{ path: "app.py", content: content.replace(write, write.replace("False", "True")) }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual(["call", "identity"].includes(mode) ? projected.uses : [])
})
for (const returned of [false, true]) test(`class methods invoke captured local helper objects and their actual environments: ${returned}`, async () => {
  const nested = "    def check(item):\n        if flag:\n            raise Denied\n        return item\n    class Local:\n        def guard(actor):\n            return check(actor)\n    Local.guard(actor)\n    return actor\n", content = `def entry(subject):\n${returned ? "    first = create(False)\n    second = create(True)\n    check = False\n    if check:\n        raise Denied\n    first(subject)\n    second(subject)\n" : "    make(False, subject)\n    make(True, subject)\n"}    write(subject)\n    return True\n${returned ? "def create(flag):\n    def decorator(actor):\n" + nested.split("\n").filter(Boolean).map(s => "    " + s).join("\n") + "\n    return decorator\n" : "def make(flag, actor):\n" + nested}`
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-function-capture-")); await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  const helper = index.symbols.find(s => s.name === "check")!, method = index.symbols.find(s => s.name === "guard")!, cls = index.symbols.find(s => s.name === "Local")!, owner = index.symbols.find(s => s.id === cls.classDefinition!.ownerId)!
  expect(helper.valueCallable?.gap).toBeUndefined(); expect(helper.valueCallable).toBeDefined(); expect(cls.classDefinition!.gap).toBeUndefined()
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!; expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise", "condition", "assignment"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject", "item"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" && a.call!.expression === "write" ? "effect" : ["call", "condition"].includes(a.kind) ? "condition" : "context", explanation: "Anonymous actual local helper object capture", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: a.text }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.id, handle: source.id, questionId: "q", role: source.name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([]); units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual captured helper environments", premises: [] }] })
  const project = (adopted = units, current = index) => { const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }); for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored"); return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true }) }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }), methodUnit = units.find(u => u.source.id === method.id), ownerUnit = units.find(u => u.source.id === owner.id)
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(returned ? 6 : 4)
  expect(methodUnit.parameters.map((p: any) => p.name)).toEqual(["actor", "check"])
  const invocation = methodUnit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call")
  expect(invocation.arguments).toEqual([{ parameter: "item", object: "actor" }]); expect(invocation.callableRead).toEqual({ object: "check", targetId: helper.id, targetSha256: helper.sha256 })
  expect(ownerUnit.blocks.flatMap((b: any) => b.steps).filter((s: any) => s.sourceCallable)).toHaveLength(2)
  expect(lowered.diagnostics).toEqual([]); expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.filter(r => r.kind === "call" && r.sourceOrigin?.handle === method.id)).toHaveLength(2)
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  if (returned) expect(units.find(u => u.role === "entry").blocks.flatMap((b: any) => b.steps).some((s: any) => s.result === "check" || s.bindingName === "check")).toBe(true)
  for (const mutation of ["missing-definition", "helper-environment", "method-environment", "late-definition", "callee", "missing-helper-parameter"]) {
    const changed = structuredClone(units), ownerBody = changed.find(u => u.source.id === owner.id).blocks.find((b: any) => b.steps.some((s: any) => s.sourceCallable?.targetId === helper.id)), creation = ownerBody.steps.find((s: any) => s.sourceCallable?.targetId === helper.id), methodBody = changed.find(u => u.source.id === method.id), call = methodBody.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call")
    if (mutation === "missing-definition") ownerBody.steps = ownerBody.steps.filter((s: any) => s !== creation)
    if (mutation === "helper-environment") creation.sourceCallable.captures[0].object = "actor"
    if (mutation === "method-environment") ownerBody.steps.find((s: any) => s.sourceCallable?.targetId === method.id).sourceCallable.captures[0].object = "actor"
    if (mutation === "late-definition") ownerBody.steps.push(ownerBody.steps.splice(ownerBody.steps.indexOf(creation), 1)[0])
    if (mutation === "callee") call.callableRead.object = "actor"
    if (mutation === "missing-helper-parameter") changed.find(u => u.source.id === helper.id).parameters = changed.find(u => u.source.id === helper.id).parameters.filter((p: any) => p.name !== "flag")
    const denied = lowerSemanticFlow(project(changed).units, { compositional: true, propertyDirected: true })
    expect(denied.diagnostics.length).toBeGreaterThan(0)
  }
  expect(project(units, await buildStructureIndex([{ path: "app.py", content }, { path: "other.py", content: "def check(item):\n    return item\n" }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual(projected.uses)
  expect(project(units, await buildStructureIndex([{ path: "app.py", content: content.replace("if flag:", "if not flag:") }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual([])
})

for (const kind of ["class", "local", "callback", "deep"]) test(`returned decorator relays actual ancestor objects through an inner ${kind}`, async () => {
  const callback = kind === "callback", nested = kind === "deep" ? "        def inner(item):\n            def guard(value):\n                if flag:\n                    raise Denied\n                return value\n            return guard(item)\n        inner(actor)\n" : kind === "local" ? "        def guard(item):\n            if flag:\n                raise Denied\n            return item\n        guard(actor)\n" : `        class Local:\n            def guard(item):\n${callback ? "                return operation(item)\n" : "                if flag:\n                    raise Denied\n                return item\n"}        Local.guard(actor)\n`
  const content = `def entry(subject):\n    first = create(${callback ? "allow" : "False"})\n    second = create(${callback ? "deny" : "True"})\n    ${callback ? "operation" : "flag"} = False\n    if ${callback ? "operation" : "flag"}:\n        raise Denied\n    first(subject)\n    second(subject)\n    return True\ndef create(${callback ? "operation" : "flag"}):\n    def decorator(actor):\n${nested}        return actor\n    return decorator\n${callback ? "def allow(item):\n    return item\ndef deny(item):\n    raise Denied\n" : ""}`
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-transitive-capture-")); await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  const decorator = index.symbols.find(s => s.name === "decorator")!, guard = index.symbols.find(s => s.name === "guard")!, parameter = callback ? "operation" : "flag"
  expect(decorator.valueCallable?.gap).toBeUndefined(); expect(decorator.valueCallable?.captures.map(c => c.name)).toEqual([parameter])
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!; expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise", "condition", "assignment"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject", "item", "value"].includes(a.name!) ? "principal" : "condition" : ["call", "condition"].includes(a.kind) ? "condition" : "context", explanation: "Anonymous stable ancestor parameter relay", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: a.text }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.id, handle: source.id, questionId: "q", role: source.name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([]); units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual returned decorator environments", premises: [] }] })
  const project = (adopted = units, current = index) => { const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }); for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored"); return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true }) }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(units.find(u => u.role === "entry").blocks.flatMap((b: any) => b.steps).some((s: any) => s.result === parameter || s.bindingName === parameter)).toBe(true)
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(callback ? 7 : kind === "deep" ? 6 : 5)
  expect(lowered.diagnostics).toEqual([]); expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.filter(r => r.kind === "call" && r.sourceOrigin?.handle === guard.id)).toHaveLength(callback ? 2 : 0)
  expect(lowered.delta.rules.filter(r => r.kind === "call" && r.sourceOrigin?.handle === decorator.id)).toHaveLength(2)
  for (const mutation of ["relay-environment", "missing-relay-parameter", "inner-environment"]) {
    if (["local", "deep"].includes(kind) && mutation === "inner-environment") continue
    const changed = structuredClone(units), create = changed.find(u => u.source.id === index.symbols.find(s => s.name === "create")!.id), captured = create.blocks.flatMap((b: any) => b.steps).find((s: any) => s.sourceCallable), inner = changed.find(u => u.source.id === decorator.id)
    if (mutation === "relay-environment") captured.sourceCallable.captures[0].object = "forged"
    if (mutation === "missing-relay-parameter") inner.parameters = inner.parameters.filter((p: any) => p.name !== parameter)
    if (mutation === "inner-environment") inner.blocks.flatMap((b: any) => b.steps).find((s: any) => s.sourceCallable).sourceCallable.captures[0].object = "actor"
    const denied = lowerSemanticFlow(project(changed).units, { compositional: true, propertyDirected: true })
    expect(denied.diagnostics.length).toBeGreaterThan(0)
  }
  expect(project(units, await buildStructureIndex([{ path: "app.py", content }, { path: "other.py", content: "def guard(item):\n    return item\n" }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual(projected.uses)
  expect(project(units, await buildStructureIndex([{ path: "app.py", content: content.replace(callback ? "return operation(item)" : "if flag:", callback ? "return item" : "if not flag:") }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual([])
})

for (const mode of ["direct", "inherited", "override", "keyword", "explicit-self", "overwrite", "field-order", "try", "diamond"]) test(`local class namespace functions use actual captures and unbound class arguments: ${mode}`, async () => {
  const signature = mode === "explicit-self" ? "self, actor" : "actor", invocation = mode === "keyword" ? "actor=subject" : mode === "explicit-self" ? "Local, subject" : "subject"
  const method = `${mode === "field-order" ? "        guard = None\n" : ""}        def guard(${signature}):\n            if flag:\n                raise Denied\n            return actor\n`
  const content = `def entry(subject):\n    make(True, subject)\n    return True\ndef make(flag, subject):\n${["direct", "keyword", "explicit-self", "field-order"].includes(mode) ? `    class Local:\n${method}` : `    class Base:\n${method}${mode === "diamond" ? "    class Left(Base):\n        pass\n    class Right(Base):\n        def guard(actor):\n            return actor\n" : ""}    class Local(${mode === "diamond" ? "Left, Right" : "Base"}):\n${mode === "override" ? "        def guard(actor):\n            return actor\n" : "        pass\n"}`}${mode === "overwrite" ? "    Base.guard = None\n" : ""}${mode === "try" ? `    try:\n        Local.guard(${invocation})\n    except Denied:\n        return True\n` : `    Local.guard(${invocation})\n`}    return True\n`
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-class-namespace-")); await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  const methods = index.symbols.filter(s => s.className && s.name === "guard"), definitions = index.symbols.filter(s => s.classDefinition)
  expect(definitions.every(s => !s.classDefinition!.gap)).toBe(true)
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!; expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise", "condition", "assignment"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" || a.kind === "condition" ? "condition" : "context", explanation: "Anonymous actual class namespace interpretation", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.id, handle: source.id, questionId: "q", role: source.name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([]); units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const entry = units.find(u => u.source.id === index.symbols.find(s => s.name === "entry")!.id), owner = units.find(u => u.source.id === index.symbols.find(s => s.name === "make")!.id), call = index.relatedCalls(owner.source.id).find(c => c.expression === "Local.guard")!
  expect(call.resolution).toBe("resolved"); expect((call as any).classNamespaceCall).toBeDefined()
  const namespaceProgram = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual namespace functions", premises: [] }] })
  const project = (adopted = units, current = index) => { const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }); for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored"); return api.projectSourceMaterials(namespaceProgram, [entry, ...adopted.filter(u => u !== entry)], store.snapshot(), current, { questionDirected: true }) }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(lowered.diagnostics.map(d => d.code)).toEqual(mode === "overwrite" ? ["source-callable-value-unresolved"] : [])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(mode === "overwrite" ? [undefined] : ["override", "try", "diamond"].includes(mode) ? ["allow"] : ["deny"])
  for (const mutation of ["method-sha", "capture", "missing-method", "wrong-field", "late-method", "base", "callee", "argument"]) {
    if (mutation === "base" && !definitions.some(s => s.classDefinition!.bases?.length)) continue
    const changed = structuredClone(units), body = changed.find(u => u.source.id === owner.source.id).blocks.find((b: any) => b.steps.some((s: any) => s.name.startsWith("class-method-"))), creation = body.steps.find((s: any) => s.kind === "assign-value" && s.sourceCallable)
    if (mutation === "method-sha") creation.sourceCallable.targetSha256 = "forged"
    else if (mutation === "capture") creation.sourceCallable.captures = [{ parameter: "flag", object: "subject" }]
    else if (mutation === "missing-method") body.steps = body.steps.filter((s: any) => s !== creation)
    else if (mutation === "wrong-field") body.steps.find((s: any) => s.name.startsWith("class-method-field-")).field = "different"
    else if (mutation === "late-method") body.steps.push(body.steps.splice(body.steps.indexOf(creation), 1)[0])
    else if (mutation === "base") body.steps.find((s: any) => s.sourceClass?.bases?.length).sourceClass.bases = ["subject"]
    else { const invocation = owner && changed.find(u => u.source.id === owner.source.id).blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.sourceCallId === call.id); if (mutation === "callee") invocation.callableRead.object = "Base.guard"; else invocation.arguments[0].object = "flag" }
    expect(project(changed).uses.filter((u: any) => u.kind === "call").length).toBeLessThan(2)
  }
  expect(methods.length).toBeGreaterThan(0)
  if (mode === "direct") {
    expect(project(units, await buildStructureIndex([{ path: "app.py", content }, { path: "unrelated.py", content: "def guard(actor):\n    return actor\n" }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual(projected.uses)
    expect(project(units, await buildStructureIndex([{ path: "app.py", content: content.replace("raise Denied", "return actor") }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual([])
  }
})

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
test("an entry reaccepted after an intermediate interpretation projects its actual reachable helper", async () => {
  const f = await fixture(), helper = f.accept(f.helper), original = f.accept(f.entry)
  const intermediate = structuredClone(f.entry)
  intermediate.blocks[0].steps[0].claim = "Intermediate test-authored call interpretation"
  f.accept(intermediate)
  const refreshed = { ...f.entry, handle: "current-entry", itemId: "current-focus", op: "replace", evidenceIds: ["current-evidence"] }
  f.accept(refreshed)
  const projected = api.projectSourceMaterials(program, [refreshed], f.store.snapshot(), f.index)
  expect(projected.units).toHaveLength(4)
  expect(new Set(projected.uses.map((u: any) => u.materialId))).toEqual(new Set([original.id, helper.id]))
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(projected.units.filter((u: any) => u.role === "entry").every((u: any) => u.handle === "current-entry")).toBe(true)
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

test("v5 material footprints belong to their source receiver rather than the whole work queue", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-framework-footprints-"))
  await mkdir(path.join(sourceRoot, "rest_framework"))
  await writeFile(path.join(sourceRoot, "rest_framework/views.py"), "class Base:\n    def dispatch(self, request):\n        return True\n")
  await writeFile(path.join(sourceRoot, "alpha.py"), "from rest_framework.views import Base\nclass Alpha(Base):\n    def run_alpha(self, request):\n        return True\ndef helper(request):\n    return request\n")
  await writeFile(path.join(sourceRoot, "beta.py"), "from rest_framework.views import Base\nclass Beta(Base):\n    def run_beta(self, request):\n        return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "alpha", request: "run_alpha", entryHint: "run_alpha" }, { id: "beta", request: "run_beta", entryHint: "run_beta" }], questions: [{ id: "a", operationId: "alpha", intent: "behavior", request: "run_alpha", premises: [] }, { id: "b", operationId: "beta", intent: "behavior", request: "run_beta", premises: [] }] })
  const units: any[] = []
  for (const [name, questionId] of [["run_alpha", "a"], ["run_beta", "b"], ["helper", "a"]]) {
    const s = tools.structure!.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: s.path, startLine: s.startLine, endLine: s.endLine })
    units.push({ itemId: name, handle: name, questionId, op: "add", role: name === "helper" ? "helper" : "entry", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, receiverClass: s.className, evidenceIds: read.evidence.map(e => e.id), coverage: "path", start: "body", complete: true, parameters: s.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Anonymous actual source return", value: true, ...(name === "helper" ? {} : { outcome: "allow" }) }] }] })
  }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units })
  await runtime.sync(false)
  const { questionId: _q, evidenceIds: _e, source: _s, receiverClass: _r, ...replacement } = units[0]
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ ...replacement, op: "replace" }] })
  const materials = runtime.report().sourceMaterials!.materials.filter(m => m.current)
  const keys = (name: string) => materials.find(m => m.unit.handle === name)!.dependencies.filter(d => d.kind === "framework-model").map(d => d.key)
  expect(keys("run_alpha")).toEqual(["drf-source-dispatch/v2:alpha.Alpha"])
  expect(keys("run_beta")).toEqual(["drf-source-dispatch/v2:beta.Beta"])
  expect(keys("helper")).toEqual([])
  const snapshot = runtime.report().sourceMaterials!, files = await Promise.all(["alpha.py", "beta.py", "rest_framework/views.py"].map(async file => ({ path: file, content: await readFile(path.join(sourceRoot, file), "utf8") })))
  const project = async (current: typeof files) => api.projectSourceMaterials(program, units, snapshot, await buildStructureIndex(current, { repository: "anonymous", sourceRef: "r" }))
  expect((await project([...files, { path: "rest_framework/unused.py", content: "class Unused:\n    def check(self):\n        return False\n" }])).units.map((u: any) => u.handle).sort()).toEqual(["run_alpha", "run_beta"])
  expect((await project(files.map(f => f.path === "beta.py" ? { ...f, content: f.content.replace("True", "False") } : f))).units.map((u: any) => u.handle)).toEqual(["run_alpha"])
  expect((await project(files.map(f => f.path === "rest_framework/views.py" ? { ...f, content: f.content.replace("True", "False") } : f))).uses).toEqual([])
})

async function requestFixture(nested = false, registered = true, transform: (source: string) => string = source => source) {
  const content = transform(`from fastapi import APIRouter, Depends, Request\nrouter = APIRouter()\n${nested ? "def lookup(request: Request):\n    actor = request.user\n    return actor\ndef verify(actor=Depends(lookup)):\n    return actor\n" : "def verify(request: Request):\n    raise Denied()\n"}${registered ? '@router.post("/work")\n' : ""}def endpoint(request: Request, actor=Depends(verify)):\n    resource = request.resource\n    write(actor, resource)\n    return True\n`)
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), accepted: any[] = []
  const accept = (name: string, role: string, steps: any[], types: Record<string, string> = {}) => {
    const source = index.symbols.find(s => s.name === name)!, unit: any = { itemId: name, handle: name, questionId: "q", op: "add", role, source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, evidenceIds: [`ev-${source.id}`], coverage: "path", start: "body", complete: true, fallthrough: "allow", parameters: source.parameters.map(p => ({ name: p.name, type: types[p.name] ?? "value" })), blocks: [{ name: "body", steps }] }
    store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }], "test-authored"); accepted.push(unit); return unit
  }
  if (registered && index.symbols.some(s => s.name === "POST /work")) accept("POST /work", "helper", [{ kind: "context", name: "registration", claim: "Actual source registration", relationship: "route-registration" }])
  if (nested) accept("lookup", "helper", [{ kind: "bind", name: "actor", type: "principal", claim: "Test-authored source object reading" }, { kind: "return", name: "returned", object: "actor", claim: "Actual actor return" }])
  accept("verify", "helper", nested ? [{ kind: "return", name: "returned", object: "actor", claim: "Actual dependency return" }] : [{ kind: "raise", name: "denied", exceptionType: "Denied", failureKind: "authorization", claim: "Actual source rejection" }], nested ? { actor: "principal" } : {})
  const entry = accept("endpoint", "entry", [{ kind: "bind", name: "resource", type: "resource", claim: "Test-authored source resource reading" }, { kind: "effect", name: "write", principal: "actor", resource: "resource", operation: "write", claim: "Actual protected source write" }, { kind: "return", name: "done", value: true, outcome: "allow", claim: "Test-authored entry outcome" }], { actor: "principal" })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "request", request: "POST /work", entryHint: "endpoint" }], questions: [{ id: "q", operationId: "request", intent: "behavior", request: "Inspect this request", premises: [] }] })
  return { index, store, accepted, entry, program, project: (snapshot = store.snapshot()) => api.projectSourceMaterials(program, accepted, snapshot, index, { questionDirected: true }) }
}
test("v5 request projection runs the actual source dependency before the endpoint effect", async () => {
  const f = await requestFixture(), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toHaveLength(2)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(f.store.snapshot().materials.find(m => m.unit.handle === "endpoint")!.unit.parameters.some(p => p.name === "actor")).toBe(true)
})
test("a proven framework request supplies Request to a dependency even without an endpoint Request parameter", async () => {
  const f = await requestFixture(false, true, source => source.replace("def endpoint(request: Request, actor=", "def endpoint(actor=").replace("resource = request.resource", "resource = object()")), projected = f.project()
  expect(lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }).delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(projected.uses.find((u: any) => u.kind === "entry").contextArguments).toEqual([{ parameter: "$request-context", object: "$request-context" }])
  expect(projected.uses.find((u: any) => u.frameworkModel === "fastapi-source-injection/v1").arguments).toEqual([{ parameter: "request", object: "$request-context" }])
  expect(f.entry.parameters.map((p: any) => p.name)).toEqual(["actor"])
})
test("v5 nested request dependencies return the same typed principal to the endpoint", async () => {
  const f = await requestFixture(true), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toHaveLength(3)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.kind === "effect").map(r => r.principal)).toEqual(lowered.delta.rules.filter(r => r.kind === "binding" && r.bindingKind === "principal").map(r => r.bindingKey))
  expect(projected.units.find((u: any) => u.role === "entry").parameters.map((p: any) => p.name)).toEqual(["request"])
  const outer = projected.uses.find((u: any) => u.kind === "framework" && u.sourceId === f.accepted.find(u => u.handle === "verify").source.id)
  expect(outer.arguments).toEqual([])
  expect(outer.contextArguments).toEqual([{ parameter: "$request-context", object: "request" }])
})
test("dependencies with only injected arguments need no synthetic Request parameter", async () => {
  const f = await requestFixture(true, true, source => source.replace("def lookup(request: Request):", "def lookup():")), projected = f.project()
  const outer = projected.uses.find((u: any) => u.kind === "framework" && u.sourceId === f.accepted.find(u => u.handle === "verify").source.id)
  expect(outer.arguments).toEqual([])
  expect(projected.units.find((u: any) => u.handle === outer.projectedHandle).parameters).toEqual([])
  expect(lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }).diagnostics).toEqual([])
})
test("an unadopted request dependency remains a source gap before the endpoint", async () => {
  const f = await requestFixture(), snapshot = f.store.snapshot(); snapshot.materials = snapshot.materials.filter(m => m.unit.handle !== "verify")
  const lowered = lowerSemanticFlow(f.project(snapshot).units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics.map(d => d.code)).toContain("framework-dependency-uninterpreted")
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
})
test("ordinary Python default declarations never invoke request dependencies", async () => {
  const f = await requestFixture(false, false), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toEqual([])
  expect(lowerSemanticFlow(projected.units).delta.rules.some(r => r.kind === "effect")).toBe(true)
})
for (const [statement, expected] of [["Request = replacement\n", "framework-request-argument-unbound"], ["verify = replacement\n", "framework-dependency-target-rebound"], ["verify.__code__ = replacement\n", "framework-dependency-target-rebound"], ["Depends = replacement\n", "framework-constructor-rebound"]] as const) test(`rebound request source binding ${statement.trim()} withdraws its original proof`, async () => {
  const f = await requestFixture(false, true, source => source.replace('@router.post("/work")', `${statement}@router.post("/work")`))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(expected!)
  expect(f.project().uses.filter((u: any) => u.kind === "framework" && u.frameworkModel === "fastapi-source-injection/v1")).toEqual([])
})
test("a rebound router constructor retains a boundary rather than executing a framework model", async () => {
  const f = await requestFixture(false, true, source => source.replace("router = APIRouter()", "APIRouter = replacement\nrouter = APIRouter()"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-route-binding-unresolved")
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})
for (const [declaration, code] of [["if configured:\n    def verify(request: Request):\n        raise Denied()\n", "framework-dependency-target-binding-unresolved"], ["@replacement\ndef verify(request: Request):\n    raise Denied()\n", "framework-dependency-target-wrapper-unmodeled"]]) test(`request projection retains ${code}`, async () => {
  const f = await requestFixture(false, true, source => source.replace("def verify(request: Request):\n    raise Denied()\n", declaration!))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code!)
})
test("an injected Request parameter is not a proven external request environment", async () => {
  const f = await requestFixture(true, true, source => source.replace("def endpoint(request: Request,", "def endpoint(request: Request=Depends(lookup),"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-request-argument-unbound")
})
test("an annotation dependency stays a named boundary until its injection form is supported", async () => {
  const f = await requestFixture(false, true, source => "from typing import Annotated\n" + source.replace("actor=Depends(verify)", "actor: Annotated[object, Depends(verify)]"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-dependency-annotation-unsupported")
  expect(f.project().uses.filter((u: any) => u.frameworkModel === "fastapi-source-injection/v1")).toEqual([])
})

test("actual source pack forwarding adopts a rejecting helper before the following effect", async () => {
  const source = "class Gate:\n    def entry(self, actor, *args, **kwargs):\n        self.guard(actor, *args, **kwargs)\n        write()\n        return True\n    def guard(self, actor, *rest, **options):\n        raise Denied()\n"
  const index = await buildStructureIndex([{ path: "app.py", content: source }], { repository: "anonymous", sourceRef: "r" })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), accepted: any[] = []
  const add = (name: string, steps: any[]) => {
    const s = index.symbols.find(s => s.name === name)!, u: any = { itemId: name, handle: name, questionId: "q", op: "add", role: name === "entry" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, receiverClass: "app.Gate", evidenceIds: ["ev"], start: "body", complete: true, coverage: "path", parameters: s.parameters.map(p => ({ name: p.name, type: p.name === "actor" ? "principal" : "value" })), blocks: [{ name: "body", steps }] }
    store.accept(u, [{ kind: "source-span", key: s.path, revision: s.sha256 }, { kind: "symbol-resolution", key: s.id, revision: s.sha256 }], "test-authored"); accepted.push(u); return u
  }
  add("guard", [{ kind: "raise", name: "rejected", claim: "Anonymous source rejection", exceptionType: "Denied", failureKind: "authorization" }])
  const s = index.symbols.find(s => s.name === "entry")!, call = index.relatedCalls(s.id, "app.Gate").find(c => c.expression === "self.guard")!
  add("entry", [{ kind: "call", name: "guard", claim: "Actual source forwarding", symbol: "self.guard", sourceCallId: call.id, arguments: [{ parameter: "self", object: "self" }, { parameter: "actor", object: "actor" }, { parameter: "rest", object: "args" }, { parameter: "options", object: "kwargs" }] }, { kind: "effect", name: "write", claim: "Anonymous following operation", operation: "write" }, { kind: "return", name: "done", claim: "Anonymous source return", outcome: "allow", value: true }])
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "request", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "request", intent: "behavior", request: "Inspect source continuation", premises: [] }] })
  const projected = api.projectSourceMaterials(p, accepted, store.snapshot(), index, { questionDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const tampered = structuredClone(accepted); tampered.find(u => u.role === "entry").blocks[0].steps[0].arguments[3].object = "different_pack"
  const tamperedStore = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of tampered) tamperedStore.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
  expect(api.projectSourceMaterials(p, tampered, tamperedStore.snapshot(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toEqual([])
})
for (const [replacement, code] of [["router = APIRouter(dependencies=[Depends(global_guard)])", "framework-router-options-unmodeled"], ["router = APIRouter(route_class=CustomRoute)", "framework-router-options-unmodeled"], ["router = APIRouter()\nrouter.dependency_overrides[verify] = replacement", "framework-dependency-overrides-unmodeled"]]) test(`request projection retains ${code} for source-visible request configuration`, async () => {
  const f = await requestFixture(false, true, source => source.replace("router = APIRouter()", replacement!))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code!)
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})
for (const [statement, code] of [["router.dependency_overrides.update({verify: replacement})", "framework-dependency-overrides-unmodeled"], ["router.add_middleware(Middleware)", "framework-router-options-unmodeled"], ["router.add_api_route('/other', replacement)", "framework-router-options-unmodeled"], ["parent = APIRouter()\nparent.mount('/v1', router)", "route-prefix-dynamic"]] as const) test(`source-visible framework modification ${statement} retains ${code}`, async () => {
  const f = await requestFixture(false, true, source => source.replace("import APIRouter,", "import FastAPI as APIRouter,").replace('@router.post("/work")', `def replacement():\n    return True\nclass Middleware:\n    pass\n${statement}\n@router.post("/work")`))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code)
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})

test("source-assisted local capture adoption keeps rejection before the following write and rejects a swapped capture", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-capture-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, decoy):\n    def guard():\n        selected = actor\n        raise Denied\n    guard()\n    write()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, accepted: any[] = []
  for (const name of ["entry", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const actor = skeleton.anchors.find(a => a.kind === "parameter" && a.name === "actor")!
    if (name === "guard") expect(actor).toMatchObject({ syntax: "source_capture", selector: { startLine: 3, endLine: 3 }, capture: { ownerId: index.symbols.find(s => s.name === "entry")!.id, ownerSha256: source.sha256 } })
    const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise" || a.name === "selected").map(a => ({ anchorId: a.id, role: a.kind === "parameter" || a.name === "selected" ? "principal" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous test-authored current source meaning", ...(a.name === "selected" ? { aliasAnchorId: actor.id } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    accepted.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  expect(accepted[1].parameters).toEqual([{ name: "actor", type: "principal" }])
  expect(accepted[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments).toEqual([{ parameter: "actor", object: "actor" }])
  const store = () => {
    const s = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of accepted) s.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
    return s.snapshot()
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect continuation", premises: [] }] })
  const snapshot = store(), projected = api.projectSourceMaterials(p, accepted, snapshot, index, { questionDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const changed = await buildStructureIndex([{ path: "app.py", content: (await readFile(path.join(sourceRoot, "app.py"), "utf8")).replace("selected = actor", "selected = decoy") }], { repository: "anonymous", sourceRef: "r" })
  expect(api.projectSourceMaterials(p, accepted, snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const guard = index.symbols.find(s => s.name === "guard")!, skeleton = (await tools.sourceSkeleton(guard.id))!
  const omitted = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.name === "selected" || a.kind === "raise").map(a => ({ anchorId: a.id, role: a.name === "selected" ? "principal" : "context", explanation: "Anonymous role without a captured actor type or alias", ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) })), unresolved: [] }, { index, itemId: "guard", handle: "guard", questionId: "q", role: "helper" })
  expect(omitted.unit!.parameters).toEqual([{ name: "actor", type: "value" }])
  const prior = accepted[1]; accepted[1] = { ...prior, ...omitted.unit! }
  expect(lowerSemanticFlow(api.projectSourceMaterials(p, accepted, store(), index, { questionDirected: true }).units, { compositional: true, propertyDirected: true }).diagnostics.map(d => d.code)).toContain("semantic-argument-unbound")
  accepted[1] = prior
  accepted[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments[0].object = "decoy"
  expect(api.projectSourceMaterials(p, accepted, store(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toEqual([])
})

test("a proved local callee remains inside the actual source branch", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-conditional-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    def guard():\n        return actor\n    if False:\n        guard()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  expect(skeleton.flow[0]!.kind).toBe("branch")
  expect(skeleton.anchors.find(a => a.id === skeleton.flow[0]!.then![0]!.anchorId)!.call!.expression).toBe("guard")
  const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", returnOutcome: "allow", explanation: "Anonymous source normal return" })), unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry", propertyDirected: true })
  expect(result.diagnostics).toEqual([])
  expect(result.unit!.blocks.flatMap(b => b.steps).filter(s => s.kind === "call")).toEqual([])
})

test("adopted public import helpers depend on selected hop bytes while unrelated exports stay outside their footprint", async () => {
  const files = [{ path: "app.py", content: "from api import helper\ndef entry(actor):\n    return helper(actor)\n" }, { path: "api/__init__.py", content: "from implementation import helper\n" }, { path: "implementation.py", content: "def helper(actor):\n    return actor\n" }], identity = { repository: "anonymous", sourceRef: "r" }, index = await buildStructureIndex(files, identity)
  const entrySource = index.symbols.find(s => s.name === "entry")!, helperSource = index.symbols.find(s => s.name === "helper")!, call = index.relatedCalls(entrySource.id)[0]!, accepted: any[] = []
  const store = createSourceMaterials({ ...identity, semanticVersion: "question-control/v1" })
  for (const source of [entrySource, helperSource]) {
    const u: any = { questionId: "q", itemId: source.name, handle: source.name, op: "add", role: source.name === "entry" ? "entry" : "helper", source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, evidenceIds: ["ev"], coverage: "path", start: "body", complete: true, parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [...source.name === "entry" ? [{ kind: "call", name: "helper", claim: "Anonymous actual public source call", symbol: "helper", sourceCallId: call.id, arguments: [{ parameter: "actor", object: "actor" }] }] : [], { kind: "return", name: "returned", claim: "Anonymous actual source return", object: "actor", ...source.name === "entry" ? { outcome: "allow" } : {} }] }] }
    accepted.push(u)
    store.accept(u, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, { kind: "candidate-set", key: `relations:${source.id}:`, revision: sourceRelationRevision(index, source.id)! }], "test-authored")
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect source", premises: [] }] }), snapshot = store.snapshot()
  expect(api.projectSourceMaterials(p, accepted, snapshot, index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const changed = await buildStructureIndex(files.map(s => s.path === "api/__init__.py" ? { ...s, content: s.content + "# selected import bytes changed\n" } : s), identity)
  expect(api.projectSourceMaterials(p, accepted, snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const unrelated = await buildStructureIndex([...files, { path: "other/__init__.py", content: "from implementation import helper\n" }], identity)
  expect(api.projectSourceMaterials(p, accepted, snapshot, unrelated, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
})

for (const mode of ["direct", "repeat", "alias", "field", "branch", "try", "import", "pair", "raised"]) test(`ordinary source class arguments retain actual decorator changes: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-source-class-")), body = mode === "raised" ? "    try:\n        decorate(Gate)\n    except Denied:\n        inspect(Gate)\n" : mode === "pair" ? "    inspect_pair(decorate(Gate), Gate)\n" : mode === "repeat" ? "    decorate(Gate)\n    inspect(Gate)\n" : mode === "alias" ? "    changed = decorate(Gate)\n    saved = changed\n    inspect(saved)\n" : mode === "field" ? "    context.saved = decorate(Gate)\n    inspect(context.saved)\n" : mode === "branch" ? "    if True:\n        changed = decorate(Gate)\n        inspect(changed)\n" : mode === "try" ? "    try:\n        changed = decorate(Gate)\n        inspect(changed)\n    except Denied:\n        raise\n" : "    changed = decorate(Gate)\n    inspect(changed)\n"
  const content = `${mode === "import" ? "from classes import Gate\n" : "class Gate:\n    pass\n"}def entry(context):\n${body}    write()\n    return True\ndef decorate(cls):\n    cls.enabled = True\n${mode === "raised" ? "    raise Denied\n" : ""}    return cls\ndef inspect(cls):\n    if cls.enabled:\n        raise Denied\n    return cls\n${mode === "pair" ? "def inspect_pair(left, right):\n    inspect(right)\n    return left\n" : ""}`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  if (mode === "import") await writeFile(path.join(sourceRoot, "classes.py"), "class Gate:\n    pass\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "decorate", "inspect", ...mode === "pair" ? ["inspect_pair"] : []]) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    const annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : a.kind === "condition" ? "condition" : "context", explanation: "Anonymous source class object, original decorator mutation and continuation", ...(a.kind === "condition" && !a.literalKnown ? { condition: { op: "truthy", language: "python", value: { binding: "cls.enabled" } } } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper", propertyDirected: true })
    expect(skeleton.gaps).toEqual([])
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual class mutation and original continuation", premises: [] }] }), project = (current = units, currentIndex = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of current) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return api.projectSourceMaterials(p, current, store.snapshot(), currentIndex, { questionDirected: true })
  }
  expect(units[0].blocks.flatMap((b: any) => b.steps).some((s: any) => s.sourceClass)).toBe(true)
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  for (const change of ["metadata", "token", "target", "result", "late"]) {
    const forged = structuredClone(units), root = forged[0], block = root.blocks.find((b: any) => b.steps.some((s: any) => s.sourceClass)), creation = block.steps.find((s: any) => s.sourceClass)
    if (change === "metadata") delete creation.sourceClass
    if (change === "token") creation.value.literal = "forged-token"
    if (change === "target") creation.sourceClass.targetSha256 = "old-source"
    if (change === "result") creation.result = "other-object"
    if (change === "late") block.steps.push(...block.steps.splice(block.steps.indexOf(creation), 1))
    expect(project(forged).units.some((u: any) => u.source.id === root.source.id)).toBe(false)
  }
  const changed = await buildStructureIndex(mode === "import" ? [{ path: "app.py", content }, { path: "classes.py", content: "class Gate:\n    changed = True\n" }] : [{ path: "app.py", content: content.replace("    pass", "    changed = True") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
  if (mode === "import") {
    const unrelated = await buildStructureIndex([{ path: "app.py", content }, { path: "classes.py", content: "class Gate:\n    pass\n" }, { path: "other.py", content: "class Gate:\n    changed = True\n" }], { repository: "anonymous", sourceRef: "r" })
    expect(project(units, unrelated).uses.length).toBe(projected.uses.length)
  }
})

for (const mode of ["direct", "passed", "inline", "forwarded", "two-environments", "caller-rebound", "direct-branch", "direct-try", "inline-branch", "inline-skipped", "inline-try"]) test(`returned source functions retain their actual factory environment: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-returned-environment-"))
  const body = ["inline-branch", "inline-skipped"].includes(mode) ? `    if ${mode === "inline-skipped" ? "False" : "True"}:\n        consume(create(True), actor)\n` : mode === "inline-try" ? "    try:\n        consume(create(True), actor)\n    except Denied:\n        raise\n" : mode === "direct-branch" ? "    check = create(True)\n    if True:\n        check(actor)\n" : mode === "direct-try" ? "    check = create(True)\n    try:\n        check(actor)\n    except Denied:\n        raise\n" : mode === "inline" ? "    consume(create(True), actor)\n" : mode === "caller-rebound" ? "    setup(True, actor)\n" : mode === "two-environments" ? "    first = create(False)\n    second = create(True)\n    first(actor)\n    second(actor)\n" : `    check = create(True)\n    ${mode === "direct" ? "check(actor)" : mode === "forwarded" ? "forward(check, actor)" : "consume(check, actor)"}\n`
  await writeFile(path.join(sourceRoot, "app.py"), `def entry(actor):\n${body}    write()\n    return True\ndef create(flag):\n    def guard(subject):\n        if flag:\n            raise Denied\n        return subject\n    return guard\ndef consume(operation, actor):\n    operation(actor)\n    return actor\ndef forward(operation, actor):\n    consume(operation, actor)\n    return actor\ndef setup(flag, actor):\n    check = create(flag)\n    flag = False\n    check(actor)\n    observe(flag)\n    return actor\ndef observe(flag):\n    return flag\n`)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, accepted: any[] = []
  const names = ["entry", "create", "guard", ...["passed", "inline", "forwarded", "inline-branch", "inline-skipped", "inline-try"].includes(mode) ? ["consume"] : [], ...mode === "forwarded" ? ["forward"] : [], ...mode === "caller-rebound" ? ["setup", "observe"] : []]
  for (const name of names) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "condition", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : a.kind === "condition" ? "condition" : "context", explanation: "Anonymous test-authored actual returned function environment", ...(a.kind === "condition" && !a.literalKnown ? { condition: { op: "truthy", language: "python", value: { binding: "flag" } } } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper", propertyDirected: true })
    expect(result.diagnostics).toEqual([])
    accepted.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  const factory = accepted.find(u => u.handle === "create"), definition = factory.blocks.flatMap((b: any) => b.steps).find((s: any) => s.sourceCallable)
  expect(definition).toMatchObject({ kind: "assign-value", result: "guard", sourceCallable: { captures: [{ parameter: "flag", object: "flag" }] } })
  expect(accepted.find(u => u.handle === "guard").parameters.map((p: any) => p.name)).toEqual(["subject", "flag"])
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual returned source object and original continuation", premises: [] }] })
  const project = (units = accepted, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return api.projectSourceMaterials(p, units, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }), calls = projected.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).filter((s: any) => s.kind === "call" && s.callableRead)
  if (mode === "inline-skipped") {
    expect(calls).toEqual([])
    expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
    expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(true)
    expect(lowered.delta.rules.some(r => r.terminal && r.outcome === "allow")).toBe(true)
    expect(lowered.diagnostics.map(d => d.code)).toEqual(["semantic-exception-type-unknown"])
    return
  }
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.every((s: any) => s.arguments.every((a: any) => a.parameter !== "flag" && !a.parameter.startsWith("source-callable-")))).toBe(true)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  if (["inline-branch", "inline-try"].includes(mode)) {
    const forged = structuredClone(accepted), entry = forged.find(u => u.handle === "entry"), original = entry.blocks.find((b: any) => b.steps.some((s: any) => s.kind === "call" && s.symbol === "create")), creation = original.steps.find((s: any) => s.kind === "call" && s.symbol === "create")
    original.steps.splice(original.steps.indexOf(creation), 1)
    entry.blocks.find((b: any) => b.name === entry.start).steps.unshift(creation)
    expect(project(forged).units.find((u: any) => u.handle === "entry").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "consume").callee).toBeUndefined()
  }
  if (mode === "caller-rebound") {
    const forged = structuredClone(accepted), setup = forged.find(u => u.handle === "setup"), block = setup.blocks.find((b: any) => b.name === setup.start), creation = block.steps.find((s: any) => s.kind === "call" && s.symbol === "create"), rebound = block.steps.find((s: any) => s.kind === "bind" && s.bindingName === "flag")
    expect(rebound).toBeDefined()
    block.steps.splice(block.steps.indexOf(creation), 1)
    block.steps.splice(block.steps.indexOf(rebound) + 1, 0, creation)
    const rejected = project(forged)
    expect(rejected.units.find((u: any) => u.handle === "setup").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "check").callee).toBeUndefined()
  }
  for (const change of ["creation", "capture", "return", "late-return"]) {
    const forged = structuredClone(accepted), owner = forged.find(u => u.handle === "create"), block = owner.blocks.find((b: any) => b.name === owner.start), created = block.steps.find((s: any) => s.sourceCallable), returned = block.steps.find((s: any) => s.kind === "return")
    if (change === "creation") delete created.sourceCallable
    if (change === "capture") created.sourceCallable.captures[0].object = "subject"
    if (change === "return") returned.valueFrom = "flag"
    if (change === "late-return") block.steps.unshift(...block.steps.splice(block.steps.indexOf(returned), 1))
    const rejected = project(forged), factoryMaterial = rejected.units.find((u: any) => u.handle === "create")
    expect(factoryMaterial).toBeUndefined()
    expect(lowerSemanticFlow(rejected.units, { compositional: true, propertyDirected: true }).delta.rules.some(r => r.terminal && r.outcome === "deny")).toBe(false)
  }
})

test("source-assisted returned callable adoption preserves creation, capture and rejection order", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-returned-adoption-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def create(principal):\n    def guard():\n        selected = principal\n        raise Denied\n    return guard\ndef entry(actor, decoy):\n    check = create(actor)\n    check()\n    write()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, accepted: any[] = []
  for (const name of ["entry", "create", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const principal = skeleton.anchors.find(a => a.kind === "parameter" && a.name === "principal")
    const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise" || a.name === "selected").map(a => ({ anchorId: a.id, role: a.kind === "parameter" && a.syntax !== "source_callable_instance" || a.name === "selected" ? "principal" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous test-authored current source meaning", ...(a.name === "selected" ? { aliasAnchorId: principal!.id } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    accepted.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  expect(accepted[1].blocks.flatMap((b: any) => b.steps).find((s: any) => s.result === "guard")).toMatchObject({ kind: "assign-value", sourceCallable: { captures: [{ parameter: "principal", object: "principal" }] } })
  expect(accepted[2].parameters.map((p: any) => p.name)).toEqual(["principal"])
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual creation and continuation", premises: [] }] })
  const project = (units = accepted, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return api.projectSourceMaterials(p, units, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const skipped = structuredClone(accepted)
  for (const block of skipped[0].blocks) block.steps = block.steps.map((s: any) => s.kind === "call" && s.symbol === "create" ? { kind: "context", name: s.name, relationship: "dispatch-binding", claim: "Test deliberately omits actual creation" } : s)
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const swapped = structuredClone(accepted)
  swapped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "check").arguments.push({ parameter: "principal", object: "decoy" })
  expect(project(swapped).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const overwritten = structuredClone(accepted)
  overwritten[0].blocks[0].steps.splice(1, 0, { kind: "bind", name: "forged-instance", bindingName: "check", type: "value", claim: "Test overwrites the factory result" })
  expect(project(overwritten).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const omittedCapture = structuredClone(accepted)
  omittedCapture[2].parameters = []
  expect(project(omittedCapture).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const reordered = structuredClone(accepted)
  for (const block of reordered[0].blocks) {
    const creation = block.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "create"), invocation = block.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "check")
    if (creation >= 0 && invocation >= 0) [block.steps[creation], block.steps[invocation]] = [block.steps[invocation], block.steps[creation]]
  }
  expect(project(reordered).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const stale = structuredClone(accepted)
  stale[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "create").callee = "guard"
  const rebound = project(stale)
  expect(rebound.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(rebound.units.find((u: any) => u.role === "entry").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "create").callee).toBe("create")
  const changed = await buildStructureIndex([{ path: "app.py", content: (await readFile(path.join(sourceRoot, "app.py"), "utf8")).replace("selected = principal", "selected = None") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(accepted, changed).uses).toEqual([])
})

test("source-assisted field adoption preserves returned resource identity across current helper calls", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-adoption-")), content = "def select(target):\n    return target\ndef prepare(ctx, target):\n    ctx.saved = select(target)\n    return ctx.saved\ndef guard(target):\n    raise Denied\ndef entry(ctx, target, decoy):\n    selected = prepare(ctx, target)\n    guard(ctx.saved)\n    write()\n    return True\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "select", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise").map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "ctx" ? "context" : "resource" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous source field and actual returned resource", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current field object and following write", premises: [] }] }), snapshot = store.snapshot(), projected = api.projectSourceMaterials(p, units, snapshot, index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(3)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.fieldChanges[0]!.source).toBe(lowered.delta.rules.find(r => r.bindingName === "target")!.bindingKey)
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("ctx.saved = select(target)", "ctx.saved = None") }], { repository: "anonymous", sourceRef: "r" })
  expect(api.projectSourceMaterials(p, units, snapshot, changed, { questionDirected: true }).uses).toEqual([])
})

for (const nested of [false, true]) test(`repeated identical stateful calls preserve each actual result in ${nested ? "same-line arguments" : "field stores"}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-occurrences-")), content = `def choose(ctx):
    selected = ctx.current
    ctx.current = ctx.next
    return selected
def guard(target):
    target.checked = True
    raise Denied
def consume(left, right):
    guard(right)
def entry(ctx, a, b):
    ctx.current = a
    ctx.next = b
${nested ? "    consume(choose(ctx), choose(ctx))" : "    ctx.first = choose(ctx)\n    ctx.second = choose(ctx)\n    guard(ctx.second)"}
    write()
    return True
`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "choose", "guard", ...nested ? ["consume"] : []]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, current = skeleton.anchors.find(a => a.name === "ctx.current" && !a.fieldWrite)
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind) || a.name === "selected" || a.id === current?.id).map(a => ({ anchorId: a.id, role: a.name === "selected" || a.id === current?.id ? "resource" : a.kind === "parameter" ? a.name === "ctx" ? "context" : "resource" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous current source and distinct stateful call results", ...(a.name === "selected" ? { aliasAnchorId: current!.id } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  const snapshot = () => {
    for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
    return store.snapshot()
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect the second actual result", premises: [] }] }), projected = api.projectSourceMaterials(p, units, snapshot(), index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(nested ? 4 : 3)
  expect(lowered.diagnostics).toEqual([])
  const identity = (name: string) => lowered.delta.rules.find(r => r.bindingName === name)!.bindingKey!
  expect(lowered.fieldChanges.find(c => c.field === "checked")!.object).toBe(identity("b"))
  if (!nested) {
    expect(lowered.fieldChanges.find(c => c.field === "first")!.source).toBe(identity("a"))
    expect(lowered.fieldChanges.find(c => c.field === "second")!.source).toBe(identity("b"))
  } else {
    const consume = units[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "consume")
    expect(new Set(consume.arguments.map((a: any) => a.object)).size).toBe(2)
    consume.arguments[1].object = consume.arguments[0].object
    expect(api.projectSourceMaterials(p, units, snapshot(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  }
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
})

test("a new inherited setter withdraws an earlier ordinary source field store", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-setter-footprint-")), files = [{ path: "app.py", content: "from base import Base\nclass View(Base):\n    def entry(self, target):\n        self.saved = target\n        return True\n" }, { path: "base.py", content: "class Base:\n    pass\n" }]
  for (const file of files) await writeFile(path.join(sourceRoot, file.path), file.content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, source = index.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id, "app.View"))!
  expect(skeleton.gaps).toEqual([])
  const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.name === "target" ? "resource" : "context", explanation: "Anonymous current source field", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const unit: any = { ...result.unit!, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds, receiverClass: "app.View" }, store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), revision = sourceRelationRevision(index, source.id, "app.View")!
  store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, { kind: "candidate-set", key: `relations:${source.id}:app.View`, revision }], "test-authored")
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual setter behavior", premises: [] }] }), snapshot = store.snapshot()
  expect(api.projectSourceMaterials(p, [unit], snapshot, index, { questionDirected: true }).uses).toHaveLength(1)
  const changed = await buildStructureIndex(files.map(f => f.path === "base.py" ? { ...f, content: "class Base:\n    def __setattr__(self, name, value):\n        raise Denied\n" } : f), { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(changed, source.id, "app.View")).not.toBe(revision)
  expect(api.projectSourceMaterials(p, [unit], snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const unrelated = await buildStructureIndex([...files, { path: "unrelated.py", content: "class Other:\n    def __setattr__(self, name, value):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(unrelated, source.id, "app.View")).toBe(revision)
})

test("a source-assisted method alias adopts the actual receiver only after its ordinary creation", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-alias-adoption-")), content = "class Gate:\n    def entry(self, actor, decoy, *args, **kwargs):\n        handler = self.guard\n        handler(actor, *args, **kwargs)\n        write()\n        return True\n    def guard(self, actor, *rest, **options):\n        raise Denied\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "self" ? "context" : ["actor", "decoy"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous ordinary method alias and actual receiver", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect method alias continuation", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const skipped = structuredClone(units), entry = skipped[0].blocks.flatMap((b: any) => b.steps), creation = entry.find((s: any) => s.kind === "assign-value" && s.result === "handler")
  expect(creation).toBeDefined()
  Object.assign(creation, { kind: "context", relationship: "dispatch-binding" })
  delete creation.result; delete creation.value; delete creation.methodRead
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const swapped = structuredClone(units)
  swapped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments[0].object = "decoy"
  expect(project(swapped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("handler = self.guard", "handler = self.other") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})
for (const selected of [true, false]) test(`finite method choice executes its original selected branch before write: ${selected}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-choice-")), content = `class Gate:\n    def entry(self, actor):\n        if ${selected ? "True" : "False"}:\n            handler = self.guard\n        else:\n            handler = self.fallback\n        handler(actor)\n        write()\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "guard", "fallback"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "self" ? "context" : "principal" : a.kind === "condition" || a.kind === "call" && a.call!.expression !== "write" ? "condition" : a.kind === "call" ? "effect" : "context", explanation: "Anonymous finite ordinary method selection", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: selected }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current method choice", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(lowered.diagnostics.map(d => d.code)).toEqual(selected ? [] : ["semantic-exception-type-unknown"])
  expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual([selected ? "deny" : "allow"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(!selected)
  const proof = index.relatedCalls(units[0].source.id, "app.Gate").find(c => c.expression === "handler")!.methodChoices!
  const skipped = structuredClone(units), creation = skipped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)
  Object.assign(creation, { kind: "context", relationship: "dispatch-binding" }); delete creation.result; delete creation.value; delete creation.methodRead
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const wrongGuard = structuredClone(units), choice = wrongGuard[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "choose" && s.name.startsWith("method-choice-"))
  choice.cases[0].condition.left.binding = "actor"
  const wrongGuardUses = project(wrongGuard).uses.filter((u: any) => u.kind === "call").length
  const moved = structuredClone(units), origin = moved[0].blocks.find((b: any) => b.steps.some((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)), destination = moved[0].blocks.find((b: any) => b.steps.some((s: any) => s.name === `assign-${proof.choices[1]!.anchorId}`))
  destination.steps.unshift(origin.steps.splice(origin.steps.findIndex((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`), 1)[0])
  expect(project(moved).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const missingInit = structuredClone(units)
  missingInit[0].blocks.find((b: any) => b.name === missingInit[0].start).steps = missingInit[0].blocks.find((b: any) => b.name === missingInit[0].start).steps.filter((s: any) => !s.name.startsWith("method-choice-init-"))
  expect(project(missingInit).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  const lateInit = structuredClone(units), lateStart = lateInit[0].blocks.find((b: any) => b.name === lateInit[0].start), initIndex = lateStart.steps.findIndex((s: any) => s.name.startsWith("method-choice-init-"))
  lateStart.steps.push(lateStart.steps.splice(initIndex, 1)[0])
  const lateInitUses = project(lateInit).uses.filter((u: any) => u.kind === "call").length
  const duplicate = structuredClone(units), duplicatedCreation = duplicate[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)
  duplicate[0].blocks.find((b: any) => b.name === duplicate[0].start).steps.splice(1, 0, structuredClone(duplicatedCreation))
  expect(() => project(duplicate)).toThrow("source-material-semantic-invalid")
  const missingFailure = structuredClone(units), failureChoose = missingFailure[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "choose" && s.name.startsWith("method-choice-"))
  missingFailure[0].blocks.find((b: any) => b.name === failureChoose.otherwise).steps = [{ kind: "return", name: "wrong-default", claim: "Forged uncreated path", outcome: "allow", value: true }]
  expect([lateInitUses, project(missingFailure).uses.filter((u: any) => u.kind === "call").length]).toEqual([0, 0])
  const duplicateCall = structuredClone(units), variant = duplicateCall[0].blocks.find((b: any) => b.steps.some((s: any) => s.kind === "call" && s.symbol === "handler")), copiedCall = structuredClone(variant.steps.find((s: any) => s.kind === "call"))
  copiedCall.name = "forged-extra-invocation"; variant.steps.push(copiedCall)
  const duplicateProjection = project(duplicateCall)
  expect(duplicateProjection.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).find((s: any) => s.name === copiedCall.name).callee).toBeUndefined()
  expect([wrongGuardUses, duplicateProjection.uses.filter((u: any) => u.kind === "call").length]).toEqual([0, 0])
  const wrongReceiver = structuredClone(units)
  wrongReceiver[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "handler").arguments[0].object = "actor"
  expect(project(wrongReceiver).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("handler = self.guard", "handler = self.fallback") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})

for (const mode of ["module", "local", "forwarded", "alternate", "branch", "skipped", "try", "captured-callback", "local-twice"]) test(`actual source function parameters dispatch the passed callable and environment: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-source-callable-")), local = mode === "local", content = `def entry(actor):\n    ${local ? "setup(True, actor)" : mode === "forwarded" ? "forward(guard, actor)" : `consume(${mode === "alternate" ? "fallback" : "guard"}, actor)`}\n    write()\n    return True\n${local ? "def setup(flag, actor):\n    def guard(subject):\n        if flag:\n            raise Denied\n        return subject\n    consume(guard, actor)\n    return actor\n" : "def guard(subject):\n    raise Denied\n"}def consume(operation, actor):\n    operation(actor)\n    return actor\n${mode === "forwarded" ? "def forward(operation, actor):\n    consume(operation, actor)\n    return actor\n" : mode === "alternate" ? "def elsewhere(actor):\n    consume(guard, actor)\n    return actor\ndef fallback(subject):\n    return subject\n" : ""}`
  const actualContent = mode === "branch" || mode === "skipped" ? content.replace("    consume(guard, actor)", `    if ${mode === "branch" ? "True" : "False"}:\n        consume(guard, actor)`) : mode === "try" ? content.replace("    consume(guard, actor)", "    try:\n        consume(guard, actor)\n    finally:\n        pass") : mode === "captured-callback" ? content.replace("    consume(guard, actor)", "    setup(guard, actor)") + "def setup(operation, actor):\n    def invoke(subject):\n        return operation(subject)\n    consume(invoke, actor)\n    return actor\n" : mode === "local-twice" ? "def entry(actor):\n    setup(False, actor)\n    setup(True, actor)\n    write()\n    return True\ndef setup(flag, actor):\n    def guard(subject):\n        if flag:\n            raise Denied\n        return subject\n    consume(guard, actor)\n    return actor\ndef consume(operation, actor):\n    operation(actor)\n    return actor\n" : content
  await writeFile(path.join(sourceRoot, "app.py"), actualContent)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const source of index.symbols.filter(s => s.kind === "function")) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? ["actor", "subject"].includes(a.name ?? "") ? "principal" : a.name === "flag" ? "condition" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : a.kind === "condition" ? "condition" : "context", explanation: "Anonymous original callable creation, parameter and captured environment", ...(a.kind === "condition" ? { condition: { op: "truthy", language: "python", value: a.literalKnown ? { literal: a.literalValue } : { binding: a.text } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) })), result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, propertyDirected: true, itemId: source.name, handle: source.name, questionId: "q", role: source.name === "entry" ? "entry" : "helper" })
    expect(skeleton.gaps).toEqual([])
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual passed function values", premises: [] }] }), project = (current = units) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of current) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return { ...api.projectSourceMaterials(p, current, store.snapshot(), index, { questionDirected: true }), materials: store.snapshot().materials }
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  if (mode === "skipped") {
    // Current material retention requires its complete positive creation graph;
    // source-invariant pruning has removed this original creation/call region.
    expect(projected.units).toEqual([])
    expect(projected.uses).toEqual([])
    expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
    return
  }
  expect(projected.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).some((s: any) => s.sourceCallable)).toBe(true)
  expect(projected.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).some((s: any) => s.callableRead)).toBe(true)
  expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(!["alternate", "skipped"].includes(mode))
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(["alternate", "skipped"].includes(mode))
  expect(lowered.diagnostics.map(d => d.code)).toEqual(["alternate", "skipped"].includes(mode) ? ["semantic-exception-type-unknown"] : [])
  if (["branch", "skipped", "try", "captured-callback", "local-twice"].includes(mode)) return
  for (const change of ["missing", "metadata", "target", "token", "capture", "result", "late", "foreign", "scope"]) {
    const forged = structuredClone(units), owner = forged.find(u => u.blocks.some((b: any) => b.steps.some((s: any) => s.sourceCallable))), block = owner.blocks.find((b: any) => b.steps.some((s: any) => s.sourceCallable)), creation = block.steps.find((s: any) => s.sourceCallable)
    if (change === "missing") block.steps.splice(block.steps.indexOf(creation), 1)
    if (change === "metadata") delete creation.sourceCallable
    if (change === "target") creation.sourceCallable.targetSha256 = "forged-source"
    if (change === "token") creation.value = { literal: "forged-token" }
    if (change === "capture") creation.sourceCallable.captures = [{ parameter: local ? "flag" : "subject", object: "actor" }]
    if (change === "result") creation.result = "forged-result"
    if (change === "scope") { if (local) creation.sourceCallable.scope = "module"; else delete creation.sourceCallable.scope }
    if (change === "late") block.steps.push(...block.steps.splice(block.steps.indexOf(creation), 1))
    if (change === "foreign") { const extra = structuredClone(creation); extra.name = "foreign-creation"; extra.result = "foreign-callable"; block.steps.unshift(extra) }
    expect(project(forged).units.some((u: any) => u.source?.id === owner.source.id), `${mode}:${change}`).toBe(false)
  }
  for (const change of ["selector", "case-target", "case-token", "extra-call", "extra-effect", "unknown", "argument", "late"]) {
    const forged = structuredClone(units), consumer = forged.find(u => u.handle === "consume"), dispatch = consumer.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "choose" && s.name.startsWith("function-call-")), variant = consumer.blocks.find((b: any) => b.name === dispatch.cases[0].body), invocation = variant.steps.find((s: any) => s.kind === "call")
    if (change === "selector") dispatch.cases[0].condition.left.binding = "actor"
    if (change === "case-target") invocation.candidateId = "forged-target"
    if (change === "case-token") dispatch.cases[0].condition.right.literal = "forged-token"
    if (change === "extra-call") { const extra = structuredClone(invocation); extra.name = "forged-invocation"; variant.steps.push(extra) }
    if (change === "extra-effect") variant.steps.unshift({ kind: "effect", name: "forged-effect", claim: "Extra effect", operation: "write" })
    if (change === "unknown") consumer.blocks.find((b: any) => b.name === dispatch.otherwise).steps = [{ kind: "return", name: "forged-default", claim: "Forged unknown", value: true }]
    if (change === "argument") for (const b of consumer.blocks) for (const s of b.steps) if (s.kind === "call") s.arguments[0].object = "operation"
    if (change === "late") { const parent = consumer.blocks.find((b: any) => b.steps.includes(dispatch)); parent.steps.push(...parent.steps.splice(parent.steps.indexOf(dispatch), 1)) }
    const result = project(forged)
    expect(result.uses.some((u: any) => u.kind === "call" && u.callerMaterialId === result.materials.find((m: any) => m.source.id === consumer.source.id)!.id), `${mode}:${change}`).toBe(false)
    expect(result.units.find((u: any) => u.handle === "consume")?.blocks.flatMap((b: any) => b.steps).filter((s: any) => s.kind === "call").every((s: any) => !s.callee), `${mode}:${change}`).toBe(true)
  }
})

for (const mode of ["nested-overwrite", "before-overwrite", "before-literal", "before-unknown", "argument-raise", "assignment", "return", "branch", "skipped-branch", "try", "multiple-arguments", "short-skipped", "short-or-skipped", "short-and-executed", "short-or-executed", "short-left-call", "short-multiple-arguments", "keyword-argument", "short-keyword"]) test(`ordinary direct methods capture before actual argument evaluation: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-early-method-capture-"))
  const multiple = mode.endsWith("multiple-arguments"), skippedArgument = ["short-skipped", "short-or-skipped", "short-multiple-arguments"].includes(mode), argument = mode === "multiple-arguments" ? "self.prepare(actor), self.observe(actor)" : mode === "short-multiple-arguments" ? "False and self.prepare(actor), self.observe(actor)" : mode === "short-skipped" ? "False and self.prepare(actor)" : mode === "short-or-skipped" ? "True or self.prepare(actor)" : mode === "short-and-executed" ? "True and self.prepare(actor)" : mode === "short-or-executed" ? "False or self.prepare(actor)" : mode === "short-left-call" ? "self.prepare(actor) and True" : mode === "keyword-argument" ? "actor=self.prepare(actor)" : mode === "short-keyword" ? "actor=False or self.prepare(actor)" : "self.prepare(actor)", invoke = `self.guard(${argument})`
  const invocation = mode === "assignment" ? `        value = ${invoke}\n` : mode === "return" ? `        return ${invoke}\n` : mode === "branch" || mode === "skipped-branch" ? `        if ${mode === "branch" ? "True" : "False"}:\n            ${invoke}\n` : mode === "try" ? `        try:\n            ${invoke}\n        finally:\n            pass\n` : `        ${invoke}\n`
  const content = `class Gate:\n    def entry(self, actor):\n${mode.startsWith("before-") ? `        self.guard = ${mode === "before-literal" ? "None" : mode === "before-unknown" ? "actor" : "self.fallback"}\n` : ""}${invocation}        write()\n        return True\n    def prepare(self, actor):\n        self.guard = self.fallback\n${multiple ? "        self.state = False\n" : mode === "argument-raise" ? "        raise Aborted\n" : ""}        return ${mode === "short-left-call" ? "True" : "actor"}\n    def guard(self, actor${multiple ? ", second" : ""}):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n${multiple ? "    def observe(self, actor):\n        self.state = True\n        return actor\n" : ""}`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "guard", "fallback", ...multiple ? ["observe"] : []]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!, annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? mode.startsWith("short-") && name === "guard" && a.name === "actor" ? "condition" : ["actor", "second"].includes(a.name ?? "") ? "principal" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : a.kind === "condition" ? "condition" : "context", explanation: "Anonymous Python function read before actual argument evaluation", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: a.literalValue }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: name === "prepare" ? "operation" : "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual function read before nested arguments", premises: [] }] }), project = (current = units) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of current) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, current, store.snapshot(), index, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(units.find(u => u.handle === "entry").blocks.flatMap((b: any) => b.steps).filter((s: any) => s.name.startsWith("method-capture-"))).toHaveLength(1)
  expect(projected.units.find((u: any) => u.role === "entry").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "self.guard").fieldMethodRead).toBeDefined()
  if (!skippedArgument && mode !== "skipped-branch") expect(lowered.fieldChanges.map(c => c.field)).toContain("guard")
  else expect(lowered.fieldChanges.map(c => c.field)).toEqual(mode === "short-multiple-arguments" ? ["state"] : [])
  expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(!mode.startsWith("before-") && !["argument-raise", "skipped-branch"].includes(mode))
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(mode === "skipped-branch")
  expect(lowered.diagnostics.map(d => d.code)).toEqual(mode.startsWith("before-") ? ["source-method-slot-written"] : mode === "skipped-branch" ? ["semantic-exception-type-unknown"] : [])
  if (mode === "argument-raise") expect(lowered.delta.rules.some(r => r.failureKind === "operation")).toBe(true)
  if (mode === "multiple-arguments") expect(lowered.fieldChanges.map(c => c.field)).toEqual(["guard", "state", "state"])
  if (mode === "multiple-arguments") {
    const forged = structuredClone(units), entry = forged.find(u => u.handle === "entry"), body = entry.blocks.find((b: any) => b.name === entry.start), first = body.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "self.prepare"), second = body.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "self.observe")
    ;[body.steps[first], body.steps[second]] = [body.steps[second], body.steps[first]]
    expect(project(forged).units.some((u: any) => u.source?.id === entry.source.id)).toBe(false)
  }
  if (mode.startsWith("short-")) for (const change of ["operator", "left", "right", "result", "body", "call-id", "after-invocation"]) {
    const forged = structuredClone(units), entry = forged.find(u => u.handle === "entry"), body = entry.blocks.find((b: any) => b.steps.some((s: any) => s.kind === "short-circuit")), short = body.steps.find((s: any) => s.kind === "short-circuit"), right = entry.blocks.find((b: any) => b.name === short.body)
    if (change === "operator") short.operator = short.operator === "and" ? "or" : "and"
    if (change === "left") short.left = { literal: "forged" }
    if (change === "right") short.right = { literal: "forged" }
    if (change === "result") short.result = "forged-result"
    if (change === "body") right.steps.push({ kind: "call", name: "forged-call", claim: "Forged invocation", symbol: "self.fallback", arguments: [] })
    if (change === "call-id") { const nested = entry.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "self.prepare"); nested.sourceCallId = "forged-source-call" }
    if (change === "after-invocation") body.steps.push(...body.steps.splice(body.steps.indexOf(short), 1))
    expect(project(forged).units.find((u: any) => u.role === "entry")?.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "self.guard")?.callee, change).toBeUndefined()
    expect(lowerSemanticFlow(project(forged).units, { compositional: true, propertyDirected: true }).delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
  }
  if (mode === "nested-overwrite" || mode.startsWith("before-")) for (const changed of ["omit", "metadata", "receiver", "target", "token", "after-argument", ...mode.startsWith("before-") ? ["before-store"] : []]) {
    const forged = structuredClone(units), entry = forged.find(u => u.handle === "entry"), body = entry.blocks.find((b: any) => b.name === entry.start), capture = body.steps.findIndex((s: any) => s.name.startsWith("method-capture-")), step = body.steps[capture]
    if (changed === "omit") body.steps.splice(capture, 1)
    if (changed === "metadata") delete step.boundMethod
    if (changed === "receiver") step.boundMethod.receiver = "actor"
    if (changed === "target") step.boundMethod.targetSha256 = "old"
    if (changed === "token") step.value = { literal: "forged" }
    if (changed === "after-argument") { body.steps.splice(capture, 1); body.steps.splice(body.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "self.prepare") + 1, 0, step) }
    if (changed === "before-store") { body.steps.splice(capture, 1); body.steps.unshift(step) }
    expect(project(forged).units.some((u: any) => u.source?.id === entry.source.id)).toBe(false)
  }
})

for (const { mode, field, later, other, local } of [
  { mode: "lookup", field: "guard" }, { mode: "lookup", field: "guard", local: true }, { mode: "lookup", field: "request", local: true },
  { mode: "lookup", field: "guard", later: true }, { mode: "lookup", field: "request" }, { mode: "lookup", field: "fallback" }, { mode: "lookup", field: "__class__" }, { mode: "lookup", field: "guard", other: true },
  { mode: "alias", field: "guard" }, { mode: "alias", field: "guard", later: true }, { mode: "alias", field: "guard", local: true }, { mode: "alias", field: "guard", later: true, local: true },
  { mode: "choice", field: "guard" }, { mode: "choice", field: "guard", later: true }, { mode: "choice", field: "guard", local: true },
  { mode: "alternate", field: "guard" }, { mode: "direct", field: "guard" }, { mode: "direct", field: "request" }, { mode: "super", field: "guard" },
]) test(`ordinary method creation preserves receiver slot state: ${mode}/${field}/${!!later}/${!!other}/${!!local}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-slot-overwrite-")), creation = mode === "lookup" ? "        handler = getattr(self, 'guard', self.fallback)\n" : mode === "alias" ? "        handler = self.guard\n" : mode === "direct" || mode === "super" ? "" : mode === "alternate" ? "        if False:\n            handler = getattr(self, 'guard')\n        else:\n            handler = self.guard\n" : "        if True:\n            handler = self.guard\n        else:\n            handler = self.fallback\n"
  const preparation = local ? `        self.${field} = None\n` : `        self.prepare(${other ? "other" : ""})\n`, guard = "    def guard(self, actor):\n        raise Denied\n", invocation = mode === "super" ? "super().guard" : mode === "direct" ? "self.guard" : "handler", content = `${mode === "super" ? `class Base:\n${guard}class Gate(Base):\n` : "class Gate:\n"}    def entry(self, actor${other ? ", other" : ""}):\n${later ? creation + preparation : preparation + creation}        ${invocation}(actor)\n        write()\n        return True\n    def prepare(self${other ? ", subject" : ""}):\n        ${other ? "subject" : "self"}.${field} = self.fallback\n        return True\n${mode === "super" ? "" : guard}    def fallback(self, actor):\n        return actor\n`, blocked = mode !== "super" && field !== "request" && !later && !other, helperUses = local ? 0 : 1
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "guard", "fallback"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "context" : a.kind === "condition" ? "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : ["getattr", "super"].includes(a.call!.expression) ? "context" : "condition" : "context", explanation: "Anonymous current method-slot overwrite and actual creation", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: a.literalValue }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current lookup after method-slot mutation", premises: [] }] }), store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
  const projected = api.projectSourceMaterials(p, units, store.snapshot(), index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(helperUses + (mode === "choice" ? 2 : 1))
  expect(lowered.fieldChanges.map(c => c.field)).toContain(field)
  expect(lowered.diagnostics.map(d => d.code)).toEqual(blocked ? ["source-method-slot-written"] : mode === "super" ? ["semantic-exception-type-unknown"] : [])
  expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(!blocked)
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  if (mode !== "direct" && mode !== "super") {
    for (const change of ["omit", "receiver", "method", ...mode === "lookup" ? ["default"] : []]) {
      const forged = structuredClone(units)
      for (const step of forged[0].blocks.flatMap((b: any) => b.steps)) if (step.kind === "assign-value" && step.result === "handler" && !step.name.startsWith("method-")) {
        if (change === "omit") delete step.methodRead
        else if (change === "default") delete step.methodRead.defaultMethod
        else step.methodRead[change] = change === "receiver" ? "actor" : "replacement"
      }
      const altered = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
      for (const u of forged) altered.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
      expect(api.projectSourceMaterials(p, forged, altered.snapshot(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(helperUses)
    }
  } else {
    const current = projected.units.find((u: any) => u.role === "entry").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === invocation)
    expect(current.methodRead).toEqual(mode === "super" ? undefined : { receiver: "self", method: "guard" })
  }
})

for (const mode of ["direct", "helper", "overwrite", "late-source-overwrite", "fallback", "uncreated", "early-return", "branch-created", "branch-skipped", "try-created", "finally-created", "nested-call-order", "right-call-order"]) test(`source field method invocation follows actual creation and store state: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-method-adoption-"))
  const prefix = ["helper", "early-return", "branch-created", "branch-skipped", "try-created", "finally-created", "nested-call-order", "right-call-order"].includes(mode) ? "        self.prepare()\n" : mode === "uncreated" ? "" : `        self.handler = self.${mode === "fallback" ? "fallback" : "guard"}\n`
  const suffix = mode === "overwrite" ? "        self.handler = None\n" : mode === "late-source-overwrite" ? "        self.guard = self.fallback\n" : ""
  const prepare = mode.startsWith("branch-") ? `        if ${mode === "branch-created" ? "True" : "False"}:\n            self.handler = self.guard\n` : mode === "try-created" ? "        try:\n            self.handler = self.guard\n        finally:\n            pass\n" : mode === "finally-created" ? "        try:\n            return True\n        finally:\n            self.handler = self.guard\n" : `${mode === "early-return" ? "        return True\n" : mode.endsWith("call-order") ? `        value = ${mode === "right-call-order" ? "False or self.reset()" : "self.reset() and True"}\n` : ""}        self.handler = self.guard\n`
  const content = `class Gate:\n    def entry(self, actor):\n${prefix}${suffix}        self.handler(actor)\n        write()\n        return True\n    def prepare(self):\n${prepare}        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n${mode.endsWith("call-order") ? "    def reset(self):\n        self.guard = self.fallback\n        return True\n" : ""}`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "guard", "fallback", ...mode.endsWith("call-order") ? ["reset"] : []]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!, annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : a.kind === "condition" ? "condition" : "context", explanation: "Anonymous original field method creation and actual receiver", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: a.literalValue }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual stored method invocation", premises: [] }] }), project = (current = units) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of current) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, current, store.snapshot(), index, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }), denied = ["direct", "helper", "late-source-overwrite", "branch-created", "try-created", "finally-created"].includes(mode)
  expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(denied)
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(mode === "fallback")
  if (["overwrite", "uncreated", "early-return", "branch-skipped"].includes(mode)) expect(lowered.diagnostics.map(d => d.code)).toContain("source-field-method-value-unresolved")
  else if (mode.endsWith("call-order")) expect(lowered.diagnostics.map(d => d.code)).toContain("source-method-slot-written")
  else expect(lowered.diagnostics.map(d => d.code)).toEqual(mode === "fallback" ? ["semantic-exception-type-unknown"] : [])
  if (mode === "helper") {
    const forged = structuredClone(units), prepare = forged.find(u => u.handle === "prepare"), creation = prepare.blocks.flatMap((b: any) => b.steps).find((s: any) => s.boundMethod)
    expect(creation).toBeDefined()
    delete creation.boundMethod
    expect(project(forged).units.some((u: any) => u.source?.id === prepare.source.id)).toBe(false)
    const rejected = lowerSemanticFlow(project(forged).units, { compositional: true, propertyDirected: true })
    expect(rejected.delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
    expect(rejected.delta.rules.some(r => r.kind === "effect")).toBe(false)
    for (const changed of ["receiver", "target", "token", "field", "source", "duplicate"]) {
      const forged = structuredClone(units), prepare = forged.find(u => u.handle === "prepare"), body = prepare.blocks.find((b: any) => b.name === prepare.start), capture = body.steps.find((s: any) => s.boundMethod), store = body.steps.find((s: any) => s.kind === "transform")
      if (changed === "receiver") capture.boundMethod.receiver = "actor"
      if (changed === "target") capture.boundMethod.targetSha256 = "obsolete"
      if (changed === "token") capture.value = { literal: "forged" }
      if (changed === "field") store.field = "other"
      if (changed === "source") store.source = "other"
      if (changed === "duplicate") body.steps.unshift({ ...structuredClone(capture), name: "forged-capture", result: "forged-value" })
      expect(project(forged).units.some((u: any) => u.source?.id === prepare.source.id)).toBe(false)
    }
    for (const changed of ["condition", "candidate", "otherwise", "extra-step"]) {
      const forged = structuredClone(units), entry = forged.find(u => u.handle === "entry"), dispatch = entry.blocks.flatMap((b: any) => b.steps).find((s: any) => s.name.startsWith("field-method-call-")), variant = entry.blocks.find((b: any) => b.name === dispatch.cases[0].body), invocation = variant.steps.find((s: any) => s.kind === "call")
      if (changed === "condition") dispatch.cases[0].condition = { op: "eq", left: { literal: true }, right: { literal: true } }
      if (changed === "candidate") invocation.candidateId = "other"
      if (changed === "otherwise") entry.blocks.find((b: any) => b.name === dispatch.otherwise).steps = []
      if (changed === "extra-step") variant.steps.unshift({ kind: "effect", name: "forged-effect", claim: "Forged execution before the source call" })
      const projected = project(forged)
      expect(projected.units.some((u: any) => u.source?.id === units.find(u => u.handle === "guard").source.id)).toBe(false)
      expect(lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }).delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
    }
  }
  if (mode === "early-return") {
    const forged = structuredClone(units), prepare = forged.find(u => u.handle === "prepare"), body = prepare.blocks.find((b: any) => b.name === prepare.start), returned = body.steps.findIndex((s: any) => s.kind === "return")
    body.steps.push(...body.steps.splice(returned, 1))
    expect(project(forged).units.some((u: any) => u.source?.id === prepare.source.id)).toBe(false)
  }
  if (mode.endsWith("call-order")) {
    const forged = structuredClone(units), prepare = forged.find(u => u.handle === "prepare"), body = prepare.blocks.find((b: any) => b.name === prepare.start), capture = body.steps.findIndex((s: any) => s.boundMethod)
    expect(capture).toBeGreaterThan(0)
    body.steps.unshift(...body.steps.splice(capture, 2))
    expect(project(forged).units.some((u: any) => u.source?.id === prepare.source.id)).toBe(false)
  }
})

test("a captured bound method cannot execute its old source body after a helper mutates the function object", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-function-mutation-")), content = "class Gate:\n    def entry(self, actor):\n        handler = self.guard\n        self.prepare()\n        handler(actor)\n        write()\n        return True\n    def prepare(self):\n        self.guard.__func__.__code__ = self.fallback.__func__.__code__\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "guard", "fallback"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous original source function mutation, not a callable-body proof", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect function mutation after bound method creation", premises: [] }] }), store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
  const projected = api.projectSourceMaterials(p, units, store.snapshot(), index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.delta.rules.some(r => r.failureKind === "authorization")).toBe(false)
  expect(lowered.diagnostics.map(d => d.code)).toContain("skeleton-function-attribute-write-unmodeled")
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
})

test("a new function behind an explicitly typed field withdraws an old ordinary data store", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-function-store-footprint-")), files = [{ path: "app.py", content: "from data import Data\ndef entry(subject: Data):\n    subject.saved.note = True\n    return True\n" }, { path: "data.py", content: "class Data:\n    pass\n" }]
  for (const file of files) await writeFile(path.join(sourceRoot, file.path), file.content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, source = index.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Anonymous typed data field store", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })) }, { index, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(skeleton.gaps).toEqual([])
  expect(result.diagnostics).toEqual([])
  const unit: any = { ...result.unit!, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds }, store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), revision = sourceRelationRevision(index, source.id)!
  store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, { kind: "candidate-set", key: `relations:${source.id}:`, revision }], "test-authored")
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect the current field protocol", premises: [] }] }), snapshot = store.snapshot()
  expect(api.projectSourceMaterials(p, [unit], snapshot, index, { questionDirected: true }).uses).toHaveLength(1)
  const changed = await buildStructureIndex(files.map(f => f.path === "data.py" ? { ...f, content: "class Data:\n    def saved(self):\n        raise Denied\n" } : f), { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(changed, source.id)).not.toBe(revision)
  expect(api.projectSourceMaterials(p, [unit], snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const unrelated = await buildStructureIndex([...files, { path: "other.py", content: "class Data:\n    def saved(self):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(unrelated, source.id)).toBe(revision)
})

for (const { selected, alternate, selector, repeat } of [
  { selected: true, alternate: true, selector: "guard", repeat: false },
  { selected: false, alternate: true, selector: "guard", repeat: false },
  { selected: false, alternate: false, selector: "guard", repeat: false },
  { selected: false, alternate: true, selector: "guard", repeat: true },
  { selected: false, alternate: true, selector: "missing", repeat: false },
  { selected: true, alternate: true, selector: "missing", repeat: false },
  { selected: undefined, alternate: false, selector: "guard", repeat: false },
]) test(`conditional lookup executes original try and uncreated paths: ${selected}/${alternate}/${selector}/${repeat}`, async () => {
  const content = `class Gate:\n    def entry(self, actor):\n        try:\n            if ${selected === undefined ? "flag" : selected ? "True" : "False"}:\n                handler = getattr(self, '${selector}', self.fallback)\n${alternate ? "            else:\n                handler = self.fallback\n" : ""}            handler(actor)\n${alternate ? "        except Denied:\n            return False\n" : "        finally:\n            pass\n"}${repeat ? "        handler(actor)\n" : ""}        write()\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n`
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-conditional-lookup-"))
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "guard", "fallback"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "context" : a.kind === "condition" ? "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : a.call!.expression === "getattr" ? "context" : "condition" : "context", explanation: "Anonymous original conditional method lookup", ...(a.kind === "condition" ? { condition: selected === undefined ? { op: "truthy", language: "python", value: { binding: "flag" } } : { op: "eq", left: { literal: selected }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: a.literalValue === false ? "deny" : "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect original conditional method lookup", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength((alternate && selector === "guard" ? 2 : 1) * (repeat ? 2 : 1))
  expect(lowered.diagnostics.map(d => d.code)).toEqual(selected && selector === "missing" ? ["source-method-lookup-attribute-unmodeled"] : !selected && alternate ? ["semantic-exception-type-unknown"] : [])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(!selected && alternate)
  if (!(selected && selector === "missing")) expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual(selected === undefined ? ["deny", "deny"] : [!selected && alternate ? "allow" : "deny"])
  if (!alternate) expect(lowered.delta.rules.some(r => r.failureKind === "operation")).toBe(true)
  const proof = index.relatedCalls(units[0].source.id, "app.Gate").find(c => c.expression === "handler")!.methodLookup!, mutated = structuredClone(units)
  const origin = mutated[0].blocks.find((b: any) => b.steps.some((s: any) => s.name === `method-lookup-${proof.creationCallId}`)), start = mutated[0].blocks.find((b: any) => b.name === mutated[0].start)
  start.steps.push(origin.steps.splice(origin.steps.findIndex((s: any) => s.name === `method-lookup-${proof.creationCallId}`), 1)[0])
  expect(project(mutated).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  const missingInit = structuredClone(units), initial = missingInit[0].blocks.find((b: any) => b.name === missingInit[0].start)
  initial.steps = initial.steps.filter((s: any) => !s.name.startsWith("method-lookup-init-"))
  expect(project(missingInit).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  const movedCall = structuredClone(units), callBlock = movedCall[0].blocks.find((b: any) => b.name !== movedCall[0].start && b.steps.some((s: any) => s.name.startsWith("method-lookup-call-")))
  movedCall[0].blocks.find((b: any) => b.name === movedCall[0].start).steps.push(callBlock.steps.splice(callBlock.steps.findIndex((s: any) => s.name.startsWith("method-lookup-call-")), 1)[0])
  expect(project(movedCall).uses.filter((u: any) => u.kind === "call")).toHaveLength(repeat ? 2 : 0)
  const wrongSentinel = structuredClone(units), initializer = wrongSentinel[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name.startsWith("method-lookup-init-"))
  initializer.value = { literal: "forged-created-value" }
  expect(project(wrongSentinel).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  const wrongFailure = structuredClone(units)
  for (const b of wrongFailure[0].blocks) if (b.steps.some((s: any) => s.kind === "raise" && s.exceptionType === "UnboundLocalError")) b.steps = [{ kind: "return", name: `forged-${b.name}`, claim: "Forged uncreated success", value: true, outcome: "allow" }]
  expect(project(wrongFailure).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  if (alternate) {
    const missingAlternate = structuredClone(units), assignment = missingAlternate[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `assign-${proof.alternatives[0]!.anchorId}`)
    assignment.value = { binding: "replacement" }
    expect(project(missingAlternate).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  }
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace(`getattr(self, '${selector}'`, "getattr(self, 'fallback'") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})

for (const mode of ["direct", "factory", "import", "import-factory", "order", "factory-order", "replace", "replace-class", "branch", "try", "fresh", "closure", "plain"]) test(`local class definitions execute actual implicit decorators: ${mode}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-class-definition-"))
  const helpers = `def decorate(cls):\n    cls.flag = True\n    return cls\ndef configure(flag):\n    def apply(cls):\n        cls.flag = flag\n        return cls\n    return apply\ndef reject(cls):\n    raise Denied\ndef outer(cls):\n    if cls.flag:\n        raise Denied\n    return cls\ndef replace(cls):\n    return False\ndef inspect(cls):\n    if cls.flag:\n        raise Denied\n    return False\ndef inspect_pair(first, second):\n    if first.flag and not second.flag:\n        raise Denied\n    return False\n` + (mode === "factory-order" ? `def first_factory(state):\n    state.flag = True\n    def first_apply(cls):\n        return cls\n    return first_apply\ndef second_factory(state):\n    if state.flag:\n        raise Denied\n    def second_apply(cls):\n        return cls\n    return second_apply\n` : mode === "replace-class" ? `def replace_class(cls):\n    class Replacement:\n        flag = True\n    return Replacement\n` : mode === "closure" ? `def creator(flag):\n    def deferred():\n        @configure(flag)\n        class Local:\n            flag = False\n        return Local\n    return deferred\n` : "")
  const declaration = `${mode === "order" ? "    @outer\n    @decorate\n" : mode === "factory-order" ? "    @first_factory(state)\n    @second_factory(state)\n" : mode === "factory" ? "    @configure(True)\n" : mode === "replace" ? "    @replace\n" : mode === "replace-class" ? "    @replace_class\n" : mode === "try" ? "    @reject\n" : mode === "plain" ? "" : "    @decorate\n"}    class Local:\n        flag = ${mode === "plain" ? "True" : "False"}\n`
  const entry = mode === "fresh" ? `def make(flag):\n    @configure(flag)\n    class Local:\n        flag = False\n    return Local\ndef entry():\n    first = make(True)\n    second = make(False)\n    inspect_pair(first, second)\n    write()\n    return True\n`
    : mode === "closure" ? `def entry():\n    callback = creator(True)\n    inspect(callback())\n    write()\n    return True\n`
    : mode === "branch" ? `def entry():\n    if False:\n${declaration.replace(/^/gm, "    ").trimEnd()}\n    return True\n`
    : mode === "try" ? `def entry():\n    try:\n${declaration.replace(/^/gm, "    ").trimEnd()}\n    except Denied:\n        return False\n    write()\n    return True\n`
    : `def entry(${mode === "factory-order" ? "state" : ""}):\n${declaration}${mode === "replace" ? "    if not Local:\n        return False\n" : "    inspect(Local)\n"}    write()\n    return True\n`
  let content = helpers + entry
  const files: Array<{ path: string; content: string }> = []
  if (mode === "import" || mode === "import-factory") {
    const external = mode === "import" ? "def decorate(cls):\n    cls.flag = True\n    return cls\n" : "def configure(flag):\n    def apply(cls):\n        cls.flag = flag\n        return cls\n    return apply\n"
    content = `from decorators import ${mode === "import" ? "decorate" : "configure"}\n` + content.replace(external, "")
    if (mode === "import-factory") content = content.replace("    @decorate\n    class Local", "    @configure(True)\n    class Local")
    files.push({ path: "decorators.py", content: external })
  }
  files.push({ path: "app.py", content })
  for (const file of files) await writeFile(path.join(sourceRoot, file.path), file.content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  const sources = index.symbols.filter(s => s.kind === "function")
  for (const source of sources) {
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "condition", "return", "raise"].includes(a.kind) || (a as any).classDefinition).map(a => ({ anchorId: a.id, role: a.kind === "call" && a.call!.expression === "write" ? "effect" : ["return", "raise"].includes(a.kind) ? "context" : "condition", explanation: "Anonymous current class definition and actual decorator application", ...(a.kind === "condition" ? { condition: a.text === "not Local" ? { op: "eq", left: { binding: "Local" }, right: { literal: false } } : a.text === "first.flag and not second.flag" ? { op: "all", args: [{ op: "eq", left: { binding: "first.flag" }, right: { literal: true } }, { op: "eq", left: { binding: "second.flag" }, right: { literal: false } }] } : { op: "eq", left: a.literalKnown ? { literal: a.literalValue } : { binding: a.text }, right: { literal: true } } } : {}), ...(a.kind === "return" && source.name === "entry" ? { returnOutcome: a.literalValue === false ? "deny" : "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: source.name, handle: source.name, questionId: "q", role: source.name === "entry" ? "entry" : "helper", propertyDirected: true })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current implicit class decorator execution", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.units.length).toBeGreaterThan(0)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual([mode === "branch" ? "allow" : "deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  if (mode === "factory-order") expect(lowered.delta.rules.some(r => r.sourceOrigin?.step.startsWith("class-definition-"))).toBe(false)
  const definitionUnit = units.find(u => u.source.id === index.symbols.find(s => s.kind === "class" && s.name === "Local")!.classDefinition?.ownerId) ?? units.find(u => u.handle === "entry")
  const creation = definitionUnit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "assign-value" && s.sourceClass)
  if (mode === "branch") { expect(creation).toBeUndefined(); expect(lowered.delta.rules.some(r => r.kind === "call")).toBe(false); return }
  expect(creation.sourceClass.scope).toBe("definition")
  for (const mutation of ["sha", "missing", "final", "order", "application", "argument", "result", "decorator", "callee", "early-binding"]) {
    const changed = structuredClone(units), owner = changed.find(u => u.handle === definitionUnit.handle), body = owner.blocks.find((b: any) => b.steps.some((s: any) => s.name === creation.name)), created = body.steps.find((s: any) => s.name === creation.name)
    if (mutation === "sha") created.sourceClass.targetSha256 = "forged"
    else if (mutation === "missing") body.steps = body.steps.filter((s: any) => s.name !== creation.name)
    else if (mutation === "final") body.steps.find((s: any) => s.name.startsWith("class-bind-")).value = { binding: created.result }
    else if (mutation === "order") body.steps.push(body.steps.splice(body.steps.indexOf(created), 1)[0])
    else {
      const application = body.steps.find((s: any) => s.kind === "call" && s.sourceCallId?.startsWith("class-application-"))
      if (mode === "plain") continue
      if (mutation === "application") body.steps = body.steps.filter((s: any) => s !== application)
      if (mutation === "argument") application.arguments[0].object = "forged-class-object"
      if (mutation === "result") application.result = "forged-class-result"
      if (mutation === "decorator") { const read = body.steps.find((s: any) => s.name.startsWith("class-decorator-value-")); if (read) read.sourceCallable.targetSha256 = "forged"; else body.steps.find((s: any) => s.kind === "call").sourceCallId = "forged-factory-call" }
      if (mutation === "callee") application.callableRead.object = "forged-function"
      if (mutation === "early-binding") body.steps.splice(body.steps.indexOf(created) + 1, 0, { kind: "assign-value", name: "forged-public-binding", claim: "Original class is not bound before decorators finish", result: "Local", value: { binding: created.result } })
    }
    if (mutation === "final" && mode === "plain") continue
    expect(project(changed).units.some((u: any) => u.handle === definitionUnit.handle)).toBe(false)
  }
  if (mode.startsWith("import")) expect(project(units, await buildStructureIndex([...files, { path: "unrelated.py", content: "def decorate(cls):\n    return False\n" }], { repository: "anonymous", sourceRef: "r" })).uses).toEqual(projected.uses)
  const changed = await buildStructureIndex(files.map(f => ({ ...f, content: f.path === (mode.startsWith("import") ? "decorators.py" : "app.py") ? f.content.replace(mode === "import-factory" ? "cls.flag = flag" : "cls.flag = True", "cls.flag = False") : f.content })), { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})

for (const { selector, extraMethods } of [...["'guard'", "'fallback'", "'missing'", "selected", "pick('guard')"].map(selector => ({ selector, extraMethods: 0 })), { selector: "pick('guard')", extraMethods: 14 }]) test(`getattr current source tokens preserve actual selection and unknown default: ${selector} with ${extraMethods} extra methods`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-lookup-")), content = `def pick(value):\n    return value\nclass Gate:\n    def entry(self, actor, selected):\n        handler = getattr(self, ${selector}, self.fallback)\n        handler(actor)\n        write()\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n${Array.from({ length: extraMethods }, (_, i) => `    def other${i}(self, actor):\n        return actor\n`).join("")}`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  let entryInterpretation: any
  for (const name of ["entry", "guard", "fallback", ...selector.startsWith("pick(") ? ["pick"] : []]) {
    const source = index.symbols.find(s => s.name === name)!, receiverClass = source.className ? "app.Gate" : undefined
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, receiverClass))!
    expect(skeleton.gaps.map(g => g.code)).toEqual(name === "entry" && selector === "'missing'" ? ["source-method-lookup-attribute-unmodeled"] : [])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : ["selected", "value"].includes(a.name!) ? "condition" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : a.call!.expression === "getattr" ? "context" : "condition" : "context", explanation: "Anonymous current ordinary getattr selection", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const interpretation = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }
    if (name === "entry") entryInterpretation = interpretation
    const result = lowerSourceInterpretation(skeleton, interpretation, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current getattr selection", premises: [] }] })
  if (extraMethods) {
    const nativeProgram = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.Gate.entry", entryHint: "entry", premises: [] }] })
    const runtime = createInquiryDomainRuntime({ program: nativeProgram, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units.slice(1) })
    await runtime.sync()
    const current: any = runtime.promptContext()
    const accepted = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: current.focus.id, interpretation: { ...entryInterpretation, revision: current.tasks[0].sourceSkeleton.revision } })
    expect(accepted.diagnostics).toEqual([])
    expect(runtime.report().semantic?.units.find(u => u.role === "entry")?.blocks).toHaveLength(37)
  }
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 3 : selector === "selected" ? 2 : selector === "'missing'" ? 0 : 1)
  if (selector === "'guard'" || selector.startsWith("pick(")) {
    expect(lowered.diagnostics).toEqual([])
    expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
    expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual(["deny"])
  } else if (selector === "'fallback'") {
    expect(lowered.diagnostics.map(d => d.code)).toEqual(["semantic-exception-type-unknown"])
    expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(true)
  } else expect(lowered.diagnostics.map(d => d.code)).toContain("source-method-lookup-attribute-unmodeled")
  const proof = index.relatedCalls(units[0].source.id, "app.Gate").find(c => c.expression === "handler")!.methodLookup!
  const missing = structuredClone(units), start = missing[0].blocks.find((b: any) => b.name === missing[0].start)
  start.steps = start.steps.filter((s: any) => s.name !== `method-lookup-${proof.creationCallId}`)
  expect(project(missing).uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 1 : 0)
  if (proof.choices.length) {
    const wrongSelector = structuredClone(units), selection = wrongSelector[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `method-lookup-${proof.creationCallId}`)
    selection.cases[0].condition.left = { binding: "different_selector" }
    expect(project(wrongSelector).uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 1 : 0)
  }
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace(`getattr(self, ${selector},`, "getattr(self, 'other',") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})
