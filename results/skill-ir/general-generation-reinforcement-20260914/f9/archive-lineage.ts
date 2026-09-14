import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"

const root = import.meta.dirname
const proposal = path.join(root, "cache-i18n-3/proposals/jit-optimize/bare-agent/xty--gpt-5.6-sol/skill/20260914T161741718Z")
const destination = path.join(root, "f9-9-lineage")
await mkdir(destination, { recursive: false })
const entries = []
for (const relative of [
  "meta.json", "history.json", "round-1-optimizer/submission.json", "round-1-optimizer/run-result.json",
  "round-1-optimizer/stdout.log", "round-1-repair-1-optimizer/submission.json",
  "round-1-repair-1-optimizer/run-result.json", "round-1-repair-1-optimizer/stdout.log",
  "round-1-validation/initial-report.json", "round-1-validation/repair-report.json", "round-1-validation/report.json",
]) {
  const source = path.join(proposal, relative)
  const bytes = await Bun.file(source).bytes()
  const compressed = relative.endsWith("stdout.log")
  const archived = relative + (compressed ? ".gz" : "")
  const target = path.join(destination, archived)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, compressed ? gzipSync(bytes) : bytes, { flag: "wx" })
  entries.push({ source, archived, bytes: bytes.length, compressed })
}
await writeFile(path.join(destination, "index.json"), JSON.stringify({
  sourceProposal: proposal, entries, archivedAt: new Date().toISOString(),
  note: "Exact selected event and validation records only. No provider configuration, credentials, or runtime cache copied. Recovery.json binds candidate files to these original records.",
}, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ destination, entries: entries.length }))
