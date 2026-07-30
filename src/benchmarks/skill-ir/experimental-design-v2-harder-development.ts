import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"
import {
  ExperimentalDesignV2StudySchema,
  type ExperimentalDesignV2Study,
} from "./experimental-design-v2-contract.ts"

const CALIBRATION_ID = "experimental-design-v2-pi-post-injection-cleanup-v1"
const PUBLIC_CONTRACT_ID = "experimental-design-public-contract-v2"
const CONTRACT_REVISION = "materialized-delta/v1"
const TASK_PROMPT = [
  "Read study.json and the public design-contract.json without modifying either protected input.",
  "Produce exactly three output files: design/design-plan.json, design/allocation.csv, and design/design-report.md.",
  "Follow the public schemas and semantic rules in design-contract.json.",
  "Do not create any other output.",
].join(" ")

export const EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS = [
  "experimental-design-v2-three-arm-strata-sequential-dev-003",
  "experimental-design-v2-four-arm-cluster-strata-sequential-dev-004",
] as const

const EVALUATORS = [
  ["design-input-integrity", "Protected public inputs remain unchanged", 0.1, "input-integrity"],
  ["design-artifact-contract", "All three public outputs satisfy the artifact contract", 0.1, "artifact-contract"],
  ["design-semantics", "Plan properties match the public study and allocation", 0.25, "design-semantics"],
  ["design-allocation-safety", "Allocation preserves units and public balance invariants", 0.35, "allocation-safety"],
  ["design-report-consistency", "Report evidence is consistent with observable facts", 0.2, "report-consistency"],
] as const

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const EvaluationPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-eval/v2"),
  contractRevision: z.literal(CONTRACT_REVISION),
  check: z.enum([
    "input-integrity",
    "artifact-contract",
    "design-semantics",
    "allocation-safety",
    "report-consistency",
  ]),
  paths: z.object({
    study: z.literal("study.json"),
    contract: z.literal("design-contract.json"),
    plan: z.literal("design/design-plan.json"),
    allocation: z.literal("design/allocation.csv"),
    report: z.literal("design/design-report.md"),
  }).strict(),
  protectedSha256: z.object({
    study: Sha256Schema,
    contract: Sha256Schema,
  }).strict(),
}).strict()

const HarderTaskSchema = z.object({
  id: z.enum(EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS),
  split: z.literal("development"),
  prompt: z.string().min(1),
  fixtures: z.object({
    "study.json": z.string().min(1),
    "design-contract.json": z.string().min(1),
  }).strict(),
  successCriteria: z.array(z.string()).length(0),
  eval: z.array(z.object({
    method: z.literal("custom"),
    id: z.string().min(1),
    name: z.string().min(1),
    weight: z.number().positive(),
    evaluatorId: z.literal("skill-ir-experimental-design-v2"),
    payload: EvaluationPayloadSchema,
  }).strict()).length(5),
  hardGateIds: z.array(z.string().min(1)).length(5),
  passThreshold: z.literal(0.95),
}).strict()

export const ExperimentalDesignV2HarderDevelopmentTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("experimental-design-v2"),
  tasks: z.tuple([HarderTaskSchema, HarderTaskSchema]),
}).strict()

export type ExperimentalDesignV2HarderDevelopmentTaskSet = z.infer<
  typeof ExperimentalDesignV2HarderDevelopmentTaskSetSchema
>
export type ExperimentalDesignV2HarderTask = ExperimentalDesignV2HarderDevelopmentTaskSet["tasks"][number]

function interleavedUnits(
  partitions: Array<{ stratum: string; prefix: string; count: number }>,
): ExperimentalDesignV2Study["units"] {
  const units: ExperimentalDesignV2Study["units"] = []
  const maximum = Math.max(...partitions.map((partition) => partition.count))
  for (let index = 1; index <= maximum; index += 1) {
    for (const partition of partitions) {
      if (index <= partition.count) {
        units.push({
          id: `${partition.prefix}-${String(index).padStart(2, "0")}`,
          stratum: partition.stratum,
        })
      }
    }
  }
  return units
}

function harderStudies(): readonly [ExperimentalDesignV2Study, ExperimentalDesignV2Study] {
  return [
    ExperimentalDesignV2StudySchema.parse({
      studyId: "multisite-three-arm-sequential-v2-dev",
      question: "Which support strategy improves follow-up completion across sites?",
      assignmentLevel: "individual",
      assignmentUnit: "participant",
      analysisUnit: "measurement",
      response: "follow_up_completion",
      arms: ["usual-care", "coaching", "reminder"],
      seed: 137,
      nuisanceFactors: ["site", "enrollment-order"],
      sequentialEnrollment: true,
      units: interleavedUnits([
        { stratum: "site-a", prefix: "A", count: 7 },
        { stratum: "site-b", prefix: "B", count: 8 },
        { stratum: "site-c", prefix: "C", count: 10 },
      ]),
    }),
    ExperimentalDesignV2StudySchema.parse({
      studyId: "regional-four-arm-cluster-sequential-v2-dev",
      question: "Which implementation strategy improves preventive care across clinics?",
      assignmentLevel: "cluster",
      assignmentUnit: "clinic",
      analysisUnit: "patient",
      response: "preventive_care_rate",
      arms: ["usual-care", "digital", "navigator", "combined"],
      seed: 211,
      nuisanceFactors: ["region", "enrollment-order"],
      sequentialEnrollment: true,
      units: interleavedUnits([
        { stratum: "north", prefix: "N", count: 9 },
        { stratum: "central", prefix: "C", count: 10 },
        { stratum: "south", prefix: "S", count: 11 },
      ]),
    }),
  ]
}

function buildTask(
  id: (typeof EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS)[number],
  study: ExperimentalDesignV2Study,
  publicContractText: string,
): ExperimentalDesignV2HarderTask {
  const studyText = `${JSON.stringify(study)}\n`
  const protectedSha256 = {
    study: sha256Bytes(Buffer.from(studyText, "utf8")),
    contract: sha256Bytes(Buffer.from(publicContractText, "utf8")),
  }
  const evalCriteria = EVALUATORS.map(([criterionId, name, weight, check]) => ({
    method: "custom" as const,
    id: criterionId,
    name,
    weight,
    evaluatorId: "skill-ir-experimental-design-v2" as const,
    payload: {
      schemaVersion: "skill-ir-experimental-design-eval/v2" as const,
      contractRevision: CONTRACT_REVISION,
      check,
      paths: {
        study: "study.json" as const,
        contract: "design-contract.json" as const,
        plan: "design/design-plan.json" as const,
        allocation: "design/allocation.csv" as const,
        report: "design/design-report.md" as const,
      },
      protectedSha256,
    },
  }))
  return HarderTaskSchema.parse({
    id,
    split: "development",
    prompt: TASK_PROMPT,
    fixtures: {
      "study.json": studyText,
      "design-contract.json": publicContractText,
    },
    successCriteria: [],
    eval: evalCriteria,
    hardGateIds: EVALUATORS.map(([criterionId]) => criterionId),
    passThreshold: 0.95,
  })
}

function parsePublicContract(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("utf8")
  const value = JSON.parse(text) as { contractId?: string; contractRevision?: string }
  if (value.contractId !== PUBLIC_CONTRACT_ID || value.contractRevision !== CONTRACT_REVISION) {
    throw new Error("Harder development public contract identity mismatch")
  }
  return text
}

export function buildExperimentalDesignV2HarderDevelopmentTaskSet(
  publicContractBytes: Uint8Array,
): ExperimentalDesignV2HarderDevelopmentTaskSet {
  const publicContractText = parsePublicContract(publicContractBytes)
  const studies = harderStudies()
  return ExperimentalDesignV2HarderDevelopmentTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "experimental-design-v2",
    tasks: [
      buildTask(EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS[0], studies[0], publicContractText),
      buildTask(EXPERIMENTAL_DESIGN_V2_HARDER_TASK_IDS[1], studies[1], publicContractText),
    ],
  })
}

function findForbiddenEvidence(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenEvidence(value[index], [...pathParts, String(index)])
      if (found) return found
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:expected|expectedAnswer|gold|goldAnswer|evaluatorExpected|packageAnswer)$/iu.test(key)) {
        return [...pathParts, key].join(".")
      }
      const found = findForbiddenEvidence(nested, [...pathParts, key])
      if (found) return found
    }
    return null
  }
  return null
}

function containsHeldoutEvidence(value: unknown): boolean {
  if (typeof value === "string") return /TEST_ONLY_HELDOUT_V2_/u.test(value)
  if (Array.isArray(value)) return value.some(containsHeldoutEvidence)
  if (value && typeof value === "object") return Object.values(value).some(containsHeldoutEvidence)
  return false
}

export function validateExperimentalDesignV2HarderDevelopmentTaskSet(
  input: unknown,
  publicContractBytes: Uint8Array,
): ExperimentalDesignV2HarderDevelopmentTaskSet {
  const forbidden = findForbiddenEvidence(input)
  if (forbidden) throw new Error(`Harder development task contains forbidden evidence at ${forbidden}`)
  if (containsHeldoutEvidence(input)) {
    throw new Error("Harder development task contains held-out evidence")
  }
  const taskSet = ExperimentalDesignV2HarderDevelopmentTaskSetSchema.parse(input)
  const publicContractText = parsePublicContract(publicContractBytes)
  if (taskSet.tasks.some(
    (task) => task.fixtures["design-contract.json"] !== publicContractText,
  )) {
    throw new Error("Harder development task public contract bytes do not match the frozen contract")
  }
  const expected = buildExperimentalDesignV2HarderDevelopmentTaskSet(publicContractBytes)
  if (!isDeepStrictEqual(taskSet, expected)) {
    throw new Error("Harder development task-set differs from the preregistered public construction")
  }
  return taskSet
}

export function summarizeExperimentalDesignV2HarderTaskComplexity(
  task: ExperimentalDesignV2HarderTask,
): {
  taskId: string
  assignmentLevel: "individual" | "cluster"
  units: number
  arms: number
  strata: number
  sequentialEnrollment: boolean
  analysisUnitDiffers: boolean
  hasFullBlock: boolean
  hasPartialBlock: boolean
} {
  const study = ExperimentalDesignV2StudySchema.parse(JSON.parse(task.fixtures["study.json"]))
  const partitionCounts = new Map<string, number>()
  for (const unit of study.units) {
    const stratum = unit.stratum ?? ""
    partitionCounts.set(stratum, (partitionCounts.get(stratum) ?? 0) + 1)
  }
  const counts = [...partitionCounts.values()]
  return {
    taskId: task.id,
    assignmentLevel: study.assignmentLevel,
    units: study.units.length,
    arms: study.arms.length,
    strata: study.units.every((unit) => unit.stratum !== undefined)
      ? partitionCounts.size
      : 0,
    sequentialEnrollment: study.sequentialEnrollment,
    analysisUnitDiffers: study.assignmentUnit !== study.analysisUnit,
    hasFullBlock: counts.some((count) => count >= study.arms.length),
    hasPartialBlock: counts.some((count) => count % study.arms.length !== 0),
  }
}

const OldTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("experimental-design-v2"),
  tasks: z.array(z.object({
    id: z.string().min(1),
    split: z.literal("development"),
    fixtures: z.object({
      "study.json": z.string().min(1),
      "design-contract.json": z.string().min(1),
    }).passthrough(),
  }).passthrough()).length(2),
}).strict()

const GateSchema = z.object({
  schemaVersion: z.literal("skill-ir-pre-ir-calibration-gate-report/v1"),
  calibrationId: z.literal(CALIBRATION_ID),
  passed: z.literal(false),
  counts: z.object({
    infrastructureFailures: z.number().int().nonnegative(),
    noSkillSemanticFailures: z.number().int().nonnegative(),
    comparablePairs: z.number().int().nonnegative(),
    differingPairs: z.number().int().nonnegative(),
  }).passthrough(),
  systems: z.object({
    "no-skill": z.object({
      rows: z.number().int().positive(),
      successes: z.number().int().nonnegative(),
      meanScore: z.number().min(0).max(1),
    }).passthrough(),
    original: z.object({
      rows: z.number().int().positive(),
      successes: z.number().int().nonnegative(),
      meanScore: z.number().min(0).max(1),
    }).passthrough(),
  }).passthrough(),
  gates: z.object({
    zeroInfrastructure: z.boolean(),
    noSkillNonSaturated: z.boolean(),
    distinguishable: z.boolean(),
  }).passthrough(),
}).passthrough()

const AnalysisSchema = z.object({
  schemaVersion: z.literal("skill-ir-stable-harness-calibration-analysis/v1"),
  calibrationId: z.literal(CALIBRATION_ID),
  status: z.literal("gate-failed"),
  matrix: z.object({
    infrastructureFailures: z.number().int().nonnegative(),
    comparablePairs: z.number().int().nonnegative(),
    differingPairs: z.number().int().nonnegative(),
  }).passthrough(),
  failedGates: z.array(z.string()),
}).passthrough()

const CurrentTaskProfileSchema = z.object({
  taskId: z.string().min(1),
  arms: z.number().int().positive(),
  strata: z.number().int().nonnegative(),
  sequentialEnrollment: z.boolean(),
  analysisUnitDiffers: z.boolean(),
}).strict()

export const ExperimentalDesignV2SaturationAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-saturation-audit/v1"),
  auditId: z.literal("experimental-design-v2-strong-model-saturation-v1"),
  methodEvidence: z.literal(false),
  status: z.literal("passed"),
  inputs: z.object({
    gateSha256: Sha256Schema,
    analysisSha256: Sha256Schema,
    taskSetSha256: Sha256Schema,
    publicContractSha256: Sha256Schema,
  }).strict(),
  currentMatrix: z.object({
    noSkillSuccesses: z.number().int().nonnegative(),
    noSkillRows: z.number().int().positive(),
    noSkillMeanScore: z.number().min(0).max(1),
    infrastructureFailures: z.number().int().nonnegative(),
    comparablePairs: z.number().int().nonnegative(),
    differingPairs: z.number().int().nonnegative(),
  }).strict(),
  currentTaskEnvelope: z.object({
    profiles: z.array(CurrentTaskProfileSchema).length(2),
    maximumArms: z.number().int().positive(),
    maximumStrata: z.number().int().nonnegative(),
    combinesStrataAndSequentialEnrollment: z.boolean(),
    includesAnalysisUnitDifference: z.boolean(),
  }).strict(),
  missingPressure: z.tuple([
    z.literal("three-or-more-arms"),
    z.literal("strata-plus-sequential-enrollment"),
    z.literal("cluster-plus-strata-plus-sequential-enrollment"),
    z.literal("analysis-unit-difference"),
    z.literal("full-plus-partial-blocks"),
  ]),
  allowedNextStep: z.literal("supplemental-development-task-set"),
  claimBoundary: z.string().min(1),
}).strict()

export type ExperimentalDesignV2SaturationAudit = z.infer<
  typeof ExperimentalDesignV2SaturationAuditSchema
>

function currentTaskProfile(task: z.infer<typeof OldTaskSetSchema>["tasks"][number]) {
  const study = ExperimentalDesignV2StudySchema.parse(JSON.parse(task.fixtures["study.json"]))
  const strata = study.units.every((unit) => unit.stratum !== undefined)
    ? new Set(study.units.map((unit) => unit.stratum)).size
    : 0
  return {
    taskId: task.id,
    arms: study.arms.length,
    strata,
    sequentialEnrollment: study.sequentialEnrollment,
    analysisUnitDiffers: study.assignmentUnit !== study.analysisUnit,
  }
}

export function buildExperimentalDesignV2SaturationAudit(input: {
  gateBytes: Uint8Array
  analysisBytes: Uint8Array
  taskSetBytes: Uint8Array
  publicContractBytes: Uint8Array
}): ExperimentalDesignV2SaturationAudit {
  const gate = GateSchema.parse(JSON.parse(Buffer.from(input.gateBytes).toString("utf8")))
  const analysis = AnalysisSchema.parse(JSON.parse(Buffer.from(input.analysisBytes).toString("utf8")))
  const taskSet = OldTaskSetSchema.parse(JSON.parse(Buffer.from(input.taskSetBytes).toString("utf8")))
  const publicContractText = parsePublicContract(input.publicContractBytes)
  if (taskSet.tasks.some(
    (task) => task.fixtures["design-contract.json"] !== publicContractText,
  )) {
    throw new Error("Saturation audit public contract bytes mismatch")
  }
  const noSkill = gate.systems["no-skill"]
  if (
    noSkill.successes !== noSkill.rows
    || noSkill.meanScore !== 1
    || gate.counts.noSkillSemanticFailures !== 0
    || gate.counts.infrastructureFailures !== 0
    || gate.counts.differingPairs !== 0
    || gate.gates.noSkillNonSaturated
    || gate.gates.distinguishable
    || !gate.gates.zeroInfrastructure
    || analysis.matrix.infrastructureFailures !== gate.counts.infrastructureFailures
    || analysis.matrix.comparablePairs !== gate.counts.comparablePairs
    || analysis.matrix.differingPairs !== gate.counts.differingPairs
    || !analysis.failedGates.includes("noSkillNonSaturated")
    || !analysis.failedGates.includes("distinguishable")
  ) {
    throw new Error("Frozen predecessor evidence is not saturated or is inconsistent")
  }
  const profiles = taskSet.tasks.map(currentTaskProfile)
  return ExperimentalDesignV2SaturationAuditSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-saturation-audit/v1",
    auditId: "experimental-design-v2-strong-model-saturation-v1",
    methodEvidence: false,
    status: "passed",
    inputs: {
      gateSha256: sha256Bytes(input.gateBytes),
      analysisSha256: sha256Bytes(input.analysisBytes),
      taskSetSha256: sha256Bytes(input.taskSetBytes),
      publicContractSha256: sha256Bytes(input.publicContractBytes),
    },
    currentMatrix: {
      noSkillSuccesses: noSkill.successes,
      noSkillRows: noSkill.rows,
      noSkillMeanScore: noSkill.meanScore,
      infrastructureFailures: gate.counts.infrastructureFailures,
      comparablePairs: gate.counts.comparablePairs,
      differingPairs: gate.counts.differingPairs,
    },
    currentTaskEnvelope: {
      profiles,
      maximumArms: Math.max(...profiles.map((profile) => profile.arms)),
      maximumStrata: Math.max(...profiles.map((profile) => profile.strata)),
      combinesStrataAndSequentialEnrollment: profiles.some(
        (profile) => profile.strata > 0 && profile.sequentialEnrollment,
      ),
      includesAnalysisUnitDifference: profiles.some((profile) => profile.analysisUnitDiffers),
    },
    missingPressure: [
      "three-or-more-arms",
      "strata-plus-sequential-enrollment",
      "cluster-plus-strata-plus-sequential-enrollment",
      "analysis-unit-difference",
      "full-plus-partial-blocks",
    ],
    allowedNextStep: "supplemental-development-task-set",
    claimBoundary: "This audit justifies a development-only task supplement; it is not optimization or evaluation-split evidence.",
  })
}
