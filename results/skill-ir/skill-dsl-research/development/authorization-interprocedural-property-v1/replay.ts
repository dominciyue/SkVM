import { mkdir, readFile, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"
import { root, sha, write, extractOriginalRegression } from "./study.ts"

/** Re-submit retained meaning only; host-owned revision migration is separately recorded. */
export async function replay() {
  const fixture = await extractOriginalRegression(), entries = [], directory = path.join(root, "verification"); await mkdir(directory, { recursive: true })
  for (const entry of fixture.entries) {
    const task = entry.attemptId.includes("download") ? "download" : "owui", loaded = await loadInquiryInput(inputPlan(task).inputFile)
    const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
    for (const unit of entry.units) if (unit.source) await tools.execute("source_read", { path: unit.source.path, startLine: unit.source.startLine, endLine: unit.source.endLine })
    const runtime = createInquiryDomainRuntime({ program: entry.program, tools, strategy: "operation-evidence-v7", sourceAssisted: true }), submissions = [], unresolved = [], seen = new Set<string>()
    try {
      await runtime.sync()
      for (let i = 0; i < 96; i++) {
        const context: any = runtime.promptContext(), focus = context.focus
        if (!focus) { unresolved.push({ code: "replay-no-public-focus" }); break }
        if (focus.stage === "locate") {
          const original = entry.units.find((u: any) => u.role === "entry")
          let candidate = context.locationTasks?.flatMap((t: any) => t.candidates).find((c: any) => c.id === original?.source?.id)
          if (!candidate) {
            const symbol = tools.structure?.symbols.find(s => s.id === original?.source?.id && s.sha256 === original?.source?.sha256)
            if (symbol) { const located = await tools.execute("source_symbol", { name: symbol.name, path: symbol.path }); candidate = located.candidates?.find(c => c.id === symbol.id) }
          }
          if (!candidate) { unresolved.push({ code: "replay-original-entry-not-offered" }); break }
          const selection = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: focus.id, candidateId: candidate.id })
          if (selection.diagnostics.some(d => /focus-|work-selection|worklist/.test(d.code))) { unresolved.push({ code: "replay-original-entry-selection-rejected", diagnostics: selection.diagnostics }); break }
          continue
        }
        if (focus.stage !== "interpret") { unresolved.push({ code: `replay-current-${focus.stage}-not-reconstructed` }); break }
        const current = context.tasks[0], skeleton = current?.sourceSkeleton && await tools.sourceSkeleton(current.sourceSkeleton.sourceId, current.receiverClass), key = `${focus.questionId}:${skeleton?.sourceId}:${current?.receiverClass ?? ""}`
        if (seen.has(key)) { unresolved.push({ code: "replay-retained-boundary-still-open", key }); break }; seen.add(key)
        const original = entry.units.find((u: any) => u.questionId === focus.questionId && u.source?.id === skeleton?.sourceId && u.source?.sha256 === skeleton?.source.sha256 && u.receiverClass === current?.receiverClass)
        const retained = original && entry.sourceDrafts.find((d: any) => d.handle === original.handle)?.interpretation
        if (!retained || !skeleton) {
          unresolved.push({ code: "replay-no-original-meaning", sourceId: skeleton?.sourceId })
          await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: focus.id, reason: "No archived original interpretation is supplied for this source; its meaning remains unknown." }); continue
        }
        const anchors = new Set(skeleton.anchors.map((a: any) => a.id)), allRefs = [...retained.annotations.map((a: any) => a.anchorId), ...retained.unresolved.map((a: any) => a.anchorId)]
        if (allRefs.some(id => !anchors.has(id))) { unresolved.push({ code: "replay-original-anchors-not-current", sourceId: skeleton.sourceId }); break }
        const interpretation = { ...structuredClone(retained), revision: skeleton.revision }
        const proposed = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: focus.id, interpretation })
        submissions.push({ originalHandle: original.handle, sourceId: skeleton.sourceId, sourceSha256: skeleton.source.sha256, originalRevision: retained.revision, currentRevision: skeleton.revision, annotationCount: retained.annotations.length, annotationRoles: [...new Set(retained.annotations.map((a: any) => a.role))], diagnostics: proposed.diagnostics, semanticAnnotationBytesUnchanged: JSON.stringify(interpretation.annotations) === JSON.stringify(retained.annotations) })
        if (proposed.diagnostics.some(d => /^(source-interpretation-|source-edit-)/.test(d.code))) { unresolved.push({ code: "replay-original-proposal-rejected", diagnostics: proposed.diagnostics }); break }
      }
      await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: entry.program.questions.map((q: any) => ({ questionId: q.id, behavior: { disposition: "unknown", explanation: "This derived check preserves the archived source interpretation and all remaining limits; no new source answer is supplied." }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [{ kind: "interpretation-gap", detail: "Archived interpretations do not establish the complete current original task." }] })), observations: [], scope: "Derived current-runtime replay of archived proposals; no real model or target execution" })
      const domain = runtime.report(), archive = `${task}-derived-domain.json.gz`; await writeFile(path.join(directory, archive), gzipSync(JSON.stringify(domain)))
      entries.push({ attemptId: entry.attemptId, originalFile: entry.originalFile, originalSha256: entry.sha256, originalHashUnchanged: sha(await readFile(entry.originalFile)) === entry.sha256, original: entry.original, scope: "derived-current-public-runtime-not-real-use", submissions, unresolved, newSemanticAnnotations: 0, derived: { materials: domain.sourceMaterials?.materials.length ?? 0, materialUses: domain.materialUses?.length ?? 0, callUses: domain.materialUses?.filter(u => u.kind === "call").length ?? 0, sourceWorkMetrics: domain.sourceWorkMetrics, propertyAnalysis: domain.propertyAnalysis, firstBlocker: unresolved[0] ?? domain.materialProjection?.diagnostics?.[0] ?? null }, archive })
    } finally { runtime.close() }
  }
  const result = { schemaVersion: "authorization-bb-replay/v1", strategy: "operation-evidence-v7", entries, modelCalls: 0, targetExecutions: 0, originalFilesChanged: false, inheritedAwaitReplay: fixture.inheritedReplay }
  await write(path.join(directory, "ba-derived-replay.json"), result); return result
}
