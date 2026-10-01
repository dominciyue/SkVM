import path from "node:path"
import { readFile, writeFile, appendFile, mkdir, cp, readdir, stat } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { DOMAIN_EXECUTION_GUIDE } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { renderNaturalInquiryAuthorTask } from "../../../../../src/benchmarks/authorization-dsl/inquiry-run.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { executeRun, loadRunSkill, materializeNaturalRunTask } from "../../../../../src/run/index.ts"
import { BareAgentAdapter } from "../../../../../src/adapters/bare-agent.ts"

export const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), model = "xty/gpt-5.6-sol"
const prior = path.join(path.dirname(root), "authorization-inquiry-tools-v1")
export const budgets = { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 12, maxToolCalls: 24, maxDisplayBytes: 262144, maxFiles: 512, maxReadBytes: 8388608, maxTokens: 6000, maxConcurrency: 2, deliveryRepairs: 1, nativeExploration: 22, nativeChecks: 2 }
export const taskIds = ["memos-share", "paperless-download", "owui-ingestion", "gitea-self-query", "memos-remove", "paperless-notes", "paperless-share-create", "gitea-create-issue"]
type Arm = "M-L" | "D-L" | "M-E" | "D-E"
export type Row = { id: string; kind: "quality" | "ablation" | "native"; task: string; arm?: Arm; method: "M" | "D1"; strategy: "legacy" | "domain-evidence-v1"; repeat?: boolean; ablation?: "scheduler-off" | "checks-off"; sourceSkill?: string; version?: "original" | "changed" }
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export const exists = (file: string) => stat(file).then(() => true, () => false)
export const save = async (file: string, value: unknown, exclusive = true) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export function plannedRows(): Row[] {
  const arms: Arm[] = ["M-L", "D-L", "M-E", "D-E"], rows: Row[] = []
  const add = (task: string, arm: Arm, repeat = false) => rows.push({ id: `quality-${task}-${arm}${repeat ? "-repeat" : ""}`, kind: "quality", task, arm, method: arm.startsWith("M") ? "M" : "D1", strategy: arm.endsWith("E") ? "domain-evidence-v1" : "legacy", ...(repeat ? { repeat: true } : {}) })
  taskIds.forEach((task, i) => { for (let j = 0; j < 4; j++) add(task, arms[(i + j) % 4]!) })
  for (const task of ["owui-ingestion", "paperless-notes"]) for (const arm of rows.filter(r => r.task === task && !r.repeat).map(r => r.arm!).reverse()) add(task, arm, true)
  for (const task of ["owui-ingestion", "paperless-notes"]) for (const ablation of ["scheduler-off", "checks-off"] as const) rows.push({ id: `ablation-${task}-${ablation}`, kind: "ablation", task, arm: "D-E", method: "D1", strategy: "domain-evidence-v1", ablation })
  for (const [sourceSkill, task, changed] of [["cloudflare-security-audit", "paperless-notes", "paperless-notes-owner-null"], ["github-security-review", "memos-remove", "memos-remove-policy-change"]]) for (const version of ["original", "changed"] as const) rows.push({ id: `native-${sourceSkill}-${version}`, kind: "native", task: version === "original" ? task! : changed!, sourceSkill, version, method: "D1", strategy: "domain-evidence-v1" })
  return rows
}
export function rowDisposition(report: any, claimed: boolean) { return { state: report?.status ?? (claimed ? "completion-unknown" : "undispatched"), terminal: !!report, canDispatch: !report && !claimed } }
export function isInfrastructureFailure(report: any): boolean {
  if (["provider-unavailable", "timeout-unknown", "timeout", "completion-unknown"].includes(report.status)) return true
  const errors = [report.error ?? "", ...(report.attempts ?? report.native?.attempts ?? []).filter((a: any) => ["error", "timeout"].includes(a.status)).map((a: any) => `${a.error?.name ?? ""} ${a.error?.message ?? ""}`)].join("\n")
  return /Provider(?:Network|Auth|Http|RateLimit)Error|fetch failed|ECONN|connection reset|gateway|HTTP\s*(?:429|5\d\d)|request completion is unknown/i.test(errors)
}
async function register() {
  if (await exists(path.join(root, "manifest.json")) || await exists(path.join(root, "runs"))) throw new Error("Already registered; inputs cannot change after generation")
  const historical = await json(path.join(prior, "manifest.json")), tasks = historical.tasks.filter((t: any) => taskIds.includes(t.id))
  if (tasks.length !== 8) throw new Error("Original eight natural tasks missing")
  const identities: any[] = []
  for (const source of new Set<string>(tasks.map((t: any) => t.source))) {
    await cp(path.join(prior, "public-source", source), path.join(root, "model/public-source", source), { recursive: true, errorOnExist: true, force: false })
    identities.push(await json(path.join(root, "model/public-source", source, "source.json")))
  }
  const changedPolicy = historical.tasks.find((t: any) => t.id === "memos-remove-policy-change")
  const notes = tasks.find((t: any) => t.id === "paperless-notes")
  tasks.push({ ...notes, id: "paperless-notes-owner-null", brief: notes.brief + " Revised current premise: the addressed document's owner field is absent/null. Keep all other current requirements, including GET versus POST, unchanged." }, changedPolicy)
  for (const task of tasks) {
    const base = await json(path.join(prior, "inputs", `${task.id === "paperless-notes-owner-null" ? "paperless-notes" : task.id}.json`))
    const input = { ...base, taskId: task.id, brief: task.brief, ...(task.policy ? { policy: task.policy } : {}) }
    await save(path.join(root, "model/inputs", `${task.id}.json`), input)
  }
  for (const name of ["cloudflare-security-audit", "github-security-review"]) {
    const original = path.join(root, "model/source-skills", name), extended = path.join(root, "model/skill-packages", name)
    await cp(path.join(prior, "source-skills", name), original, { recursive: true, errorOnExist: true, force: false })
    await cp(original, extended, { recursive: true, errorOnExist: true, force: false })
    const text = await readFile(path.join(original, "SKILL.md"), "utf8")
    await writeFile(path.join(extended, "SKILL.md"), text + "\n\n## SkVM bounded authorization execution\n\nFor the current source-only authorization task, read INQUIRY-TOOLS.md. Use the registered compile/observe/check tools and original source tools; preserve the original review format and duties outside the current bounded question.\n", "utf8")
    await writeFile(path.join(extended, "INQUIRY-TOOLS.md"), renderNaturalInquiryAuthorTask("Declare only the current user question, never a source answer.", "behavior") + "\n\nThe actual runtime supplies the current mode and independent policy. For conformance copy that policy exactly. Compile once using authorization_compile({inquiry}). Read source through source_list/search/symbol/read. Propose local changes with authorization_observe({controlDelta}); optional observations are {questionId,kind,subject,object?,claim,state,evidenceIds}. All source citations must already be shown.\n\n" + DOMAIN_EXECUTION_GUIDE + '\n\nSubmit authorization_check_result({result}) with {schemaVersion:"authorization-inquiry-result/v1",questions:[{questionId,behavior:{disposition:allow|deny|conditional|unknown,explanation},branches:[{id,condition,disposition,explanation,evidenceIds}],evidenceIds,missing:[{kind:source-gap|premise-unspecified|deployment-unverified|dependency-out-of-scope,detail,nextRead?}],policyAssessment?:{status:satisfied|violated|undetermined,explanation}}],observations:[],scope}. Conformance requires policyAssessment; behavior forbids it. Branch id matches pathKey. unknown identifies a decisive gap. After one diagnostic repair at most, answer in the original skill prose format.\n\nRuntime: existing SkVM plus Bun dependencies. Ordinary usage: skvm run --skill=SKILL.md --prompt=<current-task> --authorization-scope=<input.json> --authorization-domain-tools --authorization-strategy=domain-evidence-v1 --authorization-trace=<new-file> --model=<provider/model>. This extension does not perform target execution, deployment validation, patching or a whole audit.\n', "utf8")
    await save(path.join(extended, "extension-source.json"), { source: await json(path.join(original, "source.json")), originalSkillPreservedAsPrefix: true, extension: "shared domain tools and finite execution guide", residualDuties: ["whole security audit", "deployment tests", "target execution", "patching", "independent semantic review"] })
  }
  await save(path.join(root, "manifest.json"), { schemaVersion: "authorization-aq-study/v1", createdAt: new Date().toISOString(), implementationCommit: null, model, budgets, development: true, exposedDevelopmentInputs: true, unseenClaim: false, priorAnswersModelVisible: false, tasks, sourceIdentities: identities, rows: plannedRows(), evaluation: { reviewer: "independent read-only agents after generation closes", armAndCostHidden: true, representationMayBeInferred: true, criteria: ["task decision and requested scenarios", "necessary source controls", "branch applicability", "principal/resource/effect binding", "specific justified unknown", "evidence support", "independent policy comparison"], firstAndFinalSeparate: true, extractionAndEvaluationSeparate: true }, revisions: [], targetExecuted: false })
  console.log("Registered 40 quality + 4 ablation + 4 native sessions; zero provider calls")
}
async function check() {
  const manifest = await json(path.join(root, "manifest.json")), checks: any[] = []
  for (const task of manifest.tasks) for (const [method, strategy] of [["M", "legacy"], ["D1", "legacy"], ["M", "domain-evidence-v1"], ["D1", "domain-evidence-v1"]] as const) {
    const checked = await checkAuthorizationInquiry(path.join(root, "model/inputs", `${task.id}.json`), method, strategy)
    if (checked.status !== "valid") throw new Error(JSON.stringify(checked.diagnostics))
    checks.push({ task: task.id, method, strategy, files: checked.sourceFiles.length, gaps: checked.scopeGaps })
  }
  const packages: any[] = []
  for (const name of ["cloudflare-security-audit", "github-security-review"]) {
    const loaded = await loadRunSkill(path.join(root, "model/skill-packages", name, "SKILL.md")), original = await readFile(path.join(root, "model/source-skills", name, "SKILL.md"), "utf8")
    if (!loaded.skillContent.startsWith(original)) throw new Error("Original skill prefix changed")
    const reference = loaded.bundleFiles.find((f: string) => /\.md$/i.test(f))!
    let calls = 0, toolNames: string[] = [], referenceReturned = false
    const mock = { name: "zero-paid-loader-precheck", complete: async (params: any) => { calls++; toolNames = params.tools.map((t: any) => t.name); return { text: "", toolCalls: [{ id: "reference", name: "skill_reference_read", arguments: { path: reference } }], tokens: { input: 0, output: 0 }, durationMs: 0, stopReason: "tool_use" as const } }, completeWithToolResults: async (_p: any, results: any[]) => { calls++; referenceReturned = results.some(r => r.content.includes('"kind":"skill-guidance"')); return { text: "Loader/reference precheck only", toolCalls: [], tokens: { input: 0, output: 0 }, durationMs: 0, stopReason: "end_turn" as const } } }
    const task = await materializeNaturalRunTask({ prompt: "Read the declared original skill companion; do not investigate or answer source behavior.", taskPath: path.join(root, "precheck-workdirs", name, "task.json") })
    await executeRun({ task, skill: loaded, adapter: new BareAgentAdapter(() => mock as any), adapterConfig: { model: "mock", maxSteps: 2, timeoutMs: 30000, providerOptions: { authorizationScope: path.join(root, "model/inputs", name.startsWith("cloudflare") ? "paperless-notes.json" : "memos-remove.json"), authorizationDomainTools: true, authorizationStrategy: "domain-evidence-v1" } }, workDir: path.join(root, "precheck-workdirs", name, "workdir"), keepWorkDir: true, skillMode: "inject" })
    if (!referenceReturned || toolNames.some(t => ["execute_command", "write_file", "web_fetch"].includes(t))) throw new Error("Loader/reference/read-only precheck failed")
    packages.push({ name, originalPrefixPreserved: true, companions: loaded.bundleFiles.length, reference, referenceReturned, mockCalls: calls, realProviderCalls: 0, toolNames })
  }
  const canary = path.join(root, "precheck-canary"); await mkdir(path.join(canary, "oracle"), { recursive: true }); await writeFile(path.join(canary, "oracle/answer.ts"), "CANARY_NOT_AN_ANSWER"); await writeFile(path.join(canary, "entry.ts"), "export const entry = true\n")
  const tools = await createInquiryTools({ sourceRoot: canary, allowedPaths: ["."], repository: "neutral-canary", sourceRef: "canary" })
  if ((await tools.execute("source_read", { path: "oracle/answer.ts", startLine: 1, endLine: 1 })).status !== "error") throw new Error("Oracle isolation failed")
  await save(path.join(root, "precheck.json"), { status: "passed", realProviderCalls: 0, checks, packages, oracleCanaryDenied: true, relativeInputRootsResolved: true }, false)
  console.log(`Passed ${checks.length} input checks and two ordinary loader/reference prechecks; zero paid calls`)
}
export async function retainedDispatches(dir: string): Promise<number> {
  let count = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory() && ["sessions", "native-trace"].includes(entry.name)) { if (entry.name === "sessions") for (const session of await readdir(file)) count += await retainedDispatches(path.join(file, session)); else count += await retainedDispatches(file) }
    else if (["events.jsonl", "lifecycle.jsonl"].includes(entry.name)) for (const line of (await readFile(file, "utf8")).trim().split(/\r?\n/).filter(Boolean)) if (JSON.parse(line).kind === "dispatch") count++
  }
  return count
}
async function executeRow(id: string) {
  const manifest = await json(path.join(root, "manifest.json")), row: Row = manifest.rows.find((r: Row) => r.id === id)
  if (!row || !manifest.implementationCommit) throw new Error("Unregistered/unbound row")
  const output = path.join(root, "runs", id); await mkdir(output, { recursive: true })
  if (await exists(path.join(output, "report.json"))) return
  await save(path.join(output, "claim.json"), { row, model, implementationCommit: manifest.implementationCommit, startedAt: new Date().toISOString(), noAutomaticResend: true })
  const started = Date.now(); let result: any
  try {
    const inputFile = path.join(root, "model/inputs", `${row.task}.json`)
    if (row.kind !== "native") {
      result = await executeLocalInquiryRun({ inputFile, outDir: output, model, method: row.method, strategy: row.strategy, execution: { ...budgets, domainAblation: row.ablation } })
      if (result.sessionPath && await exists(path.join(result.sessionPath, "run.json"))) result.attempts = (await json(path.join(result.sessionPath, "run.json"))).attempts
    } else {
      const input = await json(inputFile), skill = await loadRunSkill(path.join(root, "model/skill-packages", row.sourceSkill!, "SKILL.md"))
      await save(path.join(output, "loaded-skill.json"), { skillPath: path.relative(root, skill.skillPath), skillContent: skill.skillContent, bundleFiles: skill.bundleFiles, source: await json(path.join(root, "model/source-skills", row.sourceSkill!, "source.json")) })
      const prompt = `${input.brief}\nCurrent mode: ${input.mode}. Independent current user policy: ${JSON.stringify(input.policy ?? null)}\nInvestigate only this named source-visible authorization question. Whole audits, target execution, deployment tests and patching are outside this current task. Follow the package's tool guide, then explain source branches, policy comparison and exact limits in its normal prose format.`
      const task = await materializeNaturalRunTask({ prompt, taskPath: path.join(output, "natural-task.json") })
      const run = await executeRun({ task, skill, adapter: new BareAgentAdapter(() => createProviderForModel(model)), adapterConfig: { model, maxSteps: 12, timeoutMs: 1200000, providerOptions: { authorizationScope: inputFile, authorizationDomainTools: true, authorizationStrategy: row.strategy, authorizationTraceDir: path.join(output, "native-trace") } }, workDir: path.join(output, "workdir"), keepWorkDir: true, skillMode: "inject" })
      await save(path.join(output, "ordinary-run.json"), run)
      const native: any = run.runResult.authorizationInquiry, checks = native?.history.filter((h: any) => h.call.name === "authorization_check_result") ?? []
      result = { status: run.runResult.runStatus === "ok" ? "completed" : run.runResult.runStatus, error: run.runResult.statusDetail, prose: run.runResult.text, skillLoaded: run.runResult.skillLoaded, native, telemetry: native?.telemetry, attempts: native?.attempts, initial: checks[0]?.call.arguments.result, final: checks.at(-1)?.call.arguments.result, result: native?.result, originalSkillPrefixPreserved: skill.skillContent.startsWith(await readFile(path.join(root, "model/source-skills", row.sourceSkill!, "SKILL.md"), "utf8")) }
    }
  } catch (error) { const calls = await retainedDispatches(output); result = { status: calls ? "completion-unknown" : "failed", providerDispatches: calls, error: String(error), recovery: "Retained claims are never automatically resent" } }
  await save(path.join(output, "report.json"), { schemaVersion: "authorization-aq-row-report/v1", row, wallDurationMs: Date.now() - started, ...result })
  await appendFile(path.join(root, "journal.jsonl"), JSON.stringify({ at: new Date().toISOString(), row: id, status: result.status, providerCalls: result.telemetry?.providerCalls ?? result.providerDispatches ?? null }) + "\n")
  console.log(`${id}: ${result.status}; calls=${result.telemetry?.providerCalls ?? result.providerDispatches ?? "unknown"}`)
}
export async function status() {
  const manifest = await json(path.join(root, "manifest.json")), rows: any[] = []
  for (const row of manifest.rows) { const dir = path.join(root, "runs", row.id), report = await exists(path.join(dir, "report.json")) ? await json(path.join(dir, "report.json")) : undefined; rows.push({ ...row, ...rowDisposition(report, await exists(path.join(dir, "claim.json"))), providerCalls: report?.telemetry?.providerCalls ?? report?.providerDispatches ?? null }) }
  return { planned: rows.length, terminal: rows.filter(r => r.terminal).length, rows }
}
async function run() {
  const manifest = await json(path.join(root, "manifest.json")); if (!manifest.implementationCommit) throw new Error("Bind verified implementation commit before paid generation")
  let cursor = 0, streak = 0, paused = false
  await Promise.all(Array.from({ length: budgets.maxConcurrency }, async () => { while (!paused && cursor < manifest.rows.length) {
    const row: Row = manifest.rows[cursor++]!, dir = path.join(root, "runs", row.id)
    if (await exists(path.join(dir, "claim.json"))) { console.log(`${row.id}: claimed; no resend`); continue }
    console.log(`Starting ${row.id}`)
    const child = Bun.spawn([process.execPath, path.join(root, "study.ts"), "worker", row.id], { cwd: repo, stdout: "inherit", stderr: "inherit" })
    const deadline = setTimeout(() => child.kill(), budgets.sessionTimeoutMs + 60000), code = await child.exited; clearTimeout(deadline)
    if (!(await exists(path.join(dir, "report.json")))) await save(path.join(dir, "report.json"), { row, status: "completion-unknown", providerDispatches: await retainedDispatches(dir), error: `Worker stopped with exit ${code}; no resend` })
    const report = await json(path.join(dir, "report.json")); streak = isInfrastructureFailure(report) ? streak + 1 : 0
    if (streak >= 2) paused = true
  } }))
  const summary = await status()
  if (paused) { await save(path.join(root, "infrastructure-pause.json"), { at: new Date().toISOString(), streak, ...summary }, false); throw new Error("Two consecutive infrastructure failures; no new paid dispatch") }
  if (summary.rows.some(r => !r.terminal)) throw new Error("Unsettled claims or undispatched rows remain")
  await save(path.join(root, "generation-closed.json"), { closedAt: new Date().toISOString(), ...summary, noScoreResampling: true, revisionSessions: 0 })
  console.log(`Generation closed: ${summary.terminal}/${summary.planned}`)
}
async function replay() {
  const manifest = await json(path.join(root, "manifest.json")), summary = await status()
  if (JSON.stringify(manifest.rows) !== JSON.stringify(plannedRows())) throw new Error("Registered denominator/order changed")
  for (const row of summary.rows.filter(r => r.terminal)) {
    const dir = path.join(root, "runs", row.id), report = await json(path.join(dir, "report.json")), claim = await json(path.join(dir, "claim.json"))
    if (JSON.stringify(report.row) !== JSON.stringify(claim.row) || claim.implementationCommit !== manifest.implementationCommit) throw new Error(`Identity mismatch ${row.id}`)
    if (await exists(path.join(dir, "sessions.jsonl"))) await inspectLocalInquiry(dir)
    if ((report.telemetry?.providerCalls ?? report.providerDispatches ?? 0) > budgets.maxDispatches) throw new Error("Dispatch budget exceeded")
    const native = report.native
    if (native && (native.toolBudget.totalUsed > 24 || native.toolBudget.explorationUsed > 22 || native.toolBudget.checksUsed > 2)) throw new Error("Native budget exceeded")
  }
  console.log(JSON.stringify({ ...summary, providerCallsDuringReplay: 0 }))
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "register") await register()
  else if (command === "check") await check()
  else if (command === "bind") { const manifest = await json(path.join(root, "manifest.json")); if (manifest.implementationCommit) throw new Error("Already bound"); manifest.implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(); await save(path.join(root, "manifest.json"), manifest, false); console.log(manifest.implementationCommit) }
  else if (command === "worker") await executeRow(process.argv[3]!)
  else if (command === "run") await run()
  else if (command === "status") console.log(JSON.stringify(await status()))
  else if (command === "replay") await replay()
  else throw new Error("Use register|check|bind|run|status|replay")
}
