import assert from "node:assert/strict"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { worklistModelView, type WorkItem } from "../../../../../src/benchmarks/authorization-dsl/inquiry-worklist.ts"
import { localExplanationContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local-extraction.ts"
import { modelSourceDisplay } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-location-routing-v1"
const archive = path.join(root, "ordinary", stage, "run-archive", "sessions")
const { readdir } = await import("node:fs/promises"), directories = await readdir(archive)
assert.equal(directories.length, 1)
const runBytes = await readFile(path.join(archive, directories[0]!, "run.json")), run = JSON.parse(runBytes.toString())
const references = new Map(localExplanationContext(run.program, [], run.evidence, run.domain.slice).evidenceCatalog.map(e => [e.id, e]))
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
const rows: any[] = []
for (const [index, request] of run.requests.entries()) {
  const params = structuredClone(request.params), message = params.messages.find((m: any) => m.content.includes("Current local explanation context: "))
  assert.ok(message)
  const prompt = message.content as string
  const catalogStart = "Already shown original source: ", historyStart = "\n\nAction history: ", stateStart = "\nDomain execution state: ", contextStart = "\n\nCurrent local explanation context: ", end = "\n\nRemaining dispatches:"
  const catalog = JSON.parse(prompt.split(catalogStart)[1]!.split(historyStart)[0]!), state = JSON.parse(prompt.split(stateStart)[1]!.split(contextStart)[0]!), context = JSON.parse(prompt.split(contextStart)[1]!.split(end)[0]!)
  const originalItems = state.worklist as WorkItem[], projected = worklistModelView(originalItems)
  assert.deepEqual(projected.map(i => [i.id, i.questionId, i.state, i.nextAction, i.callsiteEvidenceIds, i.evidenceIds]), originalItems.map(i => [i.id, i.questionId, i.state, i.nextAction, i.callsiteEvidenceIds, i.evidenceIds]))
  state.worklist = projected
  const catalogBeforeBytes = bytes(context.evidenceCatalog)
  context.evidenceCatalog = catalog.map((e: any) => {
    const current = references.get(e.id); assert.ok(current)
    assert.deepEqual([current.path, current.startLine, current.endLine], [e.path, e.startLine, e.endLine])
    return { ...current, shown: e.shown, ...(e.previousVerified ? { previousVerified: true } : {}) }
  })
  const rendered = prompt.slice(0, prompt.indexOf(catalogStart) + catalogStart.length) + "Use evidenceCatalog in the current local explanation context; original source text is in sourceWindows." + prompt.slice(prompt.indexOf(historyStart), prompt.indexOf(stateStart) + stateStart.length) + JSON.stringify(state) + contextStart + JSON.stringify(context) + prompt.slice(prompt.indexOf(end))
  const before = modelSourceDisplay(run.evidence, prompt, new Set<string>()), after = modelSourceDisplay(run.evidence, rendered, new Set<string>())
  assert.deepEqual(after, before)
  assert.deepEqual(JSON.parse(rendered.split(contextStart)[1]!.split(end)[0]!).sourceWindows, context.sourceWindows)
  message.content = rendered
  rows.push({ request: index + 1, remainingDispatches: Number(/Remaining dispatches: (\d+)/.exec(prompt)![1]), deliveryReserved: prompt.includes("Reserved delivery opportunity:"), beforeSerializedMessageBytes: bytes(request.params.messages), afterSerializedMessageBytes: bytes(params.messages), beforeQueueBytes: bytes(originalItems), afterQueueBytes: bytes(projected), beforeCatalogBytes: catalogBeforeBytes, afterCatalogBytes: bytes(context.evidenceCatalog), originalWindowBytes: before.bytes, everySourceWindowAndTaskPreserved: true })
}
const finalItems = run.domain.worklist.items as WorkItem[], leads = finalItems.filter(i => i.code === "reference-relevance-unconfirmed")
const shownLeads = new Set<string>()
// Other unlocated duties participate in the same rotation; their count is not the lead count.
for (let offset = 0; offset < finalItems.length; offset++) {
  const context = localExplanationContext(run.program, finalItems, run.evidence, run.domain.slice, [], [], offset)
  for (const t of context.locationTasks) {
    if (t.optionalLocationLead) shownLeads.add(t.itemId)
    assert.ok(t.candidates.every(c => finalItems.find(i => i.id === t.itemId)!.candidates.some(original => original.id === c.id)))
    assert.ok(context.sourceWindows.every(e => run.evidence.some((original: any) => original.id === e.id && original.sha256 === e.sha256 && original.text === e.text)))
  }
}
assert.deepEqual([...shownLeads].sort(), leads.map(i => i.id).sort())
const result = { schemaVersion: "authorization-ar-compact-context-replay/v1", stage, originalRunSha256: createHash("sha256").update(runBytes).digest("hex"), providerCalls: 0, targetExecutions: 0, comparison: "Only mechanical serialization changes on the same archived requests, source windows and tasks; no new model responses, causal quality claim, or complete current-prompt simulation", totals: { beforeSerializedMessageBytes: rows.reduce((n, r) => n + r.beforeSerializedMessageBytes, 0), afterSerializedMessageBytes: rows.reduce((n, r) => n + r.afterSerializedMessageBytes, 0) }, originalSdkPayloadBytes: null, optionalLeads: leads.length, allOptionalLeadsOfferedByBoundedRotation: true, actualWindowsUnchanged: true, originalReportsRewritten: false, checkedDeliveryPromoted: false, rows }
await writeFile(path.join(root, "compact-context-replay.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ ...result.totals, optionalLeads: leads.length, providerCalls: 0, actualWindowsUnchanged: true, checkedDeliveryPromoted: false }))
