import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const raw = await read(path.join(root, "evaluator", "review-decisions.json"))
const packets = new Map<string, any>()
for (const id of ["owui-file", "owui-text", "owui-header", "fastapi-foreign-update", "gitea-collaborator", "gitea-assignee", "gitea-lock", "fastapi-superuser-read"]) {
  const packet = await read(path.join(root, "evaluator", "review-packets", id + ".json"))
  for (const row of packet.rows) packets.set(row.anonymousId, row)
}
let converted = 0
function normalize(location: string | null): string | null {
  if (location === null || location.startsWith("/")) return location
  const pointer = "/" + location.replaceAll(/\[(\d+)\]/g, "/$1").replaceAll(".", "/")
  converted++
  return pointer
}
function resolves(value: unknown, pointer: string): boolean {
  let current: any = value
  for (const part of pointer.slice(1).split("/")) {
    if (current === null || typeof current !== "object" || !(part in current)) return false
    current = current[part]
  }
  return true
}
for (const [id, decision] of Object.entries(raw.rows) as [string, any][]) {
  const row = packets.get(id)
  if (!row) throw Error("Unknown anonymous review row: " + id)
  for (const assessment of [...Object.values(decision.criteria), decision.disposition, decision.scope] as any[]) {
    assessment.answerLocation = normalize(assessment.answerLocation)
    if (assessment.answerLocation !== null && !resolves(row.result, assessment.answerLocation)) {
      throw Error("Review location does not resolve: " + id + " " + assessment.answerLocation)
    }
  }
}
await writeFile(path.join(root, "evaluator", "review-decisions-normalized.json"), JSON.stringify(raw, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(root, "evaluator", "review-format-correction.json"), JSON.stringify({
  schemaVersion: "authorization-ah-review-format-correction/v1",
  reason: "The blind reviewer instructions used dot/bracket examples, while the existing review validator requires RFC 6901 JSON pointers.",
  source: "review-decisions.json", output: "review-decisions-normalized.json",
  convertedLocations: converted,
  semanticStatusesReasonsAndRawAnswersChanged: false,
  validation: "Every non-null normalized location resolved against its anonymous answer before evaluation.",
  providerCalls: 0,
}, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ status: "normalized", rows: packets.size, convertedLocations: converted }))
