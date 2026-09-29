import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { createAuthorizationAuthoringDraft, renderAuthoringTask } from "../../../../../src/benchmarks/authorization-dsl/authoring-assist.ts"
import { applyAuthorizationDraftRepair, draftRepairPaths } from "../../../../../src/benchmarks/authorization-dsl/authoring-draft-repair.ts"
import { executeLocalAuthorizationRun } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { createTelemetryProvider } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { authorPromptTask, checkDelivery, checkV2Facts, parseObject } from "./author-protocol.ts"
import { consumerClaimState, readOrCreateOfflineRecord, sameSharedMaterial } from "./consumer-gate.ts"
import { root, repo, al, absolute, claim, cli, configureProvider, exists, hash, json, journal, paidPaused, paidRecordExists, provider, retainPaid, save, sessionAccount, aggregateUsage, unknownAccount, unresolvedClaim, updateStatus, verifyPlan } from "./common.ts"

const mode = process.argv[2]
if (!["setup", "check", "run", "consume", "replay"].includes(mode ?? "")) throw new Error("Usage: authors.ts setup|check|run|consume|replay")
const plan = await verifyPlan(mode === "run")
if (mode === "consume") {
  const freezeFile = path.join(root, "generation-freeze.json")
  const freezeBytes = await readFile(freezeFile)
  const freeze = JSON.parse(freezeBytes.toString())
  const previousRevisionBytes = await readFile(path.join(root, "generation-revision-1.json"))
  const revision = await json(path.join(root, "generation-revision-2.json"))
  const authorPath = "results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/authors.ts"
  const gatePath = "results/skill-ir/skill-dsl-research/development/authorization-task-contract-v1/consumer-gate.ts"
  if (revision.schemaVersion !== "authorization-an-consumer-revision/v2" || revision.scope !== "consumer-only"
    || revision.baseFreezeSha256 !== hash(freezeBytes) || revision.previousRevisionSha256 !== hash(previousRevisionBytes)
    || revision.maxAffectedSessions !== 8
    || JSON.stringify(revision.changedFiles.map((item: any) => item.path).sort()) !== JSON.stringify([authorPath, gatePath].sort())) throw new Error("Consumer revision identity is invalid")
  for (const file of freeze.files) {
    const expected = file.path === authorPath ? revision.changedFiles.find((item: any) => item.path === authorPath).sha256 : file.sha256
    if (hash(await readFile(path.join(repo, file.path))) !== expected) throw new Error(`Consumer revision source changed: ${file.path}`)
  }
  if (hash(await readFile(path.join(repo, gatePath))) !== revision.changedFiles.find((item: any) => item.path === gatePath).sha256) throw new Error("Consumer gate changed")
  const validRows = []
  for (const row of plan.consumers) if ((await json(path.join(root, "authors", row.id, "delivery.json"))).finalValid) validRows.push(row.id)
  if (validRows.length > revision.maxAffectedSessions || JSON.stringify(validRows) !== JSON.stringify(revision.affectedRows)) throw new Error("Consumer revision scope changed")
}
const briefs = await json(path.join(al, "author-briefs.json"))
const briefFor = (row: any) => briefs.packages.find((item: any) => item.id === row.packageId)
const snapshotFor = (row: any) => plan.authorSnapshots.find((item: any) => item.packageId === row.packageId)
const authorDir = (row: any) => path.join(root, "author-context", row.packageId, row.route)
const jobDir = (row: any) => path.join(root, "authors", row.id)
const currentFor = async (row: any) => await json(absolute(snapshotFor(row)[row.version]))
const execOptions = { method: "plain" as const, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const,
  taskContract: "current-v1" as const, executionOptions: { timeoutMs: 300000, unitTimeoutMs: 900000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 as const } }

function contextFor(brief: any, dir: string) {
  const source = path.resolve(al, brief.originalSourceRoot)
  return { schemaVersion: "authorization-authoring-context/v1", taskId: brief.taskId, request: brief.question, repository: brief.repository,
    sourceRef: brief.originalSourceRef, sourceRoot: path.relative(dir, source).split(path.sep).join("/"), allowedFiles: brief.allowedFiles, entries: [brief.entry] }
}

if (mode === "setup") {
  for (const packageId of ["memos-space-policy", "paperless-note-premise"]) for (const route of ["markdown", "dsl", "task-authoring"]) {
    const brief = briefs.packages.find((item: any) => item.id === packageId)
    const dir = authorDir({ packageId, route }); await mkdir(dir, { recursive: true })
    const context = contextFor(brief, dir)
    await save(path.join(dir, "context.json"), context, true)
    const draft = createAuthorizationAuthoringDraft(context)
    await save(path.join(dir, "known.draft.json"), draft.draft, true)
    await save(path.join(dir, "known-fields.json"), { context, knownDraft: draft.draft, sourceEntryLines: brief.entry,
      publicFactsFrom: snapshotFor({ packageId }).original.path, hostFacts: ["source identity and entry context", "entry seed", "Markdown runnable scaffold", "front-end reference expansion"],
      modelFacts: ["reusable task presentation", "v2 dictionaries when selected", "front-end case declaration when selected"], providerCalls: 0 }, true)
  }
  await journal("AN8-author-setup", { contexts: 6, providerCalls: 0 })
  console.log(JSON.stringify({ status: "ready", contexts: 6, providerCalls: 0 }))
} else if (mode === "check") {
  const rows = []
  for (const row of plan.authors) {
    const dir = authorDir(row), context = await json(path.join(dir, "context.json")), current = await currentFor(row)
    const previous = row.version === "changed" ? await json(absolute(snapshotFor(row).original)) : undefined
    const change = row.version === "changed" ? await json(absolute(snapshotFor(row).change)) : undefined
    const promptTask = authorPromptTask(row, current, context, await json(path.join(dir, "known.draft.json")), change, previous)
    const prompt = renderAuthoringTask(promptTask)
    if (row.version === "original") {
      const forbidden = briefFor(row).changedPolicy
      if (forbidden !== briefFor(row).originalPolicy && prompt.includes(forbidden)) throw new Error(`Future policy leaked to original author ${row.id}`)
      if (prompt.includes("changedPolicy") || prompt.includes("changeRequest") || prompt.includes("namedChange")) throw new Error(`Future field leaked to original author ${row.id}`)
    }
    await save(path.join(root, "author-preflight-prompts", `${row.id}.json`), { row, prompt, sha256: hash(prompt), providerCalls: 0 })
    const preflight = path.join(dir, `preflight-${row.version}.json`)
    if (!await exists(preflight)) {
      const generated = await cli(["init", `--context=${path.join(dir, "context.json")}`, `--task=${absolute(snapshotFor(row)[row.version])}`, `--out=${preflight}`])
      if (generated.exitCode) throw new Error(`Current task init preflight failed ${row.id}: ${JSON.stringify(generated)}`)
    }
    const checked = await cli(["check", `--input=${preflight}`, "--method=plain", "--assessment=explicit-v1", "--wire=v6", "--task-contract=current-v1"])
    if (checked.exitCode || checked.report?.status !== "valid") throw new Error(`Author route check preflight failed ${row.id}: ${JSON.stringify(checked)}`)
    const sharedInput = absolute(snapshotFor(row).preparedInput)
    const reuse = await cli(["prepare", `--input=${preflight}`, `--reuse=${sharedInput}`, `--out=${path.join(dir, `preflight-reuse-${row.version}`)}`, "--check-only=true"])
    if (reuse.exitCode) throw new Error(`Author reuse preflight failed ${row.id}: ${JSON.stringify(reuse)}`)
    rows.push({ id: row.id, route: row.route, version: row.version, currentTaskSha256: snapshotFor(row)[row.version].sha256,
      authorPromptSha256: hash(prompt), checkStatus: checked.report.status, reuseStatus: reuse.report?.status, providerCalls: 0 })
  }
  await save(path.join(root, "author-pre-run-check.json"), { rows, providerCalls: 0, consumerCombinationsChecked: rows.length })
  await journal("AN8-author-check", { rows: rows.length, providerCalls: 0 })
  console.log(JSON.stringify({ status: "valid", authors: rows.length, consumerCombinationsChecked: rows.length, providerCalls: 0 }))
} else if (mode === "run") {
  if (!await exists(path.join(root, "author-pre-run-check.json"))) throw new Error("AN8 author/consumer preflight is required")
  for (const row of plan.authors) {
    const job = jobDir(row), dir = authorDir(row)
    if (await exists(path.join(job, "claim.json"))) {
      const interrupted = await unresolvedClaim(job, "delivery.json")
      if (interrupted) {
        for (const kind of ["first", "revision"] as const) {
          const accountFile = path.join(job, `${kind}.account.json`), promptFile = path.join(job, `${kind}.prompt.json`)
          if (!await exists(accountFile) && !(kind === "first" || await exists(promptFile))) continue
          const id = `author:${row.id}:${kind}`
          if (!await paidRecordExists(id)) {
            const account = await exists(accountFile) ? await json(accountFile) : unknownAccount()
            await retainPaid(id, account.providerCalls === null ? "completion-unknown-after-claim" : "response-retained-delivery-interrupted", account, account.providerCalls === null)
          }
        }
        await save(path.join(job, "delivery.json"), { row, status: "interrupted-after-claim", firstValid: false, finalValid: false,
          calls: null, archivedFiles: interrupted.archivedFiles, noAutomaticResend: true }, true)
        await journal("AN10-interrupted-author", { id: row.id, archivedFiles: interrupted.archivedFiles })
      }
      continue
    }
    if (await paidPaused()) break
    const originalJob = jobDir({ ...row, id: `${row.packageId}-${row.route}-original` })
    if (row.version === "changed" && (!await exists(path.join(originalJob, "delivery.json")) || !(await json(path.join(originalJob, "delivery.json"))).finalValid)) {
      await claim(job, row)
      await save(path.join(job, "delivery.json"), { row, status: "author-dependency-blocked", firstValid: false, finalValid: false, calls: 0 }, true)
      continue
    }
    const current = await currentFor(row), context = await json(path.join(dir, "context.json")), knownDraft = await json(path.join(dir, "known.draft.json"))
    const change = row.version === "changed" ? await json(absolute(snapshotFor(row).change)) : undefined
    const previous = row.version === "changed" ? await json(path.join(dir, "original.selected.json")) : undefined
    const priorForPrompt = row.version === "changed" && row.route === "markdown" ? await readFile(path.join(dir, "original.selected.md"), "utf8") : previous
    const task = authorPromptTask(row, current, context, knownDraft, change, priorForPrompt)
    const prompt = renderAuthoringTask(task)
    const active = await provider(plan.model)
    await claim(job, row)
    await save(path.join(job, "task.json"), task, true)
    await save(path.join(job, "first.prompt.json"), { prompt, sha256: hash(prompt) }, true)
    console.log(JSON.stringify({ id: row.id, action: "author-start" }))
    async function attempt(kind: "first" | "revision", content: string, firstCandidate?: unknown, allowedPaths?: string[]) {
      const telemetry = createTelemetryProvider(active, { perCallTimeoutMs: 300000, unitTimeoutMs: 900000, maxDispatches: 1,
        onEvent: event => appendFile(path.join(job, `${kind}.events.jsonl`), `${JSON.stringify(event)}\n`) })
      let checked: any, responseText = ""
      try {
        const response = await telemetry.provider.complete({ messages: [{ role: "user", content }], system: "Author ordinary current-task inputs only. No source execution or completed analysis.", temperature: 0, maxTokens: 6000 })
        responseText = response.text
        await save(path.join(job, `${kind}.response.json`), response, true)
        if (kind === "revision" && row.route === "dsl" && row.version === "original" && allowedPaths?.length) {
          const repaired = applyAuthorizationDraftRepair(firstCandidate, allowedPaths, parseObject(responseText))
          checked = repaired.status === "ready" ? checkDelivery(row, JSON.stringify(repaired.value), current, context, previous)
            : { valid: false, diagnostics: repaired.diagnostics, candidate: firstCandidate }
          checked.repair = { allowedPaths, changedPaths: repaired.changedPaths, status: repaired.status }
        } else checked = checkDelivery(row, responseText, current, context, previous)
        await save(path.join(job, `${kind}.checked.json`), checked, true)
      } catch (error) {
        checked = { valid: false, infrastructureFailure: true, diagnostics: [{ path: "$", message: String(error) }] }
        await save(path.join(job, `${kind}.failure.json`), checked, true)
      }
      await telemetry.close("author-response-retained")
      const account = { ...telemetry.summary(), attempts: telemetry.attempts, knownDurationMs: telemetry.attempts.reduce((total, item) => total + (item.response?.durationMs ?? 0), 0) }
      await save(path.join(job, `${kind}.account.json`), account, true)
      await retainPaid(`author:${row.id}:${kind}`, checked.valid ? "valid" : checked.infrastructureFailure ? "infrastructure-failed" : "invalid", account, !!checked.infrastructureFailure)
      return { checked, responseText }
    }
    const first = await attempt("first", prompt)
    let final = first
    const allowedPaths = row.route === "dsl" && row.version === "original" && first.checked.candidate ? draftRepairPaths(first.checked.candidate, first.checked.diagnostics) : []
    const canRevise = !first.checked.valid && !first.checked.infrastructureFailure && !await paidPaused() && (row.route === "markdown" || row.route === "dsl" && (row.version === "changed" || allowedPaths.length > 0))
    if (canRevise) {
      const revisionPrompt = row.route === "dsl" && row.version === "original"
        ? `${prompt}\n\nThe first candidate is invalid. Return only authorization-author-draft-repair/v1 JSON {schemaVersion,reason,operations:[{path,value}]} for the following diagnosed existing JSON Pointer leaves: ${JSON.stringify(allowedPaths)}. No policy, expectation, premise statement or unrelated field may change. Candidate: ${first.responseText}\nDiagnostics: ${JSON.stringify(first.checked.diagnostics)}`
        : renderAuthoringTask(task, { candidate: first.responseText, diagnostics: first.checked.diagnostics })
      await save(path.join(job, "revision.prompt.json"), { prompt: revisionPrompt, sha256: hash(revisionPrompt), allowedPaths }, true)
      final = await attempt("revision", revisionPrompt, first.checked.candidate, allowedPaths)
    }
    if (final.checked.valid) {
      if (row.route === "markdown") await Bun.write(path.join(dir, `${row.version}.selected.md`), final.checked.value)
      else {
        await save(path.join(dir, `${row.version}.selected.json`), final.checked.value, true)
        if (row.version === "changed") await save(path.join(dir, "changed.delivered.json"), final.checked.delivered, true)
      }
    }
    await save(path.join(job, "delivery.json"), { row, status: final.checked.valid ? "valid" : "invalid", firstValid: first.checked.valid,
      finalValid: final.checked.valid, firstDiagnostics: first.checked.diagnostics, finalDiagnostics: final.checked.diagnostics, calls: first === final ? 1 : 2,
      revisionAllowedPaths: allowedPaths }, true)
    const state = await json(path.join(root, "status.json"))
    const terminal = (await Promise.all(plan.authors.map(async (item: any) => await exists(path.join(jobDir(item), "delivery.json"))))).filter(Boolean).length
    await updateStatus({ studyRows: { ...state.studyRows, authors: { planned: 12, dispatched: state.paidDispatches.filter((item: any) => item.id.startsWith("author:") && item.id.endsWith(":first")).length, terminal } } })
    await journal("AN10-author", { id: row.id, firstValid: first.checked.valid, finalValid: final.checked.valid, calls: first === final ? 1 : 2 })
    console.log(JSON.stringify({ id: row.id, firstValid: first.checked.valid, finalValid: final.checked.valid, calls: first === final ? 1 : 2 }))
  }
} else if (mode === "consume") {
  for (const row of plan.consumers) {
    const directory = path.join(root, "consumers", row.id), authored = authorDir(row), delivery = path.join(jobDir(row), "delivery.json")
    const claimState = await consumerClaimState(directory)
    if (claimState === "completion-unknown") {
      const interrupted = await unresolvedClaim(directory, "report.json")
      if (interrupted) {
        const account = unknownAccount(), status = "completion-unknown-after-claim"
        await save(path.join(directory, "report.json"), { row, status, archivedFiles: interrupted.archivedFiles, noAutomaticResend: true }, true)
        await save(path.join(directory, "account.json"), account, true)
        if (!await paidRecordExists(`consumer:${row.id}`)) await retainPaid(`consumer:${row.id}`, status, account, true)
        await journal("AN11-interrupted-consumer", { id: row.id, archivedFiles: interrupted.archivedFiles })
      }
      continue
    }
    if (claimState === "terminal") {
      if (!await paidRecordExists(`consumer:${row.id}`)) {
        const report = await json(path.join(directory, "report.json")), accountFile = path.join(directory, "account.json")
        const account = await exists(accountFile) ? await json(accountFile) : await sessionAccount(directory, report)
        if (!await exists(accountFile)) await save(accountFile, account, true)
        if (report.status !== "author-dependency-blocked") await retainPaid(`consumer:${row.id}`, report.status, account, false)
      }
      continue
    }
    if (await paidPaused()) break
    if (claimState === "new") await claim(directory, row)
    if (!await exists(delivery) || !(await json(delivery)).finalValid) {
      await save(path.join(directory, "report.json"), { row, status: "author-dependency-blocked" }, true)
      await save(path.join(directory, "account.json"), { providerCalls: 0, knownTokens: {}, unknownUsageCalls: 0, unknownCostCalls: 0 }, true)
      continue
    }
    let inputFile: string
    const contextFile = path.join(authored, "context.json")
    if (row.route === "markdown") {
      inputFile = path.join(authored, `preflight-${row.version}.json`)
      await readOrCreateOfflineRecord(path.join(directory, "host-scaffold.json"), async () => ({ source: absolute(snapshotFor(row)[row.version]), compiler: "authorization init --context --task", hostFields: "all runnable v2 structure and public domain facts", modelFields: "reusable Markdown task instructions", providerCalls: 0 }))
    } else if (row.route === "task-authoring") {
      inputFile = path.join(authored, `${row.version}.selected.v2.json`)
      const initialized = await readOrCreateOfflineRecord(path.join(directory, "init-command.json"), async () =>
        await cli(["init", `--context=${contextFile}`, `--task=${path.join(authored, `${row.version}.selected.json`)}`, "--field-origin=model-authored", `--out=${inputFile}`]))
      if (initialized.exitCode) throw new Error(`Task-authoring init failed ${row.id}: ${JSON.stringify(initialized)}`)
    } else if (row.version === "original") inputFile = path.join(authored, "original.selected.json")
    else {
      const edited = await readOrCreateOfflineRecord(path.join(directory, "edit-command.json"), async () =>
        await cli(["edit", `--input=${path.join(authored, "original.selected.json")}`, `--edit=${path.join(authored, "changed.delivered.json")}`, `--out=${path.join(directory, "edited")}`]))
      if (edited.exitCode) throw new Error(`Ordinary edit failed ${row.id}: ${JSON.stringify(edited)}`)
      inputFile = edited.report.inputPath
    }
    const shared = absolute(snapshotFor(row).preparedInput)
    const reused = await readOrCreateOfflineRecord(path.join(directory, "reuse-command.json"), async () =>
      await cli(["prepare", `--input=${inputFile}`, `--reuse=${shared}`, `--out=${path.join(directory, "material")}`]))
    if (reused.exitCode) throw new Error(`Ordinary reuse failed ${row.id}: ${JSON.stringify(reused)}`)
    const actualReport = await json(path.join(directory, "material", "report.json")), sharedReport = await json(path.join(path.dirname(shared), "report.json"))
    if (!sameSharedMaterial(actualReport, sharedReport)) throw new Error(`Shared material/gaps changed ${row.id}`)
    configureProvider()
    await save(path.join(directory, "dispatch-claim.json"), { at: new Date().toISOString(), rowId: row.id, noAutomaticResend: true }, true)
    console.log(JSON.stringify({ id: row.id, action: "consumer-start", gaps: actualReport.gaps.length }))
    let report: any, account: any
    try {
      const options = { inputFile: reused.report.inputPath, outRoot: directory, model: plan.model, ...execOptions }
      report = row.route === "markdown" ? await executeMarkdownStudyRun({ ...options, markdown: { instructions: await readFile(path.join(authored, `${row.version}.selected.md`), "utf8"), instructionOrigin: "independent-author", instructionPath: path.relative(repo, path.join(authored, `${row.version}.selected.md`)).split(path.sep).join("/") } })
        : await executeLocalAuthorizationRun(options)
      account = await sessionAccount(directory, report)
    } catch (error) { report = { status: "runner-failed", error: String(error) }; account = unknownAccount() }
    await save(path.join(directory, "report.json"), { row, ...report }, true)
    await save(path.join(directory, "account.json"), account, true)
    await retainPaid(`consumer:${row.id}`, report.status, account, ["provider-error", "transport-failed", "timeout-unknown", "runner-failed"].includes(report.status))
    if (row.version === "changed") {
      const originalDir = path.join(root, "consumers", `${row.packageId}-${row.route}-original`), original = await json(path.join(originalDir, "report.json"))
      if (original.sessionId) await save(path.join(directory, "compare.json"), await cli(["compare", `--previous=${path.join(originalDir, "sessions", original.sessionId)}`, `--input=${reused.report.inputPath}`]), true)
    }
    const state = await json(path.join(root, "status.json"))
    const terminal = (await Promise.all(plan.consumers.map(async (item: any) => await exists(path.join(root, "consumers", item.id, "report.json")) ))).filter(Boolean).length
    await updateStatus({ studyRows: { ...state.studyRows, consumers: { planned: 12, dispatched: state.paidDispatches.filter((item: any) => item.id.startsWith("consumer:")).length, terminal } } })
    await journal("AN11-consumer", { id: row.id, status: report.status, providerCalls: account.providerCalls, pendingGaps: actualReport.gaps.length })
    console.log(JSON.stringify({ id: row.id, status: report.status, providerCalls: account.providerCalls }))
  }
} else {
  const authors = await Promise.all(plan.authors.map(async (row: any) => ({ id: row.id, ...await exists(path.join(jobDir(row), "delivery.json")) ? await json(path.join(jobDir(row), "delivery.json")) : { status: "not-dispatched" } })))
  const consumers = await Promise.all(plan.consumers.map(async (row: any) => ({ id: row.id, status: await exists(path.join(root, "consumers", row.id, "report.json")) ? (await json(path.join(root, "consumers", row.id, "report.json"))).status : "not-dispatched" })))
  const state = await json(path.join(root, "status.json"))
  const summary = { authorsPlanned: 12, consumersPlanned: 12, obligationsPlanned: 24, authors, consumers,
    authorUsage: aggregateUsage(state.paidDispatches.filter((item: any) => item.id.startsWith("author:")).map((item: any) => item.account)),
    consumerUsage: aggregateUsage(state.paidDispatches.filter((item: any) => item.id.startsWith("consumer:")).map((item: any) => item.account)), providerCallsThisCommand: 0, humanMinutes: null }
  await save(path.join(root, "author-use-summary.json"), summary)
  console.log(JSON.stringify({ authors: authors.length, firstValid: authors.filter((item: any) => item.firstValid).length, finalValid: authors.filter((item: any) => item.finalValid).length, consumers: consumers.length, providerCallsThisCommand: 0 }))
}
