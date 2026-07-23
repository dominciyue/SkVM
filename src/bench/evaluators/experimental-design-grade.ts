import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SCHEMA_VERSION = "skill-ir-experimental-design-eval/v1"
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  if (value.includes("\\")) return false
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".."
  )
})

const StudyUnitSchema = z.object({
  id: z.string().min(1),
  stratum: z.string().min(1).optional(),
}).strict()

const StudySchema = z.object({
  studyId: z.string().min(1),
  question: z.string().min(1),
  assignmentLevel: z.enum(["individual", "cluster"]),
  assignmentUnit: z.string().min(1),
  analysisUnit: z.string().min(1),
  response: z.string().min(1),
  arms: z.array(z.string().min(1)).min(2),
  seed: z.number().int().nonnegative(),
  nuisanceFactors: z.array(z.string().min(1)),
  sequentialEnrollment: z.boolean(),
  units: z.array(StudyUnitSchema).min(2),
}).strict()

const PlanSchema = z.object({
  schemaVersion: z.literal("experimental-design-plan/v1"),
  studyId: z.string().min(1),
  method: z.enum([
    "cluster-randomized",
    "stratified-block",
    "permuted-block",
    "simple-randomized",
  ]),
  assignmentLevel: z.enum(["individual", "cluster"]),
  assignmentUnit: z.string().min(1),
  analysisUnit: z.string().min(1),
  response: z.string().min(1),
  arms: z.array(z.string().min(1)).min(2),
  seed: z.number().int().nonnegative(),
  nuisanceHandling: z.array(z.string().min(1)),
  replicationUnit: z.string().min(1),
  pseudoreplicationWarning: z.string().min(1),
  allocationPath: z.literal("design/allocation.csv"),
  analysisNotes: z.array(z.string().min(1)),
}).strict()

export const ExperimentalDesignGradePayloadSchema = z.discriminatedUnion("check", [
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("protected-file"),
    path: SafeRelativePathSchema,
    content: z.string(),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("required-artifacts"),
    paths: z.array(SafeRelativePathSchema).min(1),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.enum(["plan-contract", "assignment-safety"]),
    studyPath: SafeRelativePathSchema,
    planPath: SafeRelativePathSchema,
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("allocation-consistency"),
    studyPath: SafeRelativePathSchema,
    allocationPath: SafeRelativePathSchema,
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("report-completeness"),
    studyPath: SafeRelativePathSchema,
    reportPath: SafeRelativePathSchema,
  }).strict(),
])

type Payload = z.infer<typeof ExperimentalDesignGradePayloadSchema>
type Study = z.infer<typeof StudySchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

class UnsafeFilesystemPathError extends Error {}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<string | undefined> {
  const candidate = path.join(root, ...relativePath.split("/"))
  if (!isContained(root, candidate)) throw new UnsafeFilesystemPathError()
  try {
    await lstat(candidate)
    const resolved = await realpath(candidate)
    if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
    if (!(await lstat(resolved)).isFile()) return undefined
    return await readFile(resolved, "utf8")
  } catch (error) {
    if (error instanceof UnsafeFilesystemPathError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function deriveMethod(study: Study): z.infer<typeof PlanSchema>["method"] {
  if (study.assignmentLevel === "cluster") return "cluster-randomized"
  if (study.units.some((unit) => unit.stratum !== undefined)) return "stratified-block"
  if (study.sequentialEnrollment) return "permuted-block"
  return "simple-randomized"
}

function seededShuffle<T>(values: T[], seed: number): T[] {
  const shuffled = [...values]
  let state = seed >>> 0 || 1
  const random = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!]
  }
  return shuffled
}

type AllocationRow = { order: number; unitId: string; stratum: string; arm: string }

function expectedAllocation(study: Study): AllocationRow[] {
  const method = deriveMethod(study)
  const rows: Omit<AllocationRow, "order">[] = []

  if (method === "stratified-block") {
    const strata = new Map<string, typeof study.units>()
    for (const unit of study.units) {
      const stratum = unit.stratum ?? ""
      strata.set(stratum, [...(strata.get(stratum) ?? []), unit])
    }
    let stratumIndex = 0
    for (const [stratum, units] of strata) {
      for (const [index, unit] of seededShuffle(units, study.seed + stratumIndex).entries()) {
        rows.push({ unitId: unit.id, stratum, arm: study.arms[index % study.arms.length]! })
      }
      stratumIndex += 2
    }
  } else if (method === "permuted-block") {
    for (let offset = 0; offset < study.units.length; offset += study.arms.length) {
      const block = study.units.slice(offset, offset + study.arms.length)
      const arms = seededShuffle(study.arms, study.seed + offset)
      block.forEach((unit, index) => {
        rows.push({ unitId: unit.id, stratum: unit.stratum ?? "", arm: arms[index]! })
      })
    }
  } else {
    seededShuffle(study.units, study.seed).forEach((unit, index) => {
      rows.push({
        unitId: unit.id,
        stratum: unit.stratum ?? "",
        arm: study.arms[index % study.arms.length]!,
      })
    })
  }

  return rows.map((row, index) => ({ order: index + 1, ...row }))
}

function parseCsv(content: string): AllocationRow[] | undefined {
  const lines = content.trim().split(/\r\n?|\n/)
  if (lines[0] !== "order,unit_id,stratum,arm") return undefined
  const rows: AllocationRow[] = []
  for (const line of lines.slice(1)) {
    const values = line.split(",")
    if (values.length !== 4) return undefined
    const order = Number(values[0])
    if (!Number.isInteger(order)) return undefined
    rows.push({ order, unitId: values[1]!, stratum: values[2]!, arm: values[3]! })
  }
  return rows
}

async function loadStudy(root: string, relativePath: string): Promise<Study | undefined> {
  const content = await readSafeFile(root, relativePath)
  if (content === undefined) return undefined
  try {
    return StudySchema.parse(JSON.parse(content))
  } catch {
    return undefined
  }
}

async function loadPlan(
  root: string,
  relativePath: string,
): Promise<z.infer<typeof PlanSchema> | undefined> {
  const content = await readSafeFile(root, relativePath)
  if (content === undefined) return undefined
  try {
    return PlanSchema.parse(JSON.parse(content))
  } catch {
    return undefined
  }
}

async function checkProtectedFile(
  payload: Extract<Payload, { check: "protected-file" }>,
  root: string,
): Promise<GradeResult> {
  return await readSafeFile(root, payload.path) === payload.content
    ? passing("Protected study input is unchanged.")
    : failing("Protected study input is missing or changed.")
}

async function checkRequiredArtifacts(
  payload: Extract<Payload, { check: "required-artifacts" }>,
  root: string,
): Promise<GradeResult> {
  for (const relativePath of payload.paths) {
    if (await readSafeFile(root, relativePath) === undefined) {
      return failing("A required experimental-design artifact is missing.")
    }
  }
  return passing("All required experimental-design artifacts are present.")
}

async function checkPlan(
  payload: Extract<Payload, { check: "plan-contract" | "assignment-safety" }>,
  root: string,
): Promise<GradeResult> {
  const [study, plan] = await Promise.all([
    loadStudy(root, payload.studyPath),
    loadPlan(root, payload.planPath),
  ])
  if (!study || !plan) return failing("Study or design plan is missing or invalid.")

  if (payload.check === "plan-contract") {
    const matches = plan.studyId === study.studyId &&
      plan.method === deriveMethod(study) &&
      plan.assignmentLevel === study.assignmentLevel &&
      plan.assignmentUnit === study.assignmentUnit &&
      plan.analysisUnit === study.analysisUnit &&
      plan.response === study.response &&
      JSON.stringify(plan.arms) === JSON.stringify(study.arms) &&
      plan.seed === study.seed &&
      plan.allocationPath === "design/allocation.csv"
    return matches
      ? passing("Design plan matches the public study contract.")
      : failing("Design plan does not match the public study contract.")
  }

  const safe = plan.assignmentUnit === study.assignmentUnit &&
    plan.replicationUnit === study.assignmentUnit &&
    plan.analysisUnit === study.analysisUnit &&
    plan.pseudoreplicationWarning.toLowerCase().includes("independent") &&
    (study.assignmentLevel !== "cluster" || plan.method === "cluster-randomized")
  return safe
    ? passing("Assignment and replication units are safe.")
    : failing("Assignment or replication units are unsafe.")
}

async function checkAllocation(
  payload: Extract<Payload, { check: "allocation-consistency" }>,
  root: string,
): Promise<GradeResult> {
  const [study, content] = await Promise.all([
    loadStudy(root, payload.studyPath),
    readSafeFile(root, payload.allocationPath),
  ])
  if (!study || content === undefined) return failing("Study or allocation schedule is missing.")
  const actual = parseCsv(content)
  if (!actual) return failing("Allocation schedule is not valid CSV.")
  return JSON.stringify(actual) === JSON.stringify(expectedAllocation(study))
    ? passing("Allocation schedule is complete and reproducible from the public seed.")
    : failing("Allocation schedule is incomplete or inconsistent with the public seed.")
}

async function checkReport(
  payload: Extract<Payload, { check: "report-completeness" }>,
  root: string,
): Promise<GradeResult> {
  const [study, content] = await Promise.all([
    loadStudy(root, payload.studyPath),
    readSafeFile(root, payload.reportPath),
  ])
  if (!study || content === undefined) return failing("Study or design report is missing.")
  const required = [
    `Study ID: ${study.studyId}`,
    `Method: ${deriveMethod(study)}`,
    `Randomization unit: ${study.assignmentUnit}`,
    `Analysis unit: ${study.analysisUnit}`,
    `Response: ${study.response}`,
    `Seed: ${study.seed}`,
    "Allocation schedule: design/allocation.csv",
  ]
  return required.every((text) => content.includes(text))
    ? passing("Design report records the public design decisions.")
    : failing("Design report omits required design decisions.")
}

export const experimentalDesignGrade: CustomEvaluator = {
  validatePayload(payload) {
    ExperimentalDesignGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }) {
    const parsed = ExperimentalDesignGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid experimental-design evaluator payload.")

    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) {
        return infrastructure("Experimental-design evaluator workdir is unavailable.")
      }
      switch (parsed.data.check) {
        case "protected-file": return await checkProtectedFile(parsed.data, root)
        case "required-artifacts": return await checkRequiredArtifacts(parsed.data, root)
        case "plan-contract":
        case "assignment-safety": return await checkPlan(parsed.data, root)
        case "allocation-consistency": return await checkAllocation(parsed.data, root)
        case "report-completeness": return await checkReport(parsed.data, root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe experimental-design evaluator filesystem path.")
      }
      return infrastructure("Experimental-design evaluator filesystem failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-experimental-design", experimentalDesignGrade)
