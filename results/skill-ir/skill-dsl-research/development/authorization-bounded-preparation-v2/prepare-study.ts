import { readFile } from "node:fs/promises"
import path from "node:path"
import { root, repo, json, save, verify, absolute, exists, cli, journal, aggregateUsage, updateState } from "./common.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
const mode = process.argv[2]
if (!["run", "replay"].includes(mode ?? "")) throw new Error("Usage: bun prepare-study.ts run|replay")
const plan = await json(path.join(root, "study-plan.json"))
await verify([...plan.implementation, ...plan.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles])])
process.env.SKVM_AUTO_PROBE = "0"; process.env.SKVM_CACHE = path.join(repo, ".skvm")
const rows = []
let consecutiveInfrastructureFailures = 0, dispatchAllowed = true
for (const item of plan.cases) {
  const dir = path.join(root, "inputs", item.id), record = path.join(dir, "preparation-job.json"), claim = path.join(dir, "preparation-claim.json")
  if (mode === "run" && dispatchAllowed && !await exists(claim)) {
    await save(claim, { id: item.id, model: plan.model, seed: item.seedRequest, createdAt: new Date().toISOString(), noAutomaticResend: true }, true)
    process.stdout.write(`${JSON.stringify({ id: item.id, action: "prepare-start" })}\n`)
    const result = await cli(["prepare", `--input=${absolute(item.input)}`, `--request=${absolute(item.seedRequest)}`, `--out=${path.join(dir, "automatic-v2")}`, "--discover=true", `--proposal-model=${plan.model}`, "--proposal-timeout-ms=300000"], true)
    await save(record, { id: item.id, status: result.code === 0 ? "published" : "failed", ...result }, true)
    await journal("AK9", { id: item.id, code: result.code, status: result.report?.status, attemptPath: result.report?.attemptPath })
    process.stdout.write(`${JSON.stringify({ id: item.id, action: "prepare-finished", code: result.code, status: result.report?.status, attempts: result.report?.proposal?.account?.telemetry?.providerCalls ?? result.report?.telemetry?.providerCalls ?? null })}\n`)
  }
  if (!await exists(record)) { rows.push({ id: item.id, status: await exists(claim) ? "completion-unknown" : "not-dispatched", providerCalls: 0, unknownJobCalls: await exists(claim) ? true : false }); continue }
  const job = await json(record), accountPath = job.report?.attemptPath ? path.join(job.report.attemptPath, "account.json") : null
  const account = accountPath && await exists(accountPath) ? await json(accountPath) : null
  if (account && job.report.attemptPath) {
    const eventsFile = path.join(job.report.attemptPath, "events.jsonl")
    if (await exists(eventsFile)) account.telemetry = summarizeAuthorizationAttempts(reconcileAuthorizationAttemptsFromEvents(account.attempts, (await readFile(eventsFile, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))))
  }
  consecutiveInfrastructureFailures = ["provider-error", "timeout-unknown"].includes(account?.status) ? consecutiveInfrastructureFailures + 1 : 0
  if (consecutiveInfrastructureFailures >= 2) dispatchAllowed = false
  let checked = null, coverage = null, sourceBytes = null
  if (job.status === "published") {
    const loaded = await loadLocalAuthorizationInput(path.join(dir, "automatic-v2", "assessment.json"))
    if (loaded.status !== "valid") throw new Error(`Published preparation no longer valid: ${item.id}`)
    checked = { entries: loaded.task.entries.length, scenarios: loaded.task.obligations.length, expandedObligations: job.report.scopePreview.expandedObligations }
    sourceBytes = loaded.sourceBundle.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0)
    const reference = await json(path.join(dir, "explicit-request.json")) // evaluator-only reference; never passed back into discovery
    const report = loaded.normalizedInput.evidencePreparation!
    if (report.schemaVersion !== "authorization-evidence-report/v2") throw new Error("Automatic material lost v2 mapping")
    coverage = reference.dependencies.map((d: any) => ({ id: d.id, path: d.path, range: [d.startLine, d.endLine], included: report.included.some(f => f.path === d.path && f.segments.some(s => s.originalStartLine <= d.startLine && s.originalEndLine >= d.endLine)) }))
  }
  rows.push({ id: item.id, status: job.status, reportStatus: job.report?.status, checked, sourceBytes, declaredReferenceCoverage: coverage, gaps: job.report?.gaps ?? [], ...account?.telemetry, rounds: account?.rounds ?? [], attemptPath: job.report?.attemptPath ?? null, diagnostics: account?.diagnostics ?? job.stderr })
}
const summary = { schemaVersion: "authorization-ak-preparation-summary/v1", model: plan.model, planned: 8, published: rows.filter(r => r.status === "published").length, unknown: rows.filter(r => r.status === "completion-unknown").length, usage: aggregateUsage(rows), rows, targetExecutions: 0, referenceRule: "AJ declared dependency ranges are audited only after that job closes; they never feed preparation", unrelatedBytes: "unmeasured" }
const output = path.join(root, "preparation-summary.json")
if (mode === "replay") { if (await readFile(output, "utf8") !== `${JSON.stringify(summary, null, 2)}\n`) throw new Error("Preparation replay differs") }
else await save(output, summary)
if (mode === "run") await updateState("AK10", { undispatched: { preparationJobs: rows.filter(r => r.status === "not-dispatched").length, qualitySessions: 40, authorDeliveries: 8, consumerSessions: 8 }, dispatchedUnknownRequests: rows.filter(r => r.status === "completion-unknown").map(r => r.id), nextCommand: "bun run-panel.ts freeze; bun run-panel.ts check; bun run-panel.ts run --count=4" })
process.stdout.write(`${JSON.stringify({ status: mode === "replay" ? "reproduced" : "prepared", published: summary.published, planned: 8, usage: summary.usage, providerCallsThisCommand: mode === "replay" ? 0 : summary.usage.providerCalls })}\n`)
