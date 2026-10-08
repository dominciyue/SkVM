import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

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
