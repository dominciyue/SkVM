import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const read = async (file: string) => JSON.parse(await readFile(path.join(root, "evaluator", file), "utf8"))
const selected = await read("independent-check-selection.json")
const adjudications = await read("adjudications.json")
const decisions = await read("review-decisions-valid.json")
const selectedRows = new Set<string>(selected.groups.flatMap((group: { rows: string[] }) => group.rows))
if (selectedRows.size !== 9 || adjudications.decisions.length !== selectedRows.size) throw Error("Expected nine unique selected rows")
const seen = new Set<string>()
for (const item of adjudications.decisions) {
  if (!selectedRows.has(item.row) || seen.has(item.row) || !decisions.rows[item.row]) throw Error("Invalid adjudication row: " + item.row)
  seen.add(item.row)
  if (item.resolution === "retain") {
    if (item.correction) throw Error("Retained row has correction: " + item.row)
    continue
  }
  if (item.resolution !== "correct-one-criterion" || !item.correction) throw Error("Invalid resolution: " + item.row)
  const criterion = decisions.rows[item.row].criteria[item.correction.criterion]
  if (!criterion || criterion.status !== item.correction.fromStatus) throw Error("Original criterion mismatch: " + item.row)
  criterion.status = item.correction.toStatus
  criterion.answerLocation = item.correction.answerLocation
  criterion.reason = item.correction.reason
}
const file = path.join(root, "evaluator", "review-decisions-adjudicated.json")
await writeFile(file, JSON.stringify(decisions, null, 2) + "\n")
console.log(JSON.stringify({ status: "adjudicated", rows: seen.size, corrections: adjudications.decisions.filter((item: { correction?: unknown }) => item.correction).length }))
