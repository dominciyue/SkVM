import { posix, win32 } from "node:path"
import { z } from "zod"

const NonEmptyStringSchema = z.string().trim().min(1)

const ExperimentalDesignV2StudyUnitSchema = z.object({
  id: NonEmptyStringSchema,
  stratum: NonEmptyStringSchema.optional(),
}).strict()

export const ExperimentalDesignV2StudySchema = z.object({
  studyId: NonEmptyStringSchema,
  question: NonEmptyStringSchema,
  assignmentLevel: z.enum(["individual", "cluster"]),
  assignmentUnit: NonEmptyStringSchema,
  analysisUnit: NonEmptyStringSchema,
  response: NonEmptyStringSchema,
  arms: z.array(NonEmptyStringSchema).min(2),
  seed: z.number().int().nonnegative(),
  nuisanceFactors: z.array(NonEmptyStringSchema),
  sequentialEnrollment: z.boolean(),
  units: z.array(ExperimentalDesignV2StudyUnitSchema).min(2),
}).strict().superRefine((study, context) => {
  if (new Set(study.arms).size !== study.arms.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["arms"],
      message: "arms must be unique",
    })
  }

  const unitIds = study.units.map((unit) => unit.id)
  if (new Set(unitIds).size !== unitIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "assignment unit IDs must be unique",
    })
  }

  const unitsWithStrata = study.units.filter((unit) => unit.stratum !== undefined).length
  if (unitsWithStrata !== 0 && unitsWithStrata !== study.units.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "stratum must be present on every assignment unit or none",
    })
  }
})

export type ExperimentalDesignV2Study = z.infer<typeof ExperimentalDesignV2StudySchema>

export type ExperimentalDesignV2AllocationRow = {
  order: number
  unitId: string
  stratum: string
  arm: string
}

export type ExperimentalDesignV2Properties = {
  preservesAssignmentUnits: boolean
  balancesGlobally: boolean
  balancesWithinStrata: boolean
  supportsSequentialEnrollment: boolean
}

export type ExperimentalDesignV2AllocationAssessment = {
  coverageValid: boolean
  armsValid: boolean
  strataValid: boolean
  sequentialValid: boolean
  properties: ExperimentalDesignV2Properties
}

export function parseExperimentalDesignV2Study(value: unknown): ExperimentalDesignV2Study {
  return ExperimentalDesignV2StudySchema.parse(value)
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ""
  let inQuotes = false
  let closedQuote = false

  const pushField = () => {
    record.push(field)
    field = ""
    closedQuote = false
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          closedQuote = true
        }
      } else {
        field += character
      }
      continue
    }

    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("Allocation CSV has characters after a closing quote")
    }
    if (character === '"') {
      if (field.length > 0) throw new Error("Allocation CSV quote must start a field")
      inQuotes = true
    } else if (character === ",") {
      pushField()
    } else if (character === "\n") {
      pushRecord()
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1
      pushRecord()
    } else {
      field += character
    }
  }

  if (inQuotes) throw new Error("Allocation CSV has an unterminated quoted field")
  if (field.length > 0 || record.length > 0 || closedQuote) pushRecord()
  return records
}

export function parseExperimentalDesignV2AllocationCsv(
  text: string,
): ExperimentalDesignV2AllocationRow[] {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ""))
  if (
    records.length === 0 ||
    records[0]!.length !== 4 ||
    records[0]![0] !== "order" ||
    records[0]![1] !== "unit_id" ||
    records[0]![2] !== "stratum" ||
    records[0]![3] !== "arm"
  ) {
    throw new Error("Allocation CSV header must be order,unit_id,stratum,arm")
  }

  return records.slice(1).map((values, index) => {
    if (values.length !== 4) {
      throw new Error(`Allocation CSV row ${index + 2} must have four columns`)
    }
    const order = Number(values[0])
    const unitId = values[1]!.trim()
    const stratum = values[2]!.trim()
    const arm = values[3]!.trim()
    if (!Number.isInteger(order) || order < 1) {
      throw new Error(`Allocation CSV row ${index + 2} has an invalid order`)
    }
    if (unitId.length === 0 || arm.length === 0) {
      throw new Error(`Allocation CSV row ${index + 2} has an empty unit or arm`)
    }
    return { order, unitId, stratum, arm }
  })
}

function countsAreBalanced(arms: readonly string[], assignedArms: readonly string[]): boolean {
  const counts = new Map(arms.map((arm) => [arm, 0]))
  for (const arm of assignedArms) {
    const count = counts.get(arm)
    if (count === undefined) return false
    counts.set(arm, count + 1)
  }
  const values = [...counts.values()]
  return Math.max(...values) - Math.min(...values) <= 1
}

function sequentialBlocksAreValid(
  arms: readonly string[],
  assignedArms: readonly string[],
): boolean {
  for (let offset = 0; offset < assignedArms.length; offset += arms.length) {
    const block = assignedArms.slice(offset, offset + arms.length)
    if (block.length === arms.length) {
      if (new Set(block).size !== arms.length || block.some((arm) => !arms.includes(arm))) {
        return false
      }
    } else if (!countsAreBalanced(arms, block)) {
      return false
    }
  }
  return true
}

export function assessExperimentalDesignV2Allocation(
  study: ExperimentalDesignV2Study,
  rows: ExperimentalDesignV2AllocationRow[],
): ExperimentalDesignV2AllocationAssessment {
  const unitsById = new Map(study.units.map((unit) => [unit.id, unit]))
  const rowsById = new Map<string, ExperimentalDesignV2AllocationRow>()
  let duplicateRowId = false
  for (const row of rows) {
    if (rowsById.has(row.unitId)) duplicateRowId = true
    else rowsById.set(row.unitId, row)
  }

  const coverageValid = !duplicateRowId && rows.length === study.units.length &&
    rowsById.size === study.units.length &&
    rows.every((row) => unitsById.has(row.unitId)) &&
    study.units.every((unit) => rowsById.has(unit.id))
  const armsValid = rows.every((row) => study.arms.includes(row.arm))
  const stratumLabelsValid = rows.every((row) => {
    const unit = unitsById.get(row.unitId)
    return unit !== undefined && row.stratum === (unit.stratum ?? "")
  })
  const hasStrata = study.units.every((unit) => unit.stratum !== undefined)

  const partitions = new Map<string, typeof study.units>()
  for (const unit of study.units) {
    const key = unit.stratum ?? ""
    partitions.set(key, [...(partitions.get(key) ?? []), unit])
  }
  const partitionArms = [...partitions.values()].map((units) =>
    units.map((unit) => rowsById.get(unit.id)?.arm).filter((arm): arm is string => arm !== undefined)
  )
  const partitionsCovered = partitionArms.reduce((total, arms) => total + arms.length, 0) ===
    study.units.length
  const partitionsBalanced = partitionsCovered && partitionArms.every((arms) =>
    countsAreBalanced(study.arms, arms)
  )
  const sequentialBlocksValid = partitionsCovered && partitionArms.every((arms) =>
    sequentialBlocksAreValid(study.arms, arms)
  )
  const globalArms = rows.map((row) => row.arm)
  const globallyBalanced = coverageValid && armsValid &&
    countsAreBalanced(study.arms, globalArms)

  const strataValid = stratumLabelsValid && (!hasStrata || (
    coverageValid && armsValid && partitionsBalanced
  ))
  const sequentialValid = !study.sequentialEnrollment || (
    coverageValid && armsValid && stratumLabelsValid && sequentialBlocksValid
  )

  return {
    coverageValid,
    armsValid,
    strataValid,
    sequentialValid,
    properties: {
      preservesAssignmentUnits: coverageValid,
      balancesGlobally: globallyBalanced,
      balancesWithinStrata: hasStrata && coverageValid && armsValid &&
        stratumLabelsValid && partitionsBalanced,
      supportsSequentialEnrollment: study.sequentialEnrollment && coverageValid &&
        armsValid && stratumLabelsValid && sequentialBlocksValid,
    },
  }
}

export function deriveExperimentalDesignV2LimitationFlags(
  study: ExperimentalDesignV2Study,
): string[] {
  const flags = new Set<string>(["randomness-not-statistically-audited"])
  if (study.assignmentLevel === "cluster") flags.add("cluster-assignment")
  if (study.units.every((unit) => unit.stratum !== undefined)) {
    flags.add("stratified-assignment")
  }
  if (study.sequentialEnrollment) flags.add("sequential-enrollment")
  if (study.analysisUnit !== study.assignmentUnit) flags.add("analysis-unit-differs")
  return [...flags].sort()
}

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (posix.isAbsolute(value) || win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".."
  )
}, "source path must be a safe POSIX relative path")

export const ExperimentalDesignV2PublicContractSourceAuditSchema = z.object({
  schemaVersion: z.literal(
    "skill-ir-experimental-design-v2-public-contract-source-audit/v1",
  ),
  contractId: z.literal("experimental-design-public-contract-v2"),
  entries: z.array(z.object({
    claimId: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    source: z.object({
      path: SafeRelativePathSchema,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict(),
    quote: z.string().min(1),
  }).strict()).min(1),
}).strict().superRefine((audit, context) => {
  const claimIds = audit.entries.map((entry) => entry.claimId)
  if (new Set(claimIds).size !== claimIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entries"],
      message: "source audit claim IDs must be unique",
    })
  }
})
