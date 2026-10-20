import { mkdir, readFile, writeFile, copyFile, open, unlink } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, checkAuthorizationInquiry, inspectLocalInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { classifyTerminalReport, observedAccountCost, measureAuthorTimeline } from "../../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/measurement.ts"
import { assertRulesPacket, countObservedUsage, recordRunError } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"
import { base, root, repo, load, save, hash, relative } from "./evidence.ts"
import { positions, limits } from "./prepare.ts"
export { base, positions, limits }
const ledgerFile = path.join(base, "attempts.json"), accountBoundaryFile = path.join(root, "authorization-executable-contract-v1/account-boundary.json")
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
export function admit(ledger: any[], position: string, attempt: string, repairs: any[]) {
  const index = positions.indexOf(position)
  if (index < 0 || !/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("invalid-or-duplicate-attempt")
  if (ledger.some(e => ["running", "unknown"].includes(e.status) || e.quotaOrAuth || e.lifecycle?.localExecution !== "closed")) throw new Error("active-unknown-or-paused-channel")
  if (attempt === "first" && index > 0 && !ledger.some(e => e.position === positions[index - 1])) throw new Error("registered-order-required")
  const repair = repairs.find(r => r.position === position && r.attempt === attempt)
  if (attempt !== "first" && (!repair?.cause || !repair.evidence || !repair.uniqueConfirmation || !ledger.some(e => e.position === position))) throw new Error("named-confirmation-not-admitted")
  if (attempt !== "first" && (ledger.filter(e => e.repairCause).length >= 4 || ledger.filter(e => e.repairCause === repair.cause).length >= 2)) throw new Error("confirmation-limit")
  return repair
}
export function optionsFor(position: string) {
  if (!positions.includes(position)) throw new Error("unregistered-position")
  const author = position.startsWith("A-"), task = position.endsWith("-M") ? "M" : "G", native = position.startsWith("N-")
  return { author, task, native, inputFile: path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-${author ? "author" : "original"}.json`),
    skillFile: path.join(root, "authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md"),
    domainProgramFile: native ? undefined : author ? path.join(base, `automatic/${task}-initial.json`) : position.startsWith("AE-") ? path.join(base, `automatic/${task}-final.json`) : path.join(base, `reference/${task}-program.json`),
    programSupport: position.startsWith("RR-") ? "rules" as const : "execute" as const,
    programMode: author ? "edit" as const : "consume" as const, strategy: native ? "legacy" as const : "question-checked-v1" as const }
}
export async function checkRegistration() {
  const r = await load(path.join(base, "registration.json"))
  for (const [file, sha] of Object.entries(r.files)) if (hash(await readFile(path.resolve(repo, file))) !== sha) throw new Error(`registered-bytes-changed:${file}`)
  return r
}
export async function preflight() {
  const views: any[] = []
  for (const position of ["A-M", "A-G", "N-M", "RR-M", "RE-M", "RR-G", "RE-G", "N-G"]) {
    const o = optionsFor(position)
    const runtime = await createNativeInquiryRuntime({ ...o, sourceStructure: true, workDir: base, domainTools: !o.native, method: o.native ? "M" : "D1", authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", ...limits })
    try {
      const context = await runtime.accountContext(false)
      if (o.programSupport === "rules") assertRulesPacket(context)
      views.push({ position, context, tools: runtime.definitions.map(t => t.name), sourceFiles: runtime.report().sourceFiles })
    } finally { await runtime.close() }
  }
  await save(path.join(base, "verification/preflight.json"), { providerCalls: 0, checkedAt: new Date().toISOString(), views, limits })
  return { providerCalls: 0, positions: views.map(v => v.position), rulesExecutionIsolated: true }
}
export async function run(position: string, attempt: string, resume = false) {
  await checkRegistration(); await load(path.join(base, "verification/preflight.json"))
  if (git("status", "--porcelain", "--", "src")) throw new Error("commit-tested-production-before-dispatch")
  const ledger = await load(ledgerFile), repair = admit(ledger, position, attempt, await load(path.join(base, "repairs.json"))), o = optionsFor(position)
  const previous = resume ? ledger.filter((e: any) => e.position === position && e.session).at(-1) : undefined
  if (resume && (!o.author || !previous || attempt === "first")) throw new Error("recovery-requires-own-known-author")
  if (o.author && attempt !== "first" && !resume) throw new Error("author-recovery-must-continue-original-budget")
  const outDir = path.join(base, `runs/${position}-${attempt}`)
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", limits, input: relative(o.inputFile), inputSha256: hash(await readFile(o.inputFile)), program: o.domainProgramFile && relative(o.domainProgramFile), programSha256: o.domainProgramFile && await Bun.file(o.domainProgramFile).exists() ? hash(await readFile(o.domainProgramFile)) : null, skillSha256: hash(await readFile(o.skillFile)), codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src") }, repairCause: repair?.cause, programSupport: o.native ? "none" : o.programSupport, actualUsd: null }
  if (position.startsWith("AE-")) {
    const eligibility = await load(path.join(base, `automatic/${o.task}-eligibility.json`))
    if (eligibility.sha256 !== entry.programSha256) throw new Error("automatic-eligibility-raw-mismatch")
    if (!eligibility.eligible) {
      Object.assign(entry, { status: "ineligible", inferenceDispatched: false, usage: null, providerRequests: 0, lifecycle: { localExecution: "closed", providerTerminalObserved: false }, eligibility, endedAt: new Date().toISOString() })
      ledger.push(entry); await save(ledgerFile, ledger); return entry
    }
  }
  if (position.startsWith("RR-") || position.startsWith("RE-")) {
    const admission = (await load(path.join(base, "reference/admission.json"))).checks.find((c: any) => c.task === o.task)
    if (!admission?.qualified || admission.sha256 !== entry.programSha256) throw new Error("reference-not-qualified")
  }
  await mkdir(outDir, { recursive: true })
  const leasePath = path.join(outDir, "local-owner.json"), lease = await open(leasePath, "wx")
  await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt })); await lease.close()
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ ...o, domainProgramFile: resume ? undefined : o.domainProgramFile, previous: previous?.session && path.resolve(repo, previous.session), resumeAuthorThread: resume, sourceStructure: true, purpose: position, attempt, outDir, model: "gpt-5.6-sol", method: o.native ? "M" : "D1", harness: "codex-account", domainTools: !o.native, authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", accountBoundaryFile, execution: { ...limits, maxAuthorContinuations: o.author ? 2 : 0 } })
    const account = report.telemetry?.account
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { ...(account?.hostFailure ? { status: "host-failed" } : {}), endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, lifecycle: account?.lifecycle ?? { localExecution: report.status === "invalid" ? "closed" : "unknown" }, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), reason: account?.hostFailure ?? account?.reason ?? report.diagnostics })
    await save(ledgerFile, ledger)
    if (report.sessionPath) {
      const archived = await load(path.join(report.sessionPath, "run.json"))
      await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(archived))
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true })
      await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      if (o.author) {
        const raw = report.domain?.programDraft?.currentDraft?.raw ?? report.domain?.executableContract?.currentDraft?.raw
        if (raw) await save(path.join(base, `automatic/${o.task}-${attempt}-last-raw.json`), raw)
        await save(path.join(base, `automatic/${o.task}-${attempt}-process.json`), report.domain)
        await save(path.join(base, `automatic/${o.task}-${attempt}-proposals.json`), (archived.native?.history ?? []).filter((h: any) => ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(h.call.name)))
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
export async function freeze(task: string) {
  if (!["M", "G"].includes(task)) throw new Error("unknown-task")
  const entry = (await load(ledgerFile)).filter((e: any) => e.position === `A-${task}`).at(-1)
  if (!entry || ["running", "unknown"].includes(entry.status) || entry.lifecycle?.localExecution !== "closed") throw new Error("author-not-known-closed")
  const target = path.join(base, `automatic/${task}-final.json`)
  if (await Bun.file(target).exists()) throw new Error("already-frozen")
  await copyFile(path.join(base, `automatic/${task}-${entry.attempt}-last-raw.json`), target)
  await save(path.join(base, `automatic/${task}-selection.json`), { attempt: entry.attempt, sha256: hash(await readFile(target)), source: entry.session, chosenBy: "chronologically-last-raw-no-score-selection", developerSemanticEdits: false })
  return { task, sha256: hash(await readFile(target)) }
}
export async function verify() {
  await checkRegistration()
  const ledger = await load(ledgerFile), inspected = []
  for (const e of ledger) if (e.session) { const r = await inspectLocalInquiry(path.resolve(repo, e.session)); inspected.push({ position: e.position, attempt: e.attempt, status: r.status }) }
  const result = { providerCalls: 0, inspected, usage: countObservedUsage(ledger.flatMap((e: any) => e.turns ?? [])), actualUsd: null, developerCost: null, plannedPurposes: positions.length, recordedPurposes: new Set(ledger.map((e: any) => e.position)).size, activeOrUnknown: ledger.filter((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed").map((e: any) => e.position), confirmations: ledger.filter((e: any) => e.repairCause).length }
  await save(path.join(base, "verification/lifecycle.json"), result); return result
}
if (import.meta.main) {
  const [command, a, b = "first"] = process.argv.slice(2)
  console.log(JSON.stringify(command === "preflight" ? await preflight() : command === "run" ? await run(a!, b) : command === "recover" ? await run(a!, b, true) : command === "freeze" ? await freeze(a!) : command === "verify" ? await verify() : (() => { throw new Error("preflight|run POSITION [ATTEMPT]|recover POSITION ATTEMPT|freeze M/G|verify") })(), null, 2))
}
