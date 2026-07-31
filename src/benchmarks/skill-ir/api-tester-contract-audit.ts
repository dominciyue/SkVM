import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { z } from "zod"
import { apiTesterGrade, ApiTesterGradePayloadSchema } from "../../bench/evaluators/api-tester-grade.ts"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { ApiTesterTaskSetSchema, type ApiTesterTaskSet } from "./api-tester-contract.ts"
import {
  deriveApiTesterOracle,
  type ApiTesterConfirmedOracle,
  type ApiTesterConstraint,
} from "./api-tester-oracle.ts"
import { sha256Bytes } from "./source-fixture.ts"

const DEVELOPMENT_PATH = "benchmarks/skill-ir/pilots/api-tester/development/tasks.json"
const INTERFACE_PATH = "benchmarks/skill-ir/pilots/api-tester/public-interface.json"
const SPLIT_FREEZE_PATH = "benchmarks/skill-ir/pilots/api-tester/task-split-freeze.json"
const PROVENANCE_PATH = "benchmarks/skill-ir/pilots/api-tester/source-oracle-provenance.json"
const CONTRACT_PATH = "src/benchmarks/skill-ir/api-tester-contract.ts"
const ORACLE_PATH = "src/benchmarks/skill-ir/api-tester-oracle.ts"
const EVALUATOR_PATH = "src/bench/evaluators/api-tester-grade.ts"
const AUDIT_PATH = "src/benchmarks/skill-ir/api-tester-contract-audit.ts"
const CASE_IDS = [
  "valid-edge",
  "invalid-outside",
  "missing-operation",
  "missing-boundary",
  "missing-auth",
  "hardcoded-secret",
  "dependent-case",
  "nondeterministic-generator",
  "file-invalid",
] as const

type Task = ApiTesterTaskSet["tasks"][number]
type CaseId = (typeof CASE_IDS)[number]
type Request = Record<string, Record<string, unknown>>

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const ProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-source-oracle-provenance/v1"),
  skillId: z.literal("api-tester"),
  claims: z.array(z.object({
    claimId: z.enum(["api-discovery", "case-families", "execution-honesty", "independence-secret-timeout"]),
    path: z.string().min(1),
    sha256: Sha256Schema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    anchorSha256: Sha256Schema,
  }).strict()).length(4),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ApiTesterContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-contract-audit/v1"),
  auditId: z.literal("api-tester-development-v1"),
  status: z.enum(["passed", "failed"]),
  inputs: z.object({
    developmentTasksSha256: Sha256Schema,
    publicInterfaceSha256: Sha256Schema,
    taskSplitFreezeSha256: Sha256Schema,
    sourceProvenanceSha256: Sha256Schema,
    contractImplementationSha256: Sha256Schema,
    oracleImplementationSha256: Sha256Schema,
    evaluatorImplementationSha256: Sha256Schema,
    auditImplementationSha256: Sha256Schema,
  }).strict(),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
  }).strict(),
  cases: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
    expectedPass: z.boolean(),
    observedPass: z.boolean(),
    status: z.enum(["matched", "mismatched"]),
    criteria: z.array(z.object({
      criterionId: z.string().min(1),
      pass: z.boolean(),
      score: z.number().min(0).max(1),
      infrastructure: z.boolean(),
    }).strict()).length(5),
  }).strict()),
  reverseEvidence: z.object({
    removedConstraintDisappears: z.boolean(),
    taskIdDoesNotAffectOracle: z.boolean(),
  }).strict(),
  leakChecks: z.object({
    taskVisibleHasNoGoldKeys: z.boolean(),
    payloadCanariesRejected: z.boolean(),
    taskVisibleHasNoSourceQuote: z.boolean(),
    developmentHasNoHeldoutSentinel: z.boolean(),
    reportHasNoRawModelContent: z.boolean(),
    unsafePayloadPathRejected: z.boolean(),
  }).strict(),
  issues: z.array(z.object({ taskId: z.string(), caseId: z.enum(CASE_IDS) }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ApiTesterContractAuditReport = z.infer<typeof ApiTesterContractAuditReportSchema>

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
}

function parseOpenApi(task: Task): unknown {
  const [inputPath, text] = Object.entries(task.fixtures).find(([name]) => /openapi\.(?:json|yaml)$/u.test(name))!
  return inputPath.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
}

function setValue(request: Request, constraint: ApiTesterConstraint, value: unknown): void {
  const key = constraint.location === "header" ? "headers" : constraint.location
  request[key] ??= {}
  request[key]![constraint.name] = value
}

function deleteValue(request: Request, constraint: ApiTesterConstraint): void {
  const key = constraint.location === "header" ? "headers" : constraint.location
  delete request[key]?.[constraint.name]
}

function validValue(constraint: ApiTesterConstraint): unknown {
  if (constraint.enumValues?.length) return constraint.enumValues[0]
  if (constraint.format === "email") return "person@example.test"
  if (constraint.format === "uri") return "https://example.test/callback"
  if (constraint.type === "integer" || constraint.type === "number") return constraint.minimum ?? 1
  return "x".repeat(Math.max(1, constraint.minLength ?? 1))
}

function buildPlan(oracle: ApiTesterConfirmedOracle, strategy: "valid-edge" | "invalid-outside") {
  return {
    schemaVersion: "api-test-plan/v1",
    source: "public-openapi",
    framework: strategy === "valid-edge" ? "node:test" : "portable-runner",
    endpoints: oracle.operations.map((operation) => {
      const base: Request = {}
      for (const constraint of operation.constraints) setValue(base, constraint, validValue(constraint))
      for (const header of operation.securityHeaders) {
        base.headers ??= {}
        base.headers[header] = "${API_TEST_TOKEN}"
      }
      const success = operation.successStatuses[0]!
      const error = operation.errorStatuses[0] ?? 400
      const cases: Array<Record<string, unknown>> = [{
        id: `${operation.method}-${operation.path}-happy`, category: "happy", request: structuredClone(base),
        expectedStatus: success, assertions: ["status"], independent: true, timeoutMs: 5000,
      }]
      operation.constraints.forEach((constraint, index) => {
        const request = structuredClone(base)
        let category = "boundary"
        let expectedStatus = success
        if (constraint.required) {
          deleteValue(request, constraint)
          category = "error"
          expectedStatus = error
        } else if (strategy === "invalid-outside") {
          category = "error"
          expectedStatus = error
          if (constraint.minLength !== undefined) setValue(request, constraint, "x".repeat(Math.max(0, constraint.minLength - 1)))
          else if (constraint.maxLength !== undefined) setValue(request, constraint, "x".repeat(constraint.maxLength + 1))
          else if (constraint.minimum !== undefined) setValue(request, constraint, constraint.minimum - 1)
          else if (constraint.maximum !== undefined) setValue(request, constraint, constraint.maximum + 1)
          else if (constraint.enumValues) setValue(request, constraint, "TEST_ONLY_INVALID_ENUM")
          else if (constraint.format) setValue(request, constraint, "invalid-format")
        } else if (constraint.maxLength !== undefined) setValue(request, constraint, "x".repeat(constraint.maxLength))
        else if (constraint.maximum !== undefined) setValue(request, constraint, constraint.maximum)
        cases.push({
          id: `${operation.method}-${operation.path}-constraint-${index}`, category, request, expectedStatus,
          assertions: ["status"], independent: true, timeoutMs: 5000,
        })
      })
      if (operation.securityHeaders.length > 0) {
        const request = structuredClone(base)
        for (const header of operation.securityHeaders) delete request.headers?.[header]
        cases.push({
          id: `${operation.method}-${operation.path}-unauthorized`, category: "error", request,
          expectedStatus: operation.errorStatuses.find((entry) => entry === 401 || entry === 403) ?? error,
          assertions: ["status"], independent: true, timeoutMs: 5000,
        })
      }
      return { method: operation.method, path: operation.path, cases }
    }),
  }
}

function generatorSource(plan: unknown, nondeterministic: boolean): string {
  const value = nondeterministic ? { ...(plan as object), generatedAt: "__NOW__" } : plan
  return `import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const entries = process.argv.slice(2); const get = (name) => entries[entries.indexOf(name) + 1];
const input = get("--input"), out = get("--out"); if (!input || !out) process.exit(2);
const plan = ${JSON.stringify(value).replace('"__NOW__"', "Date.now()")};
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(plan, null, 2) + "\\n", "utf8");
`
}

function mutatePlan(plan: ReturnType<typeof buildPlan>, caseId: CaseId): void {
  if (caseId === "missing-operation") plan.endpoints.pop()
  if (caseId === "missing-boundary") {
    plan.endpoints[0]!.cases = plan.endpoints[0]!.cases.filter((entry) => entry.category === "happy")
  }
  if (caseId === "missing-auth") {
    for (const endpoint of plan.endpoints) endpoint.cases = endpoint.cases.filter((entry) => !String(entry.id).includes("unauthorized"))
  }
  if (caseId === "hardcoded-secret") {
    const request = plan.endpoints[0]!.cases[0]!.request as Request
    const header = Object.keys(request.headers ?? {})[0]
    if (header) request.headers![header] = "hardcoded-secret"
  }
  if (caseId === "dependent-case") plan.endpoints[0]!.cases[0]!.independent = false
}

function runResult(workDir: string, reference: RunResult["initialWorkdirManifest"]): RunResult {
  return {
    text: "audit", steps: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0, durationMs: 0, llmDurationMs: 0, workDir, initialWorkdirManifest: reference, runStatus: "ok",
  }
}

async function auditCase(task: Task, caseId: CaseId) {
  const oracle = deriveApiTesterOracle(parseOpenApi(task))
  if (oracle.status !== "confirmed") throw new Error(`development oracle unconfirmed: ${task.id}`)
  const plan = buildPlan(oracle, caseId === "invalid-outside" ? "invalid-outside" : "valid-edge")
  mutatePlan(plan, caseId)
  const root = await mkdtemp(path.join(tmpdir(), "skvm-api-tester-contract-"))
  const workDir = path.join(root, "workdir")
  try {
    await mkdir(workDir, { recursive: true })
    for (const [relativePath, text] of Object.entries(task.fixtures)) {
      await mkdir(path.dirname(path.join(workDir, ...relativePath.split("/"))), { recursive: true })
      await writeFile(path.join(workDir, ...relativePath.split("/")), text, "utf8")
    }
    const reference = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(root, "initial-workdir-manifest.json"),
    })
    await mkdir(path.join(workDir, "generated"))
    await writeFile(path.join(workDir, "api-test-generator.mjs"), generatorSource(plan, caseId === "nondeterministic-generator"), "utf8")
    await writeFile(path.join(workDir, "generated/api-test-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8")
    const caseCount = plan.endpoints.reduce((total, endpoint) => total + endpoint.cases.length, 0)
    await writeFile(path.join(workDir, "api-test-report.json"), `${JSON.stringify({
      schemaVersion: "api-test-report/v1", discoverySource: "public-openapi", generatedCaseCount: caseCount,
      verification: { status: "passed", command: ["node", "api-test-generator.mjs"] }, limitations: [],
    }, null, 2)}\n`, "utf8")
    if (caseId === "file-invalid") {
      const inputPath = Object.keys(task.fixtures).find((entry) => /openapi\.(?:json|yaml)$/u.test(entry))!
      await writeFile(path.join(workDir, ...inputPath.split("/")), "openapi: 3.0.3\npaths: {}\n", "utf8")
      await writeFile(path.join(workDir, "debug.log"), "unexpected\n", "utf8")
    }
    const criteria = []
    for (const rawCriterion of task.eval) {
      const criterion = EvalCriterionSchema.parse(rawCriterion)
      if (criterion.method !== "custom") throw new Error("API tester criterion must be custom")
      const result = await apiTesterGrade.run({ criterion, runResult: runResult(workDir, reference) })
      criteria.push({
        criterionId: rawCriterion.id,
        pass: result.pass,
        score: result.score,
        infrastructure: result.infraError !== undefined,
      })
    }
    const observedPass = criteria.every((entry) => entry.pass && !entry.infrastructure)
    const expectedPass = caseId === "valid-edge" || caseId === "invalid-outside"
    return {
      taskId: task.id, caseId, expectedPass, observedPass,
      status: observedPass === expectedPass ? "matched" as const : "mismatched" as const,
      criteria,
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) =>
      /^(?:expected|expectedAnswer|gold|goldAnswer|answer|oracle|sourceQuote)$/iu.test(key) || hasForbiddenKey(nested))
  }
  return false
}

async function validateProvenance(rootDir: string, value: unknown): Promise<void> {
  const provenance = ProvenanceSchema.parse(value)
  for (const claim of provenance.claims) {
    const bytes = await readFile(path.join(rootDir, ...claim.path.split("/")))
    if (sha256Bytes(bytes) !== claim.sha256) throw new Error(`source digest mismatch: ${claim.claimId}`)
    const lines = bytes.toString("utf8").replace(/\r\n/g, "\n").split("\n")
    const anchor = `${lines.slice(claim.startLine - 1, claim.endLine).join("\n")}\n`
    if (sha256Bytes(Buffer.from(anchor, "utf8")) !== claim.anchorSha256) {
      throw new Error(`source anchor mismatch: ${claim.claimId}`)
    }
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

export async function buildApiTesterContractAudit(input: {
  rootDir: string
}): Promise<ApiTesterContractAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const read = (relativePath: string) => readFile(path.join(rootDir, ...relativePath.split("/")))
  const [developmentBytes, interfaceBytes, splitFreezeBytes, provenanceBytes, contractBytes, oracleBytes, evaluatorBytes, auditBytes] = await Promise.all([
    read(DEVELOPMENT_PATH), read(INTERFACE_PATH), read(SPLIT_FREEZE_PATH), read(PROVENANCE_PATH),
    read(CONTRACT_PATH), read(ORACLE_PATH), read(EVALUATOR_PATH), read(AUDIT_PATH),
  ])
  const taskSet = ApiTesterTaskSetSchema.parse(parseJson(developmentBytes))
  await validateProvenance(rootDir, parseJson(provenanceBytes))
  const cases = []
  for (const task of taskSet.tasks) for (const caseId of CASE_IDS) cases.push(await auditCase(task, caseId))

  const firstDocument = parseOpenApi(taskSet.tasks[0]) as Record<string, unknown>
  const before = deriveApiTesterOracle(firstDocument)
  const removed = structuredClone(firstDocument) as {
    paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { properties: Record<string, Record<string, unknown>> } }> } } }>
  }
  delete removed.paths["/users"]!.post.requestBody.content["application/json"]!.schema.properties.name!.minLength
  const after = deriveApiTesterOracle(removed)
  const tagged = deriveApiTesterOracle({ ...firstDocument, taskId: "TEST_ONLY_DIFFERENT_TASK" })
  const beforeCount = before.status === "confirmed" ? before.operations.flatMap((entry) => entry.constraints).length : -1
  const afterCount = after.status === "confirmed" ? after.operations.flatMap((entry) => entry.constraints).length : -1

  const exemplarPayload = taskSet.tasks[0].eval[0]!.payload
  const payloadCanariesRejected = ["gold", "rawModel", "sourceQuote", "heldout"].every((key) =>
    !ApiTesterGradePayloadSchema.safeParse({ ...exemplarPayload, [key]: "TEST_ONLY_CANARY" }).success)
  const escapingPayload: unknown = {
    ...exemplarPayload,
    paths: { ...exemplarPayload.paths, generator: "../outside.mjs" },
  }
  const leakChecks = {
    taskVisibleHasNoGoldKeys: !hasForbiddenKey(taskSet),
    payloadCanariesRejected,
    taskVisibleHasNoSourceQuote: !developmentBytes.toString("utf8").includes("sourceQuote"),
    developmentHasNoHeldoutSentinel: !developmentBytes.toString("utf8").includes("TEST_ONLY_HELDOUT_API_TESTER"),
    reportHasNoRawModelContent: cases.every((entry) => !JSON.stringify(entry).includes("rawModel")),
    unsafePayloadPathRejected: !ApiTesterGradePayloadSchema.safeParse(escapingPayload).success,
  }
  const reverseEvidence = {
    removedConstraintDisappears: beforeCount > 0 && afterCount === beforeCount - 1,
    taskIdDoesNotAffectOracle: before.status === "confirmed" && tagged.status === "confirmed"
      && JSON.stringify(before.operations) === JSON.stringify(tagged.operations),
  }
  const issues = cases.filter((entry) => entry.status === "mismatched")
    .map((entry) => ({ taskId: entry.taskId, caseId: entry.caseId }))
  const allChecks = [...Object.values(leakChecks), ...Object.values(reverseEvidence)].every(Boolean)
  return ApiTesterContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-api-tester-contract-audit/v1",
    auditId: "api-tester-development-v1",
    status: issues.length === 0 && allChecks ? "passed" : "failed",
    inputs: {
      developmentTasksSha256: sha256(developmentBytes), publicInterfaceSha256: sha256(interfaceBytes),
      taskSplitFreezeSha256: sha256(splitFreezeBytes), sourceProvenanceSha256: sha256(provenanceBytes),
      contractImplementationSha256: sha256(contractBytes), oracleImplementationSha256: sha256(oracleBytes),
      evaluatorImplementationSha256: sha256(evaluatorBytes), auditImplementationSha256: sha256(auditBytes),
    },
    counts: { tasks: taskSet.tasks.length, cases: cases.length, matched: cases.length - issues.length },
    cases, reverseEvidence, leakChecks, issues,
    claimBoundary: "Development-only deterministic benchmark audit; no model, held-out, IR, or optimization claim.",
  })
}
