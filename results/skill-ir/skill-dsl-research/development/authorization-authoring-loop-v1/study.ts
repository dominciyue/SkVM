import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { classifyTerminalReport, measureAuthorTimeline, observedAccountCost } from "./measurement.ts"
import { runOfflineMatrix } from "./offline.ts"
import { verifyMovedPackage, verifySourceChange, verifyShareLink } from "./practical.ts"
import { writeStudySummary } from "./summarize.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), example = path.join(repo, "examples/authorization-assessment/download-workflow")
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
const ledgerFile = path.join(base, "attempts.json")
const skillFile = path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md")
const accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
const r0Previous = path.resolve(base, "../authorization-authoring-closure-v1/runs/A2-first/sessions/2026-10-12T181721815Z-555d11a4")
const positions = ["R0", "F0", "F1", "C0", "C1", "C2", "B0", "B1", "S0"]
const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }

async function prepare() {
  for (const variant of ["root-default", "empty-version", "denied", "root-fallback"]) {
    const original = path.join(example, `inputs/${variant}.json`), input = await load(original)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(original), input.sourceRoot)).split(path.sep).join("/")
    await save(path.join(base, `inputs/${variant}.json`), input)
  }
  await save(path.join(base, "configuration.json"), { identity: "authorization-authoring-loop-v1", model: "gpt-5.6-sol", effort: "high", harness: "codex-account", method: "D1", strategy: "question-checked-v1", executionPolicy: "progressive", programContext: "full", limits, skill: relative(skillFile), skillSha256: hash(await readFile(skillFile)), accountBoundary: relative(accountBoundaryFile), modelInputs: ["original skill", "four original questions", "allowed current source", "current scenario facts", "own restored draft for R0 or a named repair", "actual compiler and execution feedback"], excluded: ["evaluation", "reference program", "historical answers", "taskbook", "developer semantic corrections"], plannedComparisonOrder: ["C0", "B0", "B1", "C1"], actualUsd: null, hiddenRequests: null })
}
async function codeEpoch() {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
  const untracked = git("ls-files", "--others", "--exclude-standard", "--", "src").split(/\r?\n/).filter(Boolean)
  const newFiles = await Promise.all(untracked.map(async file => ({ path: file, sha256: hash(await readFile(path.join(repo, file))) })))
  return { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src") + JSON.stringify(newFiles)) }
}
async function run(position: string, attempt = "first") {
  if (!positions.includes(position)) throw new Error("Unknown BJ purpose")
  await prepare()
  const ledger: any[] = await load(ledgerFile)
  if (ledger.some(entry => ["running", "unknown", "timeout-unknown", "completion-unknown"].includes(entry.status))) throw new Error("Inspect the original unresolved lifecycle; never resend")
  if (ledger.some(entry => entry.position === position && entry.attempt === attempt)) throw new Error("Attempt already recorded")
  const failedRecoveries = ledger.filter(entry => entry.attempt.startsWith("routing-recovery-") && entry.routingFailure)
  const routingRecoveries = ledger.filter(entry => entry.attempt.startsWith("routing-recovery-"))
  if (ledger.some(entry => entry.quotaOrAuth) || failedRecoveries.length >= 3 || routingRecoveries.length >= 2 && routingRecoveries.slice(-2).every(entry => entry.routingFailure)) throw new Error("Official account channel paused by known failures")
  const repairs: any[] = await load(path.join(base, "repairs.json")).catch(() => [])
  const repair = repairs.find(entry => entry.position === position && entry.attempt === attempt)
  if (attempt !== "first" && (!/^(routing-recovery|shared-fix|source-repair)-[a-z0-9-]+$/.test(attempt) || !repair?.cause || !repair?.evidence)) throw new Error("A recovery requires a registered diagnosed cause and evidence")
  const author = ["R0", "F0", "F1", "S0"].includes(position), baseline = position.startsWith("B")
  const variant = repair?.variant ?? (["F1", "C1", "B1"].includes(position) ? "empty-version" : position === "C2" ? "denied" : position === "S0" ? "source-change" : "root-default")
  const inputFile = position === "S0" && !repair?.variant ? path.join(base, "verification/source-change/package/input.json") : path.join(base, `inputs/${variant}.json`)
  const domainProgramFile = author || baseline ? undefined : path.join(base, "authoring/automatic-program.json")
  const programBytes = domainProgramFile ? await readFile(domainProgramFile).catch(() => undefined) : undefined
  if (!author && !baseline && !programBytes) throw new Error("Freeze an actual automatic raw program before consumer dispatch")
  const c0 = [...ledger].reverse().find(entry => entry.position === "C0" && entry.status === "completed" && entry.session)
  const previous = repair?.previous ? path.resolve(repo, repair.previous) : position === "R0" ? r0Previous : position === "C1" ? c0?.session && path.resolve(repo, c0.session) : position === "S0" ? c0?.session && path.resolve(repo, c0.session) : undefined
  if (position === "S0" && !previous) throw new Error("Source-change repair needs an actual reusable consumer session")
  const frozen = domainProgramFile ? await load(path.join(base, "authoring/frozen-selection.json")) : undefined
  if (frozen && frozen.programSha256 !== hash(programBytes!)) throw new Error("Frozen automatic bytes changed")
  const entry: any = { position, attempt, purpose: position === "R0" ? "own-BI-A2-restored-author" : position.startsWith("F") && !repair ? "independent-fresh-author" : frozen?.position === "R0" ? "recovered-author-program-consumption" : author ? "author-repair" : baseline ? "original-skill-baseline" : "automatic-program-consumption", status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", programMode: author ? "edit" : "consume", programContext: "full", variant, input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), program: domainProgramFile && relative(domainProgramFile), programSha256: programBytes && hash(programBytes), previous: previous && relative(previous), skillSha256: hash(await readFile(skillFile)), codeEpoch: await codeEpoch(), originalQuestions: 4, limits, repair: repair && { cause: repair.cause, evidence: repair.evidence, feedbackTrack: repair.feedbackTrack }, command: `bun run ./${relative(path.join(base, "study.ts"))} run ${position} ${attempt}` }
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ inputFile, domainProgramFile, outDir: path.join(base, "runs", `${position}-${attempt}`), model: entry.model, method: "D1", strategy: "question-checked-v1", harness: "codex-account", domainTools: !baseline, programMode: entry.programMode, executionPolicy: "progressive", programContext: "full", ...(previous ? { previous } : {}), accountBoundaryFile, skillFile, execution: limits })
    const account = report.telemetry?.account, execution = report.domain?.executableContract?.resourceExecution
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, returned: execution?.returned, termination: execution?.termination, resourceSteps: report.domain?.executableContract?.program?.resourceWorkflow?.steps?.length ?? 0, authorLoop: report.domain?.programDraft?.authorLoop, sourceFilesSha256: report.sourceFiles && hash(JSON.stringify(report.sourceFiles)) })
    if (report.sessionPath) {
      const archived = await load(path.join(report.sessionPath, "run.json"))
      await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(archived))
    }
    if (author && report.domain) {
      await save(path.join(base, `authoring/${position}-${attempt}-process.json`), { session: entry.session, active: report.domain.executableContract, draft: report.domain.programDraft, proposals: report.domain.proposals })
      const adopted = report.domain.executableContract?.adoptedDraft
      if (adopted?.raw?.resourceWorkflow?.steps?.length) await save(path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), adopted.raw)
      if (report.domain.programDraft?.currentDraft) await save(path.join(base, `authoring/current-draft-${position}-${attempt}.json`), report.domain.programDraft.currentDraft)
    }
    await save(ledgerFile, ledger)
    console.log(JSON.stringify({ position, attempt, status: entry.status, terminalStatus: entry.terminalStatus, answerDelivery: entry.answerDelivery, session: entry.session, usage: entry.usage, durationMs: entry.durationMs, resourceSteps: entry.resourceSteps, returned: entry.returned, termination: entry.termination, firstDraftToolUnit: entry.authorLoop?.firstDraftToolUnit, patchCount: entry.authorLoop?.patchCount, quotaOrAuth: entry.quotaOrAuth, routingFailure: entry.routingFailure }))
  } catch (error) {
    Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), recovery: "Inspect this exact output directory and lifecycle before any dispatch" }); await save(ledgerFile, ledger); throw error
  }
}
async function freeze(position: string, attempt = "first") {
  if (!["R0", "F0"].includes(position)) throw new Error("Freeze F0's latest substantive raw revision, or label the R0 fallback")
  const ledger: any[] = await load(ledgerFile)
  if (ledger.some(entry => entry.position.startsWith("C") && entry.inferenceDispatched)) throw new Error("Selection is fixed before consumers")
  const selected = ledger.find(entry => entry.position === position && entry.attempt === attempt && entry.session)
  if (!selected) throw new Error("Actual author session unavailable")
  if (["running", "unknown", "timeout-unknown", "completion-unknown"].includes(selected.status)) throw new Error("Resolve the original author lifecycle before selecting its program")
  const source = path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), bytes = await readFile(source)
  const inspected = await inspectLocalInquiry(path.join(repo, selected.session)), adopted = inspected.domain.executableContract.adoptedDraft
  if (JSON.stringify(JSON.parse(bytes.toString("utf8"))) !== JSON.stringify(adopted.raw)) throw new Error("Automatic export differs from actual adopted raw proposal")
  await copyFile(source, path.join(base, "authoring/automatic-program.json"))
  await save(path.join(base, "authoring/frozen-selection.json"), { position, attempt, session: selected.session, selectedBeforeConsumers: true, programSha256: hash(bytes), rawRevision: adopted.revision, normalizedRevision: inspected.domain.executableContract.revision, origin: position === "R0" ? "recovered-author-program" : "independent-author-program", developerSemanticEdits: false, serialization: "model raw proposal as UTF-8 JSON", semanticSupport: "unreviewed" })
}
async function offline() {
  const prior = await load(path.join(base, "evaluation/variation-matrix.json")).catch(error => { if (error.code === "ENOENT") return undefined; throw error })
  if (!prior) await runOfflineMatrix()
  await verifyMovedPackage(); await verifySourceChange(); await verifyShareLink()
  console.log(JSON.stringify({ providerCalls: 0, matrix: prior ? "retained-existing-observations" : "new-zero-model-checks", practical: "completed-or-resumed-owned-stages" }))
}
async function verify() {
  const [ledger, matrix, moved, source, sharelink, isolation] = await Promise.all([load(ledgerFile), load(path.join(base, "evaluation/variation-matrix.json")), load(path.join(base, "verification/move-result.json")), load(path.join(base, "verification/source-change-result.json")), load(path.join(base, "verification/sharelink-result.json")), load(path.join(base, "verification/R0-request-isolation.json"))])
  const require = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
  const unresolved = ledger.filter((entry: any) => ["running", "unknown", "timeout-unknown", "completion-unknown"].includes(entry.status))
  require(unresolved.every((entry: any) => entry.lifecycleInspection?.noAutomaticResend === true), "An unresolved original lifecycle lacks its no-resend record")
  require(matrix.providerCalls === 0 && matrix.automaticMainChainEvidence === false && matrix.historicalRawUnchanged, "Offline provenance changed")
  require(matrix.variants === 14 && matrix.results.length === 28 && matrix.results.every((row: any) => row.providerCalls === 0), "Variation observations are incomplete")
  for (const track of matrix.tracks) require(matrix.results.filter((row: any) => row.track === track.name).length === 14, "An offline track is incomplete")
  const originalInput = await load(path.join(base, "inputs/root-default.json"))
  for (const row of matrix.results) {
    const input = await load(path.resolve(repo, row.input))
    require(JSON.stringify(input.inquiry) === JSON.stringify(originalInput.inquiry), "A variation changed an original question or policy")
  }
  require(moved.providerCalls === 0 && moved.inspectResolvedCopiedPath && moved.sourceBytesPreserved && moved.results.every((row: any) => row.freshPreviousEqual && row.answerReused === false), "Moved package evidence is incomplete")
  require(source.providerCalls === 0 && source.sourceChanged && source.resourceExecution?.returned === undefined && source.mutation.originalUnchanged, "Decisive source change retained an old return")
  const originalSource = path.resolve(base, "inputs", originalInput.sourceRoot, source.mutation.path)
  require(hash(await readFile(originalSource)) === source.mutation.beforeSha256, "Protected original source bytes changed")
  require(sharelink.providerCalls === 0 && sharelink.actualTargetWrites === 0 && sharelink.originalProgramUnchanged && sharelink.originalPolicyPreserved && sharelink.deniedExecution?.returned === undefined, "ShareLink offline boundaries changed")
  require(sharelink.deniedExecution?.termination === "serializer-object-permission-denied" && sharelink.remainingDuties.includes("share-create"), "ShareLink lost current denial or the original duty")
  require(isolation.allFourQuestionIdsPresent && isolation.evaluationOriginAbsent && isolation.evaluationInterpretationAbsent && isolation.sourceAllowlist && isolation.toolExecutions === 0, "R0 original request isolation record changed")
  const result = { providerCalls: 0, evidenceContractPassed: true, checks: ["original unresolved lifecycle preserved", "28 development observations retain four questions and policy", "moved current recomputation", "source mutation withdraws old return and preserves original", "ShareLink offline denial and duties"], actualAuthorConfirmation: "not-confirmed", researchGoalAchieved: false }
  await save(path.join(base, "verification/evidence-check.json"), result); console.log(JSON.stringify(result))
}
const [command, position, attempt] = process.argv.slice(2)
if (command === "prepare") await prepare()
else if (command === "run") await run(position!, attempt)
else if (command === "freeze") await freeze(position!, attempt)
else if (command === "status") console.log(JSON.stringify(await load(ledgerFile), null, 2))
else if (command === "offline") await offline()
else if (command === "summarize") { const result = await writeStudySummary(); console.log(JSON.stringify({ status: result.status, externalDispatch: result.externalDispatch, automaticMainChainComplete: result.automaticMainChainComplete, tracks: result.offline.tracks, accounting: result.accounting })) }
else if (command === "verify") await verify()
else throw new Error("Use prepare | run <BJ purpose> [registered named attempt] | freeze F0/R0 [attempt] | status | offline | summarize | verify")
