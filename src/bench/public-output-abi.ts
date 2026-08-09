import { isDeepStrictEqual } from "node:util"
import { z } from "zod"

export type PublicOutputIssueCode =
  | "TYPE_MISMATCH"
  | "ENUM_MISMATCH"
  | "MISSING_REQUIRED_FIELD"
  | "UNDECLARED_FIELD"
  | "DUPLICATE_ARRAY_ITEM"

export type PublicOutputValidationIssue = {
  code: PublicOutputIssueCode
  path: string
}

export type PublicOutputValueSchema =
  | { type: "string"; nullable: boolean; enum?: string[] }
  | { type: "boolean"; nullable: boolean }
  | { type: "number"; nullable: boolean }
  | { type: "integer"; nullable: boolean }
  | { type: "array"; nullable: boolean; uniqueItems: boolean; items: PublicOutputValueSchema }
  | {
    type: "object"
    nullable: boolean
    additionalProperties: boolean
    fields: Record<string, PublicOutputField>
  }

export type PublicOutputField = {
  required: boolean
  schema: PublicOutputValueSchema
}

export type PublicOutputAbi = {
  schemaVersion: "skill-ir-public-output-abi/v1"
  additionalProperties: boolean
  fields: Record<string, PublicOutputField>
}

const NonEmptyFieldsSchema = z.record(z.string().min(1), z.lazy(() => PublicOutputFieldSchema))
  .refine((fields) => Object.keys(fields).length > 0, "output ABI fields must not be empty")

export const PublicOutputValueSchemaSchema: z.ZodType<PublicOutputValueSchema> = z.lazy(() =>
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
      uniqueItems: z.boolean(),
      items: PublicOutputValueSchemaSchema,
    }).strict(),
    z.object({
      type: z.literal("object"),
      nullable: z.boolean(),
      additionalProperties: z.boolean(),
      fields: NonEmptyFieldsSchema,
    }).strict(),
  ])
)

export const PublicOutputFieldSchema: z.ZodType<PublicOutputField> = z.lazy(() =>
  z.object({
    required: z.boolean(),
    schema: PublicOutputValueSchemaSchema,
  }).strict()
)

export const PublicOutputAbiSchema: z.ZodType<PublicOutputAbi> = z.object({
  schemaVersion: z.literal("skill-ir-public-output-abi/v1"),
  additionalProperties: z.boolean(),
  fields: NonEmptyFieldsSchema,
}).strict()

function pointer(parent: string, segment: string | number): string {
  const escaped = String(segment).replaceAll("~", "~0").replaceAll("/", "~1")
  return `${parent}/${escaped}`
}

function validateValue(
  schema: PublicOutputValueSchema,
  value: unknown,
  path: string,
  issues: PublicOutputValidationIssue[],
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
        if (schema.uniqueItems && value.slice(0, index).some((previous) => isDeepStrictEqual(previous, item))) {
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
  fields: Record<string, PublicOutputField>,
  additionalProperties: boolean,
  value: Record<string, unknown>,
  path: string,
  issues: PublicOutputValidationIssue[],
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

export function validatePublicOutputRecord(
  rawAbi: unknown,
  value: unknown,
): { status: "pass" | "fail"; issues: PublicOutputValidationIssue[] } {
  const abi = PublicOutputAbiSchema.parse(rawAbi)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "fail", issues: [{ code: "TYPE_MISMATCH", path: "" }] }
  }
  const issues: PublicOutputValidationIssue[] = []
  validateFields(abi.fields, abi.additionalProperties, value as Record<string, unknown>, "", issues)
  return { status: issues.length === 0 ? "pass" : "fail", issues }
}
