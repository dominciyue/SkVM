import { createHash } from "node:crypto"
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { sessionAccount, aggregateUsage } from "../authorization-control-context-v1/common.ts"

export { sessionAccount, aggregateUsage }
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const am = path.resolve(root, "../authorization-control-context-v1")
export const al = path.resolve(root, "../authorization-location-recovery-v3")
export type Binding = { path: string; sha256: string }
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const absolute = (binding: Binding) => path.resolve(repo, binding.path)
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export async function exists(file: string) { try { await stat(file); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error } }
export async function save(file: string, value: unknown, exclusive = false) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
export async function bind(file: string): Promise<Binding> { return { path: path.relative(repo, file).split(path.sep).join("/"), sha256: hash(await readFile(file)) } }
export async function verify(bindings: Binding[]) { for (const item of bindings) if (hash(await readFile(absolute(item))) !== item.sha256) throw new Error(`Registered bytes changed: ${item.path}`) }
export async function journal(stage: string, detail: unknown) { await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), stage, detail })}\n`, "utf8") }
export async function updateStatus(fields: Record<string, unknown>) { const previous = await json(path.join(root, "status.json")); await save(path.join(root, "status.json"), { ...previous, ...fields, updatedAt: new Date().toISOString() }) }
export async function claim(directory: string, value: unknown) { await save(path.join(directory, "claim.json"), { value, at: new Date().toISOString(), noAutomaticResend: true }, true) }
export async function unresolvedClaim(directory: string, terminalFile: string): Promise<{ archivedFiles: string[] } | null> {
  if (!await exists(path.join(directory, "claim.json")) || await exists(path.join(directory, terminalFile))) return null
  return { archivedFiles: (await readdir(directory)).sort() }
}
export const unknownAccount = () => ({ providerCalls: null, respondedCalls: 0, unknownUsageCalls: 1, unknownCostCalls: 1,
  knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, totalActualUsd: null, knownDurationMs: 0, unknownDurationCalls: 1 })
export async function paidRecordExists(id: string) { return (await json(path.join(root, "status.json"))).paidDispatches.some((row: any) => row.id === id) }
export async function cli(args: string[]) {
  const output: string[] = [], errors: string[] = []
  const exitCode = await runAuthorizationCli(args, { stdout: value => output.push(value), stderr: value => errors.push(value), providerFactory: () => { throw new Error("Offline AN command attempted provider creation") } })
  let report: any = null
  try { report = JSON.parse(output.join("\n")) } catch { /* preserve raw diagnostics */ }
  return { exitCode, report, errors, output }
}
export function configureProvider() { process.env.SKVM_CACHE = path.join(repo, ".skvm"); process.env.SKVM_AUTO_PROBE = "0" }
export async function provider(model: string) { configureProvider(); return createProviderForModel(model) }
export async function verifyPlan(requireFreeze = false) {
  const plan = await json(path.join(root, "study-plan.json"))
  await verify(plan.inputBindings)
  if (requireFreeze) {
    const frozen = await json(path.join(root, "generation-freeze.json"))
    if (frozen.planSha256 !== hash(await readFile(path.join(root, "study-plan.json")))) throw new Error("AN generation registration changed")
    await verify(frozen.files)
  }
  return plan
}
export async function retainPaid(id: string, status: string, account: any, infrastructureFailure = false) {
  const state = await json(path.join(root, "status.json"))
  if (state.paidDispatches.some((row: any) => row.id === id)) throw new Error(`Paid row already closed: ${id}`)
  const paidDispatches = [...state.paidDispatches, { id, status, account }]
  const consecutiveInfrastructureFailures = infrastructureFailure ? (state.consecutiveInfrastructureFailures ?? 0) + 1 : 0
  await updateStatus({ paidDispatches, consecutiveInfrastructureFailures,
    ...(consecutiveInfrastructureFailures >= 2 ? { paidPaused: true, failureState: { kind: "two-consecutive-infrastructure-failures", id } } : {}) })
}
export async function paidPaused() { return !!(await json(path.join(root, "status.json"))).paidPaused || await exists(path.join(root, "generation-closed.json")) }
