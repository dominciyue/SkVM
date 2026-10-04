import assert from "node:assert/strict"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { LocalControlEnvelopeSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-control-updates.ts"
import { canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-explanation-focus-v1"
const sessions = path.join(root, "ordinary", stage, "run-archive/sessions"), names = await readdir(sessions)
assert.equal(names.length, 1)
const raw = await readFile(path.join(sessions, names[0]!, "run.json")), run = JSON.parse(raw.toString())
const result = JSON.parse(await readFile(path.join(root, "ordinary", stage, "process-result.json"), "utf8"))
const groups = ["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"] as const
// Recorded host expansions and their actual question/source bindings are inputs,
// not newly interpreted source. Disable source actions and reuse only actual IDs.
const tools: any = { evidence: run.evidence, history: [], files: run.sourceFiles, toolCalls: 0, maxToolCalls: 24, maxDisplayBytes: 262144,
  locateSymbols: () => [], symbolHints: () => [], execute: async () => { throw new Error("Replay must not read source") } }
const runtime = createInquiryDomainRuntime({ program: run.program, tools, strategy: "domain-evidence-v1", ablation: "scheduler-off" })
let recordPosition = 0
const rows = []
for (const [proposalIndex, proposal] of run.domain.proposals.entries()) {
  const envelope = LocalControlEnvelopeSchema.parse(proposal.delta)
  const records = run.domain.localExtractions.slice(recordPosition, recordPosition + envelope.localExtractions.length)
  recordPosition += records.length
  assert.deepEqual(records.map((r: any) => r.raw), envelope.localExtractions)
  const submitted = Object.fromEntries(groups.map(group => [group, [...envelope[group]]])) as Record<typeof groups[number], any[]>
  for (const record of records) {
    if (!record.questionId) continue // An unoffered envelope has no host-bound scope.
    for (const group of groups) for (const [index, candidate] of (record.raw[group] ?? []).entries()) {
      const targetKey = candidate?.targetKey ?? `invalid-${index}`
      const expanded = (record.expanded[group] ?? []).find((v: any) => v.targetKey === targetKey)
      // Invalid fragment fields remain invalid. Attaching recorded scope routes
      // them through ordinary validation without guessing path/after/conditions.
      submitted[group].push(expanded ?? { ...candidate, questionId: record.questionId,
        ...(["rules", "sourceBindings", "dependencies"].includes(group) ? { evidenceIds: record.evidenceIds } : {}) })
    }
  }
  const updated: any = await runtime.propose({ ...envelope, ...submitted, localExtractions: [] })
  assert.deepEqual(updated.accepted, proposal.accepted)
  assert.equal(runtime.report().slice.revision, proposal.revision)
  const views = [runtime.modelFeedback(), runtime.modelFeedback(), runtime.modelFeedback()]
  for (const view of views) {
    assert.ok(view.rejectedTargets.length <= 4)
    assert.ok(Buffer.byteLength(JSON.stringify(view.rejectedTargets)) <= 16384)
    for (const target of view.rejectedTargets) {
      if (target.submitted) assert.ok(submitted[target.group as typeof groups[number]]?.some(v => v.questionId === target.questionId && v.targetKey === target.targetKey) || runtime.report().proposals.some(p => (p.delta as any)[target.group as string]?.some((v: any) => v.questionId === target.questionId && v.targetKey === target.targetKey)))
    }
  }
  rows.push({ proposal: proposalIndex + 1, revision: proposal.revision, accepted: updated.accepted.length,
    currentRejectedTargetCount: views[0]!.rejectedTargetCount,
    shownRejectedTargets: [...new Set(views.flatMap(v => v.rejectedTargets.map(t => JSON.stringify([t.group, t.questionId, t.targetKey]))))] })
}
assert.equal(recordPosition, run.domain.localExtractions.length)
assert.equal(canonicalControl(runtime.report().slice), canonicalControl(run.domain.slice))
assert.equal(runtime.report().currentRejections.length, run.domain.currentRejections.length)
assert.equal(tools.toolCalls, 0)
const currentSource = await createInquiryTools({ sourceRoot: path.join(result.workDir, "source"), allowedPaths: run.inquiry.allowedPaths ?? ["src/documents", "src/paperless/urls.py"], repository: run.inquiry.repository, sourceRef: run.inquiry.sourceRef })
assert.deepEqual(currentSource.files, run.sourceFiles)
const failedDirectoryQueries = run.toolHistory.filter((h: any) => h.name === "source_search" && h.result.code === "source-out-of-scope" && h.arguments.path === "src/documents")
assert.equal(failedDirectoryQueries.length, 4)
const directoryRows = []
for (const previous of failedDirectoryQueries) {
  const searched = await currentSource.execute("source_search", previous.arguments)
  assert.equal(searched.status, "ok")
  assert.ok(searched.matches.every(m => m.path.startsWith("src/documents/")))
  assert.ok(searched.evidence.every(e => currentSource.files.some(f => f.path === e.path && f.sha256 === e.sha256)))
  directoryRows.push({ arguments: previous.arguments, priorCode: previous.result.code, currentStatus: searched.status,
    matches: searched.matches, evidenceIds: searched.evidence.map(e => e.id) })
}
const outcome = { schemaVersion: "authorization-ar-rejected-target-directory-replay/v1", stage, session: names[0],
  originalRunSha256: createHash("sha256").update(raw).digest("hex"), providerCalls: 0, targetExecutions: 0,
  originalValidation: run.validation.valid, promoted: false, acceptedStateUnchanged: true,
  scope: "Replays recorded valid host expansions plus schema-invalid fragments with recorded host scope through ordinary updates, scheduler off. No local-task routing, dependency read state, complete new prompt, new model answer or source-semantic extraction replay. New directory queries only filter the identical existing source index; empty matches remain empty.",
  rows, directoryRows }
await writeFile(path.join(root, "rejected-target-and-directory-replay.json"), JSON.stringify(outcome, null, 2) + "\n")
console.log(JSON.stringify({ proposals: rows.length, acceptedStateUnchanged: true, currentRejectedTargets: rows.at(-1)!.currentRejectedTargetCount, directoryQueries: directoryRows.length, providerCalls: 0, promoted: false }))
