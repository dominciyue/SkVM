import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
const historical = path.resolve(import.meta.dir, "../authorization-task-contract-v1")
const clean = (text: string) => text.replace(/[`*_#]/g, "").replace(/\s+/g, " ").trim()
const records = []
for (const id of ["memos-space-policy", "paperless-note-premise"]) {
  const relative = `authors/${id}-markdown-original/revision.response.json`, raw = await readFile(path.join(historical, relative), "utf8"), text = JSON.parse(raw).text
  const delivery = JSON.parse(await readFile(path.join(historical, `authors/${id}-markdown-original/delivery.json`), "utf8")), changed = JSON.parse(await readFile(path.join(historical, `authors/${id}-markdown-changed/delivery.json`), "utf8"))
  const current = JSON.parse(await readFile(path.join(historical, `author-context/${id}/task-authoring/original.selected.json`), "utf8"))
  const expected = id === "memos-space-policy" ? ["deny"] : current.cases.map((c: any) => c.premises[0].statement)
  const punctuationNeutral = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9_ ]/g, "").replace(/\s+/g, " ")
  const snippets = id === "memos-space-policy" ? text.split("\n").filter((s: string) => /Expected policy result|Relation:|Operation:|ordinary.*non-administrator/i.test(s)) : text.split("\n").filter((s: string) => /At handler entry, the caller has global|Owner presence is unspecified|Expected policy result|not-owner/i.test(s))
  records.push({ id, response: relative, sha256: createHash("sha256").update(raw).digest("hex"), kind: "original-draft-diagnostic-revision", originalStatus: delivery.status, originalDiagnostics: delivery.finalDiagnostics, exactRequiredMatch: expected.map((s: string) => clean(text).includes(clean(s))), spellingOnlyComparison: expected.map((s: string) => punctuationNeutral(text).includes(punctuationNeutral(s))), snippets, newReviewScope: "Named actor/negation/permission/premise facts only; no wholesale AN rescoring", semanticReview: { reviewer: "development-agent", judgment: "The named denial and permission/owner premises preserve the current requirement; exact lowercase or comma placement is not a semantic acceptance criterion.", fullArtifactEquivalent: "unreviewed" }, changedRow: { status: changed.status, calls: changed.calls }, derivedConsumption: "Historical blocked rows remain unexecuted; no successful outcome is imputed" })
}
const report = { schemaVersion: "authorization-ao-an-calibration/v1", date: "2026-10-01", providerCalls: 0, originalsModified: false, historicalCountsRewritten: false, records,
  oldGetSharedMemoClassification: { normativeField: "Policy includes no authentication, exact memo token scope, and NOT_FOUND on inaccessible/invalid/expired shares", provenance: "The old task author wrote source-derived behavior into a normative field; source-only conditions and uncertainty were already organized before analysis", rawOriginal: "quality/q12/sessions/20260929T191405679Z-b203adc1/run.json", actualBehaviorEvidence: "Source must be read during the new behavior inquiry", oracle: "Historical evaluator stays separate; its expectations are never transferred into new briefs", newBrief: "inputs/memos-share.json supplies a behavior question only, without that policy or an expected outcome" } }
await writeFile(path.join(import.meta.dir, "an-calibration.json"), JSON.stringify(report, null, 2) + "\n", "utf8")
console.log(JSON.stringify(records.map(r => ({ id: r.id, exact: r.exactRequiredMatch, spellingOnly: r.spellingOnlyComparison, snippets: r.snippets })), null, 2))
