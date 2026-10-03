import path from "node:path"
import { mkdir, readFile, writeFile, cp } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { adaptTraceFile } from "../../../../../src/jit-optimize/trace-adapters.ts"
import { runOptimizationValidationLifecycle } from "../../../../../src/jit-optimize/validation-lifecycle.ts"
import { mergeRepairSubmission } from "../../../../../src/jit-optimize/loop.ts"
import { createProposal, persistRound, finalizeProposal } from "../../../../../src/proposals/storage.ts"
import { buildOptimizedSkillPackage } from "../../../../../src/jit-optimize/package.ts"
import type { Evidence, HistoryEntry, OptimizeSubmission, RoundResult } from "../../../../../src/jit-optimize/types.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const oldProposal = path.join(repo, ".skvm/proposals/jit-optimize/bare-agent/xty--gpt-5.6-sol/skill/20261003T143856661Z")
const capture = path.join(repo, ".skvm/log/runtime/bare-agent/xty--gpt-5.6-sol/natural-ca095aca27e7/20261003-223255-run-bar-b6db8cd9/optimization-session.json")
const output = path.join(root, "ordinary/author-workflow-program-host-recovery")
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
await mkdir(output, { recursive: true })
const claim = { at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), oldProposal, capture, mode: "unchanged-model-candidate-host-recovery", providerCalls: 0, sourceRerun: false, candidateEdits: false, originalFailurePreserved: true }
await writeFile(path.join(output, "claim.json"), JSON.stringify(claim, null, 2) + "\n", { flag: "wx" })
const original = path.join(oldProposal, "original"), candidate = path.join(oldProposal, "round-1-repair-1-optimizer/candidate")
const first: OptimizeSubmission = await json(path.join(oldProposal, "round-1-optimizer/submission.json"))
const repair: OptimizeSubmission = await json(path.join(oldProposal, "round-1-repair-1-optimizer/submission.json"))
const submission = mergeRepairSubmission(first, repair, repair.actions?.map(a => a.id) ?? [])
const adapted = await adaptTraceFile(capture)
const evidences: Evidence[] = adapted.records.map(record => ({ taskId: record.taskId, taskPrompt: record.taskPrompt ?? "", conversationLog: record.conversationLog, criteria: record.criteria ?? [], workDirSnapshot: record.workDirSnapshot, workDirPath: record.workDirPath, inputResources: record.inputResources, trace: record.source }))
const proposal = await createProposal({ skillName: "github-security-review", skillDir: original, harness: "bare-agent", optimizerModel: "xty/gpt-5.6-sol", targetModel: "xty/gpt-5.6-sol", source: `host-recovery:${oldProposal}` })
await writeFile(path.join(output, "proposal.json"), JSON.stringify({ ...claim, proposalId: proposal.id, proposalDir: proposal.dir }, null, 2) + "\n")
await persistRound(proposal.dir, 0, original)
const retained = await persistRound(proposal.dir, 1, candidate)
await mkdir(path.join(proposal.dir, "round-1-optimizer"), { recursive: true })
await cp(path.join(oldProposal, "round-1-optimizer/submission.json"), path.join(proposal.dir, "round-1-optimizer/submission.json"))
const validation = await runOptimizationValidationLifecycle({ proposalDir: proposal.dir, round: 1, skillDir: retained, sourceSkillDir: original, baselineSkillDir: original, actions: submission.actions ?? [], evidences })
const oldHistory = await json(path.join(oldProposal, "history.json"))
const entry: HistoryEntry = { timestamp: new Date().toISOString(), round: 1, rootCause: submission.rootCause, reasoning: submission.reasoning, changes: submission.changes ?? [], changedFiles: submission.changedFiles, actions: submission.actions, actionDiagnostics: submission.actionDiagnostics, validation: validation.summary, confidence: submission.confidence, trainScore: null, testScore: null, improved: null }
const rounds: RoundResult[] = oldHistory.rounds.map((round: RoundResult) => ({ ...round, optimizer: null, historyEntry: round.round === 1 ? entry : null, ...(round.round === 1 ? { validation: validation.summary } : {}) }))
const bestRound = validation.summary.rejectedActionIds.length ? 0 : 1
await finalizeProposal(proposal.dir, { bestRound, bestRoundReason: "Retained model candidate revalidated after the host input-projection repair; no generation or independent semantic score", history: [entry], rounds })
const exported = await buildOptimizedSkillPackage({ proposalDir: proposal.dir, packageDir: path.join(output, "exported-package") })
const result = { ...claim, validation: validation.summary, exported, actualUSD: 0, note: "Zero provider calls in this host recovery; original generation costs belong to the retained prior proposal. Draft execution is not independent semantic validation." }
await writeFile(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result))
