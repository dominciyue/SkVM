import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../providers/types.ts"
import type { AuthorizationTaskV0 } from "../task-dsl/authorization/schema.ts"
import { buildAuthorizationSourceCatalog } from "../benchmarks/authorization-dsl/inputs.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"
import {
  runAuthorizationCli,
  type AuthorizationCliDependencies,
} from "./authorization.ts"
import { resolveSkvmInvocation } from "../../bin/skvm-route.js"

const cleanupRoots: string[] = []
const repositoryRoot = path.resolve(import.meta.dir, "../..")

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "ordinary-authorization-cli-task",
    request: "Assess the declared update authorization.",
    repository: "https://example.test/ordinary/authorization-cli",
    sourceRef: "ordinary-cli-ref-v1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-policy",
      kind: "task-requirement",
      text: "Only an owner may update the selected record.",
      location: "assessment.json#/task/policySources/0",
      revision: "ordinary-policy-v1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "Bounded synthetic policy." },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member who does not own the record.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A selected record." }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-foreign-update",
      principalId: "member",
      resourceId: "record",
      relation: "non-owner",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The task fixes an authenticated caller." }],
      policySourceId: "record-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "Only the explicit source entry is assessed.",
    requiredAnalysis: ["Explain the caller, record, strongest control, and protected effect."],
    constraints: ["Use only the supplied source and do not execute the target."],
  }
}

async function makeFixture(options: { conditionRequest?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-cli-"))
  cleanupRoots.push(root)
  await mkdir(path.join(root, "project", "src"), { recursive: true })
  await writeFile(path.join(root, "project", "src", "record.ts"), [
    "export async function updateRecord(request: Request) {",
    "  const principal = request.user",
    "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
    "  return persistUpdate(request.record)",
    "}",
  ].join("\n"), "utf8")
  const task = makeTask()
  const input = {
    schemaVersion: "authorization-assessment-input/v1",
    sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef },
    sourceRoot: "project",
    sources: ["src/record.ts"],
    task,
    analysisRequirements: [{
      id: "task.control",
      kind: "authorization-decision",
      obligationIds: ["deny-foreign-update"],
      question: "Which visible control decides the update?",
      applicability: "required",
      prerequisiteIds: [],
    }],
    ...(options.conditionRequest
      ? {
          conditionAnalysisRequest: {
            schemaVersion: "authorization-condition-analysis-request/v1",
            requests: [{
              obligationId: "deny-foreign-update",
              conditionBindings: [{ id: "is-authenticated", name: "authenticated" }],
              maxBranches: 2,
            }],
          },
        }
      : {}),
  }
  const inputPath = path.join(root, "assessment.json")
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8")
  return { root, inputPath, outRoot: path.join(root, "runs"), task }
}

function responseFor(sourceId: string): LLMResponse {
  const cite = (statement: string, line: number) => [{
    statement,
    citations: [{ sourceId, startLine: line, endLine: line }],
  }]
  const wire = {
    schemaVersion: "source-authorization-assessment-wire/v2",
    results: [{
      obligationId: "deny-foreign-update::update-record",
      conclusion: "source_refuted",
      explanation: "The ownership check rejects the non-owner before persistence.",
      facts: {
        entry: cite("The update entry is visible.", 1),
        binding: cite("The request user binds the principal.", 2),
        control: cite("The owner comparison rejects a non-owner.", 3),
        effect: cite("Persistence follows the check.", 4),
        condition: cite("The request supplies an authenticated principal.", 2),
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update is assessed." },
    coverage: [{
      requirementId: "task.control",
      obligationId: "deny-foreign-update::update-record",
      status: "addressed",
      explanation: "The visible owner check answers the question.",
      factPointers: ["/results/0/facts/control/0"],
    }],
  }
  return {
    text: "",
    toolCalls: [{ id: "authorization-cli-result", name: "submit_authorization_result", arguments: wire }],
    tokens: { input: 100, output: 40, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.002,
    durationMs: 10,
    stopReason: "tool_use",
  }
}

async function mockProvider(inputPath: string, calls: { factory: number; provider: number }): Promise<LLMProvider> {
  const loaded = await loadLocalAuthorizationInput(inputPath)
  if (loaded.status !== "valid") throw new Error("CLI test fixture must load")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw new Error("CLI test fixture catalog must build")
  const response = responseFor(catalog.catalog.sources[0]!.sourceId)
  calls.factory += 1
  return {
    name: "authorization-cli-mock",
    async complete() {
      calls.provider += 1
      return response
    },
    async completeWithToolResults() {
      throw new Error("Authorization CLI must not execute tool results")
    },
  }
}

function dependencies(
  inputPath: string,
  calls: { factory: number; provider: number },
  stdout: string[],
  stderr: string[],
): AuthorizationCliDependencies {
  return {
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value),
    env: {},
    providerFactory: async () => mockProvider(inputPath, calls),
  }
}

describe("authorization CLI", () => {
  it("resolves the real Bun binary behind a Windows npm shim for source checkout routing", () => {
    const here = "C:\\repo\\bin"
    const npmBin = "C:\\Users\\person\\AppData\\Roaming\\npm"
    const bunBinary = path.join(npmBin, "node_modules", "bun", "bin", "bun.exe")
    const sourceEntry = "C:\\repo\\src\\index.ts"
    const existing = new Set([bunBinary, sourceEntry])

    const invocation = resolveSkvmInvocation({
      here,
      argv: ["authorization", "--help"],
      platform: "win32",
      env: { PATH: npmBin },
      exists: candidate => existing.has(String(candidate)),
    })

    expect(invocation).toEqual({
      cmd: bunBinary,
      args: ["run", sourceEntry, "authorization", "--help"],
      env: { PATH: npmBin },
    })
  })

  it("initializes a clearly synthetic editable assessment and never overwrites it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-init-"))
    cleanupRoots.push(root)
    const outputPath = path.join(root, "assessment.json")
    const stdout: string[] = []
    const stderr: string[] = []
    const deps: AuthorizationCliDependencies = {
      stdout: value => stdout.push(value),
      stderr: value => stderr.push(value),
    }

    expect(await runAuthorizationCli(["init", `--out=${outputPath}`], deps)).toBe(0)
    const initializedBytes = await readFile(outputPath, "utf8")
    const initialized = JSON.parse(initializedBytes) as { schemaVersion: string; task: { taskId: string; repository: string } }
    expect(initialized.schemaVersion).toBe("authorization-assessment-input/v1")
    expect(initialized.task.taskId).toContain("synthetic")
    expect(initialized.task.repository).toContain("example.test")

    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(
      path.join(root, "project", "src", "record.ts"),
      await readFile(path.join(
        repositoryRoot,
        "examples",
        "authorization-assessment",
        "project",
        "src",
        "record.ts",
      ), "utf8"),
      "utf8",
    )
    expect(await runAuthorizationCli(["check", `--input=${outputPath}`], deps)).toBe(0)

    const unsafePath = path.join(root, "unsafe-assessment.json")
    await writeFile(unsafePath, `${JSON.stringify({ ...initialized, sourceRoot: "../outside" }, null, 2)}\n`, "utf8")
    expect(await runAuthorizationCli(["check", `--input=${unsafePath}`], deps)).toBe(1)

    expect(await runAuthorizationCli(["init", `--out=${outputPath}`], deps)).toBe(1)
    expect(await readFile(outputPath, "utf8")).toBe(initializedBytes)
    expect(stderr.join("\n")).toContain("already exists")
  })

  it("normalizes --from beside the authoring file while preserving the original", async () => {
    const fixture = await makeFixture()
    const authoringPath = path.join(fixture.root, "authoring.json")
    const normalizedPath = path.join(fixture.root, "normalized.json")
    const authoring = {
      schemaVersion: "authorization-assessment-authoring/v1",
      sourceRoot: "project",
      sources: ["src/record.ts"],
      task: fixture.task,
    }
    const originalBytes = `${JSON.stringify(authoring, null, 2)}\n`
    await writeFile(authoringPath, originalBytes, "utf8")
    const stdout: string[] = []
    const stderr: string[] = []

    expect(await runAuthorizationCli([
      "init",
      `--from=${authoringPath}`,
      `--out=${normalizedPath}`,
    ], { stdout: value => stdout.push(value), stderr: value => stderr.push(value) })).toBe(0)
    expect(await readFile(authoringPath, "utf8")).toBe(originalBytes)
    const normalized = JSON.parse(await readFile(normalizedPath, "utf8")) as {
      sourceIdentity: { repository: string; sourceRef: string }
      analysisProfile: { id: string; origin: string }
      analysisRequirements: unknown[]
    }
    expect(normalized.sourceIdentity).toEqual({
      repository: fixture.task.repository,
      sourceRef: fixture.task.sourceRef,
    })
    expect(normalized.analysisProfile).toEqual({ id: "authorization-core-v1", origin: "derived" })
    expect(normalized.analysisRequirements).toHaveLength(6)
    expect(stderr).toEqual([])
  })

  it("keeps check and condition preview provider-free and returns stable argument exit codes", async () => {
    const fixture = await makeFixture({ conditionRequest: true })
    const calls = { factory: 0, provider: 0 }
    const stdout: string[] = []
    const stderr: string[] = []
    const deps = dependencies(fixture.inputPath, calls, stdout, stderr)

    expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`], deps)).toBe(0)
    expect(calls).toEqual({ factory: 0, provider: 0 })
    expect(stdout.join("\n")).toContain('"arm": "B"')
    expect(stdout.join("\n")).toContain("Condition analysis request")

    expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`, "--unknown=x"], deps)).toBe(2)
    expect(await runAuthorizationCli(["run", `--input=${fixture.inputPath}`], deps)).toBe(2)
    expect(calls).toEqual({ factory: 0, provider: 0 })
    expect(stderr.join("\n")).toContain("Unknown option --unknown")
    expect(stderr.join("\n")).toContain("run requires --model")
  })

  it("runs with default B into a new session each time and inspects without another provider", async () => {
    const fixture = await makeFixture()
    const calls = { factory: 0, provider: 0 }
    const stdout: string[] = []
    const stderr: string[] = []
    const deps = dependencies(fixture.inputPath, calls, stdout, stderr)
    const command = [
      "run",
      `--input=${fixture.inputPath}`,
      "--model=mock/model",
      `--out=${fixture.outRoot}`,
    ]

    expect(await runAuthorizationCli(command, deps)).toBe(0)
    expect(await runAuthorizationCli(command, deps)).toBe(0)
    const runReports = stdout.slice(-2).map(value => JSON.parse(value) as {
      status: string
      arm: string
      sessionPath: string
    })
    expect(runReports.map(report => report.status)).toEqual(["completed", "completed"])
    expect(runReports.map(report => report.arm)).toEqual(["B", "B"])
    expect(runReports[0]!.sessionPath).not.toBe(runReports[1]!.sessionPath)
    expect(calls).toEqual({ factory: 2, provider: 2 })

    const outputBeforeInspect = stdout.length
    expect(await runAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], deps)).toBe(0)
    expect(stdout).toHaveLength(outputBeforeInspect + 1)
    expect(JSON.parse(stdout.at(-1)!).status).toBe("completed")
    expect(calls).toEqual({ factory: 2, provider: 2 })
    expect(stderr).toEqual([])
  })
})
