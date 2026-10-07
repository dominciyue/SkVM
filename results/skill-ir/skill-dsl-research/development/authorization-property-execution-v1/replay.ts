import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import { runCodexAccountInquiry, type AccountInquiryOptions } from "../../../../../src/adapters/codex-account.ts"
import type { AccountTransport } from "../../../../../src/adapters/codex-account-session.ts"
import { loadInquiryInput, initializeLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { planInquiryReuse } from "../../../../../src/benchmarks/authorization-dsl/inquiry-reuse.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { buildRunSkillBundle, materializeNaturalRunTask, prepareRunWorkspace } from "../../../../../src/run/index.ts"

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
/** Only named host wall-clock fields are excluded; model/source fields remain. */
export function stableNative(native: any) {
  const copy = JSON.parse(JSON.stringify(native))
  if (copy.domain?.computation) delete copy.domain.computation.durationMs
  if (copy.domain?.structure?.preparation) delete copy.domain.structure.preparation.durationMs
  for (const item of copy.history ?? []) if (item.output?.domain?.computation) delete item.output.domain.computation.durationMs
  return copy
}
function changedPaths(expected: any, actual: any, location = "", output: string[] = []) {
  if (output.length >= 20 || isDeepStrictEqual(expected, actual)) return output
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) changedPaths(expected[key], actual[key], location ? `${location}.${key}` : key, output)
  } else output.push(location)
  return output
}
function archivedTransport(calls: any[], final: string): AccountTransport {
  let receive = (_message: any) => {}, index = 0
  const next = () => {
    const call = calls[index++]?.call
    if (call) receive({ id: `replay-rpc-${index}`, method: "item/tool/call", params: { threadId: "replay-thread", turnId: "replay-turn", callId: call.id, tool: call.name, arguments: call.arguments } })
    else {
      receive({ method: "item/completed", params: { threadId: "replay-thread", turnId: "replay-turn", item: { type: "agentMessage", phase: "final_answer", text: final } } })
      receive({ method: "turn/completed", params: { threadId: "replay-thread", turn: { id: "replay-turn", status: "completed", items: [] } } })
    }
  }
  return { isolation: { kind: "test-transport", reason: "Offline replay of retained callbacks; no CLI, network or inference" }, onMessage(fn) { receive = fn }, onExit() {}, close() {}, send(message: any) {
    if (message.method === "initialize") receive({ id: message.id, result: {} })
    else if (message.method === "thread/start") receive({ id: message.id, result: { thread: { id: "replay-thread" }, model: "gpt-5.6-sol" } })
    else if (message.method === "turn/start") { receive({ id: message.id, result: { turn: { id: "replay-turn" } } }); queueMicrotask(next) }
    else if (message.result?.contentItems) queueMicrotask(next)
  } }
}
export async function replayAccountCalls(options: Omit<AccountInquiryOptions, "transportFactory">, original: { account: any; native: any }) {
  const requested = new Map<string, any>()
  for (const event of original.account.events) if (event.direction === "server" && event.method === "item/tool/call") {
    const p = event.params, call = { id: p.callId, name: p.tool, arguments: p.arguments }
    if (p.namespace || requested.has(call.id) && !isDeepStrictEqual(requested.get(call.id), call)) throw new Error("Archived callback identity conflict")
    requested.set(call.id, call)
  }
  if (!isDeepStrictEqual([...requested.values()], original.native.history.map((item: any) => item.call))) throw new Error("Archived callback order/arguments do not match actual incoming packets")
  const replay = await runCodexAccountInquiry({ ...options, transportFactory: () => archivedTransport(original.native.history, original.account.text), timeoutMs: 30000, traceDir: undefined })
  const expected = stableNative(original.native), actual = stableNative(replay.native), equal = isDeepStrictEqual(expected, actual)
  const differingFields = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter(key => !isDeepStrictEqual(expected[key], actual[key]))
  return { status: equal ? "verified" : "mismatch", callbacks: replay.native.history.length, expectedCallbacks: original.native.history.length, differingFields, differingPaths: changedPaths(expected, actual),
    expectedSha256: sha(JSON.stringify(expected)), replaySha256: sha(JSON.stringify(actual)), materialUses: replay.native.domain?.materialUses?.length ?? 0, toolBudget: replay.native.toolBudget,
    accountProvenance: "test-transport, recorded proposals only", newInference: 0, targetExecutions: 0 }
}
async function optional(file: string) { try { return await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error } }
export function assertCleanSource(repo: string) {
  if (execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Strict replay refuses dirty production src")
}
export async function replayStudy(root = import.meta.dir) {
  const repo = path.resolve(root, "../../../../.."); assertCleanSource(repo)
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), rows: any[] = []
  for (const position of manifest.positions) for (const attemptId of position.attempts) {
    const directory = path.join(root, "attempts", attemptId), bytes = await optional(path.join(directory, "report.json"))
    if (["smoke", "author"].includes(position.kind)) { rows.push({ attemptId, status: "non-inquiry-artifact-audit-required", newInference: 0 }); continue }
    if (!bytes) { rows.push({ attemptId, status: "active-or-unclosed-not-replayed", newInference: 0 }); continue }
    const report = JSON.parse(bytes.toString("utf8")), claim = JSON.parse(await readFile(path.join(directory, "claim.json"), "utf8"))
    const frozenRuntimeTree = claim.runtimeTree ?? execFileSync("git", ["rev-parse", `${claim.gitRevision}:src`], { cwd: repo, encoding: "utf8" }).trim()
    if (frozenRuntimeTree !== runtimeTree) { rows.push({ attemptId, status: "frozen-runtime-not-replayed", frozenRuntimeTree, currentRuntimeTree: runtimeTree, newInference: 0 }); continue }
    if (!report.inferenceDispatched) { rows.push({ attemptId, status: "no-inference-admission", reportSha256: sha(bytes), newInference: 0 }); continue }
    if ((report.accountStatus ?? report.status) !== "completed") { rows.push({ attemptId, status: "non-completed-account-not-replayed", reportSha256: sha(bytes), newInference: 0 }); continue }
    const compressed = await optional(path.join(directory, "run-result.json.gz")), record = compressed ? JSON.parse(gunzipSync(compressed).toString("utf8")) : JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8"))
    const combined = record.authorizationInquiry, { account: nativeAccount, ...native } = combined ?? record.native, account = nativeAccount ?? record.telemetry.account
    const input = await loadInquiryInput(claim.inputFile, { allowMissingPolicy: true })
    if (input.inputSha256 !== claim.inputSha256 || sha(await readFile(path.join(directory, "answer-original.md"))) !== report.answerSha256) throw new Error(`Original bytes changed: ${attemptId}`)
    // Public declarations require relative sourceRoot: stay on the source drive.
    const workDir = await mkdtemp(path.join(path.dirname(repo), ".ax-retained-replay-"))
    try {
      const skill = await loadSkill(claim.skillFile), task = await materializeNaturalRunTask({ prompt: input.value.brief ?? JSON.stringify(input.value.inquiry), taskPath: path.join(workDir, "task.json") })
      for (const file of claim.skillIdentity) if (sha(await readFile(path.join(skill.skillDir, file.file))) !== file.sha256) throw new Error("Original skill changed before replay")
      await prepareRunWorkspace({ task, skill, workDir })
      let reuse: AccountInquiryOptions["reuse"]
      if (claim.changeArm === "previous") {
        const previous = JSON.parse(await readFile(path.join(root, "attempts", claim.baselineAttemptId, "report.json"), "utf8")), previousRun = JSON.parse(await readFile(path.join(previous.sessionPath, "run.json"), "utf8"))
        const oldFile = path.join(workDir, "baseline.json")
        const oldSource = await loadInquiryInput(previousRun.native ? JSON.parse(await readFile(path.join(root, "attempts", claim.baselineAttemptId, "claim.json"), "utf8")).inputFile : claim.inputFile)
        await initializeLocalInquiry(previous.sessionPath, oldFile, oldSource.context.sourceRoot)
        const old = await loadInquiryInput(oldFile, { allowMissingPolicy: true }), tools = await createInquiryTools({ ...input.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true })
        const plan = planInquiryReuse({ currentInput: input.value, previousInput: old.value, previousRun, previousSessionId: record.reuse.previousSessionId, currentFiles: tools.files, currentStructure: tools.structure, currentMethod: claim.method, previousMethod: previousRun.method, currentStrategy: claim.strategy, previousStrategy: previousRun.strategy, currentModel: claim.model, previousModel: previousRun.telemetry.account.model })
        if (plan.status !== "reusable") throw new Error("Current previous seed is no longer eligible")
        reuse = { info: plan.info, seed: plan.seed }
      }
      const result = await replayAccountCalls({ inputFile: claim.inputFile, workDir, model: claim.model, method: claim.method, domainTools: claim.domainTools, strategy: claim.strategy, skillContent: buildRunSkillBundle(skill, "inject")!.content, ...claim.limits, reuse }, { account, native })
      rows.push({ attemptId, reportSha256: sha(bytes), runtimeTree, ...result })
    } finally {
      if (path.dirname(workDir) !== path.dirname(repo) || !path.basename(workDir).startsWith(".ax-retained-replay-")) throw new Error("Unexpected replay cleanup directory")
      await rm(workDir, { recursive: true, force: true })
    }
  }
  const result = { schemaVersion: "authorization-ax-offline-replay/v1", collectedAt: new Date().toISOString(), runtimeTree, newInference: 0, targetExecutions: 0, excludedOperationalFields: ["domain.computation.durationMs", "domain.structure.preparation.durationMs", "history[].output.domain.computation.durationMs"], rows }
  assertCleanSource(repo)
  await writeFile(path.join(root, "verification", "replay.json"), JSON.stringify(result, null, 2) + "\n")
  return result
}
if (import.meta.main) { const result = await replayStudy(); console.log(JSON.stringify({ newInference: 0, rows: result.rows.map(row => ({ attemptId: row.attemptId, status: row.status, differingPaths: row.differingPaths, callbacks: row.callbacks })) })) }
