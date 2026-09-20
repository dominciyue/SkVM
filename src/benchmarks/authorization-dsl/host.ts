import { extractStructured } from "../../providers/structured.ts"
import type { LLMProvider } from "../../providers/types.ts"
import { renderAuthorizationTask, type AuthorizationRenderArm } from "../../task-dsl/authorization/render.ts"
import { validateAuthorizationResult, type AuthorizationValidation } from "../../task-dsl/authorization/result.ts"
import { AuthorizationResultV0Schema, type AuthorizationResultV0, type AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask, type CompiledAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import { renderSourceBundle, type SourceBundle } from "./inputs.ts"
import {
  createTelemetryProvider,
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
  "citation-out-of-range",
  "citation-text-mismatch",
  "missing-fact-group",
  "uninformative-unknown",
  "unsupported-completeness",
])

export interface RunAuthorizationTaskOptions {
  timeoutMs: number
  maxTokens: number
  maxDomainRepairs: 0 | 1
}

export interface AuthorizationGenerationArtifact {
  result: AuthorizationResultV0
  rawResponse: string
  providerAttemptIds: string[]
  outputAttemptId: string
  validation: AuthorizationValidation
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
  renderedPrompt: string
  initial?: AuthorizationGenerationArtifact
  repair?: AuthorizationGenerationArtifact
  finalKind?: "initial" | "repair"
  attempts: AuthorizationProviderAttempt[]
  telemetry: AuthorizationTelemetrySummary
  error?: { name: string; message: string }
}

export interface RunAuthorizationTaskInput {
  task: AuthorizationTaskV0
  sourceBundle: SourceBundle
  provider: LLMProvider
  arm: AuthorizationRenderArm
  options: RunAuthorizationTaskOptions
}

class AuthorizationTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Authorization provider call did not settle within ${timeoutMs}ms; request completion is unknown.`)
    this.name = "AuthorizationTimeoutError"
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AuthorizationTimeoutError(timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function snapshotAttempts(attempts: AuthorizationProviderAttempt[]): AuthorizationProviderAttempt[] {
  return structuredClone(attempts)
}

function errorArtifact(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  }
}

function hasActionableDiagnostics(validation: AuthorizationValidation): boolean {
  return validation.diagnostics.some(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
}

function buildRepairPrompt(
  modelVisiblePrompt: string,
  initial: AuthorizationGenerationArtifact,
): string {
  const actionable = initial.validation.diagnostics
    .filter(diagnostic => ACTIONABLE_DIAGNOSTICS.has(diagnostic.code))
    .map(diagnostic => ({ code: diagnostic.code, path: diagnostic.path, message: diagnostic.message }))
  return `${modelVisiblePrompt}

The first structured answer did not satisfy deterministic host checks. Revise only the answer using the same visible task and source context. Do not add facts not present in that context.

Initial answer:
${JSON.stringify(initial.result, null, 2)}

Deterministic diagnostics:
${JSON.stringify(actionable, null, 2)}`
}

export async function runAuthorizationTask(input: RunAuthorizationTaskInput): Promise<AuthorizationTaskRun> {
  if (input.options.maxDomainRepairs !== 0 && input.options.maxDomainRepairs !== 1) {
    throw new Error("maxDomainRepairs must be 0 or 1")
  }
  const compiled = compileAuthorizationTask(input.task)
  const rendered = renderAuthorizationTask(compiled, input.arm)
  const sourceContext = renderSourceBundle(input.sourceBundle)
  const renderedPrompt = rendered.prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext)
  const telemetry = createTelemetryProvider(input.provider)

  const finish = (partial: Omit<AuthorizationTaskRun, "attempts" | "telemetry">): AuthorizationTaskRun => ({
    ...partial,
    attempts: snapshotAttempts(telemetry.attempts),
    telemetry: telemetry.summary(),
  })

  if (compiled.runnableObligations.length === 0) {
    return finish({ status: "needs-input", arm: input.arm, compiled, renderedPrompt })
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

  const extract = async (phase: "initial" | "domain-repair", prompt: string) => {
    const firstAttemptIndex = telemetry.attempts.length
    const extracted = await telemetry.inPhase(
      phase,
      provider => withTimeout(extractStructured({
        provider,
        schema: AuthorizationResultV0Schema,
        schemaName: RESULT_TOOL_NAME,
        schemaDescription: "Return the bounded authorization assessment result. This schema tool is an output container and is never executed.",
        prompt,
        system: "Analyze only the supplied fixed source context. Do not execute tools, contact a target, infer unavailable deployment facts, or claim repository-wide discovery.",
        maxRetries: 1,
        maxTokens: input.options.maxTokens,
      }), input.options.timeoutMs),
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

  try {
    const extractedInitial = await extract("initial", renderedPrompt)
    const initial: AuthorizationGenerationArtifact = {
      result: extractedInitial.result,
      rawResponse: extractedInitial.rawResponse,
      providerAttemptIds: extractedInitial.providerAttemptIds,
      outputAttemptId: extractedInitial.outputAttemptId,
      validation: validateAuthorizationResult(compiled, extractedInitial.result, input.sourceBundle),
    }
    let repair: AuthorizationGenerationArtifact | undefined
    let finalKind: "initial" | "repair" = "initial"

    if (input.options.maxDomainRepairs === 1 && hasActionableDiagnostics(initial.validation)) {
      const extractedRepair = await extract("domain-repair", buildRepairPrompt(renderedPrompt, initial))
      repair = {
        result: extractedRepair.result,
        rawResponse: extractedRepair.rawResponse,
        providerAttemptIds: extractedRepair.providerAttemptIds,
        outputAttemptId: extractedRepair.outputAttemptId,
        validation: validateAuthorizationResult(compiled, extractedRepair.result, input.sourceBundle),
      }
      finalKind = "repair"
    }

    const finalValidation = repair?.validation ?? initial.validation
    return finish({
      status: finalValidation.diagnostics.length === 0 ? "completed" : "completed-with-diagnostics",
      arm: input.arm,
      compiled,
      renderedPrompt,
      initial,
      ...(repair ? { repair } : {}),
      finalKind,
    })
  } catch (error) {
    return finish({
      status: error instanceof AuthorizationTimeoutError ? "timeout-unknown" : "transport-failed",
      arm: input.arm,
      compiled,
      renderedPrompt,
      error: errorArtifact(error),
    })
  }
}
