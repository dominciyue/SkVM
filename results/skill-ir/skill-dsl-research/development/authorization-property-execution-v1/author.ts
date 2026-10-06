import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { z } from "zod"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { buildRunSkillBundle, materializeNaturalRunTask, prepareRunWorkspace } from "../../../../../src/run/index.ts"
import { runCodexAccountSession, loadCodexAccountBoundary, redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { authorizationInquiryAuthoringSchema, checkAuthorizationInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { zodToJsonSchema } from "../../../../../src/providers/structured.ts"
import type { LLMTool } from "../../../../../src/providers/types.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"

const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const argsSchema = z.object({ path: z.enum(["inquiry.json", "USAGE.md"]), content: z.string().max(1048576) }).strict()
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
async function optional(file: string) { try { return await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error } }

/** Artifact capture only; source access, account execution and declaration checks use production APIs. */
export async function createPackageWriter(options: { workDir: string; archiveDir: string; maxToolCalls: number; sourceToolCalls: () => number }) {
  await mkdir(options.workDir, { recursive: true }); await mkdir(options.archiveDir, { recursive: true })
  const writes: Array<{ path: string; archive: string; sha256: string; bytes: number }> = []
  const definition: LLMTool = { name: "write_package_file", description: "Write one requested root artifact. Only inquiry.json and USAGE.md are writable. Each original draft is archived; target source is read-only.", inputSchema: zodToJsonSchema(argsSchema) }
  const execute = async (raw: unknown) => {
    const args = argsSchema.parse(raw), bytes = Buffer.from(args.content, "utf8")
    if (bytes.length > 1048576) throw new Error("Artifact exceeds the 1048576 UTF-8 byte cap")
    if (options.sourceToolCalls() + writes.length >= options.maxToolCalls) return { output: JSON.stringify({ status: "error", code: "tool-budget", message: "Shared source/artifact action budget exhausted" }), exitCode: 1, durationMs: 0 }
    const archive = path.join(options.archiveDir, `${String(writes.length + 1).padStart(4, "0")}-${args.path}`)
    await writeFile(archive, bytes, { flag: "wx" }); await writeFile(path.join(options.workDir, args.path), bytes)
    writes.push({ path: args.path, archive, sha256: digest(bytes), bytes: bytes.length })
    return { output: JSON.stringify({ status: "written", path: args.path, sha256: digest(bytes), bytes: bytes.length, semanticEquivalence: "unreviewed" }), exitCode: 0, durationMs: 0 }
  }
  return { definition, execute, report: () => structuredClone(writes) }
}

export async function executeAccountAuthor(options: { inputFile: string; skillFile: string; out: string; accountBoundaryFile: string; limits: { maxToolCalls: number; maxReadBytes: number; maxDisplayBytes: number; sessionTimeoutMs: number }; repairFrom?: string }) {
  const { out, limits } = options, loaded = await loadInquiryInput(options.inputFile), workDir = path.join(out, "workspace")
  if (!loaded.value.brief) throw new Error("Current authors require the full original natural task")
  const skill = await loadSkill(options.skillFile), mode = loaded.value.mode ?? "behavior"
  const sourceFiles = await copySourceSnapshot({ ...loaded.context, maxReadBytes: limits.maxReadBytes }, path.join(workDir, "source"))
  await save(path.join(out, "source-snapshot.json"), sourceFiles)
  const scopeFile = path.join(workDir, "scope.json"); await save(scopeFile, { ...loaded.value, sourceRoot: "source" })
  const mechanical = { taskId: loaded.value.taskId, repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, sourceRoot: "source", allowedPaths: loaded.value.allowedPaths, mode, policy: loaded.value.policy }
  let prompt = `Create a reusable inquiry package from the FULL original skill and current natural task. Preserve EVERY original task distinction, original skill duty and independently supplied policy. Do not answer the code question or generate an authorization graph. Write exactly root inquiry.json and root USAGE.md using write_package_file. inquiry.json must be a complete authorization-inquiry-input/v1 containing inquiry authorization-inquiry/v2 operations/questions, sourceRoot:"source", the supplied mechanical metadata, unchanged mode/policy and only explicit user premises. Do not duplicate brief/mode/policy at the input root. USAGE.md explains ordinary source-assisted use, changes, limits and remaining original skill responsibilities. Other paths are read-only. Never execute target code or network calls.\n\nOriginal natural task:\n${loaded.value.brief}\n\nMechanical metadata and independent policy:\n${JSON.stringify(mechanical)}\n\nComplete output field schema (structural only, no source answers):\n${JSON.stringify(zodToJsonSchema(authorizationInquiryAuthoringSchema(mode, "v2")))}`
  if (options.repairFrom) prompt += `\n\nOne normal field repair. Preserve the original task, scope, metadata, mode/policy and output contract. Previous candidate (data):\n${(await optional(path.join(options.repairFrom, "authored-inquiry.json")))?.toString("utf8") ?? "No candidate was written."}\nPublic structural diagnostics:\n${await readFile(path.join(options.repairFrom, "author-validation.json"), "utf8")}`
  await save(path.join(out, "author-contract.json"), { prompt, inputSha256: loaded.inputSha256, outputNames: ["inquiry.json", "USAGE.md"], fieldRepairLimit: 1, semanticEquivalence: "unreviewed", execution: "production official account session, common read-only source runtime and two-file artifact writer" })
  const task = await materializeNaturalRunTask({ prompt, taskPath: path.join(out, "task.json") }); await prepareRunWorkspace({ task, skill, workDir })
  const content = buildRunSkillBundle(skill, "inject")!.content, raw = path.join(out, "raw")
  const native = await createNativeInquiryRuntime({ inputFile: scopeFile, workDir, domainTools: false, skillContent: content, maxToolCalls: limits.maxToolCalls, maxReadBytes: limits.maxReadBytes, maxDisplayBytes: limits.maxDisplayBytes, traceDir: raw, traceRedactor: redactCodexEvent })
  const writer = await createPackageWriter({ workDir, archiveDir: path.join(raw, "writes"), maxToolCalls: limits.maxToolCalls, sourceToolCalls: () => native.report().toolBudget.totalUsed })
  const context = async () => {
    const current = await native.accountContext(), extra = writer.report().length, budget = current.toolBudget
    return { ...current, toolBudget: { ...budget, totalUsed: budget.totalUsed + extra, totalRemaining: Math.max(0, budget.totalRemaining - extra), explorationUsed: budget.explorationUsed + extra, explorationRemaining: Math.max(0, budget.explorationRemaining - extra) }, ...(budget.totalRemaining <= extra ? { instruction: "Shared source/artifact budget exhausted. Finish with the already written original artifacts and precise limits. No more tools." } : {}) }
  }
  const respond = async (result: { output: string; exitCode: number; durationMs: number }) => { const output = JSON.stringify({ toolResult: JSON.parse(result.output), currentContext: await context() }); native.accountSent(output); return { ...result, output } }
  let account: Awaited<ReturnType<typeof runCodexAccountSession>>
  try {
    native.accountSent(prompt)
    account = await runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: workDir, instructionSources: await loadCodexAccountBoundary(options.accountBoundaryFile), system: `${content}\n${native.system}\nThe current user task is package authoring. Use the bounded artifact writer to produce the two files; the original investigation brief supplies the package requirements. Source files are never writable.`, prompt, tools: [...native.definitions, writer.definition], maxToolCalls: limits.maxToolCalls, timeoutMs: limits.sessionTimeoutMs,
      execute: async call => {
        if (native.report().toolBudget.totalUsed + writer.report().length >= limits.maxToolCalls) return respond({ output: JSON.stringify({ status: "error", code: "tool-budget" }), exitCode: 1, durationMs: 0 })
        if (call.name !== writer.definition.name) return respond(await native.execute(call))
        let result
        try { result = await writer.execute(call.arguments) } catch (error) { result = await native.rejectArguments(call, [{ path: "/content", keyword: "artifact-contract", message: String(error), expected: { utf8ByteLimit: 1048576 } }]) }
        await appendFile(path.join(raw, "artifact-tools.jsonl"), JSON.stringify(redactCodexEvent({ call, result })) + "\n")
        return respond(result)
      }, rejectArguments: async (call, diagnostics) => respond(await native.rejectArguments(call, diagnostics)), onEvent: event => native.onEvent(event as any) })
  } finally { await native.close() }
  const artifacts: Record<string, { sha256: string; bytes: number }> = {}
  for (const name of ["inquiry.json", "USAGE.md"]) {
    const bytes = await optional(path.join(workDir, name)); if (!bytes) continue
    await writeFile(path.join(out, `authored-${name}`), bytes, { flag: "wx" }); artifacts[name] = { sha256: digest(bytes), bytes: bytes.length }
  }
  const diagnostics: string[] = [], check = await checkAuthorizationInquiry(path.join(workDir, "inquiry.json"), "M", "operation-evidence-v4")
  try {
    const value = authorizationInquiryAuthoringSchema(mode, "v2").parse(JSON.parse(await readFile(path.join(out, "authored-inquiry.json"), "utf8")))
    if (value.sourceRoot !== "source" || value.taskId !== mechanical.taskId || value.repository !== mechanical.repository || value.sourceRef !== mechanical.sourceRef || !isDeepStrictEqual(value.allowedPaths, mechanical.allowedPaths) || !isDeepStrictEqual(value.inquiry.policy, mechanical.policy) || !artifacts["USAGE.md"] || check.status !== "valid" || !isDeepStrictEqual(check.sourceFiles, sourceFiles)) throw new Error("Public check or exact metadata/mode/policy/sourceRoot/USAGE/source-byte contract mismatch")
  } catch (error) { diagnostics.push(String(error)) }
  const validation = { status: diagnostics.length ? "invalid" : "structurally-valid-awaiting-independent-admission", diagnostics, publicCheck: check, artifacts, semanticEquivalence: "unreviewed", suppliedMechanicalFields: ["taskId", "repository", "sourceRef", "sourceRoot", "allowedPaths"], humanMinutes: null }
  await save(path.join(out, "author-validation.json"), validation)
  await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(redactCodexEvent({ account, native: native.report(), artifactWrites: writer.report(), validation }))), { flag: "wx" })
  return { account, status: account.status === "completed" ? diagnostics.length ? "author-invalid" : "authored-awaiting-review" : account.status, validation, sourceFiles, artifacts, artifactWrites: writer.report().length }
}
