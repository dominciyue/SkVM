import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { root, json, save, hash, exists } from "./common.ts"
const mode = process.argv[2]
if (!["packets", "evaluate", "replay"].includes(mode ?? "")) throw new Error("Usage: bun evaluate-author-use.ts packets|evaluate|replay (zero provider)")
const configBytes = await readFile(path.join(root, "author-use-config.json")), config = JSON.parse(configBytes.toString("utf8")), configSha256 = hash(configBytes)
const replay = await json(path.join(root, "author-use-replay.json")), authors = await json(path.join(root, "author-summary.json")), briefs = await json(path.join(root, "author-briefs.json"))
if (replay.configSha256 !== configSha256 || replay.terminal !== 8 || replay.plannedScenarios !== 16) throw new Error("All author-use units must close before review")
if (mode === "packets") {
  const map: Record<string, any> = {}, groups: Record<string, any[]> = {}
  for (const unit of config.units) {
    const b = briefs.packages.find((p: any) => p.id === unit.packageId), stored = await json(path.join(root, "author-runs", unit.id, "unit.json")), report = stored.report
    if (stored.configSha256 !== configSha256) throw new Error("Author-use identity changed")
    const session = path.join(root, "author-runs", unit.id, "sessions", report.sessionId), run = await json(path.join(session, "run.json")), bundle = await json(path.join(session, "source-bundle.json"))
    const materialId = `m-${hash(JSON.stringify(bundle)).slice(0, 12)}`, materialPath = `evaluator/materials/${materialId}.txt`
    if (!await exists(path.join(root, materialPath))) { await save(path.join(root, "evaluator", "materials", `${materialId}.json`), bundle, true); await writeFile(path.join(root, materialPath), renderSourceBundle(bundle), { encoding: "utf8", flag: "wx" }) }
    const anonymousId = `a-${hash(`${configSha256}:${unit.id}`).slice(0, 12)}`, author = authors.rows.find((r: any) => r.id === unit.id)
    const firstAuthor = await json(path.join(root, "author-attempts", `${unit.id}.first.json`)), finalAuthor = await json(path.join(root, "author-attempts", `${unit.id}.${author.selectedAttempt}.json`))
    const expected = b.kind === "policy-change" ? { "self-leave": "allow", "other-member": "deny" } : unit.phase === "changed" ? { "view-only": "deny", "change-granted": "deny" } : { "view-only": "deny", "change-granted": "allow" }
    const packet = { anonymousId, packageId: b.id, phase: unit.phase, materialPath, status: report.status, brief: b, scope: unit.scope,
      sourceRule: "Supplied source and exact task premises only. Original sources immutable; Paperless changed bytes are explicitly synthetic.", expectedSourceDecisions: expected,
      first: { deliveryComplete: run.firstResponse?.deliveryComplete ?? false, canonicalResult: run.initial?.result ?? null, wireResult: run.initial?.wireResult ?? run.initialTransport?.wireResult ?? null },
      final: { canonicalResult: report.canonicalResult, wireResult: report.wireResult, observedDecisions: report.observedDecisions },
      firstAuthor: { text: firstAuthor.response?.text, deterministicValid: author.firstValid, diagnostics: author.firstDiagnostics }, finalAuthor: { text: finalAuthor.response?.text, deterministicValid: author.status === "valid", selectedAttempt: author.selectedAttempt },
      reviewQuestions: ["Rate each of the two declared scenarios full|partial|incorrect using actual source, policy expectation and v6/canonical label consistency", "Are final author instructions faithful to this brief, without filled source answers or extra analysis entries?", "Did policy/source changes preserve unrelated task fields and force fresh analysis?", "Keep first author failures and two extra diagnostic corrections separate from final usability"] }
    const bytes = `${JSON.stringify(packet, null, 2)}\n`
    await save(path.join(root, "evaluator", "author-packets", `${anonymousId}.json`), packet, true)
    map[anonymousId] = { unitId: unit.id, packageId: unit.packageId, representation: unit.representation, phase: unit.phase, packetSha256: hash(bytes) }
    ;(groups[b.kind === "policy-change" ? "memos-member-leave" : "paperless-note-post"] ??= []).push({ anonymousId, packet: `evaluator/author-packets/${anonymousId}.json`, materialPath })
  }
  await save(path.join(root, "evaluator", "author-review-map.json"), { configSha256, map }, true)
  const reviewGroups = await json(path.join(root, "evaluator", "review-groups.json"))
  await save(path.join(root, "evaluator", "review-groups.json"), { ...reviewGroups, authorCaseGroups: groups })
  process.stdout.write("Eight anonymous author-use packets created; zero provider calls.\n")
} else {
  const reviewMap = await json(path.join(root, "evaluator", "author-review-map.json")), reviews = await json(path.join(root, "evaluator", "author-reviews.json"))
  if (reviewMap.configSha256 !== configSha256 || Object.keys(reviews.ratings).length !== 8) throw new Error("Author review identity/denominator changed")
  const rows = []
  for (const [id, binding] of Object.entries(reviewMap.map) as Array<[string, any]>) {
    const bytes = await readFile(path.join(root, "evaluator", "author-packets", `${id}.json`)), packet = JSON.parse(bytes.toString("utf8")), score = reviews.ratings[id], usage = replay.rows.find((r: any) => r.id === binding.unitId)
    if (hash(bytes) !== binding.packetSha256 || !score || Object.keys(score.scenarios ?? {}).length !== 2 || !usage) throw new Error(`Author review changed ${id}`)
    rows.push({ ...binding, anonymousId: id, status: packet.status, firstDeliveryComplete: packet.first.deliveryComplete, scope: packet.scope, review: score, usage })
  }
  rows.sort((a, b) => config.units.findIndex((u: any) => u.id === a.unitId) - config.units.findIndex((u: any) => u.id === b.unitId))
  const summary = { schemaVersion: "authorization-ak-author-use-summary/v1", configSha256, plannedSessions: 8, completedSessions: rows.filter(r => r.status === "completed").length, declaredScenarios: 16, expandedObligations: rows.reduce((n, r) => n + r.scope.expandedObligations, 0),
    firstDeliveryComplete: rows.filter(r => r.firstDeliveryComplete).length,
    firstFullScenarios: rows.reduce((n, r) => n + Object.values(r.review.scenarios).filter((s: any) => r.firstDeliveryComplete && s.firstRating === "full").length, 0),
    fullScenarios: rows.reduce((n, r) => n + Object.values(r.review.scenarios).filter((s: any) => s.rating === "full").length, 0), finalAuthorsFaithful: rows.filter(r => r.review.finalAuthorFaithful).length,
    sensitivity: reviews.sensitivity,
    authors: { firstValid: authors.firstValid, finalValid: authors.finalValid, revisions: authors.revisions, diagnosticCorrections: authors.diagnosticCorrections, protocolDeviation: authors.protocolDeviation, usage: authors.usage },
    consumerUsage: replay.usage, compare: rows.filter(r => r.phase === "changed").map(r => ({ unitId: r.unitId, status: r.usage.compare })), sourceReuse: replay.sourceReuse, evaluatorIdentity: reviews.evaluatorIdentity, rows, humanMinutes: null, targetExecutions: 0,
    limitations: ["Common author facts and allowed file universe are supplied", "MD consumer canonical facts are a transparent task scaffold; authored instructions remain independent", "Two original DSL attempts and their first repairs failed before an explicit host-diagnostic correction", "No measured human time or actual provider USD", "Source mutation is synthetic, not a public upstream vulnerability claim"] }
  const bytes = `${JSON.stringify(summary, null, 2)}\n`, file = path.join(root, "author-use-summary.json")
  if (mode === "replay") { if (await readFile(file, "utf8") !== bytes) throw new Error("Author-use replay differs") }
  else await save(file, summary, true)
  process.stdout.write(`${JSON.stringify({ status: mode === "replay" ? "reproduced" : "evaluated", sessions: summary.completedSessions, fullScenarios: summary.fullScenarios, expanded: summary.expandedObligations, consumerUsage: summary.consumerUsage, providerCallsThisCommand: 0 })}\n`)
}
