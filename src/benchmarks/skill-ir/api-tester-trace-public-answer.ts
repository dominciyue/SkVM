import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { parse as parseYaml } from "yaml"
import { z } from "zod"
import { ApiTesterTaskSetSchema } from "./api-tester-contract.ts"
import { deriveApiTesterOracle } from "./api-tester-oracle.ts"
import { sha256Bytes } from "./source-fixture.ts"

export const API_TESTER_TRACE_IDENTITY = "skill-ir-api-tester-trace-public-answer-development-001"
export const API_TESTER_TRACE_SCHEMA_VERSION = "skill-ir-api-tester-trace/v1"
export const API_TESTER_PUBLIC_ANSWER_SCHEMA_VERSION = "skill-ir-api-tester-public-answer/v1"
export const API_TESTER_TRACE_DRY_RUN_REPORT_SCHEMA_VERSION = "skill-ir-api-tester-trace-public-answer-dry-run/v1"
export const API_TESTER_DEVELOPMENT_TASKS_PATH = "benchmarks/skill-ir/pilots/api-tester/development/tasks.json"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const RelativePathSchema = z.string().min(1).refine((value) => {
  return !value.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(value) && !value.split("/").includes("..")
}, "path must be repository-relative")
const HttpMethodSchema = z.enum(["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"])
const HTTP_METHODS = new Set(HttpMethodSchema.options)
const ParitySchema = z.enum(["exact", "equivalent", "missing", "extra", "invalid", "ambiguous"])

const TraceStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  kind: z.literal("operation"),
  toolName: z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/u),
  operation: z.string().min(1),
  method: z.string().regex(/^[A-Za-z]+$/u),
  path: z.string().regex(/^\/[^\s]*$/u),
  inputShapeDigest: Sha256Schema,
  outputShapeDigest: Sha256Schema,
  selectedNextStep: z.union([z.string().regex(/^\d+$/u), z.null()]),
  expectedAnswerRef: z.string().regex(/^operation:[A-Z]+:\/[^\s]*$/u),
  status: z.enum(["accepted", "rejected"]),
}).strict()

export const ApiTesterTraceSchema = z.object({
  schemaVersion: z.literal(API_TESTER_TRACE_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_TRACE_IDENTITY),
  taskId: z.string().min(1),
  repetition: z.number().int().positive(),
  orderedDecisionSteps: z.array(TraceStepSchema).min(1),
}).strict()

const PublicAnswerOperationSchema = z.object({
  ref: z.string().regex(/^operation:[A-Z]+:\/[^\s]*$/u),
  method: HttpMethodSchema,
  path: z.string().regex(/^\/[^\s]*$/u),
  successStatusClasses: z.array(z.string().regex(/^[2-5]xx$/u)).min(1),
  errorStatusClasses: z.array(z.string().regex(/^[45]xx$/u)),
  securityHeaders: z.array(z.string().min(1)),
  constraintNames: z.array(z.string().min(1)),
}).strict()

export const ApiTesterPublicAnswerSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PUBLIC_ANSWER_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_TRACE_IDENTITY),
  taskId: z.string().min(1),
  source: z.object({ path: RelativePathSchema, sha256: Sha256Schema }).strict(),
  normalizationRules: z.tuple([
    z.literal("method-uppercase"),
    z.literal("path-trailing-slash"),
  ]),
  operations: z.array(PublicAnswerOperationSchema).min(1),
}).strict()

const DryRunRowDigestFields = {
  taskId: z.string().min(1),
  repetition: z.literal(1),
  sourceSha256: Sha256Schema,
  publicAnswerSha256: Sha256Schema,
  traceSha256: Sha256Schema,
} as const

export const ApiTesterTraceDryRunReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_TRACE_DRY_RUN_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_TRACE_IDENTITY),
  status: z.literal("passed"),
  rows: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("baseline-pass"),
      ...DryRunRowDigestFields,
      parity: z.literal("exact"),
      pass: z.literal(true),
    }).strict(),
    z.object({
      kind: z.literal("mutation-fail"),
      ...DryRunRowDigestFields,
      parity: z.literal("missing"),
      pass: z.literal(false),
    }).strict(),
  ])).length(4),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  authoringReview: z.object({
    authoringMinutes: z.null(),
    reviewMinutes: z.null(),
    status: z.literal("not-measured"),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  const rowsByTask = new Map<string, typeof report.rows>()
  for (const row of report.rows) {
    const rows = rowsByTask.get(row.taskId) ?? []
    rows.push(row)
    rowsByTask.set(row.taskId, rows)
  }
  if (rowsByTask.size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rows"], message: "dry-run requires exactly two tasks" })
  }
  for (const [taskId, rows] of rowsByTask) {
    const kinds = new Set(rows.map((row) => row.kind))
    const sourceDigests = new Set(rows.map((row) => row.sourceSha256))
    const answerDigests = new Set(rows.map((row) => row.publicAnswerSha256))
    if (rows.length !== 2 || kinds.size !== 2 || sourceDigests.size !== 1 || answerDigests.size !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `dry-run task ${taskId} requires one digest-consistent baseline/mutation pair`,
      })
    }
  }
})

export type ApiTesterTrace = z.infer<typeof ApiTesterTraceSchema>
export type ApiTesterPublicAnswer = z.infer<typeof ApiTesterPublicAnswerSchema>
export type ApiTesterTraceDryRunReport = z.infer<typeof ApiTesterTraceDryRunReportSchema>
export type ApiTesterTraceParity = z.infer<typeof ParitySchema>

type PublicTask = {
  id: string
  split: string
  fixtures: Record<string, string>
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function forbiddenSink(value: unknown, pathParts: string[] = []): string | undefined {
  if (typeof value === "string") {
    const field = pathParts[pathParts.length - 1]
    const isApiPath = field === "path"
      && (pathParts.includes("operations") || pathParts.includes("orderedDecisionSteps"))
    if ((/^[A-Za-z]:[\\/]/u.test(value) || /^\//u.test(value) && !isApiPath)) return pathParts.join(".") || "value"
    if (/\b(?:sk-[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{12,})\b/u.test(value)) return pathParts.join(".") || "value"
    return undefined
  }
  if (Array.isArray(value)) {
    for (const [index, nested] of value.entries()) {
      const found = forbiddenSink(nested, [...pathParts, String(index)])
      if (found) return found
    }
    return undefined
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:raw|reasoning|rationale|thought|chainOfThought|modelText|modelOutput|gold|evaluator|apiKey|secret|absolutePath|workdir|heldout|prompt)$/iu.test(key)) {
        return [...pathParts, key].join(".")
      }
      const found = forbiddenSink(nested, [...pathParts, key])
      if (found) return found
    }
  }
  return undefined
}

function normalizePath(path: string): string {
  if (!path.startsWith("/")) throw new Error(`operation path must start with /: ${path}`)
  if (path.length > 1) return path.replace(/\/+$/u, "") || "/"
  return path
}

function normalizeMethod(method: string): string {
  return method.trim().toUpperCase()
}

function operationRef(method: string, path: string): string {
  return `operation:${normalizeMethod(method)}:${normalizePath(path)}`
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`
}

function parseOperation(value: string): { method: string; path: string } | undefined {
  const match = /^([A-Za-z]+)\s+(\/[^\s]*)$/u.exec(value.trim())
  if (!match) return undefined
  return { method: normalizeMethod(match[1]!), path: normalizePath(match[2]!) }
}

function shapeOf(value: unknown): unknown {
  if (value === null) return "null"
  if (Array.isArray(value)) return [value.length === 0 ? "unknown" : shapeOf(value[0])]
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, shapeOf(nested)]))
  }
  return typeof value
}

export function shapeDigest(value: unknown): string {
  return sha256Bytes(Buffer.from(JSON.stringify(shapeOf(value)), "utf8"))
}

function openApiFixture(task: PublicTask): { path: string; text: string } {
  const entries = Object.entries(task.fixtures).filter(([path]) => /^api\/openapi\.(?:json|yaml)$/u.test(path))
  if (entries.length !== 1) throw new Error(`API Tester public answer requires exactly one OpenAPI fixture for ${task.id}`)
  return { path: entries[0]![0], text: entries[0]![1] }
}

export function buildPublicAnswerFromTask(input: unknown): ApiTesterPublicAnswer {
  if (!isRecord(input) || typeof input.id !== "string" || input.split !== "development" || !isRecord(input.fixtures)) {
    throw new Error("API Tester public answer accepts only development task declarations")
  }
  const task = input as unknown as PublicTask
  const fixture = openApiFixture(task)
  const document = fixture.path.endsWith(".json") ? JSON.parse(fixture.text) : parseYaml(fixture.text)
  const oracle = deriveApiTesterOracle(document)
  if (oracle.status !== "confirmed") throw new Error(`public OpenAPI is not sufficient: ${oracle.reason}`)

  const answer = ApiTesterPublicAnswerSchema.parse({
    schemaVersion: API_TESTER_PUBLIC_ANSWER_SCHEMA_VERSION,
    identity: API_TESTER_TRACE_IDENTITY,
    taskId: task.id,
    source: { path: fixture.path, sha256: sha256Bytes(Buffer.from(fixture.text, "utf8")) },
    normalizationRules: ["method-uppercase", "path-trailing-slash"],
    operations: oracle.operations.map((operation) => ({
      ref: operationRef(operation.method, operation.path),
      method: normalizeMethod(operation.method),
      path: normalizePath(operation.path),
      successStatusClasses: [...new Set(operation.successStatuses.map(statusClass))],
      errorStatusClasses: [...new Set(operation.errorStatuses.map(statusClass))],
      securityHeaders: [...operation.securityHeaders],
      constraintNames: operation.constraints.map((constraint) => `${constraint.location}:${constraint.name}`),
    })),
  })
  const sink = forbiddenSink(answer)
  if (sink) throw new Error(`public answer contains forbidden sink at ${sink}`)
  return answer
}

export function createTraceForPublicAnswer(input: unknown, repetition: number): ApiTesterTrace {
  const answer = ApiTesterPublicAnswerSchema.parse(input)
  const trace = ApiTesterTraceSchema.parse({
    schemaVersion: API_TESTER_TRACE_SCHEMA_VERSION,
    identity: API_TESTER_TRACE_IDENTITY,
    taskId: answer.taskId,
    repetition,
    orderedDecisionSteps: answer.operations.map((operation, stepIndex) => ({
      stepIndex,
      kind: "operation",
      toolName: "http-client",
      operation: `${operation.method} ${operation.path}`,
      method: operation.method,
      path: operation.path,
      inputShapeDigest: shapeDigest({ method: operation.method, path: operation.path, request: "structured" }),
      outputShapeDigest: shapeDigest({ statusClasses: operation.successStatusClasses, response: "structured" }),
      selectedNextStep: stepIndex + 1 < answer.operations.length ? String(stepIndex + 1) : null,
      expectedAnswerRef: operation.ref,
      status: "accepted",
    })),
  })
  const sink = forbiddenSink(trace)
  if (sink) throw new Error(`trace contains forbidden sink at ${sink}`)
  return trace
}

type TraceComparison = {
  parity: ApiTesterTraceParity
  pass: boolean
  issues: string[]
}

export function compareTraceToPublicAnswer(traceInput: unknown, answerInput: unknown): TraceComparison {
  try {
    const answer = ApiTesterPublicAnswerSchema.parse(answerInput)
    if (forbiddenSink(answerInput)) return { parity: "invalid", pass: false, issues: ["forbidden-public-answer-sink"] }
    if (forbiddenSink(traceInput)) return { parity: "invalid", pass: false, issues: ["forbidden-trace-sink"] }
    const trace = ApiTesterTraceSchema.parse(traceInput)
    if (trace.identity !== answer.identity || trace.taskId !== answer.taskId) {
      return { parity: "invalid", pass: false, issues: ["identity-mismatch"] }
    }

    const normalized = [] as Array<{ method: string; path: string; rawMethod: string; rawPath: string; operation: string }>
    for (const [index, step] of trace.orderedDecisionSteps.entries()) {
      if (step.stepIndex !== index || step.status !== "accepted") return { parity: "invalid", pass: false, issues: ["step-order-or-status"] }
      const parsed = parseOperation(step.operation)
      const normalizedMethod = normalizeMethod(step.method)
      if (!HTTP_METHODS.has(normalizedMethod as z.infer<typeof HttpMethodSchema>)
        || !parsed || parsed.method !== normalizedMethod || parsed.path !== normalizePath(step.path)) {
        return { parity: "invalid", pass: false, issues: ["operation-field-mismatch"] }
      }
      const expectedNext = index + 1 < trace.orderedDecisionSteps.length ? String(index + 1) : null
      if (step.selectedNextStep !== expectedNext) return { parity: "invalid", pass: false, issues: ["next-step-mismatch"] }
      const ref = operationRef(parsed.method, parsed.path)
      if (step.expectedAnswerRef !== ref) return { parity: "invalid", pass: false, issues: ["answer-ref-mismatch"] }
      normalized.push({ method: parsed.method, path: parsed.path, rawMethod: step.method, rawPath: step.path, operation: step.operation })
    }

    const expected = answer.operations.map((operation) => ({ method: operation.method, path: operation.path }))
    const seen = new Set<string>()
    for (const operation of normalized) {
      const key = operationRef(operation.method, operation.path)
      if (seen.has(key)) return { parity: "ambiguous", pass: false, issues: ["duplicate-operation"] }
      seen.add(key)
    }
    const expectedRefs = new Set(answer.operations.map((operation) => operation.ref))
    const actualRefs = normalized.map((operation) => operationRef(operation.method, operation.path))
    const extras = actualRefs.filter((ref) => !expectedRefs.has(ref))
    if (extras.length > 0) return { parity: "extra", pass: false, issues: ["undocumented-operation"] }
    const missing = answer.operations.filter((operation) => !seen.has(operation.ref))
    if (missing.length > 0) return { parity: "missing", pass: false, issues: ["missing-operation"] }
    if (actualRefs.some((ref, index) => ref !== answer.operations[index]!.ref)) {
      return { parity: "ambiguous", pass: false, issues: ["operation-order-mismatch"] }
    }
    const exact = normalized.every((operation, index) => {
      const expectedOperation = answer.operations[index]!
      return operation.rawMethod === expectedOperation.method
        && operation.rawPath === expectedOperation.path
        && operation.operation === `${expectedOperation.method} ${expectedOperation.path}`
    })
    return exact
      ? { parity: "exact", pass: true, issues: [] }
      : { parity: "equivalent", pass: true, issues: ["normalized-method-or-path"] }
  } catch {
    return { parity: "invalid", pass: false, issues: ["trace-or-answer-schema"] }
  }
}

async function ensureEmptyDirectory(directory: string): Promise<string> {
  const absolute = resolve(directory)
  await mkdir(absolute, { recursive: true })
  if ((await readdir(absolute)).length > 0) throw new Error(`dry-run output directory must be empty: ${absolute}`)
  return absolute
}

function contained(rootDir: string, pathValue: string): string {
  const root = resolve(rootDir)
  const target = resolve(root, pathValue)
  const fromRoot = relative(root, target)
  if (fromRoot === ".." || fromRoot.startsWith("..\\") || fromRoot.startsWith("../")) {
    throw new Error(`path escapes root: ${pathValue}`)
  }
  return target
}

export async function runApiTesterTracePublicAnswerDryRun(options: {
  rootDir: string
  outDir: string
}): Promise<ApiTesterTraceDryRunReport> {
  const rootDir = resolve(options.rootDir)
  const outDir = await ensureEmptyDirectory(options.outDir)
  const taskSet = ApiTesterTaskSetSchema.parse(JSON.parse(await readFile(
    contained(rootDir, API_TESTER_DEVELOPMENT_TASKS_PATH),
    "utf8",
  )))
  const rows: ApiTesterTraceDryRunReport["rows"] = []
  await mkdir(resolve(outDir, "public-answers"), { recursive: true })
  await mkdir(resolve(outDir, "traces"), { recursive: true })

  for (const task of taskSet.tasks) {
    const answer = buildPublicAnswerFromTask(task)
    const baseline = createTraceForPublicAnswer(answer, 1)
    const mutation = structuredClone(baseline)
    mutation.orderedDecisionSteps.shift()
    mutation.orderedDecisionSteps.forEach((step, stepIndex) => {
      step.stepIndex = stepIndex
      step.selectedNextStep = stepIndex + 1 < mutation.orderedDecisionSteps.length
        ? String(stepIndex + 1)
        : null
    })
    const answerText = jsonText(answer)
    const baselineText = jsonText(baseline)
    const mutationText = jsonText(mutation)
    const baselineComparison = compareTraceToPublicAnswer(baseline, answer)
    if (baselineComparison.parity !== "exact" || !baselineComparison.pass) {
      throw new Error(`baseline trace parity failed for ${task.id}: ${baselineComparison.parity}`)
    }
    const mutationComparison = compareTraceToPublicAnswer(mutation, answer)
    if (mutationComparison.parity !== "missing" || mutationComparison.pass) {
      throw new Error(`mutation trace parity failed for ${task.id}: ${mutationComparison.parity}`)
    }
    const answerPath = resolve(outDir, "public-answers", `${task.id}.json`)
    const baselinePath = resolve(outDir, "traces", `${task.id}-baseline.json`)
    const mutationPath = resolve(outDir, "traces", `${task.id}-mutation.json`)
    await writeFile(answerPath, answerText, "utf8")
    await writeFile(baselinePath, baselineText, "utf8")
    await writeFile(mutationPath, mutationText, "utf8")
    const sourceSha256 = answer.source.sha256
    const publicAnswerSha256 = sha256Bytes(Buffer.from(answerText, "utf8"))
    rows.push({
      kind: "baseline-pass",
      taskId: task.id,
      repetition: 1,
      parity: "exact",
      pass: true,
      sourceSha256,
      publicAnswerSha256,
      traceSha256: sha256Bytes(Buffer.from(baselineText, "utf8")),
    })
    rows.push({
      kind: "mutation-fail",
      taskId: task.id,
      repetition: 1,
      parity: "missing",
      pass: false,
      sourceSha256,
      publicAnswerSha256,
      traceSha256: sha256Bytes(Buffer.from(mutationText, "utf8")),
    })
  }

  const report = ApiTesterTraceDryRunReportSchema.parse({
    schemaVersion: API_TESTER_TRACE_DRY_RUN_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_TRACE_IDENTITY,
    status: "passed",
    rows,
    accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
    authoringReview: { authoringMinutes: null, reviewMinutes: null, status: "not-measured" },
    claimBoundary: "This zero-activity dry-run proves only that a public OpenAPI-derived answer can be normalized, compared, and mutation-checked on the two development fixtures. It is not a model run, quality result, cross-model claim, held-out result, or readiness evidence.",
  })
  await writeFile(resolve(outDir, "dry-run-report.json"), jsonText(report), "utf8")
  return report
}
