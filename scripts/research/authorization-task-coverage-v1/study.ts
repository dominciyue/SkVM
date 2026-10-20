import { mkdir, readFile, writeFile, copyFile, open, unlink } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, checkAuthorizationInquiry, inspectLocalInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { classifyTerminalReport, observedAccountCost, measureAuthorTimeline } from "../../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/measurement.ts"
import { assertRulesPacket, countObservedUsage, recordRunError } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"
import { base, root, repo, load, save, hash, relative } from "./evidence.ts"
export { base, root, repo, load, save, hash, relative }
export const positions = ["A-M", "M0-N", "M0-R", "M0-E", "M1-E", "M1-R", "M1-N", "A-G", "G0-N", "G0-R", "G0-E", "G1-E", "G1-R", "G1-N"]
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
const ledgerFile = path.join(base, "attempts.json"), accountBoundaryFile = path.join(root, "authorization-executable-contract-v1/account-boundary.json")
export function admitAttempt(ledger: any[], position: string, attempt: string, repairs: any[] = []) {
  const index = positions.indexOf(position)
  if (index < 0 || !/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("invalid-or-duplicate-attempt")
  if (ledger.some(e => ["running", "unknown"].includes(e.status) || e.quotaOrAuth || e.lifecycle?.localExecution !== "closed")) throw new Error("active-unknown-or-paused-channel")
  if (index > 0 && !ledger.some(e => e.position === positions[index - 1])) throw new Error("registered-order-required")
  const repair = repairs.find(r => r.position === position && r.attempt === attempt)
  if (attempt !== "first") {
    if (ledger.filter(e => e.repairCause).length >= 4) throw new Error("confirmation-limit")
    if (!repair?.cause || !repair.evidence || !repair.uniqueConfirmation || !ledger.some(e => e.position === position) || ledger.filter(e => e.repairCause === repair.cause).length >= 2) throw new Error("named-confirmation-not-admitted")
  }
  return repair
}
export const chooseLastRaw = (domain: any) => domain?.programDraft?.currentDraft?.raw ?? domain?.executableContract?.currentDraft?.raw
export const programDisposition = (check: any) => ({ dispatchSourceConsumer: true, executionComparable: check?.status === "valid" && !!check.executableContract?.resourceExecution, status: check?.status ?? "no-raw-submitted", diagnostics: check?.diagnostics ?? [] })
export const consumerSupport = (requested: "rules" | "execute", check: any) => requested === "execute" && check?.status === "invalid" ? "rules" as const : requested
export function optionsFor(position: string) {
  if (!positions.includes(position)) throw new Error("unregistered-position")
  const author = position.startsWith("A-"), task = position === "A-G" || position.startsWith("G") ? "G" : "M", native = position.endsWith("-N")
  return { author, task, native,
    inputFile: path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-${position.startsWith(`${task}1`) ? "changed" : "original"}.json`),
    skillFile: path.join(root, "authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md"),
    domainProgramFile: native || position === "A-G" ? undefined : position === "A-M" ? path.join(base, "authoring/memos-inherited-program.json") : path.join(base, `authoring/${task}-automatic-program.json`),
    programSupport: position.endsWith("-R") ? "rules" as const : "execute" as const,
    programMode: author ? "edit" as const : "consume" as const, strategy: native ? "legacy" as const : "question-checked-v1" as const }
}
export async function checkRegistration() {
  const registration = await load(path.join(base, "registration.json"))
  for (const [f, sha] of Object.entries(registration.files)) if (hash(await readFile(path.resolve(repo, f))) !== sha) throw new Error(`Registered bytes changed: ${f}`)
  return registration
}
export async function preflight() {
  await checkRegistration()
  const views: any[] = []
  for (const position of ["A-M", "A-G", "M0-N", "M0-R"]) {
    const original = optionsFor(position), o = { ...original, ...(position === "M0-R" ? { domainProgramFile: optionsFor("A-M").domainProgramFile } : {}) }
    const runtime = await createNativeInquiryRuntime({ ...o, workDir: base, sourceStructure: true, domainTools: !o.native, method: o.native ? "M" : "D1", authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", ...limits })
    try {
      const context = await runtime.accountContext(false)
      if (o.programSupport === "rules") assertRulesPacket(context)
      views.push({ position, context, tools: runtime.definitions.map(t => t.name), sourceFiles: runtime.report().sourceFiles })
    } finally { await runtime.close() }
  }
  await save(path.join(base, "verification/preflight.json"), { checkedAt: new Date().toISOString(), providerCalls: 0, views, budgets: limits })
  return { providerCalls: 0, positions: views.map(v => v.position), rulesStructureChecked: true }
}
export async function run(position: string, attempt: string) {
  await checkRegistration(); await load(path.join(base, "verification/preflight.json"))
  if (git("status", "--porcelain", "--", "src")) throw new Error("Commit tested production epoch before dispatch")
  const ledger = await load(ledgerFile), repair = admitAttempt(ledger, position, attempt, await load(path.join(base, "repairs.json"))), o = optionsFor(position)
  let rawExists = !!o.domainProgramFile && await Bun.file(o.domainProgramFile).exists()
  if (!o.author && !o.native) {
    const selection = await load(path.join(base, `authoring/${o.task}-frozen-selection.json`))
    if (rawExists ? hash(await readFile(o.domainProgramFile!)) !== selection.sha256 : selection.sha256 !== null) throw new Error("fixed-raw-changed")
  }
  const outDir = path.join(base, `runs/${position}-${attempt}`), leasePath = path.join(outDir, "local-owner.json")
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", programSupport: o.native ? "none" : o.programSupport, programMode: o.programMode, input: relative(o.inputFile), inputSha256: hash(await readFile(o.inputFile)), program: o.domainProgramFile && relative(o.domainProgramFile), programSha256: rawExists ? hash(await readFile(o.domainProgramFile!)) : null, skillSha256: hash(await readFile(o.skillFile)), limits, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src") }, repairCause: repair?.cause, actualUsd: null }
  await mkdir(outDir, { recursive: true }); const lease = await open(leasePath, "wx"); await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt })); await lease.close()
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    let effectiveSupport = o.programSupport
    if (!o.author && !o.native) {
      const check = rawExists ? await checkAuthorizationInquiry(o.inputFile, "D1", o.strategy, o.domainProgramFile, { ...o, executionPolicy: "progressive" }) : undefined
      entry.programDisposition = programDisposition(check)
      effectiveSupport = consumerSupport(o.programSupport, check)
      entry.effectiveProgramSupport = effectiveSupport
      await save(path.join(outDir, "program-check.json"), check ?? { status: "missing", providerCalls: 0 })
      // A rejected executable raw cannot enter the ordinary execute session.
      // Read that exact raw with schema/source diagnostics in rules mode,
      // preserving requested arm and noncomparability in the ledger.
    }
    const report: any = await executeLocalInquiryRun({ ...o, programSupport: effectiveSupport, domainProgramFile: rawExists ? o.domainProgramFile : undefined, sourceStructure: true, purpose: position, attempt, outDir, model: "gpt-5.6-sol", method: o.native ? "M" : "D1", harness: "codex-account", domainTools: !o.native, authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", accountBoundaryFile, execution: { ...limits, maxAuthorContinuations: o.author ? 2 : 0 } })
    const account = report.telemetry?.account
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, lifecycle: account?.lifecycle ?? { localExecution: report.status === "invalid" ? "closed" : "unknown" }, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), reason: account?.reason ?? report.diagnostics })
    if (report.sessionPath) {
      const archived = await load(path.join(report.sessionPath, "run.json")), history = archived.native?.history ?? []
      await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(archived))
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true }); await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      if (o.author) {
        await save(path.join(base, `authoring/${position}-${attempt}-proposals.json`), history.filter((h: any) => ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(h.call.name)))
        const raw = chooseLastRaw(report.domain)
        if (raw) await save(path.join(base, `authoring/final-program-${position}-${attempt}.json`), raw)
        await save(path.join(base, `authoring/${position}-${attempt}-process.json`), report.domain)
      }
    }
    return entry
  } catch (error) { recordRunError(entry, error); throw error }
  finally {
    await save(ledgerFile, ledger); await unlink(leasePath)
    const state = await load(path.join(base, "status.json"))
    Object.assign(state, { stage: position, activeRequests: ledger.filter((e: any) => e.status === "running").map((e: any) => `${e.position}/${e.attempt}`), unknownRequests: ledger.filter((e: any) => e.status === "unknown").map((e: any) => `${e.position}/${e.attempt}`), lastUpdated: new Date().toISOString() })
    await save(path.join(base, "status.json"), state)
  }
}
export async function freeze(task: string, attempt: string) {
  if (!["M", "G"].includes(task)) throw new Error("unknown-task")
  const entry = (await load(ledgerFile)).filter((e: any) => e.position === `A-${task}`).at(-1)
  if (entry?.attempt !== attempt || ["running", "unknown"].includes(entry.status) || entry.lifecycle?.localExecution !== "closed") throw new Error("Must freeze last known closed author")
  const selectionFile = path.join(base, `authoring/${task}-frozen-selection.json`), fixed = path.join(base, `authoring/${task}-automatic-program.json`)
  if (await Bun.file(selectionFile).exists()) throw new Error("Already frozen")
  const file = path.join(base, `authoring/final-program-A-${task}-${attempt}.json`), exists = await Bun.file(file).exists()
  if (exists) await copyFile(file, fixed)
  const selected = { position: `A-${task}`, attempt, source: exists ? relative(file) : null, sha256: exists ? hash(await readFile(fixed)) : null, chosenBy: "chronologically-last-submitted-raw-even-if-invalid; no score selection", semanticSupport: exists ? "unreviewed" : "no-raw-submitted", developerSemanticEdits: false }
  await save(selectionFile, selected); return selected
}
export async function verify() {
  await checkRegistration()
  const ledger = await load(ledgerFile), inspected: any[] = []
  for (const e of ledger) if (e.session) { const r = await inspectLocalInquiry(path.resolve(repo, e.session)); inspected.push({ position: e.position, attempt: e.attempt, status: r.status }) }
  const result = { providerCalls: 0, inspected, usage: countObservedUsage(ledger.flatMap((e: any) => e.turns ?? [])), actualUsd: null, developerCost: null, humanMinutes: null, plannedPurposes: positions.length, attemptedPurposes: new Set(ledger.map((e: any) => e.position)).size, activeOrUnknown: ledger.filter((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed").map((e: any) => e.position), confirmations: ledger.filter((e: any) => e.repairCause).length }
  await save(path.join(base, "verification/lifecycle.json"), result); return result
}
if (import.meta.main) {
  const [command, a, b] = process.argv.slice(2)
  console.log(JSON.stringify(command === "preflight" ? await preflight() : command === "run" ? await run(a!, b!) : command === "freeze" ? await freeze(a!, b!) : command === "verify" ? await verify() : command === "status" ? await load(ledgerFile) : (() => { throw new Error("preflight|run POSITION ATTEMPT|freeze M/G ATTEMPT|verify|status") })(), null, 2))
}
