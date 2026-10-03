import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { isDeepStrictEqual } from "node:util"
import { inspectLocalInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { inquiryStepSchemas, normalizeGuidedControlEnvelope } from "../../../../../src/benchmarks/authorization-dsl/inquiry-wire.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"

const root = import.meta.dir, original = "runs/probe-memos-remove-Mg/attempt-1"
const report = await inspectLocalInquiry(path.join(root, original)), run = JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8"))
const input = await loadInquiryInput(path.join(path.dirname(root), "authorization-domain-execution-v1/model/inputs/memos-remove.json"))
const tools = await createInquiryTools({ ...input.context, maxToolCalls: 24 })
assert(isDeepStrictEqual(tools.files, report.sourceFiles))
const normalized = run.wireFailures.map((failure: any) => {
  const raw = JSON.parse(failure.rawResponse), parsed = inquiryStepSchemas("guided-evidence-v2").schema.parse(raw)
  assert.equal(parsed.kind, "tool")
  assert.deepEqual((parsed as any).calls, raw.calls)
  return { sequence: failure.sequence, rawResponse: failure.rawResponse, normalization: normalizeGuidedControlEnvelope(raw).normalization, parsesAs: parsed.kind }
})
assert.equal(normalized.length, 2)
const first = inquiryStepSchemas("guided-evidence-v2").schema.parse(JSON.parse(normalized[0].rawResponse))
const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(run.inquiry), tools, strategy: "guided-evidence-v2", suppliedUserText: [input.value.brief!] })
await runtime.sync(); runtime.modelContext(); runtime.beginStep()
assert(first.kind === "tool" && first.controlDelta)
const selection = await runtime.propose(first.controlDelta)
for (const call of first.calls) await tools.execute(call.name, call.arguments)
assert(tools.evidence.some(e => e.path === "server/api/v1/space_service.go" && e.startLine <= 741 && e.endLine >= 764))
assert(tools.evidence.some(e => e.path === "server/api/v1/connect_services.go" && e.startLine <= 650 && e.endLine >= 656))
runtime.close()
const result = { schemaVersion: "authorization-ar-memos-wire-replay/v1", originalArtifact: `${original}/report.json`, originalStatus: report.status, rawUnchanged: true, sourceIdentityMatched: true, normalized, selectionDiagnostics: selection.diagnostics, actualReads: tools.history.map(h => ({ name: h.name, arguments: h.arguments, code: h.result.code, evidenceIds: h.result.evidence.map(e => e.id) })), providerCallsDuringReplay: 0, targetExecutions: 0, semanticReview: "unreviewed", limitations: ["Only the first retained request executes reads; second retained request is parsed separately, never treated as a sequential proposed correction", "No new final answer or semantic outcome", "Real same-task repair remains necessary; first failure and costs retained"] }
if (process.argv[2] === "save") await writeFile(path.join(root, "memos-wire-replay.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
else if (process.argv[2] !== "replay") throw new Error("Use save|replay")
console.log(JSON.stringify({ normalized: normalized.length, reads: tools.history.length, providerCalls: 0, originalStatus: report.status }))
