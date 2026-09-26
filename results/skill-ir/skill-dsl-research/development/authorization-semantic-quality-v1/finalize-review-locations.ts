import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const source = path.join(root, "evaluator", "review-decisions-normalized.json")
const review = JSON.parse(await readFile(source, "utf8"))
const nullified: string[] = []
for (const [id, row] of Object.entries(review.rows) as [string, any][]) {
  for (const [name, assessment] of [
    ...Object.entries(row.criteria), ["disposition", row.disposition], ["scope", row.scope],
  ] as [string, any][]) {
    if (assessment.status === "missing" && assessment.answerLocation !== null) {
      assessment.answerLocation = null
      nullified.push(id + "/" + name)
    }
    if (["supported", "contradicted"].includes(assessment.status) && assessment.answerLocation === null) {
      throw Error("Nonmissing review lacks an answer location: " + id + "/" + name)
    }
  }
}
await writeFile(path.join(root, "evaluator", "review-decisions-valid.json"), JSON.stringify(review, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(root, "evaluator", "review-location-nullification.json"), JSON.stringify({
  schemaVersion: "authorization-ah-review-location-nullification/v1",
  reason: "The existing validator requires null answerLocation for a missing finding; reviewer status and reason are preserved.",
  source: "review-decisions-normalized.json", output: "review-decisions-valid.json",
  nullified, semanticStatusesReasonsAndRawAnswersChanged: false, providerCalls: 0,
}, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ status: "valid-locations", nullified: nullified.length }))
