import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "../inquiry-tools.ts"
import { lowerSourceInterpretation } from "../../../task-dsl/authorization/source-interpretation.ts"

async function fixture(content: string, extension = "py", finiteControl = false) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-skeleton-"))
  await writeFile(path.join(sourceRoot, `app.${extension}`), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, ...(finiteControl ? { controlSemantics: "finite-control/v1" } : {}) } as any)
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  return { tools, source, read: () => tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }) }
}

test("context meaning cannot erase a named local callable binding gap", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-gap-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(guard):\n    guard()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols[0]!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Anonymous contextual source role", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  expect(skeleton.gaps.map(g => g.code)).toContain("source-local-callable-binding-unresolved")
  expect(result.unit!.complete).toBe(false)
})
test("reading an escaped local callable body retains its capture and invocation boundary", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-escape-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def factory(actor):\n    def guard():\n        return actor\n    return guard\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.name === "guard")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  expect((await tools.sourceSkeleton(source.id))!.gaps.map(g => g.code)).toContain("source-local-callable-escape-unmodeled")
})

test("a source returned callable definition creates an ordinary value while its actual instance supplies captures", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-returned-skeleton-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def create(principal):\n    def guard():\n        return principal\n    return guard\ndef entry(actor):\n    check = create(actor)\n    check()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  for (const name of ["create", "guard"]) {
    const source = tools.structure!.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    if (name === "create") expect(skeleton.anchors.find(a => a.syntax === "source_callable_definition")).toMatchObject({ kind: "assignment", name: "guard", interpretationRequired: false })
    else {
      expect(skeleton.anchors.find(a => a.syntax === "source_capture")!.name).toBe("principal")
      expect(skeleton.anchors.find(a => a.syntax === "source_callable_instance")).toMatchObject({ kind: "parameter" })
    }
  }
})

test("the production source view separates early return and effect branches without inferring permission", async () => {
  const f = await fixture("def entry(actor, resource):\n    if actor is None or not actor.enabled:\n        return False\n    resource.write(actor=actor, value=None)\n    return True\n")
  await f.read()
  const view = await f.tools.execute("source_structure", { symbolId: f.source.id })
  const skeleton = (view.structure as any)?.skeleton
  expect(skeleton?.flow[0]).toMatchObject({ kind: "branch" })
  const condition = skeleton.anchors.find((a: any) => a.kind === "condition")
  expect(condition.text).toBe("actor is None or not actor.enabled")
  const returned = skeleton.anchors.find((a: any) => a.kind === "return" && a.text === "return False")
  const effect = skeleton.anchors.find((a: any) => a.kind === "call" && a.call.expression === "resource.write")
  expect(skeleton.edges.some((e: any) => e.from === condition.id && e.to === returned.id && e.branch === "true")).toBe(true)
  expect(skeleton.edges.some((e: any) => e.from === condition.id && e.to === effect.id && e.branch === "false")).toBe(true)
  expect(skeleton.edges.some((e: any) => e.from === returned.id && e.to === effect.id)).toBe(false)
  expect(effect.call.arguments).toEqual([{ expression: "actor", parameterName: "actor" }, { expression: "None", parameterName: "value", literalKnown: true, literalValue: null }])
  expect(skeleton.anchors.every((a: any) => !Object.hasOwn(a, "permissionOutcome"))).toBe(true)
})

test("finite source try keeps normal, typed handler, else and finally in distinct regions", async () => {
  const f = await fixture("def entry(actor, item):\n    try:\n        item.write(actor)\n    except Denied:\n        return False\n    else:\n        actor.audit()\n    finally:\n        actor.cleanup()\n    return True\n", "py", true)
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))! as any
  const region = skeleton.flow.find((n: any) => n.kind === "try")
  expect(region).toBeDefined()
  expect(region.handlers[0].exceptionTypes).toEqual(["Denied"])
  const calls = (flow: any[]) => flow.map(n => skeleton.anchors.find((a: any) => a.id === n.anchorId)?.call?.expression).filter(Boolean)
  expect(calls(region.body)).toEqual(["item.write"])
  expect(calls(region.otherwise)).toEqual(["actor.audit"])
  expect(calls(region.finally)).toEqual(["actor.cleanup"])
  expect(skeleton.gaps.some((g: any) => g.code === "skeleton-control-unsupported")).toBe(false)
  expect(skeleton.anchors.find((a: any) => a.call?.expression === "item.write").interpretationRequired).toBe(true)
})

test("finite source with, literal loop and early loop exits retain execution regions", async () => {
  const f = await fixture("def entry(actor):\n    with context(actor) as item:\n        for value in [0, 1]:\n            if value:\n                break\n            item.write(value)\n        else:\n            actor.done()\n    return True\n", "py", true)
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))! as any
  const withRegion = skeleton.flow.find((n: any) => n.kind === "with")
  expect(withRegion).toBeDefined()
  const loop = withRegion.body.find((n: any) => n.kind === "loop")
  expect(loop.iterableValue).toEqual([0, 1])
  expect(loop.targetName).toBe("value")
  expect(loop.body[0].then[0].kind).toBe("break")
  expect(loop.otherwise.length).toBeGreaterThan(0)
  expect(skeleton.gaps.map((g: any) => g.code)).toContain("skeleton-context-exit-unknown")
})

test("finite short circuit stores RHS reachability and Python value semantics", async () => {
  const f = await fixture("def entry(flag, actor):\n    answer = flag and actor.check()\n    return answer\n", "py", true)
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))! as any
  const region = skeleton.flow.find((n: any) => n.kind === "short-circuit")
  expect(region).toMatchObject({ operator: "and", language: "python", leftExpression: "flag" })
  expect(region.body).toHaveLength(1)
  expect(skeleton.anchors.find((a: any) => a.id === region.body[0].anchorId).call.expression).toBe("actor.check")
  expect(skeleton.gaps.some((g: any) => g.code === "skeleton-short-circuit-call")).toBe(false)
})

test("nested short-circuit call arguments occur once in their own conditional region", async () => {
  const f = await fixture("def entry(flag, actor):\n    return consume(flag and (actor.ready() or actor.fallback()))\n", "py", true)
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))!
  const all: any[] = []
  const collect = (flow: any[]) => { for (const n of flow) { all.push(n); for (const key of ["body", "then", "otherwise", "enter", "finally"]) if (n[key]) collect(n[key]) } }
  collect(skeleton.flow)
  expect(all.filter(n => n.kind === "short-circuit")).toHaveLength(2)
  for (const name of ["actor.ready", "actor.fallback", "consume"]) expect(all.filter(n => skeleton.anchors.find(a => a.id === n.anchorId)?.call?.expression === name)).toHaveLength(1)
})

test("unread source is not a shown skeleton and unsupported control nodes retain located gaps", async () => {
  const f = await fixture("def entry(actor):\n    for item in actor.items:\n        item.write()\n    try:\n        actor.check()\n    except Error:\n        raise Denied()\n    return None\n")
  const unread = await f.tools.execute("source_structure", { symbolId: f.source.id })
  expect((unread.structure as any)?.skeleton).toMatchObject({ modelCovered: false, anchors: [], gaps: [expect.objectContaining({ code: "skeleton-source-unread" })] })
  await f.read()
  const shown = (await f.tools.execute("source_structure", { symbolId: f.source.id })).structure as any
  expect(shown.skeleton.gaps.map((g: any) => g.code)).toContain("skeleton-control-unsupported")
  expect(shown.skeleton.gaps.every((g: any) => g.selector.startLine > 0 && g.selector.endLine >= g.selector.startLine)).toBe(true)
  expect(shown.skeleton.anchors.filter((a: any) => a.kind === "call").map((a: any) => a.call.expression)).toContain("actor.check")
})

test("Go nested branches, dynamic dispatch and distinct receivers retain exact original anchors", async () => {
  const f = await fixture('package app\nfunc entry(a *Item, b *Item, flag bool) {\n  if flag { if a == nil { panic("missing") }; return } else { b.Write(a) }\n  dynamic()(b)\n}\n', "go")
  await f.read()
  const skeleton = ((await f.tools.execute("source_structure", { symbolId: f.source.id })).structure as any)?.skeleton
  expect(skeleton?.anchors.some((a: any) => a.kind === "condition" && a.text === "a == nil")).toBe(true)
  expect(skeleton.anchors.find((a: any) => a.call?.expression === "b.Write").call.receiver).toBe("b")
  expect(skeleton.gaps.some((g: any) => g.code === "skeleton-call-dynamic")).toBe(true)
  for (const anchor of skeleton.anchors) {
    const evidence = f.tools.evidence.find(e => e.path === anchor.selector.path && e.startLine <= anchor.selector.startLine && e.endLine >= anchor.selector.endLine)!
    expect(evidence.quote).toContain(anchor.text)
    expect(anchor.sourceSha256).toBe(f.source.sha256)
  }
})

test("Go if initializers execute before their own condition and remain conditional inside an else arm", async () => {
  const f = await fixture('package app\nfunc entry(a *Item, flag bool) {\n if err := write(a); err != nil { return }\n if flag { done(a) } else if err := update(a); err != nil { return }\n}\n', "go")
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))!
  const write = skeleton.anchors.find(a => a.call?.expression === "write")!
  const update = skeleton.anchors.find(a => a.call?.expression === "update")!
  expect(write).toBeDefined(); expect(update).toBeDefined()
  expect(write.call!.resultNames).toEqual(["err"])
  expect(write.call!.arguments).toEqual([{ expression: "a" }])
  expect(skeleton.flow[0]).toEqual({ kind: "step", anchorId: write.id })
  const firstCondition = skeleton.anchors.find(a => a.kind === "condition" && a.selector.startLine === 3)!
  expect(skeleton.edges).toContainEqual({ from: write.id, to: skeleton.flow[1]!.anchorId, branch: "next" })
  expect(skeleton.flow.find(n => n.anchorId === firstCondition.id)?.kind).toBe("branch")
  const outer = skeleton.flow.find(n => skeleton.anchors.find(a => a.id === n.anchorId)?.text === "flag")!
  expect(outer.otherwise?.[0]).toEqual({ kind: "step", anchorId: update.id })
  expect(skeleton.flow.some(n => n.anchorId === update.id)).toBe(false)
})

test("short-circuit calls cannot be flattened into unconditional execution and elif alternatives are retained", async () => {
  const f = await fixture("def entry(a, b):\n    if a and b.write():\n        return 1\n    elif b is None:\n        return 2\n    else:\n        return 3\n")
  await f.read()
  const skeleton = ((await f.tools.execute("source_structure", { symbolId: f.source.id })).structure as any).skeleton
  expect(skeleton.flow[0].kind).toBe("branch")
  expect(skeleton.gaps.some((g: any) => g.code === "skeleton-short-circuit-call")).toBe(true)
  expect(skeleton.anchors.filter((a: any) => a.kind === "return").map((a: any) => a.valueExpression)).toEqual(["1", "2", "3"])
})

test("registration source is a bounded context skeleton and nested definition fields are outside the surrounding scope", async () => {
  const f = await fixture("from fastapi import APIRouter\nrouter = APIRouter()\n@router.post('/items')\ndef entry(actor):\n    def local():\n        return actor.hidden\n    return actor\n")
  await f.read()
  const body = (await f.tools.sourceSkeleton(f.source.id))!
  expect(body.anchors.some(a => a.name === "actor.hidden")).toBe(false)
  expect(body.gaps.some(g => g.code === "skeleton-local-definition")).toBe(true)
  const route = f.tools.structure!.symbols.find(s => s.attributes.routeModel)!
  await f.tools.execute("source_read", { path: route.path, startLine: route.startLine, endLine: route.endLine })
  const registration = (await f.tools.sourceSkeleton(route.id))!
  expect(registration).toMatchObject({ modelCovered: true, context: "route-registration", gaps: [] })
  expect(registration.anchors.map(a => a.kind)).toContain("call")
  expect(registration.anchors.some(a => a.kind === "return" || a.kind === "parameter")).toBe(false)
})

test("opaque control retains child call facts without advertising them as executable flow requirements", async () => {
  const f = await fixture("def entry(actor):\n    actor.before()\n    try:\n        actor.write()\n    except Error:\n        actor.after_error()\n    return None\n")
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))!
  expect(skeleton.anchors.find(a => a.call?.expression === "actor.before")).toMatchObject({ interpretationRequired: true })
  for (const expression of ["actor.write", "actor.after_error"]) expect(skeleton.anchors.find(a => a.call?.expression === expression)).toMatchObject({ interpretationRequired: false })
  expect(skeleton.gaps).toContainEqual(expect.objectContaining({ code: "skeleton-control-unsupported" }))
  const flowIds = skeleton.flow.map(n => n.anchorId)
  expect(flowIds).not.toContain(skeleton.anchors.find(a => a.call?.expression === "actor.write")!.id)
})

test("v5 field writes retain exact store facts while helper results use a temporary ordinary binding", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-syntax-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def select(target):\n    return target\ndef entry(ctx, target):\n    ctx.saved = target\n    ctx.mode = 'read'\n    ctx.current = select(target)\n    return ctx.current\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, stores = skeleton.anchors.filter(a => (a as any).fieldWrite)
  expect(stores.map(a => [(a as any).fieldWrite, a.valueExpression])).toEqual([[{ object: "ctx", field: "saved" }, "target"], [{ object: "ctx", field: "mode" }, "'read'"], [{ object: "ctx", field: "current" }, "select(target)"]])
  expect(skeleton.anchors.find(a => a.call?.expression === "select")!.call!.resultBinding).not.toBe("ctx.current")
  expect(skeleton.gaps).toEqual([])
})
for (const statement of ["ctx.count += 1", "del ctx.target", "ctx.values[key] = target", "ctx.left = ctx.right = target"]) test(`v5 keeps an unsupported field mutation named: ${statement}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-gap-"))
  await writeFile(path.join(sourceRoot, "app.py"), `def entry(ctx, target, key):\n    ${statement}\n    return True\n`)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols[0]!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  expect((await tools.sourceSkeleton(source.id))!.gaps.map(g => g.code)).toContain("skeleton-field-write-unmodeled")
})
for (const member of ["    def __setattr__(self, name, value):\n        raise Denied\n", "    @property\n    def target(self):\n        return None\n    @target.setter\n    def target(self, value):\n        raise Denied\n"]) test(`v5 visible field setter source is not waived: ${member.trim().split("\n")[0]}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-setter-"))
  await writeFile(path.join(sourceRoot, "app.py"), "class Box:\n" + member + "    def entry(self, target):\n        self.target = target\n        return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  expect((await tools.sourceSkeleton(source.id, "app.Box"))!.gaps.map(g => g.code)).toContain("skeleton-field-setter-unmodeled")
})
test("same-line identical argument calls retain distinct exact source call occurrences", async () => {
  const f = await fixture("def choose(ctx):\n    return ctx\ndef consume(first, second):\n    return first\ndef entry(ctx):\n    return consume(choose(ctx), choose(ctx))\n", "py", true)
  await f.read()
  const skeleton = (await f.tools.sourceSkeleton(f.source.id))!, calls = skeleton.anchors.filter(a => a.kind === "call")
  expect(new Set(calls.map(a => a.call!.sourceCallId)).size).toBe(3)
})
