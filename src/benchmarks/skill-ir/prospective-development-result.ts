import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package"
import { ExecutionFailureClassificationSchema } from "./execution-resilience"

const ArmSchema = z.enum(["no-skill", "original", "ir-static", "validated-artifact"])
const ResultRowSchema = z.object({
  task: z.string().min(1),
  runIndex: z.number().int().positive(),
  system: ArmSchema,
  evaluatorScore: z.number().min(0).max(1),
  success: z.boolean(),
  successSource: z.string().min(1),
}).passthrough()

const ArmSummarySchema = z.object({
  rows: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  meanScore: z.number().min(0).max(1),
}).strict()

const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const ExecutionTotalsSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict()

const EstimandResultSchema = z.object({
  id: z.enum([
    "original-minus-no-skill",
    "ir-static-minus-original",
    "validated-artifact-minus-original",
  ]),
  pairs: z.literal(4),
  meanDelta: z.number(),
  positivePairs: z.number().int().min(0).max(4),
  zeroPairs: z.number().int().min(0).max(4),
  regressedPairs: z.number().int().min(0).max(4),
}).strict()

export const ProspectiveDevelopmentResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-development-result/v1"),
  experimentId: z.string().min(1),
  analysisPolicySha256: Sha256Schema,
  evidence: z.object({
    modelRaw: BoundFileSchema,
    modelScored: BoundFileSchema,
    executionEnvelopes: BoundFileSchema,
    artifactRaw: BoundFileSchema,
    artifactScored: BoundFileSchema,
    constructionReport: BoundFileSchema,
  }).strict(),
  measurement: z.object({
    status: z.enum(["eligible", "ineligible"]),
    modelRows: z.number().int().nonnegative(),
    scoredModelRows: z.number().int().nonnegative(),
    deterministicControlRows: z.number().int().nonnegative(),
    activeExecutionFailures: z.number().int().nonnegative(),
    parserOrRuntimeBlockers: z.number().int().nonnegative(),
    deterministicScorerComplete: z.boolean(),
    executionTotals: ExecutionTotalsSchema,
  }).strict(),
  systems: z.object({
    "no-skill": ArmSummarySchema,
    original: ArmSummarySchema,
    "ir-static": ArmSummarySchema,
    "validated-artifact": ArmSummarySchema,
  }).strict(),
  estimands: z.tuple([EstimandResultSchema, EstimandResultSchema, EstimandResultSchema]),
  decisions: z.object({
    contributionIdentified: z.boolean(),
    irStaticImproved: z.boolean(),
    validatedArtifactImproved: z.boolean(),
    automaticOptimizedResult: z.boolean(),
  }).strict(),
  authorizations: z.object({ dynamic: z.literal(false), heldOut: z.literal(false), readinessPromotion: z.literal(false) }).strict(),
  claimBoundary: z.literal(
    "Development-only paired evidence. Static and hand-authored artifact decisions remain separate; automatic optimized, dynamic, held-out, readiness, and main claims require additional authorization and evidence.",
  ),
}).strict()

export type ProspectiveDevelopmentResult = z.infer<typeof ProspectiveDevelopmentResultSchema>

type ResultRow = z.infer<typeof ResultRowSchema>

function rounded(value: number): number {
  return Number(value.toFixed(4))
}

function summary(rows: ResultRow[], system: z.infer<typeof ArmSchema>) {
  const selected = rows.filter((row) => row.system === system)
  return {
    rows: selected.length,
    successes: selected.filter((row) => row.success).length,
    meanScore: selected.length === 0 ? 0 : rounded(
      selected.reduce((total, row) => total + row.evaluatorScore, 0) / selected.length,
    ),
  }
}

function paired(input: {
  id: "original-minus-no-skill" | "ir-static-minus-original" | "validated-artifact-minus-original"
  treatment: ResultRow[]
  comparator: ResultRow[]
}) {
  const comparator = new Map(input.comparator.map((row) => [`${row.task}\0${row.runIndex}`, row]))
  const deltas = input.treatment.map((row) => {
    const match = comparator.get(`${row.task}\0${row.runIndex}`)
    if (!match) throw new Error(`Prospective result pair missing: ${input.id}/${row.task}/${row.runIndex}`)
    return row.evaluatorScore - match.evaluatorScore
  })
  if (deltas.length !== 4) throw new Error(`Prospective result requires four pairs: ${input.id}`)
  return {
    id: input.id,
    pairs: 4 as const,
    meanDelta: rounded(deltas.reduce((total, value) => total + value, 0) / deltas.length),
    positivePairs: deltas.filter((value) => value > 0).length,
    zeroPairs: deltas.filter((value) => value === 0).length,
    regressedPairs: deltas.filter((value) => value < 0).length,
  }
}

export function buildProspectiveDevelopmentResult(input: {
  experimentId: string
  analysisPolicySha256: string
  modelRows: unknown[]
  artifactRows: unknown[]
  classifications: string[]
  evidence: {
    modelRaw: { path: string; sha256: string }
    modelScored: { path: string; sha256: string }
    executionEnvelopes: { path: string; sha256: string }
    artifactRaw: { path: string; sha256: string }
    artifactScored: { path: string; sha256: string }
    constructionReport: { path: string; sha256: string }
  }
  executionTotals: z.input<typeof ExecutionTotalsSchema>
  maximumActiveExecutionFailures: number
  maximumParserOrRuntimeBlockers: number
  automaticConstructionEligible: boolean
}): ProspectiveDevelopmentResult {
  const modelRows = input.modelRows.map((row) => ResultRowSchema.parse(row))
  const artifactRows = input.artifactRows.map((row) => ResultRowSchema.parse(row))
  const classifications = input.classifications.map((value) => ExecutionFailureClassificationSchema.parse(value))
  const active = new Set(["active-idle-timeout", "active-absolute-timeout", "step-limit"])
  const blockers = new Set(["qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid"])
  const activeExecutionFailures = classifications.filter((value) => active.has(value)).length
  const parserOrRuntimeBlockers = classifications.filter((value) => blockers.has(value)).length
  const deterministicScorerComplete = [...modelRows, ...artifactRows]
    .every((row) => row.successSource === "deterministic-evaluator")
  const measurementEligible = modelRows.length === 12 && artifactRows.length === 4
    && classifications.length === 12 && deterministicScorerComplete
    && activeExecutionFailures <= input.maximumActiveExecutionFailures
    && parserOrRuntimeBlockers <= input.maximumParserOrRuntimeBlockers

  const original = modelRows.filter((row) => row.system === "original")
  const noSkill = modelRows.filter((row) => row.system === "no-skill")
  const irStatic = modelRows.filter((row) => row.system === "ir-static")
  const artifact = artifactRows.filter((row) => row.system === "validated-artifact")
  const estimands = [
    paired({ id: "original-minus-no-skill", treatment: original, comparator: noSkill }),
    paired({ id: "ir-static-minus-original", treatment: irStatic, comparator: original }),
    paired({ id: "validated-artifact-minus-original", treatment: artifact, comparator: original }),
  ] as const
  const contributionIdentified = measurementEligible
    && estimands[0].positivePairs >= 1 && estimands[0].regressedPairs === 0
  const irStaticImproved = measurementEligible && estimands[1].meanDelta > 0
    && estimands[1].positivePairs >= 1 && estimands[1].regressedPairs === 0
  const validatedArtifactImproved = measurementEligible && artifact.every((row) => row.success)
    && estimands[2].meanDelta > 0 && estimands[2].positivePairs >= 1 && estimands[2].regressedPairs === 0
  return ProspectiveDevelopmentResultSchema.parse({
    schemaVersion: "skill-ir-prospective-development-result/v1",
    experimentId: input.experimentId,
    analysisPolicySha256: input.analysisPolicySha256,
    evidence: input.evidence,
    measurement: {
      status: measurementEligible ? "eligible" : "ineligible",
      modelRows: modelRows.length,
      scoredModelRows: modelRows.length,
      deterministicControlRows: artifactRows.length,
      activeExecutionFailures,
      parserOrRuntimeBlockers,
      deterministicScorerComplete,
      executionTotals: input.executionTotals,
    },
    systems: {
      "no-skill": summary(modelRows, "no-skill"),
      original: summary(modelRows, "original"),
      "ir-static": summary(modelRows, "ir-static"),
      "validated-artifact": summary(artifactRows, "validated-artifact"),
    },
    estimands,
    decisions: {
      contributionIdentified,
      irStaticImproved,
      validatedArtifactImproved,
      automaticOptimizedResult: validatedArtifactImproved && input.automaticConstructionEligible,
    },
    authorizations: { dynamic: false, heldOut: false, readinessPromotion: false },
    claimBoundary:
      "Development-only paired evidence. Static and hand-authored artifact decisions remain separate; automatic optimized, dynamic, held-out, readiness, and main claims require additional authorization and evidence.",
  })
}
