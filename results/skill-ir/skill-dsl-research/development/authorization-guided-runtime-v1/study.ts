import path from "node:path"
import { readFile, writeFile, appendFile, mkdir, readdir, stat } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
export const historical = path.join(path.dirname(root), "authorization-domain-execution-v1")
export const model = "xty/gpt-5.6-sol"
export const budgets = { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 12, maxToolCalls: 24, maxDisplayBytes: 262144, maxFiles: 512, maxReadBytes: 8388608, maxTokens: 6000 }
export const taskIds = ["memos-share", "paperless-download", "owui-ingestion", "gitea-self-query", "memos-remove", "paperless-notes", "paperless-share-create", "gitea-create-issue"]
const categories = ["schema/wire", "state/checker", "source-location", "semantic-extraction", "context/budget", "infrastructure", "evaluation"] as const
export const FailureSchema = z.object({ id: z.string(), runId: z.string(), implementationRevision: z.string(), category: z.enum(categories), rootCause: z.string().min(1), originalArtifact: z.string(), repairId: z.string().nullable(), changedFiles: z.array(z.string()), verificationArtifacts: z.array(z.string()), outcome: z.enum(["improved", "unchanged", "regressed", "unresolved"]) }).strict()
export type Row = { id: string; task: string; method: "M" | "D1"; strategy: string; components: string[]; kind?: string; sourceSkill?: string }
type Review = { failure?: { category: typeof categories[number]; rootCause: string; components: string[] }; rating?: string; evidence?: string[] }
export type ZeroDispatchInspection = { status: "input-invalid-before-dispatch"; providerDispatches: 0; claimSha256: string; reportSha256: string; evidence: Array<{ path: string; sha256: string }> }
type InspectionOptions = { inspectZeroDispatch?: (output: string) => Promise<ZeroDispatchInspection | undefined> }
type DevelopOptions = InspectionOptions & { revision: string; model: string; budgets: unknown; concurrency?: number; repairId?: string; repairOf?: string; execute(row: Row, output: string): Promise<any>; evaluate(row: Row, report: any): Promise<Review> }
const exists = (file: string) => stat(file).then(() => true, () => false)
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown, exclusive = true) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
const append = (file: string, value: unknown) => appendFile(file, JSON.stringify(value) + "\n", "utf8")
const lines = async (file: string): Promise<any[]> => (await readFile(file, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
const ScopedAdjudicationSchema = z.object({ failureId: z.string().min(1), originalArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/), releasedComponents: z.array(z.string().min(1)).min(1), eligibleRows: z.array(z.string().min(1)).min(1), retainTaskPause: z.boolean(), classification: z.literal("model-candidate").optional(), rationale: z.string().min(1), verificationArtifacts: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1) }).strict().refine(v => v.retainTaskPause || v.classification === "model-candidate", "A task release requires explicit model-candidate classification")
/** A scoped release is evidence about repaired shared machinery, never completion of its failed task. */
async function scopedAdjudications(base: string, failures: any[]) {
  const readBound = async (relative: string, expected: string) => {
    const file = path.resolve(base, relative), relation = path.relative(path.resolve(base), file)
    if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) throw new Error("Invalid adjudication evidence path")
    const bytes = await readFile(file)
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Changed adjudication evidence")
    return bytes
  }
  const output = []
  for (const raw of await lines(path.join(base, "scope-adjudications.jsonl"))) {
    const entry = ScopedAdjudicationSchema.parse(raw), failure = failures.find(f => f.id === entry.failureId)
    if (!failure || entry.releasedComponents.some(c => !failure.components?.includes(c))) throw new Error("Adjudication requires a retained failure and its affected components")
    const retained = JSON.parse((await readBound(failure.originalArtifact, entry.originalArtifactSha256)).toString("utf8"))
    if (retained.identity?.row?.id !== failure.runId || !retained.identity.row.task) throw new Error("Adjudication original identity mismatch")
    if (!entry.retainTaskPause && (retained.report.sourceVerification?.valid !== true || hasUnknownAuthorizationCompletion(retained.report) || entry.releasedComponents.some(c => !["checker", "delivery"].includes(c)) || mechanicalReview(retained.report).failure?.components.join(",") !== "model-draft")) throw new Error("Task release requires a source-verified known model candidate rejection")
    for (const proof of entry.verificationArtifacts) await readBound(proof.path, proof.sha256)
    output.push({ ...entry, retainedTask: entry.retainTaskPause ? retained.identity.row.task as string : undefined })
  }
  return output
}
export function plannedRows(): Row[] {
  return taskIds.flatMap((task, i) => (i % 2 ? ["D1", "M"] : ["M", "D1"]).map(method => ({ id: `quality-${task}-${method}`, task, method: method as "M" | "D1", strategy: method === "M" ? "legacy" : "guided-evidence-v2", components: method === "M" ? ["wire", "source", "delivery"] : ["wire", "source", "checker", "worklist", "delivery"], kind: "quality" })))
}
/** Detect delivery/transport failures without treating an honest unknown as a failed answer. Source quality is evaluated separately. */
export function mechanicalReview(report: any): Review {
  if (["completed", "valid"].includes(report.status) && report.validation?.valid !== false) return {}
  const status = String(report.status ?? "missing-report"), diagnostic = report.error ?? report.validation?.diagnostics?.[0]?.code ?? status
  const semantic = report.domain?.semantic, check = report.domain?.check
  const archivedDiagnostics = [...(semantic?.records ?? []).filter((r: any) => r.accepted === false).flatMap((r: any) => r.diagnostics ?? []), ...(semantic?.assemblies ?? []).flatMap((a: any) => a.diagnostics ?? [])]
  const currentDiagnostics = [...(report.validation?.diagnostics ?? []), ...(check?.diagnostics ?? [])]
  const rejectedCandidates = currentDiagnostics.length > 0 && currentDiagnostics.every((d: any) => String(d.code).startsWith("semantic-") && archivedDiagnostics.some((a: any) => isDeepStrictEqual(a, d))) && !hasUnknownAuthorizationCompletion(report)
  const inquiryDelivered = Array.isArray(report.final?.questions) && report.final.questions.length > 0
  const nativeDelivered = typeof report.finalProse === "string" && report.finalProse.trim().length > 0 && report.domain?.closed === true && (semantic?.assemblies ?? []).some((a: any) => Array.isArray(a.derived?.questions) && a.derived.questions.length > 0)
  const nativeChecks = (report.history ?? []).filter((h: any) => h.call?.name === "authorization_check_result")
  const candidateCodes = new Set(["focus-result-stale", "focus-result-schema", "focus-question-coverage", "focus-revisit-missing", "focus-next-item-unavailable", "semantic-result-schema", "semantic-callee-uninterpreted", "semantic-argument-unbound", "semantic-disposition-conflict", "semantic-effect-conflict", "policy-behavior-conflict", "control-result-schema", "inquiry-result-schema", "observation-schema", "question-not-answered"])
  const candidateCheck = (h: any) => h.exitCode === 0 && h.output?.valid === false && h.output.diagnostics?.length > 0 && h.output.diagnostics.every((d: any) => candidateCodes.has(d.code))
  const knownNativeCandidate = report.ordinaryEntry === "skvm run" && report.domain?.closed === true && report.sourceVerification?.valid === true && report.finalProse?.trim().length > 0 && nativeChecks.some(candidateCheck) && nativeChecks.every((h: any) => candidateCheck(h) || h.exitCode === 1 && (h.output?.phase === "authorization_check_result" && h.output.diagnostics?.length > 0 || ["delivery-repair-budget", "tool-budget"].includes(h.output?.code)))
  if (status === "completed-with-diagnostics" && !report.error && !hasUnknownAuthorizationCompletion(report) && report.validation?.valid === false && knownNativeCandidate) return { failure: { category: "semantic-extraction", rootCause: `${status}: known native candidate violated the focused result contract`, components: ["model-draft"] } }
  const nativeSchemaRejections = report.ordinaryEntry === "skvm run" && report.domain?.closed === true && typeof report.finalProse === "string" && report.finalProse.trim().length > 0 && !check && nativeChecks.length > 0 && nativeChecks.every((h: any) => h.exitCode === 1 && h.output?.phase === "authorization_check_result" && Array.isArray(h.output.diagnostics) && h.output.diagnostics.length > 0) && !hasUnknownAuthorizationCompletion(report)
  if (status === "completed-with-diagnostics" && !report.error && report.validation?.valid === false && nativeSchemaRejections) return { failure: { category: "semantic-extraction", rootCause: `${status}: native final-check candidates rejected by schema`, components: ["model-draft"] } }
  if (status === "completed-with-diagnostics" && !report.error && !hasUnknownAuthorizationCompletion(report) && report.validation?.valid === false && check?.structureValid === true && check.ruleConsistency === false && ((inquiryDelivered || report.ordinaryEntry === "skvm run" && nativeDelivered) && check.sourceBound === true || rejectedCandidates && (inquiryDelivered || nativeDelivered)))
    return { failure: { category: "semantic-extraction", rootCause: `${status}: ${diagnostic}`, components: ["model-draft"] } }
  const category = /timeout|unavailable|unknown/.test(status) || /ProviderNetworkError|network error|Unable to connect/.test(String(diagnostic)) ? "infrastructure" : /budget/.test(status) ? "context/budget" : /transport|schema/.test(status + diagnostic) ? "schema/wire" : "state/checker"
  return { failure: { category, rootCause: `${status}: ${diagnostic}`, components: category === "state/checker" ? ["checker", "delivery"] : ["wire", "source", "delivery"] } }
}
export async function retainLocalRun(report: any) {
  if (report.status === "provider-unavailable" || !report.sessionPath) return report
  const run = await json(path.join(report.sessionPath, "run.json"))
  return { ...report, telemetry: run.telemetry, initial: run.initial, final: run.final, validation: run.validation, attempts: run.attempts }
}
async function inspectedZeroDispatch(output: string, inspect?: InspectionOptions["inspectZeroDispatch"]) {
  const retained = await json(path.join(output, "report.json")), report = retained.report
  if (report.providerDispatches != null && report.providerDispatches !== 0 || report.telemetry?.providerCalls != null && report.telemetry.providerCalls !== 0 || (report.attempts ?? report.native?.attempts ?? []).length) return undefined
  const local = await inspectLocalInquiry(output).catch(() => undefined)
  if (local?.status === "provider-unavailable" && local.providerDispatches === 0 && !(await exists(path.join(local.sessionPath, "dispatch.json")))) return local
  const proof = await inspect?.(output)
  if (!proof) return undefined
  const parsed = z.object({ status: z.literal("input-invalid-before-dispatch"), providerDispatches: z.literal(0), claimSha256: z.string().regex(/^[a-f0-9]{64}$/), reportSha256: z.string().regex(/^[a-f0-9]{64}$/), evidence: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1) }).strict().parse(proof)
  const check = async (relative: string, expected: string) => {
    const file = path.resolve(output, relative), relation = path.relative(path.resolve(output), file)
    if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation) || createHash("sha256").update(await readFile(file)).digest("hex") !== expected) throw new Error("Changed or invalid zero-dispatch inspection evidence")
  }
  await check("claim.json", parsed.claimSha256); await check("report.json", parsed.reportSha256)
  if (!isDeepStrictEqual(await json(path.join(output, "claim.json")), retained.identity)) throw new Error("Zero-dispatch inspection identity mismatch")
  for (const evidence of parsed.evidence) await check(evidence.path, evidence.sha256)
  return parsed
}
/** Dispatch at most two rows, evaluate each completion immediately, then pause affected new work. In-flight results are always retained. */
export async function developRows(base: string, rows: Row[], options: DevelopOptions) {
  for (const row of rows) if (!/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new Error("Unsafe row identity")
  const originalFailureArtifacts = new Map<string, string>()
  if (options.repairId) {
    let reference = options.repairOf, childAttempt = Infinity
    do {
      const match = reference?.match(/^([a-zA-Z0-9_-]+)\/attempt-([1-9]\d*)$/), attempt = Number(match?.[2])
      if (!match || rows.length !== 1 || rows[0]!.id !== match[1]) throw new Error("A repair requires an existing same-row original attempt")
      if (!Number.isSafeInteger(attempt) || attempt >= childAttempt) throw new Error("Invalid repair ancestry: attempts must strictly decrease")
      const original = path.join(base, "runs", reference!)
      if (!(await exists(path.join(original, "claim.json"))) || !(await exists(path.join(original, "report.json")))) throw new Error("Missing retained original attempt")
      const claim = await json(path.join(original, "claim.json")), retained = await json(path.join(original, "report.json"))
      if (!isDeepStrictEqual(claim.row, rows[0]) || claim.attempt !== attempt || JSON.stringify(claim) !== JSON.stringify(retained.identity)) throw new Error("Invalid original attempt identity")
      if (hasUnknownAuthorizationCompletion(retained.report) && !(await inspectedZeroDispatch(original, options.inspectZeroDispatch))) throw new Error("An original attempt of unknown completion cannot be redispatched")
      originalFailureArtifacts.set(`${match[1]}-attempt-${match[2]}`, `runs/${reference}/report.json`)
      if (claim.repairOf != null && (typeof claim.repairOf !== "string" || typeof claim.repairId !== "string" || !claim.repairId)) throw new Error("Invalid repair ancestry: predecessor requires a named repair")
      if (claim.repairOf == null && claim.repairId != null) throw new Error("Invalid repair ancestry: named repair is missing its predecessor")
      reference = claim.repairOf ?? undefined
      childAttempt = attempt
    } while (reference !== undefined)
  }
  await mkdir(base, { recursive: true })
  const pauses: Array<{ components: string[]; failureId: string }> = [], completed: any[] = []
  const unresolved = (await lines(path.join(base, "failures.jsonl"))).filter(f => f.outcome === "unresolved")
  const adjudications = await scopedAdjudications(base, unresolved)
  const repaired = new Set((await lines(path.join(base, "repairs.jsonl"))).filter(r => r.outcome === "improved").map(r => r.failureId))
  for (const failure of unresolved) {
    const ancestorArtifact = originalFailureArtifacts.get(failure.id)
    if (ancestorArtifact && (failure.runId !== rows[0]!.id || failure.originalArtifact !== ancestorArtifact)) throw new Error("Invalid ancestor failure identity")
    if (!repaired.has(failure.id)) pauses.push({ components: failure.components ?? ["wire", "source", "checker", "delivery", "worklist"], failureId: failure.id })
  }
  const width = Math.min(2, Math.max(1, options.concurrency ?? 1))
  for (let cursor = 0; cursor < rows.length; cursor += width) {
    await Promise.all(rows.slice(cursor, cursor + width).map(async row => {
      const runDir = path.join(base, "runs", row.id)
      const sealed = adjudications.find(a => a.retainedTask === row.task)
      const paused = sealed ?? pauses.find(p => !originalFailureArtifacts.has(p.failureId) && p.components.some(c => row.components.includes(c) && !adjudications.some(a => a.failureId === p.failureId && a.retainedTask !== row.task && a.eligibleRows.includes(row.id) && a.releasedComponents.includes(c))))
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
export async function replay(base = root, options: InspectionOptions = {}) {
  const rows: any[] = []
  for (const id of await readdir(path.join(base, "runs")).catch(() => [])) {
    const run = path.join(base, "runs", id), attempts = (await readdir(run)).filter(a => /^attempt-\d+$/.test(a)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))
    let providerCalls = 0, unknownCalls = false, knownUsd = 0, unknownUsd = false
    const artifacts: Array<{ attempt: number; path: string }> = [], classificationCorrections: any[] = []
    for (const attempt of attempts) {
      const file = path.join(run, attempt, "report.json"), claim = await json(path.join(run, attempt, "claim.json"))
      if (!Number.isInteger(claim.attempt) || claim.attempt < 1 || claim.attempt !== Number(attempt.split("-")[1]) || claim.row?.id !== id) throw new Error(`Invalid attempt identity: ${id}/${attempt}`)
      if (!(await exists(file))) { unknownCalls = unknownUsd = true; continue }
      const retained = await json(file)
      if (JSON.stringify(retained.identity) !== JSON.stringify(claim) || claim.row.id !== id) throw new Error(`Identity mismatch: ${id}/${attempt}`)
      const report = retained.report, zero = /unknown/.test(String(report.status)) ? await inspectedZeroDispatch(path.join(run, attempt), options.inspectZeroDispatch) : undefined
      if (zero) classificationCorrections.push({ artifact: `runs/${id}/${attempt}/report.json`, verifiedStatus: zero.status, providerCalls: 0 })
      const calls = zero ? 0 : report.telemetry?.providerCalls ?? report.providerDispatches
      if (typeof calls === "number" && Number.isFinite(calls) && Number.isInteger(calls) && calls >= 0) providerCalls += calls; else unknownCalls = true
      const usd = zero ? 0 : report.telemetry?.totalActualUsd ?? report.telemetry?.costUsd ?? report.totalActualUsd
      if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) knownUsd += usd; else unknownUsd = true
      if (await exists(path.join(run, attempt, "sessions.jsonl"))) await inspectLocalInquiry(path.join(run, attempt))
      artifacts.push({ attempt: claim.attempt, path: `runs/${id}/${attempt}/report.json` })
    }
    rows.push({ id, firstAttempt: artifacts.find(a => a.attempt === 1)?.path ?? null, repairAttempts: artifacts.filter(a => a.attempt > 1).map(a => a.path), providerCalls: unknownCalls ? null : providerCalls, knownProviderCalls: providerCalls, knownUsdSubtotal: knownUsd, totalActualUsd: unknownUsd ? null : knownUsd, ...(classificationCorrections.length ? { classificationCorrections } : {}) })
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
  await save(path.join(root, "historical-failures.json"), {
    "schemaVersion": "authorization-ar-historical-failures/v2",
    "historicalRoot": "../authorization-domain-execution-v1",
    "actualHistoricalCases": 6,
    "deterministicCases": 1,
    "evidence": [
      {
        "category": "schema/wire",
        "kind": "wrong-schema-type",
        "artifact": "shared-revision.json",
        "rawArtifact": "runs/quality-memos-share-M-E/sessions/2026-10-01T123634031Z-fdb122d2/run.json",
        "provenance": "actual-retained-response",
        "pointers": [
          "/requests/1/params/tools/0/inputSchema/anyOf/0/properties/controlDelta/properties/rules/items/properties/key/type",
          "/attempts/1/response/toolCalls/0/arguments/controlDelta/rules/0/key",
          "/attempts/3/response/toolCalls/0/arguments/controlDelta/rules/0/key",
          "/error"
        ],
        "interpretation": "Advertised refined string key was an object in request 2; the response used object keys. A later response used string keys but resource/bindingKey types were still invalid. Attempt numbers refer to raw provider attempts, not logical fallbacks."
      },
      {
        "category": "schema/wire",
        "kind": "delta-controlDelta",
        "artifact": "evaluator/packets/packet-ca9b6db6c09a.json",
        "rawArtifact": "runs/ablation-owui-ingestion-checks-off/sessions/2026-10-01T141707005Z-754f2ed2/run.json",
        "provenance": "actual-retained-response",
        "pointers": [
          "/requests/6/params/tools/0/inputSchema/anyOf/2/properties",
          "/attempts/6/response/toolCalls/0/arguments",
          "/error"
        ],
        "interpretation": "Provider attempt 7 submitted kind:control with controlDelta while that control branch advertised delta; retained error includes missing delta and unrecognized fields."
      },
      {
        "category": "schema/wire",
        "kind": "source-premise-binding-confusion",
        "artifact": "runs/native-cloudflare-security-audit-changed/native-trace/tools.jsonl",
        "line": 22,
        "provenance": "actual-retained-response",
        "pointers": [
          "/call/arguments/controlDelta/bindings/0"
        ],
        "interpretation": "Source-derived addressed-document owner and owner-null premise were submitted in the user bindings group without its required origin/user text contract."
      },
      {
        "category": "semantic-extraction",
        "kind": "owner-null-formal-condition-gap",
        "legacyKind": "owner-null-and-not-given",
        "artifact": "runs/revision-paperless-notes-M-E/report.json",
        "rawArtifact": "runs/revision-paperless-notes-M-E/sessions/2026-10-01T152246125Z-16805345/run.json",
        "source": "model/public-source/paperless/src/documents/permissions.py:624-635",
        "provenance": "actual-retained-response",
        "pointers": [
          "/domain/proposals/1/delta/rules",
          "/domain/proposals/2/delta/rules"
        ],
        "interpretation": "Original prose already preserves null/self/object-permission alternatives. Corresponding owner-aware and bypass rule proposals omit typed condition; this is not evidence of wrong prose or treating not-given as null."
      },
      {
        "category": "source-location",
        "kind": "unread-decisive-helper",
        "artifact": "evaluator/packets/packet-e253a7ea408c.json",
        "provenance": "actual-retained-response",
        "pointers": [
          "/final/questions/0/missing/0"
        ],
        "sourceRun": "revision-owui-ingestion-D-E",
        "interpretation": "Final explicitly leaves get_verified_user and both Files lookup implementations unread. process_file was checked and save_docs_to_vectordb was read but not incorporated; those two are not both unread."
      },
      {
        "category": "context/budget",
        "kind": "structured-source-display-budget",
        "legacyKind": "native-budget-delivery",
        "artifact": "evaluator/packets/packet-df35983b306b.json",
        "provenance": "actual-retained-response",
        "pointers": [
          "/status",
          "/error"
        ],
        "sourceRun": "quality-owui-ingestion-M-E-repeat",
        "providerCalls": 9,
        "interpretation": "Structured cumulative model source display budget exhausted; not a native final-delivery reservation case."
      },
      {
        "category": "state/checker",
        "kind": "invalid-second-check-clears-result",
        "artifact": "../../../../../src/benchmarks/authorization-dsl/inquiry-native.test.ts",
        "line": 107,
        "symbol": "a failed second check clears an earlier checked result instead of exposing stale validity",
        "provenance": "deterministic-regression-only",
        "historicalPaidOccurrence": "not-established",
        "boundedHistoricalCheck": {
          "nativeTraces": 4,
          "totalChecks": 8,
          "validChecks": 0
        },
        "interpretation": "All eight inspected original/changed native checks were invalid; no actual first-valid/second-invalid paid occurrence was established. Preserve the deterministic counterexample without fabricating a seventh historical response."
      }
    ]
  })
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
  else if (action === "evaluate") { const { evaluateStudy } = await import("./evaluate.ts"); const result = await evaluateStudy(); await save(path.join(root, "evaluation-summary.json"), result, false); console.log(JSON.stringify({ planned: result.primarySummary.denominator, reviewedFirst: result.primarySummary.reviewedFirst, descriptive: result.descriptiveRows.length, paired: result.pairedFirstAttempts.length, providerCalls: 0 })) }
  else throw new Error("Use check|develop|probe <registered-row> [repair-id original/attempt-n]|evaluate|replay")
}
