import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { LocalControlEnvelopeSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-control-updates.ts"
import { localExplanationContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local-extraction.ts"
import { modelSourceDisplay } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-rejected-target-directory-v1"
const sessions = path.join(root, "ordinary", stage, "run-archive/sessions"), names = await readdir(sessions)
assert.equal(names.length, 1)
const raw = await readFile(path.join(sessions, names[0]!, "run.json")), run = JSON.parse(raw.toString())
const groups = ["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"] as const
const tools: any = { evidence: run.evidence, history: [], files: run.sourceFiles, toolCalls: 0, maxToolCalls: 24,
  locateSymbols: () => [], symbolHints: () => [], execute: async () => { throw new Error("Replay must not read source") } }
const runtime = createInquiryDomainRuntime({ program: run.program, tools, strategy: "domain-evidence-v1", ablation: "scheduler-off" })
const slices = new Map<number, any>([[0, runtime.report().slice]])
let recordPosition = 0
for (const proposal of run.domain.proposals) {
  const envelope = LocalControlEnvelopeSchema.parse(proposal.delta)
  const records = run.domain.localExtractions.slice(recordPosition, recordPosition + envelope.localExtractions.length)
  recordPosition += records.length
  assert.deepEqual(records.map((r: any) => r.raw), envelope.localExtractions)
  const submitted = Object.fromEntries(groups.map(group => [group, [...envelope[group], ...records.flatMap((r: any) => r.expanded[group] ?? [])]]))
  const updated: any = await runtime.propose({ ...envelope, ...submitted, localExtractions: [] })
  assert.deepEqual(updated.accepted, proposal.accepted)
  assert.deepEqual(updated.rejected, [])
  assert.equal(runtime.report().slice.revision, proposal.revision)
  slices.set(proposal.revision, runtime.report().slice)
}
assert.equal(recordPosition, run.domain.localExtractions.length)
assert.equal(canonicalControl(runtime.report().slice), canonicalControl(run.domain.slice))
const finalItems = new Map<string, any>(run.domain.worklist.items.map((w: any) => [w.id, w]))
const inventory = new Map<string, any>([...run.domain.worklist.items.flatMap((w: any) => w.candidates), ...run.domain.dependencies.flatMap((d: any) => d.candidates), ...run.requests.flatMap((r: any) => JSON.parse(/^Current local explanation context: (.*)$/m.exec(r.params.messages.at(-1).content)![1]!).locationTasks.flatMap((t: any) => t.candidates))].map((c: any) => [c.id, c]))
const sourceFiles = new Map<string, any>(run.sourceFiles.map((f: any) => [f.path, f]))
const retrySequences = new Set<number>(run.wireFailures.map((f: any) => f.sequence + 1))
const displayed = new Set<string>(), catalogued = new Set<string>(), rows = []
let total = 0, resent = 0, selection = 0, priorContext: any, priorOriginalContext: any
for (const [index, request] of run.requests.entries()) {
  const content = request.params.messages.at(-1).content
  const state = JSON.parse(/^Domain execution state: (.*)$/m.exec(content)![1]!)
  const originalContext = JSON.parse(/^Current local explanation context: (.*)$/m.exec(content)![1]!)
  const evidence = run.evidence.filter((e: any) => originalContext.evidenceCatalog.some((c: any) => c.id === e.id))
  const newIds = evidence.filter((e: any) => !catalogued.has(e.id)).map((e: any) => e.id)
  for (const e of evidence) catalogued.add(e.id)
  const available = 262144 - total, allowance = Math.floor(available / Math.max(1, 12 - index))
  let context: any
  if (retrySequences.has(index + 1)) {
    assert.deepEqual(originalContext, priorOriginalContext)
    context = structuredClone(priorContext)
  } else {
    const slice = slices.get(state.revision)
    assert.ok(slice)
    const items = state.worklist.map((view: any) => {
      const retained = finalItems.get(view.id)
      assert.ok(retained)
      // Only observed snapshot states/IDs drive selection. Immutable original
      // candidate metadata is recovered from the retained same-ID inventory.
      const candidates = view.candidateCount === retained.candidates.length ? retained.candidates : []
      const selected = view.selected && inventory.get(view.selected.id)
      if (view.selected) {
        assert.ok(selected, `Original candidate metadata unavailable for ${view.id}:${view.selected.id}`)
        assert.equal(selected.path, view.selected.path)
        assert.equal(selected.startLine, view.selected.startLine)
        assert.equal(selected.endLine, view.selected.endLine)
        assert.equal(selected.sha256, sourceFiles.get(selected.path).sha256)
      }
      return { ...view, candidates, selected }
    })
    const diagnostics = state.diagnostics.filter((d: any) => d.severity === "error")
    const targets = slice.rules.filter((r: any) => diagnostics.some((d: any) => (!d.questionId || d.questionId === r.questionId) && (d.path.includes(`${r.questionId}.${r.key}`) || d.path === r.key && (!!d.questionId || slice.rules.filter((candidate: any) => candidate.key === d.path).length === 1))))
    const questionIds = run.program.questions.filter((q: any) => targets.some((r: any) => r.questionId === q.id) || diagnostics.some((d: any) => d.questionId ? d.questionId === q.id : d.path === q.id || d.path.startsWith(`${q.id}.`) || d.path.includes(`.${q.id}.`))).map((q: any) => q.id)
    context = localExplanationContext(run.program, items, evidence, slice, targets.flatMap((r: any) => r.evidenceIds), [...new Set([...newIds, ...evidence.filter((e: any) => !displayed.has(e.id)).map((e: any) => e.id)])], selection, { offset: selection * 2, fairOffset: selection, questionIds, maxSourceBytes: allowance })
    selection++
  }
  const display = modelSourceDisplay(evidence, JSON.stringify(context), displayed)
  assert.ok(display.bytes <= available)
  assert.equal(display.bytes, context.sourceBudget.shownBytes)
  assert.ok(context.tasks.length <= 2 && context.locationTasks.length <= 2)
  for (const task of context.tasks) for (const id of [...task.evidenceIds, ...task.callsiteEvidenceIds]) assert.ok(context.sourceWindows.some((w: any) => w.id === id))
  for (const window of context.sourceWindows) {
    const original = evidence.find((e: any) => e.id === window.id)
    const { quote, ...unmodified } = original
    assert.deepEqual(window, unmodified)
  }
  total += display.bytes; resent += display.resentBytes
  for (const id of display.evidenceIds) displayed.add(id)
  rows.push({ request: index + 1, revision: state.revision, schemaRetry: retrySequences.has(index + 1), allowance, sourceBytes: display.bytes, cumulativeSourceBytes: total, tasks: context.tasks.map((t: any) => ({ itemId: t.itemId, questionId: t.question.id, evidenceIds: t.evidenceIds })), refinements: context.locationTasks.filter((t: any) => t.candidateRefinement).map((t: any) => ({ itemId: t.itemId, questionId: t.question.id, ...t.candidateRefinement })), deferredTaskCount: context.sourceBudget.deferredTaskCount, deferredWindowCount: context.sourceBudget.deferredWindowCount })
  priorContext = structuredClone(context); priorOriginalContext = originalContext
}
assert.equal(rows.length, 11)
assert.ok(total < run.sourceAccounting.cumulativeModelSourceBytes)
assert.ok(rows.some(r => r.refinements.length > 0))
assert.ok(rows.some(r => r.tasks.some((t: any) => t.questionId === "download-original-archive")))
assert.ok(rows.some(r => r.tasks.some((t: any) => t.questionId === "download-authorization-root-version")))
assert.equal(tools.toolCalls, 0)
const output = { schemaVersion: "authorization-ar-source-window-budget-replay/v1", stage, session: names[0], originalRunSha256: createHash("sha256").update(raw).digest("hex"), providerCalls: 0, sourceActions: 0, targetExecutions: 0, acceptedStateUnchanged: true, originalValidation: run.validation.valid, promoted: false, originalSourceBytes: run.sourceAccounting.cumulativeModelSourceBytes, projectedSourceWindowBytes: total, originalResentBytes: run.sourceAccounting.resentSourceBytes, projectedResentBytes: resent, remainingDisplayBytes: 262144 - total, rows,
  scope: "Selection-only projection over frozen original request snapshots, recorded valid host expansions and immutable candidate metadata. Same-tool retries reuse their preceding selected context. Original state trajectory, read history, final failure and answers remain unchanged. No new full prompt, dependency state, model answer, semantic extraction or eligibility replay; projected bytes are source windows, not measured new SDK tokens or causal quality benefit." }
await writeFile(path.join(root, "source-window-budget-replay.json"), JSON.stringify(output, null, 2) + "\n")
console.log(JSON.stringify({ requests: rows.length, acceptedStateUnchanged: true, projectedSourceWindowBytes: total, projectedResentBytes: resent, originalSourceBytes: output.originalSourceBytes, providerCalls: 0, promoted: false }))
