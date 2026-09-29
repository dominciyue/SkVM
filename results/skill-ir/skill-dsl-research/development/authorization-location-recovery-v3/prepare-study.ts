import { readFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { root, json, save, verify, verifyStudy, absolute, exists, cli, configureProvider, claim, journal, aggregateUsage } from "./common.ts"
const mode = process.argv[2]
if (!["check", "run", "status", "replay"].includes(mode ?? "")) throw new Error("Usage: prepare-study.ts check|run|status|replay [--count=1..8]")
const plan = mode === "check" && !await exists(path.join(root, "implementation-freeze.json")) ? await json(path.join(root, "study-plan.json")) : await verifyStudy()
if (mode === "check") {
  await verify(plan.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles]))
  const rows = []
  for (const c of plan.cases) {
    const result = await cli(["prepare", "--input=" + absolute(c.input), "--request=" + absolute(c.seedRequest), "--out=" + path.join(root, "inputs", c.id, "automatic-v3"), "--discover=true", "--check-only=true"])
    if (result.exitCode || !["ready", "partial"].includes(result.report?.status)) throw new Error("Offline seed failed: " + c.id + " " + JSON.stringify(result))
    rows.push({ id: c.id, status: result.report.status, scope: result.report.scopePreview, indexReadBytes: result.report.discovery.readBytes, displayBytes: result.report.discovery.displayBytes })
  }
  await save(path.join(root, "pre-run-check.json"), { rows, realProviderCalls: 0, targetExecutions: 0 })
  console.log(JSON.stringify({ status: "valid", cases: rows.length, realProviderCalls: 0 }))
} else if (mode === "run") {
  const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? 8)
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error("Invalid count")
  let done = 0, failures = 0
  for (const c of plan.cases) {
    const dir = path.join(root, "preparation-jobs", c.id)
    if (await exists(path.join(dir, "claim.json"))) continue
    configureProvider(plan.model)
    if (!await claim(dir, { caseId: c.id, model: plan.model })) continue
    console.log(JSON.stringify({ caseId: c.id, action: "prepare-start" }))
    const result = await cli(["prepare", "--input=" + absolute(c.input), "--request=" + absolute(c.seedRequest), "--out=" + path.join(root, "inputs", c.id, "automatic-v3"), "--discover=true", "--proposal-model=" + plan.model, "--proposal-timeout-ms=300000"], true)
    await save(path.join(dir, "job.json"), { caseId: c.id, ...result }, true)
    const status = result.report?.status ?? "failed"
    await journal("AL9", { caseId: c.id, status, exitCode: result.exitCode })
    console.log(JSON.stringify({ caseId: c.id, status, exitCode: result.exitCode, calls: result.report?.proposal?.account?.telemetry?.providerCalls ?? result.report?.telemetry?.providerCalls, errors: result.errors }))
    const account = result.report?.proposal?.account ?? (result.report?.attemptPath && await exists(path.join(result.report.attemptPath, "account.json")) ? await json(path.join(result.report.attemptPath, "account.json")) : null)
    failures = account && ["provider-error", "timeout-unknown"].includes(account.status) ? failures + 1 : 0
    if (++done >= count || failures >= 2) break
  }
} else {
  const rows = []
  for (const c of plan.cases) {
    const dir = path.join(root, "preparation-jobs", c.id), file = path.join(dir, "job.json")
    if (!await exists(file)) { rows.push({ id: c.id, status: await exists(path.join(dir, "claim.json")) ? "completion-unknown" : "not-dispatched" }); continue }
    const job = await json(file), r = job.report, out = path.join(root, "inputs", c.id, "automatic-v3")
    const account = r?.proposal?.account ?? (r?.attemptPath && await exists(path.join(r.attemptPath, "account.json")) ? await json(path.join(r.attemptPath, "account.json")) : null)
    let valid = false
    if (await exists(path.join(out, "assessment.json"))) {
      const loaded = await loadLocalAuthorizationInput(path.join(out, "assessment.json")); valid = loaded.status === "valid"
      if (!valid) throw new Error("Published invalid material " + c.id)
    }
    rows.push({ id: c.id, status: valid ? r.status : r?.status ?? "failed", published: valid,
      files: r?.included?.length ?? 0, bytes: r?.totalBytes ?? null, gaps: r?.gaps ?? [], sourceDisplay: account?.sourceDisplay ?? null,
      indexReadBytes: await exists(path.join(out, "discovery.json")) ? (await json(path.join(out, "discovery.json"))).readBytes : null,
      account: account ? { ...account.telemetry, knownDurationMs: account.attempts.reduce((n: number, a: any) => n + (a.response?.durationMs ?? 0), 0) } : null,
      attemptPath: r?.attemptPath ?? null, locatorResolved: account?.selectionOutcomes?.filter((s: any) => s.status === "resolved").length ?? 0,
      locatorUnresolved: account?.selectionOutcomes?.filter((s: any) => s.status === "unresolved").length ?? 0 })
  }
  const summary = { schemaVersion: "authorization-al-preparation/v1", planned: 8, closed: rows.filter(r => !["not-dispatched", "completion-unknown"].includes(r.status)).length, published: rows.filter(r => r.published).length,
    ready: rows.filter(r => r.status === "ready").length, partial: rows.filter(r => r.status === "partial").length, usage: aggregateUsage(rows.flatMap(r => r.account ? [r.account] : [])), rows, commandProviderCalls: 0 }
  if (mode === "replay") await save(path.join(root, "preparation-summary.json"), summary)
  console.log(JSON.stringify(summary))
}
