import { readdir } from "node:fs/promises"
import path from "node:path"
import { base, load, save, relative } from "./study.ts"
import { resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
const bq = path.resolve(base, "../authorization-source-program-consistency-v1")
const rows: any[] = []
for (const position of ["T-E", "U-E"]) {
  const sessions = path.join(bq, `runs/${position}-first/sessions`), session = path.join(sessions, (await readdir(sessions))[0]!)
  const history: any[] = []
  for (const file of (await readdir(path.join(session, "raw"))).filter(f => /^account-turn-\d+.json$/.test(f)).sort()) {
    const turn = await load(path.join(session, "raw", file)), packets: any[] = []
    for (const [eventIndex, e] of turn.events.entries()) {
      if (e.direction !== "client") continue
      const text = e.method === "turn/start" ? e.params.input[0].text.split("Current local explanation context: ")[1] : e.result?.contentItems?.[0]?.text
      if (!text?.startsWith("{")) continue
      const wire = JSON.parse(text), packet = wire.contextSequence ? resolveInquiryContext(wire, history) : wire
      if (wire.contextSequence) history.push(wire)
      const c = packet.currentContext ?? packet, contract = c.executableContract, outcome = contract?.outcome
      packets.push({ eventIndex, initial: e.method === "turn/start", keys: Object.keys(c), revision: contract?.revision, execution: outcome?.execution, executionGaps: outcome?.executionGaps, coverageGaps: outcome?.coverageGaps, rules: contract?.rules?.map((s: any) => s.id), questions: contract?.questions, remainingDuties: c.remainingDuties,
        skippedMarkedUnresolved: Object.entries(outcome?.returnBasis?.fields ?? {}).flatMap(([field, b]: any) => b.kinds.includes("unresolved-external-fact") ? b.dependencies.filter((d: any) => d.op === "external" && d.outcome === "skipped").map((d: any) => ({ field, dependency: d.id, outcome: d.outcome })) : []),
        omittedSource: c.omittedSource, omittedModelViews: c.omittedModelViews, tool: packet.toolResult && { status: packet.toolResult.status, revision: packet.toolResult.revision }, sourceWindowCount: c.alreadyReadSource?.length })
    }
    rows.push({ position, file: relative(path.join(session, "raw", file)), status: turn.status, answerDelivery: turn.answerDelivery, packets: packets.length, initial: packets.find(p => p.initial), lastToolReply: packets.filter(p => !p.initial).at(-1), currentOutcomePackets: packets.filter(p => p.execution).map(p => ({ eventIndex: p.eventIndex, execution: p.execution, gaps: p.executionGaps, staticSkippedMislabels: p.skippedMarkedUnresolved.length })) })
  }
}
await save(path.join(base, "diagnosis.json"), { providerCalls: 0, source: "actual archived client turn/start and tool result packets; deterministic reference reconstruction", rows,
  conclusions: [
    { issue: "root fallback and constructor ordering omission", class: "sent-but-not-fully-used", evidence: "T-E current rules contain root and constructor branch logic; original questions remain. U-E final context receives same rules and sourced windows; U-E answer explains these correctly. No transport truncation established." },
    { issue: "malformed version residual", class: "model-overgeneralization", evidence: "T-E answer claims unresolved residual; current raw implements not-found, independent registered invalid-version replay has no execution conditions. The broader coverage statement is not the actual input result." },
    { issue: "skipped external dependency label", class: "anonymous-reproduction-not-observed-in-BQ-packets", code: "src/task-dsl/authorization/program-outcome.ts:returnBasis", evidence: "Actual U-E computed packets have empty executionGaps; none of their returned fields transitively references an external step, so this label did not cause the BQ omissions. An anonymous choose return that references a skipped external branch reproduces the misleading unresolved-external-fact label. Shared red-green corrects that boundary to unexecuted-external-branch; no new evaluation or claimed BQ effect." },
    { issue: "scout final-child conflict", class: "rejected-review-claim", evidence: "Chinese 无工具final-child means tools-free child, not absence of child; U-E turn2 tools=[] and completed is consistent with execution.md:36. Do not modify historical record." },
    { issue: "scout returnBasis absent", class: "rejected-review-claim", evidence: "Actual client turn/start and replies contain returnBasis; scout searched summary layers only. Rows above inspect original packets." }
  ] })
console.log(JSON.stringify(rows.map(r => ({ position: r.position, file: r.file, packets: r.packets, initialExecution: r.initial?.execution, skippedMislabels: r.initial?.skippedMarkedUnresolved?.length, lastTool: r.lastToolReply?.eventIndex }))))
