import { z } from "zod"
import {
  auditPublicJsonContractDisclosure,
  type PublicJsonContractDisclosureAudit,
} from "./public-json-contract-disclosure.ts"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const SafePathSchema = z.string().min(1).refine((value) => !/^[A-Za-z]:[\\/]|^[/\\]/u.test(value))
const BoundFileSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict()

const EVALUATOR_FIELD_PATHS = [
  "/studyId",
  "/analysis/test",
  "/analysis/alternative",
  "/analysis/effectBasis",
  "/analysis/effectMetric",
  "/analysis/familyAlpha",
  "/analysis/adjustedAlpha",
  "/analysis/targetPower",
  "/analysis/allocationRatio",
  "/analysis/confirmatoryComparisons",
  "/sampleSize/analyzed/group1",
  "/sampleSize/analyzed/group2",
  "/sampleSize/analyzed/total",
  "/sampleSize/enrolled/group1",
  "/sampleSize/enrolled/group2",
  "/sampleSize/enrolled/total",
  "/sensitivity/*/inputEffect",
  "/sensitivity/*/standardizedEffect",
  "/sensitivity/*/sampleSize/analyzed/group1",
  "/sensitivity/*/sampleSize/analyzed/group2",
  "/sensitivity/*/sampleSize/analyzed/total",
  "/sensitivity/*/sampleSize/enrolled/group1",
  "/sensitivity/*/sampleSize/enrolled/group2",
  "/sensitivity/*/sampleSize/enrolled/total",
  "/assumptions/*",
  "/reproducibility/engine",
  "/reproducibility/procedure",
] as const

export function buildStatisticalPowerDisclosureAudit(jsonContract: {
  requiredTopLevelFields: readonly string[]
  assumptions?: { type?: unknown }
  sensitivity?: { fields?: readonly string[] }
}): PublicJsonContractDisclosureAudit {
  const publicFieldPaths = jsonContract.requiredTopLevelFields.map((field) => `/${field}`)
  if (jsonContract.assumptions?.type === "nonempty-string-array") publicFieldPaths.push("/assumptions/*")
  for (const field of jsonContract.sensitivity?.fields ?? []) {
    publicFieldPaths.push(`/sensitivity/*/${field}`)
  }
  return auditPublicJsonContractDisclosure({
    outputPath: "power-analysis.json",
    publicFieldPaths,
    evaluatorFieldPaths: [...EVALUATOR_FIELD_PATHS],
  })
}

const InputSchema = z.object({
  calibrationId: z.string().min(1),
  inputs: z.object({
    lock: BoundFileSchema,
    publicInterface: BoundFileSchema,
    scorer: BoundFileSchema,
    qualification: BoundFileSchema,
    selectedScoredRows: BoundFileSchema,
    executionEnvelopes: BoundFileSchema,
    gate: BoundFileSchema,
  }).strict(),
  disclosure: z.object({
    schemaVersion: z.literal("skill-ir-public-json-contract-disclosure-audit/v1"),
    outputPath: z.literal("power-analysis.json"),
    status: z.enum(["passed", "failed"]),
    counts: z.object({
      publicFieldPaths: z.number().int().nonnegative(),
      evaluatorFieldPaths: z.number().int().nonnegative(),
      undisclosedEvaluatorFieldPaths: z.number().int().nonnegative(),
    }).strict(),
    undisclosedEvaluatorFieldPaths: z.array(z.string()),
  }).strict(),
  qualificationRows: z.number().int().nonnegative(),
  selectedMatrixRows: z.number().int().nonnegative(),
  semanticCompleteRows: z.number().int().nonnegative(),
  activeExecutionFailures: z.number().int().nonnegative(),
  parserOrRuntimeBlockers: z.number().int().nonnegative(),
  parsedPublicReports: z.number().int().nonnegative(),
  topLevelContractReports: z.number().int().nonnegative(),
  strictSchemaReports: z.number().int().nonnegative(),
  numericGatePassed: z.boolean(),
  noSkillMeanScore: z.number().min(0).max(1),
  originalMeanScore: z.number().min(0).max(1),
  differingPairs: z.number().int().nonnegative(),
}).strict()

export function buildStatisticalPowerMeasurementValidity(rawInput: unknown) {
  const input = InputSchema.parse(rawInput)
  const executionInvalid = input.semanticCompleteRows !== input.selectedMatrixRows
    || input.activeExecutionFailures > 0
    || input.parserOrRuntimeBlockers > 0
  const scorerAuthorityInvalid = input.disclosure.status === "failed"
    || input.topLevelContractReports !== input.parsedPublicReports
    || input.strictSchemaReports !== input.parsedPublicReports
  const decision = executionInvalid
    ? "execution-invalid" as const
    : scorerAuthorityInvalid
      ? "measurement-invalid" as const
      : input.numericGatePassed
        ? "baseline-admission-passed" as const
        : "measurement-valid-baseline-blocked" as const
  const blocker = executionInvalid
    ? "execution-observability" as const
    : scorerAuthorityInvalid
      ? "public-scorer-schema-underdetermined" as const
      : input.numericGatePassed
        ? null
        : "baseline-quality-gate" as const
  return {
    schemaVersion: "skill-ir-statistical-power-measurement-validity/v1" as const,
    calibrationId: input.calibrationId,
    inputs: input.inputs,
    execution: {
      selectedRows: input.selectedMatrixRows,
      semanticCompleteRows: input.semanticCompleteRows,
      activeExecutionFailures: input.activeExecutionFailures,
      parserOrRuntimeBlockers: input.parserOrRuntimeBlockers,
    },
    paidCalls: {
      qualification: input.qualificationRows,
      selectedMatrix: input.selectedMatrixRows,
      total: input.qualificationRows + input.selectedMatrixRows,
    },
    scorerAuthority: {
      disclosure: input.disclosure,
      parsedPublicReports: input.parsedPublicReports,
      topLevelContractReports: input.topLevelContractReports,
      strictSchemaReports: input.strictSchemaReports,
    },
    numericGate: {
      passed: input.numericGatePassed,
      noSkillMeanScore: input.noSkillMeanScore,
      originalMeanScore: input.originalMeanScore,
      differingPairs: input.differingPairs,
    },
    decision,
    blocker,
    authorizations: {
      baseIr: decision === "baseline-admission-passed",
      staticResidual: false,
      dynamic: false,
      heldOut: false,
    },
    claimBoundary: "This post-run audit classifies execution health and scorer authority. An invalid measurement does not establish skill benefit, non-benefit, optimization, or cross-model behavior.",
  }
}
