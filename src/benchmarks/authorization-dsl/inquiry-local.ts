import { z } from "zod"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { readFile, writeFile, appendFile, mkdir, stat } from "node:fs/promises"
import { AuthorizationInquirySchema, InquiryText, InquiryPolicySchema } from "../../task-dsl/authorization/inquiry.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { runAuthorizationInquiry, type InquiryMethod, type RunAuthorizationInquiryOptions } from "./inquiry-run.ts"
import type { LocalAuthorizationCliDependencies } from "./local-run.ts"
import { parseInquiryStrategy, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"

export const AuthorizationInquiryInputSchema = z.object({
  schemaVersion: z.literal("authorization-inquiry-input/v1"), taskId: InquiryText, repository: InquiryText, sourceRef: InquiryText,
  sourceRoot: InquiryText.refine(p => !path.isAbsolute(p) && !path.win32.isAbsolute(p) && !p.includes("\0"), "Use a relative sourceRoot"),
  allowedPaths: z.array(InquiryText).min(1), inquiry: AuthorizationInquirySchema.optional(), brief: InquiryText.optional(),
  mode: z.enum(["behavior", "conformance"]).optional(), policy: InquiryPolicySchema.optional(),
}).strict().superRefine((v, c) => {
  if (!!v.inquiry === !!v.brief) c.addIssue({ code: z.ZodIssueCode.custom, path: ["brief"], message: "Provide either complete inquiry or a natural brief" })
  if (v.inquiry && (v.mode || v.policy)) c.addIssue({ code: z.ZodIssueCode.custom, path: ["inquiry"], message: "Complete inquiry owns its mode/policy; do not duplicate them" })
  if (v.brief && v.mode === "conformance" && !v.policy) c.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "policy-required: conformance needs independently supplied policy" })
  if (v.brief && (v.mode ?? "behavior") === "behavior" && v.policy) c.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "Behavior does not compare normative policy" })
})
export type AuthorizationInquiryInput = z.infer<typeof AuthorizationInquiryInputSchema>
const sha = (value: string) => createHash("sha256").update(value).digest("hex")
export async function loadInquiryInput(inputFile: string) {
  const inputPath = path.resolve(inputFile), original = await readFile(inputPath, "utf8"), value = AuthorizationInquiryInputSchema.parse(JSON.parse(original))
  const context = { repository: value.repository, sourceRef: value.sourceRef, sourceRoot: path.resolve(path.dirname(inputPath), value.sourceRoot), allowedPaths: value.allowedPaths }
  return { value, inputPath, original, inputSha256: sha(original), context }
}
export async function checkAuthorizationInquiry(inputFile: string, method: InquiryMethod = "D1", requestedStrategy: InquiryStrategy = "legacy") {
  try {
    const strategy = parseInquiryStrategy(requestedStrategy)
    if (!["M", "D0", "D1"].includes(method)) throw new Error("Method must be M, D0 or D1")
    const loaded = await loadInquiryInput(inputFile), tools = await createInquiryTools(loaded.context)
    return { schemaVersion: "authorization-inquiry-check/v1", status: "valid" as const, inputPath: loaded.inputPath, method, strategy,
      input: loaded.value, sourceFiles: tools.files, scopeGaps: tools.scopeGaps, sourceRefVerification: "authored", providerCalls: 0,
      ...(loaded.value.inquiry ? { program: compileAuthorizationInquiry(loaded.value.inquiry), authorProviderRequired: false } : { authorProviderRequired: method !== "M" }), diagnostics: [] }
  } catch (error) { return { schemaVersion: "authorization-inquiry-check/v1", status: "invalid" as const, providerCalls: 0, diagnostics: [{ code: "inquiry-input-invalid", message: String(error) }] } }
}

export async function executeLocalInquiryRun(options: { inputFile: string; outDir: string; model: string; method?: InquiryMethod; strategy?: InquiryStrategy; providerFactory?: LocalAuthorizationCliDependencies["providerFactory"]; execution?: Partial<RunAuthorizationInquiryOptions> }) {
  const method = options.method ?? "D1", strategy = options.strategy ?? options.execution?.strategy ?? "legacy", check = await checkAuthorizationInquiry(options.inputFile, method, strategy)
  if (check.status !== "valid") return check
  const loaded = await loadInquiryInput(options.inputFile), out = path.resolve(options.outDir), id = `${new Date().toISOString().replace(/[:.]/g, "")}-${randomUUID().slice(0, 8)}`
  const sessionPath = path.join(out, "sessions", id); await mkdir(sessionPath, { recursive: false }).catch(async error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await mkdir(path.join(out, "sessions"), { recursive: true }); await mkdir(sessionPath)
  })
  const save = (name: string, value: unknown) => writeFile(path.join(sessionPath, name), JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  const identity = { schemaVersion: "authorization-inquiry-session/v1", sessionId: id, sessionPath, createdAt: new Date().toISOString(), inputSha256: loaded.inputSha256, model: options.model, method, strategy, sourceFiles: check.sourceFiles, noAutomaticResend: true }
  await save("session.json", identity); await writeFile(path.join(sessionPath, "input.json"), loaded.original, { encoding: "utf8", flag: "wx" }); await save("check.json", check)
  let provider
  try {
    process.env.SKVM_AUTO_PROBE = "0"
    provider = options.providerFactory ? await options.providerFactory(options.model) : (await import("../../providers/registry.ts")).createProviderForModel(options.model)
  } catch (error) {
    const report = { ...identity, status: "provider-unavailable", error: String(error), providerDispatches: 0 }
    await save("report.json", report); await appendFile(path.join(out, "sessions.jsonl"), JSON.stringify({ relativePath: `sessions/${id}`, status: report.status }) + "\n"); return report
  }
  let requestId = 0
  const run = await runAuthorizationInquiry({ ...options.execution, ...loaded.context, provider, method, strategy, inquiry: loaded.value.inquiry, brief: loaded.value.brief, mode: loaded.value.mode, policy: loaded.value.policy,
    onRequest: async request => { await save(`request-${++requestId}.json`, request); await options.execution?.onRequest?.(request) },
    onEvent: async event => { await appendFile(path.join(sessionPath, "events.jsonl"), JSON.stringify(event) + "\n"); if (event.kind === "dispatch" && event.sequence === 1) await save("dispatch.json", identity); await options.execution?.onEvent?.(event) },
  })
  await save("run.json", run)
  const report = { ...identity, status: run.status, result: run.result, initial: run.initial, initialValidation: run.initialValidation, final: run.final, validation: run.validation, wireFailures: run.wireFailures, wireNormalizations: run.wireNormalizations, ...(run.domain ? { domain: run.domain } : {}), telemetry: run.telemetry, durationMs: run.durationMs, sourceAccounting: run.sourceAccounting, error: run.error }
  await save("report.json", report); await appendFile(path.join(out, "sessions.jsonl"), JSON.stringify({ relativePath: `sessions/${id}`, status: run.status }) + "\n")
  return report
}

export async function inspectLocalInquiry(outDir: string) {
  let root = path.resolve(outDir)
  if (!(await stat(path.join(root, "session.json")).catch(() => undefined))) {
    const index = (await readFile(path.join(root, "sessions.jsonl"), "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line)).at(-1)
    if (!index || !/^sessions\/[^/\\]+$/.test(index.relativePath)) throw new Error("Invalid inquiry session index")
    root = path.join(root, index.relativePath)
  }
  const identity = JSON.parse(await readFile(path.join(root, "session.json"), "utf8"))
  if (identity.schemaVersion !== "authorization-inquiry-session/v1") throw new Error("Not an inquiry session")
  if (sha(await readFile(path.join(root, "input.json"), "utf8")) !== identity.inputSha256) throw new Error("Inquiry input archive changed")
  let report
  try { report = JSON.parse(await readFile(path.join(root, "report.json"), "utf8")) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return { ...identity, status: await stat(path.join(root, "dispatch.json")).then(() => "completion-unknown", () => "initialized") } }
  if (report.sessionId !== identity.sessionId || report.model !== identity.model || report.method !== identity.method || (report.strategy ?? "legacy") !== (identity.strategy ?? "legacy") || report.inputSha256 !== identity.inputSha256 || !isDeepStrictEqual(report.sourceFiles, identity.sourceFiles)) throw new Error("Inquiry report/session identity mismatch")
  if (report.status !== "provider-unavailable") {
    const run = JSON.parse(await readFile(path.join(root, "run.json"), "utf8"))
    if (run.status !== report.status || run.method !== identity.method || (run.strategy ?? "legacy") !== (identity.strategy ?? "legacy") || ["sourceFiles", "result", "initial", "initialValidation", "final", "validation", "wireFailures", "wireNormalizations", "domain", "sourceAccounting", "telemetry"].some(key => !isDeepStrictEqual(run[key], report[key]))) throw new Error("Inquiry report/run identity mismatch")
  }
  return { ...report, sessionPath: root }
}
export async function compareLocalInquiry(inputFile: string, previous: string, requestedStrategy?: InquiryStrategy) {
  const report = await inspectLocalInquiry(previous), old = AuthorizationInquiryInputSchema.parse(JSON.parse(await readFile(path.join(report.sessionPath, "input.json"), "utf8")))
  const strategy = requestedStrategy ?? report.strategy ?? "legacy", check = await checkAuthorizationInquiry(inputFile, report.method, strategy)
  if (check.status !== "valid") return check
  const current = check.input!, omitRoot = (v: AuthorizationInquiryInput) => ({ ...v, sourceRoot: undefined })
  const taskChanged = !isDeepStrictEqual(omitRoot(old), omitRoot(current)), sourceChanged = !isDeepStrictEqual(report.sourceFiles, check.sourceFiles)
  const withoutPolicy = (v: AuthorizationInquiryInput) => ({ ...omitRoot(v), policy: undefined, inquiry: v.inquiry ? { ...v.inquiry, policy: undefined } : undefined })
  const withoutPremises = (v: AuthorizationInquiryInput) => ({ ...omitRoot(v), inquiry: v.inquiry ? { ...v.inquiry, questions: v.inquiry.questions.map(q => ({ ...q, premises: [] })) } : undefined })
  const policyOnly = taskChanged && !sourceChanged && isDeepStrictEqual(withoutPolicy(old), withoutPolicy(current))
  const premiseOnly = taskChanged && !sourceChanged && isDeepStrictEqual(withoutPremises(old), withoutPremises(current))
  const strategyChanged = strategy !== (report.strategy ?? "legacy")
  return { schemaVersion: "authorization-inquiry-compare/v1", status: taskChanged || sourceChanged || strategyChanged ? "needs-review" : "current", taskChanged, sourceChanged, strategy, strategyChanged, policyOnly, premiseOnly,
    affectedComputation: sourceChanged ? ["source-index", "control-extraction", "path-evaluation", "policy-comparison"] : policyOnly ? ["policy-mapping", "policy-comparison"] : premiseOnly ? ["premise-mapping", "path-evaluation", "policy-comparison"] : taskChanged || strategyChanged ? ["current-task-analysis"] : [],
    mechanicalIndexReusable: !sourceChanged && isDeepStrictEqual(old.allowedPaths, current.allowedPaths), controlRulesReused: false,
    reviewReasons: [...(taskChanged ? [policyOnly ? "Independent policy changed; source behavior dependencies are unchanged, map and check the new policy in a fresh session." : "Current request, premises, policy or scope changed; recheck affected questions and paths in a fresh session."] : []), ...(sourceChanged ? ["Allowed original source changed, including uncited source; extracted rules are invalidated."] : []), ...(strategyChanged ? ["Execution strategy changed; previous checks do not establish the new strategy result."] : [])], answerReused: false }
}
export function editAuthorizationInquiry(input: unknown, patch: unknown): AuthorizationInquiryInput {
  const value = AuthorizationInquiryInputSchema.parse(input), draft = structuredClone(value)
  const change = z.object({ schemaVersion: z.literal("authorization-inquiry-edit/v1"), reason: InquiryText, operations: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("request"), questionId: InquiryText.optional(), statement: InquiryText }).strict(),
    z.object({ kind: z.literal("premises"), questionId: InquiryText, premises: z.array(z.object({ text: InquiryText, origin: z.literal("user") }).strict()) }).strict(),
    z.object({ kind: z.literal("policy"), policy: InquiryPolicySchema }).strict(),
  ])).min(1) }).strict().parse(patch)
  const assigned = new Set<string>()
  for (const operation of change.operations) {
    const key = operation.kind + ("questionId" in operation ? `:${operation.questionId ?? "brief"}` : "")
    if (assigned.has(key)) throw new Error("Duplicate inquiry edit target"); assigned.add(key)
    if (operation.kind === "policy") {
      if ((draft.inquiry?.mode ?? draft.mode) !== "conformance") throw new Error("Policy edit requires conformance")
      if (draft.inquiry) draft.inquiry.policy = operation.policy; else draft.policy = operation.policy
    } else if (draft.inquiry) {
      const q = draft.inquiry.questions.find(q => q.id === operation.questionId)
      if (!q) throw new Error("Unknown inquiry question edit target")
      if (operation.kind === "request") q.request = operation.statement; else q.premises = operation.premises
    } else if (operation.kind === "request" && !operation.questionId) draft.brief = operation.statement
    else throw new Error("Natural brief edits must replace the actual brief; compile first for question edits")
  }
  return AuthorizationInquiryInputSchema.parse(draft)
}
