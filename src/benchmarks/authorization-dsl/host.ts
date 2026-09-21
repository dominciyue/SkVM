import { extractStructured } from "../../providers/structured.ts"
import type { LLMProvider } from "../../providers/types.ts"
import type { ZodType } from "zod"
import {
  measureAuthorizationPromptCharacters,
  renderAuthorizationTask,
  type AuthorizationPromptCharacterBreakdown,
  type AuthorizationRenderArm,
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
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask, type CompiledAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  AuthorizationWireResultV1Schema,
  AuthorizationWireResultV2Schema,
  normalizeAuthorizationWireResult,
  normalizeAuthorizationWireResultV2,
  type AuthorizationWireNormalization,
  type AuthorizationWireNormalizationV2,
  type AuthorizationWireResultV1,
  type AuthorizationWireResultV2,
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
])

type AuthorizationWireResult = AuthorizationWireResultV1 | AuthorizationWireResultV2
type AuthorizationWireNormalizationResult = AuthorizationWireNormalization | AuthorizationWireNormalizationV2

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
  renderedPrompt: string
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
  task: AuthorizationTaskV0
  sourceBundle: SourceBundle
  analysisRequirements?: AnalysisRequirement[]
  provider: LLMProvider
  arm: AuthorizationRenderArm
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
): boolean {
  return [...validation.diagnostics, ...(coverageValidation?.diagnostics ?? [])]
    .some(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
}

function buildRepairPrompt(
  rendered: RenderedAuthorizationTask,
  sourceContext: string,
  initial: AuthorizationTransportArtifact,
  validation?: AuthorizationValidation,
  coverageValidation?: CoverageValidation,
): { prompt: string; characters: AuthorizationRepairPromptCharacterBreakdown } {
  const actionable = [
    ...initial.normalization.diagnostics,
    ...(validation?.diagnostics ?? []),
    ...(coverageValidation?.diagnostics ?? []),
  ]
    .filter(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
    .map(diagnostic => ({ code: diagnostic.code, path: diagnostic.path ?? "coverage", message: diagnostic.message }))
  const sections = {
    instructions: "# Authorization wire repair\n\nThe current structured answer did not satisfy deterministic host checks. Revise only that answer from the same declaration and exact source. Do not add unavailable facts or infer a requested conclusion.",
    declaration: `## Canonical declaration\n${rendered.sections.declaration}`,
    outputContract: `## Result contract\n${rendered.sections.outputContract}`,
    source: `## Fixed source context\n${sourceContext}`,
    currentAnswer: `## Current wire answer\n${JSON.stringify(initial.wireResult, null, 2)}`,
    diagnostics: `## Deterministic host diagnostics\n${JSON.stringify(actionable, null, 2)}`,
  }
  const prompt = [
    sections.instructions,
    sections.declaration,
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
  const rendered = renderAuthorizationTask(compiled, input.arm, analysisPlan)
  const sourceContext = renderSourceBundle(input.sourceBundle)
  const renderedPrompt = rendered.prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext)
  const promptCharacters: AuthorizationRunPromptCharacters = {
    initial: measureAuthorizationPromptCharacters(rendered, sourceContext),
  }
  const telemetry = createTelemetryProvider(input.provider, {
    perCallTimeoutMs: input.options.timeoutMs,
    unitTimeoutMs: input.options.unitTimeoutMs ?? 600_000,
    maxDispatches: input.options.maxProviderDispatches ?? 4,
    ...(input.onLifecycleEvent ? { onEvent: input.onLifecycleEvent } : {}),
  })

  const finish = async (
    partial: Omit<AuthorizationTaskRun, "attempts" | "events" | "telemetry" | "promptCharacters">,
  ): Promise<AuthorizationTaskRun> => {
    await telemetry.close(`host-return:${partial.status}`)
    return {
      ...partial,
      ...(analysisPlan ? { analysisPlan } : {}),
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

  const wireSchema = (analysisPlan
    ? AuthorizationWireResultV2Schema
    : AuthorizationWireResultV1Schema) as ZodType<AuthorizationWireResult>
  const normalizeWire = (wireInput: unknown): AuthorizationWireNormalizationResult => analysisPlan
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
    if (analysisPlan) {
      if (transport.normalization.normalizerVersion !== "authorization-wire-normalizer/v2") {
        throw new Error("Analysis plan requires wire normalizer v2.")
      }
      const relationCoverage = transport.normalization.coverage ?? []
      return {
        result,
        wireResult: transport.wireResult,
        normalization: transport.normalization,
        relationCoverage,
        coverageValidation: validateRelationCoverage(analysisPlan, result, relationCoverage),
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
      || (initial !== undefined && hasActionableDiagnostics(initial.validation, initial.coverageValidation))
    if (input.options.maxDomainRepairs === 1 && repairNeeded) {
      const repairPrompt = buildRepairPrompt(
        rendered,
        sourceContext,
        initialTransport,
        initial?.validation,
        initial?.coverageValidation,
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
