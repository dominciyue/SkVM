import { readFile } from "node:fs/promises"
import path from "node:path"
import { RatingSchema, summarizeRatings, ratingRules } from "./protocol.ts"
import { root, absolute, bind, exists, hash, json, save, verifyStudy, verify, aggregateUsage } from "./common.ts"

const mode = process.argv[2]
if (!["packets", "replay"].includes(mode ?? "")) throw new Error("Usage: evaluate.ts packets|replay (zero provider)")
const plan = await verifyStudy()
if (!await exists(path.join(root, "generation-closed.json"))) throw new Error("Evaluation must wait for closed generation")
if (mode === "packets") {
  await verify([plan.evaluation.oracleBinding])
  const mapping: any[] = [], packets: any[] = [], authorPackets: any[] = []
  const material = async (dir: string, id: string, type: string) => {
    const blindId = "p" + hash("AM-fixed-blind-v1:" + id).slice(0, 10), file = path.join(dir, "report.json")
    const report = await exists(file) ? await json(file) : { status: "not-dispatched-or-unknown" }
    let task: any = null, sourceBundle: any = null, run: any = null
    if (report.sessionPath) {
      task = await json(path.join(report.sessionPath, "task.json")); sourceBundle = await json(path.join(report.sessionPath, "source-bundle.json"))
      if (await exists(path.join(report.sessionPath, "run.json"))) run = await json(path.join(report.sessionPath, "run.json"))
    }
    const first = run?.attempts?.find((a: any) => a.phase === "initial")
    const packet = { blindId, type, task, sourceBundle, status: report.status,
      first: first ? { status: first.status, schemaValidation: first.schemaValidation, delivery: run.firstResponse,
        domainDiagnostics: run.initial?.validation?.diagnostics, response: first.response } : null,
      final: { canonicalResult: report.canonicalResult, requestedBranchAnalysis: report.requestedBranchAnalysis, observedDecisions: report.observedDecisions, coverageValidation: report.coverageValidation, requestedBranchValidation: report.requestedBranchValidation, finalKind: report.finalKind, error: report.error },
      pendingGaps: report.evidencePreparation?.gaps ?? [], fixedSourceRefs: plan.cases.filter((c: any) => c.id === report.unit?.caseId).flatMap((c: any) => c.sourceFiles),
      declaredObligations: type === "consumer" ? 2 : null }
    mapping.push({ blindId, id, type, sourceRecord: await exists(file) ? await bind(file) : null })
    return packet
  }
  for (const unit of plan.units) packets.push(await material(path.join(root, "quality", unit.id), unit.id, "quality"))
  const revisionFile = path.join(root, "shared-revision", "registration.json")
  if (await exists(revisionFile)) for (const id of (await json(revisionFile)).analysisRows) packets.push(await material(path.join(root, "shared-revision", "quality", id), "r-" + id, "quality-revision"))
  for (const unit of plan.consumers) {
    const packet = await material(path.join(root, "consumers", unit.id), unit.id, "consumer")
    packet.fixedSourceRefs = plan.authorSourceFiles.filter((b: any) => b.path.includes(unit.packageId.startsWith("memos") ? "/memos/" : "/paperless/"))
    if (!packet.task) packet.task = { publicBrief: (await json(absolute(plan.authorBriefs))).packages.find((p: any) => p.id === unit.packageId), variant: unit.variant }
    packets.push(packet)
  }
  const briefs = await json(absolute(plan.authorBriefs))
  for (const unit of plan.authors) {
    const dir = path.join(root, "authors", unit.packageId, unit.arm, unit.variant), blindId = "a" + hash("AM-author-blind-v1:" + unit.id).slice(0, 10)
    const packet: any = { blindId, publicBrief: briefs.packages.find((b: any) => b.id === unit.packageId), variant: unit.variant, representation: unit.arm,
      delivery: await exists(path.join(dir, "delivery.json")) ? await json(path.join(dir, "delivery.json")) : { status: "not-dispatched-or-unknown", firstValid: false, finalValid: false } }
    delete packet.delivery.unit
    for (const kind of ["first", "revision"]) if (await exists(path.join(dir, kind + ".response.json"))) packet[kind] = { response: await json(path.join(dir, kind + ".response.json")), diagnostics: await json(path.join(dir, kind + ".checked.json")) }
    authorPackets.push(packet); mapping.push({ blindId, id: unit.id, type: "author" })
  }
  // Pairing and material arm remain only in the mapping; reviewers get source and public premises.
  for (let group = 0; group < 4; group++) {
    await save(path.join(root, "evaluation", `packets-${group + 1}.json`), { schemaVersion: "authorization-am-review-packet/v1", group: group + 1, ratingRules,
      oracle: plan.evaluation.oracleBinding, authorBriefs: plan.authorBriefs,
      instructions: "Read fixed public source anchors and assess first/final independently. Return RatingSchema rows using blindId; consumer rows use blindId:scenario-key for both declared scenarios. first.delivery.deliveryComplete=false records no valid delivered first analysis and is blocked under the registered rule, regardless of raw text. Accurate unknown is not automatically resolved. Author judgments are independent of consumer correctness. Cite file:line and key text for unsupported/incomplete claims. No edits, execution, model calls or resampling.",
      answers: packets.filter((_, i) => i % 4 === group), authors: authorPackets.filter((_, i) => i % 4 === group) }, true)
  }
  await save(path.join(root, "evaluation", "blind-mapping.json"), mapping, true)
  console.log(JSON.stringify({ answerPackets: packets.length, authorPackets: authorPackets.length, groups: 4, providerCalls: 0 }))
} else {
  const ratings = (await json(path.join(root, "evaluation", "ratings.json"))).map((r: unknown) => RatingSchema.parse(r))
  const expectedQuality = plan.units.map((u: any) => u.id)
  const revisionFile = path.join(root, "shared-revision", "registration.json")
  const expectedRevision = await exists(revisionFile) ? (await json(revisionFile)).analysisRows.map((id: string) => "r-" + id) : []
  const briefs = await json(absolute(plan.authorBriefs))
  const expectedConsumers = plan.consumers.flatMap((u: any) => briefs.packages.find((b: any) => b.id === u.packageId).scenarios.map((s: any) => `${u.id}:${s.key}`))
  for (const phase of ["first", "final"]) {
    const expected = [...expectedQuality, ...expectedRevision, ...expectedConsumers].sort(), actual = ratings.filter((r: any) => r.phase === phase).map((r: any) => r.id).sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Rating denominator mismatch " + phase)
  }
  const authorRatings = await json(path.join(root, "evaluation", "author-ratings.json"))
  if (JSON.stringify(authorRatings.map((r: any) => r.id).sort()) !== JSON.stringify(plan.authors.map((u: any) => u.id).sort())) throw new Error("Author denominator mismatch")
  const quality = Object.fromEntries(["first", "final"].map(phase => [phase, summarizeRatings(ratings.filter((r: any) => r.phase === phase && expectedQuality.includes(r.id)))]))
  const consumers = Object.fromEntries(["first", "final"].map(phase => [phase, summarizeRatings(ratings.filter((r: any) => r.phase === phase && expectedConsumers.includes(r.id)))]))
  const revision = Object.fromEntries(["first", "final"].map(phase => [phase, summarizeRatings(ratings.filter((r: any) => r.phase === phase && expectedRevision.includes(r.id)))]))
  const paired = plan.primaryIds.map((caseId: string) => ({ caseId, rows: plan.units.filter((u: any) => u.caseId === caseId).map((u: any) => ({ ...u, first: ratings.find((r: any) => r.id === u.id && r.phase === "first"), final: ratings.find((r: any) => r.id === u.id && r.phase === "final") })) }))
  const state = await json(path.join(root, "status.json"))
  const usage = aggregateUsage(state.paidRows.map((r: any) => r.account))
  const authors = { planned: 8, firstSemanticValid: authorRatings.filter((r: any) => r.first === "valid").length, finalSemanticValid: authorRatings.filter((r: any) => r.final === "valid").length, rows: authorRatings }
  const summary = { schemaVersion: "authorization-am-summary/v1", quality, consumers, authors, paired, usage, ratingsSha256: hash(await readFile(path.join(root, "evaluation", "ratings.json"))), authorRatingsSha256: hash(await readFile(path.join(root, "evaluation", "author-ratings.json"))), generationClosed: true, providerCallsThisCommand: 0, targetExecutions: 0, actualUsd: usage.totalActualUsd, humanMinutes: null }
  await save(path.join(root, "summary.json"), { ...summary, revision })
  console.log(JSON.stringify({ quality, consumers, authors: { ...authors, rows: undefined }, usage, providerCallsThisCommand: 0 }))
}
