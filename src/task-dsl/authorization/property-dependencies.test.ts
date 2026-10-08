import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { buildPropertyDemand } from "./property-demand.ts"
import { parseInquiryStrategy, sourceMaterialSemanticVersion } from "./control-slice.ts"
import { bindSourceProcedureSummary } from "./procedure-summary.ts"
import { operationWork } from "../../benchmarks/authorization-dsl/operation-work.ts"
import { lowerSourceInterpretation } from "./source-interpretation.ts"

async function fixture(code: string, file = "app.py") {
  const root = await mkdtemp(path.join(os.tmpdir(), "ay-question-"))
  await writeFile(path.join(root, file), code)
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: [file], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true } as any)
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: file, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  return { tools, skeleton, demand: (questionId = "q", interpretation?: any) => buildPropertyDemand(skeleton, { questionId, role: "entry", question: { id: questionId, request: "Does this caller reach the selected effect?" }, interpretation } as any) as any }
}

test("v5 has a distinct semantic identity and source def/use dependencies", async () => {
  expect(parseInquiryStrategy("operation-evidence-v5")).toBe("operation-evidence-v5")
  expect(sourceMaterialSemanticVersion("operation-evidence-v5" as any)).toBe("question-control/v1")
  const f = await fixture("def entry(actor, resource):\n    chosen = resource\n    result = check(actor, chosen)\n    if not result:\n        return False\n    write(chosen)\n    return True\n")
  const d = f.demand(), branch = f.skeleton.anchors.find(a => a.kind === "condition")!, call = f.skeleton.anchors.find(a => a.call?.expression === "check")!, alias = f.skeleton.anchors.find(a => a.name === "chosen" && a.valueExpression === "resource")!, effect = f.skeleton.anchors.find(a => a.call?.expression === "write")!
  expect(f.skeleton.propertySemantics).toBe("question-control/v1")
  expect(d.dependencies.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: branch.id, to: call.id, kind: "data" }),
    expect.objectContaining({ from: call.id, to: alias.id, kind: "call-argument" }),
    expect.objectContaining({ from: effect.id, to: branch.id, kind: "control" }),
  ]))
  expect(d.dependencies.question).toMatchObject({ id: "q", request: "Does this caller reach the selected effect?" })
  expect(d.coverage.wholeAnswerSufficient).toBe(false)
})

test("dead local literals have source proofs, unknown setters survive model irrelevance", async () => {
  const f = await fixture("def entry(actor, resource):\n    unused = 19\n    resource.replace(actor)\n    return resource\n")
  const dead = f.skeleton.anchors.find(a => a.name === "unused")!, setter = f.skeleton.anchors.find(a => a.call?.expression === "resource.replace")!
  const d = f.demand("q", { schemaVersion: "source-interpretation/v1", revision: f.skeleton.revision, annotations: [{ anchorId: setter.id, role: "context", explanation: "irrelevant" }], unresolved: [] })
  expect(d.excluded).toContainEqual(expect.objectContaining({ anchorId: dead.id, reason: "source-local-unused" }))
  expect(d.dependencies.boundaries).toContainEqual(expect.objectContaining({ anchorId: setter.id, code: "unknown-call-influence" }))
  expect(d.dependencies.requiredAnchorIds).toContain(setter.id)
  expect(d.excluded.some((e: any) => e.anchorId === setter.id)).toBe(false)
})

test("branch replacements and finally keep both resource definitions and exception influence", async () => {
  const f = await fixture("def entry(actor, resource, flag):\n    if flag:\n        resource = replacement(actor)\n    try:\n        write(resource)\n        return True\n    finally:\n        cleanup(resource)\n")
  const d = f.demand(), write = f.skeleton.anchors.find(a => a.call?.expression === "write")!, replacement = f.skeleton.anchors.find(a => a.call?.expression === "replacement")!, cleanup = f.skeleton.anchors.find(a => a.call?.expression === "cleanup")!
  expect(d.dependencies.requiredAnchorIds).toEqual(expect.arrayContaining([write.id, replacement.id, cleanup.id]))
  expect(d.dependencies.edges.some((e: any) => e.kind === "exception" && e.to === cleanup.id)).toBe(true)
  expect(d.sourceGaps).toHaveLength(0)
})

test("question projections stay independent and renamed source retains dependency shape", async () => {
  const a = await fixture("def entry(actor, item):\n    temporary = 4\n    check(actor, item)\n    return item\n")
  const b = await fixture("def entry(person, target):\n    local = 4\n    gate(person, target)\n    return target\n", "renamed.py")
  const first = a.demand("first"), second = a.demand("second")
  expect(first.dependencies.question.id).toBe("first")
  expect(second.dependencies.question.id).toBe("second")
  expect(first.dependencies.revision).not.toBe(second.dependencies.revision)
  expect(a.demand().dependencies.edges.map((e: any) => e.kind).sort()).toEqual(b.demand().dependencies.edges.map((e: any) => e.kind).sort())
  expect(a.demand().excluded.map((e: any) => e.reason)).toEqual(b.demand().excluded.map((e: any) => e.reason))
})
test("v6 bound properties change required and residual sets with a current source summary while unknown influence survives", async () => {
  const f = await fixture("def audit(actor):\n    return actor\ndef finalize(item):\n    unknown(item)\n    return item\ndef entry(actor, item):\n    audit(actor)\n    if not check(actor, item):\n        raise Forbidden()\n    send(item)\n    finalize(item)\n    return True\n")
  const { skeleton, tools } = f, find = (kind: string, name?: string) => skeleton.anchors.find(a => a.kind === kind && (!name || a.name === name || a.call?.expression === name))!
  const actor = find("parameter", "actor"), item = find("parameter", "item"), guard = find("condition"), send = find("call", "send"), audit = find("call", "audit"), finalize = find("call", "finalize")
  const symbol = tools.structure!.symbols.find(s => s.name === "audit")!
  await tools.execute("source_read", { path: symbol.path, startLine: symbol.startLine, endLine: symbol.endLine })
  const summary = bindSourceProcedureSummary(tools.structure!, skeleton, audit, (await tools.sourceSkeleton(symbol.id))!)!
  expect(summary).toBeDefined()
  const draft: any = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, unresolved: [], annotations: [{ anchorId: actor.id, role: "principal" }, { anchorId: item.id, role: "resource" }, { anchorId: guard.id, role: "condition", guardBranch: "false", principalAnchorId: actor.id, resourceAnchorId: item.id }, { anchorId: send.id, role: "effect", principalAnchorId: actor.id, resourceAnchorId: item.id, authorizedByAnchorIds: [guard.id] }], propertyBindings: [{ propertyId: "p", effectAnchorId: send.id, guardAnchorId: guard.id }] }
  const demand = (kind: string, summaries: any[] = [summary]) => buildPropertyDemand(skeleton, { questionId: "q", role: "entry", interpretation: draft, propertyAbstraction: true, callSummaries: summaries, question: { id: "q", request: "Inspect the selected behavior", properties: [{ id: "p", kind, requirement: "selected behavior" }] } } as any) as any
  const auth = demand("authorization-before-effect"), complete = demand("operation-completion")
  expect(auth.dependencies.requiredAnchorIds).not.toContain(audit.id)
  expect(auth.dependencies.requiredAnchorIds).not.toContain(finalize.id)
  expect(auth.dependencies.residuals).toContainEqual(expect.objectContaining({ anchorId: finalize.id, code: "outside-selected-property-horizon" }))
  expect(complete.dependencies.requiredAnchorIds).toContain(finalize.id)
  expect(auth.required.map((r: any) => [r.anchorId, r.field])).not.toEqual(complete.required.map((r: any) => [r.anchorId, r.field]))
  const unknown = demand("authorization-before-effect", [])
  expect(unknown.dependencies.requiredAnchorIds).toContain(audit.id)
  expect(unknown.dependencies.boundaries).toContainEqual(expect.objectContaining({ anchorId: audit.id, code: "unknown-call-influence" }))
  expect(auth.coverage.wholeAnswerSufficient).toBe(false)
  expect(skeleton.anchors.some(a => a.id === finalize.id)).toBe(true)
  const finalizer = tools.structure!.symbols.find(s => s.name === "finalize")!
  const work = (d: any) => operationWork(tools.structure!, skeleton.sourceId, [], [], undefined, { propertyDemand: d } as any)
  expect(work(auth).actions.some(a => a.candidateId === finalizer.id)).toBe(false)
  expect(work(complete).actions.some(a => a.candidateId === finalizer.id)).toBe(true)
  expect(work(auth).propertyResiduals).toContainEqual(expect.objectContaining({ sourceCallId: finalize.call!.sourceCallId }))
})
test("v6 actually adopts an unused mechanically pure call and preserves prior unknown influence", async () => {
  const f = await fixture("def audit(actor):\n    return actor\ndef entry(actor, item):\n    opaque(actor)\n    audit(actor)\n    send(item)\n    return True\n")
  const audit = f.skeleton.anchors.find(a => a.call?.expression === "audit")!, opaque = f.skeleton.anchors.find(a => a.call?.expression === "opaque")!, send = f.skeleton.anchors.find(a => a.call?.expression === "send")!
  const symbol = f.tools.structure!.symbols.find(s => s.name === "audit")!
  await f.tools.execute("source_read", { path: symbol.path, startLine: symbol.startLine, endLine: symbol.endLine })
  const summary = bindSourceProcedureSummary(f.tools.structure!, f.skeleton, audit, (await f.tools.sourceSkeleton(symbol.id))!)!
  const draft: any = { schemaVersion: "source-interpretation/v1", revision: f.skeleton.revision, annotations: [{ anchorId: opaque.id, role: "context", explanation: "Unresolved external influence" }, { anchorId: send.id, role: "effect", explanation: "Selected source effect" }], propertyBindings: [{ propertyId: "p", effectAnchorId: send.id }], unresolved: [] }
  const result = lowerSourceInterpretation(f.skeleton, draft, { index: f.tools.structure!, itemId: "i", handle: "entry", questionId: "q", role: "entry", propertyDirected: true, propertyAbstraction: true, callSummaries: [summary], question: { id: "q", request: "Inspect effect reachability", properties: [{ id: "p", kind: "effect-reachability", requirement: "effect reachability" }] } })
  expect(result.diagnostics).toEqual([])
  expect(result.demand!.dependencies!.requiredAnchorIds).toContain(opaque.id)
  const steps = result.unit!.blocks.flatMap(b => b.steps)
  expect(steps).toContainEqual(expect.objectContaining({ kind: "context", name: `summary-${audit.id}`, mayRaise: false }))
  expect(steps).toContainEqual(expect.objectContaining({ kind: "unresolved", name: `context-${opaque.id}`, reason: "property-source-influence-unresolved" }))
  expect(result.unit!.complete).toBe(false)
})
