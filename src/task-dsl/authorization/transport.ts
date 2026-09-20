import { z } from "zod"
import {
  buildAuthorizationSourceCatalog,
  resolveAuthorizationSourceCitation,
  type AuthorizationSourceCatalog,
  type SourceBundle,
} from "../../benchmarks/authorization-dsl/inputs.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"
import type { AuthorizationResultV0 } from "./schema.ts"

const NonEmptyString = z.string().trim().min(1)

export const AuthorizationWireCitationV1Schema = z.object({
  sourceId: NonEmptyString,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict()

const AuthorizationWireFactV1Schema = z.object({
  statement: NonEmptyString,
  citations: z.array(AuthorizationWireCitationV1Schema).min(1),
}).strict()

const AuthorizationWireFactGroupsV1Schema = z.object({
  entry: z.array(AuthorizationWireFactV1Schema),
  binding: z.array(AuthorizationWireFactV1Schema),
  control: z.array(AuthorizationWireFactV1Schema),
  effect: z.array(AuthorizationWireFactV1Schema),
  condition: z.array(AuthorizationWireFactV1Schema),
}).strict()

const AuthorizationWireObligationResultV1Schema = z.object({
  obligationId: NonEmptyString,
  conclusion: z.enum(["source_supported_failure", "source_refuted", "unknown"]),
  explanation: NonEmptyString,
  facts: AuthorizationWireFactGroupsV1Schema,
  decisiveMissingFacts: z.array(NonEmptyString).optional().default([]),
  suggestedObservations: z.array(NonEmptyString).optional().default([]),
}).strict()

export const AuthorizationWireResultV1Schema = z.object({
  schemaVersion: z.literal("source-authorization-assessment-wire/v1"),
  results: z.array(AuthorizationWireObligationResultV1Schema),
  scopeClaim: z.object({
    kind: z.enum(["declared-obligations-only", "repository-all-entries"]),
    statement: NonEmptyString,
  }).strict(),
}).strict()

export type AuthorizationWireResultV1 = z.infer<typeof AuthorizationWireResultV1Schema>

export interface AuthorizationTransportDiagnostic {
  code: string
  message: string
  path: string
  severity: "error"
}

export interface AuthorizationWireNormalization {
  normalizerVersion: "authorization-wire-normalizer/v1"
  canonicalResultVersion: "source-authorization-assessment-result/v0"
  status: "valid" | "invalid"
  diagnostics: AuthorizationTransportDiagnostic[]
  wireResult?: AuthorizationWireResultV1
  sourceCatalog?: AuthorizationSourceCatalog
  result?: AuthorizationResultV0
}

function transportDiagnostic(code: string, message: string, path: string): AuthorizationTransportDiagnostic {
  return { code, message, path, severity: "error" }
}

function formatPath(path: Array<string | number>): string {
  return path.length === 0 ? "$" : path.join(".")
}

export function normalizeAuthorizationWireResult(input: {
  compiled: CompiledAuthorizationTask
  sourceBundle: SourceBundle
  input: unknown
}): AuthorizationWireNormalization {
  const base = {
    normalizerVersion: "authorization-wire-normalizer/v1" as const,
    canonicalResultVersion: "source-authorization-assessment-result/v0" as const,
  }
  const parsed = AuthorizationWireResultV1Schema.safeParse(input.input)
  if (!parsed.success) {
    return {
      ...base,
      status: "invalid",
      diagnostics: parsed.error.issues.map(issue => transportDiagnostic(
        "wire-schema-invalid",
        issue.message,
        formatPath(issue.path),
      )),
    }
  }

  const diagnostics: AuthorizationTransportDiagnostic[] = []
  if (input.sourceBundle.repository !== input.compiled.task.repository) {
    diagnostics.push(transportDiagnostic(
      "repository-mismatch",
      "Declaration and exact source bundle must identify the same repository.",
      "repository",
    ))
  }
  if (input.sourceBundle.sourceRef !== input.compiled.task.sourceRef) {
    diagnostics.push(transportDiagnostic(
      "source-ref-mismatch",
      "Declaration and exact source bundle must identify the same source ref.",
      "sourceRef",
    ))
  }
  if (input.sourceBundle.sourceMode !== input.compiled.task.sourceMode) {
    diagnostics.push(transportDiagnostic(
      "source-mode-mismatch",
      "Declaration and exact source bundle must use the same source mode.",
      "sourceMode",
    ))
  }

  const built = buildAuthorizationSourceCatalog(input.sourceBundle)
  if (!built.success) {
    diagnostics.push(...built.diagnostics.map(item => transportDiagnostic(item.code, item.message, item.path)))
    return {
      ...base,
      status: "invalid",
      wireResult: parsed.data,
      diagnostics,
    }
  }

  const wireResult = parsed.data
  const expectedIds = new Set(input.compiled.runnableObligations.map(obligation => obligation.id))
  const resultCounts = new Map<string, number>()
  wireResult.results.forEach((result, index) => {
    const nextCount = (resultCounts.get(result.obligationId) ?? 0) + 1
    resultCounts.set(result.obligationId, nextCount)
    if (!expectedIds.has(result.obligationId)) {
      diagnostics.push(transportDiagnostic(
        "foreign-obligation-result",
        `Wire result names undeclared or non-runnable obligation ${result.obligationId}.`,
        `results.${index}.obligationId`,
      ))
    }
    if (nextCount > 1) {
      diagnostics.push(transportDiagnostic(
        "duplicate-obligation-result",
        `Wire result repeats obligation ${result.obligationId}.`,
        `results.${index}.obligationId`,
      ))
    }
    if (
      result.conclusion === "unknown"
      && (result.decisiveMissingFacts.length === 0 || result.suggestedObservations.length === 0)
    ) {
      diagnostics.push(transportDiagnostic(
        "uninformative-unknown",
        "Unknown requires a decisive missing fact and a minimum suggested observation.",
        `results.${index}`,
      ))
    }
  })
  for (const obligationId of expectedIds) {
    if ((resultCounts.get(obligationId) ?? 0) === 0) {
      diagnostics.push(transportDiagnostic(
        "missing-obligation-result",
        `Wire result is missing runnable obligation ${obligationId}.`,
        "results",
      ))
    }
  }

  const canonicalResults: AuthorizationResultV0["results"] = wireResult.results.map((result, resultIndex) => ({
    obligationId: result.obligationId,
    conclusion: result.conclusion,
    explanation: result.explanation,
    facts: Object.fromEntries(Object.entries(result.facts).map(([groupName, facts]) => [
      groupName,
      facts.map((fact, factIndex) => ({
        statement: fact.statement,
        citations: fact.citations.flatMap((reference, citationIndex) => {
          const resolved = resolveAuthorizationSourceCitation(built.catalog, reference)
          if (!resolved.success) {
            diagnostics.push(...resolved.diagnostics.map(item => transportDiagnostic(
              item.code,
              item.message,
              `results.${resultIndex}.facts.${groupName}.${factIndex}.citations.${citationIndex}.${item.path}`,
            )))
            return []
          }
          if (resolved.citation.quote.length === 0) {
            diagnostics.push(transportDiagnostic(
              "empty-citation-quote",
              "A cited source range must contain retained text.",
              `results.${resultIndex}.facts.${groupName}.${factIndex}.citations.${citationIndex}`,
            ))
            return []
          }
          return [resolved.citation]
        }),
      })),
    ])) as AuthorizationResultV0["results"][number]["facts"],
    decisiveMissingFacts: result.decisiveMissingFacts,
    suggestedObservations: result.suggestedObservations,
  }))

  const canonicalResult: AuthorizationResultV0 | undefined = diagnostics.length > 0
    ? undefined
    : {
      schemaVersion: "source-authorization-assessment-result/v0",
      taskId: input.compiled.task.taskId,
      repository: input.compiled.task.repository,
      sourceRef: input.compiled.task.sourceRef,
      results: canonicalResults,
      scopeClaim: { ...wireResult.scopeClaim },
    }

  return {
    ...base,
    status: diagnostics.length === 0 ? "valid" : "invalid",
    diagnostics,
    wireResult,
    sourceCatalog: built.catalog,
    ...(canonicalResult ? { result: canonicalResult } : {}),
  }
}
