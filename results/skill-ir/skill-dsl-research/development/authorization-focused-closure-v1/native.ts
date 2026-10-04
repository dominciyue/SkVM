import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { root, repo, sha, tasks } from "./prepare.ts"
import { json, loadRegisteredInput, registeredInputIdentity } from "./study.ts"
import { developRows, mechanicalReview } from "../authorization-guided-runtime-v1/study.ts"
import { nativeProgress } from "../authorization-guided-runtime-v1/ordinary-native-progress.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { nativeDelivery, makeNativeScope } from "../authorization-semantic-lowering-v1/native.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
export const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectNativeRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: any) => r.id === id && r.kind === "native")
  if (matches.length !== 1) throw new Error("Use one registered native position")
  const row = matches[0], task = manifest.tasks.find((t: any) => t.id === row.task)
  if (!tasks.includes(row.task) || row.admission !== "eligible" || task?.admission !== "eligible" || !manifest.modelInputAllowlist.includes(task.inputFile)) throw new Error("Logical task sealed or unregistered source")
  if (!row.sourceSkill || !row.completeSkillAndReferencesRequired || !row.originalBriefAndOtherDutiesPreserved || row.method !== "D1" || row.strategy !== "focused-closure-v1") throw new Error("Preserve complete original skill and shared strategy")
  if (row.totalProviderBudget !== manifest.budgets.maxDispatches || row.totalToolBudget !== manifest.budgets.maxToolCalls) throw new Error("Shared native budget mismatch")
  return { row, task }
}
export async function developNative(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), { row, task } = selectNativeRow(manifest, id), inputFile = await loadRegisteredInput(manifest, task)
  await assertNoUnknownTask(root, row.task)
  const loaded = await loadInquiryInput(inputFile), skill = path.resolve(root, row.sourceSkill), originalSkillSha256 = sha(await readFile(skill))
  if (!row.sourceSkillSha256 || originalSkillSha256 !== row.sourceSkillSha256) throw new Error("Frozen original skill changed or was not registered")
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [row], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf,
    execute: async (_row, output) => {
      const workDir = path.resolve(repo, "../project-maintenance/runs/authorization-focused-closure-v1", id, path.basename(output)), scopeFile = path.join(output, "scope.json"), traceFile = path.join(output, "native-trace.json")
      await mkdir(workDir, { recursive: true })
      const scope = makeNativeScope(loaded.value, loaded.context.sourceRoot, scopeFile, row.policyOverride)
      await save(scopeFile, scope); await loadInquiryInput(scopeFile)
      const policy = scope.inquiry?.policy ?? scope.policy, brief = loaded.value.brief ?? JSON.stringify(loaded.value.inquiry)
      const prompt = `${brief}\n${policy ? `Independent CURRENT policy: ${policy.text}\n` : ""}Use the complete supplied original skill for this bounded source-visible question. Preserve all requested distinctions, citations, normal report format, confidence, source self-checking and remaining skill duties. Explain policy separately from source behavior. Unrelated whole audits, target execution, network, patches and invented deployment/ownership facts are outside this scope. Finish the user-facing answer from the same checked authorization answer.`
      const b = manifest.budgets, args = ["run", `--prompt=${prompt}`, `--skill=${skill}`, `--model=${manifest.testedModel}`, "--adapter=bare-agent", `--workdir=${workDir}`, `--max-steps=${b.maxDispatches}`, `--timeout-ms=${b.sessionTimeoutMs}`, `--authorization-scope=${scopeFile}`, "--authorization-domain-tools", "--authorization-strategy=focused-closure-v1", `--authorization-trace=${traceFile}`, `--authorization-max-provider-calls=${b.maxDispatches}`, `--authorization-max-tool-calls=${b.maxToolCalls}`, `--authorization-max-display-bytes=${b.maxDisplayBytes}`, `--authorization-max-read-bytes=${b.maxReadBytes}`]
      await save(path.join(output, "ordinary-claim.json"), { row, revision, originalInputSha256: task.inputSha256, sourceInput: registeredInputIdentity(manifest, task), originalSkill: skill, originalSkillSha256, args, workDir, scopeFile, completeSkillAndReferences: "ordinary loadRunSkill/deploySkillBundle", priorAnswersModelVisible: false, controlGraphSeeded: false, noAutomaticResend: true })
      const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" }), [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
      const trace = await json(traceFile).catch(() => undefined)
      if (!trace) return { status: "completion-unknown", exitCode, error: "Native trace absent; inspect before another dispatch", totalActualUsd: null }
      await save(path.join(output, "progress.json"), { ...nativeProgress(trace), focusedAcceptedUnits: trace.domain?.semantic?.units?.length ?? 0, focusHistory: trace.domain?.focus?.history?.map((h: any) => ({ stage: h.focus.stage, event: h.event })) ?? [] })
      const delivery = nativeDelivery(trace, exitCode)
      return { ...trace, ...delivery, exitCode, ordinaryEntry: "skvm run", originalSkillSha256, sourceSkillUnmodified: sha(await readFile(skill)) === originalSkillSha256, validation: { valid: delivery.status === "completed" }, targetExecutions: 0 }
    }, evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await developNative(process.argv[2]!, process.argv[3], process.argv[4])))
