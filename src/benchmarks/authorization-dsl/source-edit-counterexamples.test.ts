import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { checkPropertyQueries } from "../../task-dsl/authorization/control-conclusion.ts"

const request = "Inspect app.entry: authorization before the write"
const cases: Array<{ name: string; body: string; status: "checked" | "violated" | "unknown"; value?: string }> = [
  { name: "matching source guard before effect", body: "    if not actor.allowed:\n        return False\n    item.sent = True\n    return True\n", status: "checked", value: "satisfied" },
  { name: "a different affected object", body: "    if not actor.allowed:\n        return False\n    other.sent = True\n    return True\n", status: "violated", value: "authorized-object-mismatch" },
  { name: "effect before the guard", body: "    item.sent = True\n    if not actor.allowed:\n        return False\n    return True\n", status: "violated", value: "guard-not-predecessor" },
  { name: "return before the effect", body: "    if not actor.allowed:\n        return False\n    return True\n    item.sent = True\n", status: "unknown" },
  { name: "unknown helper before the guard", body: "    mystery(actor, item)\n    if not actor.allowed:\n        return False\n    item.sent = True\n    return True\n", status: "unknown" },
]
for (const c of cases) test(`public source edits preserve ${c.name}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ba-property-fault-")); await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, item, other):\n" + c.body)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request, premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before the write" }] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v6", sourceAssisted: true })
  try {
    await runtime.sync(); let context: any = runtime.promptContext()
    if (context.focus.stage === "locate") { await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates[0].id }); context = runtime.promptContext() }
    const full = (await tools.sourceSkeleton(context.tasks[0].sourceSkeleton.sourceId))!, actor = full.anchors.find(a => a.kind === "parameter" && a.name === "actor")!, item = full.anchors.find(a => a.kind === "parameter" && a.name === "item")!, other = full.anchors.find(a => a.kind === "parameter" && a.name === "other")!, guard = full.anchors.find(a => a.kind === "condition")!, effect = full.anchors.find(a => a.fieldWrite?.field === "sent")!
    const annotations = [{ anchorId: actor.id, role: "principal", explanation: "Actual source actor" }, { anchorId: item.id, role: "resource", explanation: "Guarded source resource" }, { anchorId: other.id, role: "resource", explanation: "Distinct source resource" }, { anchorId: guard.id, role: "condition", explanation: "Actual source false branch returns", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: actor.id, resourceAnchorId: item.id }, { anchorId: effect.id, role: "effect", explanation: "Actual source write", principalAnchorId: actor.id, resourceAnchorId: effect.fieldWrite!.object === "other" ? other.id : item.id }, ...full.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Source literal return", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" }))]
    const edit = { ...context.tasks[0].sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...full.anchors.filter(a => a.kind === "call").map(a => ({ anchorId: a.id, field: "unresolved", value: "The external helper has no supplied source meaning" })), { field: "propertyBindings", value: [{ propertyId: "auth", guardAnchorId: guard.id, effectAnchorId: effect.id }] }] }
    const proposed = await runtime.propose(edit)
    expect(proposed.diagnostics.filter(d => /source-edit-(?:schema|stale|transaction|anchor)/.test(d.code))).toEqual([])
    await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "unknown", explanation: "Source relation is conditional and whole-task limits remain" }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [{ kind: "interpretation-gap", detail: "Unknown source exceptional paths remain" }] }], observations: [], scope: "Only shown entry" })
    const checked = runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(checked.status).toBe(c.status)
    if (c.value) expect(checked.value).toBe(c.value)
    expect(runtime.report().propertyAnalysis!.checks!.wholeTaskCertified).toBe(false)
    const report = runtime.report(), demands = report.propertyAnalysis!.demands, placeholder = structuredClone(demands[0]!)
    placeholder.source = { ...placeholder.source, id: "uninterpreted-helper" }
    const query = placeholder.dependencies!.propertyQueries!.queries[0]!
    query.source = placeholder.source; query.state = "unbound"; query.effectAnchorId = undefined; query.guardAnchorId = undefined; query.missing = ["effect-unbound", "guard-unbound"]
    placeholder.dependencies!.propertyQueries!.diagnostics = [{ code: "property-query-unbound", propertyId: "auth", questionId: "q", sourceId: placeholder.source.id, message: "This helper has no proposed property binding", nextAction: "Retain unknowns" }]
    const scoped = checkPropertyQueries(program, report.slice, [...demands, placeholder], report.semantic!.units, [])
    expect(scoped.questions[0]!.properties).toHaveLength(1)
    expect(scoped.questions[0]!.properties[0]!.status).toBe(c.status)
  } finally { runtime.close() }
})
