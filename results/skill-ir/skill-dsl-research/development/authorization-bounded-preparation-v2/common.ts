import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"

export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const aj = path.join(path.dirname(root), "authorization-evidence-editing-v1")
export const caseIds = ["owui-file", "fastapi-superuser-read", "memos-create-share", "memos-get-shared", "memos-member-leave", "paperless-download", "paperless-note-post", "paperless-share-create"]
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
export async function save(file: string, value: unknown, exclusive = false) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
}
export const bind = async (file: string) => ({ path: path.relative(repo, file).replaceAll("\\", "/"), sha256: hash(await readFile(file)) })
export const absolute = (binding: { path: string }) => path.join(repo, ...binding.path.split("/"))
export async function verify(bindings: Array<{ path: string; sha256: string }>) {
  for (const binding of bindings) if (hash(await readFile(absolute(binding))) !== binding.sha256) throw new Error(`Frozen bytes changed: ${binding.path}`)
}
export async function cli(args: string[], paid = false) {
  const stdout: string[] = [], stderr: string[] = []
  const code = await runAuthorizationCli(args, { stdout: value => stdout.push(value), stderr: value => stderr.push(value),
    ...(paid ? {} : { providerFactory: () => { throw new Error("Offline command must not initialize a provider") } }) })
  return { code, stdout, stderr, report: stdout.length ? JSON.parse(stdout.at(-1)!) : null }
}
export const journal = async (stage: string, value: unknown) => appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), stage, value })}\n`, "utf8")
export async function updateState(stage: string, values: Record<string, unknown>) {
  const state = await json(path.join(root, "status.json"))
  await save(path.join(root, "status.json"), { ...state, stage, ...values })
}
export function aggregateUsage(rows: any[]) {
  const knownTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for (const row of rows) for (const key of Object.keys(knownTokens) as Array<keyof typeof knownTokens>) knownTokens[key] += row.knownTokens?.[key] ?? 0
  const unknownCostCalls = rows.reduce((n, r) => n + (r.unknownCostCalls ?? ((r.providerCalls ?? 0) && r.totalActualUsd === null ? r.providerCalls : 0)), 0)
  const unknownUsageCalls = rows.reduce((n, r) => n + (r.unknownUsageCalls ?? 0), 0)
  return { planned: rows.length, providerCalls: rows.reduce((n, r) => n + (r.providerCalls ?? 0), 0), respondedCalls: rows.reduce((n, r) => n + (r.respondedCalls ?? 0), 0), unknownUsageCalls, unknownCostCalls, knownTokens,
    completePromptTokens: unknownUsageCalls ? null : knownTokens.input + knownTokens.cacheRead + knownTokens.cacheWrite,
    completeTotalTokens: unknownUsageCalls ? null : knownTokens.input + knownTokens.cacheRead + knownTokens.cacheWrite + knownTokens.output,
    tokenSemantics: "skvm-disjoint; cache is added once to fresh input", actualUsdStatus: unknownCostCalls ? "unknown" : "complete",
    knownActualUsdSubtotal: rows.reduce((n, r) => n + (r.knownActualUsdSubtotal ?? r.totalActualUsd ?? 0), 0), totalActualUsd: unknownCostCalls ? null : rows.reduce((n, r) => n + (r.totalActualUsd ?? 0), 0) }
}
