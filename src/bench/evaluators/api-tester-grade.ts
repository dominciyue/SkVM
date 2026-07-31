import { createHash } from "node:crypto"
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { z } from "zod"
import {
  assessApiTesterPlan,
  deriveApiTesterOracle,
  type ApiTesterPlanAssessment,
} from "../../benchmarks/skill-ir/api-tester-oracle.ts"
import { runSubprocess } from "../../core/subprocess.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ApiTesterGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-eval/v1"),
  check: z.enum([
    "generator-integrity",
    "operation-coverage",
    "schema-derived-cases",
    "security-response",
    "independence-verification",
  ]),
  paths: z.object({
    openapi: SafeRelativePathSchema,
    interface: SafeRelativePathSchema,
    generator: SafeRelativePathSchema,
    plan: SafeRelativePathSchema,
    report: SafeRelativePathSchema,
  }).strict(),
  protectedSha256: z.object({
    openapi: Sha256Schema,
    interface: Sha256Schema,
  }).strict(),
}).strict()

type Payload = z.infer<typeof ApiTesterGradePayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

interface EvaluatedState {
  assessment?: ApiTesterPlanAssessment
  artifactContract: boolean
  protectedInputs: boolean
  reproducible: boolean
  reportGrounded: boolean
  failure?: string
}

class UnsafeFilesystemPathError extends Error {}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<Buffer | undefined> {
  let current = root
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment)
    if (!isContained(root, current)) throw new UnsafeFilesystemPathError()
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) throw new UnsafeFilesystemPathError()
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) throw error
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }
  const resolved = await realpath(current)
  if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
  if (!(await lstat(resolved)).isFile()) return undefined
  return readFile(resolved)
}

function parseJson(bytes: Uint8Array | undefined): unknown | undefined {
  if (!bytes) return undefined
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

function parseOpenApi(bytes: Uint8Array | undefined, relativePath: string): unknown | undefined {
  if (!bytes) return undefined
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return relativePath.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function reportIsGrounded(report: unknown, plan: unknown): boolean {
  if (!isRecord(report) || !isRecord(plan) || !Array.isArray(plan.endpoints)) return false
  const count = plan.endpoints.reduce((total, endpoint) => {
    return total + (isRecord(endpoint) && Array.isArray(endpoint.cases) ? endpoint.cases.length : 0)
  }, 0)
  const verification = report.verification
  return typeof report.schemaVersion === "string"
    && typeof report.discoverySource === "string"
    && Number.isInteger(report.generatedCaseCount)
    && report.generatedCaseCount === count
    && Array.isArray(report.limitations)
    && report.limitations.every((entry) => typeof entry === "string")
    && isRecord(verification)
    && verification.status === "passed"
    && (verification.command === undefined || (
      Array.isArray(verification.command)
      && verification.command.every((entry) => typeof entry === "string")
    ))
}

function generatorSourceIsAllowed(source: string): boolean {
  const forbidden = [
    /\bfetch\s*\(/u,
    /\bXMLHttpRequest\b/u,
    /\bWebSocket\b/u,
    /(?:from\s+|import\s*\(|require\s*\()["'](?:node:)?https?["']/u,
    /(?:from\s+|import\s*\(|require\s*\()["'](?:node:)?(?:child_process|cluster|worker_threads)["']/u,
    /\bBun\.(?:spawn|spawnSync)\b/u,
    /\b(?:npm|pnpm|yarn|bun)\s+(?:add|install|i)\b/u,
  ]
  return forbidden.every((pattern) => !pattern.test(source))
}

function minimalChildEnvironment(): Record<string, string | undefined> {
  const overlay: Record<string, string | undefined> = {}
  for (const key of Object.keys(process.env)) overlay[key] = undefined
  for (const key of ["PATH", "Path", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"]) {
    if (process.env[key]) overlay[key] = process.env[key]
  }
  overlay.NO_PROXY = "*"
  overlay.no_proxy = "*"
  return overlay
}

async function reproduceGenerator(
  payload: Payload,
  inputBytes: Buffer,
  interfaceBytes: Buffer,
  generatorBytes: Buffer,
  submittedPlan: Buffer,
): Promise<{ ok: boolean; reason?: string }> {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(generatorBytes)
  if (!generatorSourceIsAllowed(source)) return { ok: false, reason: "generator violates offline resource policy" }

  const repositoryRoot = path.resolve(import.meta.dir, "../../..")
  const sandbox = await mkdtemp(path.join(repositoryRoot, ".skvm-api-tester-grade-"))
  try {
    for (const relativePath of [payload.paths.openapi, payload.paths.interface, payload.paths.generator]) {
      await mkdir(path.dirname(path.join(sandbox, relativePath)), { recursive: true })
    }
    await Promise.all([
      copyFile(path.join(repositoryRoot, "package.json"), path.join(sandbox, "package.json")),
      Bun.write(path.join(sandbox, payload.paths.openapi), inputBytes),
      Bun.write(path.join(sandbox, payload.paths.interface), interfaceBytes),
      Bun.write(path.join(sandbox, payload.paths.generator), generatorBytes),
    ])
    await mkdir(path.join(sandbox, "generated"), { recursive: true })
    const outputs = ["generated/replay-a.json", "generated/replay-b.json"]
    for (const output of outputs) {
      const result = await runSubprocess([
        process.env.SKVM_NODE_BINARY ?? "node",
        payload.paths.generator,
        "--input",
        payload.paths.openapi,
        "--out",
        output,
      ], { cwd: sandbox, timeoutMs: 10_000, env: minimalChildEnvironment() })
      if (result.timedOut) return { ok: false, reason: "generator replay timed out" }
      if (result.exitCode !== 0) return { ok: false, reason: "generator replay failed" }
    }
    const [first, second] = await Promise.all([
      readFile(path.join(sandbox, outputs[0]!)),
      readFile(path.join(sandbox, outputs[1]!)),
    ])
    if (!first.equals(second)) return { ok: false, reason: "generator output is nondeterministic" }
    if (!first.equals(submittedPlan)) return { ok: false, reason: "submitted plan is not generator output" }
    return { ok: true }
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}

async function evaluateState(
  root: string,
  payload: Payload,
  manifestReference: NonNullable<Parameters<typeof readInitialWorkdirManifest>[0]["reference"]>,
): Promise<EvaluatedState> {
  const initial = await readInitialWorkdirManifest({ workDir: root, reference: manifestReference })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: ["generated"],
    requiredNewFiles: [payload.paths.generator, payload.paths.plan, payload.paths.report],
  })
  const artifactContract = delta.status === "pass"
  const [openapiBytes, interfaceBytes, generatorBytes, planBytes, reportBytes] = await Promise.all([
    readSafeFile(root, payload.paths.openapi),
    readSafeFile(root, payload.paths.interface),
    readSafeFile(root, payload.paths.generator),
    readSafeFile(root, payload.paths.plan),
    readSafeFile(root, payload.paths.report),
  ])
  const protectedInputs = Boolean(openapiBytes && interfaceBytes
    && sha256(openapiBytes) === payload.protectedSha256.openapi
    && sha256(interfaceBytes) === payload.protectedSha256.interface)
  if (!artifactContract || !protectedInputs || !generatorBytes || !planBytes || !reportBytes || !openapiBytes || !interfaceBytes) {
    return { artifactContract, protectedInputs, reproducible: false, reportGrounded: false }
  }

  const plan = parseJson(planBytes)
  const report = parseJson(reportBytes)
  const oracle = deriveApiTesterOracle(parseOpenApi(openapiBytes, payload.paths.openapi))
  if (oracle.status !== "confirmed") {
    return {
      artifactContract,
      protectedInputs,
      reproducible: false,
      reportGrounded: false,
      failure: "public OpenAPI cannot produce a confirmed oracle",
    }
  }
  const replay = await reproduceGenerator(payload, openapiBytes, interfaceBytes, generatorBytes, planBytes)
  return {
    assessment: assessApiTesterPlan(oracle, plan),
    artifactContract,
    protectedInputs,
    reproducible: replay.ok,
    reportGrounded: reportIsGrounded(report, plan),
    ...(replay.reason ? { failure: replay.reason } : {}),
  }
}

export const apiTesterGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    ApiTesterGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const parsed = ApiTesterGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid API tester evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    if (!runResult.initialWorkdirManifest) {
      return infrastructure("Run result does not include initial workdir provenance")
    }
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      const state = await evaluateState(root, parsed.data, runResult.initialWorkdirManifest)
      if (parsed.data.check === "generator-integrity") {
        return state.artifactContract && state.protectedInputs && state.reproducible
          ? passing("Protected inputs, exact outputs, and deterministic generator replay pass")
          : failing(state.failure ?? "Generator integrity or exact output contract failed")
      }
      if (!state.assessment) return failing(state.failure ?? "Semantic plan is missing or invalid")
      if (parsed.data.check === "operation-coverage") {
        return state.assessment.artifactShape && state.assessment.operationCoverage
          ? passing("Every public OpenAPI operation is represented")
          : failing("Plan does not cover the public operation set")
      }
      if (parsed.data.check === "schema-derived-cases") {
        return state.assessment.schemaDerivedCases
          ? passing("Cases contain public-schema-derived valid and invalid witnesses")
          : failing("Cases do not witness every public schema constraint")
      }
      if (parsed.data.check === "security-response") {
        return state.assessment.securityResponse
          ? passing("Security headers and documented response expectations are grounded")
          : failing("Security or response evidence is inconsistent")
      }
      return state.assessment.independenceVerification && state.reportGrounded
        ? passing("Cases are independent and the verification report matches replayable artifacts")
        : failing("Case independence or verification reporting is ungrounded")
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe filesystem path in API tester workdir")
      }
      return infrastructure(
        `API tester evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  },
}

registerCustomEvaluator("skill-ir-api-tester", apiTesterGrade)
