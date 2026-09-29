import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { root, json, save, hash, bind, verify, exists, sessionAccount, aggregateUsage } from "./common.ts"
const mode = process.argv[2]
if (!["coverage", "source-reuse", "packets-quality", "packets-consumers", "packets-revision", "evaluate-quality", "evaluate-consumers", "evaluate-revision", "replay", "summary"].includes(mode ?? "")) throw new Error("Usage: evaluate.ts coverage|source-reuse|packets-{quality,consumers,revision}|evaluate-{quality,consumers,revision}|replay|summary (zero provider)")
const plan = await json(path.join(root, "study-plan.json"))
const oracle = await json(path.join(root, "evaluator", "oracle.json"))
await verify(plan.evaluatorBindings)
const sourcePoint = (text: string) => /^(.*?):(\d+)-(\d+)/.exec(text)
if (mode === "coverage") {
  const rows: any[] = []
  for (const c of plan.cases) {
    const file = path.join(root, "inputs", c.id, "automatic-v3", "assessment.json")
    const criteria = oracle.cases.find((v: any) => v.id === c.id)
    const seed = await json(path.resolve(root, "inputs", c.id, "seed-request.json"))
    if (!await exists(file)) { rows.push({ id: c.id, published: false, controls: criteria.decisiveEvidence.map((v: string) => ({ evidence: v, supplied: false })) }); continue }
    const loaded = await loadLocalAuthorizationInput(file)
    if (loaded.status !== "valid") throw new Error("Invalid coverage input")
    const report = await json(path.join(path.dirname(file), "report.json"))
    const controls = criteria.decisiveEvidence.map((e: string) => {
      const m = sourcePoint(e); if (!m) throw new Error("Invalid criterion position")
      const item = report.included.find((i: any) => i.originalPath === m[1])
      const ranges = item?.segments?.map((s: any) => [s.originalStartLine, s.originalEndLine]) ?? (item ? [[item.startLine, item.endLine]] : [])
      const lo = Number(m[2]), hi = Number(m[3]), suppliedLines = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(n => ranges.some((r: number[]) => n >= r[0]! && n <= r[1]!)).length
      return { evidence: e, supplied: suppliedLines === hi - lo + 1, suppliedLines, requiredLines: hi - lo + 1, insideAllowed: seed.allowedFiles.includes(m[1]) }
    })
    rows.push({ id: c.id, published: true, status: report.status, controls, allDeclaredCriterionRangesSupplied: controls.every((v: any) => v.supplied),
      finalSourceBytes: loaded.sourceBundle.files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0), sourceFiles: loaded.sourceBundle.files.length,
      actualObligations: loaded.task.obligations.length, gaps: report.gaps, note: "Mechanical original-line coverage; independent semantic review judges control completeness." })
  }
  // All listed decisive positions in this public development oracle are in registered allowlists; bind the actual fact here.
  for (const row of rows) { const c = plan.cases.find((c: any) => c.id === row.id), seed = await json(path.resolve(root, "inputs", c.id, "seed-request.json")); for (const v of row.controls) v.insideAllowed = seed.allowedFiles.includes(sourcePoint(v.evidence)![1]) }
  await save(path.join(root, "preparation-coverage.json"), { schemaVersion: "authorization-al-coverage/v1", planned: 8, rows, evaluatorOnly: true, providerCalls: 0 })
  if (await exists(path.join(root, "shared-revision", "material-config.json"))) {
    const revisedRows = []
    for (const c of (await json(path.join(root, "shared-revision", "registration.json"))).cases) {
      const file = path.join(root, "shared-revision", "inputs", c.id, "material", "assessment.json")
      if (!await exists(file)) { revisedRows.push({ id: c.id, published: false }); continue }
      const loaded = await loadLocalAuthorizationInput(file)
      if (loaded.status !== "valid") throw new Error("Invalid revision coverage input")
      const report = await json(path.join(path.dirname(file), "report.json")), seed = await json(path.resolve(root, "inputs", c.id, "seed-request.json"))
      const controls = oracle.cases.find((v: any) => v.id === c.id).decisiveEvidence.map((e: string) => {
        const m = sourcePoint(e)!, item = report.included.find((i: any) => i.originalPath === m[1]), ranges = item?.segments?.map((s: any) => [s.originalStartLine, s.originalEndLine]) ?? []
        const requiredLines = Number(m[3]) - Number(m[2]) + 1, suppliedLines = Array.from({ length: requiredLines }, (_, i) => Number(m[2]) + i).filter(n => ranges.some((r: number[]) => n >= r[0]! && n <= r[1]!)).length
        return { evidence: e, requiredLines, suppliedLines, supplied: requiredLines === suppliedLines, insideAllowed: seed.allowedFiles.includes(m[1]) }
      })
      const proposal = await json(path.join(path.dirname(file), "proposal.json")), discovery = await json(path.join(path.dirname(file), "discovery.json"))
      revisedRows.push({ id: c.id, published: true, status: report.status, controls, allDeclaredCriterionRangesSupplied: controls.every((v: any) => v.supplied), finalSourceBytes: loaded.sourceBundle.files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0), sourceFiles: loaded.sourceBundle.files.length, sourceDisplay: proposal.account.sourceDisplay, indexReadBytes: discovery.readBytes, gaps: report.gaps })
    }
    await save(path.join(root, "shared-revision", "coverage.json"), { planned: 2, rows: revisedRows, evaluatorOnly: true, providerCalls: 0 })
  }
  console.log(JSON.stringify({ published: rows.filter(r => r.published).length, allCriterionRangesSupplied: rows.filter(r => r.allDeclaredCriterionRangesSupplied).length, providerCalls: 0 }))
} else if (mode === "source-reuse") {
  const rows = []
  const sourceIdentity = (bundle: any) => ({ repository: bundle.repository, sourceRef: bundle.sourceRef, files: bundle.files.map((f: any) => ({ path: f.relativePath, sha256: hash(f.content), bytes: Buffer.byteLength(f.content, "utf8") })).sort((a: any, b: any) => a.path.localeCompare(b.path)) })
  for (const unit of plan.consumers.filter((u: any) => u.variant === "changed")) {
    const original = await json(path.join(root, "consumer-runs", unit.id.replace(/changed$/, "original"), "unit.json"))
    const file = path.join(root, "author-packages", unit.packageId, unit.arm, "changed-material", "assessment.json")
    if (!original.report.sessionId || !await exists(file)) { rows.push({ id: unit.id, status: "blocked" }); continue }
    const before = await json(path.join(original.report.sessionPath, "source-bundle.json")), loaded = await loadLocalAuthorizationInput(file)
    if (loaded.status !== "valid") throw new Error("Invalid source-reuse input")
    const oldSource = sourceIdentity(before), newSource = sourceIdentity(loaded.sourceBundle)
    const sameSourceBytesAndRef = JSON.stringify(oldSource) === JSON.stringify(newSource)
    if (!sameSourceBytesAndRef) throw new Error("Authored change unexpectedly altered source bytes/ref")
    rows.push({ id: unit.id, status: "verified", sameSourceBytesAndRef, before: oldSource, after: newSource, sameSourceBundleJSON: JSON.stringify(before) === JSON.stringify(loaded.sourceBundle),
      note: "Bundle metadata includes preparation status/gaps and can differ with identical source files. The retained compare-summary sameSourceBytes field originally compares whole bundle JSON; this record verifies actual file bytes/ref." })
  }
  await save(path.join(root, "compare-source-verification.json"), { planned: 4, verified: rows.filter(r => r.status === "verified").length, blocked: rows.filter(r => r.status === "blocked").length, rows, providerCalls: 0 })
  console.log(JSON.stringify({ comparisons: 4, actualSourceBytesVerified: rows.filter(r => r.status === "verified").length, providerCalls: 0 }))
} else if (mode?.startsWith("packets-")) {
  const kind = mode!.slice("packets-".length), revision = kind === "revision" ? await json(path.join(root, "shared-revision", "registration.json")) : null
  const units = kind === "quality" ? plan.units : kind === "consumers" ? plan.consumers : revision.units
  const replay = await json(path.join(root, kind === "quality" ? "panel-replay.json" : kind === "consumers" ? "consumer-replay.json" : "shared-revision/replay.json"))
  if (replay.closed !== units.length) throw new Error("All registered generation rows must close before anonymous review")
  const publicBriefs = await json(path.join(root, "public-briefs.json")), authorBriefs = await json(path.join(root, "author-briefs.json"))
  const map: any = {}, groups: any = {}, accounts = []
  for (const unit of units) {
    const outRoot = path.join(root, kind === "quality" ? "runs" : kind === "consumers" ? "consumer-runs" : "shared-revision/runs", unit.id), stored = await json(path.join(outRoot, "unit.json")), report = stored.report
    const anonymousId = "r-" + hash(kind + ":" + hash(await readFile(path.join(root, "study-plan.json"))) + ":" + unit.id).slice(0, 12)
    let run: any = null, sourceBundle: any = null, materialPath: string | null = null, materialId: string | null = null, actualTask: any = null
    if (report.sessionId) {
      const session = report.sessionPath
      run = await json(path.join(session, "run.json")); sourceBundle = await json(path.join(session, "source-bundle.json")); actualTask = await json(path.join(session, "task.json"))
      materialId = "m-" + hash(JSON.stringify(sourceBundle)).slice(0, 12); materialPath = "evaluator/materials/" + materialId + ".txt"
      if (!await exists(path.join(root, materialPath))) {
        await save(path.join(root, "evaluator", "materials", materialId + ".json"), sourceBundle, true)
        await writeFile(path.join(root, materialPath), renderSourceBundle(sourceBundle), { encoding: "utf8", flag: "wx" })
      }
    }
    const first = run ? { deliveryComplete: run.firstResponse?.deliveryComplete ?? false, canonicalResult: run.initial?.result ?? null, wireResult: run.initial?.wireResult ?? run.initialTransport?.wireResult ?? null, observedDecisions: run.initial?.observedDecisions ?? null, validation: run.initial?.validation ?? run.initialTransport?.normalization?.validation ?? null } : null
    const final = { canonicalResult: report.canonicalResult ?? null, wireResult: report.wireResult ?? null, observedDecisions: report.observedDecisions ?? null }
    const packet: any = { schemaVersion: "authorization-al-review-packet/v1", anonymousId, status: report.status, first, final, finalKind: run?.finalKind ?? null, actualTask, materialId, materialPath,
      sourceScope: "Only actually supplied fixed source is evidence; no target execution. Premises are assumptions; unspecified is not absent or other-present. Full conditional answers retain material branches. Distinguish external uncertainty from source gaps." }
    const group = kind === "consumers" ? unit.packageId : unit.caseId
    if (kind !== "consumers") { packet.publicBrief = publicBriefs.cases.find((c: any) => c.id === unit.caseId); packet.rubric = oracle.cases.find((c: any) => c.id === unit.caseId) }
    else {
      packet.publicBrief = authorBriefs.packages.find((p: any) => p.id === unit.packageId); packet.variant = unit.variant; packet.rubric = oracle.authorCriteria.find((p: any) => p.packageId === unit.packageId)
      const scaffold = await json(path.join(root, "author-scaffolds", unit.packageId, unit.variant + ".json"))
      packet.declaredObligations = Object.keys(scaffold.scenarios).sort().map(name => "scenario:" + encodeURIComponent(name))
      if (actualTask && JSON.stringify(actualTask.obligations.map((o: any) => o.id).sort()) !== JSON.stringify(packet.declaredObligations)) throw new Error("Consumer declared obligation identity changed")
    }
    const file = path.join(root, "evaluator", kind + "-packets", anonymousId + ".json")
    await save(file, packet, true)
    map[anonymousId] = { ...unit, packet: path.relative(root, file).split(path.sep).join("/"), packetSha256: hash(await readFile(file)), answerSha256: hash(JSON.stringify({ first, final })) }
    ;(groups[group] ??= []).push({ anonymousId, packet: map[anonymousId].packet, materialPath })
    accounts.push({ ...unit, status: report.status, finalKind: run?.finalKind ?? null, firstDeliveryComplete: first?.deliveryComplete ?? false, ...await sessionAccount(outRoot, report),
      promptCharacters: report.promptCharacters ?? null, actualObligations: actualTask?.obligations?.length ?? 0, actualExpandedObligations: report.canonicalResult?.results?.length ?? 0 })
  }
  await save(path.join(root, "evaluator", kind + "-review-map.json"), { generatedAfterAllRowsClosed: true, map, groups }, true)
  await save(path.join(root, kind + "-account.json"), { rows: accounts, usage: aggregateUsage(accounts) }, true)
  console.log(JSON.stringify({ kind, packets: units.length, groups, providerCalls: 0 }))
} else if (mode?.startsWith("evaluate-") || mode === "replay") {
  for (const kind of mode === "replay" ? ["quality", "consumers", ...(await exists(path.join(root, "revision-summary.json")) ? ["revision"] : [])] : [mode!.slice("evaluate-".length)]) {
    const map = await json(path.join(root, "evaluator", kind + "-review-map.json")), reviews = await json(path.join(root, "evaluator", kind + "-reviews.json")), account = await json(path.join(root, kind + "-account.json"))
    const rows: any[] = []
    if (Object.keys(reviews.ratings).length !== Object.keys(map.map).length) throw new Error("Review denominator changed")
    for (const [id, binding] of Object.entries(map.map) as [string, any][]) {
      const packet = await json(path.join(root, binding.packet)), r = reviews.ratings[id]
      if (!r || hash(await readFile(path.join(root, binding.packet))) !== binding.packetSha256 || hash(JSON.stringify({ first: packet.first, final: packet.final })) !== binding.answerSha256) throw new Error("Review bytes changed " + id)
      if (!["full", "partial", "incorrect", "blocked"].includes(r.firstRating) || !["full", "partial", "incorrect", "blocked"].includes(r.finalRating)) throw new Error("Invalid review rating " + id)
      const usage = account.rows.find((u: any) => u.id === binding.id)
      if (!usage) throw new Error("Missing unit account")
      if (kind === "consumers" && (JSON.stringify(Object.keys(r.obligations ?? {}).sort()) !== JSON.stringify(packet.declaredObligations))) throw new Error("Consumer review obligation denominator changed " + id)
      for (const obligation of Object.values(r.obligations ?? {}) as any[]) if (!["full", "partial", "incorrect", "blocked"].includes(obligation.firstRating) || !["full", "partial", "incorrect", "blocked"].includes(obligation.finalRating)) throw new Error("Invalid obligation rating")
      rows.push({ ...binding, anonymousId: id, status: packet.status, firstFull: !!usage.firstDeliveryComplete && r.firstRating === "full", finalFull: r.finalRating === "full", review: r, usage, observedDecisions: packet.final.observedDecisions ?? [] })
    }
    const units = kind === "quality" ? plan.units : kind === "consumers" ? plan.consumers : (await json(path.join(root, "shared-revision", "registration.json"))).units
    rows.sort((a, b) => units.findIndex((u: any) => u.id === a.id) - units.findIndex((u: any) => u.id === b.id))
    const aggregate = (selected: any[]) => ({ planned: selected.length, completed: selected.filter(r => r.status === "completed").length, blocked: selected.filter(r => /blocked/.test(r.status)).length, firstFull: selected.filter(r => r.firstFull).length, finalFull: selected.filter(r => r.finalFull).length,
      correctDeterminate: selected.filter(r => r.finalFull && r.review.correctDeterminate === true).length, completeConditional: selected.filter(r => r.finalFull && r.review.completeConditional === true).length,
      finalIncorrect: selected.filter(r => r.review.finalRating === "incorrect").length, finalPartial: selected.filter(r => r.review.finalRating === "partial").length,
      observedUnknownRows: selected.filter(r => r.observedDecisions.some((d: any) => d.observed === "unknown")).length,
      overAbstention: selected.filter(r => r.review.behavior === "over-abstention").length, unsupportedCertainty: selected.filter(r => r.review.behavior === "unsupported-certainty").length,
      unknownReasons: Object.fromEntries(["external", "authored-premise", "allowed-source", "outside-allowlist", "budget"].map(reason => [reason, selected.filter(r => (r.review.unknownReasons ?? []).includes(reason)).length])), usage: aggregateUsage(selected.map(r => r.usage)) })
    const groups: any = {}
    if (kind === "quality") for (const material of ["old-auto", "new-auto"]) for (const arm of ["markdown", "dsl"]) groups[material + "/" + arm] = aggregate(rows.filter(r => r.material === material && r.arm === arm))
    else if (kind === "consumers") for (const arm of ["markdown", "dsl"]) for (const variant of ["original", "changed"]) groups[arm + "/" + variant] = aggregate(rows.filter(r => r.arm === arm && r.variant === variant))
    else for (const arm of ["markdown", "dsl"]) groups["revised-auto/" + arm] = aggregate(rows.filter(r => r.arm === arm))
    const pairs = kind === "quality" ? ["markdown", "dsl"].map(arm => {
      const cases = ["owui-file", "memos-get-shared", "paperless-download", "paperless-share-create"].map(caseId => ({ caseId, before: rows.find(r => r.caseId === caseId && r.material === "old-auto" && r.arm === arm), after: rows.find(r => r.caseId === caseId && r.material === "new-auto" && r.arm === arm) }))
      return { arm, registeredPairs: 4, executablePairs: cases.filter(p => p.before.status === "completed" && p.after.status === "completed").length, improvementsIncludingBlocked: cases.filter(p => !p.before.finalFull && p.after.finalFull).map(p => p.caseId), regressions: cases.filter(p => p.before.finalFull && !p.after.finalFull).map(p => p.caseId), cases: cases.map(p => ({ caseId: p.caseId, beforeFull: p.before.finalFull, afterFull: p.after.finalFull })) }
    }) : []
    const obligations = kind === "consumers" ? rows.flatMap(row => Object.entries(row.review.obligations).map(([obligationId, r]: [string, any]) => ({ unitId: row.id, arm: row.arm, variant: row.variant, obligationId, status: row.status, firstFull: row.usage.firstDeliveryComplete && r.firstRating === "full", finalFull: r.finalRating === "full", review: r }))) : []
    if (kind === "consumers" && obligations.length !== 16) throw new Error("Consumer declared denominator must remain sixteen")
    const obligationAggregate = (items: any[]) => ({ planned: items.length, actual: items.filter(o => o.status === "completed").length, blocked: items.filter(o => /blocked/.test(o.status)).length, firstFull: items.filter(o => o.firstFull).length, finalFull: items.filter(o => o.finalFull).length,
      correctDeterminate: items.filter(o => o.finalFull && o.review.correctDeterminate).length, completeConditional: items.filter(o => o.finalFull && o.review.completeConditional).length, finalPartial: items.filter(o => o.review.finalRating === "partial").length, finalIncorrect: items.filter(o => o.review.finalRating === "incorrect").length })
    const obligationGroups = kind === "consumers" ? Object.fromEntries(Object.keys(groups).map(key => [key, obligationAggregate(obligations.filter(o => o.arm + "/" + o.variant === key))])) : {}
    const summary = { schemaVersion: "authorization-al-" + kind + "-summary/v1", primary: aggregate(rows), groups, pairs, rows, obligationPrimary: kind === "consumers" ? obligationAggregate(obligations) : null, obligationGroups, obligations,
      evaluatorIdentity: reviews.evaluatorIdentity, adjudications: reviews.adjudications ?? [],
      limits: ["Exposed public-development tasks and authored allowlists", "Single fixed-order fresh analysis per registered row; no low-score repeat", "Coverage and structure are separate from semantic correctness", "Actual USD, hidden transport attempts, developer/agent cost and human time unknown where not reported"], targetExecutions: 0 }
    const file = path.join(root, kind + "-summary.json")
    if (mode === "replay") { if (await readFile(file, "utf8") !== JSON.stringify(summary, null, 2) + "\n") throw new Error("Evaluation replay differs") }
    else await save(file, summary, true)
    console.log(JSON.stringify({ kind, primary: summary.primary, groups, providerCalls: 0 }))
  }
} else {
  const prep = await json(path.join(root, "preparation-summary.json")), quality = await json(path.join(root, "quality-summary.json")), authors = await json(path.join(root, "author-summary.json")), consumers = await json(path.join(root, "consumers-summary.json")), consumerReplay = await json(path.join(root, "consumer-replay.json")), coverage = await json(path.join(root, "preparation-coverage.json"))
  const revised = await json(path.join(root, "revision-summary.json")), revisionReplay = await json(path.join(root, "shared-revision", "replay.json")), authorReviews = await json(path.join(root, "evaluator", "author-reviews.json"))
  const stages = { preparation: prep.usage, quality: quality.primary.usage, authors: authors.usage, authorPreparation: consumerReplay.preparationUsage, consumers: consumers.primary.usage, sharedRevisionPreparation: revisionReplay.preparationUsage, sharedRevisionAnalysis: revised.primary.usage }
  const prepReuse = prep.rows.map((r: any) => ({ caseId: r.id, actualConsumers: quality.rows.filter((u: any) => u.caseId === r.id && u.material === "new-auto" && u.status === "completed").length,
    completePromptTokens: aggregateUsage([r.account]).completePromptTokens, totalTokens: aggregateUsage([r.account]).totalTokens }))
  const usedPrep = aggregateUsage(prep.rows.filter((r: any) => prepReuse.find((v: any) => v.caseId === r.id).actualConsumers > 0).map((r: any) => r.account))
  const actualQualityUses = prepReuse.reduce((n: number, r: any) => n + r.actualConsumers, 0)
  const revisionPairs = revised.rows.map((r: any) => { const before = quality.rows.find((q: any) => q.caseId === r.caseId && q.material === "new-auto" && q.arm === r.arm); return { caseId: r.caseId, arm: r.arm, baselineFinalFull: before.finalFull, revisedFinalFull: r.finalFull, baselineRating: before.review.finalRating, revisedRating: r.review.finalRating } })
  const summary = { schemaVersion: "authorization-al-summary/v1", implementation: await json(path.join(root, "implementation-freeze.json")), planned: { preparation: 8, quality: 20, authors: 8, consumers: 8, consumerDeclaredObligations: 16 },
    preparation: { published: prep.published, ready: prep.ready, partial: prep.partial, allDeclaredCriterionRangesSupplied: coverage.rows.filter((r: any) => r.allDeclaredCriterionRangesSupplied).length, finalSourceBytes: coverage.rows.reduce((n: number, r: any) => n + (r.finalSourceBytes ?? 0), 0) },
    quality: quality.primary, qualityGroups: quality.groups, qualityPairs: quality.pairs, authors: { planned: 8, dispatchedFirstDrafts: authors.accounts.filter((a: any) => a.kind === "first").length, firstValid: authors.firstValid, finalValid: authors.finalValid, revisionCalls: authors.revisionCalls, firstSemanticValid: authorReviews.firstSemanticValid, finalSemanticValid: authorReviews.finalSemanticValid },
    consumers: consumers.primary, consumerObligations: consumers.obligationPrimary, consumerObligationGroups: consumers.obligationGroups,
    consumerDeclaredObligations: 16, consumerActualObligations: (await json(path.join(root, "consumers-account.json"))).rows.reduce((n: number, r: any) => n + r.actualObligations, 0),
    consumerActualExpandedObligations: (await json(path.join(root, "consumers-account.json"))).rows.reduce((n: number, r: any) => n + r.actualExpandedObligations, 0),
    compare: await json(path.join(root, "compare-source-verification.json")),
    usage: aggregateUsage(Object.values(stages)), stageUsage: stages,
    historicalOldPreparation: { treatment: "Existing AK acquisition cost, retained separately and not charged again as an AL dispatch.", usage: (await json(path.join(root, "../authorization-bounded-preparation-v2/preparation-summary.json"))).usage },
    amortization: { measured: "All eight baseline preparations charged once; six actually consumed twice, two unconsumed remain overhead. Token divisions are arithmetic reuse scenarios, not new dispatches.", cases: prepReuse, actualQualityUses,
      usedPreparationUsage: usedPrep, unusedPreparationCases: prepReuse.filter((r: any) => r.actualConsumers === 0).map((r: any) => r.caseId),
      oneUseEachOfSixCompletePromptPerConsumer: usedPrep.completePromptTokens === null ? null : usedPrep.completePromptTokens / 6,
      actualTwelveUsesCompletePromptPerConsumer: usedPrep.completePromptTokens === null ? null : usedPrep.completePromptTokens / actualQualityUses,
      actualTwelveUsesIncludingUnusedOverheadCompletePromptPerConsumer: prep.usage.completePromptTokens === null ? null : prep.usage.completePromptTokens / actualQualityUses,
      authorOriginalChangedUses: { preparationJobs: consumerReplay.preparationAccounts.length, completedConsumers: consumers.primary.completed, preparationCompletePromptTokens: consumerReplay.preparationUsage.completePromptTokens, completePromptPerActualConsumer: consumerReplay.preparationUsage.completePromptTokens / consumers.primary.completed, sourceProof: "compare-source-verification.json" },
      revisedFourUses: { preparationJobs: 2, completedConsumers: revised.primary.completed, preparationCompletePromptTokens: revisionReplay.preparationUsage.completePromptTokens, completePromptPerActualConsumer: revisionReplay.preparationUsage.completePromptTokens / revised.primary.completed } },
    costs: { actualUsd: "unknown when provider reports none", developerHostCost: "unknown", readOnlyReviewCost: "unknown", humanMinutes: "unknown", elapsed: "Known response elapsed sums, not study wall-clock or human effort." }, targetExecutions: 0,
    sharedRevision: { status: "one-used", preparations: 2, analyses: 4, results: revised.primary, pairs: revisionPairs, freeze: await json(path.join(root, "shared-revision", "implementation-freeze.json")), preservesOriginalTwentyRows: true },
    verificationImplementation: await exists(path.join(root, "verification-freeze.json")) ? await json(path.join(root, "verification-freeze.json")) : null }
  await save(path.join(root, "summary.json"), summary)
  console.log(JSON.stringify({ planned: summary.planned, preparation: summary.preparation, quality: summary.quality, authors: summary.authors, consumers: summary.consumers, usage: summary.usage, providerCallsThisCommand: 0 }))
}
