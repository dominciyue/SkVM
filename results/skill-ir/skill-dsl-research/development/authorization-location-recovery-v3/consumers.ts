import { readFile } from "node:fs/promises"
import path from "node:path"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { root, json, save, bind, verifyStudy, exists, cli, configureProvider, claim, journal, sessionAccount, aggregateUsage } from "./common.ts"
const mode = process.argv[2]
if (!["prepare", "run", "replay", "compare"].includes(mode ?? "")) throw new Error("Usage: consumers.ts prepare|run|replay|compare")
const plan = await verifyStudy(), briefs = await json(path.join(root, "author-briefs.json"))
const location = (u: any) => path.join(root, "author-packages", u.packageId, u.arm)
if (mode === "prepare") {
  let failures = 0
  for (const unit of plan.consumers) {
    const dir = location(unit), job = path.join(dir, unit.variant + "-preparation"), material = path.join(dir, unit.variant + "-material")
    if (await exists(path.join(job, "claim.json"))) continue
    const selected = path.join(dir, unit.variant + ".selected.json")
    if (!await exists(selected)) { await claim(job, unit); await save(path.join(job, "job.json"), { status: "author-blocked", unit }, true); continue }
    const b = briefs.packages.find((p: any) => p.id === unit.packageId)
    const scaffold = await json(path.join(root, "author-scaffolds", unit.packageId, unit.variant + ".json"))
    let inputFile = path.join(dir, unit.variant + ".assessment.json"), requestFile = path.join(dir, unit.variant + ".request.json"), request: any
    if (unit.variant === "original") {
      const provider = configureProvider(plan.model); void provider
      if (!await claim(job, unit)) continue
      let assessment: any
      if (unit.arm === "dsl") { const v = await json(selected); assessment = v.assessment; request = v.evidenceRequest }
      else { assessment = { ...scaffold, sourceRoot: path.relative(dir, path.resolve(root, b.originalSourceRoot)).split(path.sep).join("/") }; request = { schemaVersion: "authorization-evidence-request/v2", sourceRoot: assessment.sourceRoot, allowedFiles: b.allowedFiles, entries: [b.entry], dependencies: [], limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } } }
      await save(inputFile, assessment, true); await save(requestFile, request, true)
      console.log(JSON.stringify({ id: unit.id, action: "consumer-prepare-start" }))
      const result = await cli(["prepare", "--input=" + inputFile, "--request=" + requestFile, "--out=" + material, "--discover=true", "--proposal-model=" + plan.model], true)
      await save(path.join(job, "job.json"), { ...result, unit, status: result.report?.status ?? "failed" }, true)
      failures = result.exitCode && ["provider-error", "timeout-unknown"].includes(result.report?.proposal?.account?.status ?? "") ? failures + 1 : 0
      console.log(JSON.stringify({ id: unit.id, status: result.report?.status, calls: result.report?.proposal?.account?.telemetry?.providerCalls ?? result.report?.telemetry?.providerCalls }))
      if (failures >= 2) break
    } else {
      if (!await claim(job, unit)) continue
      const originalDir = path.join(dir, "original-material")
      if (!await exists(path.join(originalDir, "assessment.json"))) { await save(path.join(job, "job.json"), { status: "original-preparation-blocked", unit }, true); continue }
      if (unit.arm === "dsl") {
        const edited = await cli(["edit", "--input=" + path.join(dir, "original.assessment.json"), "--edit=" + path.join(dir, "changed.edit.json"), "--out=" + path.join(dir, "changed-edited")])
        await save(path.join(job, "edit.json"), edited, true)
        if (edited.exitCode) { await save(path.join(job, "job.json"), { status: "edit-blocked", unit, edited }, true); continue }
        inputFile = edited.report.inputPath
      } else {
        await save(inputFile, { ...scaffold, sourceRoot: path.relative(dir, path.resolve(root, b.originalSourceRoot)).split(path.sep).join("/") }, true)
      }
      const originalDiscovery = await json(path.join(originalDir, "discovery.json")), proposal = await json(path.join(originalDir, "proposal.json")), authored = await json(inputFile)
      request = { ...originalDiscovery.request, sourceRoot: authored.sourceRoot, dependencies: [...originalDiscovery.request.dependencies, ...proposal.dependencies] }
      await save(requestFile, request, true)
      const result = await cli(["prepare", "--input=" + inputFile, "--request=" + requestFile, "--out=" + material])
      await save(path.join(job, "job.json"), { ...result, unit, status: result.report?.status ?? "failed", sourceReuse: { from: "original-material", newProviderCalls: 0, originalGaps: (await json(path.join(originalDir, "report.json"))).gaps, explanation: "Revalidate the same verified source locations against an authored policy/premise change; no new location proposal." } }, true)
      console.log(JSON.stringify({ id: unit.id, status: result.report?.status, calls: 0 }))
    }
  }
} else if (mode === "run") {
  let failures = 0
  for (const unit of plan.consumers) {
    const dir = location(unit), inputFile = path.join(dir, unit.variant + "-material", "assessment.json"), outRoot = path.join(root, "consumer-runs", unit.id)
    if (await exists(path.join(outRoot, "claim.json"))) continue
    const available = await exists(inputFile)
    if (available) configureProvider(plan.model)
    if (!await claim(outRoot, unit)) continue
    let report: any
    if (!available) report = { status: "author-or-preparation-blocked", providerCalls: 0 }
    else {
      const common = { inputFile, model: plan.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const, executionOptions: plan.executionOptions }
      console.log(JSON.stringify({ id: unit.id, action: "consumer-start" }))
      report = unit.arm === "markdown" ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(path.join(dir, unit.variant + ".selected.md"), "utf8"), instructionOrigin: "independent-author", instructionPath: (await bind(path.join(dir, unit.variant + ".selected.md"))).path } }) : await executeLocalAuthorizationRun({ ...common, method: "plain" })
    }
    await save(path.join(outRoot, "unit.json"), { unit, report }, true); await journal("AL11-consumer", { id: unit.id, status: report.status })
    console.log(JSON.stringify({ id: unit.id, status: report.status, calls: report.telemetry?.providerCalls ?? 0 }))
    failures = ["transport-failed", "timeout-unknown", "provider-unavailable"].includes(report.status) ? failures + 1 : 0; if (failures >= 2) break
  }
} else if (mode === "compare") {
  const rows = []
  for (const changed of plan.consumers.filter((u: any) => u.variant === "changed")) {
    const originalId = changed.id.replace(/changed$/, "original"), original = await json(path.join(root, "consumer-runs", originalId, "unit.json"))
    const inputFile = path.join(location(changed), "changed-material", "assessment.json")
    if (!original.report.sessionId || !await exists(inputFile)) { rows.push({ id: changed.id, status: "blocked" }); continue }
    const previous = original.report.sessionPath
    const comparison = await cli(["compare", "--previous=" + previous, "--input=" + inputFile])
    await save(path.join(location(changed), "compare.json"), comparison)
    const before = await json(path.join(previous, "source-bundle.json")), loaded = await loadLocalAuthorizationInput(inputFile)
    if (loaded.status !== "valid") throw new Error("Invalid changed consumer")
    rows.push({ id: changed.id, comparison: comparison.report, sameSourceBytes: JSON.stringify(before) === JSON.stringify(loaded.sourceBundle), sourceRefBefore: before.sourceRef ?? null, sourceRefAfter: loaded.task.sourceRef })
  }
  await save(path.join(root, "compare-summary.json"), { planned: 4, rows, providerCalls: 0 }); console.log(JSON.stringify({ comparisons: rows.length, providerCalls: 0 }))
} else {
  const rows = [], preparationAccounts = []
  for (const unit of plan.consumers) {
    const dir = path.join(root, "consumer-runs", unit.id), record = path.join(dir, "unit.json")
    if (!await exists(record)) { rows.push({ ...unit, status: await exists(path.join(dir, "claim.json")) ? "completion-unknown" : "not-dispatched" }); continue }
    const stored = await json(record)
    if (stored.report.sessionId) { const inspected = await inspectLocalAuthorizationOutput(dir); if (inspected.status !== stored.report.status) throw new Error("Inspect differs") }
    rows.push({ ...unit, status: stored.report.status, sessionId: stored.report.sessionId ?? null, account: await sessionAccount(dir, stored.report), requirementCount: stored.report.canonicalResult?.results?.length ?? null })
    const jobFile = path.join(location(unit), unit.variant + "-preparation", "job.json")
    if (await exists(jobFile)) {
      const job = await json(jobFile), r = job.report
      const account = r?.proposal?.account ?? (r?.attemptPath && await exists(path.join(r.attemptPath, "account.json")) ? await json(path.join(r.attemptPath, "account.json")) : null)
      if (account) preparationAccounts.push({ id: unit.id, ...account.telemetry, knownDurationMs: account.attempts.reduce((n: number, a: any) => n + (a.response?.durationMs ?? 0), 0) })
    }
  }
  const summary = { schemaVersion: "authorization-al-consumer-replay/v1", planned: 8, declaredObligations: 16, closed: rows.filter(r => !["not-dispatched", "completion-unknown"].includes(r.status)).length, rows,
    usage: aggregateUsage(rows.flatMap(r => r.account ? [r.account] : [])), preparationUsage: aggregateUsage(preparationAccounts), preparationAccounts, providerCallsThisCommand: 0 }
  await save(path.join(root, "consumer-replay.json"), summary); console.log(JSON.stringify(summary))
}

