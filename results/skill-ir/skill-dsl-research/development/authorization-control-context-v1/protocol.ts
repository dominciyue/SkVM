import { z } from "zod"

export const RatingSchema = z.object({
  id: z.string().min(1), phase: z.enum(["first", "final"]),
  answerFidelity: z.enum(["supported", "unsupported", "incomplete", "blocked"]),
  resolution: z.enum(["determinate", "conditional", "unresolved", "blocked"]),
  unknownCauses: z.array(z.enum(["source-gap", "premise-unspecified", "deployment-unverified", "dependency-out-of-scope", "transport", "author-dependency"])),
  overAbstention: z.boolean(), falseCertainty: z.boolean(), rationale: z.string().min(1),
  evidence: z.array(z.string()).optional(),
}).strict().refine(r => (r.answerFidelity === "blocked") === (r.resolution === "blocked"), "Blocked delivery must remain blocked in both dimensions")
export type Rating = z.infer<typeof RatingSchema>
export function summarizeRatings(rows: Rating[]) {
  if (new Set(rows.map(r => r.id + ":" + r.phase)).size !== rows.length) throw new Error("Duplicate rating")
  return { planned: rows.length, supported: rows.filter(r => r.answerFidelity === "supported").length,
    unsupported: rows.filter(r => r.answerFidelity === "unsupported").length, incomplete: rows.filter(r => r.answerFidelity === "incomplete").length,
    resolved: rows.filter(r => ["determinate", "conditional"].includes(r.resolution)).length,
    determinate: rows.filter(r => r.resolution === "determinate").length, conditional: rows.filter(r => r.resolution === "conditional").length,
    unresolved: rows.filter(r => r.resolution === "unresolved").length, blocked: rows.filter(r => r.resolution === "blocked").length,
    overAbstention: rows.filter(r => r.overAbstention).length, falseCertainty: rows.filter(r => r.falseCertainty).length,
    unknownCauses: Object.fromEntries([...new Set(rows.flatMap(r => r.unknownCauses))].map(c => [c, rows.filter(r => r.unknownCauses.includes(c)).length])) }
}
export function qualityUnits(ids: string[]) {
  return Array.from({ length: 4 }, (_, round) => ids.map((caseId, index) => ({
    id: `q${String(round * ids.length + index + 1).padStart(2, "0")}`,
    caseId, material: round < 2 ? "al" : "am", arm: round % 2 === 0 ? "markdown" : "dsl",
  }))).flat()
}
export function authorUnits(ids: string[]) {
  return ids.flatMap(packageId => ["markdown", "dsl"].flatMap(arm => ["original", "changed"].map(variant => ({
    id: `${packageId}-${arm}-${variant}`, packageId, arm, variant,
  }))))
}

export const ratingRules = {
  supported: "All material claims follow supplied source and public premises; accurate, explicitly bounded unknown is supported if it omits no requested causal explanation.",
  incomplete: "No decisive false claim, but a necessary control, requested branch, policy comparison or explanation is missing.",
  unsupported: "A material source, premise, decision or policy-comparison claim contradicts the public task or fixed source.",
  determinate: "The requested actual scenario and necessary explanation are answered with supported decisions.",
  conditional: "Every requested relevant branch is answered and causally supported; unspecified actual truth remains explicit.",
  unresolved: "The requested outcome or a required branch cannot be answered, even if the unknown is faithful.",
  blocked: "No valid delivered analysis, including invalid author, preparation, transport and completion-unknown dependencies; retains denominator.",
  isolation: "Evaluation reads fixed public source/oracle only after generation closes. No rating, answer or evaluator criterion may enter a generation prompt.",
}
