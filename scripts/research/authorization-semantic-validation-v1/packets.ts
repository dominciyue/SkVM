import path from "node:path"
import { inspectPackets } from "../authorization-task-coverage-v1/packets.ts"
import { base, repo, load, save } from "./evidence.ts"

export async function audit() {
  const rows: any[] = []
  for (const entry of await load(path.join(base, "attempts.json"))) {
    if (!entry.session || entry.lifecycle?.localExecution !== "closed") continue
    const run = await load(path.resolve(repo, entry.session, "run.json"))
    rows.push({ position: entry.position, attempt: entry.attempt, session: entry.session, ...inspectPackets(run, entry.programSupport === "rules") })
  }
  await save(path.join(base, "evaluation/client-packets.json"), { providerCalls: 0, originalPacketsRetained: true, rows,
    interpretation: "Packet result delivery is observed evidence, not natural adoption. Review actual answers; decoding errors prevent absence claims." })
  return rows.map(r => ({ position: r.position, bodies: r.bodies.length, executions: r.executions.length, decodeErrors: r.decodeErrors.length, rulesViolations: r.rulesViolations.length }))
}
if (import.meta.main) console.log(JSON.stringify(await audit(), null, 2))
