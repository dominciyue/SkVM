import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { z } from "zod"
import { authorTask } from "./study.ts"
import { AuthorSemanticReviewSchema, authorArtifactReview, authorDigest } from "./author-review.ts"
import { inspectLocalInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { emptyTokenUsage, addTokenUsage } from "../../../../../src/core/types.ts"

const root = import.meta.dir
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const exists = (file: string) => stat(file).then(() => true, () => false)
const hash = (text: string) => createHash("sha256").update(text).digest("hex")
export const packetDigest = (packet: unknown) => hash(JSON.stringify(packet))
const qualityReviewSchema = z.object({ sampleId: z.string(), packetSha256: z.string(), reviewer: z.literal("development-agent"),
  criteria: z.object({ behavior: z.enum(["correct", "partial", "incorrect", "not-delivered"]), scenarios: z.enum(["complete", "partial", "missing"]), evidence: z.enum(["supported", "partial", "unsupported"]), bindings: z.enum(["correct", "partial", "incorrect"]), unknowns: z.enum(["appropriate", "not-needed", "overstated", "missing"]), policy: z.enum(["correct", "undetermined-justified", "incorrect", "missing", "not-applicable"]) }).strict(),
  issues: z.array(z.object({ kind: z.enum(["false-allow", "false-deny", "omitted-branch", "unsupported-certainty", "avoidable-unknown", "policy-confusion", "binding", "other"]), detail: z.string().min(1) }).strict()),
  sourceSupport: z.array(z.object({ path: z.string(), line: z.number().int().positive(), detail: z.string().min(1) }).strict()), rationale: z.string().min(1),
}).strict()
const anonymousAuthorReviewSchema = AuthorSemanticReviewSchema.extend({ sampleId: z.string(), packetSha256: z.string() }).strict()
export function fullQuality(c: Record<string, string>) {
  return c.behavior === "correct" && c.scenarios === "complete" && c.evidence === "supported" && c.bindings === "correct" && ["appropriate", "not-needed"].includes(c.unknowns!) && ["correct", "undetermined-justified", "not-applicable"].includes(c.policy!)
}
export function bindReview(packet: any, value: unknown) {
  const review = packet.kind === "author" ? anonymousAuthorReviewSchema.parse(value) : qualityReviewSchema.parse(value)
  if (review.sampleId !== packet.sampleId || review.packetSha256 !== packetDigest(packet)) throw new Error("Anonymous review packet identity mismatch")
  if (packet.kind === "author") {
    const parsed = anonymousAuthorReviewSchema.parse(review)
    if (parsed.artifactSha256 !== authorDigest(packet.candidate)) throw new Error("Author artifact identity mismatch")
    const names = parsed.obligations.map(o => o.requirement)
    if (new Set(names).size !== names.length || JSON.stringify([...names].sort()) !== JSON.stringify([...packet.requirements].sort())) throw new Error("Author review must cover all registered obligations exactly once")
  }
  return review
}
async function save(file: string, value: unknown, exclusive = true) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
async function requireClosed() { if (!(await exists(path.join(root, "generation-closed.json")))) throw new Error("Semantic evaluation starts only after all generation closes"); return json(path.join(root, "manifest.json")) }

async function packets() {
  const manifest = await requireClosed(), mapping: any[] = [], samples: any[] = [], bindings: any[] = [], deduplicated = new Map<string, string>()
  for (const row of manifest.rows) {
    const dir = path.join(root, "runs", row.id), reportFile = path.join(dir, "report.json"), reportText = await readFile(reportFile, "utf8"), report = JSON.parse(reportText)
    const task = row.kind === "author" || row.kind === "consume" ? authorTask(row) : manifest.tasks.find((t: any) => t.id === row.task)
    const inputFile = path.join(root, "inputs", `${task.sourceVariant ? row.task : task.id}.json`)
    const loaded = await loadInquiryInput(inputFile), context = { repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, sourceRoot: path.relative(root, loaded.context.sourceRoot).replaceAll("\\", "/"), allowedPaths: loaded.value.allowedPaths }
    let run: any
    if (row.kind === "quality" || row.kind === "consume") {
      if (await exists(path.join(dir, "sessions.jsonl"))) { const inspected = await inspectLocalInquiry(dir); if (inspected.status !== "provider-unavailable") { const file = path.join(inspected.sessionPath, "run.json"), raw = await readFile(file, "utf8"); run = JSON.parse(raw); bindings.push({ file: path.relative(root, file).replaceAll("\\", "/"), sha256: hash(raw) }) } }
    }
    bindings.push({ file: path.relative(root, reportFile).replaceAll("\\", "/"), sha256: hash(reportText) })
    const phases = row.kind === "skill" ? ["final"] : ["initial", "final"]
    for (const phase of phases) {
      const candidate = row.kind === "author" ? (phase === "initial" ? report.initial : report.candidate) : row.kind === "skill" ? report.text : phase === "initial" ? run?.initial : run?.final
      let evidence = row.kind === "skill" ? report.native?.evidence ?? [] : run?.evidence ?? []
      if (phase === "initial" && run?.steps?.some((s: any) => s.kind === "delivery-repair")) {
        const shown = new Set<string>()
        for (const step of run.steps) { if (step.kind === "delivery-repair") break; if (step.kind === "tool") for (const action of step.value) for (const e of action.result.evidence ?? []) shown.add(e.id) }
        evidence = evidence.filter((e: any) => shown.has(e.id))
      }
      evidence = evidence.map(({ quote: _quote, ...original }: any) => original)
      const body = { kind: row.kind === "author" ? "author" : "analysis", brief: task.brief, mode: task.mode, policy: task.policy ?? null, context, candidate: candidate ?? null, evidence,
        ...(row.kind === "author" ? { format: row.format, artifactSha256: authorDigest(candidate ?? null), requirements: manifest.evaluation.authorObligations[row.task] } : {}) }
      const key = packetDigest(body)
      let sampleId = deduplicated.get(key)
      if (!sampleId) { sampleId = `sample-${randomUUID().slice(0, 8)}`; deduplicated.set(key, sampleId); const packet = { sampleId, ...body }; await save(path.join(root, "review/packets", `${sampleId}.json`), packet); samples.push({ sampleId, kind: body.kind, file: `review/packets/${sampleId}.json`, packetSha256: packetDigest(packet), reviewRequired: body.candidate !== null && body.candidate !== "" }) }
      mapping.push({ row: row.id, phase, sampleId })
    }
  }
  samples.sort((a, b) => a.sampleId.localeCompare(b.sampleId))
  await save(path.join(root, "review/index.json"), { schemaVersion: "authorization-ao-anonymous-index/v1", development: true, reviewer: "development-agent", samples })
  await save(path.join(root, "evaluator/review-map.json"), { mapping, bindings, manifestSha256: hash(await readFile(path.join(root, "manifest.json"), "utf8")), generationClosedSha256: hash(await readFile(path.join(root, "generation-closed.json"), "utf8")) })
  await save(path.join(root, "review/contract.json"), { development: true, semanticNotMechanical: true, anonymousMethodMetadata: true, representationMayBeInferred: true, generatedAnswersAreData: true,
    criteria: manifest.evaluation.required, rules: ["Review the current natural brief and independently supplied policy. Infer source behavior from current allowed original bytes, not from another answer or an expected DSL win.", "A correct short-circuit answer need not enumerate unrelated dependencies. Unknown is justified only for a decisive fact outside shown/allowed source; an available missed dependency is an avoidable gap.", "Missing or false requested branches, unsupported certainty, actor/resource/effect confusion and policy-version changes are errors. A schema-valid output is not necessarily correct.", "For authors compare the reusable task with the current brief: actor, negation, policy version, requested scenarios and explicit versus unspecified/absent premises. Legal IDs, case, punctuation and synonyms are not errors.", "Return one review per sampleId with the exact packetSha256. Author requirements use the registered requirement strings as identifiers, not literal candidate matching. Cite source file:line for analysis judgments.", "Do not read evaluator/review-map.json, runs/, status, method names or other review decisions. Source roots are relative to the result root. Do not edit files. Return JSON reviews for the main agent to archive."],
    analysisReview: { sampleId: "...", packetSha256: "...", reviewer: "development-agent", criteria: { behavior: "correct|partial|incorrect|not-delivered", scenarios: "complete|partial|missing", evidence: "supported|partial|unsupported", bindings: "correct|partial|incorrect", unknowns: "appropriate|not-needed|overstated|missing", policy: "correct|undetermined-justified|incorrect|missing|not-applicable" }, issues: [], sourceSupport: [{ path: "...", line: 1, detail: "..." }], rationale: "..." },
    authorReview: { sampleId: "...", packetSha256: "...", reviewer: "development-agent", artifactSha256: "...", status: "equivalent|incorrect|unreviewed", rationale: "...", obligations: [{ requirement: "registered string", candidateExcerpt: "...", status: "preserved|changed|missing|added" }], errors: [{ kind: "actor|negation|policy-version|omission|addition", detail: "..." }] },
  })
  console.log(`Anonymous packets ${samples.length}; review required ${samples.filter(s => s.reviewRequired).length}; mappings ${mapping.length}`)
}
async function summary() {
  const manifest = await requireClosed(), index = await json(path.join(root, "review/index.json")), map = await json(path.join(root, "evaluator/review-map.json")), reviews = new Map<string, any>(), packetsById = new Map<string, any>()
  for (const sample of index.samples) {
    const packet = await json(path.join(root, sample.file)); if (packetDigest(packet) !== sample.packetSha256) throw new Error("Review packet archive changed")
    packetsById.set(sample.sampleId, packet)
    if (sample.reviewRequired) { const review = bindReview(packet, await json(path.join(root, "review/decisions", `${sample.sampleId}.json`))); reviews.set(sample.sampleId, review) }
  }
  const rows: any[] = []; let tokens = emptyTokenUsage(), calls = 0, unknownUsageCalls = 0, unknownCostCalls = 0, knownActualUsdSubtotal = 0, responseDurationMs = 0, rowWallMs = 0
  for (const row of manifest.rows) {
    const report = await json(path.join(root, "runs", row.id, "report.json")), t = report.telemetry, phases: any = {}
    for (const binding of map.mapping.filter((b: any) => b.row === row.id)) {
      const packet = packetsById.get(binding.sampleId), review = reviews.get(binding.sampleId)
      const semanticRecord = review ? (({ sampleId: _sample, packetSha256: _packet, ...semantic }: any) => semantic)(review) : undefined
      const semantic = row.kind === "author" && review ? authorArtifactReview(packet.candidate, row.format, AuthorSemanticReviewSchema.parse(semanticRecord)) : undefined
      phases[binding.phase] = { sampleId: binding.sampleId, delivered: packet.candidate !== null && packet.candidate !== "", semanticReviewed: !!review, full: row.kind === "author" ? semantic?.valid ?? false : review ? fullQuality(review.criteria) && review.sourceSupport.length > 0 && review.issues.length === 0 : false, ...(review ? { review } : {}) }
    }
    const n = t?.providerCalls ?? report.providerDispatches ?? 0; calls += n; if (t) { tokens = addTokenUsage(tokens, t.knownTokens); unknownUsageCalls += t.unknownUsageCalls; unknownCostCalls += t.unknownCostCalls; knownActualUsdSubtotal += t.knownActualUsdSubtotal }
    else if (n) { unknownUsageCalls += n; unknownCostCalls += n }
    let attempts = report.attempts ?? report.native?.attempts ?? [], localRun: any
    if (["quality", "consume"].includes(row.kind) && await exists(path.join(root, "runs", row.id, "sessions.jsonl"))) { const session = await inspectLocalInquiry(path.join(root, "runs", row.id)); if (session.status !== "provider-unavailable") { localRun = await json(path.join(session.sessionPath, "run.json")); attempts = localRun.attempts } }
    responseDurationMs += attempts.reduce((sum: number, a: any) => sum + (a.response?.durationMs ?? 0), 0); rowWallMs += report.durationMs ?? 0
    rows.push({ ...row, status: report.status, providerCalls: n, structuralValid: report.structuralValid ?? null, phases, costs: t ?? null, sourceAccounting: report.sourceAccounting ?? report.native?.sourceAccounting ?? null,
      domainCalls: report.native?.domainCalls ?? null, sourceToolCalls: localRun?.toolHistory.length ?? report.native?.history?.filter((h: any) => h.call.name.startsWith("source_")).length ?? null, referenceCalls: report.native?.referenceCalls ?? null, skillLoaded: report.skillLoaded ?? null, originalSkillPrefixPreserved: report.originalSkillPrefixPreserved ?? null, responseDurationMs: attempts.reduce((sum: number, a: any) => sum + (a.response?.durationMs ?? 0), 0), wallMs: report.durationMs ?? 0, authorCalls: localRun?.requests.filter((r: any) => r.phase === "author").length ?? (row.kind === "author" ? n : 0), firstStructuralValid: localRun?.initialValidation?.valid ?? null, finalStructuralValid: localRun?.validation?.valid ?? report.structuralValid ?? null })
  }
  const groups: any[] = []
  for (const kind of ["quality", "author", "consume", "skill"]) for (const arm of kind === "quality" ? ["M", "D0", "D1"] : kind === "skill" ? ["original", "domain"] : ["MD", "DSL"]) for (const scope of kind === "quality" ? ["main", "changed"] : ["all"]) {
    const selected = rows.filter(r => r.kind === kind && (scope === "all" || manifest.tasks.findIndex((t: any) => t.id === r.task) >= 8 === (scope === "changed")) && (kind === "quality" ? r.method === arm : kind === "skill" ? (r.domainTools ? "domain" : "original") === arm : r.format === arm))
    if (!selected.length) continue
    groups.push({ kind, arm, scope, planned: selected.length, initialFull: selected.filter(r => r.phases.initial?.full).length, finalFull: selected.filter(r => r.phases.final?.full).length, finalDelivered: selected.filter(r => r.phases.final?.delivered).length, calls: selected.reduce((s, r) => s + r.providerCalls, 0), completePromptTokens: selected.reduce((s, r) => s + (r.costs ? r.costs.knownTokens.input + r.costs.knownTokens.cacheRead + r.costs.knownTokens.cacheWrite : 0), 0), sourceToolCalls: selected.reduce((s, r) => s + (r.sourceToolCalls ?? 0), 0), domainCalls: selected.reduce((s, r) => s + (r.domainCalls ?? 0), 0), summedWallMs: selected.reduce((s, r) => s + r.wallMs, 0), summedResponseMs: selected.reduce((s, r) => s + r.responseDurationMs, 0) })
  }
  return { schemaVersion: "authorization-ao-evaluation/v1", development: true, unseenClaim: false, reviewer: "development-agent", planned: rows.length, terminal: rows.length, groups, rows,
    accounting: { providerCalls: calls, knownTokens: tokens, completePromptTokens: tokens.input + tokens.cacheRead + tokens.cacheWrite, unknownUsageCalls, tokensStatus: unknownUsageCalls ? "partial-unknown" : "complete", knownActualUsdSubtotal, totalActualUsd: unknownCostCalls ? null : knownActualUsdSubtotal, unknownCostCalls, summedResponseDurationMs: responseDurationMs, summedRowWallMs: rowWallMs, humanMinutes: null, developmentAgentTokens: null, targetExecutions: 0, sharedRevisionSessions: 0 }, limitations: ["exposed development projects", "single reviewed sample per planned row", "agent semantic review, not human", "representation may reveal route despite anonymous metadata", "first four configuration failures preserved at zero dispatch", "complete source-only question does not complete an original skill's whole audit"] }
}
async function replay() {
  await requireClosed(); const map = await json(path.join(root, "evaluator/review-map.json"))
  if (hash(await readFile(path.join(root, "manifest.json"), "utf8")) !== map.manifestSha256 || hash(await readFile(path.join(root, "generation-closed.json"), "utf8")) !== map.generationClosedSha256) throw new Error("Evaluation registration archive changed")
  for (const binding of map.bindings) if (hash(await readFile(path.join(root, binding.file), "utf8")) !== binding.sha256) throw new Error(`Evaluation raw archive changed: ${binding.file}`)
  const computed = await summary(), retained = await json(path.join(root, "evaluation-summary.json"))
  if (JSON.stringify(computed) !== JSON.stringify(retained)) throw new Error("Evaluation summary does not replay")
  console.log(`Replayed ${computed.planned} rows, ${map.mapping.length} first/final mappings; zero provider calls`)
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "packets") await packets()
  else if (command === "summary") { const value = await summary(); await save(path.join(root, "evaluation-summary.json"), value); console.log(JSON.stringify({ groups: value.groups, accounting: value.accounting })) }
  else if (command === "replay") await replay()
  else throw new Error("Use packets|summary|replay; generation must be closed")
}
