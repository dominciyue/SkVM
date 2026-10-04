import path from "node:path"
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { root, repo, assertNoUnknownTask } from "./study.ts"
import { latestCheckedBase } from "./variations.ts"
import { copySourceSnapshot } from "./source-snapshot.ts"
import { developRows, retainLocalRun, mechanicalReview } from "../authorization-guided-runtime-v1/study.ts"
import { loadInquiryInput, initializeLocalInquiry, compareLocalInquiry, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
const json = async (file: string) => JSON.parse(await readFile(file, "utf8")), sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex"), save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectSourceChangeRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: any) => r.id === id && r.kind === "source-change")
  if (matches.length !== 1) throw new Error("A single registered source-change position is required")
  const row = matches[0], task = manifest.tasks.find((t: any) => t.id === row.task), base = manifest.rows.find((r: any) => r.id === row.baseRow)
  if (task?.admission !== "eligible" || row.blockedBy || row.admission !== "depends-on-checked-bounded-base") throw new Error("Logical task sealed or dependent admission unavailable")
  if (!base || base.task !== row.task || base.kind !== "quality" || base.method !== "D1" || base.strategy !== "semantic-flow-v1" || row.method !== "D1" || row.strategy !== base.strategy || !row.sourceIntent) throw new Error("Registered source/base intent mismatch")
  return row
}
export function removeOneScopedClause(text: string, symbol: string, clause: string) {
  const starts = [...text.matchAll(/^class ([A-Za-z_][A-Za-z_0-9]*).*:\r?$/gm)], matches = starts.filter(m => m[1] === symbol)
  if (matches.length !== 1) throw new Error("Source edit needs a unique registered class")
  const start = matches[0]!.index!, end = starts.find(m => m.index! > start)?.index ?? text.length, body = text.slice(start, end)
  if (body.split(clause).length !== 2) throw new Error("Source edit needs a unique original clause")
  return text.slice(0, start) + body.replace(clause, "") + text.slice(end)
}
export function assertOneSourceEdit(original: any[], current: any[], edit: any) {
  const selected = original.filter(file => file.path === edit.path)
  const expected = original.map(file => file.path === edit.path ? { ...file, sha256: edit.afterSha256, bytes: edit.afterBytes } : file)
  if (selected.length !== 1 || selected[0].sha256 !== edit.beforeSha256 || edit.beforeSha256 === edit.afterSha256 || !isDeepStrictEqual(current, expected)) throw new Error("Current source differs from the one registered byte edit")
}
export async function developSourceChange(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), row = selectSourceChangeRow(manifest, id)
  await assertNoUnknownTask(root, row.task)
  const base = await latestCheckedBase(row.baseRow)
  if (!base) { const record = { id, status: "blocked-dependent-base", providerCalls: 0, reason: "No actual AS completed/valid same-task semantic base for source invalidation" }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  if (row.task !== "paperless-share-create" || base.report.model !== manifest.testedModel || base.report.method !== "D1" || base.report.strategy !== row.strategy) throw new Error("Only the registered eligible source intent and exact base are admitted")
  const task = manifest.tasks.find((t: any) => t.id === row.task), originalFile = path.resolve(root, task.inputFile)
  if (sha(await readFile(originalFile)) !== task.inputSha256) throw new Error("Registered original task bytes changed")
  const prepared = path.join(root, "prepared", row.task, "source"), inputFile = path.join(prepared, "input.json"), lockFile = path.join(prepared, "identity.json")
  let lock = await json(lockFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (!lock) {
    const loaded = await loadInquiryInput(originalFile), source = path.resolve(repo, "../project-maintenance/runs/authorization-semantic-lowering-v1", id, "source")
    await mkdir(prepared, { recursive: true }); const originalIndex = await copySourceSnapshot(loaded.context, source)
    await initializeLocalInquiry(base.report.sessionPath, inputFile, source)
    const file = path.join(source, "src/documents/serialisers.py"), before = await readFile(file, "utf8"), eol = before.includes("\r\n") ? "\r\n" : "\n", clause = ['            and has_perms_owner_aware(', '                self.user,', '                "view_document",', '                document,', '            )', ''].join(eol), after = removeOneScopedClause(before, "ShareLinkSerializer", clause)
    await writeFile(file, after, "utf8")
    lock = { baseRow: row.baseRow, baseReport: path.relative(root, base.file).split(path.sep).join("/"), baseReportSha256: base.reportSha256, previous: base.report.sessionPath, model: base.report.model, method: base.report.method, strategy: base.report.strategy, originalInputSha256: task.inputSha256, inputSha256: sha(await readFile(inputFile)), source, originalIndex, edit: { path: "src/documents/serialisers.py", sourceIntent: row.sourceIntent, removedClause: clause, beforeSha256: sha(before), afterSha256: sha(after), afterBytes: Buffer.byteLength(after), endpointGlobalAndSerializerGlobalChecksPreserved: true, sourceRefPreservedForByteInvalidation: true } }
    await save(lockFile, lock)
  }
  const loadedOriginal = await loadInquiryInput(originalFile), loadedChanged = await loadInquiryInput(inputFile), originalTools = await createInquiryTools(loadedOriginal.context), changedTools = await createInquiryTools(loadedChanged.context)
  if (lock.baseRow !== row.baseRow || lock.baseReport !== path.relative(root, base.file).split(path.sep).join("/") || lock.baseReportSha256 !== base.reportSha256 || lock.previous !== base.report.sessionPath || lock.model !== manifest.testedModel || lock.method !== row.method || lock.strategy !== row.strategy || lock.edit.path !== "src/documents/serialisers.py" || lock.edit.sourceIntent !== row.sourceIntent || lock.originalInputSha256 !== task.inputSha256 || sha(await readFile(inputFile)) !== lock.inputSha256 || sha(await readFile(path.join(root, lock.baseReport))) !== lock.baseReportSha256 || loadedChanged.context.sourceRoot !== lock.source || !isDeepStrictEqual(lock.originalIndex, originalTools.files) || changedTools.scopeGaps.length || originalTools.scopeGaps.length) throw new Error("Source-change identity changed")
  const before = await readFile(path.join(loadedOriginal.context.sourceRoot, lock.edit.path), "utf8"), expected = removeOneScopedClause(before, "ShareLinkSerializer", lock.edit.removedClause)
  if (sha(before) !== lock.edit.beforeSha256 || sha(expected) !== lock.edit.afterSha256 || Buffer.byteLength(expected) !== lock.edit.afterBytes) throw new Error("Registered source edit changed")
  assertOneSourceEdit(originalTools.files, changedTools.files, lock.edit)
  const comparison = await compareLocalInquiry(inputFile, lock.previous, "semantic-flow-v1")
  let constructed = 0
  const invalidation = await executeLocalInquiryRun({ inputFile, outDir: path.join(prepared, "invalidated-previous"), previous: lock.previous, model: manifest.testedModel, method: "D1", strategy: "semantic-flow-v1", providerFactory: () => { constructed++; throw new Error("Source invalidation must occur before provider construction") } })
  if (constructed !== 0 || invalidation.status !== "needs-fresh-analysis" || !("providerCalls" in invalidation) || invalidation.providerCalls !== 0) throw new Error("Changed source previous was not rejected before provider")
  const invalidationFile = path.join(prepared, "invalidation.json")
  const proof = { identitySha256: sha(await readFile(lockFile)), comparison, invalidation, providerConstructions: constructed }, existing = await json(invalidationFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (existing && !isDeepStrictEqual(existing, proof)) throw new Error("Source invalidation proof changed")
  if (!existing) await save(invalidationFile, proof)
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [{ ...row, components: ["wire", "source", "checker", "delivery", "worklist"] }], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf, execute: async (_row, output) => {
    await save(path.join(output, "source-change-identity.json"), { ...lock, invalidationArtifact: path.relative(root, invalidationFile).split(path.sep).join("/"), priorAnswersModelVisible: false, targetExecutions: 0 })
    return retainLocalRun(await executeLocalInquiryRun({ inputFile, outDir: output, model: manifest.testedModel, method: "D1", strategy: "semantic-flow-v1", execution: manifest.budgets }))
  }, evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await developSourceChange(process.argv[2]!, process.argv[3], process.argv[4])))
