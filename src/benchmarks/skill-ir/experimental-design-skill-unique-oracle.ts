import { z } from "zod"
import {
  ExperimentalDesignSkillUniqueStudyGraphSchema,
} from "./experimental-design-skill-unique-contract.ts"

const NonEmptyStringSchema = z.string().trim().min(1)

export const ExperimentalDesignSkillUniqueReplicationPlanSchema = z.object({
  studyId: NonEmptyStringSchema,
  independentReplicateUnit: NonEmptyStringSchema,
  independentReplicateCount: z.number().int().positive(),
  measurementUnit: NonEmptyStringSchema,
  pseudoreplicationRisk: z.boolean(),
  rationale: NonEmptyStringSchema,
}).passthrough()

export const ExperimentalDesignSkillUniqueAnalysisPlanSchema = z.object({
  studyId: NonEmptyStringSchema,
  analysisUnit: NonEmptyStringSchema,
  groupingFactors: z.array(NonEmptyStringSchema),
  method: NonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
}).passthrough()

export type ExperimentalDesignSkillUniqueConfirmedOracle = {
  status: "confirmed"
  studyId: string
  independentReplicateUnit: string
  independentReplicateCount: number
  measurementUnit: string
  pseudoreplicationRisk: boolean
  lineage: string[]
}

export type ExperimentalDesignSkillUniqueOracle =
  | ExperimentalDesignSkillUniqueConfirmedOracle
  | { status: "unconfirmed"; reason: "invalid-public-study-graph" }

export function deriveExperimentalDesignSkillUniqueOracle(
  input: unknown,
): ExperimentalDesignSkillUniqueOracle {
  const parsed = ExperimentalDesignSkillUniqueStudyGraphSchema.safeParse(input)
  if (!parsed.success) {
    return { status: "unconfirmed", reason: "invalid-public-study-graph" }
  }

  const graph = parsed.data
  const byType = new Map(graph.entities.map((entity) => [entity.type, entity] as const))
  const replicate = graph.treatment.assignedToEntityType
  const measurement = graph.response.observedOnEntityType
  const reverseLineage: string[] = []
  let current: string | null = measurement
  while (current !== null) {
    reverseLineage.push(current)
    if (current === replicate) break
    current = byType.get(current)?.parentType ?? null
  }
  if (reverseLineage.at(-1) !== replicate) {
    return { status: "unconfirmed", reason: "invalid-public-study-graph" }
  }

  return {
    status: "confirmed",
    studyId: graph.studyId,
    independentReplicateUnit: replicate,
    independentReplicateCount: byType.get(replicate)!.totalCount,
    measurementUnit: measurement,
    pseudoreplicationRisk: replicate !== measurement,
    lineage: reverseLineage.reverse(),
  }
}

export type ExperimentalDesignSkillUniqueAnalysisAssessment =
  | { valid: true; requiredGroupingFactors: string[] }
  | {
      valid: false
      requiredGroupingFactors: string[]
      reason:
        | "invalid-analysis-plan"
        | "study-id-mismatch"
        | "analysis-unit-outside-lineage"
        | "duplicate-grouping-factor"
        | "grouping-factor-mismatch"
    }

export function assessExperimentalDesignSkillUniqueAnalysis(
  oracle: ExperimentalDesignSkillUniqueConfirmedOracle,
  input: unknown,
): ExperimentalDesignSkillUniqueAnalysisAssessment {
  const parsed = ExperimentalDesignSkillUniqueAnalysisPlanSchema.safeParse(input)
  if (!parsed.success) {
    return {
      valid: false,
      requiredGroupingFactors: [],
      reason: "invalid-analysis-plan",
    }
  }
  const plan = parsed.data
  if (plan.studyId !== oracle.studyId) {
    return {
      valid: false,
      requiredGroupingFactors: [],
      reason: "study-id-mismatch",
    }
  }
  const analysisIndex = oracle.lineage.indexOf(plan.analysisUnit)
  if (analysisIndex < 0) {
    return {
      valid: false,
      requiredGroupingFactors: [],
      reason: "analysis-unit-outside-lineage",
    }
  }
  const requiredGroupingFactors = oracle.lineage.slice(0, analysisIndex)
  if (new Set(plan.groupingFactors).size !== plan.groupingFactors.length) {
    return {
      valid: false,
      requiredGroupingFactors,
      reason: "duplicate-grouping-factor",
    }
  }
  const submitted = new Set(plan.groupingFactors)
  if (
    submitted.size !== requiredGroupingFactors.length ||
    requiredGroupingFactors.some((factor) => !submitted.has(factor))
  ) {
    return {
      valid: false,
      requiredGroupingFactors,
      reason: "grouping-factor-mismatch",
    }
  }
  return { valid: true, requiredGroupingFactors }
}
