// Archive already completed observations after a host post-turn projection crash.
// No provider request, replay, semantic patch or substituted final answer.
import path from "node:path"
import { readFile, readdir, writeFile, copyFile, unlink } from "node:fs/promises"
import { base, repo, load, save, relative } from "./study.ts"
import { observedAccountCost, measureAuthorTimeline } from "../../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/measurement.ts"

const ledger = await load(path.join(base, "attempts.json"))
const entry = ledger.find((e: any) => e.position === "A-G" && e.attempt === "first")
if (entry.status !== "unknown" || !entry.recoveryFailure?.includes("a.id")) throw new Error("specific-post-turn-failure-required")
const session = path.join(base, "runs/A-G-first/sessions/2026-10-20T121733749Z-4ce71375")
const raw = path.join(session, "raw"), recovered = path.join(raw, "recovery-1")
const turn = await load(path.join(recovered, "account-turn-1.json"))
if (turn.status !== "completed" || turn.lifecycle?.localExecution !== "closed" || !turn.lifecycle.providerTerminalObserved) throw new Error("persisted-completion-required")
const identity = await load(path.join(session, "session.json"))
const checkpoint = await load(path.join(recovered, "program-checkpoint-4.json"))
const history = (await readFile(path.join(recovered, "tools.jsonl"), "utf8")).trim().split("\n").map(x => JSON.parse(x))
const originalEvents = (await readFile(path.join(raw, "lifecycle.jsonl"), "utf8")).trim().split("\n").map(x => JSON.parse(x))
const originalIdentity = originalEvents.filter(e => e.method === "skvm/account/identity").at(-1).lifecycle
const original = { status: "interrupted", terminalStatus: "interrupted", answerDelivery: "undelivered", usage: null, durationMs: Date.parse(entry.recoveries[0].lastOriginalEventAt) - Date.parse(entry.startedAt), inferenceDispatched: true, lifecycle: { ...originalIdentity, localExecution: "closed", providerTerminalObserved: true }, events: originalEvents, tools: [], text: "" }
const delivery = await load(path.join(recovered, "delivery-turn-1.json"))
const reconstruction = {
  providerCalls: 0, cause: entry.recoveryFailure, originalProviderTerminal: "completed",
  method: "Exact persisted account turn, last checkpoint, actual tools log and original identity; no inference or replay.",
  limitations: ["Post-checkpoint domain changes and final source accounting were not serialized. Domain below is explicitly the last persisted checkpoint.", "Normal author continuation was prevented by shared projection failure; no quality-driven redraw.", "Original and recovery usage are unknown; no zero-cost inference."],
  checkpoint: relative(path.join(recovered, "program-checkpoint-4.json")), recoveryTrace: relative(recovered)
}
const account = { ...turn, durationMs: original.durationMs + turn.durationMs, turns: [original, turn], usage: null, usageVisibility: "unknown", events: [...originalEvents, ...turn.events], delivery }
const domain = { programDraft: checkpoint.draft, executableContract: checkpoint.active }
const native = { history, domain, sourceFiles: identity.sourceFiles, evidence: history.flatMap(h => h.output?.evidence ?? []), reconstruction }
const fields = { ...identity, status: turn.status, terminalStatus: turn.terminalStatus, answerDelivery: turn.answerDelivery, text: turn.text, rawLastText: turn.text, firstAnswer: turn.text, delivery, usageVisibility: "unknown", quotaRefused: turn.quotaRefused, domain, telemetry: { account, providerCalls: null, totalActualUsd: null }, durationMs: account.durationMs, reconstruction }
for (const [name, value] of [["run.json", { ...fields, native }], ["report.json", fields]] as const) await writeFile(path.join(session, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
await save(path.join(raw, "account-turn-1.json"), original)
await copyFile(path.join(recovered, "account-turn-1.json"), path.join(raw, "account-turn-2.json"))
for (const name of await readdir(recovered)) if (/^program-checkpoint-\d+\.json$/.test(name)) await copyFile(path.join(recovered, name), path.join(raw, name))
await save(path.join(base, "authoring/final-program-A-G-first.json"), checkpoint.draft.currentDraft.raw)
await save(path.join(base, "authoring/A-G-first-process.json"), domain)
await save(path.join(base, "authoring/A-G-first-proposals.json"), history.filter(h => h.call.name.startsWith("authorization_program")))
await writeFile(path.join(base, "evaluation/answers/A-G-first.txt"), turn.text, "utf8")
await save(path.join(base, "evaluation/timeline-A-G-first.json"), measureAuthorTimeline({ ...fields, native }))
Object.assign(entry, observedAccountCost(fields), { status: "completed", terminalStatus: turn.terminalStatus, answerDelivery: turn.answerDelivery, lifecycle: turn.lifecycle, session: relative(session), endedAt: new Date().toISOString(), durationMs: account.durationMs, turns: account.turns.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, inferenceDispatched: t.inferenceDispatched })), hostPostTurnFailure: reconstruction, priorStatus: "unknown-until-persisted-terminal-read" })
await save(path.join(base, "attempts.json"), ledger)
await unlink(path.join(base, "runs/A-G-first/local-owner.json"))
const status = await load(path.join(base, "status.json"))
Object.assign(status, { stage: "A-G-closed-with-host-failure", activeRequests: [], unknownRequests: [], lastUpdated: new Date().toISOString() })
await save(path.join(base, "status.json"), status)
await save(path.join(base, "verification/A-G-host-post-turn-failure.json"), { ...reconstruction, providerLifecycle: turn.lifecycle, regression: { red: "nested-owner TypeError reproduced", green: "84 tests / 648 assertions; main typecheck pass", independentReview: "bs_owner_fix_review confirmed original owner preservation and test coverage", repair: "Preserve generating skeleton/anchor instead of smallest containing function. No model raw edited." } })
console.log(JSON.stringify({ status: entry.status, answerDelivery: entry.answerDelivery, steps: checkpoint.draft.currentDraft.raw.resourceWorkflow.steps.length, providerCalls: 0, unknownUsage: true }))
