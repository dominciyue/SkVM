import { z, type ZodIssue } from "zod"
import {
  AnalysisRequirementsSchema,
  compileAnalysisRequirements,
  createDefaultAnalysisRequirements,
  DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID,
  type AnalysisRequirement,
} from "../../task-dsl/authorization/relations.ts"
import {
  AuthorizationConditionAnalysisRequestV1Schema,
  compileConditionAnalysisRequest,
} from "../../task-dsl/authorization/conditions.ts"
import { AuthorizationTaskV0Schema } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  LocalAuthorizationInputSchema,
  type LocalAnalysisProfile,
  type LocalAuthorizationInput,
} from "./local-input.ts"

const NonEmptyString = z.string().trim().min(1)

export const AuthorizationAuthoringProfileV1Schema = z.union([
  z.object({
    id: z.literal(DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID),
  }).strict(),
  z.object({
    id: z.literal("task-supplied"),
    requirements: AnalysisRequirementsSchema,
  }).strict(),
])

export const AuthorizationAuthoringInputV1Schema = z.object({
  schemaVersion: z.literal("authorization-assessment-authoring/v1"),
  sourceRoot: NonEmptyString,
  sources: z.array(NonEmptyString).min(1),
  task: AuthorizationTaskV0Schema,
  analysisProfile: AuthorizationAuthoringProfileV1Schema.optional(),
  conditionAnalysisRequest: AuthorizationConditionAnalysisRequestV1Schema.optional(),
}).strict()

const AuthorizationAuthoringEnvelopeV1Schema = AuthorizationAuthoringInputV1Schema.extend({
  task: z.unknown(),
}).strict()

export type AuthorizationAuthoringInputV1 = z.infer<typeof AuthorizationAuthoringInputV1Schema>

export interface AuthorizationAuthoringDiagnostic {
  code: string
  message: string
  path: string
  fix: string
}

export interface AuthorizationAuthoringProvenance {
  task: "author"
  sourceRoot: "author"
  sources: "author"
  sourceIdentity: "derived-from-task"
  analysisRequirements: "derived-from-authorization-core-v1" | "author"
  conditionAnalysisRequest: "author" | "not-provided"
  sourceRefVerification: "authored"
}

export type AuthorizationAuthoringNormalization =
  | {
    status: "ready"
    authoringInput: AuthorizationAuthoringInputV1
    normalizedInput: LocalAuthorizationInput
    analysisProfile: LocalAnalysisProfile
    analysisRequirements: AnalysisRequirement[]
    provenance: AuthorizationAuthoringProvenance
    diagnostics: []
  }
  | {
    status: "needs-input"
    diagnostics: AuthorizationAuthoringDiagnostic[]
  }

function issuePath(issue: ZodIssue): string {
  return issue.path.length === 0 ? "$" : issue.path.join(".")
}

function diagnostic(
  code: string,
  message: string,
  path: string,
  fix: string,
): AuthorizationAuthoringDiagnostic {
  return { code, message, path, fix }
}

function envelopeIssue(issue: ZodIssue): AuthorizationAuthoringDiagnostic {
  const path = issuePath(issue)
  const root = issue.path[0]
  if (root === "sourceRoot") {
    return diagnostic(
      "author-source-root-required",
      issue.message,
      path,
      "Provide a non-empty sourceRoot relative to the authoring file directory.",
    )
  }
  if (root === "sources") {
    return diagnostic(
      "author-sources-required",
      issue.message,
      path,
      "List every source file that contains a declared entry location.",
    )
  }
  if (root === "task") {
    return diagnostic(
      "author-task-required",
      issue.message,
      path,
      "Provide the bounded authorization task declaration; normalization never invents it.",
    )
  }
  if (root === "analysisProfile") {
    return diagnostic(
      "author-analysis-profile-invalid",
      issue.message,
      path,
      `Use ${DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID} or provide a task-supplied requirements list.`,
    )
  }
  if (root === "conditionAnalysisRequest") {
    return diagnostic(
      "author-condition-request-invalid",
      issue.message,
      path,
      "Bind each requested condition ID to one unique authored condition name.",
    )
  }
  return diagnostic(
    "authoring-schema-invalid",
    issue.message,
    path,
    "Remove unknown fields and provide the exact authorization-assessment-authoring/v1 shape.",
  )
}

function taskIssue(issue: ZodIssue): AuthorizationAuthoringDiagnostic {
  const path = `task.${issuePath(issue)}`
  if (issue.path.length === 1 && issue.path[0] === "policySources") {
    return diagnostic(
      "author-policy-required",
      issue.message,
      "task.policySources",
      "Provide at least one accepted, conflicted, or unresolved policy source with its author-controlled provenance.",
    )
  }
  if (
    issue.path.length === 3
    && issue.path[0] === "obligations"
    && issue.path[2] === "expectation"
  ) {
    return diagnostic(
      "author-expectation-required",
      issue.message,
      path,
      "Set the authored policy expectation to allow, deny, or conditional; normalization will not infer it from code.",
    )
  }
  if (issue.path[0] === "entries" || issue.path[0] === "scopeAssurance") {
    return diagnostic(
      "author-source-scope-required",
      issue.message,
      path,
      "Provide the declared entry locations and bounded scope; normalization will not search the repository.",
    )
  }
  return diagnostic(
    "author-task-schema-invalid",
    issue.message,
    path,
    "Correct the cited task field to satisfy source-authorization-assessment/v0.",
  )
}

function sortedDiagnostics(
  diagnostics: AuthorizationAuthoringDiagnostic[],
): AuthorizationAuthoringDiagnostic[] {
  return diagnostics.sort((left, right) => left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message))
}

export function normalizeAuthorizationAuthoringInput(
  input: unknown,
): AuthorizationAuthoringNormalization {
  const diagnostics: AuthorizationAuthoringDiagnostic[] = []
  const envelope = AuthorizationAuthoringEnvelopeV1Schema.safeParse(input)
  if (!envelope.success) {
    diagnostics.push(...envelope.error.issues.map(envelopeIssue))
  }

  const rawTask = typeof input === "object" && input !== null && "task" in input
    ? (input as { task?: unknown }).task
    : undefined
  const parsedTask = AuthorizationTaskV0Schema.safeParse(rawTask)
  if (!parsedTask.success) diagnostics.push(...parsedTask.error.issues.map(taskIssue))
  if (!envelope.success || !parsedTask.success) {
    return { status: "needs-input", diagnostics: sortedDiagnostics(diagnostics) }
  }

  const authoringInput = AuthorizationAuthoringInputV1Schema.parse({
    ...envelope.data,
    task: parsedTask.data,
  })
  const compiledTask = compileAuthorizationTask(authoringInput.task)
  diagnostics.push(...compiledTask.diagnostics.map(item => diagnostic(
    `author-task-${item.code}`,
    item.message,
    `task.${item.path}`,
    "Correct the referenced authored ID or missing declaration before normalization.",
  )))
  if (compiledTask.status !== "ready" && compiledTask.diagnostics.length === 0) {
    diagnostics.push(diagnostic(
      "author-task-not-ready",
      `Task compiled with status ${compiledTask.status}.`,
      "task.obligations",
      "Provide at least one runnable explicit authorization obligation.",
    ))
  }
  if (diagnostics.length > 0) {
    return { status: "needs-input", diagnostics: sortedDiagnostics(diagnostics) }
  }

  const usesAuthorRequirements = authoringInput.analysisProfile?.id === "task-supplied"
  let analysisRequirements: AnalysisRequirement[]
  let analysisProfile: LocalAnalysisProfile
  if (authoringInput.analysisProfile?.id === "task-supplied") {
    analysisRequirements = authoringInput.analysisProfile.requirements.map(requirement => ({ ...requirement }))
    analysisProfile = { id: "task-supplied", origin: "input" }
  } else {
    analysisRequirements = createDefaultAnalysisRequirements(authoringInput.task)
    analysisProfile = { id: DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID, origin: "derived" }
  }
  const analysisPlan = compileAnalysisRequirements(authoringInput.task, analysisRequirements)
  if (analysisPlan.status !== "ready") {
    diagnostics.push(...analysisPlan.diagnostics.map(item => diagnostic(
      `author-analysis-${item.code}`,
      item.message,
      item.path ?? "analysisProfile",
      "Correct the explicit requirement mapping or use the shared authorization-core-v1 profile.",
    )))
    if (analysisPlan.diagnostics.length === 0) {
      diagnostics.push(diagnostic(
        "author-analysis-plan-not-ready",
        `Analysis requirements compiled with status ${analysisPlan.status}.`,
        "analysisProfile",
        "Provide requirements that compile for every declared runnable obligation.",
      ))
    }
  }

  if (authoringInput.conditionAnalysisRequest) {
    const conditionPlan = compileConditionAnalysisRequest(
      authoringInput.task,
      authoringInput.conditionAnalysisRequest,
    )
    if (conditionPlan.status !== "ready") {
      diagnostics.push(...conditionPlan.diagnostics.map(item => diagnostic(
        `author-${item.code}`,
        item.message,
        item.path ?? "conditionAnalysisRequest",
        "Bind the condition ID to one unique condition name on the cited authored obligation.",
      )))
      if (conditionPlan.diagnostics.length === 0) {
        diagnostics.push(diagnostic(
          "author-condition-plan-not-ready",
          `Condition request compiled with status ${conditionPlan.status}.`,
          "conditionAnalysisRequest",
          "Provide at least one valid condition binding for a runnable authored obligation.",
        ))
      }
    }
  }

  if (diagnostics.length > 0) {
    return { status: "needs-input", diagnostics: sortedDiagnostics(diagnostics) }
  }

  const normalizedInput = LocalAuthorizationInputSchema.parse({
    schemaVersion: "authorization-assessment-input/v1",
    sourceIdentity: {
      repository: authoringInput.task.repository,
      sourceRef: authoringInput.task.sourceRef,
    },
    sourceRoot: authoringInput.sourceRoot,
    sources: [...authoringInput.sources],
    task: authoringInput.task,
    analysisProfile,
    analysisRequirements,
    ...(authoringInput.conditionAnalysisRequest
      ? { conditionAnalysisRequest: authoringInput.conditionAnalysisRequest }
      : {}),
  })
  const provenance: AuthorizationAuthoringProvenance = {
    task: "author",
    sourceRoot: "author",
    sources: "author",
    sourceIdentity: "derived-from-task",
    analysisRequirements: usesAuthorRequirements
      ? "author"
      : "derived-from-authorization-core-v1",
    conditionAnalysisRequest: authoringInput.conditionAnalysisRequest ? "author" : "not-provided",
    sourceRefVerification: "authored",
  }
  return {
    status: "ready",
    authoringInput,
    normalizedInput,
    analysisProfile,
    analysisRequirements,
    provenance,
    diagnostics: [],
  }
}
