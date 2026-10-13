import { mkdir, readFile, writeFile, copyFile, open, unlink } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { decideAccountRecovery, type AccountRecoveryObservation } from "../../../../../src/adapters/codex-account-recovery.ts"
import { classifyTerminalReport, measureAuthorTimeline, observedAccountCost } from "../authorization-authoring-loop-v1/measurement.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), example = path.join(repo, "examples/authorization-assessment/download-workflow")
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
const ledgerFile = path.join(base, "attempts.json")
const skillFile = path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md")
const accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
const positions = ["A0", "A1", "C0", "C1", "C2", "B0", "B1", "S0"]
const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }

export function positionOptions(position: string) {
  if (!positions.includes(position)) throw new Error("Unknown BK purpose")
  return { author: ["A0", "A1", "S0"].includes(position), baseline: position.startsWith("B"), variant: ["A1", "C1", "B1"].includes(position) ? "empty-version" : position === "C2" ? "denied" : position === "S0" ? "source-change" : "root-default" }
}
export function admitPurpose(ledger: any[], observation: AccountRecoveryObservation) {
  const blocked = ledger.some(e => e.quotaOrAuth) ? "quota-or-auth-blocked" : ledger.filter(e => e.inferenceDispatched).slice(-2).length === 2 && ledger.filter(e => e.inferenceDispatched).slice(-2).every(e => e.transportFailure) || ledger.length >= 2 && ledger.slice(-2).every(e => e.transportFailure) ? "repeated-transport-failure" : observation.channel
  if (ledger.some(e => e.status === "running")) return decideAccountRecovery({ ...observation, localExecution: "active", channel: blocked })
  const unresolved = ledger.find(e => e.status === "unknown" && !e.recovery?.allowNewTurn)
  return decideAccountRecovery({ ...observation, ...(unresolved ? { localExecution: "unconfirmed" as const } : {}), channel: blocked })
}
async function prepare() {
  for (const variant of ["root-default", "empty-version", "denied", "root-fallback"]) {
    const original = path.join(example, `inputs/${variant}.json`), input = await load(original)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(original), input.sourceRoot)).split(path.sep).join("/")
    await save(path.join(base, `inputs/${variant}.json`), input)
  }
  await save(path.join(base, "configuration.json"), { identity: "authorization-recoverable-authoring-v1", model: "gpt-5.6-sol", effort: "high", limits, programContext: "full", skill: relative(skillFile), skillSha256: hash(await readFile(skillFile)), accountBoundary: relative(accountBoundaryFile), allowedModelInputs: ["original complete skill", "four original questions", "allowed source", "current scenario", "own draft and actual feedback"], excluded: ["taskbook", "evaluator", "historical answers", "developer program"], comparisonOrder: ["C0", "B0", "B1", "C1"], actualUsd: null })
}
async function run(position: string, attempt = "first") {
  const { author, baseline, variant } = positionOptions(position)
  await prepare()
  const ledger: any[] = await load(ledgerFile), isolation = await load(path.join(base, "verification/historical-unknown-disposition.json"))
  const decision = admitPurpose(ledger, isolation.observation)
  if (!decision.allowNewTurn) throw new Error(JSON.stringify(decision))
  if (!/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("Attempt invalid or already recorded; never resend")
  const repairs = (await readFile(path.join(base, "repairs.jsonl"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
  const repair = repairs.find((r: any) => r.position === position && r.attempt === attempt)
  if (attempt !== "first" && (!repair?.cause || !repair?.evidence || !repair?.uniqueConfirmation)) throw new Error("Named confirmation requires a diagnosed shared repair")
  const selectionFile = path.join(base, "authoring/frozen-selection.json")
  const selected = await load(selectionFile).catch(() => undefined)
  if (!["A0"].includes(position) && !selected) throw new Error("A current automatic runnable A0 raw is required")
  const order = ["C0", "B0", "B1", "C1"]
  const index = order.indexOf(position)
  if (index > 0 && !ledger.some(e => e.position === order[index - 1] && e.status !== "running")) throw new Error("Follow the registered pair order")
  const inputFile = position === "S0" ? path.join(base, "verification/source-change/package/input.json") : path.join(base, `inputs/${variant}.json`)
  const domainProgramFile = author || baseline ? undefined : path.join(base, "authoring/automatic-program.json")
  if (domainProgramFile && hash(await readFile(domainProgramFile)) !== selected.programSha256) throw new Error("Selected automatic bytes changed")
  const c0 = ledger.find(e => e.position === "C0" && e.status === "completed")
  const previous = repair?.previous ? path.resolve(repo, repair.previous) : ["C1", "S0"].includes(position) ? c0?.session && path.resolve(repo, c0.session) : undefined
  if (["C1", "S0"].includes(position) && !previous) throw new Error("Eligible C0 session required")
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
  const output = path.join(base, "runs", `${position}-${attempt}`)
  await mkdir(output, { recursive: true })
  const leasePath = path.join(output, "local-owner.json"), lease = await open(leasePath, "wx")
  const entry: any = { position, attempt, purpose: author ? "independent-author" : baseline ? "original-skill-baseline" : "fixed-automatic-program-consumer", status: "running", startedAt: new Date().toISOString(), pid: process.pid, model: "gpt-5.6-sol", effort: "high", variant, programMode: author ? "edit" : "consume", programContext: "full", input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), previous: previous && relative(previous), program: domainProgramFile && relative(domainProgramFile), programSha256: selected?.programSha256, admission: decision, limits, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src")) }, actualUsd: null }
  await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt, output, startedAt: entry.startedAt })); await lease.close()
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ purpose: position, attempt, inputFile, domainProgramFile, outDir: output, model: entry.model, method: "D1", strategy: baseline ? "legacy" : "question-checked-v1", harness: "codex-account", domainTools: !baseline, programMode: entry.programMode, executionPolicy: "progressive", programContext: "full", previous, accountBoundaryFile, skillFile, execution: limits })
    const account = report.telemetry?.account, execution = report.domain?.executableContract?.resourceExecution
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, lifecycle: account?.lifecycle, turns: account?.turns?.map((t: any) => ({ status: t.status, terminalStatus: t.terminalStatus, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), authorContinuation: account?.authorContinuation, resourceSteps: report.domain?.executableContract?.program?.resourceWorkflow?.steps?.length ?? 0, returned: execution?.returned, termination: execution?.termination, transportFailure: /child-exit|send-failed|rpc-error|timeout|routing/i.test(account?.reason ?? "") })
    if (report.sessionPath) await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(await load(path.join(report.sessionPath, "run.json"))))
    if (author && report.domain) {
      await save(path.join(base, `authoring/${position}-${attempt}-process.json`), { session: entry.session, active: report.domain.executableContract, draft: report.domain.programDraft, proposals: report.domain.proposals })
      const adopted = report.domain.executableContract?.adoptedDraft
      if (adopted?.raw?.resourceWorkflow?.steps?.length) await save(path.join(base, `authoring/automatic-program-${position}-${attempt}.json`), adopted.raw)
    }
    console.log(JSON.stringify(entry))
  } catch (error) { Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), localExecution: "closed", noAutomaticResend: true }); throw error }
  finally { await save(ledgerFile, ledger); await unlink(leasePath) }
}
async function freeze(attempt = "first") {
  const ledger: any[] = await load(ledgerFile)
  if (ledger.some(e => e.position.startsWith("C"))) throw new Error("Consumer selection already fixed")
  const selected = ledger.find(e => e.position === "A0" && e.attempt === attempt && e.status === "completed")
  if (!selected) throw new Error("Known completed A0 required")
  const inspected = await inspectLocalInquiry(path.resolve(repo, selected.session)), adopted = inspected.domain.executableContract.adoptedDraft
  const file = path.join(base, `authoring/automatic-program-A0-${attempt}.json`), bytes = await readFile(file)
  if (JSON.stringify(JSON.parse(bytes.toString("utf8"))) !== JSON.stringify(adopted.raw)) throw new Error("Automatic bytes differ from model raw")
  await copyFile(file, path.join(base, "authoring/automatic-program.json"))
  await save(path.join(base, "authoring/frozen-selection.json"), { position: "A0", attempt, session: selected.session, rawRevision: adopted.revision, programSha256: hash(bytes), developerSemanticEdits: false, selectedBeforeConsumers: true })
}
if (import.meta.main) {
  const [command, position, attempt] = process.argv.slice(2)
  if (command === "prepare") await prepare()
  else if (command === "run") await run(position!, attempt)
  else if (command === "freeze") await freeze(position)
  else if (command === "status") console.log(JSON.stringify(await load(ledgerFile), null, 2))
  else throw new Error("Use prepare | run <purpose> <attempt> | freeze <A0-attempt> | status")
}
