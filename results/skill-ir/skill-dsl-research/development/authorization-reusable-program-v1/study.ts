import { mkdir, readFile, writeFile, copyFile, open, unlink, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, inspectLocalInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { admitPurpose, verifyPairBinding, observedUsageSummary } from "../authorization-recoverable-authoring-v1/study.ts"
import { classifyTerminalReport, measureAuthorTimeline, observedAccountCost } from "../authorization-authoring-loop-v1/measurement.ts"
import { verifyShareLink } from "../authorization-authoring-loop-v1/practical.ts"
import { runOffline, verifyPortableAndChangedSource } from "./offline.ts"
import { createCases, question } from "./cases.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), identity = "authorization-reusable-program-v1"
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
const ledgerFile = path.join(base, "attempts.json"), skillFile = path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md"), accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
const positions = ["A0", "A1", "C0", "B0", "B1", "C1", "C2", "S0"], order = ["C0", "B0", "B1", "C1"]
const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export function positionOptions(position: string) {
  if (!positions.includes(position)) throw new Error("Unknown BL purpose")
  return { author: ["A0", "A1", "S0"].includes(position), baseline: position.startsWith("B"), variant: ["A1", "C1", "B1"].includes(position) ? "empty-version" : position === "C2" ? "denied" : position === "S0" ? "source-change" : "root-default" }
}
async function sourceBinding(inputFile: string) {
  const input = await load(inputFile), root = path.resolve(path.dirname(inputFile), input.sourceRoot), files: Array<[string, string]> = []
  const visit = async (name: string) => { const file = path.join(root, name); if ((await stat(file)).isDirectory()) for (const child of (await readdir(file)).sort()) await visit(path.join(name, child)); else files.push([name.split(path.sep).join("/"), hash(await readFile(file))]) }
  for (const name of [...input.allowedPaths].sort()) await visit(name)
  return { source: hash(JSON.stringify({ ref: input.sourceRef, files })), skill: hash(await readFile(skillFile)), accountBoundary: hash(await readFile(accountBoundaryFile)) }
}
export async function prepare() {
  const seeds = []
  for (const variant of ["root-default", "empty-version", "denied", "root-fallback"]) {
    const file = path.join(repo, `examples/authorization-assessment/download-workflow/inputs/${variant}.json`), input = await load(file)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(file), input.sourceRoot)).split(path.sep).join("/")
    await save(path.join(base, `inputs/${variant}.json`), input); seeds.push(input)
  }
  const visible = createCases(seeds[0], seeds[1], seeds[2], seeds[3]).filter(c => ["root-default", "empty-version", "explicit-version", "denied"].includes(c.name)).map(c => ({ id: c.name, operationId: "document-download", resourceInputs: c.input.resourceInputs[question], externalAssumptions: c.input.externalAssumptions[question] }))
  for (const [variant, seed] of [["root-default", seeds[0]], ["empty-version", seeds[1]]] as const) {
    const input = structuredClone(seed)
    input.sourceNotes = { format: "markdown", text: "Additional development input instances for the same operation, available for author trial. These are finite facts only, not expected behavior or deployment facts. Read original source and use the public trial tool to inspect your own program.\n" + JSON.stringify(visible) }
    await save(path.join(base, `inputs/author-${variant}.json`), input)
  }
  await writeFile(ledgerFile, "[]\n", { encoding: "utf8", flag: "wx" }).catch(e => { if (e.code !== "EEXIST") throw e })
  await save(path.join(base, "configuration.json"), { identity, model: "gpt-5.6-sol", effort: "high", limits, programContext: "full", authoringTargetMode: "reusable", skill: relative(skillFile), accountBoundary: relative(accountBoundaryFile), allowedModelInputs: ["full original skill", "four original questions", "allowlisted source", "current and four development fact sets", "own raw and actual feedback"], excluded: ["taskbook", "evaluator expected", "historical answers", "developer program", "other author/consumer answers"], positions, comparisonOrder: order, actualUsd: null })
}
async function preflight() {
  await prepare()
  const inputFile = path.join(base, "inputs/author-root-default.json"), loaded = await loadInquiryInput(inputFile, { allowMissingPolicy: true })
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: base, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", authoringTargetMode: "reusable", ...limits })
  try {
    for (const name of ["authorization_program", "authorization_program_patch", "authorization_program_trial", "authorization_program_details"]) if (!runtime.definitions.some(t => t.name === name)) throw new Error(`Missing production tool ${name}`)
    if (runtime.report().sourceFiles.some(f => /evaluation|authoring|reference-program|taskbook/.test(f.path))) throw new Error("Source allowlist exposes private study material")
    const data = JSON.parse(loaded.value.sourceNotes!.text.split("\n").slice(1).join("\n"))
    if (data.length !== 4 || data.some((c: any) => Object.keys(c).some(k => !["id", "operationId", "resourceInputs", "externalAssumptions"].includes(k)))) throw new Error("Unexpected author fact fields")
    const prior = await load(path.resolve(base, "../authorization-recoverable-authoring-v1/attempts.json"))
    const unresolved = prior.filter((a: any) => a.status === "unknown")
    if (prior.some((a: any) => a.status === "running" || a.quotaOrAuth) || unresolved.some((a: any) => a.lifecycle?.localExecution !== "closed" || !a.reconciliation?.terminalStatus)) throw new Error("Prior account channel requires its recorded bounded disposition")
    const result = { identity, checkedAt: new Date().toISOString(), providerCalls: 0, targetExecutions: 0, originalQuestionIds: loaded.value.inquiry!.questions.map(q => q.id), sourceFiles: runtime.report().sourceFiles.length, tools: runtime.definitions.map(t => t.name), authorCaseIds: data.map((c: any) => c.id), evaluationExcluded: true, historicalUnknown: unresolved.map((a: any) => ({ purpose: a.position, originalStatus: a.status, localExecution: a.lifecycle.localExecution, laterReadonlyTerminal: a.reconciliation.terminalStatus, originalUnchanged: true, resent: false })), observation: { terminal: "completed", localExecution: "closed", reconciliation: "terminal-found", channel: "available", nextPurpose: "independent-task", independentAuthorized: true } }
    await save(path.join(base, "verification/preflight.json"), result); return result
  } finally { await runtime.close() }
}
async function run(position: string, attempt = "first") {
  const { author, baseline, variant } = positionOptions(position), ledger: any[] = await load(ledgerFile), admission = await load(path.join(base, "verification/preflight.json"))
  const decision = admitPurpose(ledger, admission.observation)
  if (!decision.allowNewTurn) throw new Error(JSON.stringify(decision))
  if (!/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("Duplicate or invalid attempt; never resend")
  const repairs: any[] = await load(path.join(base, "repairs.json")).catch(() => []), repair = repairs.find(r => r.position === position && r.attempt === attempt)
  if (attempt !== "first" && (!repair?.cause || !repair?.evidence || !repair?.uniqueConfirmation || ledger.filter(e => e.repairCause).length >= 3 || ledger.some(e => e.repairCause === repair.cause))) throw new Error("Named shared-root confirmation required; at most three distinct causes")
  const selection = await load(path.join(base, "authoring/frozen-selection.json")).catch(() => undefined)
  if (position !== "A0" && !selection) throw new Error("Current runnable automatic A0 required")
  const index = order.indexOf(position)
  if (index > 0 && !ledger.some(e => e.position === order[index - 1] && e.status !== "running")) throw new Error("Registered pair order required")
  const inputFile = position === "S0" ? path.join(base, "verification/source-change/package/input.json") : path.join(base, `inputs/${author ? "author-" : ""}${variant}.json`)
  const domainProgramFile = author || baseline ? undefined : path.join(base, "authoring/automatic-program.json")
  if (domainProgramFile && hash(await readFile(domainProgramFile)) !== selection.programSha256) throw new Error("Selected bytes changed")
  const c0 = ledger.find(e => e.position === "C0" && e.status === "completed"), previous = repair?.previous ? path.resolve(repo, repair.previous) : ["C1", "S0"].includes(position) && c0?.session ? path.resolve(repo, c0.session) : undefined
  if (["C1", "S0"].includes(position) && !previous) throw new Error("Eligible C0 session required")
  if (repair?.resumeAuthorThread && (!author || !ledger.some(e => e.position === position && e.session === repair.previous && e.status === "completed"))) throw new Error("Only own known author may resume")
  const output = path.join(base, "runs", `${position}-${attempt}`); await mkdir(output, { recursive: true })
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), pid: process.pid, model: "gpt-5.6-sol", effort: "high", variant, programMode: author ? "edit" : "consume", authoringTargetMode: author ? "reusable" : undefined, programContext: "full", input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), previous: previous && relative(previous), program: domainProgramFile && relative(domainProgramFile), programSha256: domainProgramFile ? selection.programSha256 : undefined, limits, admission: decision, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src")) }, actualUsd: null, binding: await sourceBinding(inputFile), repairCause: repair?.cause }
  const pair = position === "B0" ? "C0" : position === "C1" ? "B1" : undefined
  if (pair) verifyPairBinding(ledger.find(e => e.position === pair && e.attempt === "first"), entry)
  const leasePath = path.join(output, "local-owner.json"), lease = await open(leasePath, "wx"); await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt, output })); await lease.close()
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ purpose: position, attempt, resumeAuthorThread: repair?.resumeAuthorThread, inputFile, domainProgramFile, outDir: output, model: entry.model, method: "D1", strategy: baseline ? "legacy" : "question-checked-v1", harness: "codex-account", domainTools: !baseline, programMode: entry.programMode, authoringTargetMode: entry.authoringTargetMode, executionPolicy: "progressive", programContext: "full", previous, accountBoundaryFile, skillFile, execution: { ...limits, maxAuthorContinuations: ["A0", "A1"].includes(position) ? 2 : 0 } })
    const account = report.telemetry?.account, resource = report.domain?.executableContract?.resourceExecution
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, deliveryStatus: report.delivery?.status, durationMs: report.durationMs, lifecycle: account?.lifecycle, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), authorContinuation: account?.authorContinuation, trialBatches: report.domain?.programDraft?.trials?.length ?? 0, resourceSteps: report.domain?.executableContract?.program?.resourceWorkflow?.steps?.length ?? 0, returned: resource?.returned, termination: resource?.termination, transportFailure: /child-exit|send-failed|rpc-error|timeout|routing/i.test(account?.reason ?? "") })
    if (report.sessionPath) {
      const raw = await load(path.join(report.sessionPath, "run.json")); await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(raw))
      await save(path.join(base, `evaluation/delivery-${position}-${attempt}.json`), { delivery: report.delivery, trials: report.domain?.programDraft?.trials, transmission: raw.native?.transmissionAccounting })
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true }); await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      for (const [i, t] of (account?.turns ?? []).entries()) await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}-turn-${i + 1}.txt`), t.text, "utf8")
      const proposals = raw.native?.history.filter((h: any) => ["authorization_program", "authorization_program_patch"].includes(h.call.name) && h.output.executableContract?.adoptedDraft)
      if (author && proposals?.length) await save(path.join(base, `authoring/first-program-${position}-${attempt}.json`), proposals[0].output.executableContract.adoptedDraft.raw)
    }
    if (author && report.domain) { await save(path.join(base, `authoring/${position}-${attempt}-process.json`), report.domain); const adopted = report.domain.executableContract?.adoptedDraft; if (adopted?.raw?.resourceWorkflow?.steps?.length) await save(path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), adopted.raw) }
    console.log(JSON.stringify(entry))
  } catch (error) { Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), localExecution: "closed", noAutomaticResend: true }); throw error }
  finally { await save(ledgerFile, ledger); await unlink(leasePath) }
}
async function freeze(attempt = "first") {
  const ledger: any[] = await load(ledgerFile); if (ledger.some(e => e.position.startsWith("C"))) throw new Error("Consumer selection already fixed")
  const selected = ledger.find(e => e.position === "A0" && e.attempt === attempt && e.status === "completed"); if (!selected) throw new Error("Known completed A0 required")
  const inspected: any = await inspectLocalInquiry(path.resolve(repo, selected.session)), adopted = inspected.domain.executableContract.adoptedDraft, file = path.join(base, `authoring/automatic-program-A0-${attempt}.json`), bytes = await readFile(file)
  if (JSON.stringify(JSON.parse(bytes.toString("utf8"))) !== JSON.stringify(adopted.raw)) throw new Error("Raw program differs from model original")
  await copyFile(file, path.join(base, "authoring/automatic-program.json")); await save(path.join(base, "authoring/frozen-selection.json"), { position: "A0", attempt, session: selected.session, rawRevision: adopted.revision, programSha256: hash(bytes), developerSemanticEdits: false, selectedBeforeConsumers: true })
}
async function summarize() {
  const attempts: any[] = await load(ledgerFile), state = await load(path.join(base, "status.json")), matrix = await load(path.join(base, "evaluation/selected/variation-matrix.json")).catch(() => null)
  const result = { identity, updatedAt: new Date().toISOString(), attempts, ...observedUsageSummary(attempts), observedTurns: attempts.reduce((n, a) => n + (a.turns?.filter((t: any) => t.inferenceDispatched).length ?? 0), 0), active: attempts.filter(a => a.status === "running").length, finiteQueueComplete: positions.every(p => attempts.some(a => a.position === p && a.status !== "running")), engineeringComplete: state.engineeringComplete, automaticProgramComplete: state.automaticProgramComplete ?? false, researchGoalAchieved: false, matrix: matrix && { variants: matrix.variants, programSha256: matrix.programSha256, exactShapeFiniteMatches: matrix.exactShapeFiniteMatches, semanticFieldAssessment: matrix.semanticFieldAssessment }, targetExecutions: 0, quality: await load(path.join(base, "evaluation/quality.json")).catch(() => null), comparison: await load(path.join(base, "evaluation/comparison.json")).catch(() => null) }
  await save(path.join(base, "summary.json"), result); return result
}
async function verify() {
  const summary = await summarize(); if (summary.active) throw new Error("Active owned attempt")
  if (new Set(summary.attempts.map(a => `${a.position}/${a.attempt}`)).size !== summary.attempts.length) throw new Error("Duplicate identity")
  for (const a of summary.attempts.filter(a => a.session)) { const r: any = await inspectLocalInquiry(path.resolve(repo, a.session)); if (r.telemetry?.account?.lifecycle?.localExecution !== "closed") throw new Error("Unconfirmed local closure") }
  const selected = await load(path.join(base, "authoring/frozen-selection.json")).catch(() => null)
  if (selected && (hash(await readFile(path.join(base, "authoring/automatic-program.json"))) !== selected.programSha256 || summary.matrix?.variants !== 18)) throw new Error("Selected bytes or current matrix incomplete")
  const result = { checkedAt: new Date().toISOString(), attempts: summary.attempts.length, archivesVerified: true, active: 0, researchGoalAchieved: false }; await save(path.join(base, "verification/study-integrity.json"), result); return result
}
if (import.meta.main) {
  const [command, position, attempt] = process.argv.slice(2)
  if (command === "prepare") await prepare()
  else if (command === "preflight") console.log(JSON.stringify(await preflight()))
  else if (command === "run") await run(position!, attempt)
  else if (command === "freeze") await freeze(position)
  else if (command === "status") console.log(JSON.stringify(await load(ledgerFile), null, 2))
  else if (command === "offline") { const result = await runOffline(position && path.resolve(repo, position), attempt ?? "selected"); if (!position) await verifyPortableAndChangedSource(); console.log(JSON.stringify({ variants: result.variants, providerCalls: 0 })) }
  else if (command === "sharelink") await verifyShareLink(base)
  else if (command === "summarize") console.log(JSON.stringify(await summarize()))
  else if (command === "verify") console.log(JSON.stringify(await verify()))
  else throw new Error("Use prepare | preflight | status | run <purpose> <attempt> | freeze <A0-attempt> | offline [program track] | summarize | verify")
}
