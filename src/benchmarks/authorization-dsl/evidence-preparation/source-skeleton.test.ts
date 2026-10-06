import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "../inquiry-tools.ts"

async function fixture(content: string, extension = "py") {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-skeleton-"))
  await writeFile(path.join(sourceRoot, `app.${extension}`), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  return { tools, source, read: () => tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }) }
}

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
