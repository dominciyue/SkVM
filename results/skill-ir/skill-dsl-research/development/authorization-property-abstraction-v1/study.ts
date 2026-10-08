import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"

export const identity = "authorization-property-abstraction-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export interface Position { id: string; stage: string; kind: "quality" | "single" | "consumer" | "change"; task: "download" | "owui"; entrance: "native" | "inquiry"; arm?: string; repeat?: number; order: number; status: string; attempts: string[] }

export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "single-download", stage: "AZ9", kind: "single", task: "download", entrance: "inquiry" },
    { id: "consumer-download", stage: "AZ11", kind: "consumer", task: "download", entrance: "inquiry" },
    { id: "consumer-owui", stage: "AZ11", kind: "consumer", task: "owui", entrance: "inquiry" },
  ]
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "AZ12", kind: "change", task: "download", entrance: "inquiry", arm })
  for (const repeat of [1, 2]) for (const [task, arms] of repeat === 1 ? [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const : [["download", ["D", "N", "M"]], ["owui", ["M", "D", "N"]]] as const) {
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}-repeat-${repeat}`, stage: "AZ13", kind: "quality", task, entrance: "native", arm, repeat })
  }
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}

/** History is a read-only input. Only this identity owns output locations. */
export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("AZ output identity: refuse old or shared output directory")
}
export async function dryRun(id: string, studyRoot = root, externalRoot = runRoot) {
  assertOwnedPaths(studyRoot, externalRoot)
  const position = positions().find(p => p.id === id)
  if (!position) throw new Error("Use a registered AZ position")
  const original = inputPlan(position.task), plain = position.kind === "quality" && position.arm === "N"
  const authored = position.kind === "consumer" || position.arm === "D"
  const inputFile = position.kind === "single" ? path.join(studyRoot, "model/inputs/download-single.json") : position.kind === "change" ? path.join(studyRoot, "model/inputs/current", `download-${id.split("-").at(-2)}.json`) : authored ? path.join(studyRoot, "model/packages", position.task, "inquiry.json") : original.inputFile
  return { positionId: id, entrance: position.entrance, inputFile, originalInputFile: original.inputFile, skillFile: original.skillFile, authorAttempt: authored ? original.authorAttempt : undefined,
    domainTools: !plain, method: authored || position.kind === "change" ? "D1" as const : "M" as const, strategy: plain ? "legacy" as const : "operation-evidence-v6" as const,
    runRoot: externalRoot, outputs: [path.join(studyRoot, "attempts", id), path.join(externalRoot, "attempts", id)], runtimeInputFiles: [inputFile, original.skillFile, path.join(studyRoot, "account-boundary.json")],
    limits, model: "gpt-5.6-sol", effort: "high", targetExecutions: 0, evaluatorProvidedToRuntime: false }
}

export function attributeFailure(report: Record<string, any>) {
  const labels: string[] = [], diagnostics = report.currentCheck?.diagnostics ?? report.check?.diagnostics ?? []
  if (report.quotaRefused || /routing discovery|usage limit/i.test(JSON.stringify(report.terminalError ?? report.error ?? ""))) labels.push("channel")
  if (report.status === "unavailable") labels.push("host-protocol")
  if (diagnostics.some((d: any) => /role-required|callee-uninterpreted|argument-unbound/.test(d.code))) labels.push("semantic-interpretation")
  if (diagnostics.some((d: any) => /dependency-open|relationship-unresolved/.test(d.code))) labels.push("source-location-or-link")
  if (report.currentCheck?.taskResolution === "partial" || report.resultPresent === false) labels.push("check-or-delivery")
  return { labels: [...new Set(labels)], originalFacts: { status: report.status, terminalError: report.terminalError ?? null, resultPresent: report.resultPresent ?? null, sourceWorkMetrics: report.sourceWorkMetrics ?? null, recordedDiagnosticCodes: diagnostics.map((d: any) => d.code), accountUsage: report.accountUsage ?? null }, currentReplay: null, hypotheses: [], changesOriginalScore: false }
}

export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  const workingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  const ayRoot = path.resolve(root, "../authorization-question-closure-v1"), ay = JSON.parse(await readFile(path.join(ayRoot, "manifest.json"), "utf8"))
  const sources = []
  for (const task of ["download", "owui"]) {
    const plan = inputPlan(task), inputBytes = await readFile(plan.inputFile), authorBytes = await readFile(path.join(plan.authorAttempt, "authored-inquiry.json"))
    sources.push({ task, ...plan, inputSha256: sha(inputBytes), skillSha256: sha(await readFile(plan.skillFile)), authoredInputSha256: sha(authorBytes), questionIds: JSON.parse(authorBytes.toString("utf8")).inquiry.questions.map((q: any) => q.id) })
  }
  const attributions = []
  for (const position of ay.positions) for (const attemptId of position.attempts) {
    const reportFile = path.join(ayRoot, "attempts", attemptId, "report.json"), bytes = await readFile(reportFile)
    attributions.push({ attemptId, reportFile, reportSha256: sha(bytes), ...attributeFailure(JSON.parse(bytes.toString("utf8"))) })
  }
  await mkdir(runRoot, { recursive: true })
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-az-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree: workingTree, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v6", limits, positions: positions(), sources,
    nativeAliases: { "native-download": "quality-download-D-repeat-1", "native-owui": "quality-owui-D-repeat-1" }, requirements: { engineering: "property-scoped demand, bounded summaries, diagnostics, recovery, both entrances and invalidation", qualityPositions: 12, originalTaskQuestions: "all", consumers: 2, changes: 6, singleProperty: 1 }, outcomes: { engineering: "not-measured", realUse: "not-measured", quality: "not-measured", reuse: "not-measured" }, researchGoalAchieved: false, targetExecutions: 0, evaluatorIsolation: "Original tasks, skills, independent policy and allowed sources only; reviews, history, oracle and repair ledgers excluded", thirdPartyApi: "paused-by-user" }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-az-status/v1", identity, status: "in-progress", currentStage: "AZ0", stages: Array.from({ length: 19 }, (_, i) => ({ id: `AZ${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], finiteQueueComplete: false, researchGoalAchieved: false, accountChannel: { status: "availability-unconfirmed-for-experiment", historicalRefusal: "2026-10-08; old recovery hint 2026-10-14 16:47", latestMetadata: { source: "Codex app get_usage_limits (zero inference)", ordinaryUsageAllowed: true, usedPercent: 5, channelAvailabilityEstablished: false }, localStudyProcessesAtStartup: 0 }, targetExecutions: 0 }, true)
  await write(path.join(root, "failure-attribution.json"), { schemaVersion: "authorization-az-attribution/v1", originalAttempts: attributions.length, entries: attributions, method: "Recorded terminal/check diagnostics only; source verdicts remain the independent original reviews. Current replay is added separately after shared fixes.", newInference: 0 }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(ayRoot, "account-boundary.json")), { flag: "wx" })
}

if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "dry-run") console.log(JSON.stringify(await dryRun(process.argv[3]!), null, 2))
  else throw new Error("Supported: init | dry-run <registered-position>")
}
