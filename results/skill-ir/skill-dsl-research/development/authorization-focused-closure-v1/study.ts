import path from "node:path"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { root, repo, sha, tasks } from "./prepare.ts"
import { developRows, mechanicalReview, retainLocalRun, replay as retainedReplay, type Row } from "../authorization-guided-runtime-v1/study.ts"
import { assertNoUnknownTask } from "../authorization-semantic-lowering-v1/study.ts"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import type { InquiryStrategy } from "../../../../../src/task-dsl/authorization/control-slice.ts"
export const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export function selectRow(manifest: any, id: string) {
  const matches = manifest.rows.filter((r: any) => r.id === id && ["quality", "debug"].includes(r.kind))
  if (matches.length !== 1) throw new Error("Use one registered inquiry position")
  const row = matches[0], task = manifest.tasks.find((t: any) => t.id === row.task), arm = manifest.arms.find((a: any) => a.studyArm === row.studyArm)
  if (!tasks.includes(row.task) || task?.admission !== "eligible" || row.admission !== "eligible") throw new Error("Logical task is sealed or outside the AT allowlist")
  if (!arm || arm.method !== row.method || arm.strategy !== row.strategy || row.inputFile !== task.inputFile || !manifest.modelInputAllowlist.includes(row.inputFile)) throw new Error("Registered model-input/arm identity mismatch")
  return { row, task }
}
export async function loadRegisteredInput(manifest: any, task: any) {
  if (!tasks.includes(task.id) || task.admission !== "eligible" || !manifest.modelInputAllowlist.includes(task.inputFile)) throw new Error("Unregistered model input")
  const file = path.resolve(root, task.inputFile)
  if (sha(await readFile(file)) !== task.inputSha256) throw new Error("Registered input bytes changed")
  return file
}
export async function develop(id: string, repairId?: string, repairOf?: string) {
  const manifest = await json(path.join(root, "manifest.json")), { row, task } = selectRow(manifest, id), inputFile = await loadRegisteredInput(manifest, task)
  await assertNoUnknownTask(root, row.task)
  process.env.SKVM_CACHE = manifest.cachePath; process.env.SKVM_AUTO_PROBE = "0"
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  return developRows(root, [row as Row], { revision, model: manifest.testedModel, budgets: manifest.budgets, repairId, repairOf,
    execute: async (registered, output) => retainLocalRun(await executeLocalInquiryRun({ inputFile, outDir: output, model: manifest.testedModel, method: registered.method, strategy: registered.strategy as InquiryStrategy, execution: manifest.budgets })),
    evaluate: async (_row, report) => mechanicalReview(report) })
}
export async function replay() {
  const manifest = await json(path.join(root, "manifest.json")), retained = await retainedReplay(root)
  return { ...retained, schemaVersion: "authorization-at-replay/v1", registered: manifest.denominators, rows: manifest.rows.map((r: any) => ({ id: r.id, kind: r.kind, ...retained.rows.find(v => v.id === r.id), ...(retained.rows.some(v => v.id === r.id) ? {} : { status: "not-run", knownProviderCalls: 0 }) })) }
}
if (import.meta.main) console.log(JSON.stringify(await (process.argv[2] === "develop" ? develop(process.argv[3]!, process.argv[4], process.argv[5]) : process.argv[2] === "replay" ? replay() : Promise.reject(new Error("Use develop <registered-id> [repair-id original/attempt-n] | replay")))))
