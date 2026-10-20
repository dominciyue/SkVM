// Offline evidence reconstruction. No provider access.
import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { parseArchivedPacket } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/archive-packets.ts"
export const repo = path.resolve(import.meta.dir, "../../..")
export const root = path.join(repo, "results/skill-ir/skill-dsl-research/development")
export const base = path.join(root, "authorization-task-coverage-v1")
export const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
export const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex")
export const relative = (p: string) => path.relative(repo, p).replaceAll("\\", "/")
export async function save(p: string, data: unknown) { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8") }
export async function reconstructBR() {
  const br = path.join(root, "authorization-answer-transfer-v1"), ledger = await load(path.join(br, "attempts.json")), rows: any[] = []
  const targets = [
    { duty: "anonymous-entry", path: "server/api/v1/authz.go", startLine: 93, endLine: 118 },
    { duty: "public-and-bootstrap-registration", path: "server/api/v1/acl_config.go", startLine: 46, endLine: 79 },
    { duty: "conversion-creator", path: "server/api/v1/memo_service_converter.go", startLine: 26, endLine: 39 },
    { duty: "conversion-error-mapping", path: "server/api/v1/memo_share_service.go", startLine: 203, endLine: 213 },
  ]
  for (const e of ledger.filter((e: any) => /^M[01]-[NRE]$/.test(e.position))) {
    const run = await load(path.resolve(repo, e.session, "run.json")), turns = run.telemetry?.account?.turns ?? []
    const reads = (run.native?.history ?? []).filter((h: any) => h.call?.name === "source_read").map((h: any) => ({ arguments: h.call.arguments, exitCode: h.exitCode }))
    const sent: any[] = [], decodeErrors: any[] = []
    for (const [turnIndex, turn] of turns.entries()) for (const [eventIndex, event] of (turn.events ?? []).entries()) {
      if (event.direction !== "client") continue
      const messages = [...(event.result?.contentItems ?? []), ...(event.method === "turn/start" ? event.params?.input ?? [] : [])]
      for (const [itemIndex, item] of messages.entries()) {
        if (typeof item.text !== "string") continue
        const text = item.text.includes("Current local explanation context: ") ? item.text.split("Current local explanation context: ").at(-1)! : item.text
        let packet: any
        try { packet = parseArchivedPacket(text).packet } catch { if (text.trim().startsWith("{")) decodeErrors.push({ turnIndex, eventIndex, itemIndex }); continue }
        const walk = (value: any, pointer: string) => {
          if (!value || typeof value !== "object") return
          if (typeof value.path === "string" && typeof (value.text ?? value.quote) === "string") sent.push({ path: value.path, startLine: value.startLine, endLine: value.endLine, text: value.text ?? value.quote, pointer: `telemetry.account.turns[${turnIndex}].events[${eventIndex}].messages[${itemIndex}]${pointer}` })
          for (const [key, child] of Object.entries(value)) if (typeof child === "object") walk(child, `${pointer}.${key}`)
        }
        walk(packet, "")
      }
    }
    rows.push({ position: e.position, session: e.session, answerDelivery: e.answerDelivery, turns: turns.length, reads,
      targets: targets.map(t => ({ ...t, coveringReads: reads.filter((r: any) => r.arguments.path === t.path && r.arguments.startLine <= t.startLine && r.arguments.endLine >= t.endLine),
        sentWindows: sent.filter(s => s.path === t.path && s.startLine <= t.endLine && s.endLine >= t.startLine).map(s => ({ ...s, text: undefined, bodySha256: hash(s.text), coversRequiredSpan: s.startLine <= t.startLine && s.endLine >= t.endLine, relevantLines: s.text.split("\n").filter((l: string) => /IsPublicMethod|IsAuthBootstrapMethod|GetSharedMemo|listUsersByID|creator == nil|errMemoCreatorNotFound|failed to convert memo/.test(l)) })) })), decodeErrors })
  }
  await save(path.join(base, "evaluation/br-original-materials.json"), { providerCalls: 0, source: relative(path.join(br, "attempts.json")), rows, interpretation: "Actual client packet bodies and read requests are separate evidence. A source index alone is not a body. Missing extraction is not proof of absence if decodeErrors remain." })
  return rows.map(r => ({ position: r.position, turns: r.turns, reads: r.reads.length, targets: r.targets.map((t: any) => ({ duty: t.duty, reads: t.coveringReads.length, bodies: t.sentWindows.length })), decodeErrors: r.decodeErrors.length }))
}
if (import.meta.main) console.log(JSON.stringify(await reconstructBR(), null, 2))
