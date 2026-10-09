import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { projectSourceMaterials } from "./source-material-projection.ts"

for (const residuals of [false, true]) test(`a source effect retains its actual callable argument and source order with residuals=${residuals}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ba-callable-effect-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def save(item):\n    item.sent = True\n    return True\nasync def entry(actor, item):\n    if not actor.allowed:\n        return False\n" + (residuals ? "    checkpoint(item)\n" : "") + "    await threadpool(save, item)\n" + (residuals ? "    log(item)\n" : "") + "    return True\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry authorization before its output", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before output" }] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v6", sourceAssisted: true })
  try {
    await runtime.sync(); let context: any = runtime.promptContext()
    if (context.focus.stage === "locate") { await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates.find((c: any) => c.name === "entry").id }); context = runtime.promptContext() }
    const task = context.tasks[0], full = (await tools.sourceSkeleton(task.sourceSkeleton.sourceId))!
    const actor = full.anchors.find(a => a.kind === "parameter" && a.name === "actor")!, item = full.anchors.find(a => a.kind === "parameter" && a.name === "item")!, guard = full.anchors.find(a => a.kind === "condition")!, effect = full.anchors.find(a => a.call?.expression === "threadpool")!
    const annotations = [{ anchorId: actor.id, role: "principal", explanation: "Actual source caller" }, { anchorId: item.id, role: "resource", explanation: "Actual source output" }, { anchorId: guard.id, role: "condition", explanation: "Denied callers return before output", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: actor.id, resourceAnchorId: item.id }, { anchorId: effect.id, role: "effect", explanation: "External invocation with the actual source function value", principalAnchorId: actor.id, resourceAnchorId: item.id }, ...full.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Literal source outcome", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" }))]
    annotations.push(...full.anchors.filter(a => a.call && a.call.expression !== "threadpool").map(a => ({ anchorId: a.id, role: "context", explanation: "Actual peripheral source call with unproved influence" })))
    const proposed = await runtime.propose({ ...task.sourceEdit.template, edits: annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))) })
    expect(proposed.diagnostics.filter(d => /^source-(?:edit|interpretation)/.test(d.code))).toEqual([])
    const report = runtime.report(), unit = report.semantic!.units[0]!, steps = unit.blocks.flatMap(b => b.steps)
    expect(steps.some(s => s.kind === "assign-value" && s.sourceCallable)).toBe(true)
    expect(report.materialProjection!.diagnostics.some(d => d.code === "material-callable-creation-invalid")).toBe(false)
    expect(report.materialUses).toHaveLength(1)
    if (residuals) {
      expect(steps.filter(s => s.kind === "unresolved" && s.reason === "property-source-influence-unresolved")).toHaveLength(2)
      expect(unit.complete).toBe(false)
    }
  } finally { runtime.close() }
})

for (const position of ["before", "after", "inside"] as const) test(`v7 retains exact callable creation around an uninterpreted branch: ${position}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bb-callable-control-")), invocation = "    await threadpool(save, item)\n", branch = "    if extra:\n        audit(item)\n"
  const content = "def save(item):\n    item.sent = True\n    return True\nasync def entry(actor, item, extra):\n    if not actor.allowed:\n        return False\n" + (position === "before" ? branch + invocation : position === "after" ? invocation + branch : "    if extra:\n        await threadpool(save, item)\n") + "    return True\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect authorization and output", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before output" }] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v7", sourceAssisted: true })
  try {
    await runtime.sync(); let context: any = runtime.promptContext()
    if (context.focus.stage === "locate") { await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates.find((c: any) => c.name === "entry").id }); context = runtime.promptContext() }
    const task = context.tasks[0], full = (await tools.sourceSkeleton(task.sourceSkeleton.sourceId))!, actor = full.anchors.find(a => a.kind === "parameter" && a.name === "actor")!, item = full.anchors.find(a => a.kind === "parameter" && a.name === "item")!, guard = full.anchors.find(a => a.kind === "condition" && a.text.includes("actor.allowed"))!, missing = full.anchors.find(a => a.kind === "condition" && a.text === "extra")!, effect = full.anchors.find(a => a.call?.expression === "threadpool")!
    const annotations = [{ anchorId: actor.id, role: "principal", explanation: "Actual caller" }, { anchorId: item.id, role: "resource", explanation: "Actual output object" }, { anchorId: guard.id, role: "condition", explanation: "Rejection before the source invocation", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: actor.id, resourceAnchorId: item.id }, { anchorId: effect.id, role: "effect", explanation: "Actual external invocation with a source callable", principalAnchorId: actor.id, resourceAnchorId: item.id }, ...full.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Original literal outcome", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" }))]
    const proposed = await runtime.propose({ ...task.sourceEdit.template, edits: annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))) })
    expect(proposed.diagnostics.filter(d => /^source-(?:edit|interpretation)/.test(d.code))).toEqual([])
    const report = runtime.report(), unit = report.semantic!.units[0]!, steps = unit.blocks.flatMap(b => b.steps)
    expect(unit.complete).toBe(false)
    expect(steps.some(s => s.kind === "unresolved" && s.reason.includes("condition"))).toBe(true)
    if (position === "inside") {
      expect(report.materialUses).toHaveLength(0)
      expect(report.materialProjection!.diagnostics.some(d => d.code === "material-callable-creation-invalid")).toBe(true)
      return
    }
    expect(report.materialProjection!.diagnostics.some(d => d.code === "material-callable-creation-invalid")).toBe(false)
    expect(report.materialUses).toHaveLength(1)
    expect(steps.find(s => s.kind === "unresolved" && s.name === `choose-${missing.id}`)).toBeDefined()
    for (const change of ["missing-creation", "late-creation", "foreign-marker", "target-sha", "duplicate-marker", "misnested-marker"] as const) {
      const snapshot = structuredClone(report.sourceMaterials!), material = snapshot.materials.find(m => m.current && m.source.id === unit.source!.id)!, block = material.unit.blocks.find(b => b.steps.some(s => s.kind === "assign-value" && s.sourceCallable))!, creation = block.steps.find(s => s.kind === "assign-value" && s.sourceCallable)!
      if (change === "missing-creation") block.steps.splice(block.steps.indexOf(creation), 1)
      if (change === "late-creation") block.steps.push(...block.steps.splice(block.steps.indexOf(creation), 1))
      if (change === "foreign-marker") block.steps.find(s => s.name === `choose-${missing.id}`)!.name = "choose-foreign-source"
      if (change === "target-sha" && creation.kind === "assign-value") creation.sourceCallable!.targetSha256 = "foreign-source"
      if (change === "duplicate-marker") block.steps.push(structuredClone(block.steps.find(s => s.name === `choose-${missing.id}`)!))
      if (change === "misnested-marker") { const marker = block.steps.find(s => s.name === `choose-${missing.id}`)!; block.steps.splice(block.steps.indexOf(marker), 1); material.unit.blocks.find(b => b !== block)!.steps.push(marker) }
      const projected = projectSourceMaterials(program, report.semantic!.units, snapshot, tools.structure!, { questionDirected: true })
      expect(projected.uses).toHaveLength(0)
      expect(projected.diagnostics.some(d => d.code === "material-callable-creation-invalid")).toBe(true)
    }
  } finally { runtime.close() }
})
