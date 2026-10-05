import path from "node:path"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { naturalRunTaskId } from "../../../../../src/run/index.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { makeNativeScope, nativeDelivery } from "../authorization-semantic-lowering-v1/native.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { developRows, mechanicalReview, replay as retainedReplay, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { captureOrdinaryAuthorConversation } from "../authorization-guided-runtime-v1/ordinary-author-capture.ts"
import { nativeProgress } from "../authorization-guided-runtime-v1/ordinary-native-progress.ts"
import { root, repo, at, tasks, check, json, save, sha, modelInputPath, type Position } from "./study.ts"

export interface SkillIdentity { files: Array<{ path: string; sha256: string; bytes: number }>; bundleSha256: string; bytes: number }
export async function skillBundleIdentity(file: string): Promise<SkillIdentity> {
  const skill = await loadSkill(file), files = []
  for (const relative of ["SKILL.md", ...skill.bundleFiles].sort()) {
    const raw = await readFile(path.join(skill.skillDir, relative))
    files.push({ path: relative, sha256: sha(raw), bytes: raw.length })
  }
  return { files, bundleSha256: sha(JSON.stringify(files)), bytes: files.reduce((sum, f) => sum + f.bytes, 0) }
}
export async function verifySkillBundle(file: string, expected: SkillIdentity) {
  const actual = await skillBundleIdentity(file)
  if (actual.bundleSha256 !== expected.bundleSha256 || JSON.stringify(actual.files) !== JSON.stringify(expected.files)) throw new Error("Complete skill bundle changed")
  return actual
}
export function selectOrdinaryRow(manifest: any, id: string, registration: any) {
  const matches = manifest.rows.filter((r: Position) => r.id === id && ["native", "quality"].includes(r.kind))
  if (matches.length !== 1) throw new Error("Use one registered ordinary AU position")
  const position: Position = matches[0], input = manifest.inputs.find((i: any) => i.id === position.task), retained = registration.inputs.find((i: any) => i.id === position.task)
  if (!tasks.some(t => t === position.task) || manifest.inheritedSeals.sealedTasks.includes(position.task) || !input?.sha256) throw new Error("Unregistered or sealed logical task")
  modelInputPath(input.file)
  if (retained?.inputSha256 !== input.sha256 || retained?.sourceSkill !== input.skill || !retained?.bundleSha256 || !["N", "M-O", "D-O"].includes(position.arm)) throw new Error("Registered input/complete skill identity mismatch")
  const row: Row & Position = { ...position, method: position.arm === "D-O" ? "D1" : "M", strategy: position.arm === "N" ? "legacy" : "operation-evidence-v1", sourceSkill: input.skill, components: position.arm === "N" ? ["wire", "source", "delivery"] : ["wire", "source", "checker", "worklist", "delivery"] }
  const policyOverride = position.variant === "changed" ? registration.changedPolicies[position.task] : undefined
  if (position.variant === "changed" && !policyOverride) throw new Error("Changed policy is not registered")
  return { row, input, policyOverride, bundleSha256: retained.bundleSha256 }
}
export function ordinaryInvocation(options: { row: Row & Position; manifest: any; value: any; policyOverride?: unknown; scopeFile: string; skill: string; traceFile: string; workDir: string }) {
  const { row, manifest, value } = options, policy: any = options.policyOverride ?? value.inquiry?.policy ?? value.policy, brief = value.brief ?? JSON.stringify(value.inquiry)
  const prompt = `${brief}\n${policy ? `Independent CURRENT policy: ${policy.text}\n` : ""}Use the complete supplied original security skill for this bounded source-visible authorization question. Preserve every requested distinction and the original normal reporting format, source citations, confidence, source self-verification and remaining duties/limits. Explain conditional source behavior and independent policy separately. Keep unspecified user premises separate from available unexamined source. The current scope supplies read-only source tools; conclude in the original skill prose format from the evidence actually available.`
  const b = manifest.budgets, args = ["run", `--prompt=${prompt}`, `--skill=${options.skill}`, `--model=${manifest.testedModel}`, "--adapter=bare-agent", `--workdir=${options.workDir}`, `--max-steps=${b.maxDispatches}`, `--timeout-ms=${b.sessionTimeoutMs}`, `--authorization-scope=${options.scopeFile}`, `--authorization-trace=${options.traceFile}`, `--authorization-max-provider-calls=${b.maxDispatches}`, `--authorization-max-tool-calls=${b.maxToolCalls}`, `--authorization-max-display-bytes=${b.maxDisplayBytes}`, `--authorization-max-read-bytes=${b.maxReadBytes}`, `--authorization-max-output-tokens=${b.maxTokens}`]
  if (row.arm !== "N") args.push("--authorization-domain-tools", "--authorization-strategy=operation-evidence-v1", `--authorization-method=${row.method}`)
  return { prompt, args, taskKey: naturalRunTaskId(prompt) }
}
export function classifyOrdinary(trace: any, exitCode: number, arm: string) {
  const response = trace.attempts?.at(-1)?.response, finalProse = response?.text?.trim() ?? "", delivered = !!finalProse && !response?.toolCalls?.length
  if (hasUnknownAuthorizationCompletion(trace)) return { status: "completion-unknown", finalProse, formalCheck: arm === "N" ? "not-applicable" : "unknown" }
  if (arm === "N") return { status: exitCode === 0 && delivered && trace.sourceVerification?.valid === true ? "completed" : "completed-with-diagnostics", finalProse, formalCheck: "not-applicable" }
  const delivery = nativeDelivery(trace, exitCode), checked = delivery.status === "completed" && trace.sourceVerification?.valid === true && !!trace.result
  return { ...delivery, status: checked ? "completed" : "completed-with-diagnostics", formalCheck: checked ? "checked-bounded" : "not-checked-bounded" }
}

/** Supplemental immutable public-input registration; original AU/AT manifests stay unchanged. */
export async function registerOrdinary() {
  await check()
  const file = path.join(root, "ordinary-registration.json")
  if (await Bun.file(file).exists()) { const existing = await json(file); await verifyOrdinaryRegistration(existing); return existing }
  const manifestFile = path.join(root, "manifest.json"), manifest = await json(manifestFile), previousFile = path.join(at, "manifest.json"), previous = await json(previousFile), bundles: Array<SkillIdentity & { sourceSkill: string }> = []
  for (const sourceSkill of [...new Set<string>(manifest.inputs.map((i: any) => i.skill))].sort()) bundles.push({ sourceSkill, ...await skillBundleIdentity(path.resolve(root, sourceSkill)) })
  const changedPolicies = Object.fromEntries(["paperless-share-create", "gitea-create-issue"].map(task => {
    const matches = previous.rows.filter((r: any) => r.kind === "native" && r.task === task && r.variant === "changed")
    if (matches.length !== 1 || !matches[0].policyOverride?.text) throw new Error("Public changed policy unavailable")
    return [task, matches[0].policyOverride]
  }))
  const registration = { schemaVersion: "authorization-au-ordinary-registration/v1", manifestSha256: sha(await readFile(manifestFile)), publicPolicySource: { file: "../authorization-focused-closure-v1/manifest.json", sha256: sha(await readFile(previousFile)) },
    inputs: manifest.inputs.map((i: any) => ({ id: i.id, inputSha256: i.sha256, sourceSkill: i.skill, bundleSha256: bundles.find(b => b.sourceSkill === i.skill)!.bundleSha256 })), bundles, changedPolicies, modelAnswersIncluded: false, actualReferenceReadsRequiredInTrace: true }
  await save(file, registration)
  return registration
}
export async function verifyOrdinaryRegistration(registration: any) {
  await check()
  if (sha(await readFile(path.join(root, "manifest.json"))) !== registration.manifestSha256 || sha(await readFile(path.resolve(root, registration.publicPolicySource.file))) !== registration.publicPolicySource.sha256) throw new Error("Original manifest/public policy identity changed")
  const manifest = await json(path.join(root, "manifest.json"))
  const previous = await json(path.resolve(root, registration.publicPolicySource.file))
  for (const task of ["paperless-share-create", "gitea-create-issue"]) {
    const matches = previous.rows.filter((r: any) => r.kind === "native" && r.task === task && r.variant === "changed")
    if (matches.length !== 1 || JSON.stringify(matches[0].policyOverride) !== JSON.stringify(registration.changedPolicies[task])) throw new Error("Registered public policy changed")
  }
  for (const input of manifest.inputs) {
    const registered = registration.inputs.find((r: any) => r.id === input.id), bundle = registration.bundles.find((b: any) => b.sourceSkill === input.skill)
    if (registered?.inputSha256 !== input.sha256 || registered?.sourceSkill !== input.skill || registered?.bundleSha256 !== bundle?.bundleSha256) throw new Error("Complete skill/input registration mismatch")
    await verifySkillBundle(path.resolve(root, input.skill), bundle)
  }
}

async function executeOrdinary(selected: ReturnType<typeof selectOrdinaryRow>, manifest: any, registration: any, revision: string, output: string) {
  const { row, input } = selected, inputFile = modelInputPath(input.file), loaded = await loadInquiryInput(inputFile), skill = path.resolve(root, input.skill), bundle = registration.bundles.find((b: any) => b.sourceSkill === input.skill)
  await verifySkillBundle(skill, bundle)
  const workDir = path.resolve(repo, "../project-maintenance/runs/authorization-operation-evidence-v1", row.id, path.basename(output)), scopeFile = path.join(output, "scope.json"), traceFile = path.join(output, "native-trace.json")
  await mkdir(workDir, { recursive: true })
  const scope = makeNativeScope(loaded.value, loaded.context.sourceRoot, scopeFile, selected.policyOverride)
  await save(scopeFile, scope); await loadInquiryInput(scopeFile)
  const invocation = ordinaryInvocation({ ...selected, manifest, value: scope, skill, scopeFile, traceFile, workDir })
  await save(path.join(output, "ordinary-claim.json"), { row, revision, originalInput: input.file, originalInputSha256: input.sha256, originalSkill: input.skill, completeSkillBundle: bundle, ordinaryRegistrationSha256: sha(await readFile(path.join(root, "ordinary-registration.json"))), ...invocation, workDir, scopeFile, priorAnswersModelVisible: false, controlGraphSeeded: false, noAutomaticResend: true })
  const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...invocation.args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
  const capture = await captureOrdinaryAuthorConversation({ stdout: `${stdout}\n${stderr}`, taskKey: invocation.taskKey, logRoot: path.join(repo, ".skvm/log"), output }).catch(error => ({ providerCalls: null, respondedCalls: null, actualUSD: null, error: String(error), sourceCaptureFiles: [] }))
  await save(path.join(output, "conversation-accounting.json"), capture)
  const trace = await json(traceFile).catch(() => undefined)
  if (!trace) return { status: "completion-unknown", exitCode, error: "Native trace absent; inspect process before another dispatch", providerDispatches: capture.providerCalls, totalActualUsd: null }
  await save(path.join(output, "progress.json"), nativeProgress(trace))
  const verificationErrors: Array<{ code: string; message: string; severity: "error" }> = []
  const verifyBundle = async (file: string, code: string) => { try { await verifySkillBundle(file, bundle); return true } catch (error) { verificationErrors.push({ code, message: String(error), severity: "error" }); return false } }
  const sourceSkillUnmodified = await verifyBundle(skill, "original-skill-changed")
  const resourceRoot = trace.requests?.[0]?.params?.system?.match(/<runtime-resource-root>([^<]+)<\/runtime-resource-root>/)?.[1], installed = resourceRoot ? path.resolve(workDir, resourceRoot, "SKILL.md") : undefined
  const installedRelation = installed ? path.relative(workDir, installed) : undefined
  const installedWithinWork = !!installed && !!installedRelation && !installedRelation.startsWith("..") && !path.isAbsolute(installedRelation)
  const installedSkillVerified = installedWithinWork && await verifyBundle(installed!, "installed-skill-changed")
  if (!installedWithinWork) verificationErrors.push({ code: "installed-skill-unbound", message: "Actual complete skill installation is not trace-bound", severity: "error" })
  const inputUnmodified = sha(await readFile(inputFile)) === input.sha256, captureMatchesTrace = capture.providerCalls === trace.telemetry?.providerCalls && capture.respondedCalls === trace.telemetry?.respondedCalls
  const unexpectedExecutedTools = trace.history?.filter((h: any) => h.executed && !/^(source_(?:list|search|symbol|read|structure)|skill_reference_read|authorization_(?:compile|observe|check_result))$/.test(h.call?.name ?? "")) ?? []
  if (!inputUnmodified) verificationErrors.push({ code: "original-input-changed", message: "Registered original input changed", severity: "error" })
  if (!captureMatchesTrace) verificationErrors.push({ code: "conversation-accounting-unbound", message: "Task-hash-bound raw conversation and native telemetry disagree or are unavailable", severity: "error" })
  if (unexpectedExecutedTools.length) verificationErrors.push({ code: "unexpected-executed-tool", message: "Unexpected executed tool in the read-only runtime", severity: "error" })
  const delivery = classifyOrdinary(trace, exitCode, row.arm), valid = delivery.status === "completed" && !verificationErrors.length
  return { ...trace, ...delivery, ...(delivery.status === "completed" && !valid ? { status: "completed-with-diagnostics" } : {}), exitCode, ordinaryEntry: "skvm run", completeSkillBundleSha256: bundle.bundleSha256, sourceSkillUnmodified, installedSkillVerified, originalInputUnmodified: inputUnmodified,
    actualReferenceReads: trace.history?.filter((h: any) => h.call?.name === "skill_reference_read") ?? [], conversationCapture: { ...capture, matchesNativeTrace: captureMatchesTrace }, unexpectedExecutedTools, validation: { valid, diagnostics: verificationErrors }, targetExecutions: unexpectedExecutedTools.length ? null : 0 }
}
export async function developOrdinary(id: string, repairId?: string, repairOf?: string) {
  const registration = await registerOrdinary(), manifest = await json(path.join(root, "manifest.json")), selected = selectOrdinaryRow(manifest, id, registration), status = await json(path.join(root, "status.json"))
  await assertNoUnknownTask(root, selected.row.task)
  if (status.active?.length) throw new Error("A registered AU provider session is already active")
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), stage = selected.row.kind === "quality" ? "AU15" : "AU12"
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage, codeRevision: revision, active: [{ id, repairId: repairId ?? null, repairOf: repairOf ?? null }], nextAction: "Retain complete original skill use and independently evaluate every requested duty" }, null, 2) + "\n")
  const output = await developRows(root, [selected.row], { revision, model: manifest.testedModel, budgets: { ...manifest.budgets, sourceInput: selected.input, completeSkillBundleSha256: selected.bundleSha256 }, repairId, repairOf,
    execute: async (_row, outDir) => executeOrdinary(selected, manifest, registration, revision, outDir), evaluate: async (_row, report) => mechanicalReview(report) })
  const retained = await retainedReplay(root), latest = await json(path.join(root, "status.json"))
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...latest, stage, active: [], providerCalls: retained.rows.reduce((sum, r) => sum + r.knownProviderCalls, 0), lastKnownRequest: output.rows, nextAction: "Independent source and original-skill quality review before the next affected position", positions: latest.positions.map((p: any) => ({ ...p, ...(output.rows.find((r: any) => r.id === p.id) ?? {}) })) }, null, 2) + "\n")
  return output
}
if (import.meta.main) console.log(JSON.stringify(await (process.argv[2] === "register" ? registerOrdinary() : process.argv[2] === "develop" ? developOrdinary(process.argv[3]!, process.argv[4], process.argv[5]) : Promise.reject(new Error("Use register | develop <native-or-quality-id> [repair-id <exact-row-id>/attempt-n]"))), null, 2))
