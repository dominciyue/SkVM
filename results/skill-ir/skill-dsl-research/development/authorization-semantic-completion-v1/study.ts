import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { loadInquiryInput, checkAuthorizationInquiry, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { crossFunctionProperties, isDelivered, accounting } from "../authorization-task-binding-v1/summarize.ts"
export const identity = "authorization-semantic-completion-v1", root = import.meta.dir, repo = path.resolve(root, "../../../../.."), runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const originalInput = path.resolve(root, "../authorization-interprocedural-property-v1/model/packages/download/inquiry.json")
export const skillFile = path.resolve(root, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md")
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const positionIds = ["extraction-download", "quality-n-1", "quality-d-1", "quality-d-2", "quality-n-2", ...["policy", "premise", "source"].flatMap(c => [`${c}-fresh`, `${c}-previous`])]
export function positionConfiguration(id: string) {
  if (!positionIds.includes(id)) throw new Error("Use a registered BD position")
  const plain = id.startsWith("quality-n-"), change = /^(policy|premise|source)-(fresh|previous)$/.exec(id)
  return { id, entrance: "inquiry" as const, domainTools: !plain, strategy: plain ? "legacy" as const : "semantic-completion-v1" as const, method: plain ? "M" as const : "D1" as const, model: "gpt-5.6-sol", effort: "high", limits: { ...limits, ...(id === "extraction-download" ? { maxToolCalls: 12 } : {}) }, change: change?.[1], previousArm: change?.[2] === "previous" }
}
export const qualityReady = (check: any, completeSkill: boolean, questionCount: number) => check.status === "valid" && completeSkill && questionCount === 4
export function qualifiedReuse(report: any, review: any, runtimeTree: string, originalSha?: string) {
  if (!isDelivered(report) || report.strategy !== "semantic-completion-v1" || report.runtimeTree !== runtimeTree || report.sourceVerification?.valid !== true || !report.sessionPath || report.originalQuestionIds?.length !== 4 || !report.positionId?.startsWith("quality-d-")) return false
  if (originalSha && report.inputSha256 !== originalSha) return false
  if (review.status !== "source-reviewed" || review.attemptId !== report.attemptId || review.answerSha256 !== report.answerSha256 || review.inputSha256 !== report.inputSha256 || review.runtimeTree !== runtimeTree) return false
  return crossFunctionProperties(report).some((p: any) => {
    const q = report.taskPreparation?.questions.find((q: any) => q.questionId === p.questionId), declared = q?.properties.find((d: any) => d.id === p.propertyId)
    return q?.origin === "model-task-proposal" && declared?.kind === p.kind && review.propertyReviews?.some((r: any) => r.questionId === p.questionId && r.propertyId === p.propertyId && r.sourceSupported === true)
  })
}
export async function prepare(id: string) {
  const config = positionConfiguration(id), original = await loadInquiryInput(originalInput)
  let inputFile = config.change ? path.resolve(root, `../authorization-task-binding-v1/model/inputs/download-${config.change}.json`) : originalInput
  if (id === "extraction-download") {
    await mkdir(path.join(root, "model/inputs"), { recursive: true }); inputFile = path.join(root, "model/inputs/extraction-download.json")
    const value = structuredClone(original.value); value.inquiry!.questions = [value.inquiry!.questions[1]!]
    value.sourceRoot = path.relative(path.dirname(inputFile), original.context.sourceRoot).replaceAll("\\", "/")
    await write(inputFile, value)
  }
  const loaded = await loadInquiryInput(inputFile), check = await checkAuthorizationInquiry(inputFile, config.method, config.strategy), skill = await loadSkill(skillFile)
  const originalQuestionIds = original.value.inquiry!.questions.map(q => q.id)
  if (id !== "extraction-download" && (JSON.stringify(loaded.value.inquiry!.questions.map(q => q.id)) !== JSON.stringify(originalQuestionIds) || !qualityReady(check, !!skill.skillContent, loaded.value.inquiry!.questions.length))) throw new Error("Current four-question input / complete skill is invalid")
  if (check.status !== "valid") throw new Error(JSON.stringify(check.diagnostics))
  const skillIdentity = await Promise.all([...new Set(["SKILL.md", ...skill.bundleFiles])].sort().map(async file => { const bytes = await readFile(path.join(skill.skillDir, file)); return { file, sha256: sha(bytes), bytes: bytes.length } }))
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  let previous: string | undefined, baselineAttemptId: string | undefined
  if (config.change) {
    const manifest = await json(path.join(root, "manifest.json"))
    candidates: for (const p of manifest.positions) for (const attemptId of [...p.attempts].reverse()) {
      try {
        const directory = path.join(root, "attempts", attemptId), report = await json(path.join(directory, "report.json")), review = await json(path.join(directory, "source-review.json"))
        if (qualifiedReuse(report, review, runtimeTree, original.inputSha256)) { await inspectLocalInquiry(report.sessionPath); baselineAttemptId = attemptId; if (config.previousArm) previous = report.sessionPath; break candidates }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    if (!baselineAttemptId) throw new Error("Change pair unrun: no independently reviewed current original-task cross-source material and readable session")
  }
  const readiness = { ...config, inputFile, originalInput, skillFile, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, originalQuestionIds: loaded.value.inquiry!.questions.map(q => q.id), sourceFiles: check.sourceFiles, skillIdentity, runtimeTree, readyToDispatch: true, modelCalls: 0, previous, baselineAttemptId }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return readiness
}
export async function summarize() {
  const manifest = await json(path.join(root, "manifest.json")), reports: any[] = [], reviews: any[] = []
  for (const p of manifest.positions) for (const attemptId of p.attempts) {
    reports.push(await json(path.join(root, "attempts", attemptId, "report.json")))
    try { reviews.push(await json(path.join(root, "attempts", attemptId, "source-review.json"))) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  const rows = manifest.positions.map((p: any) => ({ id: p.id, status: p.status, attempts: p.attempts, unrunReason: p.unrunReason ?? null, results: reports.filter(r => r.positionId === p.id).map(r => ({ attemptId: r.attemptId, runtimeTree: r.runtimeTree, delivered: isDelivered(r), toolCalls: r.hostToolCalls, independentProperties: crossFunctionProperties(r), review: reviews.find(v => v.attemptId === r.attemptId) ?? null })) }))
  const pairs = [["quality-n-1", "quality-d-1"], ["quality-n-2", "quality-d-2"]].map(ids => ({ ids, attempts: reports.filter(r => ids.includes(r.positionId)).map(r => ({ attemptId: r.attemptId, runtimeTree: r.runtimeTree, delivered: isDelivered(r), usage: r.accountUsage, toolCalls: r.hostToolCalls, durationMs: r.durationMs, review: reviews.find(v => v.attemptId === r.attemptId) ?? null })) }))
  const result = { schemaVersion: "authorization-bd-summary/v1", identity, rows, pairs, accounting: accounting(reports), conclusionsAllowed: ["support", "tradeoff", "no-observed-difference", "negative", "inconclusive"], inheritedUnknownsRetained: true, targetExecutions: 0 }
  await write(path.join(root, "summary.json"), result); await write(path.join(root, "accounting.json"), result.accounting); return result
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "help") console.log("prepare <registered-position> | run <registered-position> [named-revision] | replay | summarize (prepare/replay are zero-model)")
  else if (command === "prepare") console.log(JSON.stringify(await prepare(process.argv[3]!)))
  else if (command === "run") await (await import("./runner.ts")).run(process.argv[3]!, process.argv[4])
  else if (command === "replay") console.log(JSON.stringify(await (await import("./replay.ts")).replay()))
  else if (command === "summarize") console.log(JSON.stringify(await summarize()))
  else throw new Error("Use help | prepare | run | replay | summarize")
}
