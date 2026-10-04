import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { LocalControlEnvelopeSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-control-updates.ts"
import { canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"

const root = import.meta.dir, report = JSON.parse(await readFile(path.join(root, "runs/quality-owui-ingestion-D1/attempt-1/report.json"), "utf8"))
const raw = await readFile(path.join(report.report.sessionPath, "run.json")), run = JSON.parse(raw.toString())
const tools: any = { evidence: run.evidence, history: [], files: run.sourceFiles, toolCalls: 0, maxToolCalls: 0, maxDisplayBytes: 262144,
  locateSymbols: () => [], symbolHints: () => [], execute: async () => { throw new Error("Replay cannot read source") } }
const runtime = createInquiryDomainRuntime({ program: run.program, tools, strategy: "guided-evidence-v2", ablation: "scheduler-off" })
const groups = ["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"] as const
let recordPosition = 0
const rows = []
for (const [proposalIndex, proposal] of run.domain.proposals.entries()) {
  const envelope = LocalControlEnvelopeSchema.parse(proposal.delta)
  const records = run.domain.localExtractions.slice(recordPosition, recordPosition + envelope.localExtractions.length)
  recordPosition += records.length
  assert.deepEqual(records.map((r: any) => r.raw), envelope.localExtractions)
  const submitted = Object.fromEntries(groups.map(group => [group, [...envelope[group]]])) as Record<typeof groups[number], any[]>
  for (const record of records) if (record.questionId) for (const group of groups) for (const [index, candidate] of (record.raw[group] ?? []).entries()) {
    const expanded = (record.expanded[group] ?? []).find((v: any) => v.targetKey === (candidate?.targetKey ?? `invalid-${index}`))
    submitted[group].push(expanded ?? { ...candidate, questionId: record.questionId, ...(["rules", "sourceBindings", "dependencies"].includes(group) ? { evidenceIds: record.evidenceIds } : {}) })
  }
  const updated: any = await runtime.propose({ ...envelope, ...submitted, localExtractions: [] })
  assert.deepEqual(updated.accepted, proposal.accepted)
  assert.equal(runtime.report().slice.revision, proposal.revision)
  const before = runtime.report(), feedback = runtime.modelFeedback()
  assert.deepEqual(runtime.report(), before)
  const conflictMessages = feedback.diagnostics.filter(d => d.code === "control-conflict").map(d => d.message)
  for (const message of conflictMessages) assert.ok(message.includes('"op":"replace"') && !message.includes("Explicit revisionOf digest and revisionReason are required"))
  rows.push({ proposal: proposalIndex + 1, revision: proposal.revision, acceptedUnchanged: true, currentConflictCount: before.currentRejections.filter(r => r.diagnostics.some(d => d.code === "control-conflict")).length, modelConflictMessages: conflictMessages })
}
assert.equal(recordPosition, run.domain.localExtractions.length)
assert.equal(canonicalControl(runtime.report().slice), canonicalControl(run.domain.slice))
assert.deepEqual(runtime.report().currentRejections, run.domain.currentRejections)
assert.equal(tools.toolCalls, 0)
const result = { schemaVersion: "authorization-ar-local-conflict-feedback-replay/v1", originalRunSha256: createHash("sha256").update(raw).digest("hex"), providerCalls: 0, sourceActions: 0, targetExecutions: 0, acceptedStateUnchanged: true, currentRejectionsUnchanged: true, promoted: false, rows,
  scope: "Replays saved host expansions and schema-invalid fragments with retained scope through ordinary local update groups. Verifies canonical acceptance, raw final rejections and projected conflict messages only. Does not replay local offers, source reads, scheduler/dependency states, full prompts or new semantic answers; original false validation is not promoted." }
await writeFile(path.join(root, "local-conflict-feedback-replay.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ proposals: rows.length, acceptedStateUnchanged: true, currentRejectionsUnchanged: true, conflicts: rows.at(-1)!.currentConflictCount, providerCalls: 0 }))
