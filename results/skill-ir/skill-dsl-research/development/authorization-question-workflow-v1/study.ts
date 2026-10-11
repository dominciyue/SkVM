import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { loadInquiryInput, checkAuthorizationInquiry, inspectLocalInquiry, compareLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadRunSkill } from "../../../../../src/run/index.ts"

export const identity = "authorization-question-workflow-v1", root = import.meta.dir, repo = path.resolve(root, "../../../../.."), runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const originalInput = path.resolve(root, "../authorization-interprocedural-property-v1/model/packages/download/inquiry.json")
export const skillFile = path.resolve(root, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md")
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export const qualityIds = ["quality-n-1", "quality-h-1", "quality-d-1", "quality-d-2", "quality-h-2", "quality-n-2"]
export const positionIds = [...qualityIds, ...["policy", "premise", "source"].flatMap(c => [`${c}-fresh`, `${c}-previous`])]
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export function positionConfiguration(id: string) {
  if (!positionIds.includes(id)) throw new Error("Use a registered BE position")
  const n = id.startsWith("quality-n-"), h = id.startsWith("quality-h-"), change = /^(policy|premise|source)-(fresh|previous)$/.exec(id)
  return { id, entrance: "inquiry" as const, domainTools: !n, strategy: n ? "legacy" as const : h ? "question-guided-v1" as const : "question-checked-v1" as const, method: n || h ? "M" as const : "D1" as const, model: "gpt-5.6-sol", effort: "high", limits: { ...limits }, change: change?.[1], previousArm: change?.[2] === "previous" }
}
export const qualityReady = (check: any, skillFiles: number, questionIds: string[]) => check.status === "valid" && check.sourceFiles?.length === 95 && skillFiles === 22 && questionIds.length === 4 && new Set(questionIds).size === 4
const sourceIdentity = (files: any[] = []) => files.map(f => [f.path, f.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
export function fairnessIssues(claims: any[]) {
  const issues: string[] = []
  for (const field of ["inputSha256", "originalQuestionIds", "skillIdentity", "model", "effort", "limits"]) if (claims.some(c => c?.[field] == null || !isDeepStrictEqual(c[field], claims[0]?.[field]))) issues.push(`Different or absent ${field}`)
  if (claims.some(c => !c?.sourceFiles || !isDeepStrictEqual(sourceIdentity(c.sourceFiles), sourceIdentity(claims[0]?.sourceFiles)))) issues.push("Different or absent source scope")
  if (claims.some(c => c?.evaluatorProvidedToRuntime !== false || (c?.hiddenModelCalls ?? 0) !== 0 || c?.oldAnswer != null || c?.sourceMeanings != null || c?.sourceReview != null || c?.expectedVerdict != null)) issues.push("Answer/evaluator/precomputed meaning or hidden model call entered runtime")
  return issues
}
export function firstRecoverableBaseline(reports: any[], eligibility: Map<string, any>) {
  return reports.find(r => r.positionId?.startsWith("quality-d-") && eligibility.get(r.attemptId)?.status === "reusable" && eligibility.get(r.attemptId)?.info.layers?.R0.available)
}
async function register() {
  const file = path.join(root, "manifest.json"), stateFile = path.join(root, "status.json"), manifest = await json(file), state = await json(stateFile)
  if (!manifest.positions) { manifest.positions = positionIds.map((id, i) => ({ id, order: i + 1, status: "registered-not-run", attempts: [] })); await write(file, manifest) }
  if (!state.accountChannel) { Object.assign(state, { activeAttempts: [], unknownCompletions: [], modelAttempts: 0, accountChannel: { status: "available", consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 } }); await write(stateFile, state) }
  return { manifest, state }
}
async function chooseBaseline() {
  const file = path.join(root, "reuse-baseline.json")
  try { return await json(file) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  const { manifest } = await register(), reports: any[] = [], eligibility = new Map<string, any>()
  for (const id of qualityIds.filter(id => id.startsWith("quality-d-"))) for (const attemptId of manifest.positions.find((p: any) => p.id === id).attempts) {
    const report = await json(path.join(root, "attempts", attemptId, "report.json")); reports.push(report)
    if (!report.sessionPath) continue
    try { await inspectLocalInquiry(report.sessionPath); eligibility.set(attemptId, (await compareLocalInquiry(originalInput, report.sessionPath, "question-checked-v1") as any).reuseEligibility) } catch { /* The first readable, verified session is selected; no verdict promotion. */ }
  }
  const baseline = firstRecoverableBaseline(reports, eligibility)
  if (!baseline) throw new Error("No recoverable current D quality session for R0/R1; preserve the missing responsibility")
  const selected = { attemptId: baseline.attemptId, sessionPath: baseline.sessionPath, runtimeTree: baseline.runtimeTree, inputSha256: baseline.inputSha256, selectedAt: new Date().toISOString(), selection: "first-recoverable-D-not-best-verdict", layers: eligibility.get(baseline.attemptId).info.layers, answerReused: false, R2RequiresIndependentCurrentReview: true }
  await write(file, selected, true); return selected
}
export async function prepare(id: string) {
  await register()
  const config = positionConfiguration(id), original = await loadInquiryInput(originalInput), inputFile = config.change ? path.resolve(root, `../authorization-task-binding-v1/model/inputs/download-${config.change}.json`) : originalInput
  const loaded = await loadInquiryInput(inputFile), check = await checkAuthorizationInquiry(inputFile, config.method, config.strategy), skill = await loadRunSkill(skillFile)
  const skillIdentity = await Promise.all([...new Set(["SKILL.md", ...skill.bundleFiles])].sort().map(async file => { const bytes = await readFile(path.join(skill.skillDir, file)); return { file, sha256: sha(bytes), bytes: bytes.length } }))
  const originalQuestionIds = loaded.value.inquiry!.questions.map(q => q.id), requiredIds = original.value.inquiry!.questions.map(q => q.id)
  if (check.status !== "valid" || !qualityReady(check, skillIdentity.length, originalQuestionIds) || !isDeepStrictEqual(originalQuestionIds, requiredIds)) throw new Error("Complete original skill/four-question/95-source input is invalid")
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  const baseline = config.change ? await chooseBaseline() : undefined, previous = config.previousArm ? baseline!.sessionPath : undefined
  const comparison = baseline ? await compareLocalInquiry(inputFile, baseline.sessionPath, "question-checked-v1") : undefined
  if (previous && (comparison as any)?.reuseEligibility?.status !== "reusable") throw new Error("Current previous input has no recoverable R0/R1 layer; run fresh separately")
  const readiness = { ...config, inputFile, originalInput, skillFile, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, originalQuestionIds, sourceFiles: check.sourceFiles, skillIdentity, runtimeTree, readyToDispatch: true, modelCalls: 0, hiddenModelCalls: 0, evaluatorProvidedToRuntime: false, previous, baselineAttemptId: baseline?.attemptId, reuseComparison: comparison, changeSource: config.change ? "unchanged BC fact contract; mechanical location only" : undefined }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return readiness
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "help") console.log("prepare <registered-position> | run <position> [named-revision] | replay | summarize")
  else if (command === "prepare") { const r = await prepare(process.argv[3]!); console.log(JSON.stringify({ id: r.id, readyToDispatch: r.readyToDispatch, modelCalls: 0, originalQuestionIds: r.originalQuestionIds, sourceFiles: r.sourceFiles?.length, skillFiles: r.skillIdentity.length, strategy: r.strategy, baselineAttemptId: r.baselineAttemptId ?? null })) }
  else if (command === "run") await (await import("./runner.ts")).run(process.argv[3]!, process.argv[4])
  else if (command === "replay") console.log(JSON.stringify(await (await import("./replay.ts")).replay()))
  else if (command === "summarize") { const s = await (await import("./summarize.ts")).summarizeStudy(root); console.log(JSON.stringify({ status: s.status, attempts: s.accounting.attempts, qualityFirst: s.qualityFirst, knownUsage: s.accounting.known })) }
  else throw new Error("Use help | prepare | run | replay | summarize")
}
