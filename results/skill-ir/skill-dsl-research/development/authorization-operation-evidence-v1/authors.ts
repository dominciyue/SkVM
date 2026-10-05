import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { readFile, writeFile, mkdir, readdir, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gunzipSync } from "node:zlib"
import { authorizationInquiryAuthoringSchema, checkAuthorizationInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools, type InquiryToolsOptions } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { OPERATION_DECLARATION_GUIDE } from "../../../../../src/benchmarks/authorization-dsl/inquiry-run.ts"
import { zodToJsonSchema } from "../../../../../src/providers/structured.ts"
import { naturalRunTaskId } from "../../../../../src/run/index.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { developRows, mechanicalReview, replay as retainedReplay } from "../authorization-guided-runtime-v1/study.ts"
import { captureOrdinaryAuthorConversation } from "../authorization-guided-runtime-v1/ordinary-author-capture.ts"
import { registerOrdinary, selectOrdinaryRow, verifySkillBundle, executeOrdinary } from "./ordinary.ts"
import { root, repo, json, save, sha, modelInputPath, type Position } from "./study.ts"

export function authorMetadata(value: any, policyOverride?: unknown) {
  if (!value.brief?.trim()) throw new Error("Author requires the original natural request")
  const mode = value.mode ?? "behavior", policy = policyOverride ?? value.policy
  return { taskId: value.taskId, repository: value.repository, sourceRef: value.sourceRef, sourceRoot: "source", allowedPaths: value.allowedPaths, request: value.brief, mode, ...(policy ? { policy } : {}) }
}
export function authorInvocation(options: { metadata: ReturnType<typeof authorMetadata>; model: string; skill: string; workDir: string; repair?: boolean }) {
  const prompt = `Original natural request: ${options.metadata.request}\nCurrent public metadata and independent policy: ${JSON.stringify(options.metadata)}\nUse the complete supplied original skill to author inquiry.json and USAGE.md for this task. Read task.json, format.schema.json and cli-usage.txt. Write a complete authorization-inquiry-input/v1 with authorization-inquiry/v2 under inquiry; derive every question and explicit user premise from the original request. Keep the supplied identity, allowed paths, mode and policy exactly; sourceRoot is source. The host supplies no target question set, source answers, control graph or source-derived known values.\n${OPERATION_DECLARATION_GUIDE}\nUSAGE.md must show the ordinary complete-original-skill entry with the authored configuration, operation-evidence-v1 and honest remaining skill duties and source-only limits. Source is an ordinary copied snapshot under source; inspect only as needed to express the task. Preserve source and mechanical files. Do not execute target code, patch source, use network, install software, call another model, or launch analysis/check commands. ${options.repair ? "This is the one named field repair of the original draft. Read repair-diagnostics.json and preserve valid task content while correcting diagnosed public-schema fields." : "Finish after both files are written."}`
  return { prompt, taskKey: naturalRunTaskId(prompt), args: ["run", `--prompt=${prompt}`, `--skill=${options.skill}`, `--model=${options.model}`, "--adapter=bare-agent", `--workdir=${options.workDir}`, "--max-steps=12", "--timeout-ms=1200000"] }
}
export function authorIdentityDiagnostics(check: any, metadata: ReturnType<typeof authorMetadata>, inputFile: string, source: string, files: unknown) {
  const diagnostics: Array<{ code: string; message: string }> = []
  if (check.status !== "valid") return diagnostics
  const value = check.input
  if (value.inquiry?.schemaVersion !== "authorization-inquiry/v2") diagnostics.push({ code: "author-operation-declaration-missing", message: "Deliver the complete published v2 operation declaration" })
  if (value.taskId !== metadata.taskId || value.repository !== metadata.repository || value.sourceRef !== metadata.sourceRef || path.resolve(path.dirname(inputFile), value.sourceRoot) !== path.resolve(source) || !isDeepStrictEqual(value.allowedPaths, metadata.allowedPaths) || !isDeepStrictEqual(check.sourceFiles, files)) diagnostics.push({ code: "author-source-identity-mismatch", message: "Preserve supplied source metadata, scope and bytes" })
  if (value.inquiry?.mode !== metadata.mode || !isDeepStrictEqual(value.inquiry?.policy, metadata.policy)) diagnostics.push({ code: "author-independent-policy-mismatch", message: "Preserve current independent mode and policy" })
  return diagnostics
}
export function assertAuthorConsumerIdentity(claim: any, report: any, expected: { row: Position; originalInputSha256: string; bundleSha256: string; inputSha256: string; usageSha256: string; sourceInput?: unknown }) {
  for (const key of ["id", "task", "kind", "arm", "variant"] as const) if (claim.row?.[key] !== expected.row[key]) throw new Error("Original registered author/variant mismatch")
  if (claim.row.method !== "D1" || claim.row.strategy !== "operation-evidence-v1" || report.status !== "completed" || hasUnknownAuthorizationCompletion(report) || report.sourceSkillUnmodified !== true || report.sourceUnmodified !== true || report.installedSkillVerified !== true || claim.originalInputSha256 !== expected.originalInputSha256 || claim.completeSkillBundle?.bundleSha256 !== expected.bundleSha256 || report.authoredArtifacts?.inputSha256 !== expected.inputSha256 || report.authoredArtifacts?.usageSha256 !== expected.usageSha256 || expected.sourceInput && !isDeepStrictEqual(claim.sourceInput, expected.sourceInput)) throw new Error("Original author/input/complete skill/output identity mismatch")
}
export function authorConsumerAdmission(evaluation: any, reportSha256: string) {
  const eligible = evaluation?.schemaVersion === "au-independent-author-evaluation/v1" && evaluation.sha256 === reportSha256 && evaluation.authorCoverage === "faithful" && evaluation.targetExecutionAudit?.verified === true && evaluation.targetExecutionAudit.targetExecutions === 0
  return { eligible, providerCalls: 0, reason: eligible ? "Exact report-bound task fidelity and raw tool audit qualify original bytes" : "Author task fidelity/raw tool audit is absent, mismatched or unmet; no qualified consumption" }
}
export async function prepareConsumerBytes(options: { input: Buffer; usage: Buffer; context: InquiryToolsOptions; output: string }) {
  const portable = path.join(options.output, "portable"), scopeFile = path.join(portable, "inquiry.json")
  await mkdir(portable, { recursive: true }); await writeFile(scopeFile, options.input, { flag: "wx" }); await writeFile(path.join(portable, "USAGE.md"), options.usage, { flag: "wx" })
  const value = JSON.parse(options.input.toString("utf8"))
  if (typeof value.sourceRoot !== "string" || path.resolve(portable, value.sourceRoot) !== path.resolve(portable, "source")) throw new Error("Exact-byte consumer requires the author's registered portable sourceRoot")
  const sourceFiles = await copySourceSnapshot(options.context, path.join(portable, "source")), check = await checkAuthorizationInquiry(scopeFile, "D1", "operation-evidence-v1")
  if (check.status !== "valid" || !isDeepStrictEqual(check.sourceFiles, sourceFiles) || sha(await readFile(scopeFile)) !== sha(options.input)) throw new Error("Exact-byte consumer source/input verification failed")
  return { scopeFile, sha256: sha(options.input), sourceFiles }
}
function selectAuthor(manifest: any, id: string, registration: any) {
  const matches = manifest.rows.filter((p: Position) => p.kind === "author" && p.id === id)
  if (matches.length !== 1) throw new Error("Use one registered AU author position")
  const position: Position = matches[0], selected = selectOrdinaryRow(manifest, `native-${position.task}-${position.variant}`, registration)
  const row = { ...position, method: "D1" as const, strategy: "operation-evidence-v1", sourceSkill: selected.input.skill, components: ["ordinary-provider", "authoring", "source-snapshot", "author-delivery"] }
  return { ...selected, row }
}
async function registerAuthors(registration: any) {
  const file = path.join(root, "author-registration.json"), value = { schemaVersion: "authorization-au-author-registration/v1", ordinaryRegistrationSha256: sha(await readFile(path.join(root, "ordinary-registration.json"))), manifestSha256: registration.manifestSha256, authorMaxProviderSteps: 12, timeoutMs: 1200000, outputTokens: "ordinary bare-agent default 6000; actual requests retained", authorFieldRepairMaximum: 1, consumerBudgets: (await json(path.join(root, "manifest.json"))).budgets, humanMinutes: null }
  if (await Bun.file(file).exists()) { if (!isDeepStrictEqual(await json(file), value)) throw new Error("Author registration changed") } else await save(file, value)
}
async function startStage(id: string, task: string, stage: string, repairId?: string, repairOf?: string) {
  await assertNoUnknownTask(root, task)
  const status = await json(path.join(root, "status.json")), manifest = await json(path.join(root, "manifest.json"))
  if (status.active?.length) throw new Error("A registered AU provider session is active")
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage, codeRevision: revision, active: [{ id, repairId: repairId ?? null, repairOf: repairOf ?? null }], nextAction: "Retain original model author/consumer bytes and actual full-skill conversation" }, null, 2) + "\n")
  return revision
}
async function finishStage(output: any) {
  const retained = await retainedReplay(root), status = await json(path.join(root, "status.json"))
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, active: [], providerCalls: retained.rows.reduce((n, r) => n + r.knownProviderCalls, 0), lastKnownRequest: output.rows, nextAction: "Independent raw-tool/original-duty review; exact-byte consumer or one author field repair", positions: status.positions.map((p: any) => ({ ...p, ...(output.rows.find((r: any) => r.id === p.id) ?? {}) })) }, null, 2) + "\n")
  return output
}
export async function developAuthor(id: string, repairId?: string, repairOf?: string) {
  const registration = await registerOrdinary(), manifest = await json(path.join(root, "manifest.json")), selected = selectAuthor(manifest, id, registration)
  await registerAuthors(registration)
  if (repairId) { const match = repairOf?.match(/^(.+)\/attempt-1$/); if (match?.[1] !== id || (await json(path.join(root, "runs", repairOf!, "claim.json"))).repairOf) throw new Error("Only one field repair of this original author is permitted") }
  const revision = await startStage(id, selected.row.task, "AU13", repairId, repairOf), inputFile = modelInputPath(selected.input.file), loaded = await loadInquiryInput(inputFile), skill = path.resolve(root, selected.input.skill), bundle = registration.bundles.find((b: any) => b.sourceSkill === selected.input.skill)
  const output = await developRows(root, [selected.row], { revision, model: manifest.testedModel, budgets: { ...await json(path.join(root, "author-registration.json")), sourceInput: selected.input, completeSkillBundleSha256: selected.bundleSha256 }, repairId, repairOf, execute: async (_row, output) => {
    await verifySkillBundle(skill, bundle)
    const workDir = path.resolve(repo, "../project-maintenance/runs/authorization-operation-evidence-v1", id, path.basename(output)), source = path.join(workDir, "source")
    await mkdir(workDir, { recursive: true })
    const copiedSourceFiles = await copySourceSnapshot(loaded.context, source), metadata = authorMetadata(loaded.value, selected.policyOverride)
    await save(path.join(workDir, "task.json"), metadata); await save(path.join(workDir, "format.schema.json"), zodToJsonSchema(authorizationInquiryAuthoringSchema(metadata.mode, "v2")))
    await writeFile(path.join(workDir, "cli-usage.txt"), "skvm run --prompt=<original-natural-request> --skill=<complete-original-SKILL.md> --model=<chosen-model> --adapter=bare-agent --authorization-scope=inquiry.json --authorization-domain-tools --authorization-strategy=operation-evidence-v1 --authorization-method=D1\nThe complete declaration compiles mechanically; source remains relative to inquiry.json. Preserve all original skill duties and source-only limits.\n", { flag: "wx" })
    if (repairOf) { const previous = path.join(root, "runs", repairOf), retained = await json(path.join(previous, "report.json")); for (const name of ["inquiry.json", "USAGE.md"]) { const raw = await readFile(path.join(previous, `authored-${name}`)).catch(() => undefined); if (raw) await writeFile(path.join(workDir, name), raw, { flag: "wx" }) }; await save(path.join(workDir, "repair-diagnostics.json"), { repairOf, validation: retained.report.validation?.diagnostics, additionalDiagnostics: retained.report.additionalDiagnostics }) }
    const invocation = authorInvocation({ metadata, model: manifest.testedModel, skill, workDir, repair: !!repairOf })
    await save(path.join(output, "ordinary-claim.json"), { row: selected.row, revision, ...invocation, workDir, source, sourceInput: selected.input, originalInputSha256: selected.input.sha256, completeSkillBundle: bundle, copiedSourceFiles, hostFillsOnlyMechanicalMetadata: true, completeTaskDeclarationSupplied: false, priorAnswersModelVisible: false, targetExecutionsRequested: 0, humanMinutes: null })
    const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...invocation.args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" }), [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
    const capture = await captureOrdinaryAuthorConversation({ stdout: `${stdout}\n${stderr}`, taskKey: invocation.taskKey, logRoot: path.join(repo, ".skvm/log"), output }).catch(error => ({ providerCalls: null, respondedCalls: null, knownTokens: null, sourceCaptureFiles: [], error: String(error) }))
    await save(path.join(output, "conversation-accounting.json"), capture)
    const authoredInput = path.join(workDir, "inquiry.json"), validation = await checkAuthorizationInquiry(authoredInput, "D1", "operation-evidence-v1"), additionalDiagnostics = authorIdentityDiagnostics(validation, metadata, authoredInput, source, copiedSourceFiles), authoredArtifacts: Record<string, string> = {}
    for (const name of ["inquiry.json", "USAGE.md"]) { const raw = await readFile(path.join(workDir, name)).catch(() => undefined); if (raw?.length) { await writeFile(path.join(output, `authored-${name}`), raw, { flag: "wx" }); authoredArtifacts[name === "inquiry.json" ? "inputSha256" : "usageSha256"] = sha(raw) } else additionalDiagnostics.push({ code: "author-delivery-missing", message: `${name} absent or empty` }) }
    let sourceSkillUnmodified = false, sourceUnmodified = false, installedSkillVerified = false
    try { await verifySkillBundle(skill, bundle); sourceSkillUnmodified = true } catch (error) { additionalDiagnostics.push({ code: "author-original-skill-changed", message: String(error) }) }
    try { const original = await createInquiryTools(loaded.context), copied = await createInquiryTools({ ...loaded.context, sourceRoot: source }); sourceUnmodified = isDeepStrictEqual(original.files, copiedSourceFiles) && isDeepStrictEqual(copied.files, copiedSourceFiles); if (!sourceUnmodified) throw new Error("Original or copied source changed") } catch (error) { additionalDiagnostics.push({ code: "author-source-changed", message: String(error) }) }
    let capturedEvents: any[] = []
    try { capturedEvents = (await Promise.all(capture.sourceCaptureFiles.map(async (f: any) => gunzipSync(await readFile(path.join(output, f.archive))).toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))))).flat() } catch (error) { additionalDiagnostics.push({ code: "author-capture-local-error", message: String(error) }) }
    const firstRequest = capturedEvents.find(e => e.type === "request"), resourceRoot = firstRequest?.system?.match(/<runtime-resource-root>([^<]+)<\/runtime-resource-root>/)?.[1]
    try { if (!resourceRoot) throw new Error("Installed complete skill is not raw-request-bound"); const installed = path.resolve(workDir, resourceRoot, "SKILL.md"), rel = path.relative(workDir, installed); if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Installed skill outside work directory"); await verifySkillBundle(installed, bundle); installedSkillVerified = true } catch (error) { additionalDiagnostics.push({ code: "author-installed-skill-unbound", message: String(error) }) }
    if (sha(await readFile(inputFile)) !== selected.input.sha256) additionalDiagnostics.push({ code: "author-original-input-changed", message: "Registered input changed" })
    const known = capture.providerCalls != null && capture.providerCalls > 0 && capture.respondedCalls === capture.providerCalls, valid = exitCode === 0 && validation.status === "valid" && !additionalDiagnostics.length
    return { status: !known ? "completion-unknown" : valid ? "completed" : "completed-with-diagnostics", exitCode, validation, additionalDiagnostics, workDir, source, copiedSourceFiles, capture, sourceSkillUnmodified, installedSkillVerified, sourceUnmodified, authoredArtifacts, telemetry: { providerCalls: capture.providerCalls, respondedCalls: capture.respondedCalls, knownTokens: capture.knownTokens, totalActualUsd: null }, actualOutputLimits: capturedEvents.filter(e => e.type === "request").map(e => e.maxTokens ?? null), rawToolCalls: capturedEvents.filter(e => e.type === "response").flatMap(e => e.toolCalls ?? []), rawToolResults: capturedEvents.filter(e => e.type === "request").flatMap(e => e.toolResults ?? []), targetExecutions: null, rawToolAudit: "pending-independent-review", semanticTaskCoverage: "pending-independent-review", modelConfigBytesEdited: false, humanMinutes: null }
  }, evaluate: async (_row, report) => report.status === "completed" ? {} : { failure: { category: report.status === "completion-unknown" ? "infrastructure" : "semantic-extraction", rootCause: "Original author failed its known-completion/public-format/source contract", components: ["model-author"] } } })
  return finishStage(output)
}
export async function consumeAuthor(id: string, repairId?: string, repairOf?: string) {
  const registration = await registerOrdinary(), manifest = await json(path.join(root, "manifest.json")), consumer: Position | undefined = manifest.rows.find((p: Position) => p.id === id && p.kind === "consumer")
  if (!consumer) throw new Error("Use one registered AU consumer position")
  const author = selectAuthor(manifest, `author-${consumer.task}-${consumer.variant}`, registration)
  await assertNoUnknownTask(root, consumer.task)
  const directory = path.join(root, "runs", author.row.id), names = (await readdir(directory).catch(() => [])).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)))
  let chosen: { directory: string; report: any } | undefined
  for (const name of names) { const retained = await json(path.join(directory, name, "report.json")); if (hasUnknownAuthorizationCompletion(retained.report)) throw new Error("Unknown author completion is sealed"); if (!chosen && retained.report.status === "completed" && retained.report.validation?.status === "valid" && !retained.report.additionalDiagnostics?.length) chosen = { directory: path.join(directory, name), report: retained.report } }
  if (!chosen) { const record = { id, status: "blocked-dependent-author", providerCalls: 0, reason: "No valid original model-authored delivery; permitted field repair must be adjudicated separately" }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  const input = await readFile(path.join(chosen.directory, "authored-inquiry.json")), usage = await readFile(path.join(chosen.directory, "authored-USAGE.md")), claim = await json(path.join(chosen.directory, "ordinary-claim.json"))
  assertAuthorConsumerIdentity(claim, chosen.report, { row: author.row, originalInputSha256: author.input.sha256, bundleSha256: author.bundleSha256, inputSha256: sha(input), usageSha256: sha(usage), sourceInput: author.input })
  const loaded = await loadInquiryInput(modelInputPath(author.input.file)), authorReportSha256 = sha(await readFile(path.join(chosen.directory, "report.json"))), evaluationFile = path.join(root, "evaluations", `${author.row.id}-${path.basename(chosen.directory)}.json`), admission = authorConsumerAdmission(await json(evaluationFile).catch(() => undefined), authorReportSha256)
  if (!admission.eligible) { const record = { id, status: "blocked-dependent-author", ...admission, author: author.row.id, authorReportSha256 }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  const sourceCheck = await checkAuthorizationInquiry(path.join(chosen.report.workDir, "inquiry.json"), "D1", "operation-evidence-v1")
  if (sourceCheck.status !== "valid" || authorIdentityDiagnostics(sourceCheck, authorMetadata(loaded.value, author.policyOverride), path.join(chosen.report.workDir, "inquiry.json"), chosen.report.source, chosen.report.copiedSourceFiles).length) throw new Error("Author source identity changed before consumption")
  const selected = { ...author, row: { ...consumer, method: "D1" as const, strategy: "operation-evidence-v1", sourceSkill: author.input.skill, components: ["wire", "source", "checker", "worklist", "delivery"] } }, revision = await startStage(id, consumer.task, "AU13", repairId, repairOf)
  const output = await developRows(root, [selected.row], { revision, model: manifest.testedModel, budgets: { ...manifest.budgets, sourceInput: author.input, completeSkillBundleSha256: author.bundleSha256 }, repairId, repairOf, execute: async (_row, output) => {
    const prepared = await prepareConsumerBytes({ input, usage, context: { ...loaded.context, sourceRoot: chosen!.report.source }, output }), provenance = { author: author.row.id, authorReportSha256, originalInputSha256: author.input.sha256, consumedInputSha256: sha(input), consumedUsageSha256: sha(usage), sourceFiles: prepared.sourceFiles, modelConfigBytesEdited: false, priorAnswersModelVisible: false }
    await save(path.join(output, "consumed-input.json"), provenance)
    return executeOrdinary(selected, manifest, registration, revision, output, { scopeFile: prepared.scopeFile, sha256: prepared.sha256, naturalBrief: loaded.value.brief!, provenance })
  }, evaluate: async (_row, report) => mechanicalReview(report) })
  return finishStage(output)
}
if (import.meta.main) console.log(JSON.stringify(await (process.argv[2] === "develop" ? developAuthor(process.argv[3]!, process.argv[4], process.argv[5]) : process.argv[2] === "consume" ? consumeAuthor(process.argv[3]!, process.argv[4], process.argv[5]) : Promise.reject(new Error("Use develop <author-id> | consume <consumer-id> [repair-id <exact-row-id>/attempt-n]"))), null, 2))
