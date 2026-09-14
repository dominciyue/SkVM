import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"

const [proposalArg, destinationArg] = process.argv.slice(2)
if (!proposalArg || !destinationArg) throw new Error("Expected proposal and new archive directory")
const proposal = path.resolve(proposalArg)
const destination = path.resolve(destinationArg)
await mkdir(destination, { recursive: false })
const entries = []
const files = ["meta.json", "history.json"]
for (const pattern of [
  "round-*-optimizer/submission.json", "round-*-optimizer/run-result.json",
  "round-*-optimizer/stdout.log", "round-*-validation/*report.json",
]) {
  for await (const file of new Bun.Glob(pattern).scan({ cwd: proposal })) files.push(file)
}
for (const relative of [...new Set(files)].sort()) {
  const source = path.join(proposal, relative)
  if (!await Bun.file(source).exists()) continue
  const bytes = await Bun.file(source).bytes()
  const compressed = relative.endsWith("stdout.log")
  const archived = relative.replaceAll("\\", "/") + (compressed ? ".gz" : "")
  const target = path.join(destination, archived)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, compressed ? gzipSync(bytes) : bytes, { flag: "wx" })
  entries.push({ source, archived, bytes: bytes.length, compressed })
}
await writeFile(path.join(destination, "index.json"), JSON.stringify({
  sourceProposal: proposal, entries, archivedAt: new Date().toISOString(),
  note: "Only selected optimizer/validation records. No model config or credentials copied. Candidate packages are preserved separately without manual edits.",
}, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ destination, entries: entries.length }))
