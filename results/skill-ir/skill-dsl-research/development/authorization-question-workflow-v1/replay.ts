import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { gunzipSync, gzipSync } from "node:zlib"
import { root, originalInput, skillFile, sha, write } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { createInquiryTransmissionMeter, createInquiryContextEncoder, resolveInquiryContext, projectInquiryQuestionContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { drfReceiverScope, operationWork } from "../../../../../src/benchmarks/authorization-dsl/operation-work.ts"
import { loadRunSkill, buildRunSkillBundle } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"

/** Only revision references migrate. All original model semantic values survive. */
export function migrateInterpretation(original: any, current: any, skeletons: Map<string, any>) {
  const interpretation = structuredClone(original), migrations: any[] = [], failures: string[] = []
  for (const a of [...interpretation.annotations, ...interpretation.unresolved]) if (!current.anchors.some((c: any) => c.id === a.anchorId)) failures.push(`original-anchor-unavailable:${a.anchorId}`)
  for (const binding of interpretation.propertyBindings ?? []) for (const field of ["effectRef", "guardRef"]) {
    const ref = binding[field]; if (!ref) continue
    const source = skeletons.get(ref.sourceId)
    if (!source || source.source.sha256 !== ref.sourceSha256 || !source.anchors.some((a: any) => a.id === ref.anchorId)) { failures.push(`original-property-source-unavailable:${field}`); continue }
    migrations.push({ field, sourceId: ref.sourceId, from: ref.revision, to: source.revision }); ref.revision = source.revision
  }
  migrations.push({ field: "revision", from: interpretation.revision, to: current.revision }); interpretation.revision = current.revision
  return { interpretation, migrations, failures, annotationsByteIdentical: JSON.stringify(original.annotations) === JSON.stringify(interpretation.annotations), unresolvedByteIdentical: JSON.stringify(original.unresolved) === JSON.stringify(interpretation.unresolved) }
}
function wireAccounting(events: any[], bundle: string) {
  const actual = createInquiryTransmissionMeter(), projected = createInquiryTransmissionMeter(), encoder = createInquiryContextEncoder(), previous: any[] = [], errors: any[] = [], contexts: any[] = []
  for (const [index, event] of events.entries()) if (event.direction === "client") {
    if (event.method === "thread/start") { if (event.params.dynamicTools) { actual.record("tools", event.params.dynamicTools); projected.record("tools", event.params.dynamicTools) }; if (event.params.baseInstructions) { const skill = event.params.baseInstructions.startsWith(bundle) ? bundle : ""; actual.recordSystem(event.params.baseInstructions, skill); projected.recordSystem(event.params.baseInstructions, skill) } }
    let payload: any, text: string | undefined, initial = false
    if (event.method === "turn/start") { initial = true; text = event.params.input?.[0]?.text; try { payload = { currentContext: JSON.parse(text!.split("Current local explanation context: ")[1]!) } } catch { errors.push({ index, code: "original-context-not-decodable" }); continue } }
    else if (event.result?.contentItems) { text = event.result.contentItems[0].text; try { payload = JSON.parse(text!) } catch { errors.push({ index, code: "original-reply-not-json" }); continue } }
    if (!payload?.currentContext || !text) continue
    actual.record(initial ? "initial-context" : "tool-reply", initial ? payload.currentContext : payload, text)
    try {
      const full = resolveInquiryContext(payload.currentContext, previous); previous.push(payload.currentContext)
      const view = projectInquiryQuestionContext(full), encoded = encoder(view).context, changed = initial ? encoded : { ...payload, currentContext: encoded }, changedText = initial ? text.split("Current local explanation context: ")[0] + "Current local explanation context: " + JSON.stringify(encoded) : JSON.stringify(changed)
      projected.record(initial ? "initial-context" : "tool-reply", changed, changedText)
      contexts.push({ index, originalBytes: Buffer.byteLength(text), projectedBytes: Buffer.byteLength(changedText), questionId: full.focus?.questionId, originalQuestionCount: full.questions?.length ?? null, projectedQuestionCount: view.questions?.length ?? null, originalQuestionIdsRetained: view.originalQuestionIds ?? view.questions?.map((q: any) => q.id), sourceWindowsByteIdentical: JSON.stringify(full.sourceWindows) === JSON.stringify(view.sourceWindows) })
    } catch (error) { errors.push({ index, code: "original-reference-unrecoverable", reason: String(error) }) }
  }
  return { actual: actual.report(), currentProjectionOfSamePayloads: projected.report(), contexts, errors, exactHistoricalComponentTokens: null, providerRequests: null, interpretation: "Exact archived outbound bytes plus zero-call current question projection of the same retained payloads. This is not a real H/D run or a causal token attribution." }
}
export async function replay() {
  const loaded = await loadInquiryInput(originalInput), entries: any[] = [], bundle = redactCodexEvent(buildRunSkillBundle(await loadRunSkill(skillFile), "inject")!.content) as string
  for (const id of ["quality-d-1", "quality-d-2"]) {
    const file = path.resolve(root, `../authorization-semantic-completion-v1/attempts/${id}/original/inquiry-run.json.gz`), bytes = await readFile(file), original = JSON.parse(gunzipSync(bytes).toString("utf8")), archive = original.domain, packets = original.telemetry.account.events
    const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, maxToolCalls: 128, maxDisplayBytes: 33554432, maxReadBytes: 33554432 })
    const restored = tools.restoreEvidence(original.evidence), skeletons = new Map<string, any>()
    for (const unit of archive.semantic.units) if (unit.source) { if (!tools.evidence.some(e => e.path === unit.source.path && e.sha256 === unit.source.sha256 && e.startLine <= unit.source.startLine && e.endLine >= unit.source.endLine)) await tools.execute("source_read", { path: unit.source.path, startLine: unit.source.startLine, endLine: unit.source.endLine }); skeletons.set(unit.source.id, await tools.sourceSkeleton(unit.source.id, unit.receiverClass)) }
    await tools.execute("source_symbol", { name: "download", path: "src/documents/views.py" })
    const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(original.program.originalDeclaration), tools, strategy: "semantic-completion-v1", sourceAssisted: true, remainingActions: () => 96 }), submissions: any[] = [], missing: any[] = [], seen = new Set<string>()
    try {
      await runtime.sync(false)
      for (let step = 0; step < 48; step++) {
        const context: any = runtime.promptContext(), focus = context.focus
        if (focus?.stage === "locate") {
          const unit = archive.semantic.units.find((u: any) => u.questionId === focus.questionId && u.role === "entry")
          if (!unit) { missing.push({ questionId: focus.questionId, code: "no-original-entry-meaning" }); await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: focus.id, reason: "No archived original model entry is supplied." }); continue }
          const result = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: focus.id, candidateId: unit.source.id }); if (result.diagnostics.length) { missing.push({ code: "original-selection-unavailable", diagnostics: result.diagnostics }); break }; continue
        }
        if (focus?.stage !== "interpret") { missing.push({ code: `current-${focus?.stage ?? "no-focus"}` }); break }
        const task = context.tasks[0], source = task?.sourceSkeleton, key = `${focus.questionId}:${source?.sourceId}:${task?.receiverClass ?? ""}`
        const unit = archive.semantic.units.find((u: any) => u.questionId === focus.questionId && u.source?.id === source?.sourceId && u.receiverClass === task?.receiverClass), draft = unit && archive.focus.sourceDrafts.find((d: any) => d.handle === unit.handle)?.interpretation
        if (seen.has(key) || !draft || !source) {
          const pending = context.pendingSourceWork?.find((i: any) => i.state === "awaiting-interpretation" && archive.semantic.units.some((u: any) => u.questionId === i.questionId && u.source?.id === i.source.id && !seen.has(`${i.questionId}:${i.source.id}:${i.receiverClass ?? ""}`)))
          missing.push({ questionId: focus.questionId, source: focus.source, code: seen.has(key) ? "original-partial-still-open" : "no-original-model-meaning" })
          await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: focus.id, ...(pending ? { nextItemId: pending.id } : {}), reason: "Retain the archived partial and missing meanings; no new semantic value is supplied." }); continue
        }
        seen.add(key)
        const skeleton = await tools.sourceSkeleton(source.sourceId, task.receiverClass), migrated = migrateInterpretation(draft, skeleton, skeletons)
        if (migrated.failures.length) { missing.push({ key, code: "original-source-incompatible", failures: migrated.failures }); continue }
        const result = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: focus.id, interpretation: migrated.interpretation })
        submissions.push({ questionId: focus.questionId, source: skeleton!.source, originalHandle: unit.handle, originalAnnotationSha256: sha(JSON.stringify(draft.annotations)), currentAnnotationSha256: sha(JSON.stringify(migrated.interpretation.annotations)), migrations: migrated.migrations, annotationsByteIdentical: migrated.annotationsByteIdentical, unresolvedByteIdentical: migrated.unresolvedByteIdentical, propertyBindingsFromOriginalModel: draft.propertyBindings?.length ?? 0, diagnostics: result.diagnostics })
      }
      await runtime.sync(false)
      const domain = runtime.report(), receivers = [...new Set<string>((archive.worklist.frameworkBoundaries ?? []).flatMap((b: any) => /^drf:(.+):dispatch$/.exec(b.key)?.[1] ?? []))].map(className => { const scope = drfReceiverScope(tools.structure!, className), symbol = tools.structure!.symbols.find(s => s.kind === "class" && s.qualifiedName === className), work = symbol && operationWork(tools.structure!, symbol.id, [], [], className, { sourceAssisted: true, questionDirected: true, operationRoot: true }); return { className, scope, oldDispatchOccurrences: archive.worklist.frameworkBoundaries.filter((b: any) => b.key === `drf:${className}:dispatch`).length, currentDispatchGaps: work?.frameworkGaps.filter(g => g.key === `drf:${className}:dispatch`).length ?? null, currentDispatchActions: work?.actions.filter(a => a.relationId === `drf:${className}:dispatch`).length ?? null } })
      const archiveName = `${id}-derived-domain.json.gz`; await writeFile(path.join(root, "verification", archiveName), gzipSync(JSON.stringify(domain)))
      entries.push({ attemptId: `${id}/original`, file, originalSha256: sha(bytes), originalHashUnchanged: sha(await readFile(file)) === sha(bytes), restoredEvidenceDiagnostics: restored.diagnostics, sourceMeaningAdded: false, newModelCalls: 0, original: { units: archive.semantic.units.length, materials: archive.sourceMaterials.materials.length, frameworkBoundaries: archive.worklist.frameworkBoundaries.length, propertyStatuses: archive.propertyAnalysis?.checks?.questions.map((q: any) => ({ questionId: q.questionId, properties: q.properties.map((p: any) => p.status) })) }, submissions, missing, receivers, derived: { units: domain.semantic?.units.length ?? 0, materials: domain.sourceMaterials?.materials.length ?? 0, materialUses: domain.materialUses?.length ?? 0, propertyAnalysis: domain.propertyAnalysis, frameworkBoundaries: domain.worklist?.frameworkBoundaries?.length ?? 0 }, archive: archiveName, wire: wireAccounting(packets, bundle) })
    } finally { runtime.close() }
  }
  const result = { schemaVersion: "authorization-be-derived-replay/v1", modelCalls: 0, originalFilesChanged: false, newSemanticAnnotations: 0, entries }
  await write(path.join(root, "verification", "bd-derived-replay.json"), result)
  return { modelCalls: 0, newSemanticAnnotations: 0, entries: entries.map(e => ({ attemptId: e.attemptId, originalHashUnchanged: e.originalHashUnchanged, originalUnits: e.original.units, derivedUnits: e.derived.units, submissions: e.submissions.length, falseDataDispatchOccurrences: e.receivers.filter((r: any) => r.scope.state === "data").reduce((n: number, r: any) => n + r.oldDispatchOccurrences, 0), wireSamples: e.wire.actual.samples.length, projectionErrors: e.wire.errors.length })) }
}
