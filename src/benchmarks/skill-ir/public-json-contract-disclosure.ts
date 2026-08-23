import { z } from "zod"
import { isDeepStrictEqual } from "node:util"

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

const SemanticIdSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
  "semantic identifiers must be lowercase kebab-case",
)
const SemanticTargetSchema = z.object({
  role: SemanticIdSchema,
  path: JsonFieldPathSchema,
}).strict()
const ValueSemanticKindSchema = z.enum([
  "canonical-value",
  "representation-equivalence",
  "array-element-identity",
  "normalization",
  "cross-field-relationship",
])
const ValueSemanticDeclarationSchema = z.object({
  id: SemanticIdSchema,
  kind: ValueSemanticKindSchema,
  rule: SemanticIdSchema,
  targets: z.array(SemanticTargetSchema).min(1),
  description: z.string().trim().min(1),
}).strict().superRefine((declaration, context) => {
  const roles = declaration.targets.map((target) => target.role)
  if (new Set(roles).size !== roles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["targets"], message: "semantic target roles must be unique" })
  }
  if (declaration.kind === "cross-field-relationship" && declaration.targets.length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targets"],
      message: "cross-field semantics require at least two targets",
    })
  }
})
const ValueSemanticCanarySchema = z.object({
  id: SemanticIdSchema,
  semanticId: SemanticIdSchema,
  role: z.enum(["canonical", "alternative-valid", "invalid"]),
  observed: z.enum(["accepted", "rejected"]),
}).strict()
const ValueSemanticsInputSchema = z.object({
  outputPath: SafeRelativePathSchema,
  publicSemantics: z.array(ValueSemanticDeclarationSchema),
  evaluatorSemantics: z.array(ValueSemanticDeclarationSchema),
  canaries: z.array(ValueSemanticCanarySchema),
}).strict().superRefine((input, context) => {
  for (const field of ["publicSemantics", "evaluatorSemantics"] as const) {
    const ids = input[field].map((declaration) => declaration.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} ids must be unique` })
    }
  }
  const canaryIds = input.canaries.map((canary) => canary.id)
  if (new Set(canaryIds).size !== canaryIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["canaries"], message: "canary ids must be unique" })
  }
  const evaluatorIds = new Set(input.evaluatorSemantics.map((declaration) => declaration.id))
  for (const [index, canary] of input.canaries.entries()) {
    if (!evaluatorIds.has(canary.semanticId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canaries", index, "semanticId"],
        message: "canary must refer to an evaluator semantic requirement",
      })
    }
  }
})

export type PublicJsonValueSemanticDeclaration = z.infer<typeof ValueSemanticDeclarationSchema>
export type PublicJsonValueSemanticCanary = z.infer<typeof ValueSemanticCanarySchema>

export type PublicJsonValueSemanticsDisclosureAudit = {
  schemaVersion: "skill-ir-public-json-value-semantics-disclosure-audit/v1"
  outputPath: string
  status: "passed" | "failed"
  counts: {
    publicSemantics: number
    evaluatorSemantics: number
    undisclosedEvaluatorSemantics: number
    mismatchedEvaluatorSemantics: number
    canaries: number
    missingCanaryRoles: number
    failedCanaries: number
  }
  undisclosedEvaluatorSemanticIds: string[]
  mismatchedEvaluatorSemanticIds: string[]
  missingCanaryRoles: Array<{
    semanticId: string
    roles: Array<"canonical" | "alternative-valid" | "invalid">
  }>
  failedCanaryIds: string[]
}

function normalizedDeclaration(declaration: PublicJsonValueSemanticDeclaration) {
  return {
    ...declaration,
    targets: [...declaration.targets].sort((left, right) =>
      left.role.localeCompare(right.role, "en") || left.path.localeCompare(right.path, "en")
    ),
  }
}

function requiredCanaryRoles(kind: PublicJsonValueSemanticDeclaration["kind"]) {
  return kind === "representation-equivalence"
      || kind === "array-element-identity"
    ? ["canonical", "alternative-valid", "invalid"] as const
    : ["canonical", "invalid"] as const
}

export function auditPublicJsonValueSemanticsDisclosure(
  rawInput: unknown,
): PublicJsonValueSemanticsDisclosureAudit {
  const input = ValueSemanticsInputSchema.parse(rawInput)
  const publicById = new Map(input.publicSemantics.map((declaration) => [declaration.id, declaration]))
  const undisclosedEvaluatorSemanticIds = sorted(input.evaluatorSemantics
    .filter((requirement) => !publicById.has(requirement.id))
    .map((requirement) => requirement.id))
  const mismatchedEvaluatorSemanticIds = sorted(input.evaluatorSemantics
    .filter((requirement) => {
      const declaration = publicById.get(requirement.id)
      return declaration !== undefined
        && !isDeepStrictEqual(normalizedDeclaration(declaration), normalizedDeclaration(requirement))
    })
    .map((requirement) => requirement.id))
  const missingCanaryRoles = [...input.evaluatorSemantics]
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .flatMap((requirement) => {
      const present = new Set(input.canaries
        .filter((canary) => canary.semanticId === requirement.id)
        .map((canary) => canary.role))
      const roles = requiredCanaryRoles(requirement.kind).filter((role) => !present.has(role))
      return roles.length > 0 ? [{ semanticId: requirement.id, roles: [...roles] }] : []
    })
  const failedCanaryIds = sorted(input.canaries
    .filter((canary) => canary.observed !== (canary.role === "invalid" ? "rejected" : "accepted"))
    .map((canary) => canary.id))
  const failed = undisclosedEvaluatorSemanticIds.length > 0
    || mismatchedEvaluatorSemanticIds.length > 0
    || missingCanaryRoles.length > 0
    || failedCanaryIds.length > 0
  return {
    schemaVersion: "skill-ir-public-json-value-semantics-disclosure-audit/v1",
    outputPath: input.outputPath,
    status: failed ? "failed" : "passed",
    counts: {
      publicSemantics: input.publicSemantics.length,
      evaluatorSemantics: input.evaluatorSemantics.length,
      undisclosedEvaluatorSemantics: undisclosedEvaluatorSemanticIds.length,
      mismatchedEvaluatorSemantics: mismatchedEvaluatorSemanticIds.length,
      canaries: input.canaries.length,
      missingCanaryRoles: missingCanaryRoles.reduce((count, item) => count + item.roles.length, 0),
      failedCanaries: failedCanaryIds.length,
    },
    undisclosedEvaluatorSemanticIds,
    mismatchedEvaluatorSemanticIds,
    missingCanaryRoles,
    failedCanaryIds,
  }
}
