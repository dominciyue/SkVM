// Join already-adjudicated manual reviews to the arm/phase mapping only.
import path from "node:path"
import { base, load, save } from "./evidence.ts"
const mapping = (await load(path.join(base, "evaluation/blind-mapping.json"))).mapping
const documents = await Promise.all(["M", "G"].map(task => load(path.join(base, `evaluation/review-${task}.json`))))
const reviews = documents.flatMap(d => d.answers), rows = []
for (const entry of mapping) for (const phase of ["first", "final"]) {
  const id = entry[phase], task = entry.position.endsWith("-M") ? "M" : "G"
  const review = id ? reviews.find(r => r.id === id) : undefined
  if (id && !review) throw new Error(`missing-manual-review:${id}`)
  const domains = task === "M" ? ["binding", "expiryAndFailures", "accessAndOrder", "anonymousEntry", "responseAndErrors", "limits"]
    : ["route", "permissionAndPolicy", "fields", "effectAndOrder", "responseAndErrors", "limits"]
  const core = task === "M" ? ["tokenObject", "entryActivation", "contextOrder", "conversionScope"]
    : ["routeGates", "readerWriterPolicy", "effectErrorOrder"]
  if (review && (domains.some(k => !["full", "partial", "incorrect", "not-covered"].includes(review.domains[k]))
    || core.some(k => !["correct", "incorrect", "not-covered"].includes(review.coreRelations[k]))))
    throw new Error(`invalid-manual-grades:${id}`)
  if (review?.wholeTask === "full" && domains.some(k => review.domains[k] !== "full")) throw new Error(`whole-domain-conflict:${id}`)
  rows.push({ position: entry.position, attempt: entry.attempt, phase, answerId: id, status: entry.status,
    delivery: id ? (phase === "first" ? entry.firstDelivery : entry.delivery) : "not-delivered",
    firstBasis: phase === "first" ? entry.firstBasis : undefined,
    reviewStatus: "main-reviewed", ...(review ?? {
      domains: Object.fromEntries(domains.map(k => [k, "not-delivered"])),
      coreRelations: Object.fromEntries(core.map(k => [k, "not-covered"])), wholeTask: entry.status === "ineligible" ? "ineligible" : "not-delivered",
      severeUnsupportedClaims: [], adoption: { usesComputedResults: false, reason: "No answer or model call at this planned ineligible position." },
      evidence: [{ finding: "Known source counterexample made AE-G ineligible. The denominator is retained.", source: "evaluation/G-source-review.json" }]
    }) })
}
await save(path.join(base, "evaluation/natural-review.json"), {
  sourceFirstFrozenRubric: "evaluation/rubric.json", blindPackets: ["evaluation/blind-M.json", "evaluation/blind-G.json"],
  independentAndAdjudicatedReviews: ["evaluation/review-M.json", "evaluation/review-G.json"], rows,
  interpretation: "Answer grades come from source review, not tool/format success. First means the first captured answer, with its delivery/basis preserved; it need not be the first provider turn. Identical first/final texts were judged once. Unread or omitted original duties remain partial, and ineligible positions remain in the denominator."
})
console.log(JSON.stringify({ rows: rows.length, distinctReviewedAnswers: reviews.length }))
