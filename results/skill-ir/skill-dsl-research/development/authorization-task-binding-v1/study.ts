import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
export const identity = "authorization-task-binding-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const bbRoot = path.resolve(root, "../authorization-interprocedural-property-v1")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export function positions() {
  const rows = [
    { id: "native-download", stage: "BC9" },
    ...["n-1", "d-1", "d-2", "n-2"].map(arm => ({ id: `quality-${arm}`, stage: "BC10" })),
    ...["policy", "premise", "source"].flatMap(change => ["fresh", "previous"].map(arm => ({ id: `${change}-${arm}`, stage: "BC11" }))),
  ]
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] as string[] }))
}
export async function bootstrap() {
  const originals = []
  for (const file of ["verification/acceptance-matrix.json", "verification/authorized-execution-closeout.json", "verification/resume-replay-profile.json", "accounting.json", "verification/user-resume-1-fresh-disposition.json"]) {
    const bytes = await readFile(path.join(bbRoot, file)); originals.push({ file: path.join(bbRoot, file), sha256: sha(bytes), value: JSON.parse(bytes.toString("utf8")) })
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  await mkdir(path.join(root, "verification"), { recursive: true }); await mkdir(runRoot, { recursive: true })
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-bc-manifest/v1", identity, date: "2026-10-10", implementationBaseline: head, startupWorkingTree: "clean skill-ir-aot...origin/skill-ir-aot at takeover before BC scaffolding", experimentModel: "gpt-5.6-sol", experimentEffort: "high", developmentModel: "gpt-6.1-sol", developmentEffort: "max", strategy: "task-binding-v1", taskPreparation: "task-binding-v1", limits, positions: positions(), authorization: { download: "eleven registered positions after readiness", owui: "offline only; retained BB unknowns are never reopened", thirdPartyApi: "paused-by-user" }, requirements: { engineering: "real scope bounded preparation; shared public task-to-property chain", realProperty: "current model proposal, adopted cross-source trace and independent source review", wholeTask: "all four original Download questions retained and reviewed", comparison: "two matched N/D pairs after real local qualification", reuse: "three fresh/previous changes qualified by the same local property" }, observedOutcomes: { engineering: "pending", realProperty: "not-measured", wholeTask: "not-measured", comparison: "not-measured", reuse: "not-measured" }, evaluatorIsolation: "Original task, skill and source only; reviews/oracle/history never enter model context." }, true)
  await write(path.join(root, "verification/inherited-failure-responsibilities.json"), { originals, failures: ["task properties undeclared in original four/eleven question packages", "actual value/formal principal-resource mismatch is a valid rejection", "180.53s source preparation not returned; internal hotspot unconfirmed"], originalFilesChanged: false, modelCalls: 0 }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-bc-status/v1", identity, status: "in-progress", currentStage: "BC1", stages: Array.from({ length: 15 }, (_, i) => ({ id: `BC${i}`, status: i === 0 ? "registered" : "pending" })), positions: positions(), activeAttempts: [], unknownCompletions: [], retainedInheritedUnknowns: ["authorization-interprocedural-property-v1/consumer-owui-native/original", "authorization-interprocedural-property-v1/consumer-owui-native/user-resume-1"], accountChannel: { status: "available", basis: "BB source-fresh completed terminal; no health probe", consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 }, finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
}
if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "status") console.log(await readFile(path.join(root, "status.json"), "utf8"))
  else if (process.argv[2] === "dry-run") console.log(JSON.stringify(await (await import("./execution-plan.ts")).dryRun(process.argv[3]!)))
  else if (process.argv[2] === "prepare") { const plan = await (await import("./execution-plan.ts")).preparePositionInput(process.argv[3]!); console.log(JSON.stringify({ positionId: plan.id, readyToDispatch: plan.readiness.readyToDispatch, inputFile: plan.inputFile, method: plan.method, strategy: plan.strategy, originalQuestions: plan.readiness.publicCheck.status === "valid" ? plan.readiness.publicCheck.input.inquiry?.questions.map(q => q.id) : [], modelCalls: 0 })) }
  else if (process.argv[2] === "run") await (await import("./runner.ts")).run(process.argv[3]!, process.argv[4])
  else if (process.argv[2] === "summarize") { const result = await (await import("./summarize.ts")).summarize(); console.log(JSON.stringify({ rows: result.rows, accounting: result.accounting })) }
  else if (process.argv[2] === "replay") { const result = await (await import("./replay.ts")).replay(process.argv[3]); console.log(JSON.stringify({ modelCalls: result.modelCalls, newSemanticAnnotations: result.newSemanticAnnotations, entries: result.entries.map(e => ({ task: e.task, submissions: e.submissions.length, firstBlocker: e.firstBlocker })) })) }
  else if (process.argv[2] === "help") console.log("init | status | dry-run/prepare/run <registered-position> [named-revision] | replay <new-label> | summarize")
  else throw new Error("Use init | status | dry-run/prepare/run <position> [named-revision] | replay <new-label> | summarize | help")
}
