import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"

const root = import.meta.dir, original = "runs/probe-memos-remove-Mg/attempt-2/report.json"
const bytes = await readFile(path.join(root, original)), report = JSON.parse(bytes.toString()).report
const run = JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8"))
const input = await loadInquiryInput(path.join(path.dirname(root), "authorization-domain-execution-v1/model/inputs/memos-remove.json"))
const tools = await createInquiryTools({ ...input.context, maxToolCalls: 24 })
assert.deepEqual(tools.files, report.sourceFiles)
const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(run.inquiry), tools, strategy: "guided-evidence-v2", suppliedUserText: [input.value.brief!] })
await runtime.sync()
const proposals = []
for (const step of run.steps.slice(0, 4)) {
  runtime.modelContext(); runtime.beginStep()
  if (step.kind === "tool") for (const call of step.value) await tools.execute(call.name, call.arguments)
  else if (step.kind === "control") {
    const result = await runtime.propose(step.value.delta)
    proposals.push({ originalAccepted: step.value.accepted.length, originalCodes: step.value.diagnostics.map((d: any) => d.code), accepted: result.accepted.length, codes: result.diagnostics.map(d => d.code) })
  }
}
assert.equal(proposals[1]!.accepted, 10)
assert(proposals[2]!.originalCodes.includes("local-work-not-offered"))
assert(!proposals[2]!.codes.includes("local-work-not-offered"))
assert(proposals[2]!.codes.includes("local-extraction-schema"))
assert(proposals[2]!.accepted > 0)
const result = { schemaVersion: "authorization-ar-local-lifecycle-replay/v1", original, originalSha256: createHash("sha256").update(bytes).digest("hex"), rawUnchanged: true, sourceIdentityMatched: true, proposals, providerCallsDuringReplay: 0, targetExecutions: 0, semanticSupport: "unreviewed", limitations: ["Only the retained first four steps replayed; no final answer constructed", "Newly exposed per-item schema errors remain rejected; good siblings retained", "Retained renamed rules do not withdraw original rules; graph closure and source completeness are not established"] }
runtime.close()
if (process.argv[2] === "save") await writeFile(path.join(root, "memos-lifecycle-replay.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
else if (process.argv[2] !== "replay") throw new Error("Use save|replay")
console.log(JSON.stringify(result))
