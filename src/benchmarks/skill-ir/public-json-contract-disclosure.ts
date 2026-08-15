import { z } from "zod"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "output path must be a safe POSIX relative path")

const JsonFieldPathSchema = z.string().regex(
  /^\/(?:\*|(?:[^~/*]|~[01])+)(?:\/(?:\*|(?:[^~/*]|~[01])+))*$/u,
  "field path must be an absolute JSON pointer; * may denote an array item",
)

const InputSchema = z.object({
  outputPath: SafeRelativePathSchema,
  publicFieldPaths: z.array(JsonFieldPathSchema),
  evaluatorFieldPaths: z.array(JsonFieldPathSchema),
}).strict().superRefine((input, context) => {
  for (const field of ["publicFieldPaths", "evaluatorFieldPaths"] as const) {
    if (new Set(input[field]).size !== input[field].length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must be unique` })
    }
  }
})

export type PublicJsonContractDisclosureAudit = {
  schemaVersion: "skill-ir-public-json-contract-disclosure-audit/v1"
  outputPath: string
  status: "passed" | "failed"
  counts: {
    publicFieldPaths: number
    evaluatorFieldPaths: number
    undisclosedEvaluatorFieldPaths: number
  }
  undisclosedEvaluatorFieldPaths: string[]
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "en"))
}

export function auditPublicJsonContractDisclosure(rawInput: unknown): PublicJsonContractDisclosureAudit {
  const input = InputSchema.parse(rawInput)
  const disclosed = new Set(input.publicFieldPaths)
  const undisclosedEvaluatorFieldPaths = sorted(
    input.evaluatorFieldPaths.filter((fieldPath) => !disclosed.has(fieldPath)),
  )
  return {
    schemaVersion: "skill-ir-public-json-contract-disclosure-audit/v1",
    outputPath: input.outputPath,
    status: undisclosedEvaluatorFieldPaths.length === 0 ? "passed" : "failed",
    counts: {
      publicFieldPaths: input.publicFieldPaths.length,
      evaluatorFieldPaths: input.evaluatorFieldPaths.length,
      undisclosedEvaluatorFieldPaths: undisclosedEvaluatorFieldPaths.length,
    },
    undisclosedEvaluatorFieldPaths,
  }
}
