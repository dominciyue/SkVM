// Offline audit of actual client packets, never made visible to consumers.
import path from "node:path"
import { base, repo, load, save, hash } from "./evidence.ts"
import { parseArchivedPacket } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/archive-packets.ts"
import { assertRulesPacket } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"

export function inspectPackets(run: any, rules: boolean) {
  const bodies: any[] = [], revisions: any[] = [], executions: any[] = [], questions: any[] = [], decodeErrors: any[] = [], rulesViolations: any[] = [], repairedEscapes: any[] = []
  for (const [ti, turn] of (run.telemetry?.account?.turns ?? []).entries()) for (const [ei, event] of (turn.events ?? []).entries()) {
    if (event.direction !== "client") continue
    const items = [...(event.result?.contentItems ?? []), ...(event.method === "turn/start" ? event.params?.input ?? [] : [])]
    for (const [ii, item] of items.entries()) {
      if (typeof item.text !== "string") continue
      const marker = "Current local explanation context: ", text = item.text.includes(marker) ? item.text.split(marker).at(-1)! : item.text
      const location = `telemetry.account.turns[${ti}].events[${ei}].items[${ii}]`
      let decoded: any
      try { decoded = parseArchivedPacket(text) } catch (error) { if (text.trim().startsWith("{")) decodeErrors.push({ location, error: String(error) }); continue }
      if (decoded.repairedEscapes) repairedEscapes.push({ location, count: decoded.repairedEscapes })
      if (rules) try { assertRulesPacket(decoded.packet) } catch (error) { rulesViolations.push({ location, error: String(error) }) }
      const walk = (value: any, pointer: string) => {
        if (!value || typeof value !== "object") return
        if (typeof value.path === "string" && typeof (value.text ?? value.quote) === "string") bodies.push({ pointer, path: value.path, startLine: value.startLine, endLine: value.endLine, bodySha256: hash(value.text ?? value.quote) })
        for (const [key, child] of Object.entries(value)) {
          if (/^(revision|activeRevision|candidateRevision|sourceProgramRevision)$/.test(key) && typeof child === "string") revisions.push({ pointer: `${pointer}.${key}`, value: child })
          if (key === "resourceExecution" || key === "outcome") executions.push({ pointer: `${pointer}.${key}`, value: child })
          if (key === "originalRequest" || key === "questions" || key === "remainingDuties") questions.push({ pointer: `${pointer}.${key}`, value: child })
          if (typeof child === "object") walk(child, `${pointer}.${key}`)
        }
      }
      walk(decoded.packet, location)
    }
  }
  return { bodies, revisions, executions, questions, decodeErrors, rulesViolations, repairedEscapes }
}

export async function audit() {
  const rows: any[] = []
  for (const entry of await load(path.join(base, "attempts.json"))) {
    if (!entry.session || entry.lifecycle?.localExecution !== "closed") continue
    const run = await load(path.resolve(repo, entry.session, "run.json"))
    const result = inspectPackets(run, (entry.effectiveProgramSupport ?? entry.programSupport) === "rules")
    rows.push({ position: entry.position, attempt: entry.attempt, session: entry.session, ...result })
  }
  await save(path.join(base, "evaluation/client-packets.json"), { providerCalls: 0, originalPacketsRetained: true, rows, interpretation: "Bodies, revisions and result delivery are packet observations. Natural adoption requires answer review. Decode errors prevent absence claims. Source indexes alone are not bodies." })
  return rows.map(r => ({ position: r.position, bodies: r.bodies.length, revisions: r.revisions.length, executions: r.executions.length, decodeErrors: r.decodeErrors.length, rulesViolations: r.rulesViolations.length }))
}
if (import.meta.main) console.log(JSON.stringify(await audit(), null, 2))
