import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { executeLocalAuthorizationRun } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { qualityUnits, authorUnits, caseIds, packageIds, buildCurrentAuthorTasks, ratingRules } from "./protocol.ts"
import { root, repo, am, al, absolute, bind, claim, exists, hash, json, journal, paidPaused, paidRecordExists, retainPaid, save, sessionAccount, aggregateUsage, unknownAccount, unresolvedClaim, updateStatus, verifyPlan, configureProvider } from "./common.ts"

const mode = process.argv[2]
if (!["register", "check", "freeze", "run-quality", "close", "replay"].includes(mode ?? "")) throw new Error("Usage: study.ts register|check|freeze|run-quality|close|replay")

const markdown = async (row: any) => ({ instructions: await readFile(absolute(row.markdown), "utf8"), instructionOrigin: "independent-author" as const, instructionPath: row.markdown.path })
const execution = { method: "plain" as const, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const,
  executionOptions: { timeoutMs: 300000, unitTimeoutMs: 900000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 as const } }

if (mode === "register") {
  const manifest = await json(path.join(am, "input-manifest.json"))
  const briefs = await json(path.join(al, "author-briefs.json"))
  const quality = []
  for (const unit of qualityUnits()) {
    const prior = manifest.cases.find((item: any) => item.id === unit.caseId)
    if (!prior) throw new Error(`Missing registered AM quality case ${unit.caseId}`)
    const prepared = path.join(am, "inputs", unit.caseId, "callable-v1")
    quality.push({ ...unit, input: await bind(path.join(prepared, "assessment.json")), materialReport: await bind(path.join(prepared, "report.json")),
      markdown: prior.markdown, originalSourceFiles: prior.sourceFiles })
  }
  const authorSnapshots: any[] = []
  for (const packageId of packageIds) {
    const brief = briefs.packages.find((item: any) => item.id === packageId)
    if (!brief) throw new Error(`Missing public author brief ${packageId}`)
    const projected = buildCurrentAuthorTasks(brief)
    const directory = path.join(root, "registered-authors", packageId)
    await save(path.join(directory, "original.task.json"), projected.original, true)
    await save(path.join(directory, "changed.task.json"), projected.changed, true)
    await save(path.join(directory, "change.json"), projected.change, true)
    await save(path.join(directory, "field-origins.json"), projected.fieldOrigins, true)
    const shared = path.join(am, "author-material", packageId, "prepared")
    authorSnapshots.push({ packageId, original: await bind(path.join(directory, "original.task.json")), changed: await bind(path.join(directory, "changed.task.json")),
      change: await bind(path.join(directory, "change.json")), preparedInput: await bind(path.join(shared, "assessment.json")), preparedReport: await bind(path.join(shared, "report.json")),
      rawSourceFiles: await Promise.all(brief.allowedFiles.map((file: string) => bind(path.resolve(al, brief.originalSourceRoot, file)))) })
  }
  const inputBindings = [await bind(path.join(am, "input-manifest.json")), await bind(path.join(al, "author-briefs.json")),
    ...quality.flatMap(row => [row.input, row.materialReport, row.markdown, ...row.originalSourceFiles]),
    ...authorSnapshots.flatMap(row => [row.original, row.changed, row.change, row.preparedInput, row.preparedReport, ...row.rawSourceFiles])]
  const commit = (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim()
  const plan = { schemaVersion: "authorization-an-study/v1", registeredAt: new Date().toISOString(), registeredBeforePaid: true, model: "xty/gpt-5.6-sol",
    registrationHead: commit, startCommit: "3251ff0c8185dad2b57d88f309dec942f674b70c", quality, authors: authorUnits(), consumers: authorUnits(), authorSnapshots,
    inputBindings, execution, evaluation: { ratingRules, qualityDenominator: 16, authorDenominator: 12, consumerDenominator: 12, obligationDenominator: 24,
      oracleOpenedAfterGenerationClosed: true }, targetExecutions: 0, humanMinutes: null,
    authorFactAccounting: { publicDomainFacts: "brief-derived current snapshots shared by all three routes", modelFields: "route output plus at most one diagnosed revision", hostFields: "Markdown runnable v2 scaffold; task-authoring case references and canonical lowerer; v2 metadata from context" },
    retryPolicy: { authorRevisions: 1, domainRepairs: 1, completionUnknownResend: false, infrastructurePauseAfter: 2, sharedBugRevisionMaxSessions: 8 } }
  await save(path.join(root, "study-plan.json"), plan, true)
  await updateStatus({ stage: "AN8", nextAction: "Run study.ts check before any provider dispatch.", studyRows: { quality: { planned: 16, dispatched: 0, terminal: 0 }, authors: { planned: 12, dispatched: 0, terminal: 0 }, consumers: { planned: 12, dispatched: 0, terminal: 0 }, obligations: { planned: 24, completed: 0 } } })
  await journal("AN8-register", { quality: 16, authors: 12, consumers: 12, obligations: 24, commit, providerCalls: 0 })
  console.log(JSON.stringify({ status: "registered", quality: 16, authors: 12, consumers: 12, providerCalls: 0 }))
} else if (mode === "check") {
  const plan = await verifyPlan()
  const rows: any[] = []
  for (const row of plan.quality) {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "authorization-an-check-"))
    const captured: unknown[] = []
    try {
      const options = { inputFile: absolute(row.input), outRoot: scratch, model: "an/offline-mock", ...execution, taskContract: row.taskContract,
        providerFactory: () => ({ name: "an-offline-mock", async complete(params: unknown) { captured.push(params); throw new Error("AN offline preflight sentinel") },
          async completeWithToolResults() { throw new Error("AN offline preflight sentinel") } }) }
      const result = row.route === "markdown" ? await executeMarkdownStudyRun({ ...options, markdown: await markdown(row) }) : await executeLocalAuthorizationRun(options)
      if (!("sessionId" in result) || !result.sessionId || captured.length === 0) throw new Error(`Ordinary preflight did not reach mock provider for ${row.id}: ${JSON.stringify(result)}`)
      const session = path.join(scratch, "sessions", result.sessionId)
      const check = await json(path.join(session, "check.json"))
      if (check.status !== "valid" || check.wireVersion !== "source-authorization-assessment-wire/v6") throw new Error(`Invalid ordinary check for ${row.id}: ${JSON.stringify(check.diagnostics)}`)
      const prompt = JSON.stringify(captured[0])
      if (row.taskContract === "current-v1" && prompt.includes("return source_supported_failure, source_refuted, or unknown with exact supplied-source locations")) throw new Error(`Old output requirement reached current prompt for ${row.id}`)
      await save(path.join(root, "preflight-prompts", `${row.id}.json`), { row, prompt, sha256: hash(prompt), mockDispatches: captured.length, providerCalls: 0 })
      rows.push({ id: row.id, status: check.status, taskContract: row.taskContract, route: row.route, promptSha256: hash(prompt), inputSha256: row.input.sha256,
        sourceBundleSha256: hash(await readFile(path.join(session, "source-bundle.json"))), declaredScenarios: check.scopePreview?.declaredScenarios, expandedObligations: check.scopePreview?.expandedObligations })
    } finally {
      const resolved = path.resolve(scratch)
      if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unsafe temporary preflight cleanup path")
      await rm(resolved, { recursive: true, force: true })
    }
  }
  if (rows.length !== 16) throw new Error("Quality preflight did not cover all registered rows")
  for (const caseId of caseIds) {
    const cases = rows.filter(row => plan.quality.find((unit: any) => unit.id === row.id).caseId === caseId)
    if (new Set(cases.map(row => row.inputSha256)).size !== 1 || new Set(cases.map(row => row.sourceBundleSha256)).size !== 1) throw new Error(`Quality arms changed material for ${caseId}`)
  }
  const promptDifferences = []
  for (const caseId of caseIds) for (const route of ["markdown", "dsl"]) {
    const pair = plan.quality.filter((row: any) => row.caseId === caseId && row.route === route)
    const oldPrompt = (await json(path.join(root, "preflight-prompts", `${pair.find((row: any) => row.taskContract === "compatibility").id}.json`))).prompt
    const currentPrompt = (await json(path.join(root, "preflight-prompts", `${pair.find((row: any) => row.taskContract === "current-v1").id}.json`))).prompt
    const oldRequirement = caseId === "owui-file" ? "return source_supported_failure, source_refuted, or unknown with exact input locations" : "return source_supported_failure, source_refuted, or unknown with exact supplied-source locations"
    const effective = caseId === "owui-file" ? "Use exact input locations to support the source-visible behavior and policy comparison." : "Use exact supplied-source locations to support the source-visible behavior and policy comparison."
    if (route === "markdown" && oldPrompt !== currentPrompt) throw new Error(`Markdown domain/prompt changed beyond contract for ${caseId}`)
    if (route === "dsl" && oldPrompt.replace(oldRequirement, effective) !== currentPrompt) throw new Error(`DSL domain/prompt changed beyond known migration for ${caseId}`)
    promptDifferences.push({ caseId, route, kind: route === "markdown" ? "identical" : "known-requiredAnalysis-return-instruction-migrated", ...(route === "dsl" ? { original: oldRequirement, effective } : {}) })
  }
  const mockDispatches = (await Promise.all(plan.quality.map(async (row: any) => (await json(path.join(root, "preflight-prompts", `${row.id}.json`))).mockDispatches))).reduce((total, count) => total + count, 0)
  await save(path.join(root, "pre-run-check.json"), { rows, promptDifferences, providerCalls: 0, mockDispatches, targetExecutions: 0 })
  await journal("AN8-check", { rows: rows.length, providerCalls: 0 })
  console.log(JSON.stringify({ status: "valid", rows: rows.length, providerCalls: 0 }))
} else if (mode === "freeze") {
  await verifyPlan()
  if (!await exists(path.join(root, "pre-run-check.json")) || !await exists(path.join(root, "author-pre-run-check.json"))) throw new Error("Both zero-provider preflights are required before freezing")
  const files: string[] = []
  for (const directory of ["src/task-dsl/authorization", "src/benchmarks/authorization-dsl"]) for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: path.join(repo, directory) })) if (!file.endsWith(".test.ts")) files.push(path.join(repo, directory, file))
  for await (const file of new Bun.Glob("authorization*.ts").scan({ cwd: path.join(repo, "src/cli") })) if (!file.endsWith(".test.ts")) files.push(path.join(repo, "src/cli", file))
  for (const file of ["common.ts", "protocol.ts", "study.ts", "authors.ts", "author-protocol.ts"]) files.push(path.join(root, file))
  const commit = (await Bun.$`git -C ${repo} rev-parse HEAD`.text()).trim()
  await save(path.join(root, "generation-freeze.json"), { schemaVersion: "authorization-an-generation-freeze/v1", commit,
    planSha256: hash(await readFile(path.join(root, "study-plan.json"))), files: await Promise.all(files.sort().map(bind)),
    frozenBeforePaid: true, targetExecutions: 0 }, true)
  await journal("AN8-freeze", { commit, files: files.length, providerCalls: 0 })
  console.log(JSON.stringify({ status: "frozen", commit, files: files.length, providerCalls: 0 }))
} else if (mode === "run-quality") {
  const plan = await verifyPlan(true)
  if (!await exists(path.join(root, "pre-run-check.json"))) throw new Error("AN8 zero-provider preflight is required")
  for (const row of plan.quality) {
    const directory = path.join(root, "quality", row.id)
    if (await exists(path.join(directory, "claim.json"))) {
      const interrupted = await unresolvedClaim(directory, "report.json")
      if (interrupted) {
        const account = unknownAccount(), status = "completion-unknown-after-claim"
        await save(path.join(directory, "report.json"), { row, status, archivedFiles: interrupted.archivedFiles, noAutomaticResend: true }, true)
        await save(path.join(directory, "account.json"), account, true)
        if (!await paidRecordExists(`quality:${row.id}`)) await retainPaid(`quality:${row.id}`, status, account, true)
        await journal("AN9-interrupted-quality", { id: row.id, archivedFiles: interrupted.archivedFiles, account: "unknown" })
      } else if (await exists(path.join(directory, "report.json"))) {
        const report = await json(path.join(directory, "report.json"))
        const accountFile = path.join(directory, "account.json")
        const account = await exists(accountFile) ? await json(accountFile) : await sessionAccount(directory, report)
        if (!await exists(accountFile)) await save(accountFile, account, true)
        if (!await paidRecordExists(`quality:${row.id}`)) await retainPaid(`quality:${row.id}`, report.status, account, false)
      }
      continue
    }
    if (await paidPaused()) break
    await claim(directory, row)
    configureProvider()
    console.log(JSON.stringify({ id: row.id, caseId: row.caseId, route: row.route, taskContract: row.taskContract, action: "quality-start" }))
    let report: any, account: any
    try {
      const options = { inputFile: absolute(row.input), outRoot: directory, model: plan.model, ...plan.execution, taskContract: row.taskContract }
      report = row.route === "markdown" ? await executeMarkdownStudyRun({ ...options, markdown: await markdown(row) }) : await executeLocalAuthorizationRun(options)
      account = await sessionAccount(directory, report)
    } catch (error) {
      report = { status: "runner-failed", error: String(error) }
      account = unknownAccount()
    }
    await save(path.join(directory, "report.json"), { row, ...report }, true)
    await save(path.join(directory, "account.json"), account, true)
    await retainPaid(`quality:${row.id}`, report.status, account, ["provider-error", "transport-failed", "timeout-unknown", "runner-failed"].includes(report.status))
    const status = await json(path.join(root, "status.json"))
    await updateStatus({ studyRows: { ...status.studyRows, quality: { planned: 16, dispatched: status.paidDispatches.filter((item: any) => item.id.startsWith("quality:")).length, terminal: status.paidDispatches.filter((item: any) => item.id.startsWith("quality:")).length } } })
    await journal("AN9-quality", { id: row.id, status: report.status, providerCalls: account.providerCalls })
    console.log(JSON.stringify({ id: row.id, status: report.status, providerCalls: account.providerCalls }))
  }
  const state = await json(path.join(root, "status.json"))
  const terminal = (await Promise.all(plan.quality.map(async (row: any) => await exists(path.join(root, "quality", row.id, "report.json"))))).filter(Boolean).length
  await updateStatus({ studyRows: { ...state.studyRows, quality: { planned: 16, dispatched: state.paidDispatches.filter((item: any) => item.id.startsWith("quality:")).length, terminal } } })
} else if (mode === "close") {
  const plan = await verifyPlan()
  const missing = [...plan.quality.map((row: any) => ["quality", row.id]), ...plan.authors.map((row: any) => ["authors", row.id]), ...plan.consumers.map((row: any) => ["consumers", row.id])]
    .filter(([kind, id]) => !Bun.file(path.join(root, kind!, id!, kind === "authors" ? "delivery.json" : "report.json")).size)
  if (missing.length && !await paidPaused()) throw new Error(`Generation remains open: ${JSON.stringify(missing)}`)
  await save(path.join(root, "generation-closed.json"), { at: new Date().toISOString(), missing, paidPaused: await paidPaused(), noAdditionalGeneration: true, targetExecutions: 0 }, true)
  console.log(JSON.stringify({ status: "closed", missing }))
} else {
  const plan = await verifyPlan(), status = await json(path.join(root, "status.json"))
  const quality = await Promise.all(plan.quality.map(async (row: any) => ({ id: row.id, status: await exists(path.join(root, "quality", row.id, "report.json")) ? (await json(path.join(root, "quality", row.id, "report.json"))).status : "not-dispatched" })))
  const summary = { quality, planned: { quality: 16, authors: 12, consumers: 12, obligations: 24 }, allPaid: aggregateUsage(status.paidDispatches.map((row: any) => row.account)), providerCallsThisCommand: 0, targetExecutions: 0 }
  await save(path.join(root, "generation-summary.json"), summary)
  console.log(JSON.stringify(summary))
}
