import { extractStructured } from "../../providers/structured.ts"
import { compactAuthorizationSchema, normalizeCompactAuthorizationResult, type CompactAuthorizationResult, type CompactAuthorizationNormalization } from "../../task-dsl/authorization/compact-transport.ts"
import type { LLMProvider } from "../../providers/types.ts"
import type { ZodType } from "zod"
import {
  measureAuthorizationPromptCharacters,
  renderAuthorizationTask,
  type AuthorizationPromptCharacterBreakdown,
  type AuthorizationRenderArm,
  type AuthorizationRenderOptions,
  type RenderedAuthorizationTask,
} from "../../task-dsl/authorization/render.ts"
import { validateAuthorizationResult, type AuthorizationValidation } from "../../task-dsl/authorization/result.ts"
import {
  validateRelationCoverage,
  type CoverageValidation,
  type RelationCoverage,
} from "../../task-dsl/authorization/relation-result.ts"
import {
  compileAnalysisRequirements,
  type AnalysisPlan,
  type AnalysisRequirement,
} from "../../task-dsl/authorization/relations.ts"
import {
  compileConditionAnalysisRequest,
  validateConditionAnalysisResult,
  type AuthorizationConditionAnalysisRequestV1,
  type AuthorizationConditionAnalysisResultV1,
  type ConditionAnalysisPlan,
  type ConditionAnalysisValidation,
} from "../../task-dsl/authorization/conditions.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask, type CompiledAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  AuthorizationWireResultV1Schema,
  AuthorizationWireResultV2Schema,
  AuthorizationWireResultV3Schema,
  normalizeAuthorizationWireResult,
  normalizeAuthorizationWireResultV2,
  normalizeAuthorizationWireResultV3,
  type AuthorizationWireNormalization,
  type AuthorizationWireNormalizationV2,
  type AuthorizationWireNormalizationV3,
  type AuthorizationWireResultV1,
  type AuthorizationWireResultV2,
  type AuthorizationWireResultV3,
} from "../../task-dsl/authorization/transport.ts"
import { renderSourceBundle, type SourceBundle } from "./inputs.ts"
import {
  AuthorizationCallTimeoutError,
  createTelemetryProvider,
  type AuthorizationLifecycleEvent,
  type AuthorizationProviderAttempt,
  type AuthorizationTelemetrySummary,
} from "./telemetry.ts"

const RESULT_TOOL_NAME = "submit_authorization_result"
const ACTIONABLE_DIAGNOSTICS = new Set([
  "duplicate-fact-id", "unknown-fact-id", "wire-schema-invalid",
  "task-id-mismatch",
  "repository-mismatch",
  "source-ref-mismatch",
  "missing-obligation-result",
  "duplicate-obligation-result",
  "foreign-obligation-result",
  "citation-file-not-allowed",
  "unknown-source-id",
  "citation-out-of-range",
  "citation-text-mismatch",
  "missing-fact-group",
  "uninformative-unknown",
  "unsupported-completeness",
  "coverage-schema-invalid",
  "missing-relation-coverage",
  "duplicate-relation-coverage",
  "foreign-requirement-coverage",
  "foreign-coverage-obligation",
  "dangling-fact-pointer",
  "fact-pointer-obligation-mismatch",
  "coverage-fact-pointer-required",
  "required-coverage-not-applicable",
  "condition-result-schema-invalid",
  "missing-condition-analysis",
  "duplicate-condition-analysis",
  "foreign-condition-analysis",
  "condition-branch-limit-exceeded",
  "duplicate-condition-branch-id",
  "condition-branch-obligation-mismatch",
  "unknown-condition-id",
  "condition-obligation-mismatch",
  "duplicate-condition-assignment",
  "conflicting-condition-assignment",
  "duplicate-condition-branch",
  "conflicting-condition-branch-effect",
  "unknown-condition-missing-fact",
  "condition-fact-pointer-required",
  "dangling-condition-fact-pointer",
  "condition-fact-pointer-obligation-mismatch",
  "duplicate-unexamined-condition",
  "condition-both-examined-and-unexamined",
  "missing-condition-coverage",
  "bounded-condition-analysis-has-unexamined",
  "incomplete-condition-analysis-has-no-unexamined",
  "incomplete-condition-analysis-missing-limitation",
])

type AuthorizationWireResult = AuthorizationWireResultV1 | AuthorizationWireResultV2 | AuthorizationWireResultV3 | CompactAuthorizationResult
type AuthorizationWireNormalizationResult =
  | AuthorizationWireNormalization
  | AuthorizationWireNormalizationV2
  | AuthorizationWireNormalizationV3
  | CompactAuthorizationNormalization

export interface RunAuthorizationTaskOptions {
  timeoutMs: number
  unitTimeoutMs?: number
  maxTokens: number
  maxProviderDispatches?: number
  maxDomainRepairs: 0 | 1
}

export interface AuthorizationGenerationArtifact {
  result: AuthorizationResultV0
  wireResult?: AuthorizationWireResult
  normalization?: AuthorizationWireNormalizationResult
  relationCoverage?: RelationCoverage[]
  coverageValidation?: CoverageValidation
  conditionAnalysis?: AuthorizationConditionAnalysisResultV1
  conditionValidation?: ConditionAnalysisValidation
  rawResponse: string
  providerAttemptIds: string[]
  outputAttemptId: string
  validation: AuthorizationValidation
}

export interface AuthorizationTransportArtifact {
  wireResult: AuthorizationWireResult
  normalization: AuthorizationWireNormalizationResult
  rawResponse: string
  providerAttemptIds: string[]
  outputAttemptId: string
}

export interface AuthorizationTaskRun {
  wireVersion?: string
  firstResponse?: { schemaValid: boolean; deliveryComplete: boolean }
  protocolMetrics?: { fallbackCalls: number; repairCalls: number; modelOutputCharacters: number; hostMetadataFields: string[] }
  status:
    | "completed"
    | "completed-with-diagnostics"
    | "needs-input"
    | "input-invalid"
    | "transport-failed"
    | "timeout-unknown"
  arm: AuthorizationRenderArm
  compiled: CompiledAuthorizationTask
  analysisPlan?: AnalysisPlan
  conditionPlan?: ConditionAnalysisPlan
  renderedPrompt: string
  promptSections?: RenderedAuthorizationTask["sections"]
  promptCharacters?: AuthorizationRunPromptCharacters
  initialTransport?: AuthorizationTransportArtifact
  repairTransport?: AuthorizationTransportArtifact
  initial?: AuthorizationGenerationArtifact
  repair?: AuthorizationGenerationArtifact
  finalKind?: "initial" | "repair"
  attempts: AuthorizationProviderAttempt[]
  events?: AuthorizationLifecycleEvent[]
  telemetry: AuthorizationTelemetrySummary
  error?: { name: string; message: string }
}

export interface AuthorizationRepairPromptCharacterBreakdown {
  instructions: number
  declaration: number
  methodContext?: number
  source: number
  outputContract: number
  currentAnswer: number
  diagnostics: number
  total: number
  tokenMeasurement: "provider-reported-only"
}

export interface AuthorizationRunPromptCharacters {
  initial: AuthorizationPromptCharacterBreakdown
  repair?: AuthorizationRepairPromptCharacterBreakdown
}

export interface RunAuthorizationTaskInput {
  wireVersion?: "legacy" | "v4"
  task: AuthorizationTaskV0
  sourceBundle: SourceBundle
  analysisRequirements?: AnalysisRequirement[]
  conditionAnalysisRequest?: AuthorizationConditionAnalysisRequestV1
  provider: LLMProvider
  arm: AuthorizationRenderArm
  renderOptions?: AuthorizationRenderOptions
  options: RunAuthorizationTaskOptions
  onLifecycleEvent?: (event: AuthorizationLifecycleEvent) => void | Promise<void>
}

function errorArtifact(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  }
}

function hasActionableDiagnostics(
  validation: AuthorizationValidation,
  coverageValidation?: CoverageValidation,
  conditionValidation?: ConditionAnalysisValidation,
): boolean {
  return [
    ...validation.diagnostics,
    ...(coverageValidation?.diagnostics ?? []),
    ...(conditionValidation?.diagnostics ?? []),
  ]
    .some(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
}

function buildRepairPrompt(
  rendered: RenderedAuthorizationTask,
  sourceContext: string,
  initial: AuthorizationTransportArtifact,
  validation?: AuthorizationValidation,
  coverageValidation?: CoverageValidation,
  conditionValidation?: ConditionAnalysisValidation,
): { prompt: string; characters: AuthorizationRepairPromptCharacterBreakdown } {
  const actionable = [
    ...initial.normalization.diagnostics,
    ...(validation?.diagnostics ?? []),
    ...(coverageValidation?.diagnostics ?? []),
    ...(conditionValidation?.diagnostics ?? []),
  ]
    .filter(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
    .map(diagnostic => ({ code: diagnostic.code, path: diagnostic.path ?? "result", message: diagnostic.message }))
  const sections = {
    instructions: "# Authorization wire repair\n\nThe current structured answer did not satisfy deterministic host checks. Revise only that answer from the same declaration and exact source. Do not add unavailable facts or infer a requested conclusion.",
    declaration: `## ${rendered.sections.declarationLabel ?? "Canonical declaration"}\n${rendered.sections.declaration}`,
    methodContext: [
      rendered.sections.publicAnalysis
        ? `## Public analysis questions\n${rendered.sections.publicAnalysis}`
        : "",
      rendered.sections.analysisLedger
        ? `## Analysis requirement ledger\n${rendered.sections.analysisLedger}`
        : "",
      rendered.sections.conditionAnalysis
        ? `## Condition analysis request\n${rendered.sections.conditionAnalysis}`
        : "",
    ].filter(Boolean).join("\n\n"),
    outputContract: `## Result contract\n${rendered.sections.outputContract}`,
    source: `## Fixed source context\n${sourceContext}`,
    currentAnswer: `## Current wire answer\n${JSON.stringify(initial.wireResult, null, 2)}`,
    diagnostics: `## Deterministic host diagnostics\n${JSON.stringify(actionable, null, 2)}`,
  }
  const prompt = [
    sections.instructions,
    sections.declaration,
    sections.methodContext,
    sections.outputContract,
    sections.source,
    sections.currentAnswer,
    sections.diagnostics,
  ].join("\n\n")
  return {
    prompt,
    characters: {
      instructions: sections.instructions.length,
      declaration: sections.declaration.length,
      ...(sections.methodContext ? { methodContext: sections.methodContext.length } : {}),
      source: sections.source.length,
      outputContract: sections.outputContract.length,
      currentAnswer: sections.currentAnswer.length,
      diagnostics: sections.diagnostics.length,
      total: prompt.length,
      tokenMeasurement: "provider-reported-only",
    },
  }
}

export async function runAuthorizationTask(input: RunAuthorizationTaskInput): Promise<AuthorizationTaskRun> {
  if (input.options.maxDomainRepairs !== 0 && input.options.maxDomainRepairs !== 1) {
    throw new Error("maxDomainRepairs must be 0 or 1")
  }
  const compiled = compileAuthorizationTask(input.task)
  const analysisPlan = input.analysisRequirements
    ? compileAnalysisRequirements(input.task, input.analysisRequirements)
    : undefined
  const conditionPlan = input.conditionAnalysisRequest
    ? compileConditionAnalysisRequest(input.task, input.conditionAnalysisRequest)
    : undefined
  const method = conditionPlan ? "conditions" : analysisPlan ? "ledger" : "plain"
  const compact = input.wireVersion === "v4"
  const wireVersion = `source-authorization-assessment-wire/v${compact ? 4 : conditionPlan ? 3 : analysisPlan ? 2 : 1}`
  const wireSchema = (compact ? compactAuthorizationSchema(method) : conditionPlan ? AuthorizationWireResultV3Schema : analysisPlan ? AuthorizationWireResultV2Schema : AuthorizationWireResultV1Schema) as ZodType<AuthorizationWireResult>
  const rendered = renderAuthorizationTask(compiled, input.arm, analysisPlan, conditionPlan, { ...input.renderOptions, wireVersion: input.wireVersion })
  const sourceContext = renderSourceBundle(input.sourceBundle)
  const renderedPrompt = rendered.prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext)
  const promptCharacters: AuthorizationRunPromptCharacters = {
    initial: measureAuthorizationPromptCharacters(rendered, sourceContext),
  }
  const telemetry = createTelemetryProvider(input.provider, {
    perCallTimeoutMs: input.options.timeoutMs,
    unitTimeoutMs: input.options.unitTimeoutMs ?? 600_000,
    maxDispatches: input.options.maxProviderDispatches ?? 4,
    responseSchema: wireSchema,
    ...(input.onLifecycleEvent ? { onEvent: input.onLifecycleEvent } : {}),
  })

  const finish = async (
    partial: Omit<AuthorizationTaskRun, "attempts" | "events" | "telemetry" | "promptCharacters">,
  ): Promise<AuthorizationTaskRun> => {
    await telemetry.close(`host-return:${partial.status}`)
    return {
      ...partial,
      promptSections: rendered.sections,
      wireVersion,
      firstResponse: {
        schemaValid: telemetry.attempts[0]?.schemaValidation?.valid ?? false,
        deliveryComplete: !!(partial.initial && partial.initial.outputAttemptId === telemetry.attempts[0]?.id && partial.initial.normalization?.status === "valid" && partial.initial.validation.diagnostics.length === 0 && !(partial.initial.coverageValidation?.diagnostics.length) && !(partial.initial.conditionValidation?.diagnostics.length)),
      },
      protocolMetrics: {
        fallbackCalls: telemetry.attempts.filter(a => a.transport === "prompt-parse").length,
        repairCalls: telemetry.attempts.filter(a => a.phase === "domain-repair").length,
        modelOutputCharacters: telemetry.attempts.reduce((n, a) => n + (a.response ? a.response.text.length + JSON.stringify(a.response.toolCalls).length : 0), 0),
        hostMetadataFields: compact ? ["schemaVersion", "taskId", "repository", "sourceRef", "scopeClaim", "fact grouping", "fact pointers", "nested obligationId"] : ["taskId", "repository", "sourceRef", "citation path/quote"],
      },
      ...(analysisPlan ? { analysisPlan } : {}),
      ...(conditionPlan ? { conditionPlan } : {}),
      promptCharacters,
      attempts: telemetry.attempts,
      events: telemetry.events,
      telemetry: telemetry.summary(),
    }
  }

  if (compiled.runnableObligations.length === 0) {
    return finish({ status: "needs-input", arm: input.arm, compiled, renderedPrompt })
  }
  if (analysisPlan && analysisPlan.status !== "ready") {
    return finish({
      status: "input-invalid",
      arm: input.arm,
      compiled,
      renderedPrompt,
      error: {
        name: "AuthorizationAnalysisPlanInvalid",
        message: "Analysis requirements must compile to a ready plan before generation.",
      },
    })
  }
  if (conditionPlan && (!analysisPlan || conditionPlan.status !== "ready")) {
    return finish({
      status: "input-invalid",
      arm: input.arm,
      compiled,
      renderedPrompt,
      error: {
        name: "AuthorizationConditionPlanInvalid",
        message: !analysisPlan
          ? "Condition analysis requires a ready public analysis plan before generation."
          : "Condition analysis requests must compile to a ready plan before generation.",
      },
    })
  }
  if (
    input.sourceBundle.repository !== input.task.repository
    || input.sourceBundle.sourceRef !== input.task.sourceRef
    || input.sourceBundle.sourceMode !== input.task.sourceMode
  ) {
    return finish({
      status: "input-invalid",
      arm: input.arm,
      compiled,
      renderedPrompt,
      error: {
        name: "AuthorizationInputMismatch",
        message: "Task and exact source bundle repository/ref/mode must match before generation.",
      },
    })
  }

  const normalizeWire = (wireInput: unknown): AuthorizationWireNormalizationResult => compact
    ? normalizeCompactAuthorizationResult({ compiled, sourceBundle: input.sourceBundle, method, analysisPlan, conditionPlan, input: wireInput })
    : conditionPlan
    ? normalizeAuthorizationWireResultV3({ compiled, sourceBundle: input.sourceBundle, input: wireInput })
    : analysisPlan
      ? normalizeAuthorizationWireResultV2({ compiled, sourceBundle: input.sourceBundle, input: wireInput })
      : normalizeAuthorizationWireResult({ compiled, sourceBundle: input.sourceBundle, input: wireInput })

  const extract = async (phase: "initial" | "domain-repair", prompt: string) => {
    const firstAttemptIndex = telemetry.attempts.length
    const extracted = await telemetry.inPhase(
      phase,
      provider => extractStructured({
        provider,
        schema: wireSchema,
        schemaName: RESULT_TOOL_NAME,
        schemaDescription: "Return the bounded authorization assessment result. This schema tool is an output container and is never executed.",
        prompt,
        system: "Analyze only the supplied fixed source context. Do not execute tools, contact a target, infer unavailable deployment facts, or claim repository-wide discovery.",
        maxRetries: 1,
        maxTokens: input.options.maxTokens,
      }),
    )
    const providerAttemptIds = telemetry.attempts
      .slice(firstAttemptIndex)
      .map(attempt => attempt.id)
    const outputAttemptId = providerAttemptIds.at(-1)
    if (!outputAttemptId) {
      throw new Error(`Structured ${phase} generation returned without a recorded provider attempt.`)
    }
    return { ...extracted, providerAttemptIds, outputAttemptId }
  }

  const buildGenerationArtifact = (
    transport: AuthorizationTransportArtifact,
  ): AuthorizationGenerationArtifact | undefined => {
    const result = transport.normalization.result
    if (!result) return undefined
    const validation = validateAuthorizationResult(compiled, result, input.sourceBundle)
    if (conditionPlan) {
      if (transport.normalization.normalizerVersion !== "authorization-wire-normalizer/v3" && transport.normalization.normalizerVersion !== "authorization-wire-normalizer/v4") {
        throw new Error("Condition analysis plan requires wire normalizer v3.")
      }
      const relationCoverage = transport.normalization.coverage ?? []
      const conditionAnalysis = transport.normalization.conditionAnalysis
      if (!conditionAnalysis) {
        throw new Error("Wire normalizer v3 returned no condition analysis.")
      }
      return {
        result,
        wireResult: transport.wireResult,
        normalization: transport.normalization,
        relationCoverage,
        coverageValidation: transport.normalization.normalizerVersion === "authorization-wire-normalizer/v4" ? transport.normalization.coverageValidation : validateRelationCoverage(analysisPlan!, result, relationCoverage),
        conditionAnalysis,
        conditionValidation: transport.normalization.normalizerVersion === "authorization-wire-normalizer/v4" ? transport.normalization.conditionValidation : validateConditionAnalysisResult(conditionPlan, result, conditionAnalysis),
        rawResponse: transport.rawResponse,
        providerAttemptIds: transport.providerAttemptIds,
        outputAttemptId: transport.outputAttemptId,
        validation,
      }
    }
    if (analysisPlan) {
      if (transport.normalization.normalizerVersion !== "authorization-wire-normalizer/v2" && transport.normalization.normalizerVersion !== "authorization-wire-normalizer/v4") {
        throw new Error("Analysis plan requires wire normalizer v2.")
      }
      const relationCoverage = transport.normalization.coverage ?? []
      return {
        result,
        wireResult: transport.wireResult,
        normalization: transport.normalization,
        relationCoverage,
        coverageValidation: transport.normalization.normalizerVersion === "authorization-wire-normalizer/v4" ? transport.normalization.coverageValidation : validateRelationCoverage(analysisPlan, result, relationCoverage),
        rawResponse: transport.rawResponse,
        providerAttemptIds: transport.providerAttemptIds,
        outputAttemptId: transport.outputAttemptId,
        validation,
      }
    }
    return {
      result,
      wireResult: transport.wireResult,
      normalization: transport.normalization,
      rawResponse: transport.rawResponse,
      providerAttemptIds: transport.providerAttemptIds,
      outputAttemptId: transport.outputAttemptId,
      validation,
    }
  }

  let initialTransport: AuthorizationTransportArtifact | undefined
  let initial: AuthorizationGenerationArtifact | undefined
  let repairTransport: AuthorizationTransportArtifact | undefined
  let repair: AuthorizationGenerationArtifact | undefined
  let finalKind: "initial" | "repair" = "initial"
  try {
    const extractedInitial = await extract("initial", renderedPrompt)
    const initialNormalization = normalizeWire(extractedInitial.result)
    initialTransport = {
      wireResult: extractedInitial.result as AuthorizationWireResult,
      normalization: initialNormalization,
      rawResponse: extractedInitial.rawResponse,
      providerAttemptIds: extractedInitial.providerAttemptIds,
      outputAttemptId: extractedInitial.outputAttemptId,
    }
    initial = buildGenerationArtifact(initialTransport)
    const repairNeeded = initialNormalization.status === "invalid"
      || (initial !== undefined && hasActionableDiagnostics(
        initial.validation,
        initial.coverageValidation,
        initial.conditionValidation,
      ))
    if (input.options.maxDomainRepairs === 1 && repairNeeded) {
      const repairPrompt = buildRepairPrompt(
        rendered,
        sourceContext,
        initialTransport,
        initial?.validation,
        initial?.coverageValidation,
        initial?.conditionValidation,
      )
      promptCharacters.repair = repairPrompt.characters
      const extractedRepair = await extract(
        "domain-repair",
        repairPrompt.prompt,
      )
      const repairNormalization = normalizeWire(extractedRepair.result)
      repairTransport = {
        wireResult: extractedRepair.result as AuthorizationWireResult,
        normalization: repairNormalization,
        rawResponse: extractedRepair.rawResponse,
        providerAttemptIds: extractedRepair.providerAttemptIds,
        outputAttemptId: extractedRepair.outputAttemptId,
      }
      repair = buildGenerationArtifact(repairTransport)
      if (repair) {
        finalKind = "repair"
      }
    }

    const finalArtifact = repair ?? initial
    if (!finalArtifact) {
      return finish({
        status: "transport-failed",
        arm: input.arm,
        compiled,
        renderedPrompt,
        initialTransport,
        ...(repairTransport ? { repairTransport } : {}),
        error: {
          name: "AuthorizationWireNormalizationError",
          message: "No wire answer could be normalized into a canonical authorization result.",
        },
      })
    }
    const finalTransport = finalKind === "repair" ? repairTransport : initialTransport
    if (!finalTransport) {
      throw new Error("Canonical authorization result exists without its transport artifact.")
    }
    const finalDiagnostics = [
      ...finalTransport.normalization.diagnostics,
      ...finalArtifact.validation.diagnostics,
      ...(finalArtifact.coverageValidation?.diagnostics ?? []),
      ...(finalArtifact.conditionValidation?.diagnostics ?? []),
      ...(repairTransport && finalKind !== "repair" ? repairTransport.normalization.diagnostics : []),
    ]
    return finish({
      status: finalDiagnostics.length === 0 ? "completed" : "completed-with-diagnostics",
      arm: input.arm,
      compiled,
      renderedPrompt,
      initialTransport,
      ...(initial ? { initial } : {}),
      ...(repairTransport ? { repairTransport } : {}),
      ...(repair ? { repair } : {}),
      finalKind,
    })
  } catch (error) {
    return finish({
      status: error instanceof AuthorizationCallTimeoutError ? "timeout-unknown" : "transport-failed",
      arm: input.arm,
      compiled,
      renderedPrompt,
      ...(initialTransport ? { initialTransport } : {}),
      ...(initial ? { initial } : {}),
      ...(repairTransport ? { repairTransport } : {}),
      ...(repair ? { repair } : {}),
      ...(initial ? { finalKind } : {}),
      error: errorArtifact(error),
    })
  }
}
