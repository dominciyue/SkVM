import { z } from "zod"

const NonEmptyString = z.string().trim().min(1)

const PolicyAcceptanceSchema = z.object({
  status: z.enum(["accepted", "conflicted", "unresolved"]),
  actorRole: NonEmptyString,
  reason: NonEmptyString,
}).strict()

const PolicySourceSchema = z.object({
  id: NonEmptyString,
  kind: NonEmptyString,
  text: NonEmptyString,
  location: NonEmptyString,
  revision: NonEmptyString,
  acceptance: PolicyAcceptanceSchema,
}).strict()

const PrincipalSchema = z.object({
  id: NonEmptyString,
  role: NonEmptyString,
  description: NonEmptyString,
  startingCapabilities: z.array(NonEmptyString),
}).strict()

const ResourceSchema = z.object({
  id: NonEmptyString,
  type: NonEmptyString,
  description: NonEmptyString,
}).strict()

const SourceLocationSchema = z.object({
  path: NonEmptyString,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict().superRefine((location, context) => {
  if (location.endLine < location.startLine) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endLine must be greater than or equal to startLine",
      path: ["endLine"],
    })
  }
})

const EntrySchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  locations: z.array(SourceLocationSchema).min(1),
}).strict()

const ConditionSchema = z.object({
  name: NonEmptyString,
  basis: NonEmptyString,
}).strict()

const ObligationSchema = z.object({
  id: NonEmptyString,
  principalId: NonEmptyString,
  resourceId: NonEmptyString,
  relation: NonEmptyString,
  operation: NonEmptyString,
  expectation: z.enum(["allow", "deny", "conditional"]),
  conditions: z.array(ConditionSchema),
  policySourceId: NonEmptyString,
  entryIds: z.array(NonEmptyString).min(1),
}).strict()

export const AuthorizationTaskV0Schema = z.object({
  schemaVersion: z.literal("source-authorization-assessment/v0"),
  taskId: NonEmptyString,
  request: NonEmptyString,
  repository: NonEmptyString,
  sourceRef: NonEmptyString,
  sourceMode: z.literal("fixed-context"),
  policySources: z.array(PolicySourceSchema).min(1),
  principals: z.array(PrincipalSchema).min(1),
  resources: z.array(ResourceSchema).min(1),
  entries: z.array(EntrySchema).min(1),
  obligations: z.array(ObligationSchema),
  scopeAssurance: NonEmptyString,
  requiredAnalysis: z.array(NonEmptyString).min(1),
  constraints: z.array(NonEmptyString).min(1),
}).strict()

export type AuthorizationTaskV0 = z.infer<typeof AuthorizationTaskV0Schema>
export type AuthorizationPolicySource = AuthorizationTaskV0["policySources"][number]
export type AuthorizationPrincipal = AuthorizationTaskV0["principals"][number]
export type AuthorizationResource = AuthorizationTaskV0["resources"][number]
export type AuthorizationEntry = AuthorizationTaskV0["entries"][number]
export type AuthorizationObligation = AuthorizationTaskV0["obligations"][number]

const AuthorizationCitationSchema = z.object({
  path: NonEmptyString,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  quote: NonEmptyString,
}).strict()

const AuthorizationFactEvidenceSchema = z.object({
  statement: NonEmptyString,
  citations: z.array(AuthorizationCitationSchema).min(1),
}).strict()

const AuthorizationFactGroupsSchema = z.object({
  entry: z.array(AuthorizationFactEvidenceSchema),
  binding: z.array(AuthorizationFactEvidenceSchema),
  control: z.array(AuthorizationFactEvidenceSchema),
  effect: z.array(AuthorizationFactEvidenceSchema),
  condition: z.array(AuthorizationFactEvidenceSchema),
}).strict()

const AuthorizationObligationResultSchema = z.object({
  obligationId: NonEmptyString,
  conclusion: z.enum(["source_supported_failure", "source_refuted", "unknown"]),
  explanation: NonEmptyString,
  facts: AuthorizationFactGroupsSchema,
  decisiveMissingFacts: z.array(NonEmptyString),
  suggestedObservations: z.array(NonEmptyString),
}).strict()

export const AuthorizationResultV0Schema = z.object({
  schemaVersion: z.literal("source-authorization-assessment-result/v0"),
  taskId: NonEmptyString,
  repository: NonEmptyString,
  sourceRef: NonEmptyString,
  results: z.array(AuthorizationObligationResultSchema),
  scopeClaim: z.object({
    kind: z.enum(["declared-obligations-only", "repository-all-entries"]),
    statement: NonEmptyString,
  }).strict(),
}).strict()

export type AuthorizationResultV0 = z.infer<typeof AuthorizationResultV0Schema>
export type AuthorizationObligationResult = AuthorizationResultV0["results"][number]

export interface Diagnostic {
  code: string
  message: string
  path: string
  severity: "error" | "warning"
}

export type ParseAuthorizationTaskResult =
  | { success: true; task: AuthorizationTaskV0; diagnostics: [] }
  | { success: false; diagnostics: Diagnostic[] }

function formatPath(path: Array<string | number>): string {
  return path.length === 0 ? "$" : path.join(".")
}

export type ParseAuthorizationResultResult =
  | { success: true; result: AuthorizationResultV0; diagnostics: [] }
  | { success: false; diagnostics: Diagnostic[] }

export function parseAuthorizationResult(input: unknown): ParseAuthorizationResultResult {
  const parsed = AuthorizationResultV0Schema.safeParse(input)
  if (parsed.success) {
    return { success: true, result: parsed.data, diagnostics: [] }
  }

  return {
    success: false,
    diagnostics: parsed.error.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      path: formatPath(issue.path),
      severity: "error",
    })),
  }
}

export function parseAuthorizationTask(input: unknown): ParseAuthorizationTaskResult {
  const parsed = AuthorizationTaskV0Schema.safeParse(input)
  if (parsed.success) {
    return { success: true, task: parsed.data, diagnostics: [] }
  }

  return {
    success: false,
    diagnostics: parsed.error.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      path: formatPath(issue.path),
      severity: "error",
    })),
  }
}
