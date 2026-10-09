import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { gunzipSync, gzipSync } from "node:zlib"
import path from "node:path"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { root, bbRoot, sha, write } from "./study.ts"

/** Revision migration is mechanical; no archived source meaning is edited. */
export function migrateRetainedInterpretation(retained: any, skeleton: any, owners: any[]) {
  const anchors = new Set(skeleton.anchors.map((a: any) => a.id))
  if ([...retained.annotations, ...retained.unresolved].some(a => !anchors.has(a.anchorId))) throw new Error("An archived anchor is not present in the current identical source")
  const interpretation = structuredClone(retained), migrations: any[] = []
  const revision = (value: any, current: any, field: string) => { if (value.revision !== current.revision) { migrations.push({ field, original: value.revision, current: current.revision }); value.revision = current.revision } }
  revision(interpretation, skeleton, "revision")
  for (const [i, binding] of (interpretation.propertyBindings ?? []).entries()) for (const field of ["effectRef", "guardRef"]) if (binding[field]) {
    const ref = binding[field], qualified = owners.filter(s => s.sourceId === ref.sourceId && s.source.sha256 === ref.sourceSha256 && s.anchors.some((a: any) => a.id === ref.anchorId))
    if (qualified.length !== 1) throw new Error("An archived qualified reference has no unique current identical-source owner")
    revision(ref, qualified[0], `propertyBindings.${i}.${field}.revision`)
  }
  return { interpretation, migrations }
}
export function replayBlockerOwner(domain: any, blocker: any) {
  const item = domain.worklist?.items?.find((i: any) => i.selected?.id === blocker?.sourceId && (!blocker.questionId || i.questionId === blocker.questionId)), s = item?.selected
  return s ? { sourceId: s.id, path: s.path, sourceSha256: s.sha256, startLine: s.startLine, endLine: s.endLine, symbol: s.qualifiedName, receiverClass: item.receiverClass, currentRevision: item.progress?.skeletonRevision, missingField: "current source interpretation", pendingAnnotations: item.progress?.pendingAnnotations, nextAction: "Supply a new source-grounded proposal in a separate attempt; zero-new-meaning replay cannot fill this gap." } : null
}
export async function replay(label = "original") {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a new lowercase replay label")
  const directory = path.join(root, "verification/current-derived-replay", label); await mkdir(path.dirname(directory), { recursive: true }); await mkdir(directory)
  const entries: any[] = []
  for (const [task, attemptId, archive] of [["download", "consumer-download-inquiry/original", "inquiry-run.json.gz"], ["owui", "pilot-owui/original", "run-result.json.gz"]]) {
    const originalFile = path.join(bbRoot, "attempts", attemptId!, archive!), bytes = await readFile(originalFile), originalSha256 = sha(bytes), raw = JSON.parse(gunzipSync(bytes).toString("utf8")), original = raw.authorizationInquiry ?? raw, domain = original.domain
    const claimFile = path.join(bbRoot, "attempts", attemptId!, "claim.json"), claim = JSON.parse(await readFile(claimFile, "utf8")), input = await loadInquiryInput(claim.inputFile)
    if (input.inputSha256 !== claim.inputSha256) throw new Error("Archived input bytes no longer match the original claim")
    const progressFile = path.join(directory, `${task}-preparation.jsonl`), pendingWrites: Promise<void>[] = [], started = Date.now()
    const tools = await createInquiryTools({ ...input.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, preparation: { timeoutMs: 180000, onProgress: event => { pendingWrites.push(appendFile(progressFile, JSON.stringify(event) + "\n")); if (event.state === "started" || event.state === "completed" || event.state === "failed") console.log(JSON.stringify({ replay: task, phase: event.phase, state: event.state, elapsedMs: event.elapsedMs })) } } })
    await Promise.all(pendingWrites)
    const owners = []
    for (const unit of domain.semantic.units) if (unit.source) { await tools.execute("source_read", { path: unit.source.path, startLine: unit.source.startLine, endLine: unit.source.endLine }); const s = await tools.sourceSkeleton(unit.source.id, unit.receiverClass); if (s) owners.push(s) }
    const runtime = createInquiryDomainRuntime({ program: original.program, tools, strategy: "task-binding-v1", sourceAssisted: true }), submissions: any[] = [], unresolved: any[] = [], seen = new Set<string>()
    try {
      await runtime.sync()
      for (let i = 0; i < 96; i++) {
        const context: any = runtime.promptContext(), focus = context.focus
        if (!focus) { unresolved.push({ code: "replay-no-public-focus" }); break }
        if (focus.stage === "locate") {
          const entry = domain.semantic.units.find((u: any) => u.role === "entry" && u.questionId === focus.questionId) ?? domain.semantic.units.find((u: any) => u.role === "entry")
          let candidate = context.locationTasks.flatMap((t: any) => t.candidates).find((s: any) => s.id === entry?.source?.id)
          if (!candidate) { const symbol = tools.structure!.symbols.find(s => s.id === entry?.source?.id && s.sha256 === entry?.source?.sha256); if (symbol) candidate = (await tools.execute("source_symbol", { name: symbol.name, path: symbol.path })).candidates?.find(s => s.id === symbol.id) }
          if (!candidate) { unresolved.push({ code: "replay-original-entry-not-offered", questionId: focus.questionId }); break }
          const selected = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: focus.id, candidateId: candidate.id })
          if (selected.diagnostics.some(d => /focus-|work-selection|worklist/.test(d.code))) { unresolved.push({ code: "replay-selection-rejected", diagnostics: selected.diagnostics }); break }
          continue
        }
        if (focus.stage !== "interpret") { unresolved.push({ code: `replay-current-${focus.stage}-not-reconstructed` }); break }
        const current = context.tasks[0], skeleton = current?.sourceSkeleton && await tools.sourceSkeleton(current.sourceSkeleton.sourceId, current.receiverClass), key = `${focus.questionId}:${skeleton?.sourceId}:${current.receiverClass ?? ""}`
        if (seen.has(key)) { unresolved.push({ code: "replay-retained-boundary-still-open", key }); break }; seen.add(key)
        const unit = domain.semantic.units.find((u: any) => u.questionId === focus.questionId && u.source?.id === skeleton?.sourceId && u.source?.sha256 === skeleton?.source.sha256 && u.receiverClass === current.receiverClass), retained = unit && domain.focus.sourceDrafts.find((d: any) => d.handle === unit.handle)?.interpretation
        if (!retained || !skeleton) { unresolved.push({ code: "replay-no-original-meaning", sourceId: skeleton?.sourceId, questionId: focus.questionId }); await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: focus.id, reason: "No original archived source meaning is supplied for this owner." }); continue }
        let migrated: ReturnType<typeof migrateRetainedInterpretation>
        try { migrated = migrateRetainedInterpretation(retained, skeleton, owners) } catch (error) { unresolved.push({ code: "replay-mechanical-migration-rejected", sourceId: skeleton.sourceId, error: String(error) }); break }
        const proposed = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: focus.id, interpretation: migrated.interpretation })
        submissions.push({ originalHandle: unit.handle, sourceId: skeleton.sourceId, sourceSha256: skeleton.source.sha256, originalRevision: retained.revision, currentRevision: skeleton.revision, migrations: migrated.migrations, annotationCount: retained.annotations.length, semanticAnnotationBytesUnchanged: JSON.stringify(migrated.interpretation.annotations) === JSON.stringify(retained.annotations), diagnostics: proposed.diagnostics })
        if (proposed.diagnostics.some(d => /^(source-interpretation-|source-edit-)/.test(d.code))) { unresolved.push({ code: "replay-original-proposal-rejected", sourceId: skeleton.sourceId, diagnostics: proposed.diagnostics }); break }
      }
      await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: original.program.questions.map((q: any) => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "Only archived source interpretations were resubmitted; no new source answer is supplied." }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [{ kind: "interpretation-gap", detail: "Archived meanings do not establish the complete current original task." }] })), observations: [], scope: "Derived current replay, zero new model or source meaning" })
      const derived = runtime.report(), archiveFile = `${task}-domain.json.gz`; await writeFile(path.join(directory, archiveFile), gzipSync(JSON.stringify(derived)), { flag: "wx" })
      await write(path.join(directory, `${task}-blocker-owner.json`), replayBlockerOwner(derived, unresolved[0]), true)
      entries.push({ task, attemptId, originalFile, originalSha256, originalHashUnchanged: sha(await readFile(originalFile)) === originalSha256, inputFile: claim.inputFile, inputSha256: claim.inputSha256, originalQuestionIds: original.program.questions.map((q: any) => q.id), originalAnnotationCount: domain.focus.sourceDrafts.reduce((n: number, d: any) => n + d.interpretation.annotations.length, 0), preparation: tools.preparation, durationMs: Date.now() - started, submissions, unresolved, firstBlocker: unresolved[0] ?? derived.materialProjection?.diagnostics?.[0] ?? derived.propertyAnalysis?.demands?.flatMap((d: any) => d.dependencies?.propertyQueries?.diagnostics ?? [])[0] ?? null, derived: { sourceWorkMetrics: derived.sourceWorkMetrics, materialUses: derived.materialUses?.length ?? 0, propertyAnalysis: derived.propertyAnalysis }, archiveFile, newSemanticAnnotations: 0 })
    } finally { runtime.close() }
  }
  const result = { schemaVersion: "authorization-bc-derived-replay/v1", strategy: "task-binding-v1", scope: "Current derived public-runtime replay, not real model use", entries, modelCalls: 0, targetExecutions: 0, newSemanticAnnotations: 0, inheritedUnknownDispositionChanged: false }
  await write(path.join(directory, "summary.json"), result, true); return result
}
