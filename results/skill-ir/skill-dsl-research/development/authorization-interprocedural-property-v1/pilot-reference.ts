import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { root, sha, write, preparePositionInput } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { isDelivered } from "./summarize.ts"

export function assertPilotReference(claim: Record<string, any>, report: Record<string, any>, expected: Record<string, any>) {
  const fields = ["entrance", "inputSha256", "originalTaskSha256", "runtimeTree", "model", "effort", "method", "strategy", "limits", "sourceFiles", "skillIdentity"]
  if (!isDelivered(report) || report.attemptId !== claim.attemptId || report.inputSha256 !== claim.inputSha256 || report.runtimeTree !== claim.runtimeTree || report.method !== claim.method || report.strategy !== claim.strategy || !report.actualModelInput?.fullOriginalBundlePrefixMatches || !report.actualModelInput?.originalQuestionTextPresent || fields.some(field => claim[field] == null || expected[field] == null || JSON.stringify(claim[field]) !== JSON.stringify(expected[field]))) throw new Error("Pilot reference requires a delivered current same-input/source/skill/epoch/model/budget/entrance/method attempt")
}
export function recordPilotReference(quality: Record<string, any>, record: Record<string, any>, revision?: string) {
  if (quality?.kind !== "quality" || quality.arm !== "M") throw new Error("Pilot reference requires a registered M quality position")
  if (!record.attemptId?.startsWith(`pilot-${quality.task}/`)) throw new Error("Reference requires the matching pilot task")
  if (quality.attempts.includes(record.attemptId)) throw new Error("Reference requires a new pilot observation")
  if (quality.attempts.length && (!revision || !/^[a-z0-9-]+$/.test(revision) || !record.attemptId.endsWith(`/${revision}`))) throw new Error("Preserve the original reference; a new epoch requires a named pilot revision")
  if (!quality.attempts.length && revision) throw new Error("The first pilot reference is unnamed")
  return { ...quality, attempts: [...quality.attempts, record.attemptId], status: "referenced-pilot", reference: record, referenceHistory: [...quality.referenceHistory ?? (quality.reference ? [quality.reference] : []), record] }
}
export async function referencePilot(qualityId: string, revision?: string) {
  const file = path.join(root, "manifest.json"), manifest = JSON.parse(await readFile(file, "utf8")), quality = manifest.positions.find((p: any) => p.id === qualityId)
  if (quality?.kind !== "quality" || quality.arm !== "M") throw new Error("Pilot reference requires a registered M quality position")
  const pilot = manifest.positions.find((p: any) => p.id === `pilot-${quality.task}`), attemptId = pilot.attempts.at(-1)
  if (!attemptId) throw new Error("Pilot reference needs an actual pilot")
  const directory = path.join(root, "attempts", attemptId), claimBytes = await readFile(path.join(directory, "claim.json")), reportBytes = await readFile(path.join(directory, "report.json")), claim = JSON.parse(claimBytes.toString("utf8")), report = JSON.parse(reportBytes.toString("utf8")), plan = await preparePositionInput(qualityId), loaded = await loadInquiryInput(plan.inputFile), original = await loadInquiryInput(plan.originalInputFile)
  assertPilotReference(claim, report, { entrance: quality.entrance, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, runtimeTree: plan.readiness.runtimeTree, model: plan.model, effort: plan.effort, method: plan.method, strategy: plan.strategy, limits: plan.limits, sourceFiles: plan.readiness.publicCheck.status === "valid" ? plan.readiness.publicCheck.sourceFiles : null, skillIdentity: plan.readiness.skillIdentity })
  const record = { schemaVersion: "authorization-bb-pilot-reference/v1", positionId: qualityId, attemptId, claimSha256: sha(claimBytes), reportSha256: sha(reportBytes), inputSha256: claim.inputSha256, runtimeTree: claim.runtimeTree, identical: ["complete input", "original task", "source files", "skill", "epoch", "model", "effort", "budget", "entrance", "method", "strategy"], independentSample: false, additionalModelCalls: 0, costDeduplicatedByAttemptId: true }
  const recorded = recordPilotReference(quality, record, revision)
  await mkdir(path.join(root, "references"), { recursive: true }); await write(path.join(root, "references", `${qualityId}${revision ? `-${revision}` : ""}.json`), record, true)
  Object.assign(quality, recorded)
  await write(file, manifest); return record
}
if (import.meta.main) console.log(JSON.stringify(await referencePilot(process.argv[2]!, process.argv[3])))
