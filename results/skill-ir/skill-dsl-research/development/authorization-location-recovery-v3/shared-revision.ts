import { readFile } from "node:fs/promises"
import path from "node:path"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { root, repo, json, save, bind, hash, verify, verifyStudy, exists, cli, configureProvider, claim, journal, sessionAccount, aggregateUsage } from "./common.ts"

const mode = process.argv[2], revisionRoot = path.join(root, "shared-revision")
if (!["register", "freeze", "prepare", "run", "replay"].includes(mode ?? "")) throw new Error("Usage: shared-revision.ts register|freeze|prepare|run|replay")
const registrationFile = path.join(revisionRoot, "registration.json")
if (mode === "register") {
  const plan = await json(path.join(root, "study-plan.json")), baseline = await json(path.join(root, "implementation-freeze.json"))
  const cases = plan.cases.filter((c: any) => ["owui-file", "paperless-download"].includes(c.id))
  const units = cases.flatMap((c: any) => ["markdown", "dsl"].map(arm => ({ id: c.id + "-revised-auto-" + arm, caseId: c.id, material: "revised-auto", arm })))
  await save(registrationFile, { schemaVersion: "authorization-al-shared-revision/v1", registeredAt: new Date().toISOString(),
    baselineCommit: baseline.commit, baselineFreeze: await bind(path.join(root, "implementation-freeze.json")), model: plan.model,
    defects: [
      { kind: "python-multiline-header", redTest: "Python multiline signatures include their bodies before the next peer declaration", source: "discovery.ts:indexSymbols", actual: "OWUI save_docs_to_vector_db ended at 1348 before its dedented signature close at 1349; Paperless resolver ended at 1406 before its close at 1407." },
      { kind: "duplicate-json-property", redTest: "duplicate JSON reads are diagnosed before last-wins can discard an indexed body request", source: "proposal.ts:parseSelectionJSON", actual: "Paperless Download returned a nonempty reads then reads:[] in the same JSON object; JSON.parse silently selected the last property." },
    ],
    selectionRule: "Only new-auto OWUI and Download source preparations affected by these reproduced parser/index defects; keep all 20 original quality rows and all author/consumer rows unchanged. One shared repair block, four fresh MD/DSL analyses, no score-based selection or further repeat.",
    budgetAdjustment: "Two additional ordinary entry-seed preparations are necessary to supply the repaired index/parser to the four preregistered revision analyses. Each keeps 12 files/1MiB reads/64KiB cumulative display/64KiB final/depth3, two position calls plus one format revision. Analysis budget unchanged; target execution zero.",
    baselineReviews: "Original generation closed before registration. Semantic adjudications remain separate and never enter generation prompts.",
    cases, units, executionOptions: plan.executionOptions, maxAnalysisSessions: 4, maxPreparationJobs: 2, noLowScoreResampling: true,
  }, true)
  await journal("AL10-shared-revision-registered", { cases: cases.map((c: any) => c.id), analyses: units.length, preparationJobs: 2 })
  console.log(JSON.stringify({ registered: units.length, preparationJobs: 2, providerCalls: 0 }))
} else if (mode === "freeze") {
  const baseline = await json(path.join(root, "implementation-freeze.json")), registration = await json(registrationFile)
  await verify(registration.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles]))
  const commitProcess = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repo, stdout: "pipe", stderr: "pipe" })
  const commit = (await new Response(commitProcess.stdout).text()).trim()
  if (await commitProcess.exited) throw new Error("Cannot record implementation commit")
  const paths = [...baseline.files.map((b: any) => path.resolve(repo, b.path)), import.meta.path]
  const files = await Promise.all([...new Set<string>(paths)].map(bind))
  await save(path.join(revisionRoot, "implementation-freeze.json"), { schemaVersion: "authorization-al-revision-freeze/v1", commit, frozenAt: new Date().toISOString(),
    baselineFreezeSha256: hash(await readFile(path.join(root, "implementation-freeze.json"))), registrationSha256: hash(await readFile(registrationFile)),
    planSha256: hash(await readFile(path.join(root, "study-plan.json"))), files }, true)
  console.log(JSON.stringify({ commit, files: files.length, providerCalls: 0 }))
} else {
  const plan = await verifyStudy(), registration = await json(registrationFile)
  await verify(registration.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles]))
  const inputPath = (c: any) => path.join(revisionRoot, "inputs", c.id, "material", "assessment.json")
  if (mode === "prepare") {
    let failures = 0
    for (const c of registration.cases) {
      const job = path.join(revisionRoot, "inputs", c.id), material = path.join(job, "material")
      if (await exists(path.join(job, "claim.json"))) continue
      configureProvider(plan.model)
      if (!await claim(job, { caseId: c.id, purpose: "registered-shared-defect-repair" })) continue
      console.log(JSON.stringify({ id: c.id, action: "revision-prepare-start" }))
      const result = await cli(["prepare", "--input=" + path.resolve(repo, c.input.path), "--request=" + path.resolve(repo, c.seedRequest.path), "--out=" + material, "--discover=true", "--proposal-model=" + plan.model], true)
      await save(path.join(job, "job.json"), { caseId: c.id, ...result }, true)
      console.log(JSON.stringify({ id: c.id, status: result.report?.status, calls: result.report?.proposal?.account?.telemetry?.providerCalls }))
      failures = result.exitCode && ["provider-error", "timeout-unknown"].includes(result.report?.proposal?.account?.status ?? "") ? failures + 1 : 0
      if (failures >= 2) break
    }
    const materials: any[] = []
    for (const c of registration.cases) {
      if (!await exists(path.join(revisionRoot, "inputs", c.id, "job.json"))) throw new Error("Revision preparation not closed")
      const file = inputPath(c)
      if (await exists(file)) {
        const loaded = await loadLocalAuthorizationInput(file)
        if (loaded.status !== "valid") throw new Error("Invalid revised source material")
        materials.push({ caseId: c.id, input: await bind(file), report: await bind(path.join(path.dirname(file), "report.json")), sources: await Promise.all(loaded.normalizedInput.sources.map(file => bind(path.resolve(loaded.sourceRoot, file)))) })
      } else materials.push({ caseId: c.id, blocked: true })
    }
    await save(path.join(revisionRoot, "material-config.json"), { materials }, true)
  } else if (mode === "run") {
    const config = await json(path.join(revisionRoot, "material-config.json"))
    await verify(config.materials.flatMap((m: any) => m.blocked ? [] : [m.input, m.report, ...m.sources]))
    let failures = 0
    for (const unit of registration.units) {
      const c = registration.cases.find((c: any) => c.id === unit.caseId), file = inputPath(c), outRoot = path.join(revisionRoot, "runs", unit.id)
      if (await exists(path.join(outRoot, "claim.json"))) continue
      const available = await exists(file)
      if (available) configureProvider(plan.model)
      if (!await claim(outRoot, unit)) continue
      let report: any
      if (!available) report = { status: "preparation-blocked", providerCalls: 0 }
      else {
        console.log(JSON.stringify({ id: unit.id, action: "revision-analysis-start" }))
        const options = { inputFile: file, model: plan.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const, executionOptions: registration.executionOptions }
        report = unit.arm === "markdown" ? await executeMarkdownStudyRun({ ...options, markdown: { instructions: await readFile(path.resolve(repo, c.markdown.path), "utf8"), instructionOrigin: "independent-author", instructionPath: c.markdown.path } }) : await executeLocalAuthorizationRun({ ...options, method: "plain" })
      }
      await save(path.join(outRoot, "unit.json"), { unit, report }, true)
      await journal("AL10-shared-revision-analysis", { id: unit.id, status: report.status })
      console.log(JSON.stringify({ id: unit.id, status: report.status, calls: report.telemetry?.providerCalls ?? 0 }))
      failures = ["transport-failed", "timeout-unknown", "provider-unavailable"].includes(report.status) ? failures + 1 : 0
      if (failures >= 2) break
    }
  } else {
    const rows = [], preparationAccounts = []
    for (const unit of registration.units) {
      const dir = path.join(revisionRoot, "runs", unit.id)
      if (!await exists(path.join(dir, "unit.json"))) { rows.push({ ...unit, status: await exists(path.join(dir, "claim.json")) ? "completion-unknown" : "not-dispatched" }); continue }
      const stored = await json(path.join(dir, "unit.json"))
      if (stored.report.sessionId && (await inspectLocalAuthorizationOutput(dir)).status !== stored.report.status) throw new Error("Revision inspect differs")
      rows.push({ ...unit, status: stored.report.status, sessionId: stored.report.sessionId ?? null, account: await sessionAccount(dir, stored.report) })
    }
    for (const c of registration.cases) {
      const file = path.join(revisionRoot, "inputs", c.id, "job.json")
      if (!await exists(file)) continue
      const job = await json(file), r = job.report
      const account = r?.proposal?.account ?? (r?.attemptPath && await exists(path.join(r.attemptPath, "account.json")) ? await json(path.join(r.attemptPath, "account.json")) : null)
      if (account) preparationAccounts.push({ caseId: c.id, ...account.telemetry, knownDurationMs: account.attempts.reduce((n: number, a: any) => n + (a.response?.durationMs ?? 0), 0) })
    }
    const summary = { schemaVersion: "authorization-al-revision-replay/v1", planned: 4, closed: rows.filter(r => !["not-dispatched", "completion-unknown"].includes(r.status)).length,
      rows, usage: aggregateUsage(rows.flatMap(r => r.account ? [r.account] : [])), preparationAccounts, preparationUsage: aggregateUsage(preparationAccounts), providerCallsThisCommand: 0 }
    await save(path.join(revisionRoot, "replay.json"), summary)
    console.log(JSON.stringify(summary))
  }
}
