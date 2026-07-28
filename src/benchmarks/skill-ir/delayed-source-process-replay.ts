import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { z } from "zod"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ROUTE_MODEL = "replay/delayed-source-process"
const BACKEND_MODEL = "delayed-source-process"
const TOKEN_PREFIX = "TEST_ONLY_DELAYED_REPLAY_"
const REQUIRED_OUTPUTS = [
  "design/design-plan.json",
  "design/allocation.csv",
  "design/design-report.md",
] as const
const EVIDENCE_PATHS = [
  "src/index.ts",
  "src/cli/run.ts",
  "src/run/index.ts",
  "src/adapters/bare-agent.ts",
  "src/core/agent-loop.ts",
  "src/core/agent-tools.ts",
  "src/providers/openai-compatible.ts",
  "src/providers/openai-compatible-transport.ts",
  "src/providers/openai-compatible-node-helper.mjs",
  "src/benchmarks/skill-ir/delayed-source-process-replay.ts",
  "src/benchmarks/skill-ir/delayed-source-process-replay-run.ts",
  "results/skill-ir/experimental-design-v2-trajectory-shape-audit-2026-07-29.json",
] as const

type ToolCall = { id: string; name: string; arguments: Record<string, unknown> }
type ScriptedPhase = {
  name: string
  delayMs: number
  toolCalls: ToolCall[]
  finalText?: string
}

const singleCall = (id: string, name: string, args: Record<string, unknown>): ToolCall[] =>
  [{ id, name, arguments: args }]

const SCRIPTED_PHASES: ScriptedPhase[] = [
  {
    name: "wide-read",
    delayMs: 27_000,
    toolCalls: Array.from({ length: 6 }, (_, index) => ({
      id: `wide-read-${index + 1}`,
      name: "read_file",
      arguments: { path: index % 2 === 0 ? "study.json" : "design-contract.json" },
    })),
  },
  {
    name: "spawn-three",
    delayMs: 13_000,
    toolCalls: Array.from({ length: 3 }, (_, index) => ({
      id: `shell-${index + 1}`,
      name: "execute_command",
      arguments: { command: `node -e \"process.stdout.write('delayed-shell-${index + 1}')\"` },
    })),
  },
  {
    name: "inspect-two",
    delayMs: 13_000,
    toolCalls: [
      { id: "inspect-study", name: "read_file", arguments: { path: "study.json" } },
      { id: "inspect-root", name: "list_directory", arguments: { path: "." } },
    ],
  },
  { name: "write-plan", delayMs: 13_000, toolCalls: singleCall("write-plan", "write_file", { path: REQUIRED_OUTPUTS[0], content: "{\"replay\":true}\n" }) },
  { name: "read-plan-1", delayMs: 13_000, toolCalls: singleCall("read-plan-1", "read_file", { path: REQUIRED_OUTPUTS[0] }) },
  { name: "write-allocation", delayMs: 13_000, toolCalls: singleCall("write-allocation", "write_file", { path: REQUIRED_OUTPUTS[1], content: "order,unit_id,stratum,arm\n" }) },
  { name: "read-allocation-1", delayMs: 13_000, toolCalls: singleCall("read-allocation-1", "read_file", { path: REQUIRED_OUTPUTS[1] }) },
  { name: "write-report", delayMs: 13_000, toolCalls: singleCall("write-report", "write_file", { path: REQUIRED_OUTPUTS[2], content: "# Delayed replay report\n" }) },
  { name: "read-report-1", delayMs: 13_000, toolCalls: singleCall("read-report-1", "read_file", { path: REQUIRED_OUTPUTS[2] }) },
  { name: "list-output", delayMs: 13_000, toolCalls: singleCall("list-output", "list_directory", { path: "design" }) },
  { name: "read-study-2", delayMs: 13_000, toolCalls: singleCall("read-study-2", "read_file", { path: "study.json" }) },
  { name: "read-contract-2", delayMs: 13_000, toolCalls: singleCall("read-contract-2", "read_file", { path: "design-contract.json" }) },
  { name: "read-plan-2", delayMs: 13_000, toolCalls: singleCall("read-plan-2", "read_file", { path: REQUIRED_OUTPUTS[0] }) },
  { name: "read-allocation-2", delayMs: 13_000, toolCalls: singleCall("read-allocation-2", "read_file", { path: REQUIRED_OUTPUTS[1] }) },
  { name: "read-report-2", delayMs: 13_000, toolCalls: singleCall("read-report-2", "read_file", { path: REQUIRED_OUTPUTS[2] }) },
  { name: "final", delayMs: 12_000, toolCalls: [], finalText: "Delayed source-process replay completed." },
]

export const DELAYED_REPLAY_SHAPE = Object.freeze({
  responseDelaysMs: Object.freeze(SCRIPTED_PHASES.map((phase) => phase.delayMs)),
  toolCallsPerPhase: Object.freeze(SCRIPTED_PHASES.map((phase) => phase.toolCalls.length)),
  minimumEnvelopeDurationMs: 220_124,
})

const ReplaySystemSchema = z.enum(["no-skill", "original"])
const FailureCodeSchema = z.enum([
  "none",
  "timeout",
  "bun-internal-assertion",
  "nonzero-exit",
  "adapter-non-ok",
  "responder-protocol",
  "output-incomplete",
])
const StreamSchema = z.object({
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()
const EvidenceRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()
const RowSchema = z.object({
  id: z.string().min(1),
  system: ReplaySystemSchema,
  exitCode: z.number().int(),
  timedOut: z.boolean(),
  failureCode: FailureCodeSchema,
  durationMs: z.number().nonnegative(),
  stdout: StreamSchema,
  stderr: StreamSchema,
  responder: z.object({
    requests: z.number().int().nonnegative(),
    phases: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    maximumToolFanOut: z.number().int().nonnegative(),
    configuredDelayMs: z.number().int().nonnegative(),
    protocolPassed: z.boolean(),
  }).strict(),
  outputs: z.object({
    declared: z.literal(3),
    present: z.number().int().min(0).max(3),
  }).strict(),
}).strict()

export const DelayedSourceProcessReplayReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-delayed-source-process-replay-report/v1"),
  diagnosticId: z.literal("experimental-design-v2-delayed-source-process-replay-2026-07-29"),
  methodEvidence: z.literal(false),
  runtimePassed: z.boolean(),
  passed: z.boolean(),
  runtime: z.object({
    platform: z.string().min(1),
    architecture: z.string().min(1),
    bunVersion: z.string().min(1),
    bunExecutableSha256: z.string().regex(SHA256_PATTERN),
    nodeExecutableSha256: z.string().regex(SHA256_PATTERN),
  }).strict(),
  shape: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original")]),
    expectedRows: z.literal(2),
    responsesPerRow: z.literal(16),
    toolCallsPerRow: z.literal(23),
    maximumToolFanOut: z.literal(6),
    configuredProviderDelayMs: z.number().int().nonnegative(),
    minimumEnvelopeDurationMs: z.literal(220_124),
  }).strict(),
  counts: z.object({
    expectedRows: z.literal(2),
    observedRows: z.number().int().nonnegative(),
    exitZero: z.number().int().nonnegative(),
    outputsComplete: z.number().int().nonnegative(),
    protocolComplete: z.number().int().nonnegative(),
    timeouts: z.number().int().nonnegative(),
    bunCrashes: z.number().int().nonnegative(),
    nonzeroExits: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(RowSchema),
  coverage: z.object({
    responseCountCovered: z.boolean(),
    toolCallCountCovered: z.boolean(),
    toolFanOutCovered: z.boolean(),
    configuredDelayCovered: z.boolean(),
    wallClockCovered: z.boolean(),
    successfulEnvelopeCovered: z.boolean(),
  }).strict(),
  evidence: z.array(EvidenceRefSchema).min(1),
  claimBoundary: z.object({
    infrastructureDiagnosticOnly: z.literal(true),
    deterministicSuccessfulEnvelopeOnly: z.literal(true),
    historicalCrashTrajectoryObservable: z.literal(false),
    crashCausalityEstablished: z.literal(false),
    benchmarkEvidence: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    modelCapabilityEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
    paidRerunAllowed: z.literal(false),
  }).strict(),
}).strict()

export type DelayedSourceProcessReplayReport = z.infer<typeof DelayedSourceProcessReplayReportSchema>
type ReplaySystem = z.infer<typeof ReplaySystemSchema>
type ResponderFailureCode = "none" | "authorization-contract" | "request-contract"
  | "model-contract" | "tool-contract" | "phase-contract" | "request-overflow"
type ResponderSession = {
  requests: number
  phases: number
  toolCalls: number
  maximumToolFanOut: number
  configuredDelayMs: number
  failureCode: ResponderFailureCode
  previousToolCallIds: string[]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function failSession(session: ResponderSession, code: ResponderFailureCode): Response {
  if (session.failureCode === "none") session.failureCode = code
  return Response.json({ error: "delayed-source-process-replay-protocol" }, { status: 400 })
}

function hasRequiredTools(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.tools)) return false
  const names = new Set(body.tools.flatMap((tool) => {
    const fn = record(record(tool)?.function)
    return typeof fn?.name === "string" ? [fn.name] : []
  }))
  return ["read_file", "write_file", "execute_command", "list_directory"]
    .every((name) => names.has(name))
}

function hasPreviousToolResults(body: Record<string, unknown>, ids: string[]): boolean {
  if (ids.length === 0) return true
  if (!Array.isArray(body.messages)) return false
  const observed = new Set(body.messages.flatMap((message) => {
    const item = record(message)
    return item?.role === "tool" && typeof item.tool_call_id === "string"
      ? [item.tool_call_id]
      : []
  }))
  return ids.every((id) => observed.has(id))
}

export function startDelayedSourceProcessReplayResponder(options: { delayScale: 0 | 1 }) {
  const sessions = new Map<string, ResponderSession>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const authorization = request.headers.get("authorization")
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : ""
      const session = sessions.get(token) ?? {
        requests: 0,
        phases: 0,
        toolCalls: 0,
        maximumToolFanOut: 0,
        configuredDelayMs: 0,
        failureCode: "none" as const,
        previousToolCallIds: [],
      }
      sessions.set(token, session)
      session.requests++

      if (!token.startsWith(TOKEN_PREFIX)) return failSession(session, "authorization-contract")
      if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
        return failSession(session, "request-contract")
      }
      let body: Record<string, unknown> | undefined
      try {
        body = record(await request.json())
      } catch {
        return failSession(session, "request-contract")
      }
      if (!body) return failSession(session, "request-contract")
      if (body.model !== BACKEND_MODEL) return failSession(session, "model-contract")
      if (!hasRequiredTools(body)) return failSession(session, "tool-contract")
      const phase = SCRIPTED_PHASES[session.requests - 1]
      if (!phase) return failSession(session, "request-overflow")
      if (!hasPreviousToolResults(body, session.previousToolCallIds)) {
        return failSession(session, "phase-contract")
      }

      session.phases++
      session.toolCalls += phase.toolCalls.length
      session.maximumToolFanOut = Math.max(session.maximumToolFanOut, phase.toolCalls.length)
      const delayMs = phase.delayMs * options.delayScale
      session.configuredDelayMs += delayMs
      session.previousToolCallIds = phase.toolCalls.map((call) => call.id)
      if (delayMs > 0) await Bun.sleep(delayMs)

      const message = phase.toolCalls.length > 0
        ? {
            role: "assistant",
            content: "",
            tool_calls: phase.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            })),
          }
        : { role: "assistant", content: phase.finalText ?? "" }
      return Response.json({
        id: `delayed-replay-${session.requests}`,
        object: "chat.completion",
        choices: [{
          index: 0,
          message,
          finish_reason: phase.toolCalls.length > 0 ? "tool_calls" : "stop",
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
    },
  })
  return {
    baseUrl: `${server.url}v1`.replace(/\/$/, ""),
    audit(token: string) {
      const session = sessions.get(token) ?? {
        requests: 0,
        phases: 0,
        toolCalls: 0,
        maximumToolFanOut: 0,
        configuredDelayMs: 0,
        failureCode: "none" as const,
        previousToolCallIds: [],
      }
      return {
        requests: session.requests,
        phases: session.phases,
        toolCalls: session.toolCalls,
        maximumToolFanOut: session.maximumToolFanOut,
        configuredDelayMs: session.configuredDelayMs,
        protocolPassed: session.failureCode === "none"
          && session.requests === 16
          && session.phases === 16
          && session.toolCalls === 23
          && session.maximumToolFanOut === 6,
        failureCode: session.failureCode,
      }
    },
    stop() { server.stop(true) },
  }
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(await Bun.file(path).arrayBuffer())
  return hasher.digest("hex")
}

function containedPath(root: string, path: string): string {
  const rootPath = resolve(root)
  const candidate = resolve(path)
  const rel = relative(rootPath, candidate)
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return candidate
  }
  throw new Error(`Delayed replay evidence path escapes root: ${path}`)
}

async function evidenceRefs(rootDir: string) {
  return Promise.all(EVIDENCE_PATHS.map(async (path) => ({
    path,
    sha256: await sha256File(containedPath(rootDir, resolve(rootDir, path))),
  })))
}

function streamSummary(text: string) {
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
  }
}

async function regularOutputCount(workDir: string): Promise<number> {
  let present = 0
  for (const path of REQUIRED_OUTPUTS) {
    try {
      const info = await stat(resolve(workDir, path))
      if (info.isFile() && !info.isSymbolicLink()) present++
    } catch {
      // Missing output is represented in the compact row.
    }
  }
  return present
}

function executableSearchPath(nodeExecutable: string, env: Record<string, string | undefined>): string {
  const directories = [dirname(nodeExecutable)]
  if (process.platform === "win32") {
    directories.push("C:\\Program Files\\Git\\bin", "C:\\Program Files\\Git\\usr\\bin")
  }
  if (env.PATH) directories.push(env.PATH)
  return directories.join(process.platform === "win32" ? ";" : ":")
}

async function bunVersion(bunExecutable: string): Promise<string> {
  const proc = Bun.spawn([bunExecutable, "--version"], { stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if (exitCode !== 0 || stdout.trim().length === 0) {
    throw new Error("Delayed source-process replay Bun executable is unavailable")
  }
  return stdout.trim()
}

async function writeReplayInputs(root: string, baseUrl: string) {
  const cacheDir = resolve(root, "cache")
  const taskDir = resolve(root, "task")
  const skillDir = resolve(root, "skill")
  await Promise.all([
    mkdir(cacheDir, { recursive: true }),
    mkdir(taskDir, { recursive: true }),
    mkdir(skillDir, { recursive: true }),
  ])
  await writeFile(resolve(cacheDir, "skvm.config.json"), `${JSON.stringify({
    providers: { routes: [{
      match: "replay/*",
      kind: "openai-compatible",
      apiKeyEnv: "SKVM_DELAYED_REPLAY_API_KEY",
      baseUrl,
    }] },
  }, null, 2)}\n`, "utf8")
  await writeFile(resolve(taskDir, "task.json"), `${JSON.stringify({
    id: "delayed-source-process-replay",
    name: "Delayed source process replay",
    category: "skill-ir-infrastructure",
    gradingType: "automated",
    prompt: "Run the public delayed replay task and produce the three declared outputs.",
    fixtures: {
      "study.json": "{\"studyId\":\"delayed-source-process-replay\"}\n",
      "design-contract.json": `${JSON.stringify({ outputs: REQUIRED_OUTPUTS })}\n`,
    },
    eval: [],
    timeoutMs: 300_000,
    maxSteps: 20,
  }, null, 2)}\n`, "utf8")
  await writeFile(resolve(skillDir, "SKILL.md"), [
    "---",
    "name: delayed-source-process-replay",
    "description: Fixed delayed infrastructure replay skill",
    "---",
    "Read the public inputs, use tools, and create the declared outputs.",
    "",
  ].join("\n"), "utf8")
  return { cacheDir, taskPath: resolve(taskDir, "task.json"), skillPath: resolve(skillDir, "SKILL.md") }
}

export async function runDelayedSourceProcessReplay(options: {
  rootDir: string
  temporaryRoot: string
  bunExecutable: string
  nodeExecutable: string
  delayScale: 0 | 1
}): Promise<DelayedSourceProcessReplayReport> {
  if (options.delayScale !== 0 && options.delayScale !== 1) {
    throw new Error("delayScale must be exactly 0 or 1")
  }
  const rootDir = resolve(options.rootDir)
  const temporaryRoot = resolve(options.temporaryRoot)
  const bunExecutable = resolve(options.bunExecutable)
  const nodeExecutable = resolve(options.nodeExecutable)
  const helperPath = resolve(rootDir, "src/providers/openai-compatible-node-helper.mjs")
  const entrypoint = resolve(rootDir, "src/index.ts")
  const responder = startDelayedSourceProcessReplayResponder({ delayScale: options.delayScale })
  const rows: DelayedSourceProcessReplayReport["rows"] = []

  try {
    const inputs = await writeReplayInputs(temporaryRoot, responder.baseUrl)
    for (const system of ["no-skill", "original"] as const satisfies readonly ReplaySystem[]) {
      const id = system
      const runRoot = resolve(temporaryRoot, "runs", id)
      const workDir = resolve(runRoot, "workdir")
      const manifestPath = resolve(runRoot, "initial-workdir-manifest.json")
      await mkdir(runRoot, { recursive: true })
      const token = `${TOKEN_PREFIX}${system.replaceAll("-", "_").toUpperCase()}`
      const command = [
        bunExecutable,
        "run",
        entrypoint,
        "run",
        `--task=${inputs.taskPath}`,
        `--model=${ROUTE_MODEL}`,
        "--adapter=bare-agent",
        `--workdir=${workDir}`,
        `--initial-workdir-manifest=${manifestPath}`,
        "--timeout-ms=300000",
        "--max-steps=20",
        ...(system === "original"
          ? [`--skill=${inputs.skillPath}`, "--skill-mode=inject"]
          : []),
      ]
      const env = {
        ...process.env,
        HOME: process.env.HOME ?? process.env.USERPROFILE ?? temporaryRoot,
        PATH: executableSearchPath(nodeExecutable, process.env),
        SKVM_CACHE: inputs.cacheDir,
        SKVM_AUTO_PROBE: "0",
        SKVM_DELAYED_REPLAY_API_KEY: token,
        SKVM_OPENAI_HTTP_NODE: nodeExecutable,
        SKVM_OPENAI_HTTP_HELPER: helperPath,
      }
      const started = performance.now()
      const proc = Bun.spawn(command, { cwd: rootDir, env, stdout: "pipe", stderr: "pipe" })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
      }, 360_000)
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited.finally(() => clearTimeout(timer)),
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const durationMs = performance.now() - started
      const outputCount = await regularOutputCount(workDir)
      const responderAudit = responder.audit(token)
      const streamText = `${stdout}\n${stderr}`.toLowerCase()
      const bunCrash = streamText.includes("panic(main thread): internal assertion failure")
        || streamText.includes("bun has crashed")
      const adapterNonOk = /runstatus:\s*(adapter-crashed|timeout)/i.test(stdout)
      const failureCode: z.infer<typeof FailureCodeSchema> = timedOut
        ? "timeout"
        : bunCrash
          ? "bun-internal-assertion"
          : exitCode !== 0
            ? "nonzero-exit"
            : adapterNonOk
              ? "adapter-non-ok"
              : !responderAudit.protocolPassed
                ? "responder-protocol"
                : outputCount !== REQUIRED_OUTPUTS.length
                  ? "output-incomplete"
                  : "none"
      rows.push(RowSchema.parse({
        id,
        system,
        exitCode,
        timedOut,
        failureCode,
        durationMs,
        stdout: streamSummary(stdout),
        stderr: streamSummary(stderr),
        responder: {
          requests: responderAudit.requests,
          phases: responderAudit.phases,
          toolCalls: responderAudit.toolCalls,
          maximumToolFanOut: responderAudit.maximumToolFanOut,
          configuredDelayMs: responderAudit.configuredDelayMs,
          protocolPassed: responderAudit.protocolPassed,
        },
        outputs: { declared: 3, present: outputCount },
      }))
    }
  } finally {
    responder.stop()
  }

  const counts = {
    expectedRows: 2 as const,
    observedRows: rows.length,
    exitZero: rows.filter((row) => row.exitCode === 0).length,
    outputsComplete: rows.filter((row) => row.outputs.present === 3).length,
    protocolComplete: rows.filter((row) => row.responder.protocolPassed).length,
    timeouts: rows.filter((row) => row.timedOut).length,
    bunCrashes: rows.filter((row) => row.failureCode === "bun-internal-assertion").length,
    nonzeroExits: rows.filter((row) => row.exitCode !== 0).length,
  }
  const runtimePassed = rows.length === 2
    && counts.exitZero === 2
    && counts.outputsComplete === 2
    && counts.protocolComplete === 2
    && counts.timeouts === 0
    && counts.bunCrashes === 0
    && counts.nonzeroExits === 0
    && rows.every((row) => row.failureCode === "none")
  const configuredProviderDelayMs = SCRIPTED_PHASES
    .reduce((sum, phase) => sum + phase.delayMs, 0) * options.delayScale
  const responseCountCovered = rows.every((row) => row.responder.requests >= 16)
  const toolCallCountCovered = rows.every((row) => row.responder.toolCalls >= 23)
  const toolFanOutCovered = rows.every((row) => row.responder.maximumToolFanOut >= 6)
  const configuredDelayCovered = configuredProviderDelayMs >= DELAYED_REPLAY_SHAPE.minimumEnvelopeDurationMs
  const wallClockCovered = rows.length === 2
    && rows.every((row) => row.durationMs >= DELAYED_REPLAY_SHAPE.minimumEnvelopeDurationMs)
  const successfulEnvelopeCovered = responseCountCovered && toolCallCountCovered && toolFanOutCovered
    && configuredDelayCovered && wallClockCovered

  return DelayedSourceProcessReplayReportSchema.parse({
    schemaVersion: "skill-ir-delayed-source-process-replay-report/v1",
    diagnosticId: "experimental-design-v2-delayed-source-process-replay-2026-07-29",
    methodEvidence: false,
    runtimePassed,
    passed: runtimePassed && successfulEnvelopeCovered,
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      bunVersion: await bunVersion(bunExecutable),
      bunExecutableSha256: await sha256File(bunExecutable),
      nodeExecutableSha256: await sha256File(nodeExecutable),
    },
    shape: {
      systems: ["no-skill", "original"],
      expectedRows: 2,
      responsesPerRow: 16,
      toolCallsPerRow: 23,
      maximumToolFanOut: 6,
      configuredProviderDelayMs,
      minimumEnvelopeDurationMs: 220_124,
    },
    counts,
    rows,
    coverage: {
      responseCountCovered,
      toolCallCountCovered,
      toolFanOutCovered,
      configuredDelayCovered,
      wallClockCovered,
      successfulEnvelopeCovered,
    },
    evidence: await evidenceRefs(rootDir),
    claimBoundary: {
      infrastructureDiagnosticOnly: true,
      deterministicSuccessfulEnvelopeOnly: true,
      historicalCrashTrajectoryObservable: false,
      crashCausalityEstablished: false,
      benchmarkEvidence: false,
      skillOptimizationEvidence: false,
      modelCapabilityEvidence: false,
      tokenEvidence: false,
      paidRerunAllowed: false,
    },
  })
}

export async function verifyDelayedSourceProcessReplayReport(
  rootDir: string,
  value: unknown,
  runtime?: { bunExecutable: string; nodeExecutable: string },
): Promise<void> {
  const report = DelayedSourceProcessReplayReportSchema.parse(value)
  for (const ref of report.evidence) {
    const path = containedPath(rootDir, resolve(rootDir, ref.path))
    if (await sha256File(path) !== ref.sha256) {
      throw new Error(`Delayed source-process replay digest mismatch: ${ref.path}`)
    }
  }
  if (runtime) {
    if (await sha256File(resolve(runtime.bunExecutable)) !== report.runtime.bunExecutableSha256) {
      throw new Error("Delayed replay Bun executable digest mismatch")
    }
    if (await sha256File(resolve(runtime.nodeExecutable)) !== report.runtime.nodeExecutableSha256) {
      throw new Error("Delayed replay Node executable digest mismatch")
    }
  }
}
