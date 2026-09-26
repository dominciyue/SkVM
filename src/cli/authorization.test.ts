import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
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
  it("routes a read-only scenario workspace preview without creating output or a provider", async () => {
    const workspace = path.join(repositoryRoot, "examples", "authorization-assessment", "scenario-workspace", "workspace.json")
    const output = path.join(path.dirname(workspace), "__cli-route-check-only-output")
    const stdout: string[] = [], stderr: string[] = []
    const deps: AuthorizationCliDependencies = {
      stdout: value => stdout.push(value),
      stderr: value => stderr.push(value),
      providerFactory: () => { throw new Error("preview must not create a provider") },
    }
    expect(await runAuthorizationCli(["compose", `--workspace=${workspace}`, `--out=${output}`, "--check-only"], deps)).toBe(0)
    expect(JSON.parse(stdout.at(-1)!).status).toBe("valid")
    expect(await stat(output).then(() => true, () => false)).toBe(false)
    expect(await runAuthorizationCli(["compose", "--unknown=x"], deps)).toBe(2)
    expect(stderr.at(-1)).toContain("Invalid argument")
  })

  it("runs and inspects explicit v5 and compares with the same protocol by default", async () => {
    const fixture = await makeFixture({ conditionRequest: true })
    const calls = { factory: 0, provider: 0 }, stdout: string[] = [], stderr: string[] = []
    const deps = dependencies(fixture.inputPath, calls, stdout, stderr)
    deps.providerFactory = async () => {
      const provider = await mockProvider(fixture.inputPath, calls)
      const complete = provider.complete.bind(provider)
      provider.complete = async params => {
        const response = await complete(params), old = response.toolCalls[0]!.arguments as any, item = old.results[0]
        response.toolCalls[0]!.arguments = { results: [{ obligationId: item.obligationId, policyStatus: "satisfied", explanation: item.explanation, facts: Object.entries(item.facts).flatMap(([kind, facts]) => (facts as any[]).map((fact, i) => ({ ...fact, id: `${kind}${i}`, kind }))), decisiveMissingFacts: [], suggestedObservations: [] }] }
        return response
      }
      return provider
    }
    for (const method of ["plain", "ledger", "conditions"]) {
      expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`, `--method=${method}`, "--wire=v5"], deps)).toBe(0)
      expect(JSON.parse(stdout.at(-1)!).wireVersion).toBe("source-authorization-assessment-wire/v5")
    }
    expect(await runAuthorizationCli(["run", `--input=${fixture.inputPath}`, "--method=plain", "--wire=v5", "--model=mock/model", `--out=${fixture.outRoot}`], deps)).toBe(0)
    const report = JSON.parse(stdout.at(-1)!)
    expect(await runAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], deps)).toBe(0)
    const inspected = JSON.parse(stdout.at(-1)!)
    expect(inspected.normalizerVersion).toBe("authorization-wire-normalizer/v5")
    expect(inspected.wireResult.results[0].policyStatus).toBe("satisfied")
    expect(inspected.canonicalResult.results[0].conclusion).toBe("source_refuted")
    expect(await runAuthorizationCli(["compare", `--previous=${report.sessionPath}`, `--input=${fixture.inputPath}`], deps)).toBe(0)
    expect(JSON.parse(stdout.at(-1)!).status).toBe("current")
    expect(calls).toEqual({ factory: 1, provider: 1 })
  })
  it("keeps requested condition questions public in plain, ledger and conditions on the same v4 base", async () => {
    const fixture=await makeFixture({conditionRequest:true})
    const calls={factory:0,provider:0},stdout:string[]=[],stderr:string[]=[]
    for(const method of ["plain","ledger","conditions"]) {
      expect(await runAuthorizationCli(["check",`--input=${fixture.inputPath}`,`--method=${method}`,"--wire=v4"],dependencies(fixture.inputPath,calls,stdout,stderr))).toBe(0)
      expect(JSON.parse(stdout.at(-1)!).preview).toContain("Compare bounded outcomes for deny-foreign-update::update-record")
      expect(JSON.parse(stdout.at(-1)!).preview).toContain("at most 2 branches")
    }
    expect(calls.factory).toBe(0)
  })
  it("selects public methods before provider creation and preserves input-request compatibility", async () => {
    const fixture = await makeFixture({ conditionRequest: true })
    const calls = { factory: 0, provider: 0 }
    const stdout: string[] = []
    const stderr: string[] = []
    const deps = dependencies(fixture.inputPath, calls, stdout, stderr)
    for (const method of ["plain", "ledger", "conditions"]) {
      expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`, `--method=${method}`], deps)).toBe(0)
      const report = JSON.parse(stdout.at(-1)!)
      expect(report.methodSelection).toMatchObject({ requested: method, effective: method, selectionOrigin: "explicit" })
      expect(report.wireVersion).toBe(`source-authorization-assessment-wire/v${method === "plain" ? 1 : method === "ledger" ? 2 : 3}`)
      expect(report.ledgerEntryCount).toBe(method === "plain" ? 0 : 1)
      expect(report.preview.includes("Condition analysis request")).toBe(method === "conditions")
      if (method !== "conditions") expect(report.methodSelection.conditionRequestIgnored).toBe(true)
      expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`, `--method=${method}`, "--wire=v4"], deps)).toBe(0)
      expect(JSON.parse(stdout.at(-1)!).wireVersion).toBe("source-authorization-assessment-wire/v4")
    }
    expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`], deps)).toBe(0)
    expect(JSON.parse(stdout.at(-1)!).methodSelection).toMatchObject({ effective: "conditions", selectionOrigin: "input-request" })
    expect(await runAuthorizationCli(["check", `--input=${fixture.inputPath}`, "--method=plain", "--arm=D"], deps)).toBe(1)
    expect(JSON.parse(stdout.at(-1)!).diagnostics[0].code).toBe("method-arm-conflict")
    const noConditions = await makeFixture()
    expect(await runAuthorizationCli(["run", `--input=${noConditions.inputPath}`, "--method=conditions", "--model=mock/model", `--out=${noConditions.outRoot}`], deps)).toBe(1)
    expect(JSON.parse(stdout.at(-1)!).diagnostics[0].path).toBe("conditionAnalysisRequest")
    expect(calls).toEqual({ factory: 0, provider: 0 })
  })

  it("persists explicit ledger selection through run, session, text and inspect", async () => {
    const fixture = await makeFixture({ conditionRequest: true })
    const calls = { factory: 0, provider: 0 }
    const stdout: string[] = []
    const stderr: string[] = []
    const deps = dependencies(fixture.inputPath, calls, stdout, stderr)
    expect(await runAuthorizationCli(["run", `--input=${fixture.inputPath}`, "--method=ledger", "--model=mock/model", `--out=${fixture.outRoot}`], deps)).toBe(0)
    const report = JSON.parse(stdout.at(-1)!)
    expect(report.methodSelection.effective).toBe("ledger")
    const session = JSON.parse(await readFile(path.join(report.sessionPath, "session.json"), "utf8"))
    expect(session.methodSelection).toEqual(report.methodSelection)
    expect(await readFile(path.join(report.sessionPath, "summary.txt"), "utf8")).toContain("Method: ledger")
    expect(await runAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], deps)).toBe(0)
    expect(JSON.parse(stdout.at(-1)!).methodSelection).toEqual(report.methodSelection)
    expect(calls).toEqual({ factory: 1, provider: 1 })
    const resultPath = path.join(report.sessionPath, "result.json")
    const original = await readFile(resultPath, "utf8")
    await writeFile(resultPath, JSON.stringify({ ...report, wireVersion: "source-authorization-assessment-wire/v1", methodSelection: { ...report.methodSelection, effective: "plain" } }), "utf8")
    expect(await runAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], deps)).toBe(2)
    await writeFile(resultPath, original, "utf8")
    await writeFile(path.join(report.sessionPath, "session.json"), JSON.stringify({ ...session, methodSelection: { ...session.methodSelection, effective: "plain" } }), "utf8")
    expect(await runAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], deps)).toBe(2)
  })

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
