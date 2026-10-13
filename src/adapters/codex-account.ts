import type { AgentAdapter, AdapterConfig, RunResult } from "../core/types.ts"
import { emptyTokenUsage } from "../core/types.ts"
import { createNativeInquiryRuntime } from "../benchmarks/authorization-dsl/inquiry-native.ts"
import { parseInquiryStrategy, isPropertyDirectedInquiryStrategy, type InquiryStrategy } from "../task-dsl/authorization/control-slice.ts"
import { createInquiryContextEncoder, createInquiryTransmissionMeter, INCREMENTAL_INQUIRY_CONTEXT_GUIDE } from "../benchmarks/authorization-dsl/inquiry-context.ts"
import { parseNativeInquiryMethod } from "../task-dsl/authorization/operation-program.ts"
import { runCodexAccountSession, redactCodexEvent, loadCodexAccountBoundary, type AccountTransport } from "./codex-account-session.ts"
import type { InquiryReuseInfo, InquiryReuseSeed } from "../benchmarks/authorization-dsl/inquiry-reuse.ts"
import type { SourcePreparationOptions } from "../benchmarks/authorization-dsl/evidence-preparation/preparation.ts"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { decideProgramAuthorContinuation } from "../task-dsl/authorization/program-authoring-context.ts"
export { readCodexAccountThread } from "./codex-account-session.ts"

export interface AccountInquiryOptions {
  purpose?: string; attempt?: string
  programContext?: import("../task-dsl/authorization/program-consumption-context.ts").ProgramContext; executionPolicy?: import("../task-dsl/authorization/executable-contract.ts").ExecutionPolicy; programMode?: import("../task-dsl/authorization/executable-contract.ts").ProgramMode
  inputFile: string; workDir: string; model: string; method?: "M" | "D0" | "D1"; strategy?: InquiryStrategy; skillContent?: string
  domainTools?: boolean; maxToolCalls?: number; maxDisplayBytes?: number; maxReadBytes?: number; timeoutMs?: number; traceDir?: string
  reuse?: { info: InquiryReuseInfo; seed: InquiryReuseSeed }; transportFactory?: () => AccountTransport
  accountBoundaryFile?: string; domainProgramFile?: string
  preparation?: SourcePreparationOptions
}
/** Both account entrances execute the existing native domain core. The official
 * CLI controls generation and history; no provider adapter or second agent loop. */
export async function runCodexAccountInquiry(options: AccountInquiryOptions) {
  const started = Date.now(), timeoutMs = options.timeoutMs ?? 1200000
  if (options.method === "D0") throw new Error("codex-account-method-D0-unsupported: account runtime supports M or D1; it cannot substitute a different method")
  const instructionSources = await loadCodexAccountBoundary(options.accountBoundaryFile)
  const runtime = await createNativeInquiryRuntime({ ...options, method: options.method, domainTools: options.domainTools ?? true, traceRedactor: redactCodexEvent })
  const encode = isPropertyDirectedInquiryStrategy(options.strategy) ? createInquiryContextEncoder() : undefined
  const transmission = createInquiryTransmissionMeter()
  const contextPayloads: Array<{ sequence: number; references: number; originalBytes: number; sentBytes: number }> = []
  const contextView = async (automatic = true) => {
    const context = await runtime.accountContext(automatic)
    if (!encode) return context
    const { context: encoded, ...metrics } = encode(context); contextPayloads.push(metrics); return encoded
  }
  const respond = async (result: Awaited<ReturnType<typeof runtime.execute>>, automatic = true) => {
    const payload = { toolResult: JSON.parse(result.output), currentContext: await contextView(automatic) }, output = JSON.stringify(payload)
    transmission.record("tool-reply", payload, output)
    runtime.accountSent(output); return { ...result, output }
  }
  type Turn = Awaited<ReturnType<typeof runCodexAccountSession>>
  const turns: Turn[] = [], decisions: ReturnType<typeof decideProgramAuthorContinuation>[] = []
  let previousProgress: string | undefined, checkpoint = 0, identity: Record<string, unknown> = {}
  const purpose = options.purpose ?? path.basename(options.workDir), attempt = options.attempt ?? "first"
  const save = async (name: string, value: unknown) => { if (options.traceDir) await writeFile(path.join(options.traceDir, name), JSON.stringify(redactCodexEvent(value), null, 2) + "\n", { encoding: "utf8", flag: "wx" }) }
  const execute = async (call: Parameters<typeof runtime.execute>[0]) => {
    const output = await runtime.execute(call)
    if (["authorization_program", "authorization_program_patch"].includes(call.name)) {
      const domain = runtime.report().domain
      await save(`program-checkpoint-${++checkpoint}.json`, { schemaVersion: "authorization-program-checkpoint/v1", identity, call, output: JSON.parse(output.output), draft: domain?.programDraft, active: domain?.executableContract, instruction: "Raw draft data only; restored execution must be recomputed against current source and input." })
    }
    return respond(output)
  }
  try {
    const system = `${options.skillContent ?? ""}\n${runtime.system}${encode ? "\n" + INCREMENTAL_INQUIRY_CONTEXT_GUIDE : ""}`
    transmission.record("static-tools", runtime.definitions.map(t => ({ type: "function", name: t.name, description: t.description, inputSchema: t.inputSchema })), undefined, "schemaProtocol")
    transmission.recordSystem(system, options.skillContent ?? "")
    await save("account-purpose.json", { purpose, attempt, workDir: options.workDir, traceDir: options.traceDir, startedAt: new Date(started).toISOString(), timeoutMs, maxToolCalls: options.maxToolCalls })
    while (true) {
      const context = await contextView(turns.length === 0)
      const prompt = `${turns.length ? `Continue your own source authoring after the recorded completed answer. Purpose: ${decisions.at(-1)!.reason}. Inspect and repair your current draft using the actual grouped feedback; retain all original questions. The remaining budget below is shared with prior turns. Do not repeat unchanged proposals or invent missing external facts.` : "Current original task and full skill are declared in the system."}\nCurrent local explanation context: ${JSON.stringify(context)}`
      transmission.record("initial-context", context, prompt); runtime.accountSent(prompt)
      const prior = turns.at(-1)
      const remaining = runtime.report().toolBudget.totalRemaining
      const account = await runCodexAccountSession({ model: options.model, effort: "high", cwd: options.workDir, system, prompt, tools: runtime.definitions, maxToolCalls: Math.max(1, remaining), timeoutMs: Math.max(1, timeoutMs - (Date.now() - started)), transportFactory: options.transportFactory, instructionSources, purpose, attempt: turns.length ? `${attempt}-continuation-${turns.length}` : attempt,
        ...(prior ? { resumeAfter: { ...prior, tools: turns.flatMap(t => t.tools), toolRejections: turns.flatMap(t => t.toolRejections) } } : {}),
        execute, argumentDiagnostics: runtime.argumentDiagnostics,
        rejectArguments: async (call, diagnostics) => respond(await runtime.rejectArguments(call, diagnostics), false),
        onEvent: async (event: any) => { identity = { purpose, attempt: event.identity?.attempt, threadId: event.params?.threadId ?? event.identity?.threadId, turnId: event.params?.turnId ?? event.params?.turn?.id ?? event.identity?.turnId }; await runtime.onEvent(event) } })
      turns.push(account); await save(`account-turn-${turns.length}.json`, account)
      const decision = decideProgramAuthorContinuation({ mode: options.programMode, terminal: account.status === "completed" || account.status === "undelivered" ? account.terminalStatus : account.status, continuations: turns.length - 1, remainingMs: timeoutMs - (Date.now() - started), context: await runtime.accountContext(false), previousProgress })
      decisions.push(decision)
      if (!decision.continue) break
      previousProgress = decision.progress
    }
  } finally { await runtime.close() }
  // Returned reports can be persisted by either entrance. Masking is applied to
  // that archive copy, never the live domain state; altered material hashes will
  // be rejected by normal restore validation instead of silently rebinding.
  const report = { ...runtime.report(), transmissionAccounting: transmission.report(), ...(encode ? { contextPayloads } : {}) }, native = redactCodexEvent(report) as typeof report
  // A read/resume failure before dispatch cannot erase an already delivered
  // answer or turn it into an unknown inference. Its own attempt remains below.
  const last = [...turns].reverse().find(t => t.inferenceDispatched) ?? turns.at(-1)!
  const usage = turns.every(t => t.usage) ? turns.reduce((sum, t) => ({ input: sum.input + t.usage!.input, output: sum.output + t.usage!.output, cacheRead: sum.cacheRead + t.usage!.cacheRead, cacheWrite: sum.cacheWrite + t.usage!.cacheWrite }), emptyTokenUsage()) : null
  const account = { ...last, usage, usageVisibility: usage ? "observed" as const : "unknown" as const, durationMs: Date.now() - started, inferenceDispatched: turns.some(t => t.inferenceDispatched), tools: turns.flatMap(t => t.tools), toolRejections: turns.flatMap(t => t.toolRejections), events: turns.flatMap(t => t.events), turns, authorContinuation: { decisions, stopReason: decisions.at(-1)?.reason, continuationFailure: turns.at(-1) !== last ? turns.at(-1)?.reason : undefined } }
  return { account, native, ...(options.reuse ? { reuse: { ...options.reuse.info, materialsUsed: new Set(native.domain?.materialUses?.map(u => u.materialId)).size } } : {}) }
}

export class CodexAccountAdapter implements AgentAdapter {
  readonly name = "codex-account"
  private config!: AdapterConfig
  constructor(private transportFactory?: () => AccountTransport) {}
  async setup(config: AdapterConfig) {
    if (config.apiKey || config.extraCliArgs?.length) throw new Error("codex-account uses official CLI login; external credentials/CLI overrides are unsupported")
    if (!config.providerOptions?.authorizationScope) throw new Error("codex-account requires an explicit bounded source scope")
    const unsupported = ["authorizationMaxProviderCalls", "authorizationMaxOutputTokens", "authorizationRequestTimeoutMs"].filter(key => config.providerOptions?.[key] !== undefined)
    if (unsupported.length || config.providerOptions.authorizationReadonlyRecovery === true) throw new Error(`account-provider-limit-unobservable: provider limits/recovery are unsupported by this account protocol (${unsupported.join(",")}); use host tool/read/display/session limits`)
    parseInquiryStrategy(config.providerOptions.authorizationStrategy)
    if (config.providerOptions.authorizationMethod === "D0") throw new Error("codex-account-method-D0-unsupported: use M or D1")
    parseNativeInquiryMethod(config.providerOptions.authorizationMethod)
    this.config = config
  }
  async run(task: Parameters<AgentAdapter["run"]>[0]): Promise<RunResult> {
    const p = this.config.providerOptions ?? {}, numeric = (key: string) => typeof p[key] === "number" ? p[key] as number : undefined
    const { account, native } = await runCodexAccountInquiry({ purpose: typeof p.authorizationPurpose === "string" ? p.authorizationPurpose : undefined, attempt: typeof p.authorizationAttempt === "string" ? p.authorizationAttempt : undefined, inputFile: p.authorizationScope as string, workDir: task.workDir, model: this.config.model, method: parseNativeInquiryMethod(p.authorizationMethod), strategy: parseInquiryStrategy(p.authorizationStrategy), domainTools: p.authorizationDomainTools === true, skillContent: task.skill?.content, maxToolCalls: numeric("authorizationMaxToolCalls"), maxDisplayBytes: numeric("authorizationMaxDisplayBytes"), maxReadBytes: numeric("authorizationMaxReadBytes"), timeoutMs: numeric("authorizationSessionTimeoutMs") ?? task.timeoutMs ?? this.config.timeoutMs, traceDir: typeof p.authorizationTraceDir === "string" ? p.authorizationTraceDir : undefined, domainProgramFile: typeof p.authorizationDomainProgram === "string" ? p.authorizationDomainProgram : undefined, accountBoundaryFile: typeof p.authorizationAccountBoundary === "string" ? p.authorizationAccountBoundary : undefined, transportFactory: this.transportFactory, preparation: p.authorizationPreparation as SourcePreparationOptions | undefined })
    const runStatus = account.status === "completed" ? "ok" : account.status === "timeout-unknown" ? "timeout" : account.status === "undelivered" ? "parse-failed" : "adapter-crashed"
    // Legacy RunResult requires numeric slots; availability=false prevents them
    // from becoming a zero-cost claim. Visible account tokens live in account.usage.
    return { text: account.text, steps: [], tokens: account.usage ?? emptyTokenUsage(), cost: 0, usageAvailable: false, durationMs: account.durationMs, llmDurationMs: 0, workDir: task.workDir, skillLoaded: !!task.skill, runStatus, statusDetail: account.reason ?? account.status, authorizationInquiry: { ...native, account }, ...(runStatus !== "ok" ? { adapterError: { exitCode: 1, stderr: account.reason ?? account.status } } : {}) }
  }
  async teardown() {}
}
