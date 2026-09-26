import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const config = await read(path.join(root, "panel-config.json"))
const rows: Record<string, unknown> = {}
const allowed = new Set(["supported", "contradicted", "missing", "uncertain"])
for (const item of config.cases) {
  const packet = await read(path.join(root, "evaluator", "review-packets", item.id + ".json"))
  const draft = await read(path.join(root, "evaluator", "review-drafts", item.id + ".json"))
  if (draft.schemaVersion !== "authorization-ah-blind-decisions/v1" || draft.caseId !== item.id) throw Error("Invalid draft identity: " + item.id)
  const expectedRows = packet.rows.map((row: any) => row.anonymousId).sort()
  if (JSON.stringify(Object.keys(draft.rows).sort()) !== JSON.stringify(expectedRows)) throw Error("Draft rows differ: " + item.id)
  const expectedCriteria = packet.rubric.criteria.map((criterion: any) => criterion.id).sort()
  for (const id of expectedRows) {
    const decision = draft.rows[id]
    if (JSON.stringify(Object.keys(decision.criteria ?? {}).sort()) !== JSON.stringify(expectedCriteria)) throw Error("Criterion set differs: " + id)
    for (const assessment of [...Object.values(decision.criteria), decision.disposition, decision.scope] as any[]) {
      if (!assessment || !allowed.has(assessment.status) || typeof assessment.reason !== "string" || !assessment.reason.trim() ||
          !(assessment.answerLocation === null || (typeof assessment.answerLocation === "string" && assessment.answerLocation.trim()))) throw Error("Invalid assessment: " + id)
    }
    rows[id] = { ...decision, reviewer: draft.reviewer }
  }
}
await writeFile(path.join(root, "evaluator", "review-decisions.json"), JSON.stringify({
  schemaVersion: "authorization-ah-blind-decisions-combined/v1", rows,
}, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ status: "collected", rows: Object.keys(rows).length, cases: config.cases.length }))
