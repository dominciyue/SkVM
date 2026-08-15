import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import { promisify } from "node:util"
import { z } from "zod"

const execFileAsync = promisify(execFile)
const NonEmptyStringSchema = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const ProbabilitySchema = z.number().finite().gt(0).lt(1)
const PositiveFiniteSchema = z.number().finite().positive()
const EVALUATOR_ID = "skill-ir-statistical-power"

export const STATISTICAL_POWER_DEVELOPMENT_TASK_IDS = [
  "statistical-power-unequal-means-dev-001",
  "statistical-power-two-proportions-dev-002",
] as const

const BaseStudySchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-study/v1"),
  studyId: NonEmptyStringSchema,
  question: NonEmptyStringSchema,
  alternative: z.literal("two-sided"),
  targetPower: ProbabilitySchema,
  errorControl: z.object({
    familyAlpha: ProbabilitySchema,
    method: z.literal("bonferroni"),
    confirmatoryComparisons: z.number().int().min(2),
  }).strict(),
  allocationRatio: PositiveFiniteSchema.refine((value) => value !== 1, "allocation must be unequal"),
  attritionRate: z.number().finite().gt(0).lt(0.5),
  effectBasis: z.object({
    kind: z.literal("sesoi"),
    rationale: NonEmptyStringSchema,
  }).strict(),
})

function validateSensitivity(
  effect: { planningValue: number; sensitivityValues: number[] },
  context: z.RefinementCtx,
): void {
  if (new Set(effect.sensitivityValues).size !== effect.sensitivityValues.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effect", "sensitivityValues"], message: "sensitivity values must be unique" })
  }
  if (!effect.sensitivityValues.includes(effect.planningValue)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effect", "sensitivityValues"], message: "sensitivity values must include the planning value" })
  }
}

const IndependentMeansStudySchema = BaseStudySchema.extend({
  design: z.object({ test: z.literal("t_ind"), groups: z.literal(2) }).strict(),
  effect: z.object({
    metric: z.literal("cohens-d"),
    planningValue: PositiveFiniteSchema,
    sensitivityValues: z.array(PositiveFiniteSchema).length(3),
  }).strict(),
}).strict().superRefine((study, context) => validateSensitivity(study.effect, context))

const TwoProportionsStudySchema = BaseStudySchema.extend({
  design: z.object({ test: z.literal("two_proportions"), groups: z.literal(2) }).strict(),
  effect: z.object({
    metric: z.literal("group2-proportion"),
    referenceProportion: ProbabilitySchema,
    planningValue: ProbabilitySchema,
    sensitivityValues: z.array(ProbabilitySchema).length(3),
  }).strict(),
}).strict().superRefine((study, context) => {
  validateSensitivity(study.effect, context)
  if (study.effect.sensitivityValues.some((value) => value === study.effect.referenceProportion)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effect"], message: "proportion effects must differ from the reference" })
  }
})

export const StatisticalPowerStudySchema = z.union([
  IndependentMeansStudySchema,
  TwoProportionsStudySchema,
])

export type StatisticalPowerStudy = z.infer<typeof StatisticalPowerStudySchema>

const SampleCountsSchema = z.object({
  group1: z.number().int().positive(),
  group2: z.number().int().positive(),
  total: z.number().int().positive(),
}).strict().superRefine((counts, context) => {
  if (counts.total !== counts.group1 + counts.group2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["total"], message: "total must equal both groups" })
  }
})

const SampleSizeSchema = z.object({
  analyzed: SampleCountsSchema,
  enrolled: SampleCountsSchema,
}).strict()

export const StatisticalPowerReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-report/v1"),
  studyId: NonEmptyStringSchema,
  analysis: z.object({
    test: z.enum(["t_ind", "two_proportions"]),
    alternative: z.literal("two-sided"),
    effectBasis: z.literal("sesoi"),
    effectMetric: z.enum(["cohens-d", "cohens-h"]),
    familyAlpha: ProbabilitySchema,
    adjustedAlpha: ProbabilitySchema,
    targetPower: ProbabilitySchema,
    allocationRatio: PositiveFiniteSchema,
    confirmatoryComparisons: z.number().int().min(2),
  }).strict(),
  sampleSize: SampleSizeSchema,
  sensitivity: z.array(z.object({
    inputEffect: PositiveFiniteSchema,
    standardizedEffect: PositiveFiniteSchema,
    sampleSize: SampleSizeSchema,
  }).strict()).length(3),
  assumptions: z.array(NonEmptyStringSchema).min(2),
  reproducibility: z.object({
    engine: NonEmptyStringSchema,
    procedure: NonEmptyStringSchema,
  }).strict(),
}).strict()

const StatisticalPowerPublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-interface/v1"),
  interfaceId: z.literal("statistical-power-public-interface-v1"),
  protectedInputs: z.tuple([z.literal("study.json"), z.literal("power-interface.json")]),
  outputs: z.tuple([z.literal("power-analysis.json"), z.literal("power-analysis.md")]),
  jsonContract: z.object({
    schemaVersion: z.literal("skill-ir-statistical-power-report/v1"),
    requiredTopLevelFields: z.tuple([
      z.literal("schemaVersion"),
      z.literal("studyId"),
      z.literal("analysis"),
      z.literal("sampleSize"),
      z.literal("sensitivity"),
      z.literal("assumptions"),
      z.literal("reproducibility"),
    ]),
    sampleCountType: z.literal("positive-integer"),
    probabilityType: z.literal("finite-number-between-zero-and-one"),
    assumptions: z.object({ type: z.literal("nonempty-string-array"), order: z.literal("set-like"), duplicates: z.literal("forbid") }).strict(),
    sensitivity: z.object({
      type: z.literal("object-array"),
      fields: z.tuple([z.literal("inputEffect"), z.literal("standardizedEffect"), z.literal("sampleSize")]),
      arraySemantics: z.object({ order: z.literal("study-declared"), duplicates: z.literal("forbid") }).strict(),
    }).strict(),
    allowAdditionalJsonFields: z.literal(false),
  }).strict(),
  markdownContract: z.object({
    type: z.literal("nonempty-utf8-markdown"),
    mustAgreeWithJson: z.literal(true),
    freeTextLanguage: z.literal("any"),
  }).strict(),
  outputPolicy: z.object({ exactOutputSet: z.literal(true), allowNetwork: z.literal(false) }).strict(),
}).strict()

export type StatisticalPowerPublicInterface = z.infer<typeof StatisticalPowerPublicInterfaceSchema>

export function buildStatisticalPowerPublicInterface(): StatisticalPowerPublicInterface {
  return StatisticalPowerPublicInterfaceSchema.parse({
    schemaVersion: "skill-ir-statistical-power-interface/v1",
    interfaceId: "statistical-power-public-interface-v1",
    protectedInputs: ["study.json", "power-interface.json"],
    outputs: ["power-analysis.json", "power-analysis.md"],
    jsonContract: {
      schemaVersion: "skill-ir-statistical-power-report/v1",
      requiredTopLevelFields: ["schemaVersion", "studyId", "analysis", "sampleSize", "sensitivity", "assumptions", "reproducibility"],
      sampleCountType: "positive-integer",
      probabilityType: "finite-number-between-zero-and-one",
      assumptions: { type: "nonempty-string-array", order: "set-like", duplicates: "forbid" },
      sensitivity: {
        type: "object-array",
        fields: ["inputEffect", "standardizedEffect", "sampleSize"],
        arraySemantics: { order: "study-declared", duplicates: "forbid" },
      },
      allowAdditionalJsonFields: false,
    },
    markdownContract: { type: "nonempty-utf8-markdown", mustAgreeWithJson: true, freeTextLanguage: "any" },
    outputPolicy: { exactOutputSet: true, allowNetwork: false },
  })
}

export const StatisticalPowerGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-eval/v1"),
  check: z.enum([
    "input-integrity",
    "artifact-contract",
    "analysis-alignment",
    "multiplicity",
    "allocation-attrition",
    "sensitivity-effect-basis",
  ]),
  paths: z.object({
    study: z.literal("study.json"),
    interface: z.literal("power-interface.json"),
    reportJson: z.literal("power-analysis.json"),
    reportMarkdown: z.literal("power-analysis.md"),
  }).strict(),
  protectedSha256: z.object({ study: Sha256Schema, interface: Sha256Schema }).strict(),
}).strict()

const TaskSchema = z.object({
  id: z.enum(STATISTICAL_POWER_DEVELOPMENT_TASK_IDS),
  split: z.literal("development"),
  prompt: NonEmptyStringSchema,
  fixtures: z.object({ "study.json": z.string().min(1), "power-interface.json": z.string().min(1) }).strict(),
  successCriteria: z.array(z.string()).length(0),
  eval: z.array(z.object({
    method: z.literal("custom"),
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    weight: z.number().positive(),
    evaluatorId: z.literal(EVALUATOR_ID),
    payload: StatisticalPowerGradePayloadSchema,
  }).strict()).length(6),
  hardGateIds: z.array(NonEmptyStringSchema).length(6),
  passThreshold: z.literal(1),
}).strict()

export const StatisticalPowerTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("statistical-power"),
  tasks: z.tuple([TaskSchema, TaskSchema]),
}).strict()

export type StatisticalPowerTaskSet = z.infer<typeof StatisticalPowerTaskSetSchema>

const TASK_PROMPT = [
  "Read study.json and power-interface.json without modifying either protected input.",
  "Prepare a defensible, reproducible a priori sample-size justification for the described study.",
  "Produce exactly power-analysis.json and power-analysis.md under the public field contract.",
  "Do not create any other output or use the network.",
].join(" ")

const EVALUATORS = [
  ["power-input-integrity", "Protected study and interface remain unchanged", 0.1, "input-integrity"],
  ["power-artifact-contract", "The exact public output contract is satisfied", 0.1, "artifact-contract"],
  ["power-analysis-alignment", "The analysis matches the declared study design", 0.15, "analysis-alignment"],
  ["power-multiplicity", "Family-wise error control is represented correctly", 0.15, "multiplicity"],
  ["power-allocation-attrition", "Analyzed and enrolled group sizes respect design losses", 0.2, "allocation-attrition"],
  ["power-sensitivity-effect-basis", "SESOI sensitivity and reproducibility are complete", 0.3, "sensitivity-effect-basis"],
] as const

const DEVELOPMENT_STUDIES: readonly [StatisticalPowerStudy, StatisticalPowerStudy] = [
  StatisticalPowerStudySchema.parse({
    schemaVersion: "skill-ir-statistical-power-study/v1",
    studyId: "confirmatory-unequal-means-dev",
    question: "What enrollment supports the confirmatory comparison under the stated design?",
    design: { test: "t_ind", groups: 2 },
    alternative: "two-sided",
    targetPower: 0.9,
    errorControl: { familyAlpha: 0.05, method: "bonferroni", confirmatoryComparisons: 2 },
    allocationRatio: 2,
    attritionRate: 0.15,
    effectBasis: { kind: "sesoi", rationale: "d=0.45 is the smallest standardized difference that would change the adoption decision." },
    effect: { metric: "cohens-d", planningValue: 0.45, sensitivityValues: [0.35, 0.45, 0.55] },
  }),
  StatisticalPowerStudySchema.parse({
    schemaVersion: "skill-ir-statistical-power-study/v1",
    studyId: "confirmatory-two-proportions-dev",
    question: "What enrollment supports the confirmatory response-rate comparison under the stated design?",
    design: { test: "two_proportions", groups: 2 },
    alternative: "two-sided",
    targetPower: 0.85,
    errorControl: { familyAlpha: 0.05, method: "bonferroni", confirmatoryComparisons: 3 },
    allocationRatio: 1.5,
    attritionRate: 0.1,
    effectBasis: { kind: "sesoi", rationale: "A response rate of 0.50 versus 0.35 is the smallest difference that changes the deployment decision." },
    effect: { metric: "group2-proportion", referenceProportion: 0.35, planningValue: 0.5, sensitivityValues: [0.45, 0.5, 0.55] },
  }),
]

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function buildTask(
  id: typeof STATISTICAL_POWER_DEVELOPMENT_TASK_IDS[number],
  study: StatisticalPowerStudy,
  publicInterfaceText: string,
): StatisticalPowerTaskSet["tasks"][number] {
  const studyText = json(study)
  const paths = { study: "study.json", interface: "power-interface.json", reportJson: "power-analysis.json", reportMarkdown: "power-analysis.md" } as const
  const protectedSha256 = { study: sha256(studyText), interface: sha256(publicInterfaceText) }
  return TaskSchema.parse({
    id,
    split: "development",
    prompt: TASK_PROMPT,
    fixtures: { "study.json": studyText, "power-interface.json": publicInterfaceText },
    successCriteria: [],
    eval: EVALUATORS.map(([criterionId, name, weight, check]) => ({
      method: "custom" as const,
      id: criterionId,
      name,
      weight,
      evaluatorId: EVALUATOR_ID,
      payload: { schemaVersion: "skill-ir-statistical-power-eval/v1" as const, check, paths, protectedSha256 },
    })),
    hardGateIds: EVALUATORS.map(([criterionId]) => criterionId),
    passThreshold: 1,
  })
}

export function buildStatisticalPowerDevelopmentTaskSet(
  publicInterface: StatisticalPowerPublicInterface = buildStatisticalPowerPublicInterface(),
): StatisticalPowerTaskSet {
  const parsedInterface = StatisticalPowerPublicInterfaceSchema.parse(publicInterface)
  const interfaceText = json(parsedInterface)
  return StatisticalPowerTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "statistical-power",
    tasks: [
      buildTask(STATISTICAL_POWER_DEVELOPMENT_TASK_IDS[0], DEVELOPMENT_STUDIES[0], interfaceText),
      buildTask(STATISTICAL_POWER_DEVELOPMENT_TASK_IDS[1], DEVELOPMENT_STUDIES[1], interfaceText),
    ],
  })
}

type SampleSize = z.infer<typeof SampleSizeSchema>

export type StatisticalPowerOracleEntry = {
  inputEffect: number
  standardizedEffect: number
  sampleSize: SampleSize
}

export type StatisticalPowerOracle = {
  adjustedAlpha: number
  planning: StatisticalPowerOracleEntry
  sensitivity: StatisticalPowerOracleEntry[]
}

function cohenH(reference: number, comparison: number): number {
  return Math.abs(2 * Math.asin(Math.sqrt(reference)) - 2 * Math.asin(Math.sqrt(comparison)))
}

function sampleSize(rawGroup1: number, ratio: number, attritionRate: number): SampleSize {
  const group1 = Math.ceil(rawGroup1)
  const group2 = Math.ceil(rawGroup1 * ratio)
  const enrolledGroup1 = Math.ceil(group1 / (1 - attritionRate))
  const enrolledGroup2 = Math.ceil(group2 / (1 - attritionRate))
  return SampleSizeSchema.parse({
    analyzed: { group1, group2, total: group1 + group2 },
    enrolled: { group1: enrolledGroup1, group2: enrolledGroup2, total: enrolledGroup1 + enrolledGroup2 },
  })
}

const PYTHON_ORACLE = [
  "import importlib.util,json,sys",
  "spec=importlib.util.spec_from_file_location('skill_power',sys.argv[1])",
  "mod=importlib.util.module_from_spec(spec)",
  "spec.loader.exec_module(mod)",
  "study=json.loads(sys.argv[2])",
  "alpha=study['familyAlpha']/study['comparisons']",
  "out=[]",
  "for effect in study['effects']:",
  "  kw=dict(test=study['test'],alpha=alpha,power=study['power'],alternative='two-sided',ratio=study['ratio'],round_up=False)",
  "  if study['test']=='t_ind': kw['effect_size']=effect",
  "  else: kw.update(prop1=study['referenceProportion'],prop2=effect)",
  "  out.append(float(mod.sample_size(**kw)))",
  "print(json.dumps(out,separators=(',',':')))",
].join("\n")

const statisticalPowerOracleCache = new Map<string, Promise<StatisticalPowerOracle>>()

export async function deriveStatisticalPowerOracle(
  rawStudy: unknown,
  options: { pythonExecutable?: string; powerScriptPath?: string } = {},
): Promise<StatisticalPowerOracle> {
  const study = StatisticalPowerStudySchema.parse(rawStudy)
  const effects = study.effect.sensitivityValues
  const powerScriptPath = options.powerScriptPath ?? path.resolve(
    import.meta.dir,
    "../../../benchmarks/skill-ir/pilots/statistical-power/source/scripts/power.py",
  )
  const pythonExecutable = options.pythonExecutable ?? (process.env.SKVM_PYTHON?.trim() || "python")
  const request = {
    test: study.design.test,
    familyAlpha: study.errorControl.familyAlpha,
    comparisons: study.errorControl.confirmatoryComparisons,
    power: study.targetPower,
    ratio: study.allocationRatio,
    effects,
    ...(study.effect.metric === "group2-proportion" ? { referenceProportion: study.effect.referenceProportion } : {}),
  }
  const cacheKey = JSON.stringify({ pythonExecutable, powerScriptPath, request })
  const cached = statisticalPowerOracleCache.get(cacheKey)
  if (cached) return structuredClone(await cached)

  const computation = (async (): Promise<StatisticalPowerOracle> => {
    const { stdout } = await execFileAsync(
      pythonExecutable,
      ["-c", PYTHON_ORACLE, powerScriptPath, JSON.stringify(request)],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    )
    const rawSizes = z.array(PositiveFiniteSchema).length(effects.length).parse(JSON.parse(stdout.trim()))
    const sensitivity = effects.map((inputEffect, index): StatisticalPowerOracleEntry => ({
      inputEffect,
      standardizedEffect: study.effect.metric === "cohens-d"
        ? inputEffect
        : cohenH(study.effect.referenceProportion, inputEffect),
      sampleSize: sampleSize(rawSizes[index]!, study.allocationRatio, study.attritionRate),
    }))
    const planning = sensitivity.find((entry) => entry.inputEffect === study.effect.planningValue)
    if (!planning) throw new Error("planning effect is absent from the sensitivity oracle")
    return {
      adjustedAlpha: study.errorControl.familyAlpha / study.errorControl.confirmatoryComparisons,
      planning,
      sensitivity,
    }
  })()
  statisticalPowerOracleCache.set(cacheKey, computation)
  try {
    return structuredClone(await computation)
  } catch (error) {
    statisticalPowerOracleCache.delete(cacheKey)
    throw error
  }
}

const BoundDigestSchema = z.object({ path: NonEmptyStringSchema, sha256: Sha256Schema }).strict()

export const StatisticalPowerDevelopmentAuthorizationSchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-development-authorization/v1"),
  authorizationId: z.literal("statistical-power-development-v1"),
  inputs: z.object({
    taskSet: BoundDigestSchema,
    publicInterface: BoundDigestSchema,
    selectionPolicy: BoundDigestSchema,
    selectionReport: BoundDigestSchema,
  }).strict(),
  phases: z.tuple([
    z.object({
      id: z.literal("calibration"),
      systems: z.tuple([z.literal("no-skill"), z.literal("original")]),
      taskCount: z.literal(2), repetitionsPerTask: z.literal(2), retries: z.literal(0), maxPaidCalls: z.literal(8),
      requires: z.tuple([z.literal("contract-audit-passed"), z.literal("contribution-identifiability-eligible")]),
    }).strict(),
    z.object({
      id: z.literal("static-residual"),
      systems: z.tuple([z.literal("original"), z.literal("ir-static")]),
      taskCount: z.literal(2), repetitionsPerTask: z.literal(2), retries: z.literal(0), maxPaidCalls: z.literal(8),
      requires: z.tuple([z.literal("baseline-admission-passed"), z.literal("source-audited-base-ir")]),
    }).strict(),
    z.object({
      id: z.literal("conditional-dynamic"),
      systems: z.tuple([z.literal("ir-pgo-dev")]),
      taskCount: z.literal(2), repetitionsPerTask: z.literal(2), retries: z.literal(0), maxPaidCalls: z.literal(4),
      requires: z.tuple([z.literal("dual-source-residual-admission-eligible")]),
    }).strict(),
  ]),
  maximumPaidCallsAcrossEligiblePhases: z.literal(20),
  stopOnFailedPhase: z.literal(true),
  heldout: z.object({
    status: z.literal("not-authored"),
    permitsExecution: z.literal(false),
    futureTasksRequireFreshIsolation: z.literal(true),
  }).strict(),
}).strict()

export type StatisticalPowerDevelopmentAuthorization = z.infer<
  typeof StatisticalPowerDevelopmentAuthorizationSchema
>

export function buildStatisticalPowerDevelopmentAuthorization(input: {
  taskSetSha256: string
  publicInterfaceSha256: string
  selectionPolicySha256: string
  selectionReportSha256: string
}): StatisticalPowerDevelopmentAuthorization {
  return StatisticalPowerDevelopmentAuthorizationSchema.parse({
    schemaVersion: "skill-ir-statistical-power-development-authorization/v1",
    authorizationId: "statistical-power-development-v1",
    inputs: {
      taskSet: { path: "benchmarks/skill-ir/pilots/statistical-power/development/tasks.json", sha256: input.taskSetSha256 },
      publicInterface: { path: "benchmarks/skill-ir/pilots/statistical-power/public-interface.json", sha256: input.publicInterfaceSha256 },
      selectionPolicy: { path: "benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json", sha256: input.selectionPolicySha256 },
      selectionReport: { path: "results/skill-ir/prospective-dynamic-candidate.json", sha256: input.selectionReportSha256 },
    },
    phases: [
      { id: "calibration", systems: ["no-skill", "original"], taskCount: 2, repetitionsPerTask: 2, retries: 0, maxPaidCalls: 8, requires: ["contract-audit-passed", "contribution-identifiability-eligible"] },
      { id: "static-residual", systems: ["original", "ir-static"], taskCount: 2, repetitionsPerTask: 2, retries: 0, maxPaidCalls: 8, requires: ["baseline-admission-passed", "source-audited-base-ir"] },
      { id: "conditional-dynamic", systems: ["ir-pgo-dev"], taskCount: 2, repetitionsPerTask: 2, retries: 0, maxPaidCalls: 4, requires: ["dual-source-residual-admission-eligible"] },
    ],
    maximumPaidCallsAcrossEligiblePhases: 20,
    stopOnFailedPhase: true,
    heldout: { status: "not-authored", permitsExecution: false, futureTasksRequireFreshIsolation: true },
  })
}
