import { test, expect } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { prepareTaskProperties } from "../../task-dsl/authorization/property-intent.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { propertySourceReference } from "../../task-dsl/authorization/property-query.ts"

export async function objectSourceFixture(mode = "same") {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bc-source-objects-"))
  const entry = "from helper import perform\nfrom lookup import lookup\ndef entry(request, other_request, pk, document, other_document):\n    user = request.user\n    selected = lookup(pk, " + (mode.includes("other-document") ? "other_document" : "document") + ")\n" + (mode === "same-id-other-document" ? "    if pk != other_document.id:\n        return False\n" : "") + (mode === "unknown-change" ? "    mystery(document)\n" : "") + "    if not user.allowed:\n        return False\n    return perform(" + (mode === "other-request" ? "other_request" : "request") + ", selected)\n"
  await writeFile(path.join(sourceRoot, "entry.py"), entry)
  await writeFile(path.join(sourceRoot, "helper.py"), "def perform(request, target):\n    actor = request.user\n    target.sent = True\n    return target\n")
  await writeFile(path.join(sourceRoot, "lookup.py"), "def lookup(pk, document):\n    return document\n")
  const original = { schemaVersion: "authorization-inquiry/v2" as const, mode: "behavior" as const, operations: [{ id: "op", request: "Inspect entry", entryHint: "entry.py entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior" as const, request: "Check authorization before returning the file for the current request user and selected document.", entryHint: "entry.py entry", premises: [] }] }
  const prepared = prepareTaskProperties(original, { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "q", state: "proposed", properties: [{ kind: "authorization-before-effect", requirement: "authorization before returning the file" }] }] })
  const program = compileAuthorizationInquiry(prepared.inquiry), tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, maxToolCalls: 64 })
  for (const file of tools.files) await tools.execute("source_read", { path: file.path, startLine: 1, endLine: 20 })
  const owners = new Map<string, any>(); for (const source of tools.structure!.symbols.filter(s => s.kind === "function")) owners.set(source.name, await tools.sourceSkeleton(source.id))
  const entryOwner = owners.get("entry"), effectOwner = owners.get("perform"), guard = entryOwner.anchors.find((a: any) => a.kind === "condition" && a.text.includes("user.allowed")), effect = effectOwner.anchors.find((a: any) => a.fieldWrite)
  const ref = (s: any, anchorId: string) => propertySourceReference({ questionId: "q", operationId: "op", skeleton: s }, anchorId)
  const binding = { propertyId: prepared.questions[0]!.properties[0]!.id, effectRef: ref(effectOwner, effect.id), guardRef: ref(entryOwner, guard.id) }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "task-binding-v1", sourceAssisted: true }), edits: any[] = []
  await runtime.sync()
  for (let n = 0; n < 20; n++) {
    const c: any = runtime.promptContext()
    if (c.focus.stage === "locate") { const candidate = c.locationTasks[0].candidates.find((a: any) => a.name === "entry"); await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: c.focus.id, candidateId: candidate.id }); continue }
    if (c.focus.stage !== "interpret") break
    const task = c.tasks[0], s = [...owners.values()].find(o => o.sourceId === task.sourceSkeleton.sourceId), annotations: any[] = []
    const field = s.anchors.find((a: any) => a.name === "request.user"), principal = s.anchors.find((a: any) => /^(user|actor)$/.test(a.name ?? "")), resource = s.anchors.find((a: any) => a.kind === "parameter" && /^(document|target)$/.test(a.name))
    for (const a of s.anchors) {
      const role = a.kind === "parameter" ? /^(document|target|other_document)$/.test(a.name) ? "resource" : "condition" : a.name === "request.user" || /^(user|actor)$/.test(a.name ?? "") ? "principal" : a.name === "selected" ? "resource" : a.fieldWrite ? "effect" : a.kind === "return" ? "context" : "condition"
      annotations.push({ anchorId: a.id, role, explanation: "Test-authored meaning of the current actual source object", ...(/^(user|actor)$/.test(a.name ?? "") ? { aliasAnchorId: field.id } : {}), ...(a.kind === "condition" ? a.text.includes("user.allowed") ? { condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "user.allowed" } } }, guardBranch: "false", principalAnchorId: principal.id, resourceAnchorId: resource.id } : { condition: { op: "neq", left: { binding: "pk" }, right: { binding: "other_document.id" } } } : {}), ...(a.fieldWrite ? { principalAnchorId: principal.id, resourceAnchorId: resource.id } : {}), ...(a.kind === "return" ? { returnOutcome: a.valueExpression === "False" ? "deny" : "unknown" } : {}) })
    }
    const raw = { ...task.sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...(s.sourceId === effectOwner.sourceId ? [{ field: "propertyBindings", value: [binding] }] : [])] }
    const proposed = await runtime.propose(raw); edits.push({ raw, diagnostics: proposed.diagnostics })
    expect(proposed.diagnostics.filter(d => /^(source-edit-|source-interpretation-|semantic-update-schema)/.test(d.code)), JSON.stringify(edits)).toEqual([])
  }
  await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "unknown", explanation: "Retain source property and residual limits separately" }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [{ kind: "interpretation-gap", detail: "Exceptional and remaining source duties" }] }], observations: [], scope: "Shown test-authored source interpretation" })
  return { tools, runtime, report: runtime.report(), prepared, owners }
}
for (const [mode, status] of [["same", "checked"], ["other-request", "violated"], ["other-document", "violated"], ["same-id-other-document", "violated"], ["unknown-change", "unknown"]] as const) test(`source-backed request field and lookup result preserve actual objects: ${mode}`, async () => {
  const f = await objectSourceFixture(mode)
  try {
    const property = f.report.propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(property.status, JSON.stringify(property)).toBe(status)
    if (status !== "unknown") expect(new Set(("traceDetails" in property ? property.traceDetails : []).map(r => r.source.id)).size).toBeGreaterThan(1)
    expect(f.report.propertyAnalysis!.checks!.wholeTaskCertified).toBe(false)
  } finally { f.runtime.close() }
})
test("a request carrier cannot replace its actual user by a same-type alias claim", async () => {
  const f = await objectSourceFixture()
  try {
    const helper = f.report.semantic!.units.find(u => u.source?.id === f.owners.get("perform").sourceId)!, s = f.owners.get("perform"), request = s.anchors.find((a: any) => a.kind === "parameter" && a.name === "request"), actor = s.anchors.find((a: any) => a.name === "actor")
    let c: any = f.runtime.promptContext(); await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: c.focus.id, revisit: helper.handle, reason: "Test a request carrier claimed as its user" }); c = f.runtime.promptContext()
    const proposed = await f.runtime.propose({ ...c.tasks[0].sourceEdit.template, edits: [{ anchorId: request.id, field: "role", value: "principal" }, { anchorId: actor.id, field: "aliasAnchorId", value: request.id }] })
    expect(proposed.diagnostics.some(d => d.code === "source-interpretation-alias-source-mismatch")).toBe(true)
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
  } finally { f.runtime.close() }
})
test("a returned lookup object cannot be replaced with another same-type document by an alias edit", async () => {
  const f = await objectSourceFixture("other-document")
  try {
    const entry = f.report.semantic!.units.find(u => u.role === "entry")!, s = f.owners.get("entry"), selected = s.anchors.find((a: any) => a.name === "selected"), document = s.anchors.find((a: any) => a.kind === "parameter" && a.name === "document")
    let c: any = f.runtime.promptContext(); await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: c.focus.id, revisit: entry.handle, reason: "Test a forged alias for a lookup result" }); c = f.runtime.promptContext()
    const proposed = await f.runtime.propose({ ...c.tasks[0].sourceEdit.template, edits: [{ anchorId: selected.id, field: "aliasAnchorId", value: document.id }] })
    expect(proposed.diagnostics.some(d => d.code === "source-interpretation-alias-source-mismatch")).toBe(true)
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
  } finally { f.runtime.close() }
})
