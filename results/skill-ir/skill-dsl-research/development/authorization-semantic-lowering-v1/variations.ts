import path from "node:path"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir, readdir, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { root, repo, assertNoUnknownTask } from "./study.ts"
import { developRows, mechanicalReview, retainLocalRun, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { loadInquiryInput, initializeLocalInquiry, editAuthorizationInquiry, compareLocalInquiry, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
type VariationRow = Row & { kind: "variation"; admission: string; blockedBy?: string | null; baseRow: string; change: "policy" | "premise"; route: "fresh" | "previous" }
type Manifest = { rows: Array<VariationRow | (Row & { studyArm?: string })>; tasks: Array<{ id: string; admission: string; inputFile: string; inputSha256: string }>; variationIntents: Array<{ task: string; policy: unknown; premise: string }>; testedModel: string; cachePath: string; budgets: Record<string, number> }
const json = async (file: string) => JSON.parse(await readFile(file, "utf8")), sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
export function selectVariationRow(manifest: Manifest, id: string): VariationRow {
  const matches = manifest.rows.filter(r => r.id === id && r.kind === "variation")
  if (matches.length !== 1) throw new Error("A single registered variation position is required")
  const row = matches[0] as VariationRow, task = manifest.tasks.find(t => t.id === row.task), base = manifest.rows.find(r => r.id === row.baseRow)
  if (task?.admission !== "eligible" || row.blockedBy || row.admission !== "depends-on-checked-bounded-base") throw new Error("Logical task sealed or dependent admission unavailable")
  if (!base || base.task !== row.task || base.kind !== "quality" || base.method !== "D1" || base.strategy !== "semantic-flow-v1" || row.method !== "D1" || row.strategy !== base.strategy || !["policy", "premise"].includes(row.change) || !["fresh", "previous"].includes(row.route)) throw new Error("Registered semantic base/change/route mismatch")
  return row
}
export async function latestCheckedBase(baseRow: string) {
  const directory = path.join(root, "runs", baseRow), attempts = (await readdir(directory).catch(() => [])).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)))
  for (const attempt of attempts) {
    const file = path.join(directory, attempt, "report.json"), bytes = await readFile(file), retained = JSON.parse(bytes.toString("utf8"))
    if (hasUnknownAuthorizationCompletion(retained.report)) throw new Error("Unknown base completion cannot be bypassed")
    if (retained.report.status === "completed" && retained.report.validation?.valid === true) return { file, reportSha256: sha(bytes), ...retained }
  }
  return undefined
}
async function prepare(manifest: Manifest, row: VariationRow) {
  const task = manifest.tasks.find(t => t.id === row.task)!, originalFile = path.resolve(root, task.inputFile), original = await readFile(originalFile)
  if (sha(original) !== task.inputSha256) throw new Error("Registered original input bytes changed")
  const directory = path.join(root, "prepared", row.task, row.change), inputFile = path.join(directory, "input.json"), lockFile = path.join(directory, "identity.json")
  let lock = await json(lockFile).catch(error => { if (error.code !== "ENOENT") throw error })
  if (!lock) {
    const base = await latestCheckedBase(row.baseRow)
    if (!base) return { status: "blocked-dependent-base", reason: "No current AS completed/valid base; no historical package or manual graph admitted", providerCalls: 0 }
    if (base.report.model !== manifest.testedModel || base.report.method !== row.method || base.report.strategy !== row.strategy) throw new Error("Actual base model/method/strategy mismatch")
    const loaded = await loadInquiryInput(originalFile), intent = manifest.variationIntents.find(i => i.task === row.task)
    if (!intent) throw new Error("Unregistered variation intent")
    await mkdir(directory, { recursive: true })
    const baseInput = path.join(directory, "base-input.json")
    await initializeLocalInquiry(base.report.sessionPath, baseInput, loaded.context.sourceRoot)
    const value = (await loadInquiryInput(baseInput)).value
    if (!value.inquiry) throw new Error("Actual base has no complete declaration")
    const operations = row.change === "policy" ? [{ kind: "policy", policy: intent.policy }] : value.inquiry.questions.map(q => ({ kind: "premises", questionId: q.id, premises: [...q.premises, { text: intent.premise, origin: "user" }] }))
    const patch = { schemaVersion: "authorization-inquiry-edit/v1", reason: `Registered ${row.change} variation`, operations }
    await save(path.join(directory, "edit.json"), patch)
    await save(inputFile, editAuthorizationInquiry(value, patch))
    lock = { baseRow: row.baseRow, baseReport: path.relative(root, base.file).split(path.sep).join("/"), baseReportSha256: base.reportSha256, previous: base.report.sessionPath, originalInputSha256: task.inputSha256, changedInputSha256: sha(await readFile(inputFile)), strategy: row.strategy, change: row.change }
    await save(lockFile, lock)
  }
  if (lock.baseRow !== row.baseRow || lock.originalInputSha256 !== task.inputSha256 || lock.change !== row.change || lock.strategy !== row.strategy || sha(await readFile(inputFile)) !== lock.changedInputSha256 || sha(await readFile(path.join(root, lock.baseReport))) !== lock.baseReportSha256) throw new Error("Paired input/base identity changed")
  const comparison = await compareLocalInquiry(inputFile, lock.previous, "semantic-flow-v1")
  if (!("reuseEligibility" in comparison) || comparison.reuseEligibility.status !== "reusable" || !(row.change === "policy" ? comparison.policyOnly : comparison.premiseOnly)) return { status: "blocked-dependent-base", reason: "Public current source/graph reuse checks reject this base", comparison, providerCalls: 0 }
  return { status: "eligible", inputFile, lock, comparison }
}
export async function developVariation(id: string, repairId?: string, repairOf?: string) {
  const manifest: Manifest = await json(path.join(root, "manifest.json")), row = selectVariationRow(manifest, id)
  await assertNoUnknownTask(root, row.task)
  const prepared = await prepare(manifest, row)
  if (prepared.status !== "eligible") { const record = { id, recordedAt: new Date().toISOString(), ...prepared }; await appendFile(path.join(root, "admissions.jsonl"), JSON.stringify(record) + "\n"); return record }
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [{ ...row, components: ["wire", "source", "checker", "delivery", "worklist"] }], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf,
    execute: async (_row, output) => {
      await save(path.join(output, "variation-identity.json"), { ...prepared.lock, route: row.route, inputFile: prepared.inputFile, comparison: prepared.comparison, priorAnswersModelVisible: false })
      return retainLocalRun(await executeLocalInquiryRun({ inputFile: prepared.inputFile!, outDir: output, model: manifest.testedModel, method: "D1", strategy: "semantic-flow-v1", ...(row.route === "previous" ? { previous: prepared.lock!.previous } : {}), execution: manifest.budgets }))
    }, evaluate: async (_row, report) => mechanicalReview(report) })
}
if (import.meta.main) console.log(JSON.stringify(await developVariation(process.argv[2]!, process.argv[3], process.argv[4])))
