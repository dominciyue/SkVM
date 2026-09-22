import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  AnalysisRequirementsSchema,
  compileAnalysisRequirements,
  createDefaultAnalysisRequirements,
  DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID,
  type AnalysisDiagnostic,
  type AnalysisPlan,
  type AnalysisRequirement,
} from "../../task-dsl/authorization/relations.ts"
import {
  AuthorizationConditionAnalysisRequestV1Schema,
  compileConditionAnalysisRequest,
  type AuthorizationConditionAnalysisRequestV1,
  type ConditionAnalysisPlan,
} from "../../task-dsl/authorization/conditions.ts"
import { AuthorizationTaskV0Schema, type AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import { loadPortableSourceBundle, type SourceBundle } from "./inputs.ts"
import type { AuthorizationAuthoringProvenance } from "./authoring.ts"

const NonEmptyString = z.string().trim().min(1)

export const LocalAnalysisProfileSchema = z.union([
  z.object({
    id: z.literal(DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID),
    origin: z.enum(["default", "derived"]),
  }).strict(),
  z.object({
    id: z.literal("task-supplied"),
    origin: z.literal("input"),
  }).strict(),
])

export const LocalAuthorizationInputSchema = z.object({
  schemaVersion: z.literal("authorization-assessment-input/v1"),
  sourceIdentity: z.object({
    repository: NonEmptyString,
    sourceRef: NonEmptyString,
  }).strict(),
  sourceRoot: NonEmptyString,
  sources: z.array(NonEmptyString).min(1),
  task: AuthorizationTaskV0Schema,
  analysisProfile: LocalAnalysisProfileSchema.optional(),
  analysisRequirements: AnalysisRequirementsSchema.optional(),
  conditionAnalysisRequest: AuthorizationConditionAnalysisRequestV1Schema.optional(),
}).strict()

export type LocalAuthorizationInput = z.infer<typeof LocalAuthorizationInputSchema>
export type LocalAnalysisProfile = z.infer<typeof LocalAnalysisProfileSchema>

export type LocalInputResult =
  | {
    status: "valid"
    inputPath: string
    rawInput: string
    normalizedInput: LocalAuthorizationInput
    provenance: AuthorizationAuthoringProvenance | { normalizerVersion: string }
    sourceRoot: string
    task: AuthorizationTaskV0
    sourceBundle: SourceBundle
    analysisProfile: LocalAnalysisProfile
    analysisRequirements: AnalysisRequirement[]
    analysisPlan: AnalysisPlan
    conditionAnalysisRequest?: AuthorizationConditionAnalysisRequestV1
    conditionPlan?: ConditionAnalysisPlan
  }
  | { status: "invalid"; inputPath: string; diagnostics: AnalysisDiagnostic[] }

function localDiagnostic(code: string, message: string, diagnosticPath?: string): AnalysisDiagnostic {
  return {
    code,
    message,
    ...(diagnosticPath ? { path: diagnosticPath } : {}),
  }
}

function normalizeSourceRoot(value: string): string | undefined {
  if (value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    return undefined
  }
  const normalized = path.posix.normalize(value)
  if (normalized === ".." || normalized.startsWith("../")) return undefined
  return normalized
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relation = path.relative(root, candidate)
  return relation === "" || (!relation.startsWith(`..${path.sep}`) && relation !== ".." && !path.isAbsolute(relation))
}

function declarationLocationDiagnostics(task: AuthorizationTaskV0, bundle: SourceBundle): AnalysisDiagnostic[] {
  const files = new Map(bundle.files.map(file => [file.relativePath, file]))
  const diagnostics: AnalysisDiagnostic[] = []
  task.entries.forEach((entry, entryIndex) => {
    entry.locations.forEach((location, locationIndex) => {
      const file = files.get(location.path)
      if (!file
        || location.startLine < file.cropRange.startLine
        || location.endLine > file.cropRange.endLine) {
        diagnostics.push(localDiagnostic(
          "declaration-source-location-invalid",
          `Declaration location is outside the explicit source bundle: ${location.path}:${location.startLine}-${location.endLine}.`,
          `task.entries.${entryIndex}.locations.${locationIndex}`,
        ))
      }
    })
  })
  return diagnostics
}

export async function loadLocalAuthorizationInput(inputFile: string): Promise<LocalInputResult> {
  const inputPath = path.resolve(inputFile)
  let raw: string
  try {
    raw = await readFile(inputPath, "utf8")
  } catch (error) {
    return {
      status: "invalid",
      inputPath,
      diagnostics: [localDiagnostic("input-read-failed", `Could not read local authorization input: ${String(error)}`, "$input")],
    }
  }

  let inputValue: unknown
  try {
    inputValue = JSON.parse(raw)
  } catch (error) {
    return {
      status: "invalid",
      inputPath,
      diagnostics: [localDiagnostic("input-json-invalid", `Local authorization input is not valid JSON: ${String(error)}`, "$input")],
    }
  }

  let provenance: AuthorizationAuthoringProvenance | { normalizerVersion: string } = { normalizerVersion: "normalized-input/v1" }
  const version = typeof inputValue === "object" && inputValue !== null && "schemaVersion" in inputValue ? inputValue.schemaVersion : undefined
  if (version === "authorization-assessment-authoring/v1" || version === "authorization-assessment-authoring/v2") {
    const { normalizeAuthorizationAuthoringInput } = await import("./authoring.ts")
    const normalized = normalizeAuthorizationAuthoringInput(inputValue)
    if (normalized.status !== "ready") return { status: "invalid", inputPath, diagnostics: normalized.diagnostics }
    inputValue = normalized.normalizedInput
    provenance = normalized.provenance
  } else if (version !== "authorization-assessment-input/v1") {
    return { status: "invalid", inputPath, diagnostics: [{code:"input-version-invalid",path:"schemaVersion",message:"Use authorization-assessment-authoring/v1, authoring/v2, or authorization-assessment-input/v1."}] }
  }
  const parsed = LocalAuthorizationInputSchema.safeParse(inputValue)
  if (!parsed.success) {
    return {
      status: "invalid",
      inputPath,
      diagnostics: parsed.error.issues.map(issue => localDiagnostic(
        "input-schema-invalid",
        issue.message,
        issue.path.length === 0 ? "$" : issue.path.join("."),
      )),
    }
  }
  const input = parsed.data
  const diagnostics: AnalysisDiagnostic[] = []
  if (
    input.sourceIdentity.repository !== input.task.repository
    || input.sourceIdentity.sourceRef !== input.task.sourceRef
  ) {
    diagnostics.push(localDiagnostic(
      "source-identity-mismatch",
      "sourceIdentity repository/ref must exactly match task repository/ref.",
      "sourceIdentity",
    ))
  }

  const normalizedRoot = normalizeSourceRoot(input.sourceRoot)
  if (normalizedRoot === undefined) {
    diagnostics.push(localDiagnostic(
      "unsafe-source-root",
      `sourceRoot must stay beneath the input file directory: ${input.sourceRoot}`,
      "sourceRoot",
    ))
    return { status: "invalid", inputPath, diagnostics }
  }
  const sourceRoot = path.resolve(path.dirname(inputPath), ...normalizedRoot.split("/"))
  try {
    const [canonicalInputDirectory, canonicalSourceRoot] = await Promise.all([
      realpath(path.dirname(inputPath)),
      realpath(sourceRoot),
    ])
    if (!isWithinRoot(canonicalInputDirectory, canonicalSourceRoot)) {
      diagnostics.push(localDiagnostic(
        "unsafe-source-root",
        `sourceRoot resolves outside the input file directory: ${input.sourceRoot}`,
        "sourceRoot",
      ))
      return { status: "invalid", inputPath, diagnostics }
    }
  } catch {
    // The exact reader below provides the stable missing-root or root-read-failed diagnostic.
  }
  const loadedBundle = await loadPortableSourceBundle({
    sourceRoot,
    repository: input.sourceIdentity.repository,
    sourceRef: input.sourceIdentity.sourceRef,
    sourceFiles: input.sources,
  })
  if (!loadedBundle.success) {
    diagnostics.push(...loadedBundle.diagnostics.map(item => localDiagnostic(item.code, item.message, item.path)))
  }

  const compiledTask = compileAuthorizationTask(input.task)
  if (compiledTask.status !== "ready" || compiledTask.diagnostics.length > 0) {
    diagnostics.push(...compiledTask.diagnostics.map(item => localDiagnostic(
      `task-${item.code}`,
      item.message,
      `task.${item.path}`,
    )))
    if (compiledTask.diagnostics.length === 0) {
      diagnostics.push(localDiagnostic(
        "task-not-ready",
        `Task compiled with status ${compiledTask.status}; every declared obligation must be runnable.`,
        "task.obligations",
      ))
    }
  }

  if (loadedBundle.success) {
    diagnostics.push(...declarationLocationDiagnostics(input.task, loadedBundle.bundle))
  }

  const analysisProfile: LocalAnalysisProfile = input.analysisProfile ?? (input.analysisRequirements
    ? { id: "task-supplied", origin: "input" }
    : { id: DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID, origin: "default" })
  const analysisRequirements = input.analysisRequirements
    ? [...input.analysisRequirements]
    : createDefaultAnalysisRequirements(input.task)
  if (input.analysisProfile && !input.analysisRequirements) {
    diagnostics.push(localDiagnostic(
      "analysis-profile-requirements-missing",
      "A materialized analysisProfile requires its analysisRequirements in the same normalized input.",
      "analysisRequirements",
    ))
  }
  if (
    input.analysisProfile?.id === DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID
    && input.analysisRequirements
    && JSON.stringify(input.analysisRequirements) !== JSON.stringify(createDefaultAnalysisRequirements(input.task))
  ) {
    diagnostics.push(localDiagnostic(
      "analysis-profile-drift",
      `Materialized ${DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID} requirements do not match the deterministic shared profile.`,
      "analysisRequirements",
    ))
  }
  const analysisPlan = compileAnalysisRequirements(input.task, analysisRequirements)
  if (analysisPlan.status !== "ready") {
    diagnostics.push(...analysisPlan.diagnostics.map(item => ({
      ...item,
      path: item.path ?? "analysisRequirements",
    })))
    if (analysisPlan.diagnostics.length === 0) {
      diagnostics.push(localDiagnostic(
        "analysis-plan-not-ready",
        `Analysis requirements compiled with status ${analysisPlan.status}.`,
        "analysisRequirements",
      ))
    }
  }
  const conditionPlan = input.conditionAnalysisRequest
    ? compileConditionAnalysisRequest(input.task, input.conditionAnalysisRequest)
    : undefined
  if (conditionPlan && conditionPlan.status !== "ready") {
    diagnostics.push(...conditionPlan.diagnostics.map(item => localDiagnostic(
      item.code,
      item.message,
      item.path ?? "conditionAnalysisRequest",
    )))
    if (conditionPlan.diagnostics.length === 0) {
      diagnostics.push(localDiagnostic(
        "condition-plan-not-ready",
        `Condition analysis request compiled with status ${conditionPlan.status}.`,
        "conditionAnalysisRequest",
      ))
    }
  }

  if (diagnostics.length > 0 || !loadedBundle.success) {
    return { status: "invalid", inputPath, diagnostics }
  }
  return {
    status: "valid",
    inputPath,
    rawInput: raw,
    normalizedInput: input,
    provenance,
    sourceRoot,
    task: input.task,
    sourceBundle: loadedBundle.bundle,
    analysisProfile,
    analysisRequirements,
    analysisPlan,
    ...(input.conditionAnalysisRequest
      ? { conditionAnalysisRequest: input.conditionAnalysisRequest, conditionPlan }
      : {}),
  }
}
