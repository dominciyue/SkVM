import { isDeepStrictEqual } from "node:util"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"

const CAPABILITY_ID = "experimental-design-v2-skill-unique"
const INTERFACE_ID = "experimental-design-skill-unique-interface-v1"
const EVALUATOR_ID = "skill-ir-experimental-design-skill-unique"
const NonEmptyStringSchema = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS = [
  "experimental-design-skill-unique-cage-cell-dev-001",
  "experimental-design-skill-unique-repeated-visit-dev-002",
] as const

export const EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS = [
  "experimental-design-skill-unique-tank-fish-heldout-001",
  "experimental-design-skill-unique-classroom-assessment-heldout-002",
] as const

const EntitySchema = z.object({
  type: NonEmptyStringSchema,
  parentType: NonEmptyStringSchema.nullable(),
  totalCount: z.number().int().positive(),
}).strict()

export const ExperimentalDesignSkillUniqueStudyGraphSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-study-graph/v1"),
  studyId: NonEmptyStringSchema,
  question: NonEmptyStringSchema,
  entities: z.array(EntitySchema).min(1),
  treatment: z.object({
    name: NonEmptyStringSchema,
    assignedToEntityType: NonEmptyStringSchema,
  }).strict(),
  response: z.object({
    name: NonEmptyStringSchema,
    observedOnEntityType: NonEmptyStringSchema,
  }).strict(),
}).strict().superRefine((graph, context) => {
  const types = graph.entities.map((entity) => entity.type)
  const typeSet = new Set(types)
  if (typeSet.size !== types.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities"],
      message: "entity types must be unique",
    })
    return
  }

  const roots = graph.entities.filter((entity) => entity.parentType === null)
  if (roots.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities"],
      message: "study graph must have exactly one root",
    })
  }
  for (const [index, entity] of graph.entities.entries()) {
    if (entity.parentType !== null && !typeSet.has(entity.parentType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entities", index, "parentType"],
        message: "parent type must name an entity",
      })
    }
  }

  const parentByType = new Map(
    graph.entities.map((entity) => [entity.type, entity.parentType] as const),
  )
  const reachesRoot = (start: string): boolean => {
    const seen = new Set<string>()
    let current: string | null | undefined = start
    while (current !== null && current !== undefined) {
      if (seen.has(current)) return false
      seen.add(current)
      current = parentByType.get(current)
    }
    return current === null
  }
  if (types.some((type) => !reachesRoot(type))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entities"],
      message: "study graph must be acyclic and connected",
    })
  }

  const assigned = graph.treatment.assignedToEntityType
  const observed = graph.response.observedOnEntityType
  if (!typeSet.has(assigned)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["treatment", "assignedToEntityType"],
      message: "treatment entity must exist",
    })
  }
  if (!typeSet.has(observed)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["response", "observedOnEntityType"],
      message: "response entity must exist",
    })
  }
  if (typeSet.has(assigned) && typeSet.has(observed)) {
    let current: string | null | undefined = observed
    let connected = false
    while (current !== null && current !== undefined) {
      if (current === assigned) {
        connected = true
        break
      }
      current = parentByType.get(current)
    }
    if (!connected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response", "observedOnEntityType"],
        message: "response entity must equal or descend from treatment entity",
      })
    }
  }
})

export type ExperimentalDesignSkillUniqueStudyGraph = z.infer<
  typeof ExperimentalDesignSkillUniqueStudyGraphSchema
>

const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-interface/v1"),
  interfaceId: z.literal(INTERFACE_ID),
  protectedInputs: z.tuple([
    z.literal("study-graph.json"),
    z.literal("analysis-interface.json"),
  ]),
  outputs: z.tuple([
    z.literal("design/replication-plan.json"),
    z.literal("design/analysis-plan.json"),
  ]),
  entityTypeRule: NonEmptyStringSchema,
  replicationPlan: z.object({
    requiredFields: z.tuple([
      z.literal("studyId"),
      z.literal("independentReplicateUnit"),
      z.literal("independentReplicateCount"),
      z.literal("measurementUnit"),
      z.literal("pseudoreplicationRisk"),
      z.literal("rationale"),
    ]),
    fieldTypes: z.object({
      studyId: z.literal("string"),
      independentReplicateUnit: z.literal("entity-type-string"),
      independentReplicateCount: z.literal("positive-integer"),
      measurementUnit: z.literal("entity-type-string"),
      pseudoreplicationRisk: z.literal("boolean"),
      rationale: z.literal("nonempty-free-text"),
    }).strict(),
  }).strict(),
  analysisPlan: z.object({
    requiredFields: z.tuple([
      z.literal("studyId"),
      z.literal("analysisUnit"),
      z.literal("groupingFactors"),
      z.literal("method"),
      z.literal("rationale"),
    ]),
    fieldTypes: z.object({
      studyId: z.literal("string"),
      analysisUnit: z.literal("entity-type-string"),
      groupingFactors: z.literal("unique-entity-type-string-array"),
      method: z.literal("nonempty-free-text"),
      rationale: z.literal("nonempty-free-text"),
    }).strict(),
  }).strict(),
  outputPolicy: z.object({
    exactOutputSet: z.literal(true),
    allowAdditionalJsonFields: z.literal(true),
    freeTextLanguage: z.literal("any"),
  }).strict(),
}).strict()

export type ExperimentalDesignSkillUniquePublicInterface = z.infer<
  typeof PublicInterfaceSchema
>

const PathsSchema = z.object({
  studyGraph: z.literal("study-graph.json"),
  interface: z.literal("analysis-interface.json"),
  replicationPlan: z.literal("design/replication-plan.json"),
  analysisPlan: z.literal("design/analysis-plan.json"),
}).strict()

const EvaluationPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-eval/v1"),
  check: z.enum([
    "input-integrity",
    "artifact-contract",
    "independent-replication",
    "pseudoreplication-guard",
    "analysis-alignment",
  ]),
  paths: PathsSchema,
  protectedSha256: z.object({
    studyGraph: Sha256Schema,
    interface: Sha256Schema,
  }).strict(),
}).strict()

const TaskSchema = z.object({
  id: NonEmptyStringSchema,
  split: z.enum(["development", "heldout"]),
  prompt: NonEmptyStringSchema,
  fixtures: z.object({
    "study-graph.json": z.string().min(1),
    "analysis-interface.json": z.string().min(1),
  }).strict(),
  successCriteria: z.array(z.string()).length(0),
  eval: z.array(z.object({
    method: z.literal("custom"),
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    weight: z.number().positive(),
    evaluatorId: z.literal(EVALUATOR_ID),
    payload: EvaluationPayloadSchema,
  }).strict()).length(5),
  hardGateIds: z.array(NonEmptyStringSchema).length(5),
  passThreshold: z.literal(1),
}).strict()

export const ExperimentalDesignSkillUniqueTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal(CAPABILITY_ID),
  tasks: z.tuple([TaskSchema, TaskSchema]),
}).strict()

export type ExperimentalDesignSkillUniqueTaskSet = z.infer<
  typeof ExperimentalDesignSkillUniqueTaskSetSchema
>

const TASK_PROMPT = [
  "Read study-graph.json and analysis-interface.json without modifying either protected input.",
  "Produce exactly design/replication-plan.json and design/analysis-plan.json.",
  "Use only entity types present in the study graph and follow the public field contract.",
  "Do not create any other output.",
].join(" ")

const EVALUATORS = [
  ["skill-unique-input-integrity", "Protected public inputs remain unchanged", 0.1, "input-integrity"],
  ["skill-unique-artifact-contract", "Both public outputs satisfy the artifact contract", 0.1, "artifact-contract"],
  ["skill-unique-independent-replication", "Independent replicate identity and count match the study structure", 0.3, "independent-replication"],
  ["skill-unique-pseudoreplication-guard", "Measurement level is not misreported as independent replication", 0.2, "pseudoreplication-guard"],
  ["skill-unique-analysis-alignment", "Analysis unit and grouping factors respect the study hierarchy", 0.3, "analysis-alignment"],
] as const

const DEVELOPMENT_GRAPHS: readonly [
  ExperimentalDesignSkillUniqueStudyGraph,
  ExperimentalDesignSkillUniqueStudyGraph,
] = [
  ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
    schemaVersion: "skill-ir-experimental-design-study-graph/v1",
    studyId: "diet-cage-cell-response-dev",
    question: "Does the diet change the cellular response in housed mice?",
    entities: [
      { type: "cage", parentType: null, totalCount: 8 },
      { type: "mouse", parentType: "cage", totalCount: 32 },
      { type: "cell", parentType: "mouse", totalCount: 3200 },
    ],
    treatment: { name: "diet", assignedToEntityType: "cage" },
    response: { name: "cell_expression", observedOnEntityType: "cell" },
  }),
  ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
    schemaVersion: "skill-ir-experimental-design-study-graph/v1",
    studyId: "participant-repeated-visits-dev",
    question: "Does the program change recovery measured over repeated visits?",
    entities: [
      { type: "participant", parentType: null, totalCount: 24 },
      { type: "visit", parentType: "participant", totalCount: 96 },
    ],
    treatment: { name: "program", assignedToEntityType: "participant" },
    response: { name: "recovery_score", observedOnEntityType: "visit" },
  }),
]

const HELDOUT_GRAPHS: readonly [
  ExperimentalDesignSkillUniqueStudyGraph,
  ExperimentalDesignSkillUniqueStudyGraph,
] = [
  ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
    schemaVersion: "skill-ir-experimental-design-study-graph/v1",
    studyId: "tank-diet-fish-growth-heldout",
    question: "Does the diet change fish growth across shared tanks?",
    entities: [
      { type: "tank", parentType: null, totalCount: 10 },
      { type: "fish", parentType: "tank", totalCount: 100 },
    ],
    treatment: { name: "diet", assignedToEntityType: "tank" },
    response: { name: "growth", observedOnEntityType: "fish" },
  }),
  ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
    schemaVersion: "skill-ir-experimental-design-study-graph/v1",
    studyId: "classroom-curriculum-assessment-heldout",
    question: "Does the curriculum change repeated assessment scores?",
    entities: [
      { type: "classroom", parentType: null, totalCount: 12 },
      { type: "student", parentType: "classroom", totalCount: 300 },
      { type: "assessment", parentType: "student", totalCount: 600 },
    ],
    treatment: { name: "curriculum", assignedToEntityType: "classroom" },
    response: { name: "score", observedOnEntityType: "assessment" },
  }),
]

function parsePublicInterface(bytes: Uint8Array): {
  value: ExperimentalDesignSkillUniquePublicInterface
  text: string
} {
  const text = Buffer.from(bytes).toString("utf8")
  return { value: PublicInterfaceSchema.parse(JSON.parse(text)), text }
}

function buildTask(input: {
  id: string
  split: "development" | "heldout"
  graph: ExperimentalDesignSkillUniqueStudyGraph
  interfaceText: string
}): ExperimentalDesignSkillUniqueTaskSet["tasks"][number] {
  const studyText = `${JSON.stringify(input.graph)}\n`
  const protectedSha256 = {
    studyGraph: sha256Bytes(Buffer.from(studyText, "utf8")),
    interface: sha256Bytes(Buffer.from(input.interfaceText, "utf8")),
  }
  const paths = {
    studyGraph: "study-graph.json" as const,
    interface: "analysis-interface.json" as const,
    replicationPlan: "design/replication-plan.json" as const,
    analysisPlan: "design/analysis-plan.json" as const,
  }
  return TaskSchema.parse({
    id: input.id,
    split: input.split,
    prompt: TASK_PROMPT,
    fixtures: {
      "study-graph.json": studyText,
      "analysis-interface.json": input.interfaceText,
    },
    successCriteria: [],
    eval: EVALUATORS.map(([id, name, weight, check]) => ({
      method: "custom" as const,
      id,
      name,
      weight,
      evaluatorId: EVALUATOR_ID,
      payload: {
        schemaVersion: "skill-ir-experimental-design-skill-unique-eval/v1" as const,
        check,
        paths,
        protectedSha256,
      },
    })),
    hardGateIds: EVALUATORS.map(([id]) => id),
    passThreshold: 1,
  })
}

export function buildExperimentalDesignSkillUniqueTaskSet(
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ExperimentalDesignSkillUniqueTaskSet {
  const { text: interfaceText } = parsePublicInterface(publicInterfaceBytes)
  const ids = split === "development"
    ? EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS
    : EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS
  const graphs = split === "development" ? DEVELOPMENT_GRAPHS : HELDOUT_GRAPHS
  return ExperimentalDesignSkillUniqueTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: CAPABILITY_ID,
    tasks: [
      buildTask({ id: ids[0], split, graph: graphs[0], interfaceText }),
      buildTask({ id: ids[1], split, graph: graphs[1], interfaceText }),
    ],
  })
}

function findForbiddenEvidence(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (const [index, nested] of value.entries()) {
      const found = findForbiddenEvidence(nested, [...pathParts, String(index)])
      if (found) return found
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:expected|expectedAnswer|gold|goldAnswer|answer|sourceQuote)$/iu.test(key)) {
        return [...pathParts, key].join(".")
      }
      const found = findForbiddenEvidence(nested, [...pathParts, key])
      if (found) return found
    }
  }
  return null
}

function containsHeldoutEvidence(value: unknown): boolean {
  if (typeof value === "string") return /TEST_ONLY_HELDOUT_SKILL_UNIQUE/u.test(value)
  if (Array.isArray(value)) return value.some(containsHeldoutEvidence)
  if (value && typeof value === "object") return Object.values(value).some(containsHeldoutEvidence)
  return false
}

export function validateExperimentalDesignSkillUniqueTaskSet(
  input: unknown,
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ExperimentalDesignSkillUniqueTaskSet {
  const forbidden = findForbiddenEvidence(input)
  if (forbidden) throw new Error(`Skill-unique task contains forbidden evidence at ${forbidden}`)
  if (split === "development" && containsHeldoutEvidence(input)) {
    throw new Error("Skill-unique development task contains held-out evidence")
  }
  const parsed = ExperimentalDesignSkillUniqueTaskSetSchema.parse(input)
  if (parsed.tasks.some((task) => task.split !== split)) {
    throw new Error(`Skill-unique task split mismatch: expected ${split}`)
  }
  const expected = buildExperimentalDesignSkillUniqueTaskSet(split, publicInterfaceBytes)
  if (!isDeepStrictEqual(parsed, expected)) {
    throw new Error("Skill-unique task set differs from the preregistered construction")
  }
  return parsed
}

const FrozenPathSchema = z.object({
  path: NonEmptyStringSchema,
  sha256: Sha256Schema,
}).strict()

export const ExperimentalDesignSkillUniqueTaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-task-split-freeze/v1"),
  capabilityId: z.literal(CAPABILITY_ID),
  frozenDate: z.literal("2026-07-31"),
  publicInterface: FrozenPathSchema,
  development: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS[0]),
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS[1]),
    ]),
  }).strict(),
  heldout: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS[0]),
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS[1]),
    ]),
  }).strict(),
  sourceClaims: z.tuple([
    FrozenPathSchema.extend({ claimId: z.literal("independent-replication") }).strict(),
    FrozenPathSchema.extend({ claimId: z.literal("pseudoreplication-analysis-alignment") }).strict(),
  ]),
  isolation: z.object({
    scorerImplementedAfterFreeze: z.literal(true),
    developmentMayReadHeldoutContent: z.literal(false),
    heldoutMayEnterCalibration: z.literal(false),
  }).strict(),
}).strict()

export type ExperimentalDesignSkillUniqueTaskSplitFreeze = z.infer<
  typeof ExperimentalDesignSkillUniqueTaskSplitFreezeSchema
>

async function verifyFrozenPath(rootDir: string, record: { path: string; sha256: string }): Promise<void> {
  const absolute = path.resolve(rootDir, record.path)
  const relative = path.relative(path.resolve(rootDir), absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Frozen path escapes repository root: ${record.path}`)
  }
  const actual = sha256Bytes(await readFile(absolute))
  if (actual !== record.sha256) {
    throw new Error(`Frozen path digest mismatch for ${record.path}`)
  }
}

export async function validateExperimentalDesignSkillUniqueTaskSplitFreeze(input: {
  rootDir: string
  freeze: unknown
}): Promise<ExperimentalDesignSkillUniqueTaskSplitFreeze> {
  const freeze = ExperimentalDesignSkillUniqueTaskSplitFreezeSchema.parse(input.freeze)
  await Promise.all([
    verifyFrozenPath(input.rootDir, freeze.publicInterface),
    verifyFrozenPath(input.rootDir, freeze.development),
    verifyFrozenPath(input.rootDir, freeze.heldout),
    ...freeze.sourceClaims.map((claim) => verifyFrozenPath(input.rootDir, claim)),
  ])
  return freeze
}
