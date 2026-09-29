import { createHash } from "node:crypto"
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
export const prefix = path.relative(repo, root).split(path.sep).join("/")
export const al = path.join(path.dirname(root), "authorization-location-recovery-v3")
export type Binding = { path: string; sha256: string }
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const absolute = (binding: Binding) => path.resolve(repo, binding.path)
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export async function exists(file: string) { try { await stat(file); return true } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e } }
export async function save(file: string, value: unknown, exclusive = false) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
export async function bind(file: string): Promise<Binding> { return { path: path.relative(repo, file).split(path.sep).join("/"), sha256: hash(await readFile(file)) } }
export async function verify(bindings: Binding[]) { for (const b of bindings) if (hash(await readFile(absolute(b))) !== b.sha256) throw new Error("Frozen bytes changed: " + b.path) }
export async function journal(stage: string, detail: unknown) { await appendFile(path.join(root, "journal.jsonl"), JSON.stringify({ at: new Date().toISOString(), stage, detail }) + "\n") }
export async function updateStatus(fields: Record<string, unknown>) { const v = await json(path.join(root, "status.json")); await save(path.join(root, "status.json"), { ...v, ...fields, updatedAt: new Date().toISOString() }) }
export async function cli(args: string[], paid = false) {
  const output: string[] = [], errors: string[] = []
  const exitCode = await runAuthorizationCli(args, { stdout: s => output.push(s), stderr: s => errors.push(s),
    ...(paid ? {} : { providerFactory: () => { throw new Error("Offline command attempted provider creation") } }) })
  let report: any = null; try { report = JSON.parse(output.join("\n")) } catch { /* help or explicit diagnostics */ }
  return { exitCode, report, errors, output }
}
export function configureProvider() { process.env.SKVM_CACHE = path.join(repo, ".skvm"); process.env.SKVM_AUTO_PROBE = "0" }
export async function provider(model: string) { configureProvider(); return await createProviderForModel(model) }
export async function verifyStudy(requireFreeze = true) {
  const plan = await json(path.join(root, "study-plan.json"))
  await verify([...plan.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles, c.baseline.assessment, c.baseline.report, c.baseline.proposal]), plan.authorBriefs, ...plan.authorSourceFiles])
  if (requireFreeze) {
    const frozen = await json(path.join(root, "implementation-freeze.json"))
    if (frozen.planSha256 !== hash(await readFile(path.join(root, "study-plan.json")))) throw new Error("Registration changed")
    await verify(frozen.files)
  }
  return plan
}
export async function claim(dir: string, value: unknown) {
  if (await exists(path.join(dir, "claim.json"))) return false
  await save(path.join(dir, "claim.json"), { value, at: new Date().toISOString(), noAutomaticResend: true }, true); return true
}
export async function sessionAccount(outRoot: string, report: any) {
  if (!report.sessionId) return { providerCalls: 0, respondedCalls: 0, unknownUsageCalls: 0, unknownCostCalls: 0, knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, totalActualUsd: 0, knownDurationMs: 0 }
  const session = path.join(outRoot, "sessions", report.sessionId)
  if (!await exists(path.join(session, "run.json"))) return report.telemetry ?? { providerCalls: 0, unknownUsageCalls: 1, unknownCostCalls: 1, totalActualUsd: null }
  const run = await json(path.join(session, "run.json"))
  const events = (await readFile(path.join(session, "events.jsonl"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
  const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts ?? [], events)
  return { ...summarizeAuthorizationAttempts(attempts), attempts,
    knownDurationMs: attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0),
    repairCalls: attempts.filter(a => a.phase === "domain-repair").length, fallbackCalls: attempts.filter(a => a.transport === "prompt-parse").length }
}
export function aggregateUsage(rows: any[]) {
  const tokens = rows.reduce((a, r) => { const t = r.knownTokens ?? {}; for (const k of ["input", "output", "cacheRead", "cacheWrite"]) a[k] += t[k] ?? 0; return a }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  const unknownUsageCalls = rows.reduce((n, r) => n + (r.unknownUsageCalls ?? 0), 0), unknownCostCalls = rows.reduce((n, r) => n + (r.unknownCostCalls ?? 0), 0)
  const completePrompt = tokens.input + tokens.cacheRead + tokens.cacheWrite
  return { providerCalls: rows.reduce((n, r) => n + (r.providerCalls ?? 0), 0), respondedCalls: rows.reduce((n, r) => n + (r.respondedCalls ?? 0), 0),
    knownTokens: tokens, completePromptTokens: unknownUsageCalls ? null : completePrompt, totalTokens: unknownUsageCalls ? null : completePrompt + tokens.output, unknownUsageCalls, unknownCostCalls,
    totalActualUsd: unknownCostCalls ? null : rows.reduce((n, r) => n + (r.totalActualUsd ?? 0), 0), knownDurationMs: rows.reduce((n, r) => n + (r.knownDurationMs ?? 0), 0),
    cacheConvention: "skvm-disjoint/v1; input + cacheRead + cacheWrite counted once", humanMinutes: null }
}
export async function retainPaid(id: string, status: string, account: any, infrastructureFailure = false) {
  const state = await json(path.join(root, "status.json"))
  if ((state.paidRows ?? []).some((row: any) => row.id === id)) throw new Error("Paid row already closed " + id)
  const paidRows = [...(state.paidRows ?? []), { id, status, account }]
  const consecutiveInfrastructureFailures = infrastructureFailure ? (state.consecutiveInfrastructureFailures ?? 0) + 1 : 0
  await updateStatus({ paidRows, providerCalls: aggregateUsage(paidRows.map(r => r.account)).providerCalls,
    consecutiveInfrastructureFailures, ...(consecutiveInfrastructureFailures >= 2 ? { paidPaused: true, failureState: { kind: "two-consecutive-infrastructure-failures", id } } : {}) })
}
export async function paidPaused() { return !!(await json(path.join(root, "status.json"))).paidPaused }
export async function proposalAccount(report: any) {
  const account = report?.proposal?.account ?? (report?.attemptPath && await exists(path.join(report.attemptPath, "account.json")) ? await json(path.join(report.attemptPath, "account.json")) : null)
  return account ? { ...account.telemetry, status: account.status, attempts: account.attempts, sourceDisplay: account.sourceDisplay,
    knownDurationMs: account.attempts.reduce((n: number, a: any) => n + (a.response?.durationMs ?? 0), 0) } : { providerCalls: 0, unknownUsageCalls: 0, unknownCostCalls: 0 }
}
