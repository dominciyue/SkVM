import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { buildPropertyDemand } from "./property-demand.ts"
import { parseInquiryStrategy, sourceMaterialSemanticVersion } from "./control-slice.ts"

async function fixture(code: string, file = "app.py") {
  const root = await mkdtemp(path.join(os.tmpdir(), "ay-question-"))
  await writeFile(path.join(root, file), code)
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: [file], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true } as any)
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: file, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  return { skeleton, demand: (questionId = "q", interpretation?: any) => buildPropertyDemand(skeleton, { questionId, role: "entry", question: { id: questionId, request: "Does this caller reach the selected effect?" }, interpretation } as any) as any }
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
