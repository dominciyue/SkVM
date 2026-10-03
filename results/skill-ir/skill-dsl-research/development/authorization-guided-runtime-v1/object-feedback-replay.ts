import assert from "node:assert/strict"
import path from "node:path"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createControlSlice, canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"
import { controlObjectDiagnostics } from "../../../../../src/task-dsl/authorization/control-conclusion.ts"
import { applyControlUpdates, LocalControlEnvelopeSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-control-updates.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-compact-guided-context-host-config-v1"
const sessions = path.join(root, "ordinary", stage, "run-archive", "sessions"), names = await readdir(sessions)
assert.equal(names.length, 1)
const runBytes = await readFile(path.join(sessions, names[0]!, "run.json")), run = JSON.parse(runBytes.toString())
let slice = createControlSlice(), position = 0
const rows: any[] = [], groups = ["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"] as const
for (const [index, proposal] of run.domain.proposals.entries()) {
  const envelope = LocalControlEnvelopeSchema.parse(proposal.delta)
  const records = run.domain.localExtractions.slice(position, position + envelope.localExtractions.length)
  position += records.length
  assert.deepEqual(records.map((r: any) => r.raw), envelope.localExtractions)
  assert.ok(records.every((r: any) => !r.diagnostics.length))
  const normalized = { ...envelope, ...Object.fromEntries(groups.map(group => [group, [...envelope[group], ...records.flatMap((r: any) => r.expanded[group] ?? [])]])), localExtractions: [] }
  // Recorded host expansions and actual shown IDs reproduce merge state; no source read or new interpretation.
  const merged = applyControlUpdates(slice, normalized, run.program, { questionIds: run.program.questions.map((q: any) => q.id), shownEvidenceIds: run.evidence.map((e: any) => e.id) })
  assert.deepEqual(merged.accepted, proposal.accepted)
  assert.deepEqual(merged.rejected, proposal.rejected)
  assert.equal(merged.state.revision, proposal.revision)
  slice = merged.state
  rows.push({ proposal: index + 1, revision: slice.revision, objectDiagnostics: controlObjectDiagnostics(slice) })
}
assert.equal(position, run.domain.localExtractions.length)
assert.equal(canonicalControl(slice), canonicalControl(run.domain.slice))
const firstFlag = rows.find(r => r.objectDiagnostics.some((d: any) => d.code === "object-binding-missing" && d.message.includes("authenticated_request_user")))
assert.ok(firstFlag)
assert.ok(firstFlag.revision < run.domain.checkHistory[0].revision)
assert.deepEqual(rows.at(-1)!.objectDiagnostics.map((d: any) => [d.code, d.path, d.questionId]), run.domain.check.diagnostics.filter((d: any) => d.code.startsWith("object-") || d.code.startsWith("control-object") || d.code.startsWith("authorization-edge") || d.code.startsWith("control-order")).map((d: any) => [d.code, d.path, d.questionId]))
const result = { schemaVersion: "authorization-ar-object-feedback-replay/v1", stage, session: names[0], originalRunSha256: createHash("sha256").update(runBytes).digest("hex"), providerCalls: 0, targetExecutions: 0, comparison: "Replays retained host expansions through the current shared merger and pure object checker, with all recorded actual IDs available; no new response, complete prompt simulation or semantic interpretation", acceptedStateUnchanged: true, firstIdentityDiagnosticProposal: firstFlag.proposal, firstIdentityDiagnosticRevision: firstFlag.revision, originalFirstFinalCheckRevision: run.domain.checkHistory[0].revision, originalFinalValidation: run.validation.valid, checkedDeliveryPromoted: false, finalObjectDiagnosticCount: rows.at(-1)!.objectDiagnostics.length, rows }
await writeFile(path.join(root, "object-feedback-replay.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ proposals: rows.length, firstIdentityDiagnosticProposal: firstFlag.proposal, originalFirstFinalCheckRevision: result.originalFirstFinalCheckRevision, acceptedStateUnchanged: true, checkedDeliveryPromoted: false }))
