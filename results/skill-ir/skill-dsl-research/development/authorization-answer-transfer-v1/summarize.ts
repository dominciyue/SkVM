import path from "node:path"
import { readdir } from "node:fs/promises"
import { base, repo, load, save, countObservedUsage, assertRulesPacket } from "./study.ts"
import { resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { parseArchivedPacket } from "./archive-packets.ts"

const ledger: any[] = await load(path.join(base, "attempts.json")), rows: any[] = []
for (const entry of ledger) {
  if (!entry.session) { rows.push({ position: entry.position, status: entry.status, inferenceDispatched: entry.inferenceDispatched }); continue }
  const session = path.resolve(repo, entry.session), run = await load(path.join(session, "run.json")), history = run.native?.history ?? [], toolCounts: Record<string, number> = {}, wireHistory: any[] = [], packets: any[] = []
  for (const h of history) toolCounts[h.call.name] = (toolCounts[h.call.name] ?? 0) + 1
  const files = (await readdir(path.join(session, "raw"))).filter(f => /^account-turn-\d+\.json$/.test(f)).sort((a,b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  for (const f of files) {
    const turn = await load(path.join(session, "raw", f))
    for (const [index, e] of (turn.events ?? []).entries()) {
      if (e.direction !== "client") continue
      const text = e.method === "turn/start" ? e.params.input?.find((i: any) => i.text?.includes("Current local explanation context: "))?.text.split("Current local explanation context: ")[1] : e.result?.contentItems?.[0]?.text
      if (!text?.startsWith("{")) continue
      const decoded = parseArchivedPacket(text), wire = decoded.packet, packet = wire.contextSequence ? resolveInquiryContext(wire, wireHistory) : wire
      if (wire.contextSequence) wireHistory.push(wire)
      const c = packet.currentContext ?? packet, contract = c.executableContract
      if (entry.programSupport === "rules") assertRulesPacket(c)
      packets.push({ turn: f, index, archiveRedactionEscapeRepairs: decoded.repairedEscapes, initial: e.method === "turn/start", revision: contract?.revision, execution: contract?.outcome?.execution, returned: contract?.outcome?.returned ?? contract?.execution?.returned, remainingQuestionIds: c.remainingDuties?.map((q: any) => q.questionId), sourceWindowCount: c.alreadyReadSource?.length, omittedSource: c.omittedSource })
    }
  }
  rows.push({ position: entry.position, attempt: entry.attempt, status: entry.status, answerDelivery: entry.answerDelivery, skill: run.skill, codeEpoch: entry.codeEpoch, toolCounts, toolBudget: run.native?.toolBudget, sourceAccounting: run.sourceAccounting, program: entry.program, programSha256: entry.programSha256, programSupport: entry.programSupport, execution: run.domain?.executableContract?.resourceExecution, outcome: run.domain?.executableContract?.outcome, materialUses: run.domain?.executableContract?.materialUses, rawRevision: run.domain?.programDraft?.currentDraft?.revision, activeRevision: run.domain?.executableContract?.revision, firstAnswer: run.firstAnswer, delivery: run.delivery, packets, observedUsage: countObservedUsage(entry.turns ?? []), elapsedMs: entry.durationMs, providerRequests: entry.providerRequests, actualUsd: null })
}
await save(path.join(base, "evaluation/actual-use.json"), { rows, interpretation: "Host computation, model tool requests, received context and natural use are distinct. Receiving computed material is not proof of semantic adoption. Archived events are redacted copies of sent messages; named escape recovery permits host-structure inspection, not reconstruction of masked source text. Elapsed time is observed, not an isolated benchmark." })
const split = (predicate: (e: any) => boolean) => countObservedUsage(ledger.filter(predicate).flatMap(e => e.turns ?? []))
const accounting = { plannedPurposes: 9, attemptedPurposes: new Set(ledger.map(e => e.position)).size, deliveredPurposes: new Set(ledger.filter(e => e.answerDelivery === "delivered").map(e => e.position)).size, attempts: ledger.length, confirmations: ledger.filter(e => e.repairCause).length, author: split(e => e.position === "A-M"), consumers: split(e => e.position !== "A-M"), total: split(() => true), actualUsd: null, hiddenUpstreamRequests: null, developerCost: null, scoutCost: null, humanMinutes: null, notes: "Input includes cache once. Every observed turn retained, including interrupted/failed/final-child. Purpose count is not provider request count." }
await save(path.join(base, "accounting.json"), accounting)
await save(path.join(base, "evaluation/pending-accounting.json"), { incompletePurposes: ledger.filter(e => e.status === "running" || e.status === "unknown").map(e => e.position), instruction: "Observed totals exclude unseen usage of active or unknown requests; zero observed author turns is not zero author cost." })
console.log(JSON.stringify(accounting, null, 2))
