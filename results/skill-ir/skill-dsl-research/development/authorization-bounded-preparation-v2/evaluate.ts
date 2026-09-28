import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { root, json, save, hash, exists, aggregateUsage } from "./common.ts"

const mode = process.argv[2]
if (!["packets", "evaluate", "replay"].includes(mode ?? "")) throw new Error("Usage: bun evaluate.ts packets|evaluate|replay (zero provider)")
const configBytes = await readFile(path.join(root, "panel-config.json")), config = JSON.parse(configBytes.toString("utf8")), configSha256 = hash(configBytes)
const replay = await json(path.join(root, "replay.json"))
if (replay.configSha256 !== configSha256 || replay.terminal !== 40) throw new Error("All 40 planned units must close before evaluation")
const briefs = await json(path.join(root, "public-briefs.json"))
if (mode === "packets") {
  const oracle = await json(path.join(root, "evaluator", "oracle.json")), map: Record<string, any> = {}, accounts = [], groups: Record<string, any[]> = {}
  for (const unit of config.units) {
    const outRoot = path.join(root, "runs", unit.id), stored = await json(path.join(outRoot, "unit.json")), report = stored.report
    if (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id) throw new Error(`Unit identity changed ${unit.id}`)
    const anonymousId = `r-${hash(`${configSha256}:${unit.id}`).slice(0, 12)}`
    let materialId = null, materialPath = null, run = null, sourceBundle = null, telemetry: any = { providerCalls: 0, respondedCalls: 0, unknownUsageCalls: 0, unknownCostCalls: 0, knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, totalActualUsd: 0, knownActualUsdSubtotal: 0 }
    if (report.sessionId) {
      const session = path.join(outRoot, "sessions", report.sessionId)
      run = await json(path.join(session, "run.json")); sourceBundle = await json(path.join(session, "source-bundle.json"))
      materialId = `m-${hash(JSON.stringify(sourceBundle)).slice(0, 12)}`
      materialPath = `evaluator/materials/${materialId}.txt`
      if (!await exists(path.join(root, materialPath))) { await save(path.join(root, "evaluator", "materials", `${materialId}.json`), sourceBundle, true); await writeFile(path.join(root, materialPath), renderSourceBundle(sourceBundle), { encoding: "utf8", flag: "wx" }) }
      const eventsPath = path.join(session, "events.jsonl")
      const events = await exists(eventsPath) ? (await readFile(eventsPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : run.events ?? []
      telemetry = summarizeAuthorizationAttempts(reconcileAuthorizationAttemptsFromEvents(run.attempts ?? [], events))
    }
    const first = run ? { deliveryComplete: run.firstResponse?.deliveryComplete ?? false, canonicalResult: run.initial?.result ?? null, wireResult: run.initial?.wireResult ?? run.initialTransport?.wireResult ?? null, observedDecisions: run.initial?.observedDecisions ?? null, validation: run.initial?.validation ?? run.initialTransport?.normalization?.validation ?? null } : null
    const final = { canonicalResult: report.canonicalResult ?? null, wireResult: report.wireResult ?? null, observedDecisions: report.observedDecisions ?? null }
    const packet = { schemaVersion: "authorization-ak-review-packet/v1", anonymousId, caseId: unit.caseId, status: report.status, publicInstruction: briefs.commonInstruction, publicBrief: briefs.cases.find((c: any) => c.id === unit.caseId), materialId, materialPath,
      first, final, finalKind: run?.finalKind ?? null, sourceScope: "Only actually supplied fixed source is evidence. No target execution. Unknown external facts remain unknown.", rubric: oracle.cases.find((c: any) => c.id === unit.caseId), materialRule: oracle.materialRule }
    const bytes = `${JSON.stringify(packet, null, 2)}\n`
    await save(path.join(root, "evaluator", "packets", `${anonymousId}.json`), packet, true)
    map[anonymousId] = { ...unit, packetSha256: hash(bytes), answerSha256: hash(JSON.stringify({ first, final })), materialId }
    ;(groups[unit.caseId] ??= []).push({ anonymousId, packet: `evaluator/packets/${anonymousId}.json`, materialPath })
    accounts.push({ ...unit, status: report.status, finalKind: run?.finalKind ?? null, firstResponse: run?.firstResponse ?? null, ...telemetry,
      fallbackCalls: (run?.attempts ?? []).filter((a: any) => a.transport === "prompt-parse").length, repairCalls: (run?.attempts ?? []).filter((a: any) => a.phase === "domain-repair").length,
      knownDurationMs: (run?.attempts ?? []).reduce((n: number, a: any) => n + (a.response?.durationMs ?? 0), 0), promptCharacters: report.promptCharacters ?? null })
  }
  await save(path.join(root, "evaluator", "review-map.json"), { configSha256, generatedAfterAllUnitsClosed: true, map }, true)
  await save(path.join(root, "evaluator", "review-groups.json"), { evaluatorIdentity: "Independent read-only development-agent scouts; no human timing claim", caseGroups: groups, instructions: "Read each unique material once, then anonymous first/final answers. Judge behavior, labels, decisive object-bound evidence and completeness. Use the original policy/conditions but actual retained source, not an old crop assumption. Return every anonymous ID with firstRating/finalRating full|partial|incorrect|blocked, conclusion correct|incorrect|not-applicable, behavior correct|justified-unknown|over-abstention|unsupported-certainty|incorrect|not-applicable, evidenceBinding correct|incomplete|incorrect|not-applicable, concise reasons and source file:line. No edits or provider calls. For blocked units return blocked; do not remove their denominator. A correct narrative paired with a wrong canonical label is not full." }, true)
  await save(path.join(root, "generation-account.json"), { schemaVersion: "authorization-ak-generation-account/v1", configSha256, planned: 40, usage: aggregateUsage(accounts), rows: accounts }, true)
  process.stdout.write(`${JSON.stringify({ packets: 40, materialFiles: new Set(accounts.filter(a => a.status !== "preparation-blocked").map(a => `${a.caseId}/${a.material}`)).size, usage: aggregateUsage(accounts), providerCallsThisCommand: 0 })}\n`)
} else {
  const reviewMap = await json(path.join(root, "evaluator", "review-map.json")), reviews = await json(path.join(root, "evaluator", "reviews.json")), account = await json(path.join(root, "generation-account.json"))
  if (reviewMap.configSha256 !== configSha256 || account.configSha256 !== configSha256 || Object.keys(reviews.ratings).length !== 40) throw new Error("Review/account identity or coverage changed")
  const rows: any[] = []
  for (const [id, binding] of Object.entries(reviewMap.map) as Array<[string, any]>) {
    const packetBytes = await readFile(path.join(root, "evaluator", "packets", `${id}.json`)), packet = JSON.parse(packetBytes.toString("utf8")), rating = reviews.ratings[id]
    if (hash(packetBytes) !== binding.packetSha256 || hash(JSON.stringify({ first: packet.first, final: packet.final })) !== binding.answerSha256 || !rating) throw new Error(`Review packet changed ${id}`)
    if (!["full", "partial", "incorrect", "blocked"].includes(rating.finalRating) || !["full", "partial", "incorrect", "blocked"].includes(rating.firstRating)) throw new Error(`Invalid rating ${id}`)
    const usage = account.rows.find((r: any) => r.id === binding.id)
    if (!usage) throw new Error(`Missing account ${id}`)
    rows.push({ ...binding, anonymousId: id, status: packet.status, firstDeliveryComplete: packet.first?.deliveryComplete ?? false, firstFull: packet.first?.deliveryComplete && rating.firstRating === "full" || false, finalFull: rating.finalRating === "full", conclusionCorrect: rating.conclusion === "correct", review: rating, usage })
  }
  rows.sort((a, b) => config.units.findIndex((u: any) => u.id === a.id) - config.units.findIndex((u: any) => u.id === b.id))
  const aggregate = (selected: any[]) => ({ planned: selected.length, completed: selected.filter(r => r.status === "completed").length, preparationBlocked: selected.filter(r => r.status === "preparation-blocked").length,
    firstDeliveryComplete: selected.filter(r => r.firstDeliveryComplete).length, firstFull: selected.filter(r => r.firstFull).length, finalFull: selected.filter(r => r.finalFull).length, conclusionCorrect: selected.filter(r => r.conclusionCorrect).length, justifiedUnknown: selected.filter(r => r.review.behavior === "justified-unknown").length,
    usage: aggregateUsage(selected.map(r => r.usage)), fallbackCalls: selected.reduce((n, r) => n + r.usage.fallbackCalls, 0), repairCalls: selected.reduce((n, r) => n + r.usage.repairCalls, 0) })
  const groups: Record<string, unknown> = {}
  for (const phase of ["initial", "repeat"]) for (const arm of ["M0", "D0", "M1", "D1"]) groups[`${phase}/${arm}`] = aggregate(rows.filter(r => r.phase === phase && r.arm === arm))
  const paired = []
  for (const phase of ["initial", "repeat"]) for (const [base, candidate] of [["M0", "M1"], ["D0", "D1"], ["M0", "D0"], ["M1", "D1"]]) {
    const ids = [...new Set(rows.filter(r => r.phase === phase).map(r => r.caseId))]
    const pairs = ids.map(id => ({ id, base: rows.find(r => r.phase === phase && r.arm === base && r.caseId === id)!, candidate: rows.find(r => r.phase === phase && r.arm === candidate && r.caseId === id)! }))
    paired.push({ phase, base, candidate, registeredPairs: pairs.length, completedPairs: pairs.filter(p => p.base.status === "completed" && p.candidate.status === "completed").length, baseFull: pairs.filter(p => p.base.finalFull).length, candidateFull: pairs.filter(p => p.candidate.finalFull).length, improvements: pairs.filter(p => !p.base.finalFull && p.candidate.finalFull).map(p => p.id), regressions: pairs.filter(p => p.base.finalFull && !p.candidate.finalFull).map(p => p.id) })
  }
  const summary = { schemaVersion: "authorization-ak-panel-summary/v1", configSha256, primary: aggregate(rows), groups, paired, rows, evaluatorIdentity: reviews.evaluatorIdentity, sensitivity: reviews.sensitivity ?? [], sharedRevision: { status: "not-needed", reason: "No deterministic shared-contract defect established by semantic evaluation; no score-driven retries" },
    limits: ["Exposed public-development tasks and author-provided allowlists", "Automatic preparation failures remain in the planned denominator", "Same-request packing and end-to-end automatic preparation are distinct contrasts", "Ready and citation presence do not establish semantic correctness", "Actual USD, transport attempts and human minutes are unknown where not observed"], targetExecutions: 0 }
  const bytes = `${JSON.stringify(summary, null, 2)}\n`, file = path.join(root, "panel-summary.json")
  if (mode === "replay") { if (await readFile(file, "utf8") !== bytes) throw new Error("Evaluation replay differs") }
  else await save(file, summary, true)
  process.stdout.write(`${JSON.stringify({ status: mode === "replay" ? "reproduced" : "evaluated", primary: summary.primary, groups, providerCallsThisCommand: 0 })}\n`)
}
