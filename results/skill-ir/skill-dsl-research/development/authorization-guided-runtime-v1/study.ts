import path from "node:path"
import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { z } from "zod"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
export const historical = path.join(path.dirname(root), "authorization-domain-execution-v1")
export const model = "xty/gpt-5.6-sol"
export const budgets = { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 12, maxToolCalls: 24, maxDisplayBytes: 262144, maxFiles: 512, maxReadBytes: 8388608, maxTokens: 6000 }
export const taskIds = ["memos-share", "paperless-download", "owui-ingestion", "gitea-self-query", "memos-remove", "paperless-notes", "paperless-share-create", "gitea-create-issue"]
const categories = ["schema/wire", "state/checker", "source-location", "semantic-extraction", "context/budget", "infrastructure", "evaluation"] as const
export const FailureSchema = z.object({ id: z.string(), runId: z.string(), implementationRevision: z.string(), category: z.enum(categories), rootCause: z.string().min(1), originalArtifact: z.string(), repairId: z.string().nullable(), changedFiles: z.array(z.string()), verificationArtifacts: z.array(z.string()), outcome: z.enum(["improved", "unchanged", "regressed", "unresolved"]) }).strict()
export type Row = { id: string; task: string; method: "M" | "D1"; strategy: string; components: string[]; kind?: string; sourceSkill?: string }
type Review = { failure?: { category: typeof categories[number]; rootCause: string; components: string[] }; rating?: string; evidence?: string[] }
type DevelopOptions = { revision: string; model: string; budgets: unknown; concurrency?: number; repairId?: string; repairOf?: string; execute(row: Row, output: string): Promise<any>; evaluate(row: Row, report: any): Promise<Review> }
const exists = (file: string) => stat(file).then(() => true, () => false)
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown, exclusive = true) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
const append = (file: string, value: unknown) => appendFile(file, JSON.stringify(value) + "\n", "utf8")
const lines = async (file: string): Promise<any[]> => (await readFile(file, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
export function plannedRows(): Row[] {
  return taskIds.flatMap((task, i) => (i % 2 ? ["D1", "M"] : ["M", "D1"]).map(method => ({ id: `quality-${task}-${method}`, task, method: method as "M" | "D1", strategy: method === "M" ? "legacy" : "guided-evidence-v2", components: method === "M" ? ["wire", "source", "delivery"] : ["wire", "source", "checker", "worklist", "delivery"], kind: "quality" })))
}
/** Detect delivery/transport failures without treating an honest unknown as a failed answer. Source quality is evaluated separately. */
export function mechanicalReview(report: any): Review {
  if (["completed", "valid"].includes(report.status) && report.validation?.valid !== false) return {}
  const status = String(report.status ?? "missing-report"), diagnostic = report.error ?? report.validation?.diagnostics?.[0]?.code ?? status
  const category = /timeout|unavailable|unknown/.test(status) ? "infrastructure" : /budget/.test(status) ? "context/budget" : /transport|schema/.test(status + diagnostic) ? "schema/wire" : "state/checker"
  return { failure: { category, rootCause: `${status}: ${diagnostic}`, components: category === "state/checker" ? ["checker", "delivery"] : ["wire", "source", "delivery"] } }
}
export async function retainLocalRun(report: any) {
  if (report.status === "provider-unavailable" || !report.sessionPath) return report
  const run = await json(path.join(report.sessionPath, "run.json"))
  return { ...report, telemetry: run.telemetry, initial: run.initial, final: run.final, validation: run.validation, attempts: run.attempts }
}
async function inspectedZeroDispatch(output: string) {
  const local = await inspectLocalInquiry(output).catch(() => undefined)
  return local?.status === "provider-unavailable" && local.providerDispatches === 0 && !(await exists(path.join(local.sessionPath, "dispatch.json"))) ? local : undefined
}
/** Dispatch at most two rows, evaluate each completion immediately, then pause affected new work. In-flight results are always retained. */
export async function developRows(base: string, rows: Row[], options: DevelopOptions) {
  for (const row of rows) if (!/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new Error("Unsafe row identity")
  let originalFailureId: string | undefined
  if (options.repairId) {
    const match = options.repairOf?.match(/^([a-zA-Z0-9_-]+)\/attempt-([1-9]\d*)$/)
    if (!match || rows.length !== 1 || rows[0]!.id !== match[1]) throw new Error("A repair requires an existing same-row original attempt")
    const original = path.join(base, "runs", options.repairOf!)
    if (!(await exists(path.join(original, "claim.json"))) || !(await exists(path.join(original, "report.json")))) throw new Error("Missing retained original attempt")
    const claim = await json(path.join(original, "claim.json")), retained = await json(path.join(original, "report.json"))
    if (claim.row.id !== rows[0]!.id || claim.attempt !== Number(match[2]) || JSON.stringify(claim) !== JSON.stringify(retained.identity)) throw new Error("Invalid original attempt identity")
    if (/unknown/.test(String(retained.report.status)) && !(await inspectedZeroDispatch(original))) throw new Error("An original attempt of unknown completion cannot be redispatched")
    originalFailureId = `${match[1]}-attempt-${match[2]}`
  }
  await mkdir(base, { recursive: true })
  const pauses: Array<{ components: string[]; failureId: string }> = [], completed: any[] = []
  const unresolved = (await lines(path.join(base, "failures.jsonl"))).filter(f => f.outcome === "unresolved")
  const repaired = new Set((await lines(path.join(base, "repairs.jsonl"))).filter(r => r.outcome === "improved").map(r => r.failureId))
  for (const failure of unresolved) if (!repaired.has(failure.id)) pauses.push({ components: failure.components ?? ["wire", "source", "checker", "delivery", "worklist"], failureId: failure.id })
  const width = Math.min(2, Math.max(1, options.concurrency ?? 1))
  for (let cursor = 0; cursor < rows.length; cursor += width) {
    await Promise.all(rows.slice(cursor, cursor + width).map(async row => {
      const runDir = path.join(base, "runs", row.id)
      const paused = pauses.find(p => p.failureId !== originalFailureId && p.components.some(c => row.components.includes(c)))
      if (paused) { completed.push({ id: row.id, status: "not-run-after-defect", failureId: paused.failureId }); return }
      const attempts = (await readdir(runDir).catch(() => [])).filter(s => /^attempt-\d+$/.test(s))
      if (attempts.length && !options.repairId) { completed.push({ id: row.id, status: "already-retained" }); return }
      const attempt = Math.max(0, ...attempts.map(a => Number(a.split("-")[1]))) + 1, output = path.join(runDir, `attempt-${attempt}`)
      const identity = { row, attempt, revision: options.revision, model: options.model, budgets: options.budgets, repairId: options.repairId ?? null, repairOf: options.repairOf ?? null, startedAt: new Date().toISOString(), development: "adaptive-exposed" }
      await save(path.join(output, "claim.json"), identity)
      let report: any
      try { report = await options.execute(row, output) }
      catch (cause) { report = { status: "completion-unknown", error: String(cause), totalActualUsd: null, providerDispatches: null } }
      const artifact = `runs/${row.id}/attempt-${attempt}/report.json`
      await save(path.join(base, artifact), { identity, report })
      let review: Review
      try { review = await options.evaluate(row, report) }
      catch (cause) { review = { failure: { category: "evaluation", rootCause: String(cause), components: row.components } } }
      await save(path.join(output, "review.json"), review)
      if (review.failure) {
        const id = `${row.id}-attempt-${attempt}`
        const failure = FailureSchema.parse({ id, runId: row.id, implementationRevision: options.revision, category: review.failure.category, rootCause: review.failure.rootCause, originalArtifact: artifact, repairId: options.repairId ?? null, changedFiles: [], verificationArtifacts: [], outcome: "unresolved" })
        await append(path.join(base, "failures.jsonl"), { ...failure, components: review.failure.components })
        pauses.push({ components: review.failure.components, failureId: id })
      }
      completed.push({ id: row.id, status: report.status, attempt, artifact, review })
      await append(path.join(base, "journal.jsonl"), { at: new Date().toISOString(), stage: "development-attempt", ...identity, artifact, status: report.status, providerCalls: report.telemetry?.providerCalls ?? report.providerDispatches ?? null, needsRepair: !!review.failure })
    }))
  }
  return { rows: completed, paused: pauses }
}
/** No provider is constructed by replay; all attempts, including uncompleted claims, contribute to accounting. */
export async function replay(base = root) {
  const rows: any[] = []
  for (const id of await readdir(path.join(base, "runs")).catch(() => [])) {
    const run = path.join(base, "runs", id), attempts = (await readdir(run)).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))
    let providerCalls = 0, unknownCalls = false, knownUsd = 0, unknownUsd = false
    const artifacts: string[] = [], classificationCorrections: any[] = []
    for (const attempt of attempts) {
      const file = path.join(run, attempt, "report.json"), claim = await json(path.join(run, attempt, "claim.json"))
      if (!(await exists(file))) { unknownCalls = unknownUsd = true; continue }
      const retained = await json(file)
      if (JSON.stringify(retained.identity) !== JSON.stringify(claim) || claim.row.id !== id) throw new Error(`Identity mismatch: ${id}/${attempt}`)
      const report = retained.report, zero = /unknown/.test(String(report.status)) ? await inspectedZeroDispatch(path.join(run, attempt)) : undefined
      if (zero) classificationCorrections.push({ artifact: `runs/${id}/${attempt}/report.json`, verifiedStatus: zero.status, providerCalls: 0 })
      const calls = zero ? 0 : report.telemetry?.providerCalls ?? report.providerDispatches
      if (typeof calls === "number") providerCalls += calls; else unknownCalls = true
      const usd = report.telemetry?.totalActualUsd ?? report.telemetry?.costUsd ?? report.totalActualUsd
      if (typeof usd === "number") knownUsd += usd; else unknownUsd = true
      if (await exists(path.join(run, attempt, "sessions.jsonl"))) await inspectLocalInquiry(path.join(run, attempt))
      artifacts.push(`runs/${id}/${attempt}/report.json`)
    }
    rows.push({ id, firstAttempt: artifacts[0] ?? null, repairAttempts: artifacts.slice(1), providerCalls: unknownCalls ? null : providerCalls, knownProviderCalls: providerCalls, knownUsdSubtotal: knownUsd, totalActualUsd: unknownUsd ? null : knownUsd, ...(classificationCorrections.length ? { classificationCorrections } : {}) })
  }
  return { schemaVersion: "authorization-ar-replay/v1", rows, providerCallsDuringReplay: 0, targetExecutions: 0 }
}
export async function register() {
  const file = path.join(root, "manifest.json")
  if (await exists(file)) return json(file)
  const previous = await json(path.join(historical, "manifest.json"))
  const tasks = previous.tasks.map((t: any) => ({ id: t.id, inputFile: path.relative(root, path.join(historical, "model/inputs", `${t.id}.json`)).replaceAll("\\", "/"), source: t.source }))
  const manifest = { schemaVersion: "authorization-ar-study/v1", createdAt: new Date().toISOString(), model, budgets, tasks, rows: plannedRows(), development: "adaptive-exposed", targetExecuted: false, priorAnswersModelVisible: false, sourceIdentities: previous.sourceIdentities }
  await save(file, manifest)
  await save(path.join(root, "historical-failures.json"), { historicalRoot: path.relative(root, historical).replaceAll("\\", "/"), evidence: [
    { category: "schema/wire", kind: "wrong-schema-type", artifact: "shared-revision.json", rawRun: "runs/quality-memos-share-M-E" },
    { category: "schema/wire", kind: "delta-controlDelta", artifact: "evaluator/packets/packet-ca9b6db6c09a.json" },
    { category: "schema/wire", kind: "source-premise-binding-confusion", artifact: "evaluator/packets/packet-556eec587f85.json" },
    { category: "semantic-extraction", kind: "owner-null-and-not-given", artifact: "runs/revision-paperless-notes-M-E/report.json", source: "model/public-source/paperless/src/documents/permissions.py:624-635" },
    { category: "source-location", kind: "unread-decisive-helper", artifact: "evaluator/packets/packet-e253a7ea408c.json" },
    { category: "context/budget", kind: "native-budget-delivery", artifact: "evaluator/packets/packet-df35983b306b.json" },
    { category: "state/checker", kind: "invalid-second-check-clears-result", artifact: "../../../../../src/benchmarks/authorization-dsl/inquiry-native.test.ts", provenance: "deterministic regression; no historical paid occurrence established" },
  ] })
  return manifest
}
if (import.meta.main) {
  const action = process.argv[2], manifest = await register()
  if (action === "check") {
    const checks = []
    for (const task of manifest.tasks) { const c = await checkAuthorizationInquiry(path.resolve(root, task.inputFile), "M", "legacy"); if (c.status !== "valid") throw new Error(JSON.stringify(c)); checks.push({ task: task.id, files: c.sourceFiles.length, status: c.status }) }
    for (const evidence of (await json(path.join(root, "historical-failures.json"))).evidence) if (!(await exists(path.resolve(historical, evidence.artifact)))) throw new Error(`Missing historical failure: ${evidence.artifact}`)
    await save(path.join(root, "precheck.json"), { checks, providerCalls: 0 }, false); console.log(JSON.stringify({ action, checks: checks.length, providerCalls: 0 }))
  } else if (action === "develop" || action === "probe") {
    const id = process.argv[3], repairId = process.argv[4], repairOf = process.argv[5]
    const probeFile = path.join(root, "source-probe-plan.json")
    if (action === "probe" && !(await exists(probeFile))) await save(probeFile, { schemaVersion: "authorization-ar-source-probe/v1", model, budgets, rows: ["paperless-notes", "memos-remove"].map(task => ({ id: `probe-${task}-Mg`, task, method: "M", strategy: "guided-evidence-v2", components: ["wire", "source", "checker", "worklist", "delivery"], kind: "source-window-mechanism" })), mainQualityPanel: false, originalInputsOnly: true })
    const rows = (action === "probe" ? (await json(probeFile)).rows : manifest.rows).filter((r: Row) => r.id === id)
    if (rows.length !== 1) throw new Error("develop requires one registered row; assess its source quality before the next block")
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
    const result = await developRows(root, rows, { revision, model, budgets, repairId, repairOf, execute: async (row, outDir) => {
      const inputFile = path.resolve(root, manifest.tasks.find((t: any) => t.id === row.task).inputFile)
      const report = await executeLocalInquiryRun({ inputFile, outDir, model, method: row.method, strategy: row.strategy as any, execution: budgets })
      return retainLocalRun(report)
    }, evaluate: async (_row, report) => mechanicalReview(report) })
    console.log(JSON.stringify(result))
  } else if (action === "replay") { console.log(JSON.stringify(await replay())) }
  else if (action === "evaluate") { const result = await replay(); await save(path.join(root, "evaluation-summary.json"), { ...result, qualityBenefit: "not-established", independentReview: "pending", firstAndRepairSeparate: true }, false); console.log(JSON.stringify({ rows: result.rows.length, providerCalls: 0 })) }
  else throw new Error("Use check|develop|probe <registered-row> [repair-id original/attempt-n]|evaluate|replay")
}
