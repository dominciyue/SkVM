import path from "node:path"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { developRows, mechanicalReview, retainLocalRun, replay as replayRetained, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
export interface ASRow extends Row { studyArm: string; inputFile: string; admission: string; blockedBy?: string | null }
interface Manifest { testedModel: string; cachePath: string; budgets: Record<string, number>; rows: ASRow[]; tasks: Array<{ id: string; admission: string; inputSha256: string }>; arms: Array<{ studyArm: string; method: string; strategy: string }> }
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export function selectQualityRow(manifest: Manifest, id: string): ASRow {
  const matches = manifest.rows.filter(row => row.id === id)
  if (matches.length !== 1 || matches[0]!.kind !== "quality") throw new Error("A single registered quality position is required")
  const row = matches[0]!, task = manifest.tasks.find(t => t.id === row.task), arm = manifest.arms.find(a => a.studyArm === row.studyArm)
  if (!task || row.admission !== "eligible" || task.admission !== "eligible") throw new Error(`Logical task sealed: ${row.task}; keep the original denominator`)
  if (!arm || arm.method !== row.method || arm.strategy !== row.strategy) throw new Error("Study arm/runtime core mismatch")
  return row
}
/** AS seals apply across arms and entrypoints, not just a single renamed claim. */
export async function assertNoUnknownTask(base: string, task: string) {
  for (const id of await readdir(path.join(base, "runs")).catch(() => [])) for (const attempt of (await readdir(path.join(base, "runs", id))).filter(a => /^attempt-\d+$/.test(a))) {
    const directory = path.join(base, "runs", id, attempt), claim = await json(path.join(directory, "claim.json"))
    if (claim.row?.task !== task) continue
    const retained = await json(path.join(directory, "report.json")).catch(() => undefined)
    if (!retained || hasUnknownAuthorizationCompletion(retained.report)) throw new Error(`Logical task sealed by unknown completion: ${id}/${attempt}`)
  }
}
export async function develop(id: string, repairId?: string, repairOf?: string) {
  const manifest: Manifest = await json(path.join(root, "manifest.json")), row = selectQualityRow(manifest, id)
  await assertNoUnknownTask(root, row.task)
  const inputFile = path.resolve(root, row.inputFile), bytes = await readFile(inputFile)
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.tasks.find(t => t.id === row.task)!.inputSha256) throw new Error("Registered original input bytes changed")
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [row], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf,
    execute: async (registered, outDir) => retainLocalRun(await executeLocalInquiryRun({ inputFile, outDir, model: manifest.testedModel, method: registered.method, strategy: registered.strategy as "legacy" | "semantic-flow-v1", execution: manifest.budgets })),
    evaluate: async (_row, report) => mechanicalReview(report) })
}
export async function replay() {
  const manifest: Manifest = await json(path.join(root, "manifest.json")), retained = await replayRetained(root)
  return { schemaVersion: "authorization-as-replay/v1", denominator: manifest.rows.length, rows: manifest.rows.map(row => ({ id: row.id, admission: row.admission, ...(retained.rows.find(r => r.id === row.id) ?? { firstAttempt: null, repairAttempts: [], knownProviderCalls: 0 }) })), providerCallsDuringReplay: 0, targetExecutions: 0 }
}
if (import.meta.main) {
  const action = process.argv[2]
  if (action === "develop") console.log(JSON.stringify(await develop(process.argv[3]!, process.argv[4], process.argv[5])))
  else if (action === "replay") console.log(JSON.stringify(await replay()))
  else throw new Error("Use develop <registered-quality-position> [repair-id original/attempt-n] | replay")
}
