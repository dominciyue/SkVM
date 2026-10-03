import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { isDeepStrictEqual } from "node:util"
import { loadInquiryInput, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { inquiryStepSchemas, normalizeGuidedControlEnvelope } from "../../../../../src/benchmarks/authorization-dsl/inquiry-wire.ts"

// Re-read original source and replay only retained data. This script has no provider dependency.
const root = import.meta.dir, original = "runs/probe-paperless-notes-Mg/attempt-3"
const report = await inspectLocalInquiry(path.join(root, original))
const run = JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8"))
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
const loaded = await loadInquiryInput(path.resolve(root, manifest.tasks.find((t: any) => t.id === "paperless-notes").inputFile))
const tools = await createInquiryTools({ ...loaded.context, maxToolCalls: 24 })
assert(isDeepStrictEqual(tools.files, report.sourceFiles), "Original source bytes/identity must still match the retained session")
const wire = report.wireFailures.map((failure: any) => {
  const raw = JSON.parse(failure.rawResponse), normalized = normalizeGuidedControlEnvelope(raw)
  const parsed = inquiryStepSchemas("guided-evidence-v2").schema.safeParse(raw)
  assert(parsed.success && parsed.data.kind === "control" && normalized.normalization)
  assert.equal(inquiryStepSchemas("guided-evidence-v2", true).schema.safeParse(raw).success, false)
  return { sequence: failure.sequence, originalDiagnostics: failure.diagnostics, normalization: normalized.normalization, parsesAs: parsed.data.kind, finalOnlyAccepted: false }
})
assert.equal(wire.length, 4)
const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(run.inquiry), tools, strategy: "guided-evidence-v2", suppliedUserText: loaded.value.brief ? [loaded.value.brief] : undefined })
await runtime.sync(); runtime.modelContext(); runtime.beginStep()
const proposed = await runtime.propose(run.domain.proposals[0].delta)
assert("accepted" in proposed && "rejected" in proposed)
assert.equal(proposed.rejected.length, 0)
assert.equal(proposed.accepted.length, run.domain.proposals[0].accepted.length)
const actualReads = tools.history.map(h => ({ name: h.name, arguments: h.arguments }))
assert.equal(actualReads.length, 2)
assert.deepEqual(actualReads.map(h => (h.arguments as any).path), ["src/documents/views.py", "src/documents/permissions.py"])
const snapshot = runtime.report()
assert(snapshot.worklist!.items.some(w => w.code === "reference-relevance-unconfirmed"))
runtime.close()
const result = {
  schemaVersion: "authorization-ar-shared-repair-replay/v1", originalArtifact: `${original}/report.json`, originalStatus: report.status,
  rawUnchanged: true, originalSourceIdentityMatched: true, wire,
  retainedFirstProposal: { accepted: proposed.accepted.length, rejected: proposed.rejected.length },
  actualReads, unconfirmedReferences: snapshot.worklist!.items.filter(w => w.code === "reference-relevance-unconfirmed").map(w => ({ id: w.id, symbol: w.symbol, state: w.state })),
  providerCallsDuringReplay: 0, targetExecutions: 0, semanticReview: "unreviewed",
  limitations: ["First retained proposal only; no new model continuation or final answer", "Original completion-unknown remains unresolved and is never redispatched", "No real-use cost saving or semantic benefit inferred from this deterministic replay"],
}
if (process.argv[2] === "save") await writeFile(path.join(root, "paperless-probe-3-shared-repair-replay.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
else if (process.argv[2] !== "replay") throw new Error("Use save|replay")
console.log(JSON.stringify({ wire: wire.length, accepted: proposed.accepted.length, actualReads: actualReads.length, providerCalls: 0, originalStatus: report.status }))
