import path from "node:path"
import { readFile, writeFile, mkdir, readdir, cp, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { json, loadRegisteredInput, registeredInputIdentity } from "./study.ts"
import { root, repo, sha } from "./prepare.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"
import { selectNativeRow } from "./native.ts"
import { developRows, retainLocalRun, mechanicalReview } from "../authorization-guided-runtime-v1/study.ts"
import { captureOrdinaryAuthorConversation } from "../authorization-guided-runtime-v1/ordinary-author-capture.ts"
import { loadInquiryInput, authorizationInquiryAuthoringSchema, checkAuthorizationInquiry, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { zodToJsonSchema } from "../../../../../src/providers/structured.ts"
import { InquiryPolicySchema } from "../../../../../src/task-dsl/authorization/inquiry.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectAuthor(manifest: any, id: string) {
  const matches = manifest.authors.filter((a: any) => a.id === id)
  if (matches.length !== 1) throw new Error("A single registered author is required")
  const author = matches[0], task = manifest.tasks.find((t: any) => t.id === author.task), native = manifest.rows.find((r: any) => r.kind === "native" && r.task === author.task && r.skill === author.skill && r.variant === author.variant)
  if (task?.admission !== "eligible") throw new Error("Logical task sealed")
  if (!native || native.sourceSkill !== author.sourceSkill) throw new Error("Preserve the registered original skill and variant policy")
  selectNativeRow(manifest, native.id)
  if (author.variant === "original" ? native.policyOverride != null : author.variant !== "changed" || !InquiryPolicySchema.safeParse(native.policyOverride).success) throw new Error("Preserve the registered original skill variant policy")
  if (author.fieldOrigin !== "model-authored" || author.hostFillsOnlyMechanicalMetadata !== true) throw new Error("Questions must remain model authored")
  return { author, native, task }
}
export function assertAuthorConsumeIdentity(author: any, claim: any, report: any, actual: any) {
  if (claim.row?.id !== author.id || claim.row?.task !== author.task || claim.row?.sourceSkill !== author.sourceSkill || claim.row?.variant !== author.variant || claim.row?.kind !== "author" || claim.row?.method !== "D1" || claim.row?.strategy !== "focused-closure-v1" || report.sourceSkillUnmodified !== true || claim.originalSkill !== actual.originalSkill || report.originalSkillSha256 !== actual.originalSkillSha256 || claim.originalSkillSha256 !== actual.originalSkillSha256 || claim.originalInputSha256 !== actual.originalInputSha256 || !isDeepStrictEqual(claim.sourceInput, actual.sourceInput) || report.authoredArtifacts?.inputSha256 !== actual.inputSha256 || report.authoredArtifacts?.usageSha256 !== actual.usageSha256) throw new Error("Original author delivery identity changed; no provider permitted")
}
const usage = 'All options use --name=value; all input paths are relative to this portable folder.\nskvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=focused-closure-v1\nskvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=focused-closure-v1\nskvm authorization inquiry inspect --out=runs\nskvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json\nskvm authorization inquiry compare --input=changed.json --previous=runs --strategy=focused-closure-v1\nskvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=focused-closure-v1 --previous=runs\nEdit file: {schemaVersion:"authorization-inquiry-edit/v1",reason:<nonempty>,operations:[{kind:"request",questionId,statement}|{kind:"premises",questionId,premises:[{text,origin:"user"}]}|{kind:"policy",policy:{text,origin:"user"|"external-policy",location}}]}. Editing never analyzes. Previous requires known completed/checked/bounded same-strategy source. Source changes require fresh. Inspect unknown completion; never resend it. No target execution or whole audit is supplied by this bounded inquiry.\n'
export async function developAuthor(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), { author, native, task } = selectAuthor(manifest, id)
  await assertNoUnknownTask(root, author.task)
  const originalFile = await loadRegisteredInput(manifest, task)
  const loaded = await loadInquiryInput(originalFile), skill = path.resolve(root, author.sourceSkill), originalSkillSha256 = sha(await readFile(skill)), revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  if (!author.sourceSkillSha256 || originalSkillSha256 !== author.sourceSkillSha256) throw new Error("Frozen complete source skill changed or was not registered")
  if (repairOf) { const previous = await json(path.join(root, "runs", repairOf, "claim.json")); if (previous.repairOf || previous.attempt !== 1) throw new Error("Only one diagnosed author field revision is permitted") }
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const row = { ...author, kind: "author", method: "D1" as const, strategy: "focused-closure-v1", components: ["ordinary-provider", "authoring", "source-snapshot", "author-delivery"] }
  return developRows(root, [row], { revision, model: manifest.testedModel, budgets: { maxProviderSteps: 12, timeoutMs: 1200000, outputTokens: "ordinary adapter default; actual requests retained", separateFromQualityBudget: true }, repairId, repairOf,
    execute: async (_row, output) => {
      const workDir = path.resolve(repo, "../project-maintenance/runs/authorization-focused-closure-v1", id, path.basename(output)), source = path.join(workDir, "source")
      await mkdir(workDir, { recursive: true })
      const copiedSourceFiles = await copySourceSnapshot(loaded.context, source), mode = loaded.value.inquiry?.mode ?? loaded.value.mode ?? "behavior", policy = native.policyOverride ?? loaded.value.inquiry?.policy ?? loaded.value.policy
      const metadata = { taskId: loaded.value.taskId, repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, allowedPaths: loaded.value.allowedPaths, request: loaded.value.brief, mode, ...(policy ? { policy } : {}) }
      await save(path.join(workDir, "task.json"), metadata); await save(path.join(workDir, "format.schema.json"), zodToJsonSchema(authorizationInquiryAuthoringSchema(mode))); await writeFile(path.join(workDir, "cli-usage.txt"), usage, { flag: "wx" })
      if (repairOf) {
        const previous = path.join(root, "runs", repairOf), retained = await json(path.join(previous, "report.json"))
        for (const name of ["inquiry.json", "USAGE.md"]) { const raw = await readFile(path.join(previous, `authored-${name}`)).catch(error => { if (error.code === "ENOENT") return undefined; throw error }); if (raw) await writeFile(path.join(workDir, name), raw, { flag: "wx" }) }
        await save(path.join(workDir, "repair-diagnostics.json"), { repairOf, validation: retained.report.validation, additionalDiagnostics: retained.report.additionalDiagnostics })
      }
      const prompt = `Original natural request: ${metadata.request}\nCurrent mode: ${mode}\n${policy ? `Independent current policy: ${JSON.stringify(policy)}\n` : ""}Use the complete supplied original skill to author a reusable authorization inquiry configuration, not an answer. Read task.json, format.schema.json and cli-usage.txt. Write inquiry.json with the complete published declaration: derive all questions, caller/resource/operation distinctions and explicit user premises from the natural request. Keep supplied identity, scope, mode and independent policy exactly. Use relative sourceRoot source. No complete question set, answer, control graph, expected source behavior or source-derived known values is provided by the host. Write USAGE.md with portable ordinary commands, current focused-closure-v1 strategy and honest remaining duties. Preserve the original skill's applicable guidance and broader responsibilities when those scopes are requested. This is focused configuration authoring; source is copied under source and may be inspected only as needed to express the task. Preserve source and mechanical files. Do not execute target code, apply patches, use network, install anything, invoke another model or launch analysis/check commands. ${repairOf ? "This is a named repair of your preserved prior draft; use repair-diagnostics.json and the public schema/CLI contract to fix its diagnosed fields, preserving its valid task content." : "Finish after delivering both files."}`
      const args = ["run", `--prompt=${prompt}`, `--skill=${skill}`, `--model=${manifest.testedModel}`, "--adapter=bare-agent", `--workdir=${workDir}`, "--max-steps=12", "--timeout-ms=1200000"]
      await save(path.join(output, "ordinary-claim.json"), { row, revision, workDir, source, args, prompt, originalInputSha256: task.inputSha256, sourceInput: registeredInputIdentity(manifest, task), originalSkill: skill, originalSkillSha256, copiedSourceFiles, hostFillsOnlyMechanicalMetadata: true, completeTaskDeclarationSupplied: false, priorAnswersModelVisible: false, targetExecutionsRequested: 0, humanMinutes: null })
      const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" }), [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
      const inputFile = path.join(workDir, "inquiry.json"), validation = await checkAuthorizationInquiry(inputFile, "D1", "focused-closure-v1"), additionalDiagnostics: Array<{ code: string; message: string }> = []
      if (validation.status === "valid") {
        if (!validation.input.inquiry) additionalDiagnostics.push({ code: "author-complete-declaration-missing", message: "Deliver the requested complete declaration" })
        if (validation.input.taskId !== metadata.taskId || validation.input.repository !== metadata.repository || validation.input.sourceRef !== metadata.sourceRef || path.resolve(path.dirname(inputFile), validation.input.sourceRoot) !== source || !isDeepStrictEqual(validation.input.allowedPaths, metadata.allowedPaths) || !isDeepStrictEqual(validation.sourceFiles, copiedSourceFiles)) additionalDiagnostics.push({ code: "author-source-identity-mismatch", message: "Preserve supplied metadata, source scope and original bytes" })
        if (validation.input.inquiry?.mode !== mode || !isDeepStrictEqual(validation.input.inquiry?.policy, policy)) additionalDiagnostics.push({ code: "author-independent-policy-mismatch", message: "Preserve the current independently supplied mode and policy" })
      }
      const authoredArtifacts: Record<string, string> = {}
      for (const name of ["inquiry.json", "USAGE.md"]) { const raw = await readFile(path.join(workDir, name)).catch(error => { if (error.code === "ENOENT") return undefined; throw error }); if (raw) { await writeFile(path.join(output, `authored-${name}`), raw, { flag: "wx" }); authoredArtifacts[name === "inquiry.json" ? "inputSha256" : "usageSha256"] = sha(raw) } else additionalDiagnostics.push({ code: "author-delivery-missing", message: `${name} is absent` }) }
      const sourceSkillUnmodified = sha(await readFile(skill)) === originalSkillSha256
      if (!sourceSkillUnmodified) additionalDiagnostics.push({ code: "author-original-skill-changed", message: "Preserve the complete original skill" })
      const capture = await captureOrdinaryAuthorConversation({ stdout, taskKey: `natural-${sha(prompt).slice(0, 12)}`, logRoot: path.join(repo, ".skvm/log"), output }), known = capture.providerCalls != null && capture.providerCalls > 0 && capture.respondedCalls === capture.providerCalls, valid = exitCode === 0 && validation.status === "valid" && additionalDiagnostics.length === 0
      return { status: !known ? "completion-unknown" : valid ? "completed" : "completed-with-diagnostics", exitCode, validation, additionalDiagnostics, workDir, source, capture, originalSkillSha256, sourceSkillUnmodified, authoredArtifacts, telemetry: { providerCalls: capture.providerCalls, respondedCalls: capture.respondedCalls, knownTokens: capture.knownTokens, totalActualUsd: null }, targetExecutions: "not requested; offline raw tool review pending", semanticTaskCoverage: "pending-independent-review", humanMinutes: null, modelConfigBytesEdited: false }
    }, evaluate: async (_row, report) => report.status === "completed" ? {} : { failure: { category: report.status === "completion-unknown" ? "infrastructure" : "semantic-extraction", rootCause: "Original model author delivery failed its retained public format/scope/known-completion contract", components: ["model-author"] } } })
}
export async function consumeAuthor(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), { author, task } = selectAuthor(manifest, id)
  await assertNoUnknownTask(root, author.task)
  const directory = path.join(root, "runs", id), names = (await readdir(directory).catch(() => [])).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)))
  let chosen: { directory: string; report: any } | undefined
  for (const name of names) { const report = await json(path.join(directory, name, "report.json")); if (hasUnknownAuthorizationCompletion(report.report)) throw new Error("Unknown author completion is sealed"); if (report.report.status === "completed" && report.report.validation.status === "valid" && !report.report.additionalDiagnostics.length) { chosen = { directory: path.join(directory, name), report: report.report }; break } }
  if (!chosen) { const record = { id: `consume-${id}`, status: "blocked-dependent-author", providerCalls: 0, reason: "No valid original model-authored delivery" }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  const input = await readFile(path.join(chosen.directory, "authored-inquiry.json")), usage = await readFile(path.join(chosen.directory, "authored-USAGE.md")), originalSkill = path.resolve(root, author.sourceSkill), claim = await json(path.join(chosen.directory, "ordinary-claim.json"))
  await loadRegisteredInput(manifest, task)
  assertAuthorConsumeIdentity(author, claim, chosen.report, { originalSkill, originalSkillSha256: sha(await readFile(originalSkill)), originalInputSha256: sha(await readFile(path.resolve(root, task.inputFile))), sourceInput: registeredInputIdentity(manifest, task), inputSha256: sha(input), usageSha256: sha(usage) })
  const authorReportSha256 = sha(await readFile(path.join(chosen.directory, "report.json"))), revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), row = { ...author, id: `consume-${id}`, kind: "authored-consume", method: "D1" as const, strategy: "focused-closure-v1", components: ["wire", "source", "checker", "delivery", "worklist"] }
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  return developRows(root, [row], { revision, model: manifest.testedModel, budgets: manifest.authorConsumerBudgets, repairId, repairOf, execute: async (_row, output) => {
    const portable = path.resolve(repo, "../project-maintenance/runs/authorization-focused-closure-v1", row.id, path.basename(output)), analysis = path.join(output, "analysis")
    await mkdir(portable, { recursive: true }); await writeFile(path.join(portable, "inquiry.json"), input, { flag: "wx" }); await writeFile(path.join(portable, "USAGE.md"), usage, { flag: "wx" }); await cp(chosen!.report.source, path.join(portable, "source"), { recursive: true, force: false, errorOnExist: true })
    const checked = await checkAuthorizationInquiry(path.join(portable, "inquiry.json"), "D1", "focused-closure-v1")
    if (checked.status !== "valid" || !isDeepStrictEqual(checked.sourceFiles, chosen!.report.validation.sourceFiles)) throw new Error("Portable author bytes/source differ; no provider permitted")
    const b = manifest.authorConsumerBudgets
    const args = ["authorization", "inquiry", "run", "--input=./inquiry.json", `--out=${analysis}`, `--model=${manifest.testedModel}`, "--method=D1", "--strategy=focused-closure-v1", `--max-provider-calls=${b.maxDispatches}`, `--max-tool-calls=${b.maxToolCalls}`, `--max-display-bytes=${b.maxDisplayBytes}`, `--max-read-bytes=${b.maxReadBytes}`, `--max-output-tokens=${b.maxTokens}`, `--request-timeout-ms=${b.perCallTimeoutMs}`, `--session-timeout-ms=${b.sessionTimeoutMs}`]
    await save(path.join(output, "consume-identity.json"), { authorReport: path.relative(root, chosen!.directory).split(path.sep).join("/") + "/report.json", authorReportSha256, authoredInputSha256: sha(input), consumedInputSha256: sha(await readFile(path.join(portable, "inquiry.json"))), modelConfigBytesEdited: false, portable, args, originalSkillSha256: chosen!.report.originalSkillSha256 })
    await writeFile(path.join(output, "consumed-inquiry.json"), input, { flag: "wx" }); await writeFile(path.join(output, "consumed-USAGE.md"), usage, { flag: "wx" })
    const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: portable, env: process.env, stdout: "pipe", stderr: "pipe" }), [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
    return { ...await retainLocalRun(await inspectLocalInquiry(analysis)), exitCode, sourceConfigBytesUnchanged: (await readFile(path.join(portable, "inquiry.json"))).equals(input), authoredConsume: true }
  }, evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await (process.argv[2] === "develop" ? developAuthor(process.argv[3]!, process.argv[4], process.argv[5]) : process.argv[2] === "consume" ? consumeAuthor(process.argv[3]!, process.argv[4], process.argv[5]) : Promise.reject(new Error("Use develop|consume <registered-author-id> [repair-id original/attempt-n]")))))
