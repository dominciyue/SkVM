import path from "node:path"
import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { root, originalInput, sha, write } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
/** Development-only replays of original model arguments. No semantic values are supplied by this adapter. */
export async function replay() {
  const historical = path.resolve(root, "../authorization-task-binding-v1"), cases = [
    { id: "native", file: "native-download/preparation-and-question-binding-1/run-result.json.gz", indices: [11, 12, 13] },
    { id: "premise", file: "premise-fresh/original/inquiry-run.json.gz", indices: [17, 18, 26, 37, 43] },
    { id: "source", file: "source-fresh/original/inquiry-run.json.gz", indices: [7, 8, 38, 39, 40, 41] },
  ]
  const entries: any[] = []
  for (const c of cases) {
    const file = path.join(historical, "attempts", c.file), bytes = await readFile(file), archived = JSON.parse(gunzipSync(bytes).toString("utf8")), native = archived.authorizationInquiry ?? archived.native
    const packets = (native.account ?? archived.telemetry?.account)?.events ?? []
    const selected = c.indices.map(index => {
      const h = native.history[index], call = h.call
      const wireEvent = packets.findLastIndex((e: any) => e.direction === "server" && e.method === "item/tool/call" && e.params?.callId === call.id)
      const contextEvent = packets.slice(0, wireEvent < 0 ? packets.length : wireEvent).findLastIndex((e: any) => e.direction === "client" && (e.method === "turn/start" || e.result?.contentItems))
      return { index, jsonPath: `${archived.authorizationInquiry ? "authorizationInquiry" : "native"}.history[${index}].call`, call, response: h.output, executed: h.executed, contextEventIndex: contextEvent, contextEvent: packets[contextEvent] }
    })
    entries.push({ id: c.id, file, sha256: sha(bytes), originalModelEvents: selected, finalBudget: native.toolBudget, sourceMeaningAdded: false })
  }
  await write(path.join(root, "verification/inherited-responsibilities.json"), { schemaVersion: "authorization-bd-inherited-events/v1", modelCalls: 0, entries, originalFilesChanged: false, loweredProposalsAreNotModelArguments: true })
  const old = JSON.parse(gunzipSync(await readFile(entries[0].file)).toString("utf8")).authorizationInquiry
  const loaded = await loadInquiryInput(originalInput), declaration = structuredClone(old.program.originalDeclaration)
  declaration.questions = declaration.questions.filter((q: any) => q.id === "requested-document-and-returned-file")
  const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, maxToolCalls: 64 })
  for (const range of [{ path: "src/documents/views.py", startLine: 1835, endLine: 1839 }, { path: "src/documents/views.py", startLine: 1429, endLine: 1448 }]) await tools.execute("source_read", range)
  await tools.execute("source_symbol", { name: "download", path: "src/documents/views.py" })
  const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(declaration), tools, strategy: "semantic-completion-v1", sourceAssisted: true, remainingActions: () => 50 })
  const submissions: any[] = []
  try {
    await runtime.sync(false)
    for (const originalEvent of entries[0].originalModelEvents) {
      const selectionDiagnostics: unknown[] = []
      const delta = originalEvent.call.arguments.controlDelta, edit = old.domain.focus.sourceInterpretations.find((e: any) => e.event === "edited" && e.raw?.transactionId === delta.transactionId)
      let context: any = runtime.promptContext()
      if (context.focus.stage === "locate") {
        const candidateId = originalEvent.index === 11 ? "struct-b87a4afdcea33f96a2b2fa2d" : "struct-c1a6bd6945975b47fbb4b98c"
        const selected = await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId }); selectionDiagnostics.push(...selected.diagnostics); await runtime.sync(false); context = runtime.promptContext()
      }
      if (context.tasks[0]?.sourceSkeleton?.revision !== edit?.revision) {
        const item = context.pendingSourceWork?.find((i: any) => i.source?.startLine === 1429)
        if (item) { await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, nextItemId: item.id, reason: "Replay the next original model source event" }); await runtime.sync(false); context = runtime.promptContext() }
      }
      const form = context.tasks[0]?.sourceEdit
      if (!form || context.tasks[0].sourceSkeleton.revision !== edit?.revision) { submissions.push({ originalIndex: originalEvent.index, status: "not-offered", reason: "Current source identity does not match original event; no meaning guessed", selectionDiagnostics, currentFocus: context.focus, locationCandidates: context.locationTasks[0]?.candidates, sourceRevision: context.tasks[0]?.sourceSkeleton?.revision, originalRevision: edit?.revision }); continue }
      const migrated = { ...delta, transactionId: form.transactionId }, result = await runtime.propose(migrated); await runtime.sync(false)
      const report = runtime.report(), next: any = runtime.promptContext()
      submissions.push({ originalIndex: originalEvent.index, originalArgument: delta, migratedArgument: migrated, migration: "transactionId only", diagnostics: result.diagnostics, adoptedUnits: report.semantic?.units.map(u => ({ handle: u.handle, source: u.source, complete: u.complete })), pending: report.focus?.semanticCompletion, nextFocus: next.focus })
    }
  } finally { runtime.close() }
  const result = { schemaVersion: "authorization-bd-replay/v1", modelCalls: 0, newSemanticAnnotations: 0, originalFilesChanged: false, submissions, manualReference: { location: "src/benchmarks/authorization-dsl/semantic-completion-public.test.ts", identity: "developer-authored anonymous cross-source fixture; never model input", checked: true } }
  await write(path.join(root, "verification/replay.json"), result); return { modelCalls: 0, submissions: submissions.map(s => ({ originalIndex: s.originalIndex, status: s.status ?? (s.diagnostics.length ? "rejected" : "accepted"), adoptedUnits: s.adoptedUnits?.length })), newSemanticAnnotations: 0 }
}
