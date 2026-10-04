import path from "node:path"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { root, repo, assertNoUnknownTask } from "./study.ts"
import { developRows, mechanicalReview, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { nativeProgress } from "../authorization-guided-runtime-v1/ordinary-native-progress.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { inspectNativeZeroDispatch } from "./zero-dispatch.ts"
type NativeRow = Row & { kind: "native"; admission: string; sourceSkill: string; policyOverride?: unknown; completeSkillAndReferencesRequired: boolean; originalBriefAndOtherDutiesPreserved: boolean; totalProviderBudget: number; totalToolBudget: number }
type Manifest = { rows: NativeRow[]; tasks: Array<{ id: string; admission: string; inputFile: string; inputSha256: string }>; testedModel: string; cachePath: string; budgets: Record<string, number> }
const json = async (file: string) => JSON.parse(await readFile(file, "utf8")), sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectNativeRow(manifest: Manifest, id: string): NativeRow {
  const rows = manifest.rows.filter(r => r.id === id && r.kind === "native")
  if (rows.length !== 1) throw new Error("A single registered native position is required")
  const row = rows[0]!, task = manifest.tasks.find(t => t.id === row.task)
  if (row.admission !== "eligible" || task?.admission !== "eligible") throw new Error("Logical task sealed")
  if (!row.sourceSkill || !row.completeSkillAndReferencesRequired || !row.originalBriefAndOtherDutiesPreserved || row.method !== "D1" || row.strategy !== "semantic-flow-v1" || row.totalProviderBudget !== 12 || row.totalToolBudget !== 24) throw new Error("Preserve the registered original skill, scope and shared native budget contract")
  return row
}
export function nativeDelivery(trace: any, exitCode: number) {
  const response = trace.attempts?.at(-1)?.response, finalProse = response?.text?.trim() ?? "", check = trace.domain?.check
  const delivered = finalProse.length > 0 && !(response?.toolCalls?.length)
  const bounded = check?.structureValid && check?.sourceBound && check?.ruleConsistency && check?.taskResolution === "bounded"
  return { status: hasUnknownAuthorizationCompletion(trace) ? "completion-unknown" : exitCode === 0 && delivered && bounded ? "completed" : "completed-with-diagnostics", finalProse }
}
export function makeNativeScope(value: any, sourceRoot: string, scopeFile: string, policyOverride?: unknown) {
  const scope = { ...structuredClone(value), sourceRoot: path.relative(path.dirname(scopeFile), sourceRoot).split(path.sep).join("/") || "." }
  if (policyOverride) { if (scope.inquiry) scope.inquiry.policy = policyOverride; else scope.policy = policyOverride }
  return scope
}
export async function developNative(id: string, repairId?: string, repairOf?: string) {
  const manifest: Manifest = await json(path.join(root, "manifest.json")), registered = selectNativeRow(manifest, id)
  await assertNoUnknownTask(root, registered.task)
  const task = manifest.tasks.find(t => t.id === registered.task)!, inputFile = path.resolve(root, task.inputFile), original = await readFile(inputFile)
  if (sha(original) !== task.inputSha256) throw new Error("Registered original input bytes changed")
  const loaded = await loadInquiryInput(inputFile), skill = path.resolve(root, registered.sourceSkill), skillBytes = await readFile(skill)
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const row = { ...registered, components: ["wire", "source", "checker", "delivery", "worklist"] }, revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [row], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf, inspectZeroDispatch: inspectNativeZeroDispatch,
    execute: async (_row, output) => {
      const workDir = path.resolve(repo, "../project-maintenance/runs/authorization-semantic-lowering-v1", id, path.basename(output)), scopeFile = path.join(output, "scope.json"), traceFile = path.join(output, "native-trace.json")
      await mkdir(workDir, { recursive: true })
      const scope = makeNativeScope(loaded.value, loaded.context.sourceRoot, scopeFile, registered.policyOverride)
      await save(scopeFile, scope)
      await loadInquiryInput(scopeFile)
      const policy = scope.inquiry?.policy ?? scope.policy, brief = loaded.value.brief ?? JSON.stringify(loaded.value.inquiry)
      const prompt = `${brief}\n${policy ? `Independent CURRENT policy: ${policy.text}\n` : ""}Use the complete supplied original security skill for this bounded source-visible authorization question. Preserve the original requested distinctions and normal reporting format, source citations, confidence, self-verification and remaining duties/limits. Explain requested policy differences separately from actual source behavior. This is a focused question; unrelated whole audits, target execution, network calls and patch application are outside its scope. Do not invent deployment or ownership facts. Finish the user-facing answer after using the shared authorization tools.`
      const args = ["run", `--prompt=${prompt}`, `--skill=${skill}`, `--model=${manifest.testedModel}`, "--adapter=bare-agent", `--workdir=${workDir}`, "--max-steps=12", "--timeout-ms=1200000", `--authorization-scope=${scopeFile}`, "--authorization-domain-tools", "--authorization-strategy=semantic-flow-v1", `--authorization-trace=${traceFile}`]
      await save(path.join(output, "ordinary-claim.json"), { row, revision, originalInput: registered.task, originalInputSha256: sha(original), originalSkill: skill, originalSkillSha256: sha(skillBytes), args, workDir, scopeFile, completeSkillAndReferences: "ordinary loadRunSkill and deploySkillBundle", priorAnswersModelVisible: false, controlGraphSeeded: false, noAutomaticResend: true })
      const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
      const trace = await json(traceFile).catch(() => undefined)
      if (!trace) return { status: "completion-unknown", exitCode, error: "Native trace absent; inspect process before another dispatch", totalActualUsd: null }
      const progress = nativeProgress(trace); await save(path.join(output, "progress.json"), progress)
      const delivery = nativeDelivery(trace, exitCode)
      return { ...trace, ...delivery, exitCode, ordinaryEntry: "skvm run", originalSkillSha256: sha(skillBytes), sourceSkillUnmodified: sha(await readFile(skill)) === sha(skillBytes), validation: { valid: delivery.status === "completed" }, targetExecutions: 0 }
    }, evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await developNative(process.argv[2]!, process.argv[3], process.argv[4])))
