import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gunzipSync } from "node:zlib"
import path from "node:path"

export const identity = "authorization-semantic-submission-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export interface Position { id: string; stage: string; kind: "pilot" | "quality" | "consumer" | "change"; task: "download" | "owui"; entrance: "native" | "inquiry"; arm?: string; repeat?: number; order: number; status: string; attempts: string[] }

export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "pilot-download", stage: "BA9", kind: "pilot", task: "download", entrance: "native" },
    { id: "pilot-owui", stage: "BA9", kind: "pilot", task: "owui", entrance: "native" },
  ]
  for (const repeat of [1, 2]) for (const [task, arms] of repeat === 1 ? [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const : [["download", ["D", "N", "M"]], ["owui", ["M", "D", "N"]]] as const) {
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}-repeat-${repeat}`, stage: repeat === 1 ? "BA11" : "BA12", kind: "quality", task, entrance: "native", arm, repeat })
  }
  rows.push({ id: "consumer-download-inquiry", stage: "BA13", kind: "consumer", task: "download", entrance: "inquiry" }, { id: "consumer-owui-native", stage: "BA13", kind: "consumer", task: "owui", entrance: "native" })
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "BA14", kind: "change", task: "download", entrance: "inquiry", arm })
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}

export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("BA output identity: refuse old or shared output directory")
}

/** Preserve original arguments, including invalid meanings. This fixture is never a model input. */
export async function extractOriginalRegression() {
  const historical = path.resolve(root, "../authorization-property-abstraction-v1"), entries = []
  for (const attemptId of ["single-download/original", "single-download/format-contract-1", "quality-download-M-repeat-1/original", "quality-download-D-repeat-1/original"]) {
    const directory = path.join(historical, "attempts", attemptId), native = attemptId.startsWith("quality-")
    const file = path.join(directory, native ? "run-result.json.gz" : "public-report.json"), bytes = await readFile(file)
    const saved = JSON.parse((native ? gunzipSync(bytes) : bytes).toString("utf8")), value = native ? saved.authorizationInquiry : saved, account = native ? value.account : value.telemetry.account
    const observation = JSON.parse(await readFile(path.join(directory, "runtime-observation.json"), "utf8"))
    entries.push({ attemptId, originalFile: file, originalSha256: sha(bytes), jsonPath: native ? "$.authorizationInquiry" : "$", terminal: { status: account.status, terminalStatus: account.terminalStatus, quotaRefused: account.quotaRefused, terminalError: account.terminalError ?? null, usage: account.usage ?? null },
      toolRejections: account.toolRejections, sourceInterpretations: value.domain?.focus?.sourceInterpretations ?? [], checkHistory: value.domain?.checkHistory ?? [], toolBudget: value.toolBudget ?? observation.toolBudget ?? null, runtimeObservation: observation })
  }
  return { schemaVersion: "authorization-ba-original-regression/v1", identity, entries, newInference: 0, originalScoresChanged: false, currentReplay: null, hypotheses: ["Selected-protocol diagnostics and displayed field/value slots may cause avoidable format friction; valid condition prose still lacks a computable predicate."] }
}

export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), startupWorkingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  const azRoot = path.resolve(root, "../authorization-property-abstraction-v1"), az = JSON.parse(await readFile(path.join(azRoot, "status.json"), "utf8"))
  if (az.activeAttempts.length || az.unknownCompletions.length) throw new Error("Inspect original active or unknown completion before takeover")
  await mkdir(runRoot, { recursive: true }); await mkdir(path.join(root, "fixtures"), { recursive: true })
  await write(path.join(root, "fixtures/az-original.json"), await extractOriginalRegression(), true)
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-ba-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree, startupCleanBeforeBAFiles: true, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v6", interactionMode: "authorization-source-edit/v1", budgetMode: "session-format-and-reserved-checks/v1", limits, positions: positions(), requirements: { engineering: "typed host-managed edits, exact diagnostics, bounded checks, public adoption, same-input comparison, recovery", qualityPositions: 12, pilots: 2, consumers: 2, changes: 6, originalQuestions: "all" }, outcomes: { engineering: "in-progress", realUse: "not-measured", quality: "not-measured", reuse: "not-measured" }, researchGoalAchieved: false, targetExecutions: 0, thirdPartyApi: "paused-by-user", evaluatorIsolation: "Fixtures/reviews/history/oracles never enter runtime input." }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-ba-status/v1", identity, status: "in-progress", currentStage: "BA0", stages: Array.from({ length: 19 }, (_, i) => ({ id: `BA${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], accountChannel: { status: "terminal-routing-recovery-eligible", parentAttempt: `authorization-property-abstraction-v1/${az.accountChannel.attemptId}`, terminalStatus: az.accountChannel.terminalStatus, reason: az.accountChannel.reason, lifecycle: az.accountChannel.lifecycle, recoveriesUsed: 0, originalActiveAttempts: az.activeAttempts, originalUnknownCompletions: az.unknownCompletions }, finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await write(path.join(root, "failure-analysis.json"), { schemaVersion: "authorization-ba-failures/v1", originalFixture: "fixtures/az-original.json", facts: "Three AZ domain attempts exhausted format correction with zero accepted source/material use/check history. D was terminal failed/routing, not quota.", currentReplay: null, hypotheses: [], originalFilesReadOnly: true }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(azRoot, "account-boundary.json")), { flag: "wx" })
}

if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else throw new Error("Supported: init (dispatch is added after shared implementation verification)")
}
