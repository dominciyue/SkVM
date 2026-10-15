import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const rows = []
for (const attempt of await load(path.join(base, "attempts.json"))) {
  if (!attempt.session || attempt.status === "running") continue
  const raw = path.join(repo, attempt.session, "raw"), prior: any[] = []
  let packets = 0, deltas = 0, finalChildren = 0, lastIndex: any[] = []
  const accept = (packet: any) => {
    if (!Number.isInteger(packet?.contextSequence)) return
    if (packet.contextSequence === 1) prior.length = 0
    if (packet.contextSequence !== prior.length + 1) throw new Error("Missing actual wire packet")
    const restored = resolveInquiryContext(packet, prior)
    const index = restored.currentContext?.sourceIndex ?? restored.sourceIndex
    if (index) lastIndex = index
    if (packet.currentContext?.sourceIndex?.sourceIndexDelta || packet.sourceIndex?.sourceIndexDelta) deltas++
    prior.push(restored); packets++
  }
  for (const name of (await readdir(raw)).filter(n => /^account-turn-\d+\.json$/.test(n)).sort()) {
    const turn = await load(path.join(raw, name))
    for (const event of turn.events) {
      if (event.direction !== "client") continue
      if (event.method === "thread/start" && event.params.dynamicTools?.length === 0) finalChildren++
      if (event.method === "turn/start") for (const item of event.params.input) {
        const marker = "Current local explanation context: ", text = item.text ?? "", offset = text.indexOf(marker)
        if (offset >= 0) accept(JSON.parse(text.slice(offset + marker.length)))
      }
      for (const item of event.result?.contentItems ?? []) {
        let value: any
        try { value = JSON.parse(item.text) } catch { continue }
        if (value.contextSequence) accept(value)
      }
    }
  }
  rows.push({ purpose: attempt.position, attempt: attempt.attempt, packets, deltaPackets: deltas, finalChildren, finalIndexCount: lastIndex.length, digestVerifiedFromSentPacketsOnly: true })
}
await writeFile(path.join(base, "verification/actual-wire.json"), JSON.stringify({ providerCalls: 0, rows }, null, 2) + "\n")
console.log(JSON.stringify(rows))
