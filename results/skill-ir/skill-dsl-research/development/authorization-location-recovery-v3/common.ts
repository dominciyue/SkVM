import { createHash } from "node:crypto"
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const ak = path.join(path.dirname(root), "authorization-bounded-preparation-v2")
export type Binding = { path: string; sha256: string }
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
export const absolute = (b: Binding) => path.resolve(repo, b.path)
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
  let report: any = null
  try { report = JSON.parse(output.join("\n")) } catch { /* non-JSON ordinary help */ }
  return { exitCode, report, errors, output }
}
export function configureProvider(model: string) {
  process.env.SKVM_CACHE = path.join(repo, ".skvm"); process.env.SKVM_AUTO_PROBE = "0"
  // Constructing a provider verifies local configuration without dispatch or printing credentials.
  return createProviderForModel(model)
}
export async function verifyStudy() {
  const plan = await json(path.join(root, "study-plan.json"))
  const frozen = await json(path.join(root, "implementation-freeze.json"))
  if (frozen.planSha256 !== hash(await readFile(path.join(root, "study-plan.json")))) throw new Error("Study registration changed")
  await verify([...frozen.files, ...plan.cases.flatMap((c: any) => [c.input, c.seedRequest, c.markdown, ...c.sourceFiles,
    ...(c.oldMaterial.blocked ? [] : [c.oldMaterial.input, c.oldMaterial.report, ...c.oldMaterial.sources])]), plan.publicBriefs, plan.authorBriefs, ...plan.scaffoldBindings, ...plan.ordinaryGuide])
  return plan
}
export async function claim(dir: string, value: unknown) {
  if (await exists(path.join(dir, "claim.json"))) return false
  await save(path.join(dir, "claim.json"), { value, createdAt: new Date().toISOString(), noAutomaticResend: true }, true)
  return true
}
export async function sessionAccount(outRoot: string, report: any) {
  if (!report.sessionId) return { providerCalls: 0, respondedCalls: 0, unknownUsageCalls: 0, unknownCostCalls: 0, knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, totalActualUsd: 0, knownActualUsdSubtotal: 0, knownDurationMs: 0 }
  const session = path.join(outRoot, "sessions", report.sessionId)
  if (!await exists(path.join(session, "run.json"))) return report.telemetry ?? { providerCalls: 0, unknownUsageCalls: 1, unknownCostCalls: 1, totalActualUsd: null }
  const run = await json(path.join(session, "run.json"))
  const events = (await readFile(path.join(session, "events.jsonl"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
  const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts ?? [], events)
  return { ...summarizeAuthorizationAttempts(attempts), knownDurationMs: attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0),
    repairCalls: attempts.filter(a => a.phase === "domain-repair").length, fallbackCalls: attempts.filter(a => a.transport === "prompt-parse").length }
}
export function aggregateUsage(rows: any[]) {
  const tokens = rows.reduce((a, r) => { const t = r.knownTokens ?? {}; for (const k of ["input", "output", "cacheRead", "cacheWrite"]) a[k] += t[k] ?? 0; return a }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  const unknownUsageCalls = rows.reduce((n, r) => n + (r.unknownUsageCalls ?? 0), 0), unknownCostCalls = rows.reduce((n, r) => n + (r.unknownCostCalls ?? 0), 0)
  const completePrompt = tokens.input + tokens.cacheRead + tokens.cacheWrite
  return { providerCalls: rows.reduce((n, r) => n + (r.providerCalls ?? 0), 0), respondedCalls: rows.reduce((n, r) => n + (r.respondedCalls ?? 0), 0),
    knownTokens: tokens, completePromptTokens: unknownUsageCalls ? null : completePrompt, totalTokens: unknownUsageCalls ? null : completePrompt + tokens.output, unknownUsageCalls, unknownCostCalls,
    totalActualUsd: unknownCostCalls ? null : rows.reduce((n, r) => n + (r.totalActualUsd ?? 0), 0),
    knownDurationMs: rows.reduce((n, r) => n + (r.knownDurationMs ?? 0), 0), cacheConvention: "skvm-disjoint/v1; fresh input + cache read + cache write; no second cache addition" }
}
