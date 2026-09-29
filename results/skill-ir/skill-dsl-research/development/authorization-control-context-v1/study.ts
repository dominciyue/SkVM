import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { prepareAuthorizationEvidence } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/prepare.ts"
import { authorizationScopePreview } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/scope.ts"
import { executeLocalAuthorizationRun } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { qualityUnits, authorUnits, ratingRules } from "./protocol.ts"
import { markdownInput } from "./generation-options.ts"
import { root, repo, al, absolute, bind, cli, claim, configureProvider, exists, hash, json, journal, save, sessionAccount, aggregateUsage, verifyStudy, updateStatus, proposalAccount, retainPaid, paidPaused } from "./common.ts"

const mode = process.argv[2]
if (!['register', 'freeze', 'check', 'pack', 'prepare', 'freeze-panel', 'panel', 'recover-panel', 'replay', 'close'].includes(mode ?? '')) throw new Error('Usage: study.ts register|freeze|check|pack|prepare|freeze-panel|panel|recover-panel|replay|close')
const primaryIds = ["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"]
if (mode === "register") {
  const manifest = await json(path.join(root, "input-manifest.json")), briefs = await json(absolute(manifest.authorBriefs))
  const authorSourceFiles = []
  for (const b of briefs.packages) for (const file of b.allowedFiles) authorSourceFiles.push(await bind(path.resolve(al, b.originalSourceRoot, file)))
  const cases = []
  for (const c of manifest.cases) cases.push({ ...c, archivedDiscovery: await bind(path.join(path.dirname(absolute(c.baseline.proposal)), "discovery.json")) })
  const plan = { schemaVersion: "authorization-am-study/v1", registeredAt: new Date().toISOString(), registeredBeforePaid: true,
    model: "xty/gpt-5.6-sol", startCommit: manifest.startCommit, productionBaseline: manifest.productionBaseline,
    cases, primaryIds, authorBriefs: manifest.authorBriefs, authorSourceFiles,
    units: qualityUnits(primaryIds), authors: authorUnits(briefs.packages.map((p: any) => p.id)),
    consumers: authorUnits(briefs.packages.map((p: any) => p.id)).map(u => ({ ...u, plannedObligations: 2 })),
    analysis: { method: "plain", wireVersion: "v6", assessmentMode: "explicit-v1", reasoningStrategy: "standard" },
    executionOptions: { timeoutMs: 300000, unitTimeoutMs: 900000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 },
    budgets: { maxFiles: 12, maxIndexReadBytes: 1048576, maxDisplayBytes: 65536, maxFinalBytes: 65536, maxDepth: 3, positionRounds: 2, formatRepairs: 1 },
    authorMaxRepairs: 1, authorSourcePreparations: 2, sharedBugRevision: { maxBlocks: 1, maxPrepare: 2, maxAnalysisOrConsumer: 8, requiresNamedReproducibleBug: true },
    infrastructure: { pauseAfterConsecutiveFailures: 2, maxPurposefulRecoveryChecks: 2, completionUnknownResend: false },
    evaluation: { ratingRules, oracleBinding: await bind(path.join(al, "evaluator", "oracle.json")), openOnlyAfterGenerationClosed: true, qualityDenominator: 16, authorDenominator: 8, consumerDenominator: 8, obligationDenominator: 16 },
    gapReuse: "Same public source bytes, selected ranges, success dependencies and pending gaps across both representations and original/changed; no gap relevance intervention in pure-premise main rows.",
    generationIsolation: manifest.isolation, targetExecutions: 0, humanMinutes: null, noLowScoreResampling: true }
  await save(path.join(root, "study-plan.json"), plan, true)
  await journal("AM8-registration", { units: 16, authors: 8, consumers: 8, obligations: 16, model: plan.model, providerCalls: 0 })
  console.log(JSON.stringify({ status: "registered", quality: 16, authors: 8, consumers: 8, providerCalls: 0 }))
} else if (mode === "freeze") {
  await verifyStudy(false)
  const files: string[] = []
  for (const directory of ["src/task-dsl/authorization", "src/benchmarks/authorization-dsl"]) for await (const f of new Bun.Glob("**/*.ts").scan({ cwd: path.join(repo, directory) })) if (!f.endsWith(".test.ts")) files.push(path.join(repo, directory, f))
  for await (const f of new Bun.Glob("authorization*.ts").scan({ cwd: path.join(repo, "src/cli") })) if (!f.endsWith(".test.ts")) files.push(path.join(repo, "src/cli", f))
  for (const f of ["common.ts", "protocol.ts", "study.ts", "authors.ts", "evaluate.ts"]) files.push(path.join(root, f))
  const commit = (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim()
  await save(path.join(root, "implementation-freeze.json"), { schemaVersion: "authorization-am-implementation/v1", commit, planSha256: hash(await readFile(path.join(root, "study-plan.json"))), files: await Promise.all(files.sort().map(bind)), frozenBeforePaid: true }, true)
  console.log(JSON.stringify({ status: "frozen", commit, files: files.length }))
} else {
  const plan = await verifyStudy(!["check", "pack"].includes(mode!))
  if (mode === "check") {
    const rows = []
    for (const id of primaryIds) {
      const c = plan.cases.find((c: any) => c.id === id)
      const out = path.join(root, "inputs", id, "callable-v1"); await mkdir(path.dirname(out), { recursive: true })
      const result = await cli(["prepare", "--input=" + absolute(c.input), "--request=" + absolute(c.seedRequest), "--out=" + out, "--context=callable-v1", "--discover=true", "--check-only=true"])
      if (result.exitCode || !["ready", "partial"].includes(result.report?.status)) throw new Error("Seed preflight failed: " + id + " " + JSON.stringify(result))
      rows.push({ id, status: result.report.status, scope: result.report.scopePreview, controlContext: result.report.controlContext, indexReadBytes: result.report.discovery.readBytes, displayBytes: result.report.discovery.displayBytes })
    }
    await save(path.join(root, "pre-run-check.json"), { rows, providerCalls: 0, targetExecutions: 0 })
    console.log(JSON.stringify({ status: "valid", rows: rows.length, providerCalls: 0 }))
  } else if (mode === "pack") {
    const rows = []
    for (const c of plan.cases) {
      const proposal = await json(absolute(c.baseline.proposal)), discovery = await json(absolute(c.archivedDiscovery))
      const request = { ...discovery.request, dependencies: [...discovery.request.dependencies, ...proposal.dependencies] }
      const variants = []
      for (const contextStrategy of [undefined, "callable-v1"] as const) {
        const prepared = await prepareAuthorizationEvidence({ inputFile: absolute(c.input), outDir: path.join(root, "packing", c.id, contextStrategy ?? "legacy"), request, contextStrategy })
        prepared.report.gaps.push(...proposal.gaps); if (prepared.report.gaps.length && prepared.report.status !== "invalid") prepared.report.status = "partial"
        variants.push({ strategy: contextStrategy ?? "legacy", report: prepared.report, scope: prepared.preparedInput ? authorizationScopePreview(prepared.preparedInput.task, request) : null,
          sources: prepared.snapshots.map(s => ({ path: s.path, bytes: Buffer.byteLength(s.content), sha256: hash(s.content) })) })
      }
      if (JSON.stringify(variants[0]!.scope) !== JSON.stringify(variants[1]!.scope)) throw new Error("Packing changed declared scope " + c.id)
      rows.push({ id: c.id, proposal: c.baseline.proposal, discovery: c.archivedDiscovery, variants })
    }
    await save(path.join(root, "packing-replay.json"), { schemaVersion: "authorization-am-packing/v1", rows, providerCalls: 0, newModelProposals: 0, targetExecutions: 0 })
    console.log(JSON.stringify({ rows: rows.length, providerCalls: 0, bytes: rows.map(r => ({ id: r.id, legacy: r.variants[0]!.sources.reduce((n, s) => n + s.bytes, 0), callable: r.variants[1]!.sources.reduce((n, s) => n + s.bytes, 0), status: r.variants[1]!.report.status })) }))
  } else if (mode === "prepare") {
    for (const id of primaryIds) {
      const dir = path.join(root, "preparation-jobs", id), out = path.join(root, "inputs", id, "callable-v1")
      if (await exists(path.join(dir, "claim.json"))) continue
      if (await paidPaused()) break
      const c = plan.cases.find((c: any) => c.id === id); configureProvider()
      await mkdir(path.dirname(out), { recursive: true }); await claim(dir, { id, model: plan.model })
      console.log(JSON.stringify({ id, action: "prepare-start" }))
      const result = await cli(["prepare", "--input=" + absolute(c.input), "--request=" + absolute(c.seedRequest), "--out=" + out, "--context=callable-v1", "--discover=true", "--proposal-model=" + plan.model, "--proposal-timeout-ms=300000"], true)
      await save(path.join(dir, "job.json"), { id, ...result }, true)
      const account = await proposalAccount(result.report), status = result.report?.status ?? "failed"
      await retainPaid("prepare:" + id, status, account, ["provider-error", "timeout-unknown"].includes(account.status))
      await journal("AM9-prepare", { id, status, calls: account.providerCalls })
      console.log(JSON.stringify({ id, status, calls: account.providerCalls, bytes: result.report?.totalBytes, gaps: result.report?.gaps?.length, errors: result.errors }))
    }
  } else if (mode === "freeze-panel") {
    const units = []
    for (const u of plan.units) {
      const c = plan.cases.find((c: any) => c.id === u.caseId), input = u.material === "al" ? absolute(c.baseline.assessment) : path.join(root, "inputs", u.caseId, "callable-v1", "assessment.json")
      units.push({ ...u, ...(await exists(input) ? { input: await bind(input), report: await bind(path.join(path.dirname(input), "report.json")) } : { blocked: true, reason: "preparation-not-published" }), markdown: c.markdown })
    }
    await save(path.join(root, "panel-freeze.json"), { planSha256: hash(await readFile(path.join(root, "study-plan.json"))), implementationSha256: hash(await readFile(path.join(root, "implementation-freeze.json"))), units }, true)
    console.log(JSON.stringify({ planned: units.length, blocked: units.filter(u => u.blocked).length }))
  } else if (mode === "panel" || mode === "recover-panel") {
    const frozen = await json(path.join(root, "panel-freeze.json"))
    if (frozen.implementationSha256 !== hash(await readFile(path.join(root, "implementation-freeze.json")))) throw new Error("Panel implementation changed")
    const registration = mode === "recover-panel" ? await json(path.join(root, "shared-revision", "registration.json")) : null
    const units = registration ? frozen.units.filter((u: any) => registration.analysisRows.includes(u.id)) : frozen.units
    for (const unit of units) {
      const dir = mode === "recover-panel" ? path.join(root, "shared-revision", "quality", unit.id) : path.join(root, "quality", unit.id)
      if (await exists(path.join(dir, "claim.json"))) continue
      if (await paidPaused()) break
      await claim(dir, unit)
      if (unit.blocked) { await save(path.join(dir, "report.json"), { status: "preparation-blocked", unit }, true); await save(path.join(dir, "account.json"), { providerCalls: 0 }, true); continue }
      configureProvider(); const shared = { inputFile: absolute(unit.input), model: plan.model, outRoot: dir, executionOptions: plan.executionOptions, ...plan.analysis }
      console.log(JSON.stringify({ id: unit.id, caseId: unit.caseId, material: unit.material, arm: unit.arm, action: "analysis-start" }))
      const report = unit.arm === "markdown" ? await executeMarkdownStudyRun({ ...shared, markdown: markdownInput(await readFile(absolute(unit.markdown), "utf8"), unit.markdown.path) }) : await executeLocalAuthorizationRun(shared)
      const account = await sessionAccount(dir, report)
      await save(path.join(dir, "report.json"), { unit, ...report }, true); await save(path.join(dir, "account.json"), account, true)
      await retainPaid((mode === "recover-panel" ? "quality-revision:" : "quality:") + unit.id, report.status, account, ["provider-error", "transport-failed", "timeout-unknown"].includes(report.status))
      await journal("AM10", { id: unit.id, status: report.status, calls: account.providerCalls })
      console.log(JSON.stringify({ id: unit.id, status: report.status, calls: account.providerCalls }))
    }
  } else if (mode === "close") {
    const missing = []
    for (const id of primaryIds) if (!await exists(path.join(root, "preparation-jobs", id, "job.json"))) missing.push("prepare:" + id)
    for (const u of plan.units) if (!await exists(path.join(root, "quality", u.id, "report.json"))) missing.push("quality:" + u.id)
    for (const u of plan.authors) if (!await exists(path.join(root, "authors", u.packageId, u.arm, u.variant, "delivery.json"))) missing.push("author:" + u.id)
    for (const u of plan.consumers) if (!await exists(path.join(root, "consumers", u.id, "report.json"))) missing.push("consumer:" + u.id)
    if (missing.length && !await paidPaused()) throw new Error("Generation still open: " + missing.join(", "))
    await save(path.join(root, "generation-closed.json"), { at: new Date().toISOString(), missing, paidPaused: await paidPaused(), noAdditionalGeneration: true, targetExecutions: 0 }, true)
    await journal("generation-closed", { missing, providerCalls: (await json(path.join(root, "status.json"))).providerCalls })
    console.log(JSON.stringify({ status: "closed", missing }))
  } else {
    const state = await json(path.join(root, "status.json")), preparation = [], quality = []
    for (const id of primaryIds) { const f = path.join(root, "preparation-jobs", id, "job.json"); preparation.push({ id, ...(await exists(f) ? { status: (await json(f)).report?.status ?? "failed" } : { status: "not-dispatched-or-unknown" }) }) }
    for (const u of plan.units) { const dir = path.join(root, "quality", u.id), f = path.join(dir, "report.json"); quality.push({ ...u, ...(await exists(f) ? { status: (await json(f)).status, account: await json(path.join(dir, "account.json")) } : { status: "blocked-or-not-dispatched" }) }) }
    const summary = { schemaVersion: "authorization-am-generation/v1", preparationPlanned: 4, qualityPlanned: 16, preparation, quality, allPaid: aggregateUsage(state.paidRows.map((r: any) => r.account)), qualityUsage: aggregateUsage(quality.flatMap(q => q.account ? [q.account] : [])), providerCallsThisCommand: 0, targetExecutions: 0 }
    await save(path.join(root, "generation-summary.json"), summary)
    console.log(JSON.stringify({ preparation, quality: quality.map(({ account: _a, ...r }) => r), allPaid: summary.allPaid, providerCallsThisCommand: 0 }))
  }
}
