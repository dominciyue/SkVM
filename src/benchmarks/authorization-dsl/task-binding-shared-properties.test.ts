import { test, expect } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
test("shared operation meaning offers a separate current property transaction for each original question", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bc-shared-properties-")); await writeFile(path.join(sourceRoot, "entry.py"), "from helper import perform\ndef entry(user, document):\n    return perform(user, document)\n"); await writeFile(path.join(sourceRoot, "helper.py"), "def perform(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return target\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["."], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "entry.py", startLine: 1, endLine: 3 }); await tools.execute("source_read", { path: "helper.py", startLine: 1, endLine: 5 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry.entry", entryHint: "entry.entry" }], questions: ["first", "second"].map((id, index) => ({ id, operationId: "op", intent: "behavior", entryHint: "entry.entry", request: `Inspect entry.entry: ${index ? "authorization before the write" : "object matches the write"}`, premises: [], properties: [{ id: `p-${id}`, kind: index ? "authorization-before-effect" : "authorized-object-matches-effect", requirement: index ? "authorization before the write" : "object matches the write" }] })) } as any)
  expect(program.status, JSON.stringify(program.diagnostics)).toBe("ready")
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "task-binding-v1", sourceAssisted: true }), seen = new Set<string>()
  try {
    await runtime.sync()
    await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: program.questions.map(q => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "Source not yet interpreted" }, branches: [], evidenceIds: [], missing: [] })), observations: [], scope: "Current original questions" })
    const unlocated = runtime.report().propertyAnalysis!.checks!.questions.find(q => q.questionId === "second")!
    expect(unlocated.properties.map(p => [p.propertyId, p.status])).toEqual([["p-second", "unknown"]])
    expect(unlocated.properties[0]!.gaps).toContain("property-source-unlocated")
    expect(unlocated.gaps).toEqual([])
    for (let step = 0; step < 18; step++) {
      const context: any = runtime.promptContext()
      if (context.focus.stage === "locate") { const candidate = context.locationTasks[0].candidates.find((s: any) => s.name === "entry") ?? context.locationTasks[0].candidates[0]; await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: candidate.id }); continue }
      if (context.focus.stage !== "interpret") break
      expect(context.tasks.length, JSON.stringify({ focus: context.focus, deferred: context.deferredTasks, windows: context.sourceWindows, last: runtime.report().focus?.history.at(-1) })).toBeGreaterThan(0)
      const task = context.tasks[0], skeleton = await tools.sourceSkeleton(task.sourceSkeleton.sourceId), anchors = skeleton!.anchors, principal = anchors.find(a => a.kind === "parameter" && /^(user|actor)$/.test(a.name!))!, resource = anchors.find(a => a.kind === "parameter" && /^(document|target)$/.test(a.name!))!, annotations: any[] = []
      for (const a of anchors) {
        if (a.kind === "parameter") annotations.push({ anchorId: a.id, role: a.id === principal.id ? "principal" : "resource", explanation: "Actual source formal" })
        if (a.kind === "condition") annotations.push({ anchorId: a.id, role: "condition", explanation: "Failed guard returns", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: principal.id, resourceAnchorId: resource.id })
        if (a.fieldWrite) annotations.push({ anchorId: a.id, role: "effect", explanation: "Actual target write", principalAnchorId: principal.id, resourceAnchorId: resource.id })
        if (a.kind === "call") annotations.push({ anchorId: a.id, role: "effect", explanation: "Actual helper invocation", principalAnchorId: principal.id, resourceAnchorId: resource.id })
        if (a.kind === "return") annotations.push({ anchorId: a.id, role: "context", explanation: "Source return", returnOutcome: "unknown" })
      }
      const effect = context.propertyReferences.find((r: any) => r.text.startsWith("perform(")), guard = context.propertyReferences.find((r: any) => r.text.includes("actor.allowed")), propertyId = `p-${context.focus.questionId}`
      const bindings = effect && guard && anchors.some(a => a.kind === "condition") ? [{ propertyId, effectRef: effect.ref, guardRef: guard.ref }] : []
      if (context.focus.questionId === "second") {
        expect(task.sourceEdit.retainedDraft.propertyBindings).toEqual([])
        expect(task.propertyDemand.propertyQueries.queries.map((p: any) => [p.id, p.state])).toEqual([["p-second", "unbound"]])
        expect(context.propertyReferences.every((r: any) => r.ref.questionId === "second")).toBe(true)
        expect(new Set(context.propertyReferences.map((r: any) => JSON.stringify(r.ref))).size).toBe(context.propertyReferences.length)
      }
      if (context.focus.questionId === "second") expect(bindings.length, JSON.stringify({ refs: context.propertyReferences, uses: runtime.report().materialUses, projection: runtime.report().materialProjection, units: runtime.report().semantic?.units.map(u => ({ role: u.role, questionId: u.questionId, source: u.source })), diagnostics: context.diagnostics })).toBe(1)
      const edits = [...(context.focus.questionId === "second" ? [] : annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value })))), ...(bindings.length ? [{ field: "propertyBindings", value: bindings }] : [])]
      const result = await runtime.propose({ ...task.sourceEdit.template, edits }); expect(result.diagnostics.filter(d => /^(source-edit-|source-interpretation-)/.test(d.code))).toEqual([])
      if (bindings.length) seen.add(context.focus.questionId)
    }
    await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: program.questions.map(q => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "Explicit anonymous source fixture" }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [] })), observations: [], scope: "Offline test-authored source meaning" })
    expect([...seen].sort()).toEqual(["first", "second"])
    const questions = runtime.report().propertyAnalysis!.checks!.questions
    expect(questions.map(q => q.properties.map(p => [p.propertyId, p.status]))).toEqual([[['p-first', 'checked']], [['p-second', 'checked']]])
    expect(questions.every(q => q.properties.every(p => new Set(("traceDetails" in p ? p.traceDetails : []).map(r => r.source?.id).filter(Boolean)).size === 2))).toBe(true)
    const second = runtime.report().semantic!.units.find(u => u.questionId === "second")!
    const current: any = runtime.promptContext(); await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: current.focus.id, revisit: second.handle, reason: "Withdraw the second question's explicit property binding" })
    const reoffered: any = runtime.promptContext(); await runtime.propose({ ...reoffered.tasks[0].sourceEdit.template, edits: [{ field: "propertyBindings", value: [] }] })
    await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: program.questions.map(q => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "Binding withdrawn explicitly" }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [] })), observations: [], scope: "Current anonymous source" })
    expect(runtime.report().propertyAnalysis!.checks!.questions.find(q => q.questionId === "second")!.properties.every(p => p.status === "unknown")).toBe(true)
  } finally { runtime.close() }
})
