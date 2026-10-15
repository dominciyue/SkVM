import { readFile, readdir, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { createInquiryContextEncoder, resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { projectProgramConsumption } from "../../../../../src/task-dsl/authorization/program-consumption-context.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), priorBase = path.resolve(base, "../authorization-purpose-scoped-program-v1")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8")), bytes = (v: any) => Buffer.byteLength(JSON.stringify(v))
export async function analyzeWire() {
  const rows = []
  for (const attempt of (await load(path.join(priorBase, "attempts.json"))).filter((a: any) => ["B0", "C0", "C1", "B1"].includes(a.position))) {
    const raw = path.resolve(repo, attempt.session, "raw"), history: any[] = [], details: any[] = []
    let packets = 0, deltas = 0, references = 0, children = 0, baselineBytes = 0, projectedBytes = 0
    let baselineEncoder = createInquiryContextEncoder({ sourceIndexDelta: true }), projectedEncoder = createInquiryContextEncoder({ sourceIndexDelta: true })
    const accept = (packet: any, location: string) => {
      if (!packet?.contextSequence) return
      if (packet.contextSequence === 1) { history.length = 0; baselineEncoder = createInquiryContextEncoder({ sourceIndexDelta: true }); projectedEncoder = createInquiryContextEncoder({ sourceIndexDelta: true }) }
      const restored = resolveInquiryContext(packet, history); history.push(restored); packets++
      deltas += JSON.stringify(packet).includes('"sourceIndexDelta"') ? 1 : 0
      references += (JSON.stringify(packet).match(/"contextReference"/g) ?? []).length
      const { contextSequence: _, ...input } = restored, projected = structuredClone(input), result = projected.toolResult
      // Details-only shape; no other tool is treated as a details response.
      if (result?.view === "active" && Array.isArray(result.steps) && Array.isArray(result.events) && result.events.length) {
        const compact = projectProgramConsumption({ resourceExecution: { events: result.events }, program: { resourceWorkflow: { steps: result.steps } } }, [], "compact")
        const before = bytes(result), rawEvents = result.events
        result.events = compact.steps
        delete result.program; delete result.execution; delete result.currentDraft
        details.push({ location, revision: result.revision, steps: result.steps.length, events: rawEvents.length, beforeDecodedBytes: before, afterDecodedBytes: bytes(result), removedPaths: ["events[].inputs.candidates", "events[].inputs.rows", "events[].inputs.expression", "events[].inputs.externalMatch.instruction"], rawRetrievalRequired: true })
      }
      baselineBytes += baselineEncoder(input).sentBytes; projectedBytes += projectedEncoder(projected).sentBytes
    }
    for (const name of (await readdir(raw)).filter(n => /^account-turn-\d+\.json$/.test(n)).sort()) {
      const turn = await load(path.join(raw, name))
      for (const [i, event] of turn.events.entries()) {
        if (event.direction !== "client") continue
        if (event.method === "thread/start" && event.params.dynamicTools?.length === 0) children++
        if (event.method === "turn/start") for (const item of event.params.input) { const marker = "Current local explanation context: ", start = (item.text ?? "").indexOf(marker); if (start >= 0) accept(JSON.parse(item.text.slice(start + marker.length)), `${name}:events[${i}].params.input`) }
        for (const item of event.result?.contentItems ?? []) { let p: any; try { p = JSON.parse(item.text) } catch { continue }; accept(p, `${name}:events[${i}].result.contentItems`) }
      }
    }
    rows.push({ purpose: attempt.position, session: attempt.session, packets, deltaPackets: deltas, references, finalChildren: children, details, sameEncoderCounterfactual: { baselineBytes, projectedBytes, savedBytes: baselineBytes - projectedBytes }, claim: "Counterfactual re-encoding of actual sent packets, not observed token savings; raw details remain retrievable." })
  }
  await mkdir(path.join(base, "verification"), { recursive: true })
  await writeFile(path.join(base, "verification/bn-wire-analysis.json"), JSON.stringify({ providerCalls: 0, oldEvidenceUnchanged: true, rows }, null, 2) + "\n")
  return rows
}
if (import.meta.main) console.log(JSON.stringify(await analyzeWire()))
