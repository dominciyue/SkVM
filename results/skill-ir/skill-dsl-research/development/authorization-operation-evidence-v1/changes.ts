import path from "node:path"
import { readFile, writeFile, mkdir, readdir, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { root, repo, at, json, save, sha, modelInputPath, check, type Position } from "./study.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"
import { removeOneScopedClause, assertOneSourceEdit } from "../authorization-semantic-lowering-v1/source-changes.ts"
import { developRows, retainLocalRun, mechanicalReview, replay as retainedReplay } from "../authorization-guided-runtime-v1/study.ts"
import { loadInquiryInput, initializeLocalInquiry, editAuthorizationInquiry, compareLocalInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

export function selectChangeRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: Position) => r.id === id && r.kind === "variation")
  if (matches.length !== 1) throw new Error("Use one registered AU paired change")
  const position: Position = matches[0], input = manifest.inputs.find((i: any) => i.id === position.task)
  if (position.task !== "paperless-share-create" || !["policy", "premise", "source"].includes(position.change!) || !["fresh", "materials-previous"].includes(position.route!) || manifest.inheritedSeals.sealedTasks.includes(position.task) || !input?.sha256) throw new Error("Registered current task/change/source identity mismatch")
  modelInputPath(input.file)
  return { row: { ...position, method: "D1" as const, strategy: "operation-evidence-v1", components: ["wire", "source", "checker", "delivery", "worklist"] }, input }
}
export function changedDeclaration(value: any, change: string, intent: any, relativeRoot: string) {
  const rebased = { ...value, sourceRoot: relativeRoot }
  if (!value.inquiry) throw new Error("Paired changes require the retained model-authored complete declaration")
  if (change === "source") return rebased
  const operations = change === "policy" ? [{ kind: "policy", policy: intent.policy }] : change === "premise" ? value.inquiry.questions.map((q: any) => ({ kind: "premises", questionId: q.id, premises: [...q.premises, { text: intent.premise, origin: "user" }] })) : undefined
  if (!operations) throw new Error("Unregistered public change")
  return editAuthorizationInquiry(rebased, { schemaVersion: "authorization-inquiry-edit/v1", reason: `Registered current ${change} change`, operations })
}
export function materialBaseEligible(report: any, model: string) {
  return ["completed", "completed-with-diagnostics", "budget-exhausted", "transport-failed"].includes(report?.status) && report.completionUnknown !== true && !hasUnknownAuthorizationCompletion(report) && report.sourceVerification?.valid === true && report.model === model && report.method === "D1" && report.strategy === "operation-evidence-v1" && typeof report.sessionPath === "string" && !!report.domain?.operationFacts && report.domain?.semantic?.units?.length > 0
}
export function variationExecution(row: { route?: string }, lock: any, comparison: any) {
  if (row.route === "fresh") return { eligible: true as const }
  if (lock.previous && comparison?.reuseEligibility?.status === "reusable" && comparison.reuseEligibility.info?.reuseLevel === "materials" && comparison.reuseEligibility.info.answerReused === false) return { eligible: true as const, previous: lock.previous }
  return { eligible: false as const, providerCalls: 0, reason: "Current per-material reuse plan refuses original materials; preserve the paired fresh position and do not automatically resend" }
}
async function materialBase(manifest: any) {
  const id = "debug-paperless-share-create", directory = path.join(root, "runs", id), attempts = (await readdir(directory).catch(() => [])).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)))
  for (const attempt of attempts) {
    const file = path.join(directory, attempt, "report.json"), raw = await readFile(file), retained = JSON.parse(raw.toString("utf8"))
    if (hasUnknownAuthorizationCompletion(retained.report)) throw new Error("Unknown original completion is sealed")
    if (retained.identity?.row?.id !== id || retained.identity.row.task !== "paperless-share-create" || !materialBaseEligible(retained.report, manifest.testedModel)) continue
    const report = await inspectLocalInquiry(retained.report.sessionPath)
    if (!materialBaseEligible(report, manifest.testedModel)) continue
    const evaluation = await json(path.join(root, "evaluations", `${id}-${attempt}.json`)).catch(() => undefined)
    return { file, report, reportSha256: sha(raw), sourceQuality: evaluation?.sha256 === sha(raw) && evaluation.grade === "full" && evaluation.originalTaskSufficient === true ? "source-reviewed-full" : "partial-materials-only" }
  }
}
async function registerChanges(manifest: any) {
  const historical = await json(path.join(at, "manifest.json")), intent = historical.variationIntents.find((i: any) => i.task === "paperless-share-create"), sourceIntent = "remove-exact-document-owner-aware-clause-v1"
  if (!intent?.policy || !intent.premise) throw new Error("Frozen independent public change intent is missing")
  const value = { schemaVersion: "authorization-au-change-registration/v1", manifestSha256: sha(await readFile(path.join(root, "manifest.json"))), inheritedManifestSha256: sha(await readFile(path.join(at, "manifest.json"))), intent, sourceIntent, pairedInputsIdentical: true, oldAnswersImported: false, partialMaterialsDoNotEstablishTaskCompletion: true, humanMinutes: null }, file = path.join(root, "change-registration.json")
  if (await Bun.file(file).exists()) { if (!isDeepStrictEqual(await json(file), value)) throw new Error("Registered public change intent changed") } else await save(file, value)
  return value
}
async function prepareChange(manifest: any, row: Position, input: any) {
  const registration = await registerChanges(manifest), originalFile = modelInputPath(input.file), original = await loadInquiryInput(originalFile), directory = path.join(root, "prepared", row.task, row.change!), inputFile = path.join(directory, "input.json"), lockFile = path.join(directory, "identity.json")
  if (sha(await readFile(originalFile)) !== input.sha256) throw new Error("Registered original input changed")
  let lock = await json(lockFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (!lock) {
    const base = await materialBase(manifest)
    if (!base) return { status: "blocked-dependent-base" as const, providerCalls: 0, reason: "No known current source-verified model-authored operation material base; both paired positions remain unexecuted" }
    await mkdir(directory, { recursive: true })
    const source = row.change === "source" ? path.resolve(repo, "../project-maintenance/runs/authorization-operation-evidence-v1/source-change-copy", row.task) : original.context.sourceRoot
    const originalIndex = row.change === "source" ? await copySourceSnapshot(original.context, source) : (await createInquiryTools(original.context)).files
    const baseInput = path.join(directory, "base-input.json"); await initializeLocalInquiry(base.report.sessionPath, baseInput, source)
    const value = (await loadInquiryInput(baseInput)).value, changed = changedDeclaration(value, row.change!, registration.intent, path.relative(directory, source).split(path.sep).join("/"))
    await save(inputFile, changed)
    let edit: any = null
    if (row.change === "source") {
      const file = path.join(source, "src/documents/serialisers.py"), before = await readFile(file, "utf8"), eol = before.includes("\r\n") ? "\r\n" : "\n", clause = ['            and has_perms_owner_aware(', '                self.user,', '                "view_document",', '                document,', '            )', ''].join(eol), after = removeOneScopedClause(before, "ShareLinkSerializer", clause)
      await writeFile(file, after, "utf8")
      edit = { path: "src/documents/serialisers.py", sourceIntent: registration.sourceIntent, removedClause: clause, beforeSha256: sha(before), afterSha256: sha(after), afterBytes: Buffer.byteLength(after), otherControlsPreserved: true, originalSourceUnmodified: true }
    }
    lock = { baseRow: "debug-paperless-share-create", baseReport: path.relative(root, base.file).split(path.sep).join("/"), baseReportSha256: base.reportSha256, previous: base.report.sessionPath, baseSourceQuality: base.sourceQuality, model: manifest.testedModel, method: "D1", strategy: row.arm === "D-O" ? "operation-evidence-v1" : null, sourceInput: input, originalInputSha256: input.sha256, inputSha256: sha(await readFile(inputFile)), change: row.change, registrationSha256: sha(await readFile(path.join(root, "change-registration.json"))), source, originalIndex, edit, priorAnswersModelVisible: false, completeTaskReuseClaimed: false }
    await save(lockFile, lock)
  }
  const changed = await loadInquiryInput(inputFile), oldTools = await createInquiryTools(original.context), newTools = await createInquiryTools(changed.context)
  if (lock.change !== row.change || lock.model !== manifest.testedModel || lock.method !== "D1" || lock.strategy !== "operation-evidence-v1" || !isDeepStrictEqual(lock.sourceInput, input) || lock.originalInputSha256 !== input.sha256 || sha(await readFile(inputFile)) !== lock.inputSha256 || sha(await readFile(path.join(root, lock.baseReport))) !== lock.baseReportSha256 || sha(await readFile(path.join(root, "change-registration.json"))) !== lock.registrationSha256 || changed.context.sourceRoot !== lock.source || !isDeepStrictEqual(oldTools.files, lock.originalIndex) || oldTools.scopeGaps.length || newTools.scopeGaps.length) throw new Error("Paired input/base/source identity changed")
  if (row.change === "source") {
    if (lock.edit.path !== "src/documents/serialisers.py" || lock.edit.sourceIntent !== registration.sourceIntent) throw new Error("Source intent changed")
    const before = await readFile(path.join(original.context.sourceRoot, lock.edit.path), "utf8"), after = removeOneScopedClause(before, "ShareLinkSerializer", lock.edit.removedClause)
    if (sha(before) !== lock.edit.beforeSha256 || sha(after) !== lock.edit.afterSha256 || Buffer.byteLength(after) !== lock.edit.afterBytes) throw new Error("Exact copied-source edit changed")
    assertOneSourceEdit(oldTools.files, newTools.files, lock.edit)
  } else if (!isDeepStrictEqual(oldTools.files, newTools.files)) throw new Error("Public policy/premise change altered source")
  const comparison = await compareLocalInquiry(inputFile, lock.previous, "operation-evidence-v1"), execution = variationExecution(row, lock, comparison)
  return { status: execution.eligible ? "eligible" as const : "blocked-dependent-base" as const, inputFile, lock, comparison, execution, providerCalls: 0 }
}
export async function developChange(id: string, repairId?: string, repairOf?: string) {
  await check()
  const manifest = await json(path.join(root, "manifest.json")), { row, input } = selectChangeRow(manifest, id)
  await assertNoUnknownTask(root, row.task)
  const status = await json(path.join(root, "status.json")); if (status.active?.length) throw new Error("An AU provider session is already active")
  const prepared = await prepareChange(manifest, row, input)
  if (prepared.status !== "eligible") { const record = { id, recordedAt: new Date().toISOString(), ...prepared }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage: "AU14", codeRevision: revision, active: [{ id, repairId: repairId ?? null, repairOf: repairOf ?? null }], nextAction: "Retain actual changed input, valid materials and invalidation reasons" }, null, 2) + "\n")
  const output = await developRows(root, [row], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf, execute: async (_row, output) => {
    await save(path.join(output, "change-identity.json"), { ...prepared.lock, route: row.route, inputFile: prepared.inputFile, comparison: prepared.comparison, priorAnswersModelVisible: false, targetExecutions: 0 })
    return retainLocalRun(await executeLocalInquiryRun({ inputFile: prepared.inputFile!, outDir: output, model: manifest.testedModel, method: "D1", strategy: "operation-evidence-v1", ...(prepared.execution!.eligible && "previous" in prepared.execution! ? { previous: prepared.execution!.previous } : {}), execution: manifest.budgets }))
  }, evaluate: async (_row, report) => mechanicalReview(report) })
  const retained = await retainedReplay(root)
  await writeFile(path.join(root, "status.json"), JSON.stringify({ ...status, stage: "AU14", codeRevision: revision, active: [], providerCalls: retained.rows.reduce((n, r) => n + r.knownProviderCalls, 0), lastKnownRequest: output.rows, nextAction: "Independent changed-source/policy/premise evaluation of actual pair; partial materials do not establish complete reuse", positions: status.positions.map((p: any) => ({ ...p, ...(output.rows.find((r: any) => r.id === p.id) ?? {}) })) }, null, 2) + "\n")
  return output
}
if (import.meta.main) console.log(JSON.stringify(await developChange(process.argv[2]!, process.argv[3], process.argv[4]), null, 2))
