import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { applyControlUpdates, LocalControlEnvelopeSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-control-updates.ts"
import { createControlSlice, canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-source-window-budget-v1"
const session = "2026-10-04T005950929Z-5d49e654"
const raw = await readFile(path.join(root, "ordinary", stage, "run-archive/sessions", session, "run.json"))
const run = JSON.parse(raw.toString()), groups = ["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"] as const
const context = { questionIds: run.program.questions.map((q: any) => q.id), shownEvidenceIds: run.evidence.map((e: any) => e.id) }
let state = createControlSlice(), rejections: any[] = [], recordPosition = 0
const prefix = []
for (const [index, proposal] of run.domain.proposals.slice(0, 5).entries()) {
  const envelope = LocalControlEnvelopeSchema.parse(proposal.delta)
  const records = run.domain.localExtractions.slice(recordPosition, recordPosition + envelope.localExtractions.length)
  recordPosition += records.length
  assert.deepEqual(records.map((r: any) => r.raw), envelope.localExtractions)
  const submitted = Object.fromEntries(groups.map(group => [group, [...envelope[group], ...records.flatMap((r: any) => r.expanded[group] ?? [])]]))
  const initialRejections = proposal.rejected.filter((r: any) => r.diagnostics.some((d: any) => d.code.startsWith("local-")))
  const before = structuredClone(state)
  const applied = applyControlUpdates(state, { ...envelope, ...submitted, localExtractions: [] }, run.program, context, initialRejections, rejections)
  assert.deepEqual(state, before)
  if (index < 4) {
    assert.deepEqual(applied.accepted, proposal.accepted)
    assert.deepEqual(applied.rejected, proposal.rejected)
    assert.equal(applied.state.revision, proposal.revision)
    prefix.push({ proposal: index + 1, revision: proposal.revision, acceptedUnchanged: true, rejectedUnchanged: true })
  } else {
    assert.equal(envelope.atomic, true)
    assert.equal(before.revision, 13)
    assert.equal(proposal.revision, 13)
    assert.deepEqual(proposal.rejected.map((r: any) => r.targetKey), ["download_version_selection_entry", "download_version_selection_file_response_dependency"])
    assert.deepEqual(applied.accepted.map(a => a.targetKey), ["download_version_selection_entry", "download_version_selection_file_response_dependency"])
    assert.deepEqual(applied.rejected, [])
    assert.equal(applied.state.revision, 15)
    assert.deepEqual(applied.unresolved, proposal.unresolved)
    assert.deepEqual(applied.currentRejections, rejections)
    assert.deepEqual(applied.state.rules.filter(r => r.questionId !== "download-version-selection"), before.rules)
    assert.deepEqual(applied.state.bindings, before.bindings)
    assert.deepEqual(applied.state.policyRules, before.policyRules)
    const output = { schemaVersion: "authorization-ar-atomic-transaction-replay/v1", stage, session, originalRunSha256: createHash("sha256").update(raw).digest("hex"), providerCalls: 0, sourceActions: 0, targetExecutions: 0, unchangedPrefix: prefix, originalAtomicProposal: 5, originalRevision: proposal.revision, repairedRevision: applied.state.revision, newlyAcceptedTargets: applied.accepted.map(a => ({ group: a.group, questionId: a.questionId, targetKey: a.targetKey })), retainedUnresolved: applied.unresolved, retainedRejectionsUnchanged: true, otherQuestionRulesUnchanged: true, originalValidation: run.validation.valid, promoted: false, repairedStateDigest: createHash("sha256").update(canonicalControl(applied.state)).digest("hex"), scope: "Four recorded prefix proposals reproduced with saved host expansions and original local diagnostics, then only proposal5atomic transaction recomputed. No source read action, worklist/candidate/routing/dependency execution, new prompt/answer, later trajectory, semantic quality or previous-eligibility replay. Reads the retained run and writes this derived replay artifact; original run and raw failure remain unchanged." }
    await writeFile(path.join(root, "atomic-transaction-replay.json"), JSON.stringify(output, null, 2) + "\n")
    console.log(JSON.stringify({ unchangedPrefix: prefix.length, originalRevision: output.originalRevision, repairedRevision: output.repairedRevision, newlyAcceptedTargets: output.newlyAcceptedTargets.length, retainedUnresolved: output.retainedUnresolved.length, providerCalls: 0, promoted: false }))
  }
  state = applied.state; rejections = applied.currentRejections.filter(r => !r.localEnvelope)
}
