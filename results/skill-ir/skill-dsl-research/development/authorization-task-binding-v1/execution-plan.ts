import { mkdir, readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { root, bbRoot, repo, limits, positions, write, sha } from "./study.ts"
import { loadInquiryInput, checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"
import { qualifiedBaseline, qualifiedPropertyEvidence } from "./summarize.ts"

export function positionConfiguration(id: string) {
  const position = positions().find(p => p.id === id); if (!position) throw new Error("Use a registered BC position")
  const plain = id.startsWith("quality-n-"), change = /^(policy|premise|source)-(fresh|previous)$/.exec(id)
  return { ...position, task: "download", entrance: id === "native-download" || plain ? "native" as const : "inquiry" as const, kind: change ? "change" : id.startsWith("quality-") ? "quality" : "pilot", arm: change?.[2] ?? (plain ? "N" : "D"), change: change?.[1], domainTools: !plain, method: plain ? "M" as const : "D1" as const, strategy: plain ? "legacy" as const : "task-binding-v1" as const, model: "gpt-5.6-sol", effort: "high", limits, evaluatorProvidedToRuntime: false }
}
export async function dryRun(id: string) {
  const config = positionConfiguration(id), originalInputFile = path.join(bbRoot, "model/packages/download/inquiry.json")
  return { ...config, inputFile: config.change ? path.join(root, "model/inputs", `download-${config.change}.json`) : originalInputFile, originalInputFile, skillFile: inputPlan("download").skillFile }
}
export async function preparePositionInput(id: string) {
  const started = Date.now(), plan = await dryRun(id), loaded = await loadInquiryInput(plan.inputFile), original = await loadInquiryInput(plan.originalInputFile)
  if (JSON.stringify(loaded.value.inquiry!.questions.map(q => q.id)) !== JSON.stringify(original.value.inquiry!.questions.map(q => q.id))) throw new Error("All four original questions must be retained in order")
  const check = await checkAuthorizationInquiry(plan.inputFile, plan.method, plan.strategy), skill = await loadSkill(plan.skillFile), skillIdentity = []
  if (check.status !== "valid") throw new Error(`Current input readiness failed: ${JSON.stringify(check.diagnostics)}`)
  for (const file of [...new Set(["SKILL.md", ...skill.bundleFiles])].sort()) { const bytes = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, bytes: bytes.length, sha256: sha(bytes) }) }
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), readiness = { readyToDispatch: check.status === "valid", publicCheck: check, skillIdentity, runtimeTree, durationMs: Date.now() - started, modelCalls: 0 }
  let previous: string | undefined, baselineAttemptId: string | undefined
  if (plan.arm === "previous" || plan.kind === "quality") {
    const originalCheck = plan.inputFile === plan.originalInputFile ? check : await checkAuthorizationInquiry(plan.originalInputFile, "D1", "task-binding-v1")
    if (originalCheck.status !== "valid") throw new Error("Original source identity cannot qualify a previous baseline")
    const basis = { inputSha256: original.inputSha256, questions: original.value.inquiry!.questions, sourceFiles: originalCheck.sourceFiles, model: plan.model, effort: plan.effort, limits, skillIdentity }, manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
    candidates: for (const p of manifest.positions) for (const attemptId of [...p.attempts].reverse()) {
      const directory = path.join(root, "attempts", attemptId)
      try {
        const report = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8")), review = JSON.parse(await readFile(path.join(directory, "source-review.json"), "utf8")), claim = JSON.parse(await readFile(path.join(directory, "claim.json"), "utf8"))
        if ((plan.arm === "previous" ? qualifiedBaseline : qualifiedPropertyEvidence)(report, review, runtimeTree, claim, basis)) { previous = report.sessionPath; baselineAttemptId = attemptId; break candidates }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    if (plan.arm === "previous" && !previous) throw new Error("Previous change blocked: no reviewed current same-property four-question baseline with a reusable session")
    if (plan.kind === "quality" && !baselineAttemptId) throw new Error("Quality comparison blocked: no independently reviewed current original-task cross-source property")
    if (plan.kind === "quality") previous = undefined
  }
  readiness.durationMs = Date.now() - started
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return { ...plan, readiness, previous, baselineAttemptId }
}
