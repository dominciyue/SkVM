import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"

const SKILL_ID = "zh-code-reviewer"
const EVALUATOR_ID = "skill-ir-zh-code-reviewer"
const INTERFACE_ID = "zh-code-reviewer-evidence-interface-v1"
const UPSTREAM_COMMIT = "1e221579b0504082d25d5548b194399a7785f10f"
const UPSTREAM_SKILL_SHA256 = "bd4c5dc751189b073173e7715e9c8cfca62662cf9a2847f346f708c33328bdfe"
const UPSTREAM_LICENSE_SHA256 = "494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2"
const SKILL_SHA256 = "b7ec773f213d78067607554fb9f5ca3c9265b57b6e80ec6daa334c94ef00aa40"
const LICENSE_SHA256 = "0137c0bf5ebe749bb97f8af36adbae05ed9bd19cc1f01ff30553173adb0544f7"
const NonEmptyStringSchema = z.string().trim().min(1)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS = [
  "zh-code-reviewer-user-service-dev-001",
  "zh-code-reviewer-report-service-dev-002",
] as const

export const ZH_CODE_REVIEWER_HELDOUT_TASK_IDS = [
  "zh-code-reviewer-webhook-heldout-001",
  "zh-code-reviewer-cache-heldout-002",
] as const

const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-interface/v1"),
  interfaceId: z.literal(INTERFACE_ID),
  protectedInputs: z.tuple([z.literal("<task-source-path>"), z.literal("review-interface.json")]),
  outputs: z.tuple([z.literal("code-review.json"), z.literal("code-review.md")]),
  finding: z.object({
    requiredFields: z.tuple([
      z.literal("category"), z.literal("severity"), z.literal("path"), z.literal("line"),
      z.literal("symbol"), z.literal("impact"), z.literal("recommendation"),
    ]),
    categoryValues: z.tuple([
      z.literal("correctness"), z.literal("security"), z.literal("performance"), z.literal("maintainability"),
    ]),
    lineMeaning: NonEmptyStringSchema,
    symbolMeaning: NonEmptyStringSchema,
    allowAdditionalFields: z.literal(true),
    allowAnyFindingOrder: z.literal(true),
    allowAdditionalGroundedFindings: z.literal(true),
  }).strict(),
  severity: z.object({
    values: z.tuple([z.literal("critical"), z.literal("major"), z.literal("minor")]),
    critical: NonEmptyStringSchema,
    major: NonEmptyStringSchema,
    minor: NonEmptyStringSchema,
  }).strict(),
  jsonReport: z.object({
    requiredFields: z.tuple([
      z.literal("schemaVersion"), z.literal("reviewedFiles"), z.literal("findings"),
      z.literal("highlights"), z.literal("summary"),
    ]),
    schemaVersion: z.literal("code-review/v1"),
  }).strict(),
  markdownReport: z.object({
    language: z.literal("zh-CN"),
    mustReferenceEveryFindingLocation: z.literal(true),
    exactWordingRequired: z.literal(false),
  }).strict(),
  resourcePolicy: z.object({
    network: z.literal(false), packageInstall: z.literal(false), allowedRuntime: z.literal("node"),
  }).strict(),
  outputPolicy: z.object({ exactOutputSet: z.literal(true), protectedInputsMutable: z.literal(false) }).strict(),
}).strict()

export type ZhCodeReviewerPublicInterface = z.infer<typeof PublicInterfaceSchema>

const EvalPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-eval/v1"),
  check: z.enum([
    "artifact-integrity",
    "evidence-coverage",
    "severity-calibration",
    "actionability",
    "report-consistency",
  ]),
  paths: z.object({
    source: NonEmptyStringSchema,
    interface: z.literal("review-interface.json"),
    jsonReport: z.literal("code-review.json"),
    markdownReport: z.literal("code-review.md"),
  }).strict(),
  protectedSha256: z.object({ source: Sha256Schema, interface: Sha256Schema }).strict(),
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

export const ZhCodeReviewerTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal(SKILL_ID),
  tasks: z.tuple([TaskSchema, TaskSchema]),
}).strict()

export type ZhCodeReviewerTaskSet = z.infer<typeof ZhCodeReviewerTaskSetSchema>

const EVALUATORS = [
  ["review-artifact-integrity", "Protected source and exact output contract", 0.15, "artifact-integrity"],
  ["review-evidence-coverage", "Source-grounded high-impact finding coverage", 0.3, "evidence-coverage"],
  ["review-severity-calibration", "Severity follows the public impact definitions", 0.2, "severity-calibration"],
  ["review-actionability", "Every confirmed finding has an actionable recommendation", 0.15, "actionability"],
  ["review-report-consistency", "Chinese Markdown and JSON reports agree", 0.2, "report-consistency"],
] as const

const TASK_PROMPT_PREFIX = [
  "Review the protected source file using review-interface.json without modifying either input.",
  "Write code-review.json and a structured Chinese code-review.md.",
  "Ground each finding at the primary observable source line and smallest enclosing symbol.",
  "Apply the public severity meanings and make each recommendation actionable.",
  "Produce exactly the two declared outputs; do not install packages or use the network.",
].join(" ")

type TaskFixture = {
  id: string
  split: "development" | "heldout"
  sourcePath: string
  sourceText: string
}

const DEVELOPMENT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[0],
    split: "development",
    sourcePath: "src/user-service.ts",
    sourceText: `export async function findUser(db, email, authToken) {
  const query = \`SELECT id, email FROM users WHERE email = '${"${email}"}'\`
  console.log("auth token", authToken)
  return db.query(query)
}
`,
  },
  {
    id: ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[1],
    split: "development",
    sourcePath: "src/report-service.js",
    sourceText: `export async function buildReports(ids, client) {
  const reports = []
  for (const id of ids) {
    reports.push(await client.fetchReport(id))
  }
  return reports[0].title
}
`,
  },
]

const HELDOUT_FIXTURES: readonly [TaskFixture, TaskFixture] = [
  {
    id: ZH_CODE_REVIEWER_HELDOUT_TASK_IDS[0],
    split: "heldout",
    sourcePath: "src/webhook.ts",
    sourceText: `import { exec } from "node:child_process"

export function deliverHook(url, payload, apiKey) {
  console.info("webhook api key", apiKey)
  exec(\`curl -X POST -d '${"${payload}"}' ${"${url}"}\`)
}
`,
  },
  {
    id: ZH_CODE_REVIEWER_HELDOUT_TASK_IDS[1],
    split: "heldout",
    sourcePath: "src/cache.js",
    sourceText: `export async function warmCache(keys, store) {
  const values = []
  for (const key of keys) {
    values.push(await store.get(key))
  }
  const selected = values.find((value) => value.active)
  return selected.value
}
`,
  },
]

function parsePublicInterface(bytes: Uint8Array): { value: ZhCodeReviewerPublicInterface; text: string } {
  const text = Buffer.from(bytes).toString("utf8")
  return { value: PublicInterfaceSchema.parse(JSON.parse(text)), text }
}

function buildTask(fixture: TaskFixture, interfaceText: string): ZhCodeReviewerTaskSet["tasks"][number] {
  const fixtures = { [fixture.sourcePath]: fixture.sourceText, "review-interface.json": interfaceText }
  const paths = {
    source: fixture.sourcePath,
    interface: "review-interface.json" as const,
    jsonReport: "code-review.json" as const,
    markdownReport: "code-review.md" as const,
  }
  const protectedSha256 = {
    source: sha256Bytes(Buffer.from(fixture.sourceText, "utf8")),
    interface: sha256Bytes(Buffer.from(interfaceText, "utf8")),
  }
  return TaskSchema.parse({
    id: fixture.id,
    split: fixture.split,
    prompt: `${TASK_PROMPT_PREFIX} Source path: ${fixture.sourcePath}.`,
    fixtures,
    successCriteria: [],
    eval: EVALUATORS.map(([id, name, weight, check]) => ({
      method: "custom" as const,
      id,
      name,
      weight,
      evaluatorId: EVALUATOR_ID,
      payload: { schemaVersion: "skill-ir-zh-code-reviewer-eval/v1" as const, check, paths, protectedSha256 },
    })),
    hardGateIds: EVALUATORS.map(([id]) => id),
    passThreshold: 1,
  })
}

export function buildZhCodeReviewerTaskSet(
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ZhCodeReviewerTaskSet {
  const { text } = parsePublicInterface(publicInterfaceBytes)
  const fixtures = split === "development" ? DEVELOPMENT_FIXTURES : HELDOUT_FIXTURES
  return ZhCodeReviewerTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: SKILL_ID,
    tasks: [buildTask(fixtures[0], text), buildTask(fixtures[1], text)],
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

export function validateZhCodeReviewerTaskSet(
  input: unknown,
  split: "development" | "heldout",
  publicInterfaceBytes: Uint8Array,
): ZhCodeReviewerTaskSet {
  const forbidden = findForbiddenEvidence(input)
  if (forbidden) throw new Error(`zh-code-reviewer task contains forbidden evidence at ${forbidden}`)
  if (split === "development" && containsText(input, /TEST_ONLY_HELDOUT_ZH_CODE_REVIEWER/u)) {
    throw new Error("zh-code-reviewer development task contains held-out evidence")
  }
  if (containsText(input, /install dependencies from the network|network access is allowed|npm install|bun add/iu)) {
    throw new Error("zh-code-reviewer task grants forbidden execution permission")
  }
  const parsed = ZhCodeReviewerTaskSetSchema.parse(input)
  if (parsed.tasks.some((task) => task.split !== split)) throw new Error(`task split mismatch: expected ${split}`)
  const expected = buildZhCodeReviewerTaskSet(split, publicInterfaceBytes)
  if (!isDeepStrictEqual(parsed, expected)) throw new Error("zh-code-reviewer task set differs from preregistered construction")
  return parsed
}

export async function validateZhCodeReviewerSourceClosure(rootDir: string): Promise<{
  commit: string
  upstreamSkillSha256: string
  upstreamLicenseSha256: string
  skillSha256: string
  licenseSha256: string
  normalization: "crlf-to-lf"
}> {
  const sourceRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-code-reviewer/source")
  const skillSha256 = sha256Bytes(await readFile(path.join(sourceRoot, "SKILL.md")))
  const licenseSha256 = sha256Bytes(await readFile(path.join(sourceRoot, "LICENSE.upstream")))
  if (skillSha256 !== SKILL_SHA256) throw new Error("zh-code-reviewer source digest mismatch")
  if (licenseSha256 !== LICENSE_SHA256) throw new Error("zh-code-reviewer license digest mismatch")
  return {
    commit: UPSTREAM_COMMIT,
    upstreamSkillSha256: UPSTREAM_SKILL_SHA256,
    upstreamLicenseSha256: UPSTREAM_LICENSE_SHA256,
    skillSha256,
    licenseSha256,
    normalization: "crlf-to-lf",
  }
}

const FrozenPathSchema = z.object({ path: NonEmptyStringSchema, sha256: Sha256Schema }).strict()

export const ZhCodeReviewerTaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-task-split-freeze/v1"),
  skillId: z.literal(SKILL_ID),
  role: z.literal("method-development"),
  frozenDate: z.literal("2026-08-02"),
  source: FrozenPathSchema.extend({
    upstreamCommit: z.literal(UPSTREAM_COMMIT),
    upstreamPath: z.literal("skills/zh-code-reviewer/SKILL.md"),
    upstreamSha256: z.literal(UPSTREAM_SKILL_SHA256),
    normalization: z.literal("crlf-to-lf"),
  }).strict(),
  license: FrozenPathSchema.extend({
    license: z.literal("MIT"),
    upstreamSha256: z.literal(UPSTREAM_LICENSE_SHA256),
    normalization: z.literal("crlf-to-lf"),
  }).strict(),
  publicInterface: FrozenPathSchema,
  resourceContract: FrozenPathSchema,
  development: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[0]),
      z.literal(ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[1]),
    ]),
  }).strict(),
  heldout: FrozenPathSchema.extend({
    taskIds: z.tuple([
      z.literal(ZH_CODE_REVIEWER_HELDOUT_TASK_IDS[0]),
      z.literal(ZH_CODE_REVIEWER_HELDOUT_TASK_IDS[1]),
    ]),
  }).strict(),
  isolation: z.object({
    scorerImplementedAfterFreeze: z.literal(true),
    developmentMayReadHeldoutContent: z.literal(false),
    heldoutMayEnterCalibration: z.literal(false),
    compilerMayReadEvaluatorPayload: z.literal(false),
  }).strict(),
}).strict()

export type ZhCodeReviewerTaskSplitFreeze = z.infer<typeof ZhCodeReviewerTaskSplitFreezeSchema>

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

export async function validateZhCodeReviewerTaskSplitFreeze(input: {
  rootDir: string
  freeze: unknown
}): Promise<ZhCodeReviewerTaskSplitFreeze> {
  const freeze = ZhCodeReviewerTaskSplitFreezeSchema.parse(input.freeze)
  await Promise.all([
    verifyFrozenPath(input.rootDir, freeze.source),
    verifyFrozenPath(input.rootDir, freeze.license),
    verifyFrozenPath(input.rootDir, freeze.publicInterface),
    verifyFrozenPath(input.rootDir, freeze.resourceContract),
    verifyFrozenPath(input.rootDir, freeze.development),
    verifyFrozenPath(input.rootDir, freeze.heldout),
  ])
  return freeze
}
