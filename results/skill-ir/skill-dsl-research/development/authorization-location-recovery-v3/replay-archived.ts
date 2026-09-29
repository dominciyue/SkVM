import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { discoverAuthorizationEvidence, readDiscoveryWindows } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts"

const root = fileURLToPath(new URL(".", import.meta.url))
const archive = path.resolve(root, "../authorization-bounded-preparation-v2")
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const records: Array<Record<string, unknown>> = []
const counts = { noLiteralHit: 0, rangeUniqueOutsideDuplicates: 0, globallyUnique: 0, other: 0 }
for (const caseId of (await readdir(path.join(archive, "inputs"))).sort()) {
  const dir = path.join(archive, "inputs", caseId)
  let proposal: any
  try { proposal = await json(path.join(dir, "automatic-v2/proposal.json")) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
    throw error
  }
  const input = await json(path.join(dir, "source-input.json"))
  for (const dependency of proposal.dependencies) {
    if (dependency.match === undefined) continue
    const file = path.resolve(dir, input.sourceRoot, dependency.path)
    const content = await readFile(file, "utf8")
    const hits = content.replace(/\r?\n$/, "").split(/\r?\n/).flatMap((line, i) => line.includes(dependency.match) ? [i + 1] : [])
    const ranged = hits.filter(line => line >= dependency.startLine && line <= dependency.endLine)
    const classification = !hits.length ? "noLiteralHit" : hits.length === 1 && ranged.length === 1 ? "globallyUnique" : ranged.length === 1 && hits.length > 1 ? "rangeUniqueOutsideDuplicates" : "other"
    counts[classification]++
    records.push({ caseId, proposal: `inputs/${caseId}/automatic-v2/proposal.json`, id: dependency.id, path: dependency.path, startLine: dependency.startLine, endLine: dependency.endLine, match: dependency.match, sourceSha256: digest(content), hits, rangedHits: ranged, classification })
  }
}
if (records.length !== 34 || counts.noLiteralHit !== 25 || counts.rangeUniqueOutsideDuplicates !== 3 || counts.globallyUnique !== 6 || counts.other) throw new Error(`Archived locator classification differs: ${JSON.stringify(counts)}`)
const failedDir = path.join(archive, "inputs/memos-get-shared")
const failedAccountPath = path.join(failedDir, "automatic-v2.attempts-7nUK5n/account.json")
const account = await json(failedAccountPath)
const response = JSON.parse(account.attempts[0].response.text)
const request = await json(path.join(failedDir, "seed-request.json"))
const discovery = await discoverAuthorizationEvidence({ inputFile: path.join(failedDir, "source-input.json"), request })
let currentReplay: unknown
try { currentReplay = await readDiscoveryWindows(discovery, response.reads) } catch (error) { currentReplay = { error: String(error) } }
const reads = response.reads.map((read: any) => {
  const symbols = discovery.symbols.filter(s => s.path === read.path)
  return { ...read, indexedCandidates: symbols.map(s => ({ id: s.id, name: s.name, startLine: s.startLine, endLine: s.endLine })) }
})
const result = { schemaVersion: "authorization-archived-location-reproduction/v1", providerCalls: 0, targetExecutions: 0, counts, records, failedGetShared: { account: "inputs/memos-get-shared/automatic-v2.attempts-7nUK5n/account.json", accountSha256: digest(await readFile(failedAccountPath, "utf8")), archivedStatus: account.status, archivedDiagnostics: account.diagnostics, reads, currentReplay } }
if (process.argv.includes("--write")) await writeFile(path.join(root, "archived-reproduction.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ providerCalls: 0, fields: records.length, counts, failedReads: reads.length, currentReplay: "error" in (currentReplay as any) ? currentReplay : { resolvedWindows: (currentReplay as any).windows?.length, outcomes: (currentReplay as any).outcomes } }, null, 2))
