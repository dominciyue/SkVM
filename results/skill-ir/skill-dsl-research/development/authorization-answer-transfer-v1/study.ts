import { mkdir, readFile, writeFile, copyFile, open, unlink } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, checkAuthorizationInquiry, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { classifyTerminalReport, observedAccountCost, measureAuthorTimeline } from "../authorization-authoring-loop-v1/measurement.ts"

export const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), identity = "authorization-answer-transfer-v1"
export const positions = ["D-R", "D-E", "A-M", "M0-N", "M0-R", "M0-E", "M1-E", "M1-R", "M1-N"]
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export const load = async (f: string) => JSON.parse(await readFile(f, "utf8"))
export const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex")
export const save = async (f: string, v: unknown) => { await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, JSON.stringify(v, null, 2) + "\n", "utf8") }
export const relative = (f: string) => path.relative(repo, f).split(path.sep).join("/")
const git = (...a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim()
const ledgerFile = path.join(base, "attempts.json"), fixed = path.join(base, "authoring/automatic-program.json")
const bq = path.resolve(base, "../authorization-source-program-consistency-v1"), domainBase = path.resolve(base, "../authorization-domain-execution-v1/model")
const accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
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
export function chooseLastRaw(domain: any): any { return domain?.programDraft?.currentDraft?.raw ?? domain?.executableContract?.currentDraft?.raw }
export function consumerDisposition(check: any): any {
  if (check?.status === "valid") return undefined
  return { status: "unavailable-program", inferenceDispatched: false, providerRequests: 0, lifecycle: { localExecution: "closed" }, diagnostics: check?.diagnostics ?? [{ code: "author-submitted-no-raw" }] }
}
export function recordRunError(entry: any, error: unknown) {
  const knownClosed = entry.status !== "running" && entry.lifecycle?.localExecution === "closed"
  Object.assign(entry, { ...(knownClosed ? { postprocessingError: String(error) } : { status: "unknown", error: String(error) }), endedAt: new Date().toISOString(), noAutomaticResend: true })
}
/** Inspect host-owned object slots, never reject arbitrary user record keys or prose. */
export function assertRulesPacket(packet: any) {
  if (!packet || typeof packet !== "object") return
  for (const key of ["resourceExecution", "execution", "outcome", "returned", "propertyChecks", "trials", "candidatePreviewAvailable"]) if (Object.hasOwn(packet, key)) throw new Error(`rules-execution-leak:${key}`)
  for (const key of ["toolResult", "currentContext", "executableContract", "authoring", "programDraft", "candidate", "currentDraft"]) if (packet[key]) assertRulesPacket(packet[key])
}
export function countObservedUsage(turns: any[]) {
  const seen = new Set<string>(), result = { turns: 0, input: 0, output: 0, cacheRead: 0, unknownTurns: 0 }
  for (const [i, t] of turns.entries()) {
    const key = t.lifecycle?.turnId ? `${t.lifecycle.threadId}:${t.lifecycle.turnId}` : `unidentified:${i}`
    if (seen.has(key)) continue
    seen.add(key); result.turns++
    if (!t.usage) { result.unknownTurns++; continue }
    result.input += t.usage.input; result.output += t.usage.output; result.cacheRead += t.usage.cacheRead ?? 0
  }
  return result
}
export function optionsFor(position: string) {
  if (!positions.includes(position)) throw new Error("unregistered-position")
  const download = position.startsWith("D-"), author = position === "A-M", native = position.endsWith("-N")
  return { download, author, native, inputFile: path.join(base, `inputs/${download ? "download" : position.startsWith("M1") ? "memos-changed" : "memos-original"}.json`),
    skillFile: path.join(domainBase, `source-skills/${download ? "cloudflare-security-audit" : "github-security-review"}/SKILL.md`),
    domainProgramFile: author || native ? undefined : download ? path.join(bq, "authoring/automatic-program.json") : fixed,
    programSupport: position.endsWith("-R") ? "rules" as const : "execute" as const,
    programMode: author ? "edit" as const : "consume" as const,
    strategy: native ? "legacy" as const : "question-checked-v1" as const }
}
async function checkRegistration() {
  const registration = await load(path.join(base, "registration.json"))
  for (const [f, sha] of Object.entries(registration.files)) if (hash(await readFile(path.resolve(repo, f))) !== sha) throw new Error(`Registered bytes changed: ${f}`)
  return registration
}
export async function preflight() {
  await checkRegistration(); const views: any[] = []
  for (const position of ["D-R", "D-E", "A-M", "M0-N"]) {
    const o = optionsFor(position), runtime = await createNativeInquiryRuntime({ ...o, workDir: base, sourceStructure: true, domainTools: !o.native, method: o.native ? "M" : "D1", authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", ...limits })
    try {
      const context = await runtime.accountContext(false)
      if (o.programSupport === "rules") assertRulesPacket(context)
      views.push({ position, context, tools: runtime.definitions.map(t => t.name) })
    } finally { await runtime.close() }
  }
  await save(path.join(base, "verification/preflight.json"), { checkedAt: new Date().toISOString(), providerCalls: 0, views })
  return { providerCalls: 0, positions: views.map(v => v.position), rulesStructureChecked: true }
}
export async function run(position: string, attempt: string) {
  await checkRegistration(); await load(path.join(base, "verification/preflight.json"))
  if (git("status", "--porcelain", "--", "src")) throw new Error("Commit tested production epoch before dispatch")
  const ledger = await load(ledgerFile), repair = admitAttempt(ledger, position, attempt, await load(path.join(base, "repairs.json"))), o = optionsFor(position)
  let fixedRawExists = true
  if (!o.download && o.domainProgramFile) {
    const selection = await load(path.join(base, "authoring/frozen-selection.json"))
    fixedRawExists = await Bun.file(fixed).exists()
    if (fixedRawExists ? hash(await readFile(fixed)) !== selection.sha256 : selection.sha256 !== null) throw new Error("fixed-raw-changed")
  }
  const outDir = path.join(base, `runs/${position}-${attempt}`), leasePath = path.join(outDir, "local-owner.json")
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", programSupport: o.native ? "none" : o.programSupport, programMode: o.programMode, input: relative(o.inputFile), inputSha256: hash(await readFile(o.inputFile)), program: o.domainProgramFile && relative(o.domainProgramFile), programSha256: o.domainProgramFile && fixedRawExists ? hash(await readFile(o.domainProgramFile)) : null, skillSha256: hash(await readFile(o.skillFile)), limits, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src") }, repairCause: repair?.cause, actualUsd: null }
  await mkdir(outDir, { recursive: true }); const lease = await open(leasePath, "wx"); await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt })); await lease.close(); ledger.push(entry); await save(ledgerFile, ledger)
  try {
    if (!o.download && o.domainProgramFile) {
      const check = fixedRawExists ? await checkAuthorizationInquiry(o.inputFile, "D1", o.strategy, o.domainProgramFile, { ...o, executionPolicy: "progressive" }) : undefined
      await save(path.join(outDir, "program-check.json"), check ?? { status: "missing", providerCalls: 0 })
      const unavailable = consumerDisposition(check)
      if (unavailable) { Object.assign(entry, unavailable, { endedAt: new Date().toISOString() }); return entry }
    }
    const report: any = await executeLocalInquiryRun({ ...o, sourceStructure: true, purpose: position, attempt, outDir, model: "gpt-5.6-sol", method: o.native ? "M" : "D1", harness: "codex-account", domainTools: !o.native, authoringTargetMode: o.author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", accountBoundaryFile, execution: { ...limits, maxAuthorContinuations: o.author ? 2 : 0 } })
    const account = report.telemetry?.account
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, lifecycle: account?.lifecycle, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), reason: account?.reason ?? report.diagnostics })
    if (report.sessionPath) {
      const archived = await load(path.join(report.sessionPath, "run.json")), history = archived.native?.history ?? []
      await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(archived))
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true }); await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      await save(path.join(base, `authoring/${position}-${attempt}-proposals.json`), history.filter((h: any) => ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(h.call.name)))
      if (o.programSupport === "rules") for (const t of account?.turns ?? []) for (const e of t.events ?? []) {
        if (e.direction !== "client") continue
        if (e.method === "turn/start") for (const item of e.params.input) if (item.text?.includes("Current local explanation context: ")) assertRulesPacket(JSON.parse(item.text.split("Current local explanation context: ")[1]))
        for (const item of e.result?.contentItems ?? []) if (item.text) assertRulesPacket(JSON.parse(item.text))
      }
      if (o.author) {
        const raw = chooseLastRaw(report.domain)
        if (raw) await save(path.join(base, `authoring/final-program-${position}-${attempt}.json`), raw)
        await save(path.join(base, `authoring/${position}-${attempt}-process.json`), report.domain)
      }
    }
    return entry
  } catch (error) { recordRunError(entry, error); throw error }
  finally { await save(ledgerFile, ledger); await unlink(leasePath) }
}
export async function freeze(attempt: string) {
  const entry = (await load(ledgerFile)).find((e: any) => e.position === "A-M" && e.attempt === attempt)
  if (!entry || ["running", "unknown"].includes(entry.status) || entry.lifecycle?.localExecution !== "closed") throw new Error("No known closed author")
  if (await Bun.file(path.join(base, "authoring/frozen-selection.json")).exists()) throw new Error("Already frozen")
  const file = path.join(base, `authoring/final-program-A-M-${attempt}.json`)
  const exists = await Bun.file(file).exists()
  if (exists) await copyFile(file, fixed)
  const selected = { position: "A-M", attempt, source: exists ? relative(file) : null, sha256: exists ? hash(await readFile(fixed)) : null, chosenBy: "chronologically-last-submitted-raw-even-if-invalid; no score selection", semanticSupport: exists ? "unreviewed" : "no-raw-submitted", developerSemanticEdits: false }
  await save(path.join(base, "authoring/frozen-selection.json"), selected); return selected
}
export async function verify() {
  await checkRegistration(); const ledger = await load(ledgerFile), rows = []
  for (const e of ledger) if (e.session) { const r = await inspectLocalInquiry(path.resolve(repo, e.session)); rows.push({ position: e.position, attempt: e.attempt, status: r.status }) }
  const usage = countObservedUsage(ledger.flatMap((e: any) => e.turns ?? []))
  const result = { providerCalls: 0, inspected: rows, usage, actualUsd: null, developerCost: null, humanMinutes: null, plannedPurposes: 9, attemptedPurposes: new Set(ledger.map((e: any) => e.position)).size, activeOrUnknown: ledger.filter((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed").map((e: any) => e.position), confirmations: ledger.filter((e: any) => e.repairCause).length }
  await save(path.join(base, "verification/lifecycle.json"), result); return result
}
if (import.meta.main) {
  const [command, a, b] = process.argv.slice(2)
  console.log(JSON.stringify(command === "preflight" ? await preflight() : command === "run" ? await run(a!, b!) : command === "freeze" ? await freeze(a!) : command === "verify" ? await verify() : command === "status" ? await load(ledgerFile) : (() => { throw new Error("preflight|run POSITION ATTEMPT|freeze ATTEMPT|verify|status") })(), null, 2))
}
