import { mkdir, readFile, writeFile, copyFile, open, unlink, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { executeLocalInquiryRun, inspectLocalInquiry, checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { renderProgramRuleDocument } from "../../../../../src/task-dsl/authorization/program-rule-document.ts"
import { admitPurpose, verifyPairBinding, observedUsageSummary } from "../authorization-recoverable-authoring-v1/study.ts"
import { classifyTerminalReport, measureAuthorTimeline, observedAccountCost } from "../authorization-authoring-loop-v1/measurement.ts"
import { createCases, question } from "../authorization-reusable-program-v1/cases.ts"
import { createTraceCases } from "../authorization-purpose-scoped-program-v1/trace-cases.ts"
import { sourceDownloadOracle } from "../authorization-authoring-loop-v1/evaluation/source-oracle.ts"
import { positions, panelOrder, profiles, positionOptions, limits, rubric, summarizeQuality } from "./panel.ts"
export const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), identity = "authorization-quality-evidence-v1"
export const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
export const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
const ledgerFile = path.join(base, "attempts.json"), skillFile = path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md"), accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
export const boRaw = path.resolve(base, "../authorization-call-semantics-v1/authoring/automatic-program.json")
const fixedFile = (share = false) => path.join(base, `authoring/${share ? "sharelink-" : ""}automatic-program.json`)
const selectionFile = (share = false) => path.join(base, `authoring/${share ? "sharelink-" : ""}frozen-selection.json`)
export function verifyRegisteredPairBinding(previous: any, current: any, transitions: any[]) {
  if (previous.codeEpoch?.sourceTree === current.codeEpoch?.sourceTree) {
    verifyPairBinding(previous, current)
    return { sameEpoch: true, causalComparisonEligible: true }
  }
  const transition = transitions.find(t => t.fromSourceTree === previous.codeEpoch?.sourceTree && t.toSourceTree === current.codeEpoch?.sourceTree && t.reason && t.evidence)
  if (!transition) throw new Error("pair-binding-unregistered-epoch-transition")
  // Only the explicitly recorded implementation tree may differ. Inputs,
  // model, source, budget and clean working-tree state retain strict binding.
  verifyPairBinding(previous, { ...current, codeEpoch: { ...current.codeEpoch, sourceTree: previous.codeEpoch.sourceTree } })
  return { sameEpoch: false, causalComparisonEligible: false, transition }
}
async function sourceBinding(inputFile: string) {
  const input = await load(inputFile), root = path.resolve(path.dirname(inputFile), input.sourceRoot), files: Array<[string, string]> = []
  const visit = async (name: string) => { const file = path.join(root, name); if ((await stat(file)).isDirectory()) for (const child of (await readdir(file)).sort()) await visit(path.join(name, child)); else files.push([name.split(path.sep).join("/"), hash(await readFile(file))]) }
  for (const name of [...input.allowedPaths].sort()) await visit(name)
  return { source: hash(JSON.stringify({ ref: input.sourceRef, files })), skill: hash(await readFile(skillFile)), accountBoundary: hash(await readFile(accountBoundaryFile)) }
}
async function once(file: string, value: unknown) {
  const old = await load(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; return undefined })
  if (old !== undefined) { if (!isDeepStrictEqual(old, value)) throw new Error(`Registered bytes would change: ${relative(file)}`); return }
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
}
export async function prepare() {
  const registrationFile = path.join(base, "registration.json"), existing = await load(registrationFile).catch(() => undefined)
  if (existing) { for (const [file, digest] of Object.entries(existing.files)) if (hash(await readFile(path.join(base, file))) !== digest) throw new Error(`Preregistered file changed: ${file}`); return existing }
  if ((await load(ledgerFile)).length) throw new Error("Cannot prepare after first attempt")
  const seeds: any[] = [], registered: string[] = []
  const register = async (name: string, value: unknown) => { await once(path.join(base, name), value); registered.push(name) }
  for (const variant of ["root-default", "empty-version", "denied", "root-fallback"]) {
    const file = path.join(repo, `examples/authorization-assessment/download-workflow/inputs/${variant}.json`), input = await load(file)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(file), input.sourceRoot)).split(path.sep).join("/")
    seeds.push(input)
  }
  const historical = createCases(...seeds as [any, any, any, any]), traces = createTraceCases(seeds[0])
  const commonNote = "These are finite development facts at the local Download/helper entry, not actual deployment observations or proof that the HTTP request passed upstream admission. Analyze all four original questions and all relevant source branches. Any external assumption states only its named finite result; unspecified facts remain unspecified."
  const inputs: Record<string, any> = {}
  for (const name of profiles) {
    const input = structuredClone([...historical, ...traces].find(c => c.name === name)!.input)
    if (name === "no-external") { input.resourceInputs[question].documents.find((d: any) => d.id === input.resourceInputs[question].request.pk).owner_id = 9; input.externalAssumptions[question] = [] }
    input.sourceNotes = { format: "markdown", text: commonNote + (name === "anonymous-skip-checker" ? " Here actor=null is a hypothetical local-entry fact, not a claim that an anonymous HTTP request can reach this handler." : "") }
    inputs[name] = input; await register(`inputs/${name}.json`, input)
  }
  const visible = historical.filter(c => ["root-default", "empty-version", "explicit-version", "denied"].includes(c.name)).map(c => ({ id: c.name, operationId: "document-download", resourceInputs: c.input.resourceInputs[question], externalAssumptions: c.input.externalAssumptions[question] }))
  const author = structuredClone(inputs["root-default"])
  author.sourceNotes.text += "\nAdditional same-operation finite input examples for independent source authoring and your own trials; no expected results:\n" + JSON.stringify(visible)
  await register("inputs/author-root-default.json", author)
  const shareFile = path.join(repo, "examples/authorization-assessment/share-create-workflow/inputs/allowed.json"), share = await load(shareFile)
  share.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(shareFile), share.sourceRoot)).split(path.sep).join("/")
  await register("inputs/sharelink.json", share)
  const perturbations = historical.filter(c => ["renamed-and-reordered", "reordered", "unrelated-document", "explicit-false", "explicit-false-absent"].includes(c.name))
  const missing = structuredClone(inputs["root-default"]); delete missing.resourceInputs[question].request.version
  perturbations.push({ name: "version-key-absent", input: missing })
  const constructorNone = structuredClone(inputs["root-default"]); constructorNone.externalAssumptions[question][0].value = null
  perturbations.push({ name: "constructor-normal-none", input: constructorNone })
  await register("evaluation/preregistered-perturbations.json", { prospectiveOrHeldOut: false, cases: perturbations })
  await register("evaluation/rubric.json", rubric)
  await register("evaluation/profile-expectations.json", Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, sourceDownloadOracle(input.resourceInputs[question], input.externalAssumptions[question])])) )
  await register("configuration.json", { identity, model: "gpt-5.6-sol", effort: "high", limits, maxAuthorContinuations: 2, programContext: "directed", positions, panelOrder, skill: relative(skillFile), accountBoundary: relative(accountBoundaryFile), sameNaturalDelivery: true, allowed: ["complete original skill", "original questions", "allowlisted source", "common facts", "own raw and public feedback", "A0 BO fixed raw only"], excluded: ["evaluation", "taskbook", "other answers", "developer reference"], actualUsd: null })
  const registration = { identity, preparedAt: new Date().toISOString(), beforeFirstAuthor: true, files: Object.fromEntries(await Promise.all(registered.map(async f => [f, hash(await readFile(path.join(base, f)))]))), downloadBinding: await sourceBinding(path.join(base, "inputs/root-default.json")), sharelinkBinding: await sourceBinding(path.join(base, "inputs/sharelink.json")), originalBO: { file: relative(boRaw), sha256: hash(await readFile(boRaw)) }, plannedPositions: positions }
  await once(registrationFile, registration); return registration
}
export async function preflight() {
  const registration = await prepare(), prior: any[] = await load(path.resolve(base, "../authorization-call-semantics-v1/attempts.json"))
  if (prior.some(a => ["running", "unknown"].includes(a.status) || a.quotaOrAuth || a.lifecycle?.localExecution !== "closed")) throw new Error("Prior BO channel not confirmed closed")
  const views: any = {}
  for (const support of ["baseline", "rules", "execute"] as const) {
    const baseline = support === "baseline"
    const runtime = await createNativeInquiryRuntime({ sourceStructure: true, inputFile: path.join(base, "inputs/root-default.json"), domainProgramFile: baseline ? undefined : boRaw, workDir: base, domainTools: !baseline, method: "M", strategy: baseline ? "legacy" : "question-checked-v1", programMode: "consume", programContext: "directed", programSupport: baseline ? undefined : support, executionPolicy: "progressive", ...limits })
    try { const context: any = await runtime.accountContext(false); views[support] = { document: context.ruleDocument, tools: runtime.definitions.map(t => t.name), sourceTools: runtime.definitions.filter(t => t.name.startsWith("source_")), sourceFiles: runtime.report().sourceFiles }; if (support === "rules" && /"(?:resourceExecution|outcome|events|returned|propertyChecks)":/.test(JSON.stringify(context))) throw new Error("Rules result leakage") } finally { await runtime.close() }
  }
  if (!isDeepStrictEqual(views.rules.document, views.execute.document) || !isDeepStrictEqual(views.rules.sourceFiles, views.execute.sourceFiles)) throw new Error("Rules/execution shared material mismatch")
  for (const support of ["rules", "execute"]) if (!isDeepStrictEqual(views.baseline.sourceTools, views[support].sourceTools) || !isDeepStrictEqual(views.baseline.sourceFiles, views[support].sourceFiles)) throw new Error("Baseline source capability mismatch")
  const result = { identity, checkedAt: new Date().toISOString(), providerCalls: 0, targetExecutions: 0, registrationSha256: hash(await readFile(path.join(base, "registration.json"))), sharedRuleSha256: hash(JSON.stringify(views.rules.document)), views: { sourceStructure: true, baselineTools: views.baseline.tools, rulesTools: views.rules.tools, executeTools: views.execute.tools, identicalSourceDefinitions: true, identicalSourceFiles: true }, originalBOUnchanged: registration.originalBO.sha256 === hash(await readFile(boRaw)), observation: { terminal: "completed", localExecution: "closed", reconciliation: "terminal-found", channel: "available", nextPurpose: "independent-task", independentAuthorized: true } }
  await save(path.join(base, "verification/preflight.json"), result); return result
}
export function admitRegisteredPurpose(ledger: any[], observation: Parameters<typeof admitPurpose>[1], reset?: { userAuthorization: string; authorizedAt: string; covered: Array<{ position: string; attempt: string; session: string }> }) {
  const covered = reset?.userAuthorization?.trim() && reset.authorizedAt ? reset.covered : []
  const admissionLedger = ledger.map(entry => entry.quotaOrAuth && entry.status === "failed" && entry.terminalStatus === "failed" && entry.lifecycle?.localExecution === "closed" && covered.some(item => item.position === entry.position && item.attempt === entry.attempt && item.session === entry.session)
    ? { ...entry, quotaOrAuth: false } : entry)
  return { ...admitPurpose(admissionLedger, observation), quotaReset: admissionLedger.some((entry, index) => entry !== ledger[index]) ? reset : undefined }
}
export async function run(position: string, attempt: string) {
  const options = positionOptions(position), ledger: any[] = await load(ledgerFile), admission = await load(path.join(base, "verification/preflight.json"))
  await prepare()
  if (git("status", "--porcelain", "--", "src")) throw new Error("Commit tested production epoch before real calls")
  const reset = await load(path.join(base, "verification/quota-reset.json")).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return undefined })
  const decision = admitRegisteredPurpose(ledger, admission.observation, reset)
  if (!decision.allowNewTurn) throw new Error(JSON.stringify(decision))
  if (!attempt || !/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("Explicit unique attempt required; never resend")
  const repairs: any[] = await load(path.join(base, "repairs.json")).catch(() => []), repair = repairs.find(r => r.position === position && r.attempt === attempt)
  if (attempt !== "first" && (!repair?.cause || !repair?.evidence || !repair?.uniqueConfirmation || ledger.filter(e => e.repairCause).length >= 6 || ledger.filter(e => e.repairCause === repair.cause).length >= 2)) throw new Error("Named repair allowance exceeded or missing evidence")
  const share = position.startsWith("T-"), selection = await load(selectionFile(share)).catch(() => undefined), needsRaw = !["A0", "A1", "A2", "T-A0"].includes(position) && !options.baseline
  if (needsRaw && !selection) throw new Error("Missing fixed current automatic raw; record missing-artifact disposition")
  const index = panelOrder.indexOf(position)
  if (index > 0 && !ledger.some(e => e.position === panelOrder[index - 1] && e.status !== "running") && !(await load(path.join(base, "status.json"))).dispositions?.[panelOrder[index - 1]!]) throw new Error("Registered panel order required")
  const inputFile = position.startsWith("S-") ? path.join(base, "verification/source-change/package/input.json") : path.join(base, `inputs/${options.author && !share ? "author-" : ""}${options.variant}.json`)
  const domainProgramFile = position === "A0" ? boRaw : needsRaw ? fixedFile(share) : undefined
  if (needsRaw && hash(await readFile(domainProgramFile!)) !== selection.programSha256) throw new Error("Fixed model raw changed")
  if (repair?.previous && !ledger.some(e => e.position === position && e.session === repair.previous && e.lifecycle?.localExecution === "closed" && e.terminalStatus === "completed")) throw new Error("Repair can restore only its own known closed purpose")
  const output = path.join(base, "runs", `${position}-${attempt}`), entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), pid: process.pid, model: "gpt-5.6-sol", effort: "high", ...options, programMode: options.author ? "edit" : "consume", input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), program: domainProgramFile && relative(domainProgramFile), programSha256: domainProgramFile && hash(await readFile(domainProgramFile)), limits, admission: decision, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src")) }, actualUsd: null, binding: await sourceBinding(inputFile), repairCause: repair?.cause }
  if (index >= 0) {
    const match = /^(Q\d)-R\d-(\d)$/.exec(position)!, siblings = ledger.filter(e => e.attempt === "first" && new RegExp(`^${match[1]}-R\\d-${match[2]}$`).test(e.position))
    const transitions = await load(path.join(base, "implementation-transitions.json")).catch(() => [])
    entry.pairBindings = siblings.map(other => ({ position: other.position, attempt: other.attempt, ...verifyRegisteredPairBinding(other, entry, transitions) }))
  }
  await mkdir(output, { recursive: true }); const leasePath = path.join(output, "local-owner.json"), lease = await open(leasePath, "wx"); await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt })); await lease.close()
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ sourceStructure: true, purpose: position, attempt, inputFile, domainProgramFile, outDir: output, model: entry.model, method: "D1", strategy: options.baseline ? "legacy" : "question-checked-v1", harness: "codex-account", domainTools: !options.baseline, programMode: entry.programMode, programSupport: options.baseline ? undefined : options.programSupport, authoringTargetMode: options.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", previous: repair?.previous && path.resolve(repo, repair.previous), resumeAuthorThread: repair?.resumeAuthorThread, accountBoundaryFile, skillFile, execution: { ...limits, maxAuthorContinuations: options.author ? 2 : 0 } })
    const account = report.telemetry?.account, contract = report.domain?.executableContract
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, deliveryStatus: report.delivery?.status, durationMs: report.durationMs, lifecycle: account?.lifecycle, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), authorContinuation: account?.authorContinuation, resourceSteps: contract?.program?.resourceWorkflow?.steps?.length ?? report.domain?.programDraft?.currentDraft?.raw?.resourceWorkflow?.steps?.length ?? 0, transportFailure: /child-exit|send-failed|rpc-error|timeout|routing/i.test(account?.reason ?? ""), reason: account?.reason ?? report.diagnostics })
    if (report.sessionPath) {
      const raw = await load(path.join(report.sessionPath, "run.json")); await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(raw))
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true }); await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}-first.txt`), typeof account?.firstAnswer?.answer === "string" ? account.firstAnswer.answer : "", "utf8")
      for (const [i, t] of (account?.turns ?? []).entries()) await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}-turn-${i + 1}.txt`), t.text ?? "", "utf8")
      const proposals = raw.native?.history.filter((h: any) => ["authorization_program", "authorization_program_patch"].includes(h.call.name)) ?? []
      if (options.author) {
        await save(path.join(base, `authoring/${position}-${attempt}-proposals.json`), proposals)
        const first = proposals.find((h: any) => h.output.currentDraft?.raw || h.output.ruleDocument)?.output
        if (first?.currentDraft?.raw) await save(path.join(base, `authoring/first-program-${position}-${attempt}.json`), first.currentDraft.raw)
        else if (first?.ruleDocument?.markdown) {
          const markdown: string = first.ruleDocument.markdown, start = markdown.lastIndexOf("\n```json\n"), end = markdown.lastIndexOf("\n```")
          if (start < 0 || end <= start) throw new Error("Complete raw missing from rules archive")
          await save(path.join(base, `authoring/first-program-${position}-${attempt}.json`), JSON.parse(markdown.slice(start + 9, end)))
        }
      }
    }
    if (options.author && report.domain) { await save(path.join(base, `authoring/${position}-${attempt}-process.json`), report.domain); const raw = options.programSupport === "rules" ? report.domain.programDraft?.currentDraft?.raw : contract?.adoptedDraft?.raw; if (raw?.resourceWorkflow?.steps?.length) await save(path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), raw) }
    return { position, attempt, status: entry.status, session: entry.session, terminalStatus: entry.terminalStatus, answerDelivery: entry.answerDelivery, durationMs: entry.durationMs, usage: entry.usage, resourceSteps: entry.resourceSteps, reason: entry.reason }
  } catch (error) { Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), localExecution: "closed", noAutomaticResend: true }); throw error }
  finally { await save(ledgerFile, ledger); await unlink(leasePath) }
}
export async function freeze(position: string, attempt: string) {
  if (!["A0", "T-A0"].includes(position) || !attempt) throw new Error("freeze requires A0|T-A0 and exact attempt")
  const share = position === "T-A0", ledger: any[] = await load(ledgerFile)
  if (ledger.some(e => share ? /^T-R/.test(e.position) : /^Q/.test(e.position))) throw new Error("Selection already consumed")
  const selected = ledger.find(e => e.position === position && e.attempt === attempt && e.lifecycle?.localExecution === "closed" && ["completed", "interrupted"].includes(e.terminalStatus))
  if (!selected?.session) throw new Error("No known closed author session")
  const inspected: any = await inspectLocalInquiry(path.resolve(repo, selected.session)), adopted = inspected.domain?.executableContract?.adoptedDraft
  if (!adopted?.raw?.resourceWorkflow?.steps?.length || inspected.domain.executableContract.status !== "current") throw new Error("No current adopted automatic raw")
  const file = path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), bytes = await readFile(file)
  if (!isDeepStrictEqual(JSON.parse(bytes.toString("utf8")), adopted.raw)) throw new Error("Original model raw mismatch")
  await once(selectionFile(share), { position, attempt, session: selected.session, rawRevision: adopted.revision, programSha256: hash(bytes), developerSemanticEdits: false, selectedBeforeConsumers: true })
  await writeFile(fixedFile(share), bytes, { flag: "wx" }).catch(async e => { if (e.code !== "EEXIST" || hash(await readFile(fixedFile(share))) !== hash(bytes)) throw e })
  await once(path.join(base, `authoring/${share ? "sharelink-" : ""}rule-document.json`), renderProgramRuleDocument(adopted.raw))
  return load(selectionFile(share))
}
export function qualityPairIdentity(entry: any) {
  const values = [entry.codeEpoch?.sourceTree, entry.codeEpoch?.sourceDiffSha256, entry.model, entry.effort, entry.inputSha256, entry.limits, entry.binding?.source, entry.binding?.skill, entry.binding?.accountBoundary]
  return values.some(value => value === undefined || value === null) ? undefined : hash(JSON.stringify(values))
}
export async function summarize() {
  const attempts: any[] = await load(ledgerFile), state = await load(path.join(base, "status.json")), reviews = await load(path.join(base, "evaluation/quality-reviews.json")).catch(() => undefined)
  const firstReviews = await load(path.join(base, "evaluation/first-quality-reviews.json")).catch(() => undefined)
  const sourceEpochs = Object.fromEntries(attempts.filter(a => a.attempt === "first").map(a => [a.position, qualityPairIdentity(a)]))
  const summary = { identity, updatedAt: new Date().toISOString(), attempts, ...observedUsageSummary(attempts), observedTurns: attempts.reduce((n, a) => n + (a.turns?.filter((t: any) => t.inferenceDispatched).length ?? 0), 0), active: attempts.filter(a => a.status === "running").length, finiteQueueComplete: positions.every(p => attempts.some(a => a.position === p && a.status !== "running") || state.dispositions?.[p]?.status === "not-run"), engineeringComplete: state.engineeringComplete, automaticProgramComplete: state.automaticProgramComplete ?? false, quality: reviews ? summarizeQuality(reviews, sourceEpochs) : null, targetExecutions: 0, researchGoalAchieved: false }
  Object.assign(summary, { firstQuality: firstReviews ? summarizeQuality(firstReviews, sourceEpochs) : null, costGroups: Object.fromEntries(["A", "R0", "R1", "R2", "S", "T"].map(group => [group, observedUsageSummary(attempts.filter(a => group.startsWith("R") ? a.position.startsWith("Q") && a.position.includes(group) : a.position.startsWith(group)))])) })
  await save(path.join(base, "accounting.json"), { identity, knownExperimentalUsage: summary.knownUsage, experimentalAttempts: attempts.length, activeAttempts: summary.active, usageUnknownAttempts: summary.usageUnknownAttempts, cacheIncludedInInput: true, actualUsd: null, developmentAndReviewerCost: null, humanMinutes: null, hiddenRequests: null, historicalUnknownUnchanged: true })
  await save(path.join(base, "summary.json"), summary); return summary
}
export function verifyPartialArchive(entry: any, lifecycleBytes: string | Buffer, evidence: any) {
  if (entry.lifecycle?.persistence !== "partial" || entry.lifecycle?.localExecution !== "closed") throw new Error("Partial archive must be locally closed")
  if (hash(lifecycleBytes) !== entry.reconciliation?.lifecycleSha256) throw new Error("Partial lifecycle digest mismatch")
  if (evidence.threadId !== entry.lifecycle.threadId || evidence.turnId !== entry.lifecycle.turnId) throw new Error("Readonly reconciliation identity mismatch")
  const terminal = evidence.events?.filter((e: any) => e.direction === "server").flatMap((e: any) => e.result?.thread?.id === evidence.threadId ? e.result.thread.turns ?? [] : []).find((t: any) => t.id === evidence.turnId)?.status
  if (evidence.status !== "terminal-found" || !["completed", "interrupted", "failed"].includes(terminal) || terminal !== evidence.terminalStatus || terminal !== entry.reconciliation?.terminalStatus) throw new Error("Readonly terminal evidence missing or inconsistent")
  if (evidence.events?.some((e: any) => e.direction === "client" && !["initialize", "thread/read"].includes(e.method))) throw new Error("Reconciliation was not readonly")
  return { completeArchive: false, retainedLifecycleVerified: true, reconciledTerminal: terminal, originalTerminal: entry.terminalStatus, finalUsageUnknown: entry.reconciliation.finalUsageUnknown === true }
}
export async function verify() {
  await prepare(); const summary = await summarize()
  if (summary.active || new Set(summary.attempts.map(a => `${a.position}/${a.attempt}`)).size !== summary.attempts.length) throw new Error("Active or duplicate identity")
  const archives = []
  for (const a of summary.attempts.filter(a => a.session)) {
    if (a.lifecycle?.persistence === "partial") {
      const evidence = await load(path.join(base, a.reconciliation.readonlyEvidence))
      archives.push({ position: a.position, attempt: a.attempt, ...verifyPartialArchive(a, await readFile(path.resolve(repo, a.session, "raw/lifecycle.jsonl")), evidence) })
    } else { await inspectLocalInquiry(path.resolve(repo, a.session)); archives.push({ position: a.position, attempt: a.attempt, completeArchive: true }) }
  }
  for (const share of [false, true]) { const selection = await load(selectionFile(share)).catch(() => undefined); if (selection && hash(await readFile(fixedFile(share))) !== selection.programSha256) throw new Error("Selected raw changed") }
  const result = { checkedAt: new Date().toISOString(), attempts: summary.attempts.length, archives, completeArchives: archives.filter(a => a.completeArchive).length, reconciledPartialArchives: archives.filter(a => !a.completeArchive).length, active: 0, researchGoalAchieved: false }; await save(path.join(base, "verification/study-integrity.json"), result); return result
}
if (import.meta.main) {
  const [command, position, attempt] = process.argv.slice(2)
  if (command === "prepare") console.log(JSON.stringify(await prepare()))
  else if (command === "preflight") console.log(JSON.stringify(await preflight()))
  else if (command === "run") console.log(JSON.stringify(await run(position!, attempt!)))
  else if (command === "freeze") console.log(JSON.stringify(await freeze(position!, attempt!)))
  else if (command === "status") console.log(JSON.stringify(await load(ledgerFile), null, 2))
  else if (command === "offline") { const { offline } = await import("./offline.ts"); console.log(JSON.stringify(await offline(position, attempt))) }
  else if (command === "summarize") console.log(JSON.stringify(await summarize()))
  else if (command === "verify") console.log(JSON.stringify(await verify()))
  else throw new Error("Use prepare | preflight | status | run <purpose> <attempt> | freeze <A0|T-A0> <attempt> | offline [file track] | summarize | verify")
}
