import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { limits, type Position } from "../authorization-semantic-submission-v1/study.ts"
export { limits }
export const identity = "authorization-interprocedural-property-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "pilot-download", stage: "BB9", kind: "pilot", task: "download", entrance: "native" },
    { id: "pilot-owui", stage: "BB10", kind: "pilot", task: "owui", entrance: "native" },
  ]
  for (const [task, arms] of [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const)
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}`, stage: "BB11", kind: "quality", task, entrance: "native", arm })
  rows.push({ id: "consumer-download-inquiry", stage: "BB12", kind: "consumer", task: "download", entrance: "inquiry" }, { id: "consumer-owui-native", stage: "BB12", kind: "consumer", task: "owui", entrance: "native" })
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "BB13", kind: "change", task: "download", entrance: "inquiry", arm })
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}
export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("BB output identity: refuse historical or shared output directory")
}
export async function extractOriginalRegression() {
  const historical = path.resolve(root, "../authorization-semantic-submission-v1"), entries = []
  for (const attemptId of ["pilot-download/transaction-priority-1", "pilot-owui/original"]) {
    const file = path.join(historical, "attempts", attemptId, "run-result.json.gz"), bytes = await readFile(file)
    const native = JSON.parse(gunzipSync(bytes).toString("utf8")).authorizationInquiry, domain = native.domain
    entries.push({ attemptId, originalFile: file, sha256: sha(bytes), jsonPath: "$.authorizationInquiry.domain", original: { materials: domain.sourceMaterials.materials.length, materialUses: domain.materialUses.length, checkHistory: domain.checkHistory.length, sourceWorkMetrics: domain.sourceWorkMetrics }, sourceInterpretations: domain.focus.sourceInterpretations, units: domain.semantic.units, materials: domain.sourceMaterials, propertyAnalysis: domain.propertyAnalysis, replay: "pending" })
  }
  const replayFile = path.join(historical, "verification/owui-await-replay.json"), replayBytes = await readFile(replayFile)
  return { schemaVersion: "authorization-bb-original-regression/v1", identity, entries, inheritedReplay: { file: replayFile, sha256: sha(replayBytes), value: JSON.parse(replayBytes.toString("utf8")) }, modelCalls: 0, originalFilesChanged: false }
}
export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const baRoot = path.resolve(root, "../authorization-semantic-submission-v1"), ba = JSON.parse(await readFile(path.join(baRoot, "status.json"), "utf8"))
  if (ba.activeAttempts.length || ba.unknownCompletions.length) throw new Error("Inspect inherited active/unknown lifecycle before takeover")
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), startupWorkingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  await mkdir(runRoot, { recursive: true }); await mkdir(path.join(root, "fixtures"), { recursive: true })
  await write(path.join(root, "fixtures/ba-original.json"), await extractOriginalRegression(), true)
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-bb-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v7", limits, positions: positions(), requirements: { engineering: "public interprocedural source call/object/path checks with counterexamples", realInterproceduralProperties: "Download and OWUI current adopted trace", completeOriginalTasks: "all original questions independently reviewed", packageConsumption: "two original-byte packages", changeReuse: "policy/premise/source fresh and previous", qualityAndCost: "same-epoch N/M/D with failures and unknown costs" }, outcomes: { engineering: "pending", realInterproceduralProperties: "not-measured", completeOriginalTasks: "not-measured", packageConsumption: "not-measured", changeReuse: "not-measured", qualityAndCost: "not-measured" }, researchGoalAchieved: false, thirdPartyApi: "paused-by-user", evaluatorIsolation: "Fixtures/reviews/history never enter runtime input." }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-bb-status/v1", identity, status: "in-progress", currentStage: "BB0", stages: Array.from({ length: 17 }, (_, i) => ({ id: `BB${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], accountChannel: { status: "inherited-terminal-reentry-eligible", inheritedIdentity: ba.identity, parentAttempt: `${ba.identity}/${ba.accountChannel.lastAttempt}`, terminalStatus: ba.accountChannel.terminalStatus, reason: ba.accountChannel.reason, lifecycle: ba.accountChannel.lifecycle, inheritedPausePreserved: true, consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 }, finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(baRoot, "account-boundary.json")), { flag: "wx" })
}
if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "status") console.log(await readFile(path.join(root, "status.json"), "utf8"))
  else throw new Error("Supported: init | status; run/review/replay/summarize pending BB stages")
}
