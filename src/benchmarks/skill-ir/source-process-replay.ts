import { z } from "zod"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { mkdir, stat, writeFile } from "node:fs/promises"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const REPLAY_ROUTE_MODEL = "replay/source-process"
const REPLAY_BACKEND_MODEL = "source-process"
const REPLAY_TOKEN_PREFIX = "TEST_ONLY_SOURCE_REPLAY_"
const REQUIRED_OUTPUTS = [
  "design/design-plan.json",
  "design/allocation.csv",
  "design/design-report.md",
] as const
const SOURCE_EVIDENCE_PATHS = [
  "src/index.ts",
  "src/cli/run.ts",
  "src/run/index.ts",
  "src/adapters/bare-agent.ts",
  "src/core/agent-loop.ts",
  "src/core/agent-tools.ts",
  "src/providers/openai-compatible.ts",
  "src/providers/openai-compatible-transport.ts",
  "src/providers/openai-compatible-node-helper.mjs",
  "src/benchmarks/skill-ir/source-process-replay.ts",
] as const

const ReplaySystemSchema = z.enum(["no-skill", "original"])
const StreamSummarySchema = z.object({
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()
const ReplayFailureCodeSchema = z.enum([
  "none",
  "timeout",
  "bun-internal-assertion",
  "nonzero-exit",
  "adapter-non-ok",
  "responder-protocol",
  "output-incomplete",
])
const EvidenceRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()
const SystemSummarySchema = z.object({
  rows: z.number().int().nonnegative(),
  exitZero: z.number().int().nonnegative(),
  outputsComplete: z.number().int().nonnegative(),
  protocolComplete: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  medianDurationMs: z.number().nonnegative(),
}).strict()

const ReplayRowSchema = z.object({
  id: z.string().min(1),
  system: ReplaySystemSchema,
  repetition: z.number().int().positive(),
  exitCode: z.number().int(),
  timedOut: z.boolean(),
  failureCode: ReplayFailureCodeSchema,
  durationMs: z.number().nonnegative(),
  stdout: StreamSummarySchema,
  stderr: StreamSummarySchema,
  responder: z.object({
    requests: z.number().int().nonnegative(),
    phases: z.number().int().nonnegative(),
    protocolPassed: z.boolean(),
  }).strict(),
  outputs: z.object({
    declared: z.literal(3),
    present: z.number().int().min(0).max(3),
  }).strict(),
}).strict()

export const SourceProcessReplayReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-source-process-replay-report/v1"),
  diagnosticId: z.string().min(1),
  methodEvidence: z.literal(false),
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
    repetitionsPerSystem: z.number().int().positive(),
    expectedRows: z.number().int().positive(),
    responsesPerRow: z.literal(5),
    requiredOutputs: z.literal(3),
  }).strict(),
  counts: z.object({
    expectedRows: z.number().int().positive(),
    observedRows: z.number().int().nonnegative(),
    exitZero: z.number().int().nonnegative(),
    outputsComplete: z.number().int().nonnegative(),
    protocolComplete: z.number().int().nonnegative(),
    timeouts: z.number().int().nonnegative(),
    bunCrashes: z.number().int().nonnegative(),
    nonzeroExits: z.number().int().nonnegative(),
  }).strict(),
  bySystem: z.object({
    "no-skill": SystemSummarySchema,
    original: SystemSummarySchema,
  }).strict(),
  rows: z.array(ReplayRowSchema),
  evidence: z.array(EvidenceRefSchema).min(1),
  claimBoundary: z.object({
    infrastructureDiagnosticOnly: z.literal(true),
    benchmarkEvidence: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    modelCapabilityEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
    paidRerunAllowed: z.literal(false),
  }).strict(),
}).strict()

export type SourceProcessReplayReport = z.infer<typeof SourceProcessReplayReportSchema>
type ReplaySystem = z.infer<typeof ReplaySystemSchema>

type ResponderFailureCode =
  | "none"
  | "authorization-contract"
  | "request-contract"
  | "model-contract"
  | "tool-contract"
  | "phase-contract"
  | "request-overflow"

type ResponderSession = {
  requests: number
  phases: string[]
  failureCode: ResponderFailureCode
}

type ScriptedPhase = {
  name: string
  previousToolCallIds: string[]
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
  finalText?: string
}

const SCRIPTED_PHASES: ScriptedPhase[] = [
  {
    name: "read-inputs",
    previousToolCallIds: [],
    toolCalls: [
      { id: "read-study", name: "read_file", arguments: { path: "study.json" } },
      { id: "read-contract", name: "read_file", arguments: { path: "design-contract.json" } },
    ],
  },
  {
    name: "shell-stress",
    previousToolCallIds: ["read-study", "read-contract"],
    toolCalls: [1, 2, 3].map((index) => ({
      id: `shell-${index}`,
      name: "execute_command",
      arguments: { command: `node -e \"process.stdout.write('replay-shell-${index}')\"` },
    })),
  },
  {
    name: "write-outputs",
    previousToolCallIds: ["shell-1", "shell-2", "shell-3"],
    toolCalls: [
      {
        id: "write-plan",
        name: "write_file",
        arguments: { path: REQUIRED_OUTPUTS[0], content: "{\"replay\":true}\n" },
      },
      {
        id: "write-allocation",
        name: "write_file",
        arguments: { path: REQUIRED_OUTPUTS[1], content: "order,unit_id,stratum,arm\n" },
      },
      {
        id: "write-report",
        name: "write_file",
        arguments: { path: REQUIRED_OUTPUTS[2], content: "# Replay report\n" },
      },
    ],
  },
  {
    name: "read-outputs",
    previousToolCallIds: ["write-plan", "write-allocation", "write-report"],
    toolCalls: REQUIRED_OUTPUTS.map((path, index) => ({
      id: `read-output-${index + 1}`,
      name: "read_file",
      arguments: { path },
    })),
  },
  {
    name: "final",
    previousToolCallIds: ["read-output-1", "read-output-2", "read-output-3"],
    toolCalls: [],
    finalText: "Source-process replay completed.",
  },
]

function requestObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function failSession(session: ResponderSession, code: ResponderFailureCode): Response {
  if (session.failureCode === "none") session.failureCode = code
  return Response.json({ error: "source-process-replay-protocol" }, { status: 400 })
}

function hasPreviousToolResults(body: Record<string, unknown>, ids: string[]): boolean {
  if (ids.length === 0) return true
  if (!Array.isArray(body.messages)) return false
  const observed = new Set(body.messages.flatMap((message) => {
    const item = requestObject(message)
    return item?.role === "tool" && typeof item.tool_call_id === "string"
      ? [item.tool_call_id]
      : []
  }))
  return ids.every((id) => observed.has(id))
}

function hasRequiredTools(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.tools)) return false
  const names = new Set(body.tools.flatMap((tool) => {
    const item = requestObject(tool)
    const fn = requestObject(item?.function)
    return typeof fn?.name === "string" ? [fn.name] : []
  }))
  return ["read_file", "write_file", "execute_command"].every((name) => names.has(name))
}

export function startSourceProcessReplayResponder() {
  const sessions = new Map<string, ResponderSession>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const authorization = request.headers.get("authorization")
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : ""
      const session = sessions.get(token) ?? { requests: 0, phases: [], failureCode: "none" as const }
      sessions.set(token, session)
      session.requests++

      if (!token.startsWith(REPLAY_TOKEN_PREFIX)) {
        return failSession(session, "authorization-contract")
      }
      if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) {
        return failSession(session, "request-contract")
      }
      let body: Record<string, unknown> | undefined
      try {
        body = requestObject(await request.json())
      } catch {
        return failSession(session, "request-contract")
      }
      if (!body) return failSession(session, "request-contract")
      if (body.model !== REPLAY_BACKEND_MODEL) return failSession(session, "model-contract")
      if (!hasRequiredTools(body)) return failSession(session, "tool-contract")

      const phase = SCRIPTED_PHASES[session.requests - 1]
      if (!phase) return failSession(session, "request-overflow")
      if (!hasPreviousToolResults(body, phase.previousToolCallIds)) {
        return failSession(session, "phase-contract")
      }
      session.phases.push(phase.name)

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
        id: `replay-${session.requests}`,
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
      const session = sessions.get(token) ?? { requests: 0, phases: [], failureCode: "none" as const }
      return {
        requests: session.requests,
        phases: session.phases.length,
        protocolPassed: session.failureCode === "none"
          && session.requests === SCRIPTED_PHASES.length
          && session.phases.length === SCRIPTED_PHASES.length,
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
  throw new Error(`Replay evidence path escapes root: ${path}`)
}

async function evidenceRefs(rootDir: string) {
  return Promise.all(SOURCE_EVIDENCE_PATHS.map(async (path) => ({
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
      // Missing output is counted in the compact row.
    }
  }
  return present
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function summarizeSystem(rows: SourceProcessReplayReport["rows"], system: ReplaySystem) {
  const selected = rows.filter((row) => row.system === system)
  return {
    rows: selected.length,
    exitZero: selected.filter((row) => row.exitCode === 0).length,
    outputsComplete: selected.filter((row) => row.outputs.present === 3).length,
    protocolComplete: selected.filter((row) => row.responder.protocolPassed).length,
    failures: selected.filter((row) => row.failureCode !== "none").length,
    medianDurationMs: median(selected.map((row) => row.durationMs)),
  }
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
    throw new Error("Source-process replay Bun executable is unavailable")
  }
  return stdout.trim()
}

async function writeReplayInputs(root: string, baseUrl: string) {
  const cacheDir = resolve(root, "cache")
  const taskDir = resolve(root, "task")
  const skillDir = resolve(root, "skill")
  await Promise.all([mkdir(cacheDir, { recursive: true }), mkdir(taskDir, { recursive: true }), mkdir(skillDir, { recursive: true })])
  await writeFile(resolve(cacheDir, "skvm.config.json"), `${JSON.stringify({
    providers: { routes: [{
      match: "replay/*",
      kind: "openai-compatible",
      apiKeyEnv: "SKVM_REPLAY_API_KEY",
      baseUrl,
    }] },
  }, null, 2)}\n`, "utf8")
  await writeFile(resolve(taskDir, "task.json"), `${JSON.stringify({
    id: "source-process-replay",
    name: "Source process replay",
    category: "skill-ir-infrastructure",
    gradingType: "automated",
    prompt: "Run the public replay task and produce the three declared outputs.",
    fixtures: {
      "study.json": "{\"studyId\":\"source-process-replay\"}\n",
      "design-contract.json": `${JSON.stringify({ outputs: REQUIRED_OUTPUTS })}\n`,
    },
    eval: [],
    timeoutMs: 30_000,
    maxSteps: 10,
  }, null, 2)}\n`, "utf8")
  await writeFile(resolve(skillDir, "SKILL.md"), [
    "---",
    "name: source-process-replay",
    "description: Fixed infrastructure replay skill",
    "---",
    "Read the public inputs, use tools, and create the declared outputs.",
    "",
  ].join("\n"), "utf8")
  return { cacheDir, taskPath: resolve(taskDir, "task.json"), skillPath: resolve(skillDir, "SKILL.md") }
}

export async function runSourceProcessReplay(opts: {
  rootDir: string
  temporaryRoot: string
  bunExecutable: string
  nodeExecutable: string
  repetitionsPerSystem: number
}): Promise<SourceProcessReplayReport> {
  if (!Number.isInteger(opts.repetitionsPerSystem) || opts.repetitionsPerSystem < 1) {
    throw new Error("repetitionsPerSystem must be a positive integer")
  }
  const rootDir = resolve(opts.rootDir)
  const temporaryRoot = resolve(opts.temporaryRoot)
  const bunExecutable = resolve(opts.bunExecutable)
  const nodeExecutable = resolve(opts.nodeExecutable)
  const helperPath = resolve(rootDir, "src/providers/openai-compatible-node-helper.mjs")
  const entrypoint = resolve(rootDir, "src/index.ts")
  const responder = startSourceProcessReplayResponder()
  const rows: SourceProcessReplayReport["rows"] = []

  try {
    const inputs = await writeReplayInputs(temporaryRoot, responder.baseUrl)
    for (const system of ["no-skill", "original"] as const satisfies readonly ReplaySystem[]) {
      for (let repetition = 1; repetition <= opts.repetitionsPerSystem; repetition++) {
        const id = `${system}-${String(repetition).padStart(2, "0")}`
        const runRoot = resolve(temporaryRoot, "runs", id)
        const workDir = resolve(runRoot, "workdir")
        const manifestPath = resolve(runRoot, "initial-workdir-manifest.json")
        await mkdir(runRoot, { recursive: true })
        const token = `${REPLAY_TOKEN_PREFIX}${system.replaceAll("-", "_").toUpperCase()}_${repetition}`
        const command = [
          bunExecutable,
          "run",
          entrypoint,
          "run",
          `--task=${inputs.taskPath}`,
          `--model=${REPLAY_ROUTE_MODEL}`,
          "--adapter=bare-agent",
          `--workdir=${workDir}`,
          `--initial-workdir-manifest=${manifestPath}`,
          "--timeout-ms=30000",
          "--max-steps=10",
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
          SKVM_REPLAY_API_KEY: token,
          SKVM_OPENAI_HTTP_NODE: nodeExecutable,
          SKVM_OPENAI_HTTP_HELPER: helperPath,
        }
        const started = performance.now()
        const proc = Bun.spawn(command, {
          cwd: rootDir,
          env,
          stdout: "pipe",
          stderr: "pipe",
        })
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          proc.kill()
        }, 45_000)
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
        const failureCode: z.infer<typeof ReplayFailureCodeSchema> = timedOut
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
        rows.push({
          id,
          system,
          repetition,
          exitCode,
          timedOut,
          failureCode,
          durationMs,
          stdout: streamSummary(stdout),
          stderr: streamSummary(stderr),
          responder: {
            requests: responderAudit.requests,
            phases: responderAudit.phases,
            protocolPassed: responderAudit.protocolPassed,
          },
          outputs: { declared: 3, present: outputCount },
        })
      }
    }
  } finally {
    responder.stop()
  }

  const expectedRows = opts.repetitionsPerSystem * 2
  const counts = {
    expectedRows,
    observedRows: rows.length,
    exitZero: rows.filter((row) => row.exitCode === 0).length,
    outputsComplete: rows.filter((row) => row.outputs.present === 3).length,
    protocolComplete: rows.filter((row) => row.responder.protocolPassed).length,
    timeouts: rows.filter((row) => row.timedOut).length,
    bunCrashes: rows.filter((row) => row.failureCode === "bun-internal-assertion").length,
    nonzeroExits: rows.filter((row) => row.exitCode !== 0).length,
  }
  const passed = rows.length === expectedRows
    && counts.exitZero === expectedRows
    && counts.outputsComplete === expectedRows
    && counts.protocolComplete === expectedRows
    && counts.timeouts === 0
    && counts.bunCrashes === 0
    && counts.nonzeroExits === 0
    && rows.every((row) => row.failureCode === "none")
  return SourceProcessReplayReportSchema.parse({
    schemaVersion: "skill-ir-source-process-replay-report/v1",
    diagnosticId: "experimental-design-v2-source-process-replay-2026-07-29",
    methodEvidence: false,
    passed,
    runtime: {
      platform: process.platform,
      architecture: process.arch,
      bunVersion: await bunVersion(bunExecutable),
      bunExecutableSha256: await sha256File(bunExecutable),
      nodeExecutableSha256: await sha256File(nodeExecutable),
    },
    shape: {
      systems: ["no-skill", "original"],
      repetitionsPerSystem: opts.repetitionsPerSystem,
      expectedRows,
      responsesPerRow: 5,
      requiredOutputs: 3,
    },
    counts,
    bySystem: {
      "no-skill": summarizeSystem(rows, "no-skill"),
      original: summarizeSystem(rows, "original"),
    },
    rows,
    evidence: await evidenceRefs(rootDir),
    claimBoundary: {
      infrastructureDiagnosticOnly: true,
      benchmarkEvidence: false,
      skillOptimizationEvidence: false,
      modelCapabilityEvidence: false,
      tokenEvidence: false,
      paidRerunAllowed: false,
    },
  })
}

export async function verifySourceProcessReplayReport(
  rootDir: string,
  value: unknown,
  runtime?: { bunExecutable: string; nodeExecutable: string },
): Promise<void> {
  const report = SourceProcessReplayReportSchema.parse(value)
  for (const ref of report.evidence) {
    const path = containedPath(rootDir, resolve(rootDir, ref.path))
    if (await sha256File(path) !== ref.sha256) {
      throw new Error(`Source-process replay digest mismatch: ${ref.path}`)
    }
  }
  if (runtime) {
    if (await sha256File(resolve(runtime.bunExecutable)) !== report.runtime.bunExecutableSha256) {
      throw new Error("Source-process replay Bun executable digest mismatch")
    }
    if (await sha256File(resolve(runtime.nodeExecutable)) !== report.runtime.nodeExecutableSha256) {
      throw new Error("Source-process replay Node executable digest mismatch")
    }
  }
}
