import type { AgentAdapter, AdapterConfig, RunResult } from "../core/types.ts"
import { emptyTokenUsage } from "../core/types.ts"
import { createNativeInquiryRuntime } from "../benchmarks/authorization-dsl/inquiry-native.ts"
import { parseInquiryStrategy, isPropertyDirectedInquiryStrategy, type InquiryStrategy } from "../task-dsl/authorization/control-slice.ts"
import { createInquiryContextEncoder, INCREMENTAL_INQUIRY_CONTEXT_GUIDE } from "../benchmarks/authorization-dsl/inquiry-context.ts"
import { parseNativeInquiryMethod } from "../task-dsl/authorization/operation-program.ts"
import { runCodexAccountSession, redactCodexEvent, loadCodexAccountBoundary, type AccountTransport } from "./codex-account-session.ts"
import type { InquiryReuseInfo, InquiryReuseSeed } from "../benchmarks/authorization-dsl/inquiry-reuse.ts"

export interface AccountInquiryOptions {
  inputFile: string; workDir: string; model: string; method?: "M" | "D0" | "D1"; strategy?: InquiryStrategy; skillContent?: string
  domainTools?: boolean; maxToolCalls?: number; maxDisplayBytes?: number; maxReadBytes?: number; timeoutMs?: number; traceDir?: string
  reuse?: { info: InquiryReuseInfo; seed: InquiryReuseSeed }; transportFactory?: () => AccountTransport
  accountBoundaryFile?: string
}
/** Both account entrances execute the existing native domain core. The official
 * CLI controls generation and history; no provider adapter or second agent loop. */
export async function runCodexAccountInquiry(options: AccountInquiryOptions) {
  if (options.method === "D0") throw new Error("codex-account-method-D0-unsupported: account runtime supports M or D1; it cannot substitute a different method")
  const instructionSources = await loadCodexAccountBoundary(options.accountBoundaryFile)
  const runtime = await createNativeInquiryRuntime({ ...options, method: options.method, domainTools: options.domainTools ?? true, traceRedactor: redactCodexEvent })
  const encode = isPropertyDirectedInquiryStrategy(options.strategy) ? createInquiryContextEncoder() : undefined
  const contextPayloads: Array<{ sequence: number; references: number; originalBytes: number; sentBytes: number }> = []
  const contextView = async (automatic = true) => {
    const context = await runtime.accountContext(automatic)
    if (!encode) return context
    const { context: encoded, ...metrics } = encode(context); contextPayloads.push(metrics); return encoded
  }
  const respond = async (result: Awaited<ReturnType<typeof runtime.execute>>, automatic = true) => {
    const output = JSON.stringify({ toolResult: JSON.parse(result.output), currentContext: await contextView(automatic) })
    runtime.accountSent(output); return { ...result, output }
  }
  let account: Awaited<ReturnType<typeof runCodexAccountSession>>
  try {
    const context = await contextView(), prompt = `Current original task and full skill are declared in the system.\nCurrent local explanation context: ${JSON.stringify(context)}`
    runtime.accountSent(prompt)
    account = await runCodexAccountSession({ model: options.model, effort: "high", cwd: options.workDir, system: `${options.skillContent ?? ""}\n${runtime.system}${encode ? "\n" + INCREMENTAL_INQUIRY_CONTEXT_GUIDE : ""}`, prompt, tools: runtime.definitions, maxToolCalls: options.maxToolCalls, timeoutMs: options.timeoutMs, transportFactory: options.transportFactory, instructionSources,
      execute: async call => respond(await runtime.execute(call)),
      rejectArguments: async (call, diagnostics) => respond(await runtime.rejectArguments(call, diagnostics), false),
      onEvent: event => runtime.onEvent(event as any) })
  } finally { await runtime.close() }
  // Returned reports can be persisted by either entrance. Masking is applied to
  // that archive copy, never the live domain state; altered material hashes will
  // be rejected by normal restore validation instead of silently rebinding.
  const report = { ...runtime.report(), ...(encode ? { contextPayloads } : {}) }, native = redactCodexEvent(report) as typeof report
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
    const { account, native } = await runCodexAccountInquiry({ inputFile: p.authorizationScope as string, workDir: task.workDir, model: this.config.model, method: parseNativeInquiryMethod(p.authorizationMethod), strategy: parseInquiryStrategy(p.authorizationStrategy), domainTools: p.authorizationDomainTools === true, skillContent: task.skill?.content, maxToolCalls: numeric("authorizationMaxToolCalls"), maxDisplayBytes: numeric("authorizationMaxDisplayBytes"), maxReadBytes: numeric("authorizationMaxReadBytes"), timeoutMs: numeric("authorizationSessionTimeoutMs") ?? task.timeoutMs ?? this.config.timeoutMs, traceDir: typeof p.authorizationTraceDir === "string" ? p.authorizationTraceDir : undefined, accountBoundaryFile: typeof p.authorizationAccountBoundary === "string" ? p.authorizationAccountBoundary : undefined, transportFactory: this.transportFactory })
    const runStatus = account.status === "completed" ? "ok" : account.status === "timeout-unknown" ? "timeout" : account.status === "undelivered" ? "parse-failed" : "adapter-crashed"
    // Legacy RunResult requires numeric slots; availability=false prevents them
    // from becoming a zero-cost claim. Visible account tokens live in account.usage.
    return { text: account.text, steps: [], tokens: account.usage ?? emptyTokenUsage(), cost: 0, usageAvailable: false, durationMs: account.durationMs, llmDurationMs: 0, workDir: task.workDir, skillLoaded: !!task.skill, runStatus, statusDetail: account.reason ?? account.status, authorizationInquiry: { ...native, account }, ...(runStatus !== "ok" ? { adapterError: { exitCode: 1, stderr: account.reason ?? account.status } } : {}) }
  }
  async teardown() {}
}
