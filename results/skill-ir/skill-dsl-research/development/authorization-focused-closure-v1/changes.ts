import path from "node:path"
import { readFile, writeFile, mkdir, readdir, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { root, repo, sha } from "./prepare.ts"
import { json, loadRegisteredInput, registeredInputIdentity } from "./study.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"
import { removeOneScopedClause, assertOneSourceEdit } from "../authorization-semantic-lowering-v1/source-changes.ts"
import { developRows, retainLocalRun, mechanicalReview } from "../authorization-guided-runtime-v1/study.ts"
import { loadInquiryInput, initializeLocalInquiry, editAuthorizationInquiry, compareLocalInquiry, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectChangeRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: any) => r.id === id && ["variation", "source-change"].includes(r.kind))
  if (matches.length !== 1) throw new Error("A single registered change position is required")
  const row = matches[0], task = manifest.tasks.find((t: any) => t.id === row.task), base = manifest.rows.find((r: any) => r.id === row.baseRow)
  if (task?.admission !== "eligible" || !base || base.task !== row.task || !["debug", "quality"].includes(base.kind) || base.method !== "D1" || base.strategy !== "focused-closure-v1" || row.method !== base.method || row.strategy !== base.strategy) throw new Error("Registered current task/base/strategy mismatch")
  if (row.kind === "variation" ? !["policy", "premise"].includes(row.change) || !["fresh", "previous"].includes(row.route) : row.task !== "paperless-share-create" || !row.sourceIntent) throw new Error("Unregistered change intent")
  return row
}
export function qualifiesOriginalBase(base: any, retained: any, reportSha256: string, review: any, model: string) {
  const r = retained.report, checks = r?.validation?.questionChecks
  return review?.row === base.id && review.reportSha256 === reportSha256 && review.grade === "full" && review.originalTaskSufficient === true && r?.status === "completed" && r.completionUnknown !== true && r.validation?.valid === true && Array.isArray(checks) && checks.length > 0 && checks.every((q: any) => q.evidenceCoverage === "bounded") && r.model === model && r.method === base.method && r.strategy === base.strategy && !hasUnknownAuthorizationCompletion(r)
}
async function baseAttempts(manifest: any, row: any, qualified: boolean) {
  const directory = path.join(root, "runs", row.baseRow), names = (await readdir(directory).catch(() => [])).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(b.slice(8)) - Number(a.slice(8))), reviews: any[] = []
  if (qualified) for (const name of await readdir(path.join(root, "evaluations"))) if (name.endsWith(".json")) reviews.push(...(await json(path.join(root, "evaluations", name))).rows ?? [])
  const base = manifest.rows.find((r: any) => r.id === row.baseRow)
  for (const name of names) {
    const file = path.join(directory, name, "report.json"), bytes = await readFile(file), retained = JSON.parse(bytes.toString("utf8")), reportSha256 = sha(bytes)
    if (retained.report.completionUnknown === true || hasUnknownAuthorizationCompletion(retained.report)) throw new Error("Unknown original completion cannot be bypassed")
    if (retained.report.model !== manifest.testedModel || retained.report.method !== row.method || retained.report.strategy !== row.strategy || !retained.report.final) continue
    const review = reviews.find(r => qualifiesOriginalBase(base, retained, reportSha256, r, manifest.testedModel))
    if (!qualified || review) return { file, reportSha256, report: retained.report, review }
  }
}
async function prepareVariation(manifest: any, row: any, task: any) {
  const originalFile = await loadRegisteredInput(manifest, task), loaded = await loadInquiryInput(originalFile), directory = path.join(root, "prepared", row.task, row.change), inputFile = path.join(directory, "input.json"), lockFile = path.join(directory, "identity.json")
  let lock = await json(lockFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (!lock) {
    const base = await baseAttempts(manifest, row, true), intent = manifest.variationIntents.find((i: any) => i.task === row.task)
    if (!intent) throw new Error("No registered policy/premise intent")
    await mkdir(directory, { recursive: true })
    let value = loaded.value
    if (base) { const baseInput = path.join(directory, "base-input.json"); await initializeLocalInquiry(base.report.sessionPath, baseInput, loaded.context.sourceRoot); value = (await loadInquiryInput(baseInput)).value }
    let changed: unknown
    if (value.inquiry) { const operations = row.change === "policy" ? [{ kind: "policy", policy: intent.policy }] : value.inquiry.questions.map(q => ({ kind: "premises", questionId: q.id, premises: [...q.premises, { text: intent.premise, origin: "user" }] })); const edit = { schemaVersion: "authorization-inquiry-edit/v1", reason: `Registered current ${row.change} variation`, operations }; await save(path.join(directory, "edit.json"), edit); changed = editAuthorizationInquiry(value, edit) }
    else changed = { ...value, sourceRoot: path.relative(directory, loaded.context.sourceRoot).split(path.sep).join("/"), ...(row.change === "policy" ? { policy: intent.policy } : { brief: `${value.brief}\nCurrent independent user premise: ${intent.premise}` }) }
    await save(inputFile, changed)
    lock = { baseRow: row.baseRow, baseReport: base ? path.relative(root, base.file).split(path.sep).join("/") : null, baseReportSha256: base?.reportSha256 ?? null, sourceReview: base?.review ?? null, previous: base?.report.sessionPath ?? null, originalInputSha256: task.inputSha256, sourceInput: registeredInputIdentity(manifest, task), changedInputSha256: sha(await readFile(inputFile)), strategy: row.strategy, change: row.change, qualifiedOriginalBase: !!base, freshDiagnosticWithoutQualifiedBase: !base }
    await save(lockFile, lock)
  }
  if (lock.baseRow !== row.baseRow || lock.originalInputSha256 !== task.inputSha256 || lock.change !== row.change || lock.strategy !== row.strategy || !isDeepStrictEqual(lock.sourceInput, registeredInputIdentity(manifest, task)) || sha(await readFile(inputFile)) !== lock.changedInputSha256) throw new Error("Paired current input identity changed")
  if (lock.baseReport && sha(await readFile(path.join(root, lock.baseReport))) !== lock.baseReportSha256) throw new Error("Original base report bytes changed")
  const comparison = lock.previous ? await compareLocalInquiry(inputFile, lock.previous, "focused-closure-v1") : null
  if (row.route === "previous" && (!lock.qualifiedOriginalBase || !comparison || !("reuseEligibility" in comparison) || comparison.reuseEligibility.status !== "reusable" || !(row.change === "policy" ? comparison.policyOnly : comparison.premiseOnly))) return { status: "blocked-dependent-base", reason: "No exact source-reviewed full current base and public bounded reuse eligibility; fresh change remains independently runnable", providerCalls: 0, lock, comparison }
  return { status: "eligible", inputFile, lock, comparison }
}
async function prepareSource(manifest: any, row: any, task: any) {
  const originalFile = await loadRegisteredInput(manifest, task), original = await loadInquiryInput(originalFile), directory = path.join(root, "prepared", row.task, "source"), inputFile = path.join(directory, "input.json"), lockFile = path.join(directory, "identity.json")
  let lock = await json(lockFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (!lock) {
    await mkdir(directory, { recursive: true })
    const source = path.resolve(repo, "../project-maintenance/runs/authorization-focused-closure-v1/source-change-copy", row.task), originalIndex = await copySourceSnapshot(original.context, source), base = await baseAttempts(manifest, row, false)
    if (base) await initializeLocalInquiry(base.report.sessionPath, inputFile, source)
    else await save(inputFile, { ...original.value, sourceRoot: path.relative(directory, source).split(path.sep).join("/") })
    const file = path.join(source, "src/documents/serialisers.py"), before = await readFile(file, "utf8"), eol = before.includes("\r\n") ? "\r\n" : "\n", clause = ['            and has_perms_owner_aware(', '                self.user,', '                "view_document",', '                document,', '            )', ''].join(eol), after = removeOneScopedClause(before, "ShareLinkSerializer", clause)
    await writeFile(file, after, "utf8")
    lock = { baseRow: row.baseRow, baseReport: base ? path.relative(root, base.file).split(path.sep).join("/") : null, baseReportSha256: base?.reportSha256 ?? null, previous: base?.report.sessionPath ?? null, originalInputSha256: task.inputSha256, sourceInput: registeredInputIdentity(manifest, task), inputSha256: sha(await readFile(inputFile)), source, originalIndex, edit: { path: "src/documents/serialisers.py", sourceIntent: row.sourceIntent, removedClause: clause, beforeSha256: sha(before), afterSha256: sha(after), afterBytes: Buffer.byteLength(after), sourceRefPreservedForByteInvalidation: true, otherControlsPreserved: true } }
    await save(lockFile, lock)
  }
  const changed = await loadInquiryInput(inputFile), oldTools = await createInquiryTools(original.context), newTools = await createInquiryTools(changed.context)
  if (lock.baseRow !== row.baseRow || lock.originalInputSha256 !== task.inputSha256 || !isDeepStrictEqual(lock.sourceInput, registeredInputIdentity(manifest, task)) || lock.edit.sourceIntent !== row.sourceIntent || sha(await readFile(inputFile)) !== lock.inputSha256 || changed.context.sourceRoot !== lock.source || !isDeepStrictEqual(lock.originalIndex, oldTools.files) || newTools.scopeGaps.length || oldTools.scopeGaps.length) throw new Error("Current source-copy identity changed")
  const before = await readFile(path.join(original.context.sourceRoot, lock.edit.path), "utf8"), after = removeOneScopedClause(before, "ShareLinkSerializer", lock.edit.removedClause)
  if (sha(before) !== lock.edit.beforeSha256 || sha(after) !== lock.edit.afterSha256) throw new Error("Registered exact source clause changed")
  assertOneSourceEdit(oldTools.files, newTools.files, lock.edit)
  let invalidation: unknown = { status: "no-known-original-material", providerCalls: 0 }
  if (lock.previous) {
    if (sha(await readFile(path.join(root, lock.baseReport))) !== lock.baseReportSha256) throw new Error("Original source report changed")
    const comparison = await compareLocalInquiry(inputFile, lock.previous, "focused-closure-v1")
    let constructed = 0
    const rejected = await executeLocalInquiryRun({ inputFile, outDir: path.join(directory, "invalidated-previous"), previous: lock.previous, model: manifest.testedModel, method: "D1", strategy: "focused-closure-v1", providerFactory: () => { constructed++; throw new Error("Changed source must invalidate before provider construction") } })
    if (!("sourceChanged" in comparison) || !comparison.sourceChanged || constructed !== 0 || rejected.status !== "needs-fresh-analysis" || !("providerCalls" in rejected) || rejected.providerCalls !== 0) throw new Error("Actual source change was not invalidated before provider")
    invalidation = { comparison, rejected, providerConstructions: constructed, previousSourceQualityClaim: false }
  }
  const proofFile = path.join(directory, "invalidation.json"), proof = { identitySha256: sha(await readFile(lockFile)), invalidation }, prior = await json(proofFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (prior && !isDeepStrictEqual(prior, proof)) throw new Error("Retained source invalidation proof changed")
  if (!prior) await save(proofFile, proof)
  return { status: "eligible", inputFile, lock, comparison: invalidation }
}
export async function developChange(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), row = selectChangeRow(manifest, id), task = manifest.tasks.find((t: any) => t.id === row.task)
  await assertNoUnknownTask(root, row.task)
  const prepared = row.kind === "variation" ? await prepareVariation(manifest, row, task) : await prepareSource(manifest, row, task)
  if (prepared.status !== "eligible") { const record = { id, recordedAt: new Date().toISOString(), ...prepared }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [{ ...row, components: ["wire", "source", "checker", "delivery", "worklist"] }], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf,
    execute: async (_row, output) => { await save(path.join(output, "change-identity.json"), { ...prepared.lock, route: row.route ?? "fresh", inputFile: prepared.inputFile, comparison: prepared.comparison, priorAnswersModelVisible: false, targetExecutions: 0 }); return retainLocalRun(await executeLocalInquiryRun({ inputFile: prepared.inputFile!, outDir: output, model: manifest.testedModel, method: "D1", strategy: "focused-closure-v1", ...(row.route === "previous" ? { previous: prepared.lock.previous } : {}), execution: manifest.budgets })) },
    evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await developChange(process.argv[2]!, process.argv[3], process.argv[4])))
