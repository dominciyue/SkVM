import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package"
import { ProspectiveDevelopmentQualificationSchema } from "./prospective-development-qualification"
import { sha256Bytes } from "./source-fixture"

const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const EstimandSchema = z.object({
  id: z.enum([
    "original-minus-no-skill",
    "ir-static-minus-original",
    "validated-artifact-minus-original",
  ]),
  treatment: z.enum(["original", "ir-static", "validated-artifact"]),
  comparator: z.enum(["no-skill", "original"]),
  metric: z.literal("deterministic-evaluator-score"),
  pairing: z.literal("same-task-and-repetition"),
  reportMeanDelta: z.literal(true),
  reportPositiveZeroRegressedPairs: z.literal(true),
}).strict()

export const ProspectiveDevelopmentAnalysisPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-development-analysis-policy/v1"),
  analysisId: z.literal("bids-prospective-development-analysis-2026-08-23"),
  frozenAt: z.string().datetime(),
  timing: z.literal("after-qualification-before-model-matrix"),
  lock: FrozenFileSchema,
  qualification: FrozenFileSchema,
  implementation: z.tuple([FrozenFileSchema]),
  denominator: z.object({ modelRows: z.literal(12), deterministicControlRows: z.literal(4) }).strict(),
  estimands: z.tuple([EstimandSchema, EstimandSchema, EstimandSchema]),
  measurementEligibility: z.object({
    requiredModelRows: z.literal(12),
    requiredScoredModelRows: z.literal(12),
    requiredDeterministicControlRows: z.literal(4),
    maximumActiveExecutionFailures: z.literal(1),
    maximumParserOrRuntimeBlockers: z.literal(0),
    deterministicScorerRequired: z.literal(true),
  }).strict(),
  decisionRules: z.object({
    contributionIdentified: z.object({
      estimand: z.literal("original-minus-no-skill"),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
    irStaticImproved: z.object({
      estimand: z.literal("ir-static-minus-original"),
      meanDeltaMustBePositive: z.literal(true),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
    validatedArtifactImproved: z.object({
      estimand: z.literal("validated-artifact-minus-original"),
      allArtifactRowsMustPass: z.literal(true),
      meanDeltaMustBePositive: z.literal(true),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
  }).strict(),
  dynamicTrigger: z.object({
    mode: z.literal("residual-driven-only"),
    maximumConditionalPaidCalls: z.literal(4),
    authorized: z.literal(false),
  }).strict(),
  authorizations: z.object({
    modelMatrix: z.literal(true),
    deterministicControl: z.literal(true),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "Prospective development estimands and decision rules only. Results cannot authorize held-out, readiness, automatic construction, dynamic repair, or main claims.",
  ),
}).strict().superRefine((policy, context) => {
  const expected = [
    ["original-minus-no-skill", "original", "no-skill"],
    ["ir-static-minus-original", "ir-static", "original"],
    ["validated-artifact-minus-original", "validated-artifact", "original"],
  ]
  if (policy.estimands.some((item, index) =>
    item.id !== expected[index]?.[0]
    || item.treatment !== expected[index]?.[1]
    || item.comparator !== expected[index]?.[2])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "prospective estimand order or arm identity mismatch" })
  }
})

export type ProspectiveDevelopmentAnalysisPolicy = z.infer<
  typeof ProspectiveDevelopmentAnalysisPolicySchema
>

export async function validateProspectiveDevelopmentAnalysisPolicy(
  input: unknown,
  rootDir: string,
): Promise<ProspectiveDevelopmentAnalysisPolicy> {
  const policy = ProspectiveDevelopmentAnalysisPolicySchema.parse(input)
  const root = path.resolve(rootDir)
  for (const file of [policy.lock, policy.qualification, ...policy.implementation]) {
    const observed = sha256Bytes(await readFile(path.resolve(root, ...file.path.split("/"))))
    if (observed !== file.sha256) throw new Error(`Prospective analysis digest mismatch for ${file.path}`)
  }
  const qualification = ProspectiveDevelopmentQualificationSchema.parse(JSON.parse(
    await readFile(path.resolve(root, ...policy.qualification.path.split("/")), "utf8"),
  ))
  if (qualification.status !== "passed" || !qualification.authorizations.paidMatrix
    || qualification.lockSha256 !== policy.lock.sha256) {
    throw new Error("Prospective analysis qualification is failed or stale")
  }
  return policy
}
