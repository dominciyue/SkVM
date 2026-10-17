import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { base, repo, load, save, hash } from "./study.ts"
const forbidden = new Set(["resourceExecution", "executableContract", "outcome", "events", "returned", "propertyChecks", "candidatePreviewAvailable", "trialResults"])
export function wireTurnRecords(files: Array<{ name: string; text: string }>) {
  const turns = files.filter(f => /^account-turn-\d+\.json$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (turns.length) return { completeArchive: true, turns: turns.map(f => JSON.parse(f.text)) }
  const partial = files.find(f => f.name === "lifecycle.jsonl")
  if (!partial) throw new Error("No retained wire evidence")
  return { completeArchive: false, turns: [{ events: partial.text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) }] }
}
export function rulesResultPaths(value: unknown, at = "$", found: string[] = []): string[] {
  if (typeof value === "string") { if (/^\s*[\[{]/.test(value)) try { rulesResultPaths(JSON.parse(value), at + "<json>", found) } catch {} ; return found }
  if (!value || typeof value !== "object") return found
  for (const [key, child] of Object.entries(value)) {
    if (["raw", "steps", "ruleDocument", "sourceWindow", "sourceWindows"].includes(key)) continue
    if (forbidden.has(key)) found.push(`${at}.${key}`)
    else rulesResultPaths(child, `${at}.${key}`, found)
  }
  return found
}
export function assessWireRows(rows: Array<{ position: string; attempt: string; sourceSets: unknown[][]; firstRule?: string; ruleHashes: string[] }>) {
  const sources = rows.flatMap(r => r.sourceSets)
  if (sources.some(s => !isDeepStrictEqual(s, sources[0]))) throw new Error("Actual source tool definitions differ")
  const paired = rows.filter(r => /^Q/.test(r.position) && !r.position.includes("R0") && r.attempt === "first")
  const hashes = paired.flatMap(r => r.ruleHashes)
  if (hashes.some(h => h !== hashes[0])) throw new Error("Actual fixed consumer rule differs in sent packets")
  return {
    identicalSourceTools: rows.length > 0 && rows.every(r => r.sourceSets.length > 0 && r.sourceSets.every(s => s.length > 0)),
    identicalFixedRules: paired.length > 0 && paired.every(r => !!r.firstRule && r.ruleHashes.length > 0 && r.ruleHashes.includes(r.firstRule)),
  }
}
export async function verifyWire() {
  const rows = [], ledger: any[] = await load(path.join(base, "attempts.json"))
  for (const attempt of ledger) {
    if (!attempt.session || attempt.status === "running") continue
    const raw = path.join(repo, attempt.session, "raw"), prior: any[] = [], sourceSets: unknown[][] = []
    let packets = 0, deltas = 0, finalChildren = 0, executionContexts = 0, firstRule: string | undefined
    const violations: string[] = [], rules = attempt.programSupport === "rules", ruleHashes = new Set<string>()
    const inspect = (value: any) => {
      if (rules) violations.push(...rulesResultPaths(value))
      const context = value.currentContext ?? value
      if (context.ruleDocument) { const digest = hash(JSON.stringify(context.ruleDocument)); firstRule ??= digest; ruleHashes.add(digest) }
      if (context.outcome || context.resourceExecution || context.executableContract) executionContexts++
    }
    const accept = (packet: any) => {
      if (!Number.isInteger(packet?.contextSequence)) { inspect(packet); return }
      if (packet.contextSequence === 1) prior.length = 0
      if (packet.contextSequence !== prior.length + 1) throw new Error("Missing actual wire packet")
      const restored = resolveInquiryContext(packet, prior)
      if (packet.currentContext?.sourceIndex?.sourceIndexDelta || packet.sourceIndex?.sourceIndexDelta) deltas++
      prior.push(restored); packets++; inspect(restored)
    }
    const names = (await readdir(raw)).filter(n => /^account-turn-\d+\.json$/.test(n) || n === "lifecycle.jsonl")
    const retained = wireTurnRecords(await Promise.all(names.map(async name => ({ name, text: await readFile(path.join(raw, name), "utf8") }))))
    for (const turn of retained.turns) {
      for (const event of turn.events) {
        if (event.direction !== "client") continue
        if (event.method === "thread/start") {
          const tools = event.params.dynamicTools ?? []
          if (!tools.length) finalChildren++
          else sourceSets.push(tools.filter((t: any) => t.name.startsWith("source_")).map(({ type: _type, ...t }: any) => t))
          if (rules && tools.some((t: any) => t.name === "authorization_program_trial")) violations.push("advertised trial")
          if (attempt.baseline && tools.some((t: any) => t.name.startsWith("authorization_"))) violations.push("baseline domain tool")
        }
        if (event.method === "turn/start") for (const item of event.params.input) {
          const marker = "Current local explanation context: ", text = item.text ?? "", offset = text.indexOf(marker)
          if (offset >= 0) accept(JSON.parse(text.slice(offset + marker.length)))
        }
        for (const item of event.result?.contentItems ?? []) {
          let value: any; try { value = JSON.parse(item.text) } catch { continue }
          accept(value)
        }
      }
    }
    if (violations.length) throw new Error(`Wire isolation failed ${attempt.position}: ${JSON.stringify([...new Set(violations)])}`)
    rows.push({ position: attempt.position, attempt: attempt.attempt, packets, deltaPackets: deltas, finalChildren, executionContexts, firstRule, ruleHashes: [...ruleHashes], sourceSets, rulesIsolation: rules ? "passed" : "not-applicable", completeArchive: retained.completeArchive, digestVerifiedFromSentPacketsOnly: packets > 0 })
  }
  const assessment = assessWireRows(rows)
  const result = { providerCalls: 0, rows, ...assessment }
  await save(path.join(base, "verification/actual-wire.json"), result); return { attempts: rows.length, ...assessment }
}
if (import.meta.main) console.log(JSON.stringify(await verifyWire()))
