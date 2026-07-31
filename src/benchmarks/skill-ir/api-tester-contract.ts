import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"

const SKILL_ID = "api-tester"
const EVALUATOR_ID = "skill-ir-api-tester"
const INTERFACE_ID = "api-tester-generator-interface-v1"
const UPSTREAM_COMMIT = "1e221579b0504082d25d5548b194399a7785f10f"
const UPSTREAM_SKILL_SHA256 = "fdc81d971835c9585af9be44df9bf1ed4310029489009ddf6ace2705395b7be9"
const UPSTREAM_LICENSE_SHA256 = "494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2"
const SKILL_SHA256 = "b3447ad9e341154e65d8872d5a2ae046a740979897e1921d0bdc23b70c12060a"
const LICENSE_SHA256 = "0137c0bf5ebe749bb97f8af36adbae05ed9bd19cc1f01ff30553173adb0544f7"
const NonEmptyStringSchema = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const API_TESTER_DEVELOPMENT_TASK_IDS = [
  "api-tester-openapi-users-dev-001",
  "api-tester-openapi-inventory-dev-002",
] as const

export const API_TESTER_HELDOUT_TASK_IDS = [
  "api-tester-openapi-billing-heldout-001",
  "api-tester-openapi-webhooks-heldout-002",
] as const

const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-interface/v1"),
  interfaceId: z.literal(INTERFACE_ID),
  protectedInputs: z.tuple([
    z.literal("<task-openapi-path>"),
    z.literal("api-test-interface.json"),
  ]),
  outputs: z.tuple([
    z.literal("api-test-generator.mjs"),
    z.literal("generated/api-test-plan.json"),
    z.literal("api-test-report.json"),
  ]),
  generator: z.object({
    path: z.literal("api-test-generator.mjs"),
    command: z.tuple([
      z.literal("node"),
      z.literal("api-test-generator.mjs"),
      z.literal("--input"),
      z.literal("<relative-openapi-path>"),
      z.literal("--out"),
      z.literal("<relative-plan-path>"),
    ]),
    exitCode: z.literal(0),
    deterministic: z.literal(true),
  }).strict(),
  plan: z.object({
    requiredFields: z.tuple([
      z.literal("schemaVersion"),
      z.literal("source"),
      z.literal("framework"),
      z.literal("endpoints"),
    ]),
    endpointFields: z.tuple([
      z.literal("method"),
      z.literal("path"),
      z.literal("cases"),
    ]),
    caseFields: z.tuple([
      z.literal("id"),
      z.literal("category"),
      z.literal("request"),
      z.literal("expectedStatus"),
      z.literal("assertions"),
      z.literal("independent"),
      z.literal("timeoutMs"),
    ]),
    categoryValues: z.tuple([
      z.literal("happy"),
      z.literal("boundary"),
      z.literal("error"),
    ]),
    allowAdditionalFields: z.literal(true),
    allowAnyCaseOrder: z.literal(true),
  }).strict(),
  report: z.object({
    requiredFields: z.tuple([
      z.literal("schemaVersion"),
      z.literal("discoverySource"),
      z.literal("generatedCaseCount"),
      z.literal("verification"),
      z.literal("limitations"),
    ]),
    verificationStatus: z.tuple([
      z.literal("passed"),
      z.literal("failed"),
      z.literal("not-run"),
    ]),
  }).strict(),
  resourcePolicy: z.object({
    network: z.literal(false),
    packageInstall: z.literal(false),
    allowedRuntime: z.literal("node"),
    availablePackages: z.tuple([z.literal("yaml")]),
  }).strict(),
  outputPolicy: z.object({
    exactOutputSet: z.literal(true),
    freeTextLanguage: z.literal("any"),
  }).strict(),
}).strict()

export type ApiTesterPublicInterface = z.infer<typeof PublicInterfaceSchema>

const EvalPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-eval/v1"),
  check: z.enum([
    "generator-integrity",
    "operation-coverage",
    "schema-derived-cases",
    "security-response",
    "independence-verification",
  ]),
  paths: z.object({
    openapi: NonEmptyStringSchema,
    interface: z.literal("api-test-interface.json"),
    generator: z.literal("api-test-generator.mjs"),
    plan: z.literal("generated/api-test-plan.json"),
    report: z.literal("api-test-report.json"),
  }).strict(),
  protectedSha256: z.object({
    openapi: Sha256Schema,
    interface: Sha256Schema,
  }).strict(),
}).strict()

const TaskSchema = z.object({
  id: NonEmptyStringSchema,
  split: z.enum(["development", "heldout"]),
  prompt: NonEmptyStringSchema,
  fixtures: z.record(z.string(), z.string().min(1)),
  successCriteria: z.array(z.string()).length(0),
  eval: z.array(z.object({
    method: z.literal("custom"),
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    weight: z.number().positive(),
    evaluatorId: z.literal(EVALUATOR_ID),
    payload: EvalPayloadSchema,
  }).strict()).length(5),
  hardGateIds: z.array(NonEmptyStringSchema).length(5),
  passThreshold: z.literal(1),
}).strict()

export const ApiTesterTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal(SKILL_ID),
  tasks: z.tuple([TaskSchema, TaskSchema]),
}).strict()

export type ApiTesterTaskSet = z.infer<typeof ApiTesterTaskSetSchema>

const EVALUATORS = [
  ["api-generator-integrity", "Protected inputs and deterministic generator execution", 0.15, "generator-integrity"],
  ["api-operation-coverage", "Every documented operation is represented", 0.15, "operation-coverage"],
  ["api-schema-derived-cases", "Cases reflect documented valid, boundary, and invalid inputs", 0.3, "schema-derived-cases"],
  ["api-security-response", "Security and response assertions follow the public API definition", 0.2, "security-response"],
  ["api-independence-verification", "Cases are independent and verification claims are grounded", 0.2, "independence-verification"],
] as const

const TASK_PROMPT_PREFIX = [
  "Read the protected API definition and api-test-interface.json without modifying either input.",
  "Implement api-test-generator.mjs using the public offline CLI contract.",
  "Run it for the given API definition to create generated/api-test-plan.json.",
  "Create api-test-report.json and report verification truthfully.",
  "Produce exactly the three declared outputs; do not install packages, contact a server, or use the network.",
].join(" ")

type TaskFixture = {
  id: string
  split: "development" | "heldout"
  inputPath: "api/openapi.yaml" | "api/openapi.json"
  openapiText: string
}

const DEVELOPMENT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: API_TESTER_DEVELOPMENT_TASK_IDS[0],
    split: "development",
    inputPath: "api/openapi.yaml",
    openapiText: `openapi: 3.0.3
info:
  title: User API
  version: 1.0.0
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /users:
    post:
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name:
                  type: string
                  minLength: 3
                  maxLength: 40
                email:
                  type: string
                  format: email
                role:
                  type: string
                  enum: [reader, editor]
      responses:
        "201": { description: Created }
        "400": { description: Invalid JSON }
        "401": { description: Unauthorized }
        "422": { description: Validation error }
  /users/{userId}:
    get:
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: userId
          required: true
          schema: { type: string, minLength: 1 }
      responses:
        "200": { description: User }
        "401": { description: Unauthorized }
        "404": { description: Not found }
`,
  },
  {
    id: API_TESTER_DEVELOPMENT_TASK_IDS[1],
    split: "development",
    inputPath: "api/openapi.json",
    openapiText: `${JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Inventory API", version: "1.0.0" },
      components: {
        securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
      },
      paths: {
        "/inventory": {
          get: {
            security: [{ apiKey: [] }],
            parameters: [
              { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } },
              { in: "query", name: "status", schema: { type: "string", enum: ["in-stock", "reserved"] } },
            ],
            responses: { "200": { description: "Items" }, "400": { description: "Bad query" }, "401": { description: "Unauthorized" } },
          },
          post: {
            security: [{ apiKey: [] }],
            requestBody: {
              required: true,
              content: { "application/json": { schema: {
                type: "object",
                required: ["sku", "quantity"],
                properties: {
                  sku: { type: "string", minLength: 4, maxLength: 24 },
                  quantity: { type: "integer", minimum: 1, maximum: 500 },
                },
              } } },
            },
            responses: { "201": { description: "Created" }, "400": { description: "Invalid item" }, "401": { description: "Unauthorized" }, "409": { description: "Duplicate SKU" } },
          },
        },
      },
    })}\n`,
  },
]

const HELDOUT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: API_TESTER_HELDOUT_TASK_IDS[0],
    split: "heldout",
    inputPath: "api/openapi.json",
    openapiText: `${JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Billing API", version: "1.0.0" },
      paths: {
        "/invoices/{invoiceId}": {
          get: {
            parameters: [{ in: "path", name: "invoiceId", required: true, schema: { type: "string", minLength: 8, maxLength: 32 } }],
            responses: { "200": { description: "Invoice" }, "404": { description: "Not found" } },
          },
        },
        "/invoices": {
          post: {
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: { type: "number", minimum: 0.01, maximum: 100000 } } } } } },
            responses: { "201": { description: "Created" }, "422": { description: "Invalid amount" } },
          },
        },
      },
    })}\n`,
  },
  {
    id: API_TESTER_HELDOUT_TASK_IDS[1],
    split: "heldout",
    inputPath: "api/openapi.yaml",
    openapiText: `openapi: 3.0.3
info:
  title: Webhook API
  version: 1.0.0
components:
  securitySchemes:
    signature:
      type: apiKey
      in: header
      name: X-Signature
paths:
  /webhooks:
    post:
      security:
        - signature: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [event, callbackUrl]
              properties:
                event: { type: string, enum: [created, deleted] }
                callbackUrl: { type: string, format: uri }
      responses:
        "202": { description: Accepted }
        "401": { description: Invalid signature }
        "422": { description: Invalid payload }
`,
  },
]

function parsePublicInterface(bytes: Uint8Array): { value: ApiTesterPublicInterface; text: string } {
  const text = Buffer.from(bytes).toString("utf8")
  return { value: PublicInterfaceSchema.parse(JSON.parse(text)), text }
}

function buildTask(fixture: TaskFixture, interfaceText: string): ApiTesterTaskSet["tasks"][number] {
  const fixtures = {
    [fixture.inputPath]: fixture.openapiText,
    "api-test-interface.json": interfaceText,
  }
  const paths = {
    openapi: fixture.inputPath,
    interface: "api-test-interface.json" as const,
    generator: "api-test-generator.mjs" as const,
    plan: "generated/api-test-plan.json" as const,
    report: "api-test-report.json" as const,
  }
  const protectedSha256 = {
    openapi: sha256Bytes(Buffer.from(fixture.openapiText, "utf8")),
    interface: sha256Bytes(Buffer.from(interfaceText, "utf8")),
  }
  return TaskSchema.parse({
    id: fixture.id,
    split: fixture.split,
    prompt: `${TASK_PROMPT_PREFIX} Input path: ${fixture.inputPath}.`,
    fixtures,
    successCriteria: [],
    eval: EVALUATORS.map(([id, name, weight, check]) => ({
      method: "custom" as const,
      id,
      name,
      weight,
      evaluatorId: EVALUATOR_ID,
      payload: {
        schemaVersion: "skill-ir-api-tester-eval/v1" as const,
        check,
        paths,
        protectedSha256,
      },
    })),
    hardGateIds: EVALUATORS.map(([id]) => id),
    passThreshold: 1,
  })
}

export function buildApiTesterTaskSet(
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ApiTesterTaskSet {
  const { text: interfaceText } = parsePublicInterface(publicInterfaceBytes)
  const fixtures = split === "development" ? DEVELOPMENT_FIXTURES : HELDOUT_FIXTURES
  return ApiTesterTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: SKILL_ID,
    tasks: [buildTask(fixtures[0], interfaceText), buildTask(fixtures[1], interfaceText)],
  })
}

function findForbiddenEvidence(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (const [index, nested] of value.entries()) {
      const found = findForbiddenEvidence(nested, [...pathParts, String(index)])
      if (found) return found
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:expected|expectedAnswer|gold|goldAnswer|answer|oracle|sourceQuote)$/iu.test(key)) {
        return [...pathParts, key].join(".")
      }
      const found = findForbiddenEvidence(nested, [...pathParts, key])
      if (found) return found
    }
  }
  return null
}

function containsText(value: unknown, pattern: RegExp): boolean {
  if (typeof value === "string") return pattern.test(value)
  if (Array.isArray(value)) return value.some((nested) => containsText(nested, pattern))
  if (value && typeof value === "object") return Object.values(value).some((nested) => containsText(nested, pattern))
  return false
}

export function validateApiTesterTaskSet(
  input: unknown,
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ApiTesterTaskSet {
  const forbidden = findForbiddenEvidence(input)
  if (forbidden) throw new Error(`API-tester task contains forbidden evidence at ${forbidden}`)
  if (split === "development" && containsText(input, /TEST_ONLY_HELDOUT_API_TESTER/u)) {
    throw new Error("API-tester development task contains held-out evidence")
  }
  if (containsText(
    input,
    /install dependencies from the network|network access is allowed|you may contact a server|npm install|bun add/iu,
  )) {
    throw new Error("API-tester task grants forbidden execution permission")
  }
  const parsed = ApiTesterTaskSetSchema.parse(input)
  if (parsed.tasks.some((task) => task.split !== split)) {
    throw new Error(`API-tester task split mismatch: expected ${split}`)
  }
  const expected = buildApiTesterTaskSet(split, publicInterfaceBytes)
  if (!isDeepStrictEqual(parsed, expected)) {
    throw new Error("API-tester task set differs from the preregistered construction")
  }
  return parsed
}

export async function validateApiTesterSourceClosure(rootDir: string): Promise<{
  commit: string
  upstreamSkillSha256: string
  upstreamLicenseSha256: string
  skillSha256: string
  licenseSha256: string
  normalization: "crlf-to-lf"
}> {
  const skillPath = path.join(rootDir, "benchmarks/skill-ir/pilots/api-tester/source/SKILL.md")
  const licensePath = path.join(rootDir, "benchmarks/skill-ir/pilots/api-tester/source/LICENSE.upstream")
  const skillSha256 = sha256Bytes(await readFile(skillPath))
  const licenseSha256 = sha256Bytes(await readFile(licensePath))
  if (skillSha256 !== SKILL_SHA256) throw new Error("API-tester source digest mismatch")
  if (licenseSha256 !== LICENSE_SHA256) throw new Error("API-tester license digest mismatch")
  return {
    commit: UPSTREAM_COMMIT,
    upstreamSkillSha256: UPSTREAM_SKILL_SHA256,
    upstreamLicenseSha256: UPSTREAM_LICENSE_SHA256,
    skillSha256,
    licenseSha256,
    normalization: "crlf-to-lf",
  }
}

const FrozenPathSchema = z.object({
  path: NonEmptyStringSchema,
  sha256: Sha256Schema,
}).strict()

export const ApiTesterTaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-task-split-freeze/v1"),
  skillId: z.literal(SKILL_ID),
  wave: z.literal("B"),
  frozenDate: z.literal("2026-07-31"),
  source: FrozenPathSchema.extend({
    upstreamCommit: z.literal(UPSTREAM_COMMIT),
    upstreamPath: z.literal("skills/api-tester/SKILL.md"),
    upstreamSha256: z.literal(UPSTREAM_SKILL_SHA256),
    normalization: z.literal("crlf-to-lf"),
  }).strict(),
  license: FrozenPathSchema.extend({
    license: z.literal("MIT"),
    upstreamSha256: z.literal(UPSTREAM_LICENSE_SHA256),
    normalization: z.literal("crlf-to-lf"),
  }).strict(),
  publicInterface: FrozenPathSchema,
  development: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(API_TESTER_DEVELOPMENT_TASK_IDS[0]),
      z.literal(API_TESTER_DEVELOPMENT_TASK_IDS[1]),
    ]),
  }).strict(),
  heldout: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(API_TESTER_HELDOUT_TASK_IDS[0]),
      z.literal(API_TESTER_HELDOUT_TASK_IDS[1]),
    ]),
  }).strict(),
  isolation: z.object({
    scorerImplementedAfterFreeze: z.literal(true),
    developmentMayReadHeldoutContent: z.literal(false),
    heldoutMayEnterCalibration: z.literal(false),
    waveBMayModifyWaveA: z.literal(false),
  }).strict(),
}).strict()

export type ApiTesterTaskSplitFreeze = z.infer<typeof ApiTesterTaskSplitFreezeSchema>

async function verifyFrozenPath(rootDir: string, record: { path: string; sha256: string }): Promise<void> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, record.path)
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Frozen path escapes repository root: ${record.path}`)
  }
  if (sha256Bytes(await readFile(absolute)) !== record.sha256) {
    throw new Error(`Frozen path digest mismatch for ${record.path}`)
  }
}

export async function validateApiTesterTaskSplitFreeze(input: {
  rootDir: string
  freeze: unknown
}): Promise<ApiTesterTaskSplitFreeze> {
  const freeze = ApiTesterTaskSplitFreezeSchema.parse(input.freeze)
  await Promise.all([
    verifyFrozenPath(input.rootDir, freeze.source),
    verifyFrozenPath(input.rootDir, freeze.license),
    verifyFrozenPath(input.rootDir, freeze.publicInterface),
    verifyFrozenPath(input.rootDir, freeze.development),
    verifyFrozenPath(input.rootDir, freeze.heldout),
  ])
  return freeze
}
