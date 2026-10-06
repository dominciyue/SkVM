import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
const api = await import("./property-demand.ts").catch(() => ({} as any))

async function fixture(code: string, propertyDirected = true, read = true) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-demand-"))
  await writeFile(path.join(sourceRoot, "app.py"), code)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected } as any)
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  if (read) await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  return { tools, source, skeleton, options: { questionId: "q", role: "entry" as const }, anchor: (expression: string) => skeleton.anchors.find(a => a.call?.expression === expression)! }
}
const raw = (revision: string, annotations: unknown[] = []) => ({ schemaVersion: "source-interpretation/v1", revision, annotations, unresolved: [] })

test("source-invariant exclusions preserve every original and retain an unknown setter", async () => {
  const f = await fixture("def entry(actor):\n    if False:\n        actor.change_resource()\n    actor.unknown_setter()\n    return True\n    actor.cleanup()\n")
  expect(typeof api.buildPropertyDemand).toBe("function")
  const d = api.buildPropertyDemand(f.skeleton, f.options)
  expect(d.required.map((r: any) => r.anchorId)).toContain(f.anchor("actor.unknown_setter").id)
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: f.anchor("actor.change_resource").id, reason: "source-literal-branch" }))
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: f.anchor("actor.cleanup").id, reason: "after-source-exit" }))
  expect(d.requiredAnnotationCount).toBe(2)
  expect(d.coverage).toMatchObject({ sourceRead: true, domainInterpreted: false, propertyCovered: false, wholeAnswerSufficient: false })
  expect(f.skeleton.anchors.some(a => a.id === f.anchor("actor.change_resource").id)).toBe(true)
  expect(f.skeleton.modelCovered).toBe(true)
})

test("model predicates and names cannot mechanically exclude possibly executed source", async () => {
  const f = await fixture("def entry(actor, flag):\n    if flag:\n        actor.logging_setter()\n    actor.check_and_return_new_actor()\n    return True\n")
  const branch = f.skeleton.anchors.find(a => a.kind === "condition")!
  const d = api.buildPropertyDemand(f.skeleton, { ...f.options, interpretation: raw(f.skeleton.revision, [{ anchorId: branch.id, role: "condition", explanation: "Model assertion", condition: { op: "eq", left: { literal: false }, right: { literal: true } } }]) })
  expect(d.required.map((r: any) => r.anchorId)).toEqual(expect.arrayContaining([f.anchor("actor.logging_setter").id, f.anchor("actor.check_and_return_new_actor").id]))
  expect(d.excluded).toHaveLength(0)
  expect(d.semanticSupport).toBe("unreviewed")
})

test("finally and typed handler demands survive an unconditional return in the attempted body", async () => {
  const f = await fixture("def entry(actor):\n    try:\n        actor.check()\n        return True\n        actor.dead_suffix()\n    except Denied:\n        actor.handler()\n        return False\n    finally:\n        actor.cleanup()\n")
  const d = api.buildPropertyDemand(f.skeleton, f.options)
  expect(d.required.map((r: any) => r.anchorId)).toEqual(expect.arrayContaining([f.anchor("actor.check").id, f.anchor("actor.handler").id, f.anchor("actor.cleanup").id]))
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: f.anchor("actor.dead_suffix").id, reason: "after-source-exit" }))
})

test("literal short circuit and empty loop have located exclusions while with exit stays a gap", async () => {
  const f = await fixture("def entry(actor):\n    answer = False and actor.rhs()\n    for item in []:\n        actor.loop_write()\n    else:\n        actor.after_empty_loop()\n    with actor.manager():\n        return True\n")
  const d = api.buildPropertyDemand(f.skeleton, f.options)
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: f.anchor("actor.rhs").id, reason: "source-short-circuit" }))
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: f.anchor("actor.loop_write").id, reason: "source-empty-loop" }))
  expect(d.required.map((r: any) => r.anchorId)).toEqual(expect.arrayContaining([f.anchor("actor.after_empty_loop").id, f.anchor("actor.manager").id]))
  expect(d.sourceGaps.some((g: any) => g.code === "skeleton-context-exit-unknown")).toBe(true)
})

test("a bounded field frontier advances without resubmitting valid prior annotations", async () => {
  const f = await fixture("def entry(actor):\n" + Array.from({ length: 18 }, (_, i) => `    actor.context_${i}()\n`).join("") + "    return True\n")
  const d = api.buildPropertyDemand(f.skeleton, f.options)
  expect(d.frontier).toHaveLength(8)
  expect(d.requiredAnnotationCount).toBe(19)
  const annotated = d.frontier.map((r: any) => ({ anchorId: r.anchorId, role: "context", explanation: "Explicit source context" }))
  const next = api.buildPropertyDemand(f.skeleton, { ...f.options, interpretation: raw(f.skeleton.revision, annotated) })
  expect(next.frontier).toHaveLength(8)
  expect(next.frontier.some((r: any) => annotated.some((a: any) => a.anchorId === r.anchorId))).toBe(false)
  expect(next.pendingAnnotationCount).toBe(11)
  expect(next.coverage.wholeAnswerSufficient).toBe(false)
})

test("explicit principal and resource references add their exact typed field requirements", async () => {
  const f = await fixture("def entry(actor, resource):\n    resource.write(actor)\n    return True\n")
  const actor = f.skeleton.anchors.find(a => a.kind === "parameter" && a.name === "actor")!, resource = f.skeleton.anchors.find(a => a.kind === "parameter" && a.name === "resource")!
  const draft = raw(f.skeleton.revision, [{ anchorId: f.anchor("resource.write").id, role: "effect", explanation: "Actual effect", principalAnchorId: actor.id, resourceAnchorId: resource.id }])
  const d = api.buildPropertyDemand(f.skeleton, { ...f.options, interpretation: draft })
  expect(d.required).toContainEqual(expect.objectContaining({ anchorId: actor.id, field: "role", expectedRole: "principal", status: "missing" }))
  expect(d.required).toContainEqual(expect.objectContaining({ anchorId: resource.id, field: "role", expectedRole: "resource", status: "missing" }))
  expect(d.affectedQuestionIds).toEqual(["q"])
})

test("unread source and stale drafts cannot establish interpreted or property coverage", async () => {
  const f = await fixture("def entry():\n    return True\n", true, false)
  const d = api.buildPropertyDemand(f.skeleton, { ...f.options, interpretation: raw("old"), affectedQuestionIds: ["q", "another-original"] })
  expect(d.coverage).toMatchObject({ sourceRead: false, domainInterpreted: false, propertyCovered: false, wholeAnswerSufficient: false })
  expect(d.nextWork.kind).toBe("read")
  expect(d.affectedQuestionIds).toEqual(["q", "another-original"])
})

test("a source boolean is control evidence and never supplies an authorization return outcome", async () => {
  const f = await fixture("def entry():\n    if True:\n        return True\n    return False\n")
  const d = api.buildPropertyDemand(f.skeleton, f.options)
  const liveReturn = f.skeleton.anchors.find(a => a.kind === "return" && a.literalValue === true)!
  expect(d.required).toContainEqual(expect.objectContaining({ anchorId: liveReturn.id, field: "returnOutcome", status: "missing" }))
  expect(d.required.some((r: any) => r.field === "condition")).toBe(false)
  expect(d.coverage.propertyCovered).toBe(false)
})
