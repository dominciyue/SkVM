// One narrowly scoped same-thread recovery: no tool call or raw existed before
// the host disappeared. Never reconstruct semantic state after tool execution.
import path from "node:path"
import { readFile, readdir, mkdir, writeFile, copyFile, open, unlink, appendFile } from "node:fs/promises"
import { runCodexAccountInquiry } from "../../../src/adapters/codex-account.ts"
import type { AccountSessionResult } from "../../../src/adapters/codex-account-session.ts"
import { loadRunSkill, buildRunSkillBundle } from "../../../src/run/index.ts"
import { base, root, repo, load, save, relative, checkRegistration, optionsFor, limits } from "./study.ts"
import { classifyTerminalReport, observedAccountCost, measureAuthorTimeline } from "../../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/measurement.ts"

export function recoverEmptyTurn(events: any[], observation: any, started: number, now: number) {
  const identity = events.filter(e => e.method === "skvm/account/identity").at(-1)?.lifecycle
  if (observation.status !== "terminal-found" || observation.terminalStatus !== "interrupted" ||
      !identity?.turnId || identity.threadId !== observation.threadId || identity.turnId !== observation.turnId) throw new Error("confirmed-same-interrupted-turn-required")
  if (events.some(e => /tool.*call|call.*tool/i.test(e.method ?? "") || e.params?.item?.type === "dynamicToolCall")) throw new Error("nonempty-turn-needs-state-recovery")
  const start = events.find(e => e.direction === "client" && e.method === "turn/start")
  if (!start) throw new Error("original-prompt-required")
  const elapsed = now - started, remainingMs = limits.sessionTimeoutMs - elapsed
  if (!Number.isFinite(elapsed) || elapsed < 0 || remainingMs <= 0) throw new Error("original-time-budget-exhausted")
  const account: AccountSessionResult = {
    lifecycle: { ...identity, turnStartAttempted: true, turnStartAcknowledged: true, providerTerminalObserved: true, localExecution: "closed" },
    status: "interrupted", terminalStatus: "interrupted", answerDelivery: "undelivered", usage: null, usageVisibility: "unknown",
    quotaRefused: false, text: "", actualUsd: null, providerRequests: null, durationMs: elapsed, events,
    tools: [], toolRejections: [], model: "gpt-5.6-sol", effort: "high", inferenceDispatched: true,
    reason: "Host disappeared; original persisted turn independently read as interrupted. No original tool execution or raw submission."
  }
  return { account, remainingMs, originalPromptBytes: Buffer.byteLength(start.params.input.map((x: any) => x.text ?? "").join("\n")) }
}

async function recoverG() {
  await checkRegistration()
  const ledger = await load(path.join(base, "attempts.json")), entry = ledger.find((e: any) => e.position === "A-G" && e.attempt === "first")
  if (!entry || entry.status !== "running" || entry.recoveries?.length) throw new Error("only-original-unrecovered-A-G")
  const out = path.join(base, "runs/A-G-first"), oldLease = await load(path.join(out, "local-owner.json"))
  let alive = true
  try { process.kill(oldLease.pid, 0) } catch (error: any) { if (error.code === "ESRCH") alive = false; else throw error }
  if (alive) throw new Error("original-owner-still-alive")
  const dirs = await readdir(path.join(out, "sessions"))
  if (dirs.length !== 1) throw new Error("ambiguous-original-session")
  const session = path.join(out, "sessions", dirs[0]!), rawDir = path.join(session, "raw")
  const names = await readdir(rawDir)
  if (names.some(n => /tools\.jsonl|program-checkpoint|account-turn/.test(n))) throw new Error("original-turn-not-empty")
  const events = (await readFile(path.join(rawDir, "lifecycle.jsonl"), "utf8")).trim().split("\n").map(x => JSON.parse(x))
  const observation = await load(path.join(base, "verification/A-G-interruption-read.json"))
  const lastObservedAt = Math.max(...events.map(e => e.emittedAtMs ?? 0))
  if (!lastObservedAt) throw new Error("original-observed-time-required")
  const recovered = recoverEmptyTurn(events, observation, Date.parse(entry.startedAt), lastObservedAt)
  const identity = await load(path.join(session, "session.json"))
  const readDebit = identity.sourceFiles.reduce((n: number, f: any) => n + f.bytes, 0)
  const remaining = { ...limits, sessionTimeoutMs: recovered.remainingMs, maxDisplayBytes: limits.maxDisplayBytes - recovered.originalPromptBytes, maxReadBytes: limits.maxReadBytes - readDebit }
  if (remaining.maxDisplayBytes <= 0 || remaining.maxReadBytes <= 0) throw new Error("original-source-budget-exhausted")
  const leasePath = path.join(out, "recovery-owner.json"), lease = await open(leasePath, "wx")
  await lease.writeFile(JSON.stringify({ pid: process.pid, purpose: "A-G", attempt: "first-host-recovery" })); await lease.close()
  const recovery = { cause: "host-interruption-before-tools", attempt: "first-host-recovery", sameThread: observation.threadId, previousTurn: observation.turnId, terminal: observation.terminalStatus, originalUsage: "unknown", limits: remaining, sourceBudgetDebit: "conservative entire original prompt bytes and source file bytes", downtimeIncludedInTimeDebit: false, lastOriginalEventAt: new Date(lastObservedAt).toISOString(), unobservedIntervalMs: Date.now() - lastObservedAt, timeContract: "Cumulative observable sessions, per taskbook; unknown interval and billing are not asserted zero.", startedAt: new Date().toISOString() }
  entry.repairCause = "A-G-host-interruption-recovery"; entry.recoveries = [recovery]
  await save(path.join(base, "attempts.json"), ledger)
  const trace = path.join(rawDir, "recovery-1"); await mkdir(trace)
  const o = optionsFor("A-G"), skill = await loadRunSkill(o.skillFile)
  try {
    const run = await runCodexAccountInquiry({
      ...o, method: "D1", domainTools: true, inputFile: o.inputFile, workDir: session, traceDir: trace, model: "gpt-5.6-sol",
      sourceStructure: true, authoringTargetMode: "reusable", executionPolicy: "progressive", programContext: "directed",
      accountBoundaryFile: path.join(root, "authorization-executable-contract-v1/account-boundary.json"),
      skillContent: buildRunSkillBundle(skill, "inject")!.content, purpose: "A-G", attempt: recovery.attempt,
      authorResumeAfter: recovered.account, maxAuthorContinuations: 1, timeoutMs: remaining.sessionTimeoutMs,
      maxToolCalls: remaining.maxToolCalls, maxDisplayBytes: remaining.maxDisplayBytes, maxReadBytes: remaining.maxReadBytes,
      reuse: {
        info: { previousSessionId: identity.sessionId, change: "unchanged", answerReused: false, semanticSupport: "unreviewed", reusedRuleKeys: [], invalidatedPolicyKeys: [], invalidatedPremiseKeys: [] },
        seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence: [] }
      }
    })
    const account = { ...run.account, turns: [recovered.account, ...run.account.turns], usage: null, usageVisibility: "unknown", events: [...events, ...run.account.events], durationMs: recovered.account.durationMs + run.account.durationMs, recovery }
    const native = run.native
    const fields = { status: account.status, programSupport: "execute", terminalStatus: account.terminalStatus, answerDelivery: account.answerDelivery, delivery: account.delivery, firstAnswer: account.firstAnswer, text: account.text, rawLastText: account.rawLastText, usageVisibility: account.usageVisibility, quotaRefused: account.quotaRefused, method: "D1", strategy: o.strategy, domainTools: true, inquiry: native.program?.originalDeclaration, program: native.program, result: native.result, final: native.result, domain: native.domain, sourceFiles: native.sourceFiles, sourceVerification: native.sourceVerification, sourceAccounting: native.sourceAccounting, telemetry: { account, providerCalls: null, totalActualUsd: null }, durationMs: account.durationMs, evidence: native.evidence, skill: identity.skill, recovery }
    const report = { ...identity, ...fields, harness: "codex-account" }
    await writeFile(path.join(session, "run.json"), JSON.stringify({ ...fields, native }, null, 2) + "\n", { flag: "wx" })
    await writeFile(path.join(session, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" })
    await appendFile(path.join(out, "sessions.jsonl"), JSON.stringify({ relativePath: `sessions/${identity.sessionId}`, status: account.status }) + "\n")
    await save(path.join(rawDir, "account-turn-1.json"), recovered.account)
    for (const name of await readdir(trace)) {
      if (/^program-checkpoint-\d+\.json$/.test(name)) await copyFile(path.join(trace, name), path.join(rawDir, name))
      if (/^account-turn-\d+\.json$/.test(name)) await copyFile(path.join(trace, name), path.join(rawDir, name.replace(/\d+/, n => String(Number(n) + 1))))
    }
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { session: relative(session), endedAt: new Date().toISOString(), terminalStatus: account.terminalStatus, answerDelivery: account.answerDelivery, durationMs: account.durationMs, lifecycle: account.lifecycle, turns: account.turns.map(t => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, inferenceDispatched: t.inferenceDispatched })) })
    await save(path.join(base, "authoring/A-G-first-process.json"), native.domain)
    await save(path.join(base, "authoring/A-G-first-proposals.json"), native.history.filter((h: any) => ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(h.call.name)))
    const raw = native.domain?.programDraft?.currentDraft?.raw ?? native.domain?.executableContract?.currentDraft?.raw
    if (raw) await save(path.join(base, "authoring/final-program-A-G-first.json"), raw)
    await writeFile(path.join(base, "evaluation/answers/A-G-first.txt"), account.text, "utf8")
    await save(path.join(base, "evaluation/timeline-A-G-first.json"), measureAuthorTimeline({ ...fields, native }))
    return { position: entry.position, status: entry.status, session: entry.session, turns: entry.turns.length, answerDelivery: entry.answerDelivery, recovery }
  } catch (error) {
    entry.status = "unknown"; entry.recoveryFailure = String(error); throw error
  } finally {
    await save(path.join(base, "attempts.json"), ledger); await unlink(leasePath)
    if (entry.lifecycle?.localExecution === "closed") await unlink(path.join(out, "local-owner.json"))
    const state = await load(path.join(base, "status.json"))
    Object.assign(state, { stage: "A-G", activeRequests: ledger.filter((e: any) => e.status === "running").map((e: any) => e.position), unknownRequests: ledger.filter((e: any) => e.status === "unknown").map((e: any) => e.position), lastUpdated: new Date().toISOString() })
    await save(path.join(base, "status.json"), state)
  }
}
if (import.meta.main) console.log(JSON.stringify(await recoverG(), null, 2))
