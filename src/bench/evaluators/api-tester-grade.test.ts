import { createHash } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runSubprocess } from "../../core/subprocess.ts"
import type { RunResult } from "../../core/types.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { customEvaluatorSourceDigests } from "./index.ts"
import {
  ApiTesterGradePayloadSchema,
  apiTesterGrade,
} from "./api-tester-grade.ts"

const temporaryDirectories = new Set<string>()
const initialManifestByWorkDir = new Map<string, InitialWorkdirManifestReference>()
const checks = [
  "generator-integrity",
  "operation-coverage",
  "schema-derived-cases",
  "security-response",
  "independence-verification",
] as const

const openapi = `openapi: 3.0.3
info: { title: User API, version: 1.0.0 }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
paths:
  /users:
    post:
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name: { type: string, minLength: 3, maxLength: 40 }
                email: { type: string, format: email }
                role: { type: string, enum: [reader, editor] }
      responses:
        "201": { description: Created }
        "400": { description: Invalid }
        "401": { description: Unauthorized }
  /users/{userId}:
    get:
      security: [{ bearerAuth: [] }]
      parameters:
        - { in: path, name: userId, required: true, schema: { type: string, minLength: 1 } }
      responses:
        "200": { description: User }
        "401": { description: Unauthorized }
        "404": { description: Missing }
`

const publicInterface = {
  schemaVersion: "skill-ir-api-tester-interface/v1",
  interfaceId: "api-tester-generator-interface-v1",
}

const plan = {
  schemaVersion: "api-test-plan/v1",
  source: "public-openapi",
  framework: "node:test",
  endpoints: [
    {
      method: "post",
      path: "/users",
      cases: [
        testCase("post-happy", "happy", { body: { name: "abc", email: "a@b.test", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 201),
        testCase("post-name-required", "error", { body: { email: "a@b.test", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 400),
        testCase("post-name-min", "boundary", { body: { name: "abc", email: "a@b.test", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 201),
        testCase("post-name-max", "boundary", { body: { name: "x".repeat(40), email: "a@b.test", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 201),
        testCase("post-email-required", "error", { body: { name: "abc", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 400),
        testCase("post-email-format", "boundary", { body: { name: "abc", email: "a@b.test", role: "reader" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 201),
        testCase("post-role-enum", "boundary", { body: { name: "abc", email: "a@b.test", role: "editor" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 201),
        testCase("post-unauthorized", "error", { body: { name: "abc", email: "a@b.test", role: "reader" } }, 401),
      ],
    },
    {
      method: "get",
      path: "/users/{userId}",
      cases: [
        testCase("get-happy", "happy", { path: { userId: "u" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 200),
        testCase("get-id-required", "error", { path: {}, headers: { Authorization: "${API_TEST_TOKEN}" } }, 404),
        testCase("get-id-min", "boundary", { path: { userId: "u" }, headers: { Authorization: "${API_TEST_TOKEN}" } }, 200),
        testCase("get-unauthorized", "error", { path: { userId: "u" } }, 401),
      ],
    },
  ],
}

function testCase(id: string, category: string, request: object, expectedStatus: number) {
  return { id, category, request, expectedStatus, assertions: ["status"], independent: true, timeoutMs: 5000 }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function payload(check: string, openapiBytes: string, interfaceBytes: string): unknown {
  return {
    schemaVersion: "skill-ir-api-tester-eval/v1",
    check,
    paths: {
      openapi: "api/openapi.yaml",
      interface: "api-test-interface.json",
      generator: "api-test-generator.mjs",
      plan: "generated/api-test-plan.json",
      report: "api-test-report.json",
    },
    protectedSha256: {
      openapi: sha256(openapiBytes),
      interface: sha256(interfaceBytes),
    },
  }
}

function runResult(workDir: string): RunResult {
  return {
    text: "complete",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest: initialManifestByWorkDir.get(workDir),
    runStatus: "ok",
  }
}

function generatorSource(options: { nondeterministic?: boolean } = {}): string {
  const generatedPlan = options.nondeterministic ? { ...plan, generatedAt: "__NOW__" } : plan
  const serialized = JSON.stringify(generatedPlan)
  return `import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, index, all) => {
  if (value.startsWith("--")) out.push([value.slice(2), all[index + 1]]);
  return out;
}, []));
if (!args.input || !args.out) process.exit(2);
const plan = ${serialized.replace('"__NOW__"', "Date.now()")};
await mkdir(path.dirname(args.out), { recursive: true });
await writeFile(args.out, JSON.stringify(plan, null, 2) + "\\n", "utf8");
`
}

async function writeFixture(options: {
  nondeterministic?: boolean
  mutateInput?: boolean
  extraOutput?: boolean
  removeBoundary?: boolean
  reportStatus?: "passed" | "failed" | "not-run"
} = {}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "skvm-api-tester-grade-"))
  temporaryDirectories.add(workDir)
  await mkdir(path.join(workDir, "api"), { recursive: true })
  const interfaceBytes = json(publicInterface)
  await writeFile(path.join(workDir, "api/openapi.yaml"), openapi, "utf8")
  await writeFile(path.join(workDir, "api-test-interface.json"), interfaceBytes, "utf8")
  const manifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: `${workDir}-initial-workdir-manifest.json`,
  })
  initialManifestByWorkDir.set(workDir, manifest)

  await writeFile(path.join(workDir, "api-test-generator.mjs"), generatorSource({ nondeterministic: options.nondeterministic }), "utf8")
  const generated = await runSubprocess([
    "node", "api-test-generator.mjs", "--input", "api/openapi.yaml", "--out", "generated/api-test-plan.json",
  ], { cwd: workDir, timeoutMs: 10_000 })
  if (generated.exitCode !== 0) throw new Error(generated.stderr)
  if (options.removeBoundary) {
    const current = structuredClone(plan)
    current.endpoints[0]!.cases = current.endpoints[0]!.cases.filter((entry) => entry.category === "happy")
    await writeFile(path.join(workDir, "generated/api-test-plan.json"), json(current), "utf8")
  }
  await writeFile(path.join(workDir, "api-test-report.json"), json({
    schemaVersion: "api-test-report/v1",
    discoverySource: "api/openapi.yaml",
    generatedCaseCount: plan.endpoints.flatMap((entry) => entry.cases).length,
    verification: { status: options.reportStatus ?? "passed", command: ["node", "api-test-generator.mjs"] },
    limitations: [],
  }), "utf8")
  if (options.mutateInput) await writeFile(path.join(workDir, "api/openapi.yaml"), "openapi: 3.0.3\npaths: {}\n", "utf8")
  if (options.extraOutput) await writeFile(path.join(workDir, "debug.log"), "extra\n", "utf8")
  return { workDir, openapiBytes: openapi, interfaceBytes }
}

async function grade(check: string, fixture: Awaited<ReturnType<typeof writeFixture>>) {
  return apiTesterGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-api-tester",
      payload: payload(check, fixture.openapiBytes, fixture.interfaceBytes),
    },
    runResult: runResult(fixture.workDir),
  })
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
  initialManifestByWorkDir.clear()
})

describe("api-tester evaluator", () => {
  test("registers a closed, answer-free payload and binds its source digest", async () => {
    expect(customEvaluators.get("skill-ir-api-tester")).toBe(apiTesterGrade)
    expect(() => ApiTesterGradePayloadSchema.parse({
      ...(payload("generator-integrity", openapi, json(publicInterface)) as object),
      expected: { operations: ["POST /users"] },
    })).toThrow()
    for (const forbidden of ["gold", "rawModel", "sourceQuote", "heldout"] as const) {
      expect(() => ApiTesterGradePayloadSchema.parse({
        ...(payload("generator-integrity", openapi, json(publicInterface)) as object),
        [forbidden]: "TEST_ONLY_CANARY",
      })).toThrow()
    }
    const escaping = payload("generator-integrity", openapi, json(publicInterface)) as {
      paths: { generator: string }
    }
    escaping.paths.generator = "../outside.mjs"
    expect(() => ApiTesterGradePayloadSchema.parse(escaping)).toThrow()
    expect(customEvaluatorSourceDigests.get("skill-ir-api-tester")).toBe(sha256(await readFile(
      path.join(process.cwd(), "src/bench/evaluators/api-tester-grade.ts"),
    )))
  })

  test("passes all five criteria for a deterministic public-source alternative", async () => {
    const fixture = await writeFixture()
    for (const check of checks) expect(await grade(check, fixture)).toMatchObject({ pass: true, score: 1 })
  })

  test("rejects protected-input mutation and exact-output drift", async () => {
    expect(await grade("generator-integrity", await writeFixture({ mutateInput: true })))
      .toMatchObject({ pass: false, score: 0 })
    expect(await grade("generator-integrity", await writeFixture({ extraOutput: true })))
      .toMatchObject({ pass: false, score: 0 })
  })

  test("rejects nondeterministic generation and a submitted plan that generator cannot reproduce", async () => {
    expect(await grade("generator-integrity", await writeFixture({ nondeterministic: true })))
      .toMatchObject({ pass: false, score: 0 })
    expect(await grade("generator-integrity", await writeFixture({ removeBoundary: true })))
      .toMatchObject({ pass: false, score: 0 })
  })

  test("separately rejects missing schema evidence and ungrounded verification", async () => {
    expect(await grade("schema-derived-cases", await writeFixture({ removeBoundary: true })))
      .toMatchObject({ pass: false, score: 0 })
    expect(await grade("independence-verification", await writeFixture({ reportStatus: "not-run" })))
      .toMatchObject({ pass: false, score: 0 })
  })
})
