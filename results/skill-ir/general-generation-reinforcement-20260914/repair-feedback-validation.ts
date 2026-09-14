import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { loadEvidencesFromLogs } from "../../../src/jit-optimize/task-source.ts"
import { runOptimizationValidationLifecycle } from "../../../src/jit-optimize/validation-lifecycle.ts"
import { runOptimizer } from "../../../src/jit-optimize/optimizer.ts"
import { buildRepairFeedback, mergeRepairSubmission } from "../../../src/jit-optimize/loop.ts"

const root = import.meta.dirname
process.env.SKVM_CACHE = path.join(root, "f9/cache-i18n-3")
process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`
const proposal = path.join(root, "f9/cache-i18n-3/proposals/jit-optimize/bare-agent/xty--gpt-5.6-sol/i18n-f9-recovered-package/20260914T174439356Z")
const destination = path.join(root, "f10-validation-repair")
const candidate = path.join(root, "f10-feedback-successor-2/package")
await mkdir(destination, { recursive: false })
const base = await Bun.file(path.join(proposal, "round-1-optimizer/submission.json")).json()
const evidences = await loadEvidencesFromLogs({
  kind: "execution-log",
  logs: ["sol", "gpt55"].map((id) => ({ path: path.join(root, `f9/consumption/${id}-optimized-original/report.json`) })),
})
const initial = await runOptimizationValidationLifecycle({
  proposalDir: path.join(destination, "initial"), round: 1, skillDir: candidate,
  sourceSkillDir: path.join(proposal, "original"), baselineSkillDir: candidate,
  actions: base.actions, evidences,
})
const feedback = buildRepairFeedback(
  initial.report.resolution.feedback, base.actions, [],
  initial.report.repairable?.feedback ?? [],
)
if (feedback.length === 0) throw new Error("Expected source-backed validation mapping feedback")
for (const item of feedback) {
  item.diagnostics.push("This attempt repairs validation metadata only. The same candidate program and skill instructions already passed natural original/changed consumption. Do not edit any skill/package file; resolve inputFiles/expectedFiles and argv in .optimize/submission.json from the actual program and captured files. Whole-trace agent-created files are not all outputs of this finalizer.")
}
const actionIds = feedback.map((item) => item.actionId)
await writeFile(path.join(destination, "commands.json"), JSON.stringify({
  startedAt: new Date().toISOString(), argv: process.argv, sourceProposal: proposal,
  candidate, sourceRunReplayed: false, scope: "One existing runOptimizer repair call; shared feedback builder, merge and lifecycle. No candidate code edits permitted.",
  feedback, actualUsd: null,
}, null, 2) + "\n")
const repair = await runOptimizer({
  skillDir: candidate, evidences,
  repairFeedback: { attempt: 1, actionIds, feedback, rule: "repair-only-listed-files-and-preserve-validation-expectations" },
}, { model: "xty/gpt-5.6-sol", timeoutMs: 900000, recordDir: path.join(destination, "round-1-repair-1-optimizer") })
await writeFile(path.join(destination, "repair-result.json"), JSON.stringify({
  completedAt: new Date().toISOString(), actualChangedFiles: repair.actualChangedFiles,
  tokens: repair.tokens, reportedCostUsd: repair.cost, actualUsd: null,
}, null, 2) + "\n")
if (repair.actualChangedFiles.length > 0) throw new Error("Metadata-only repair changed candidate files; original package remains untouched")
const merged = mergeRepairSubmission(base, repair.submission, actionIds)
await writeFile(path.join(destination, "merged-submission.json"), JSON.stringify(merged, null, 2) + "\n")
const result = await runOptimizationValidationLifecycle({
  proposalDir: path.join(destination, "repaired"), round: 1, skillDir: candidate,
  sourceSkillDir: path.join(proposal, "original"), baselineSkillDir: candidate,
  actions: merged.actions ?? [], evidences, executeActionIds: actionIds,
  priorReport: initial.report, changedPathsSincePrior: [],
})
await writeFile(path.join(destination, "verification.json"), JSON.stringify({
  completedAt: new Date().toISOString(), sourceProposal: proposal, candidate,
  sourceReplayed: false, candidateModified: false, optimizerCalls: 1, metadataOnly: true,
  summary: result.summary, execution: result.report.execution, tokens: repair.tokens, actualUsd: null,
  scope: "Current shared internal validation of the exact naturally consumed successor package; original immutable package manifest is not rewritten.",
}, null, 2) + "\n")
console.log(JSON.stringify({ summary: result.summary, execution: result.report.execution }))
