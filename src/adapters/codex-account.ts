import type { AgentAdapter, AdapterConfig, RunResult } from "../core/types.ts"
import { emptyTokenUsage } from "../core/types.ts"
import { createNativeInquiryRuntime } from "../benchmarks/authorization-dsl/inquiry-native.ts"
import { modelSourceDisplay } from "../benchmarks/authorization-dsl/inquiry-tools.ts"
import { parseInquiryStrategy, isPropertyDirectedInquiryStrategy, type InquiryStrategy } from "../task-dsl/authorization/control-slice.ts"
import { createInquiryContextEncoder, createInquiryTransmissionMeter, INCREMENTAL_INQUIRY_CONTEXT_GUIDE } from "../benchmarks/authorization-dsl/inquiry-context.ts"
import { parseNativeInquiryMethod } from "../task-dsl/authorization/operation-program.ts"
import { runCodexAccountSession, redactCodexEvent, loadCodexAccountBoundary, type AccountTransport } from "./codex-account-session.ts"
import type { InquiryReuseInfo, InquiryReuseSeed } from "../benchmarks/authorization-dsl/inquiry-reuse.ts"
import type { SourcePreparationOptions } from "../benchmarks/authorization-dsl/evidence-preparation/preparation.ts"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { decideProgramAuthorContinuation } from "../task-dsl/authorization/program-authoring-context.ts"
import { createProgramDelivery, decideFinalProgramDelivery, FINAL_PROGRAM_ANSWER_INSTRUCTION, type ProgramDeliveryPhase } from "../task-dsl/authorization/program-delivery.ts"
export { readCodexAccountThread } from "./codex-account-session.ts"

export interface AccountInquiryOptions {
  purpose?: string; attempt?: string
  authorResumeAfter?: import("./codex-account-session.ts").AccountSessionResult
  maxAuthorContinuations?: 0 | 1 | 2
  authoringTargetMode?: "current-input" | "reusable"; programContext?: import("../task-dsl/authorization/program-consumption-context.ts").ProgramContext; executionPolicy?: import("../task-dsl/authorization/executable-contract.ts").ExecutionPolicy; programMode?: import("../task-dsl/authorization/executable-contract.ts").ProgramMode
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
  if (options.authorResumeAfter && (options.programMode !== "edit" || !options.reuse)) throw new Error("account-author-resume-requires-own-restored-edit-state")
  if (options.method === "D0") throw new Error("codex-account-method-D0-unsupported: account runtime supports M or D1; it cannot substitute a different method")
  const instructionSources = await loadCodexAccountBoundary(options.accountBoundaryFile)
  const runtime = await createNativeInquiryRuntime({ ...options, method: options.method, domainTools: options.domainTools ?? true, traceRedactor: redactCodexEvent })
  const definitions = options.programMode === "consume" ? runtime.definitions.filter(t => !["authorization_program", "authorization_program_patch"].includes(t.name)) : runtime.definitions
  const directed = options.programContext === "directed"
  const encode = !directed && isPropertyDirectedInquiryStrategy(options.strategy) ? createInquiryContextEncoder() : undefined
  let packetEncode = directed ? createInquiryContextEncoder() : undefined
  const transmission = createInquiryTransmissionMeter()
  const contextPayloads: Array<{ sequence: number; references: number; originalBytes: number; sentBytes: number }> = []
  const contextView = async (automatic = true) => {
    const context = await runtime.accountContext(automatic)
    if (!encode) return context
    const { context: encoded, ...metrics } = encode(context); contextPayloads.push(metrics); return encoded
  }
  const respond = async (result: Awaited<ReturnType<typeof runtime.execute>>, automatic = true) => {
    const raw = { toolResult: JSON.parse(result.output), currentContext: await contextView(automatic) }
    const encoded = packetEncode?.(raw)
    if (encoded) { const { context: _context, ...metrics } = encoded; contextPayloads.push(metrics) }
    const payload = encoded?.context ?? raw, output = JSON.stringify(payload)
    transmission.record("tool-reply", payload, output)
    runtime.accountSent(output); return { ...result, output }
  }
  const finalContext = async () => {
    const context = await runtime.accountContext(false), report = runtime.report()
    const remaining = Math.max(0, (options.maxDisplayBytes ?? 262144) - report.sourceAccounting.cumulativeModelSourceBytes)
    const alreadyReadSource: typeof report.evidence = [], omittedSource: Array<{ path: string; startLine: number; endLine: number }> = []
    for (const evidence of [...report.evidence].reverse()) {
      const candidate = { ...context, alreadyReadSource: [...alreadyReadSource, evidence] }
      if (modelSourceDisplay(report.evidence, JSON.stringify(candidate), new Set()).bytes <= remaining) alreadyReadSource.push(evidence)
      else omittedSource.push({ path: evidence.path, startLine: evidence.startLine, endLine: evidence.endLine })
    }
    return { ...context, alreadyReadSource, ...(omittedSource.length ? { omittedSource, sourceBudgetNotice: "These previously read source windows cannot be retransmitted within the original display budget. Do not claim fresh verification of their text; retain precise uncertainty." } : {}) }
  }
  type Turn = Awaited<ReturnType<typeof runCodexAccountSession>>
  const turns: Turn[] = [], decisions: ReturnType<typeof decideProgramAuthorContinuation>[] = []
  const delivery = createProgramDelivery(), deliveryDecisions: ReturnType<typeof decideFinalProgramDelivery>[] = []
  let phase: ProgramDeliveryPhase = "task-answer", finalPhaseUsed = false
  let previousProgress: string | undefined, checkpoint = 0, identity: Record<string, unknown> = {}
  const purpose = options.purpose ?? path.basename(options.workDir), attempt = options.attempt ?? "first"
  const save = async (name: string, value: unknown) => { if (options.traceDir) await writeFile(path.join(options.traceDir, name), JSON.stringify(redactCodexEvent(value), null, 2) + "\n", { encoding: "utf8", flag: "wx" }) }
  const execute = async (call: Parameters<typeof runtime.execute>[0]) => {
    if (phase === "final-answer") return respond(await runtime.rejectArguments(call, [{ path: "$", keyword: "final-answer-phase", message: "Deliver the standalone task answer now; this final phase does not permit further tools.", expected: null }]), false)
    const output = await runtime.execute(call)
    if (["authorization_program", "authorization_program_patch"].includes(call.name)) {
      const domain = runtime.report().domain
      await save(`program-checkpoint-${++checkpoint}.json`, { schemaVersion: "authorization-program-checkpoint/v1", identity, call, output: JSON.parse(output.output), draft: domain?.programDraft, active: domain?.executableContract, instruction: "Raw draft data only; restored execution must be recomputed against current source and input." })
    }
    return respond(output)
  }
  try {
    const system = `${options.skillContent ?? ""}\n${runtime.system}${encode || packetEncode ? "\n" + INCREMENTAL_INQUIRY_CONTEXT_GUIDE : ""}`
    transmission.record("static-tools", definitions.map(t => ({ type: "function", name: t.name, description: t.description, inputSchema: t.inputSchema })), undefined, "schemaProtocol")
    transmission.recordSystem(system, options.skillContent ?? "")
    await save("account-purpose.json", { purpose, attempt, workDir: options.workDir, traceDir: options.traceDir, startedAt: new Date(started).toISOString(), timeoutMs, maxToolCalls: options.maxToolCalls })
    while (true) {
      const final = phase === "final-answer"
      if (final) packetEncode = directed ? createInquiryContextEncoder() : undefined
      const rawContext = final ? await finalContext() : await contextView(turns.length === 0)
      const context = !final && packetEncode ? packetEncode(rawContext).context : rawContext
      const prompt = `${phase === "final-answer" ? FINAL_PROGRAM_ANSWER_INSTRUCTION : turns.length ? `Author-edit phase: continue your own source authoring after the preserved task answer. Purpose: ${decisions.at(-1)!.reason}. Inspect and repair your current draft using actual grouped feedback; retain all original questions. Your end-of-turn text records editing progress; it does not replace the task answer. The remaining budget is shared with prior turns. Do not repeat unchanged proposals or invent missing external facts.` : "Task-answer phase: current original task and full skill are declared in the system. Complete source work and deliver every original question."}\nCurrent local explanation context: ${JSON.stringify(context)}`
      transmission.record("initial-context", context, prompt); runtime.accountSent(prompt)
      const prior = turns.at(-1) ?? options.authorResumeAfter
      const remaining = runtime.report().toolBudget.totalRemaining
      const remainingMs = timeoutMs - (Date.now() - started)
      const account = await runCodexAccountSession({ model: options.model, effort: "high", cwd: options.workDir, system, prompt, tools: final ? [] : definitions, maxToolCalls: final ? 0 : Math.max(1, remaining), timeoutMs: Math.max(1, remainingMs), transportFactory: options.transportFactory, instructionSources, purpose, attempt: final ? `${attempt}-final-child` : turns.length ? `${attempt}-continuation-${turns.length}` : attempt,
        ...(!final ? { shouldFinalize: () => { const b = runtime.report().toolBudget; return b.totalRemaining <= 0 || !!b.finalOnly }, finalizeAfterMs: Math.max(1, remainingMs - Math.min(120000, remainingMs / 2)) } : {}),
        ...(prior && !final ? { resumeAfter: { ...prior, tools: [...(options.authorResumeAfter?.tools ?? []), ...turns.flatMap(t => t.tools)], toolRejections: [...(options.authorResumeAfter?.toolRejections ?? []), ...turns.flatMap(t => t.toolRejections)] } } : {}),
        execute, argumentDiagnostics: runtime.argumentDiagnostics,
        rejectArguments: async (call, diagnostics) => respond(await runtime.rejectArguments(call, diagnostics), false),
        onEvent: async (event: any) => { identity = { purpose, attempt: event.identity?.attempt, threadId: event.params?.threadId ?? event.identity?.threadId, turnId: event.params?.turnId ?? event.params?.turn?.id ?? event.identity?.turnId }; await runtime.onEvent(event) } })
      if (final && account.lifecycle) { account.lifecycle.finalizesThreadId = prior?.lifecycle?.threadId; account.lifecycle.finalizesTurnId = prior?.lifecycle?.turnId }
      turns.push(account); await save(`account-turn-${turns.length}.json`, account)
      delivery.record({ sequence: turns.length, phase, answer: account.text, basis: runtime.deliveryBasis(), delivered: account.answerDelivery === "delivered" })
      await save(`delivery-turn-${turns.length}.json`, delivery.snapshot(runtime.deliveryBasis()))
      if (phase === "final-answer") break
      const currentContext = await runtime.accountContext(false), terminal = account.status === "completed" || account.status === "undelivered" ? account.terminalStatus : account.status
      const decision = decideProgramAuthorContinuation({ maxContinuations: options.maxAuthorContinuations, mode: options.programMode, terminal, continuations: turns.length - 1, remainingMs: timeoutMs - (Date.now() - started), context: currentContext, previousProgress })
      decisions.push(decision)
      if (!decision.continue) {
        const finalDecision = decideFinalProgramDelivery({ delivery: delivery.snapshot(runtime.deliveryBasis()), terminal, controlledToolPhaseClosed: account.lifecycle?.hostFinalization === "budget-reserve" && account.lifecycle.providerTerminalObserved && account.lifecycle.localExecution === "closed" && !account.quotaRefused && !account.terminalError, remainingMs: timeoutMs - (Date.now() - started), budget: (currentContext as any).toolBudget, finalPhaseUsed })
        deliveryDecisions.push(finalDecision)
        if (finalDecision.runFinal) { finalPhaseUsed = true; phase = "final-answer"; continue }
        break
      }
      phase = "author-edit"
      previousProgress = decision.progress
    }
  } finally { await runtime.close() }
  // Returned reports can be persisted by either entrance. Masking is applied to
  // that archive copy, never the live domain state; altered material hashes will
  // be rejected by normal restore validation instead of silently rebinding.
  const report = { ...runtime.report(), transmissionAccounting: transmission.report(), ...(encode || directed ? { contextPayloads } : {}) }, native = redactCodexEvent(report) as typeof report
  // A read/resume failure before dispatch cannot erase an already delivered
  // answer or turn it into an unknown inference. Its own attempt remains below.
  const last = [...turns].reverse().find(t => t.inferenceDispatched) ?? turns.at(-1)!
  const finalDelivery = delivery.snapshot(runtime.deliveryBasis())
  const usage = turns.every(t => t.usage) ? turns.reduce((sum, t) => ({ input: sum.input + t.usage!.input, output: sum.output + t.usage!.output, cacheRead: sum.cacheRead + t.usage!.cacheRead, cacheWrite: sum.cacheWrite + t.usage!.cacheWrite }), emptyTokenUsage()) : null
  const account = { ...last, text: typeof finalDelivery.answer === "string" ? finalDelivery.answer : last.text, rawLastText: last.text, firstAnswer: finalDelivery.firstAnswer, delivery: { ...finalDelivery, decisions: deliveryDecisions }, answerDelivery: finalDelivery.finalDelivered ? "delivered" as const : "undelivered" as const, usage, usageVisibility: usage ? "observed" as const : "unknown" as const, durationMs: Date.now() - started, inferenceDispatched: turns.some(t => t.inferenceDispatched), tools: turns.flatMap(t => t.tools), toolRejections: turns.flatMap(t => t.toolRejections), events: turns.flatMap(t => t.events), turns, authorContinuation: { decisions, stopReason: decisions.at(-1)?.reason, continuationFailure: turns.at(-1) !== last ? turns.at(-1)?.reason : undefined } }
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
    for (const [key, values] of Object.entries({ authorizationProgramMode: ["consume", "edit"], authorizationExecutionPolicy: ["strict", "progressive"], authorizationProgramContext: ["full", "compact", "directed"], authorizationAuthoringTarget: ["current-input", "reusable"] })) {
      const value = config.providerOptions[key]
      if (value !== undefined && !values.includes(value as string)) throw new Error(`${key} requires ${values.join(" or ")}`)
    }
    this.config = config
  }
  async run(task: Parameters<AgentAdapter["run"]>[0]): Promise<RunResult> {
    const p = this.config.providerOptions ?? {}, numeric = (key: string) => typeof p[key] === "number" ? p[key] as number : undefined
    const { account, native } = await runCodexAccountInquiry({ authoringTargetMode: p.authorizationAuthoringTarget as AccountInquiryOptions["authoringTargetMode"], programMode: p.authorizationProgramMode as AccountInquiryOptions["programMode"], executionPolicy: p.authorizationExecutionPolicy as AccountInquiryOptions["executionPolicy"], programContext: p.authorizationProgramContext as AccountInquiryOptions["programContext"], purpose: typeof p.authorizationPurpose === "string" ? p.authorizationPurpose : undefined, attempt: typeof p.authorizationAttempt === "string" ? p.authorizationAttempt : undefined, inputFile: p.authorizationScope as string, workDir: task.workDir, model: this.config.model, method: parseNativeInquiryMethod(p.authorizationMethod), strategy: parseInquiryStrategy(p.authorizationStrategy), domainTools: p.authorizationDomainTools === true, skillContent: task.skill?.content, maxToolCalls: numeric("authorizationMaxToolCalls"), maxDisplayBytes: numeric("authorizationMaxDisplayBytes"), maxReadBytes: numeric("authorizationMaxReadBytes"), timeoutMs: numeric("authorizationSessionTimeoutMs") ?? task.timeoutMs ?? this.config.timeoutMs, traceDir: typeof p.authorizationTraceDir === "string" ? p.authorizationTraceDir : undefined, domainProgramFile: typeof p.authorizationDomainProgram === "string" ? p.authorizationDomainProgram : undefined, accountBoundaryFile: typeof p.authorizationAccountBoundary === "string" ? p.authorizationAccountBoundary : undefined, transportFactory: this.transportFactory, preparation: p.authorizationPreparation as SourcePreparationOptions | undefined })
    const runStatus = account.status === "completed" ? "ok" : account.status === "timeout-unknown" ? "timeout" : account.status === "undelivered" ? "parse-failed" : "adapter-crashed"
    // Legacy RunResult requires numeric slots; availability=false prevents them
    // from becoming a zero-cost claim. Visible account tokens live in account.usage.
    return { text: account.text, steps: [], tokens: account.usage ?? emptyTokenUsage(), cost: 0, usageAvailable: false, durationMs: account.durationMs, llmDurationMs: 0, workDir: task.workDir, skillLoaded: !!task.skill, runStatus, statusDetail: account.reason ?? account.status, authorizationInquiry: { ...native, account }, ...(runStatus !== "ok" ? { adapterError: { exitCode: 1, stderr: account.reason ?? account.status } } : {}) }
  }
  async teardown() {}
}
