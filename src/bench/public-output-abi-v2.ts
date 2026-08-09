import { isDeepStrictEqual } from "node:util"
import { z } from "zod"

export type PublicOutputIssueCodeV2 =
  | "TYPE_MISMATCH"
  | "ENUM_MISMATCH"
  | "MISSING_REQUIRED_FIELD"
  | "UNDECLARED_FIELD"
  | "DUPLICATE_ARRAY_ITEM"

export type PublicOutputValidationIssueV2 = {
  code: PublicOutputIssueCodeV2
  path: string
}

export type PublicOutputValueSchemaV2 =
  | { type: "string"; nullable: boolean; enum?: string[] }
  | { type: "boolean"; nullable: boolean }
  | { type: "number"; nullable: boolean }
  | { type: "integer"; nullable: boolean }
  | {
    type: "array"
    nullable: boolean
    order: "ordered" | "set-like"
    duplicates: "forbid" | "allow"
    items: PublicOutputValueSchemaV2
  }
  | {
    type: "object"
    nullable: boolean
    additionalProperties: boolean
    fields: Record<string, PublicOutputFieldV2>
  }

export type PublicOutputFieldV2 = {
  required: boolean
  schema: PublicOutputValueSchemaV2
}

export type PublicOutputAbiV2 = {
  schemaVersion: "skill-ir-public-output-abi/v2"
  additionalProperties: boolean
  fields: Record<string, PublicOutputFieldV2>
}

const NonEmptyFieldsSchema = z.record(z.string().min(1), z.lazy(() => PublicOutputFieldV2Schema))
  .refine((fields) => Object.keys(fields).length > 0, "output ABI fields must not be empty")

export const PublicOutputValueSchemaV2Schema: z.ZodType<PublicOutputValueSchemaV2> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("string"),
      nullable: z.boolean(),
      enum: z.array(z.string()).min(1).refine((values) => new Set(values).size === values.length).optional(),
    }).strict(),
    z.object({ type: z.literal("boolean"), nullable: z.boolean() }).strict(),
    z.object({ type: z.literal("number"), nullable: z.boolean() }).strict(),
    z.object({ type: z.literal("integer"), nullable: z.boolean() }).strict(),
    z.object({
      type: z.literal("array"),
      nullable: z.boolean(),
      order: z.enum(["ordered", "set-like"]),
      duplicates: z.enum(["forbid", "allow"]),
      items: PublicOutputValueSchemaV2Schema,
    }).strict(),
    z.object({
      type: z.literal("object"),
      nullable: z.boolean(),
      additionalProperties: z.boolean(),
      fields: NonEmptyFieldsSchema,
    }).strict(),
  ])
)

export const PublicOutputFieldV2Schema: z.ZodType<PublicOutputFieldV2> = z.lazy(() =>
  z.object({
    required: z.boolean(),
    schema: PublicOutputValueSchemaV2Schema,
  }).strict()
)

export const PublicOutputAbiV2Schema: z.ZodType<PublicOutputAbiV2> = z.object({
  schemaVersion: z.literal("skill-ir-public-output-abi/v2"),
  additionalProperties: z.boolean(),
  fields: NonEmptyFieldsSchema,
}).strict()

function pointer(parent: string, segment: string | number): string {
  const escaped = String(segment).replaceAll("~", "~0").replaceAll("/", "~1")
  return `${parent}/${escaped}`
}

function validateValue(
  schema: PublicOutputValueSchemaV2,
  value: unknown,
  path: string,
  issues: PublicOutputValidationIssueV2[],
): void {
  if (value === null) {
    if (!schema.nullable) issues.push({ code: "TYPE_MISMATCH", path })
    return
  }
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") issues.push({ code: "TYPE_MISMATCH", path })
      else if (schema.enum && !schema.enum.includes(value)) issues.push({ code: "ENUM_MISMATCH", path })
      return
    case "boolean":
      if (typeof value !== "boolean") issues.push({ code: "TYPE_MISMATCH", path })
      return
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) issues.push({ code: "TYPE_MISMATCH", path })
      return
    case "integer":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) issues.push({ code: "TYPE_MISMATCH", path })
      return
    case "array":
      if (!Array.isArray(value)) {
        issues.push({ code: "TYPE_MISMATCH", path })
        return
      }
      for (const [index, item] of value.entries()) {
        if (
          schema.duplicates === "forbid"
          && value.slice(0, index).some((previous) => isDeepStrictEqual(previous, item))
        ) {
          issues.push({ code: "DUPLICATE_ARRAY_ITEM", path: pointer(path, index) })
        }
        validateValue(schema.items, item, pointer(path, index), issues)
      }
      return
    case "object":
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issues.push({ code: "TYPE_MISMATCH", path })
        return
      }
      validateFields(schema.fields, schema.additionalProperties, value as Record<string, unknown>, path, issues)
  }
}

function validateFields(
  fields: Record<string, PublicOutputFieldV2>,
  additionalProperties: boolean,
  value: Record<string, unknown>,
  path: string,
  issues: PublicOutputValidationIssueV2[],
): void {
  for (const [name, field] of Object.entries(fields)) {
    const fieldPath = pointer(path, name)
    if (!Object.hasOwn(value, name)) {
      if (field.required) issues.push({ code: "MISSING_REQUIRED_FIELD", path: fieldPath })
      continue
    }
    validateValue(field.schema, value[name], fieldPath, issues)
  }
  if (!additionalProperties) {
    for (const name of Object.keys(value)) {
      if (!Object.hasOwn(fields, name)) issues.push({ code: "UNDECLARED_FIELD", path: pointer(path, name) })
    }
  }
}

export function validatePublicOutputRecordV2(
  rawAbi: unknown,
  value: unknown,
): { status: "pass" | "fail"; issues: PublicOutputValidationIssueV2[] } {
  const abi = PublicOutputAbiV2Schema.parse(rawAbi)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "fail", issues: [{ code: "TYPE_MISMATCH", path: "" }] }
  }
  const issues: PublicOutputValidationIssueV2[] = []
  validateFields(abi.fields, abi.additionalProperties, value as Record<string, unknown>, "", issues)
  return { status: issues.length === 0 ? "pass" : "fail", issues }
}

function valuesEquivalent(schema: PublicOutputValueSchemaV2, left: unknown, right: unknown): boolean {
  if (left === null || right === null) return left === right
  switch (schema.type) {
    case "string":
    case "boolean":
    case "number":
    case "integer":
      return isDeepStrictEqual(left, right)
    case "array": {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
      if (schema.order === "ordered") {
        return left.every((item, index) => valuesEquivalent(schema.items, item, right[index]))
      }
      const remaining = [...right]
      return left.every((item) => {
        const index = remaining.findIndex((candidate) => valuesEquivalent(schema.items, item, candidate))
        if (index < 0) return false
        remaining.splice(index, 1)
        return true
      }) && remaining.length === 0
    }
    case "object":
      return recordsEquivalent(schema.fields, schema.additionalProperties, left, right)
  }
}

function recordsEquivalent(
  fields: Record<string, PublicOutputFieldV2>,
  additionalProperties: boolean,
  left: unknown,
  right: unknown,
): boolean {
  if (
    !left || typeof left !== "object" || Array.isArray(left)
    || !right || typeof right !== "object" || Array.isArray(right)
  ) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  for (const [name, field] of Object.entries(fields)) {
    if (Object.hasOwn(leftRecord, name) !== Object.hasOwn(rightRecord, name)) return false
    if (Object.hasOwn(leftRecord, name) && !valuesEquivalent(field.schema, leftRecord[name], rightRecord[name])) {
      return false
    }
  }
  if (!additionalProperties) return true
  const declared = new Set(Object.keys(fields))
  const leftExtra = Object.fromEntries(Object.entries(leftRecord).filter(([name]) => !declared.has(name)))
  const rightExtra = Object.fromEntries(Object.entries(rightRecord).filter(([name]) => !declared.has(name)))
  return isDeepStrictEqual(leftExtra, rightExtra)
}

export function publicOutputRecordsEquivalent(rawAbi: unknown, left: unknown, right: unknown): boolean {
  const abi = PublicOutputAbiV2Schema.parse(rawAbi)
  if (
    validatePublicOutputRecordV2(abi, left).status !== "pass"
    || validatePublicOutputRecordV2(abi, right).status !== "pass"
  ) return false
  return recordsEquivalent(abi.fields, abi.additionalProperties, left, right)
}
