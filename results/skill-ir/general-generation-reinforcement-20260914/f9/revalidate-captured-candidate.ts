import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { adaptTraceFile } from "../../../../src/jit-optimize/trace-adapters.ts"
import { runOptimizationValidationLifecycle } from "../../../../src/jit-optimize/validation-lifecycle.ts"
import type { Evidence } from "../../../../src/jit-optimize/types.ts"

const [proposalArg, outputArg, recordArg] = process.argv.slice(2)
if (!proposalArg || !outputArg || !recordArg) throw new Error("Expected proposal, fresh verification directory and captured run record")
const proposal = path.resolve(proposalArg)
const output = path.resolve(outputArg)
const submission = await Bun.file(path.join(proposal, "round-1-optimizer/submission.json")).json()
const record = await Bun.file(recordArg).json()
const adapted = await adaptTraceFile(record.trace.sourcePath)
const selected = adapted.records.find((item) => item.source.recordLocator === record.trace.recordLocator)
if (!selected) throw new Error("Bound capture record unavailable")
const evidence: Evidence = {
  taskId: selected.taskId, taskPrompt: selected.taskPrompt ?? "",
  conversationLog: selected.conversationLog, criteria: selected.criteria,
  workDirSnapshot: selected.workDirSnapshot, inputResources: selected.inputResources,
  trace: selected.source,
}
await mkdir(output, { recursive: false })
const result = await runOptimizationValidationLifecycle({
  proposalDir: output, round: 1, skillDir: path.join(proposal, "round-1"),
  sourceSkillDir: path.join(proposal, "original"), baselineSkillDir: path.join(proposal, "original"),
  actions: submission.actions, evidences: [evidence],
})
await writeFile(path.join(output, "verification.json"), JSON.stringify({
  checkedAt: new Date().toISOString(), proposal, capture: record.trace.sourcePath,
  sourceReplayed: false, candidateModified: false, paidCalls: 0,
  summary: result.summary, execution: result.report.execution,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary: result.summary, execution: result.report.execution }))
