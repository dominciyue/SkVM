import { readFile } from "node:fs/promises"
import path from "node:path"
import { aggregateUsage, exists, hash, json, root, save, verifyPlan } from "./common.ts"
import { assertPacketArchiveBound, summarizeReviewedRows, type Rating, type ReviewedRow } from "./evaluation-core.ts"

const mode = process.argv[2]
if (!["packets", "evaluate", "replay"].includes(mode ?? "")) throw new Error("Usage: evaluate.ts packets|evaluate|replay (zero provider)")
const plan = await verifyPlan()
const closed = await json(path.join(root, "generation-closed.json"))
if (closed.missing.length || !closed.noAdditionalGeneration || closed.targetExecutions !== 0) throw new Error("AN generation is not fully closed")
const units = [
  ...plan.quality.map((row: any) => ({ id: `quality:${row.id}`, kind: "quality", row })),
  ...plan.consumers.map((row: any) => ({ id: `consumer:${row.id}`, kind: "consumers", row })),
]
if (units.length !== 28 || plan.quality.length !== 16 || plan.authors.length !== 12 || plan.consumers.length !== 12) throw new Error("AN registered denominator changed")

async function archivePacket(unit: any) {
  const directory = path.join(root, unit.kind, unit.row.id)
  const reportFile = path.join(directory, "report.json")
  const reportBytes = await readFile(reportFile)
  const report = JSON.parse(reportBytes.toString("utf8"))
  let run: any = null, runSha256: string | null = null
  if (report.sessionId) {
    const runBytes = await readFile(path.join(directory, "sessions", report.sessionId, "run.json"))
    run = JSON.parse(runBytes.toString("utf8"))
    runSha256 = hash(runBytes)
  }
  const first = run ? {
    deliveryComplete: run.firstResponse?.deliveryComplete ?? false,
    canonicalResult: run.initial?.result ?? null,
    wireResult: run.initial?.wireResult ?? run.initialTransport?.wireResult ?? null,
    validation: run.initial?.validation ?? run.initialTransport?.normalization ?? null,
  } : null
  const final = report.status === "completed" ? {
    canonicalResult: report.canonicalResult ?? null,
    wireResult: report.wireResult ?? null,
    observedDecisions: report.observedDecisions ?? null,
    finalKind: report.finalKind ?? run?.finalKind ?? null,
  } : null
  return { schemaVersion: "authorization-an-review-packet/v1", id: unit.id, kind: unit.kind, row: unit.row,
    status: report.status, first, final, reportSha256: hash(reportBytes), runSha256,
    sourceScope: "Fixed supplied public source and current public task only; no target execution or source discovery claim.",
    ratingRules: plan.evaluation.ratingRules }
}

const mapFile = path.join(root, "evaluator", "review-map.json")
const accountFile = path.join(root, "evaluator", "generation-account.json")
if (mode === "packets") {
  const map: Record<string, any> = {}
  for (const unit of units) {
    const packet = await archivePacket(unit)
    const packetBytes = `${JSON.stringify(packet, null, 2)}\n`
    await save(path.join(root, "evaluator", "packets", `${unit.id.replace(":", "-")}.json`), packet, true)
    map[unit.id] = { packetSha256: hash(packetBytes), answerSha256: hash(JSON.stringify({ first: packet.first, final: packet.final })),
      reportSha256: packet.reportSha256, runSha256: packet.runSha256 }
  }
  const state = await json(path.join(root, "status.json"))
  const account = { schemaVersion: "authorization-an-generation-account/v1", paidDispatches: state.paidDispatches,
    byStage: Object.fromEntries(["quality", "author", "consumer"].map(kind => [kind, aggregateUsage(state.paidDispatches.filter((item: any) => item.id.startsWith(`${kind}:`)).map((item: any) => item.account))])),
    allPaid: aggregateUsage(state.paidDispatches.map((item: any) => item.account)), targetExecutions: 0, humanMinutes: null }
  await save(mapFile, { schemaVersion: "authorization-an-review-map/v1", planSha256: hash(await readFile(path.join(root, "study-plan.json"))),
    generatedAfterClose: true, map }, true)
  await save(accountFile, account, true)
  console.log(JSON.stringify({ packets: units.length, providerCallsThisCommand: 0, usage: account.allPaid }))
} else {
  const reviewMap = await json(mapFile), account = await json(accountFile), reviews = await json(path.join(root, "evaluator", "reviews.json"))
  if (!reviewMap.generatedAfterClose || reviewMap.planSha256 !== hash(await readFile(path.join(root, "study-plan.json"))) ||
      Object.keys(reviewMap.map).length !== 28 || Object.keys(reviews.ratings).length !== 28) throw new Error("AN review coverage or plan binding changed")
  const ratingValues = { support: ["supported", "incomplete", "unsupported", "blocked"], outcome: ["determinate", "conditional", "unresolved", "blocked"] }
  const rows: Array<ReviewedRow & { kind: string; row: any; reason: string; evidence: string[]; firstReason: string; finalReason: string; obligations: number }> = []
  for (const unit of units) {
    const packetFile = path.join(root, "evaluator", "packets", `${unit.id.replace(":", "-")}.json`)
    const bytes = await readFile(packetFile), packet = JSON.parse(bytes.toString("utf8")), binding = reviewMap.map[unit.id], review = reviews.ratings[unit.id]
    if (!binding || !review || hash(bytes) !== binding.packetSha256 || packet.id !== unit.id ||
      hash(JSON.stringify({ first: packet.first, final: packet.final })) !== binding.answerSha256 ||
      packet.reportSha256 !== binding.reportSha256 || packet.runSha256 !== binding.runSha256) throw new Error(`AN review packet changed: ${unit.id}`)
    const archiveDirectory = path.join(root, unit.kind, unit.row.id)
    const currentReportBytes = await readFile(path.join(archiveDirectory, "report.json"))
    const currentReport = JSON.parse(currentReportBytes.toString("utf8"))
    const currentRunBytes = currentReport.sessionId
      ? await readFile(path.join(archiveDirectory, "sessions", currentReport.sessionId, "run.json"))
      : null
    assertPacketArchiveBound(packet, currentReportBytes, currentRunBytes)
    for (const phase of ["first", "final"] as const) {
      const rating = review[phase] as Rating
      if (!rating || !ratingValues.support.includes(rating.support) || !ratingValues.outcome.includes(rating.outcome) ||
        typeof review[`${phase}Reason`] !== "string" || !review[`${phase}Reason`].trim()) throw new Error(`Invalid ${phase} rating: ${unit.id}`)
    }
    const firstDeliveryComplete = packet.first?.deliveryComplete ?? false
    if (!firstDeliveryComplete && (review.first.support !== "blocked" || review.first.outcome !== "blocked")) throw new Error(`Invalid first delivery rated nonblocked: ${unit.id}`)
    if (packet.status !== "completed" && (review.final.support !== "blocked" || review.final.outcome !== "blocked")) throw new Error(`Blocked final rated nonblocked: ${unit.id}`)
    if (packet.status === "completed" && !packet.final?.canonicalResult) throw new Error(`Completed row lacks final result: ${unit.id}`)
    rows.push({ id: unit.id, kind: unit.kind, row: unit.row, status: packet.status, firstDeliveryComplete,
      first: review.first, final: review.final, firstReason: review.firstReason, finalReason: review.finalReason,
      reason: review.finalReason, evidence: review.evidence ?? [], obligations: packet.final?.canonicalResult?.results?.length ?? 0 })
  }
  const quality = rows.filter(row => row.kind === "quality"), consumers = rows.filter(row => row.kind === "consumers")
  const authorRows = await Promise.all(plan.authors.map(async (row: any) => ({ ...row,
    ...await json(path.join(root, "authors", row.id, "delivery.json")) })))
  const group = (selected: typeof rows) => summarizeReviewedRows(selected)
  const qualityByContract = Object.fromEntries(["compatibility", "current-v1"].map(contract => [contract, group(quality.filter(row => row.row.taskContract === contract))]))
  const qualityByRoute = Object.fromEntries(["markdown", "dsl"].map(route => [route, group(quality.filter(row => row.row.route === route))]))
  const consumerByRoute = Object.fromEntries(["markdown", "dsl", "task-authoring"].map(route => [route, group(consumers.filter(row => row.row.route === route))]))
  const qualityPairs = plan.quality.filter((item: any) => item.taskContract === "compatibility").map((item: any) => {
    const oldRow = quality.find(row => row.row.caseId === item.caseId && row.row.route === item.route && row.row.taskContract === "compatibility")!
    const currentRow = quality.find(row => row.row.caseId === item.caseId && row.row.route === item.route && row.row.taskContract === "current-v1")!
    return { caseId: item.caseId, route: item.route, compatibility: oldRow.final, current: currentRow.final,
      improvement: oldRow.final.support !== "supported" && currentRow.final.support === "supported",
      regression: oldRow.final.support === "supported" && currentRow.final.support !== "supported" }
  })
  const summary = { schemaVersion: "authorization-an-evaluation/v1", planSha256: reviewMap.planSha256,
    generation: { closed: true, baseFreeze: (await json(path.join(root, "generation-freeze.json"))).commit,
      consumerRevision: (await json(path.join(root, "generation-revision-2.json"))).revisionCommit, targetExecutions: 0 },
    quality: { ...group(quality), byContract: qualityByContract, byRoute: qualityByRoute, pairs: qualityPairs },
    authors: { planned: 12, firstValid: authorRows.filter(row => row.firstValid).length, finalValid: authorRows.filter(row => row.finalValid).length,
      dependencyBlocked: authorRows.filter(row => row.status === "author-dependency-blocked").length,
      byRoute: Object.fromEntries(["markdown", "dsl", "task-authoring"].map(route => [route, { planned: authorRows.filter(row => row.route === route).length,
        finalValid: authorRows.filter(row => row.route === route && row.finalValid).length }])), rows: authorRows.map(row => ({ id: row.id, route: row.route, version: row.version,
        status: row.status, firstValid: row.firstValid, finalValid: row.finalValid, calls: row.calls ?? 0,
        firstDiagnostics: row.firstDiagnostics ?? [], finalDiagnostics: row.finalDiagnostics ?? [] })) },
    consumers: { ...group(consumers), byRoute: consumerByRoute, obligationsPlanned: 24,
      obligationsDelivered: consumers.reduce((total, row) => total + row.obligations, 0),
      obligationsBlocked: 24 - consumers.reduce((total, row) => total + row.obligations, 0) },
    usage: account.byStage, allPaid: account.allPaid, humanMinutes: null,
    ratings: rows, evaluatorIdentity: reviews.evaluatorIdentity, limits: reviews.limits ?? [],
  }
  const output = `${JSON.stringify(summary, null, 2)}\n`, summaryFile = path.join(root, "evaluation-summary.json")
  if (mode === "replay") {
    if (!await exists(summaryFile) || await readFile(summaryFile, "utf8") !== output) throw new Error("AN evaluation replay differs")
  } else await save(summaryFile, summary, true)
  console.log(JSON.stringify({ status: mode === "replay" ? "reproduced" : "evaluated", quality: summary.quality.planned,
    authorValid: summary.authors.finalValid, consumerCompleted: summary.consumers.completed, allPaid: summary.allPaid, providerCallsThisCommand: 0 }))
}
