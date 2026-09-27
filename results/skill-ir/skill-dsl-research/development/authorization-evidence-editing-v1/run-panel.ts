import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog, renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"

type Binding = { path: string; sha256: string }
type Arm = "M0" | "D0" | "M1" | "D1"
type Unit = { id: string; phase: "initial" | "repeat"; caseId: string; arm: Arm; input: "baseline" | "prepared" }
type Case = { id: string; taskId: string; repository: string; sourceRef: string; baseline: { input: Binding; sources: Binding[] }; prepared: { input: Binding; report: Binding; sources: Binding[] }; markdown: Binding; publicInstructionSha256: string }
type Config = {
  schemaVersion: "authorization-aj-panel/v1"; registeredBeforeAnalysis: true; model: string;
  caseSelectionSha256: string; authorPlanSha256: string;
  publicBriefs: Binding; implementation: Binding[]; executionOptions: NonNullable<Parameters<typeof executeLocalAuthorizationRun>[0]["executionOptions"]> & { maxProviderDispatches: number };
  cases: Case[]; units: Unit[]
}

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const command = process.argv[2]
const rawConfig = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(rawConfig) as Config
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const configSha256 = hash(rawConfig)
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const absolute = (file: Binding) => path.join(repo, ...file.path.split("/"))

// The generation path binds only model-visible inputs and implementation. It never opens the independent evaluator.
async function verifyFrozenInputs(): Promise<void> {
  if (config.schemaVersion !== "authorization-aj-panel/v1" || config.registeredBeforeAnalysis !== true) throw new Error("Panel registration missing")
  if (hash(await readFile(path.join(root, "case-selection.json"))) !== config.caseSelectionSha256
    || hash(await readFile(path.join(root, "author-plan.json"))) !== config.authorPlanSha256) throw new Error("Selection or author plan identity changed")
  const bound = [config.publicBriefs, ...config.implementation]
  for (const item of config.cases) bound.push(item.baseline.input, ...item.baseline.sources, item.prepared.input, item.prepared.report, ...item.prepared.sources, item.markdown)
  for (const file of bound) if (hash(await readFile(absolute(file))) !== file.sha256) throw new Error(`Frozen material changed: ${file.path}`)
  if (config.cases.length !== 8 || config.units.length !== 40 || new Set(config.units.map(item => item.id)).size !== 40) throw new Error("Panel denominator changed")
  if (config.units.filter(unit => unit.phase === "initial").length !== 32 || config.units.filter(unit => unit.phase === "repeat").length !== 8) throw new Error("Phase denominator changed")
  for (const unit of config.units) {
    if (!config.cases.some(item => item.id === unit.caseId)) throw new Error(`Unregistered case ${unit.caseId}`)
    if ((unit.arm.endsWith("0") ? "baseline" : "prepared") !== unit.input) throw new Error(`Arm/material drift ${unit.id}`)
  }
  for (const item of config.cases) {
    const [base, prepared] = await Promise.all([item.baseline.input, item.prepared.input].map(file => loadLocalAuthorizationInput(absolute(file))))
    if (base.status !== "valid" || prepared.status !== "valid" || base.task.taskId !== item.taskId || prepared.task.taskId !== item.taskId) throw new Error(`Invalid frozen task ${item.id}`)
    if (base.task.repository !== item.repository || prepared.task.repository !== item.repository || base.task.sourceRef !== item.sourceRef || prepared.task.sourceRef !== item.sourceRef) throw new Error(`Source identity drift ${item.id}`)
    if (hash(base.analysisContract?.publicInstruction ?? "") !== item.publicInstructionSha256 || hash(prepared.analysisContract?.publicInstruction ?? "") !== item.publicInstructionSha256) throw new Error(`Public instruction drift ${item.id}`)
  }
}

async function mockProvider(inputFile: string) {
  const loaded = await loadLocalAuthorizationInput(inputFile)
  if (loaded.status !== "valid") throw new Error("Mock input invalid")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw new Error("Mock source catalog invalid")
  const source = catalog.catalog.sources[0]!
  return (() => ({
    name: "AJ-offline-mock",
    async complete() {
      const results = compileAuthorizationTask(loaded.task).runnableObligations.map(obligation => ({
        obligationId: obligation.id,
        decision: obligation.obligation.expectation === "conditional" ? { kind: "conditional-policy", policyStatus: "undetermined" } : { kind: "observed", observed: "unknown" },
        explanation: "Offline lifecycle check only; no semantic answer.",
        facts: ["entry", "binding", "control", "effect", "condition"].map((kind, index) => ({ id: `f${index}`, kind, statement: "Offline mock citation only.", citations: [{ sourceId: source.sourceId, startLine: source.cropRange.startLine, endLine: source.cropRange.startLine }] })),
        decisiveMissingFacts: ["Real registered model analysis."], suggestedObservations: ["No target execution in this check."], branchResults: [],
      }))
      return { text: "", toolCalls: [{ id: "mock", name: "submit_authorization_result", arguments: { results } }],
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" as const }
    },
    async completeWithToolResults() { throw new Error("Offline mock cannot use target tools") },
  })) as Parameters<typeof executeLocalAuthorizationRun>[0]["providerFactory"]
}

async function runUnit(unit: Unit, offlineMock: boolean): Promise<{ unit: string; action: string; status: string }> {
  const item = config.cases.find(candidate => candidate.id === unit.caseId)!
  const outRoot = offlineMock ? path.join(root, "mock-runs", configSha256, unit.id) : path.join(root, "runs", unit.id)
  await mkdir(outRoot, { recursive: true })
  const claimFile = path.join(outRoot, "claim.json")
  if (await exists(claimFile)) {
    const claim = await readJson(claimFile)
    if (claim.configSha256 !== configSha256 || claim.unit.id !== unit.id) throw new Error(`Claim identity drift ${unit.id}`)
    const report = await inspectLocalAuthorizationOutput(outRoot).catch(() => ({ status: "completion-unknown" }))
    return { unit: unit.id, action: "preserve-no-resend", status: report.status }
  }
  const inputFile = absolute(unit.input === "baseline" ? item.baseline.input : item.prepared.input)
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", "v6", "standard", "explicit-v1")
  if (checked.status !== "valid") throw new Error(`Invalid registered input ${unit.id}: ${JSON.stringify(checked.diagnostics)}`)
  const providerFactory = offlineMock ? await mockProvider(inputFile) : undefined
  await writeFile(claimFile, `${JSON.stringify({ unit, configSha256, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ unit: unit.id, action: "start", offlineMock })}\n`)
  const common = { inputFile, model: config.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const,
    reasoningStrategy: "standard" as const, executionOptions: config.executionOptions, ...(providerFactory ? { providerFactory } : {}) }
  const report = unit.arm.startsWith("M")
    ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(absolute(item.markdown), "utf8"), instructionOrigin: "independent-author", instructionPath: item.markdown.path } })
    : await executeLocalAuthorizationRun({ ...common, method: "plain" })
  await writeFile(path.join(outRoot, "unit.json"), `${JSON.stringify({ unit, configSha256, report }, null, 2)}\n`, { flag: "wx" })
  const row = { unit: unit.id, action: "finished", status: report.status }
  await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), stage: offlineMock ? "AJ9-mock" : "AJ10", ...row })}\n`)
  return row
}

if (!["check", "run", "status", "replay"].includes(command ?? "")) throw new Error("Usage: bun run-panel.ts check|run|status|replay [--count=1..4] [--unit=<registered-id>]")
await verifyFrozenInputs()
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
if (command === "check") {
  const checked = []
  for (const item of config.cases) {
    const base = await loadLocalAuthorizationInput(absolute(item.baseline.input))
    const prepared = await loadLocalAuthorizationInput(absolute(item.prepared.input))
    if (base.status !== "valid" || prepared.status !== "valid") throw new Error(`Invalid input ${item.id}`)
    for (const [label, loaded, binding] of [["baseline", base, item.baseline.input], ["prepared", prepared, item.prepared.input]] as const) {
      const report = await checkLocalAuthorizationInput(absolute(binding), "B", "plain", "v6", "standard", "explicit-v1")
      if (report.status !== "valid" || !report.preview || !report.preview.includes(loaded.analysisContract!.publicInstruction!)) throw new Error(`Prompt check failed ${item.id}/${label}`)
      checked.push({ caseId: item.id, material: label, renderedSourceCharacters: renderSourceBundle(loaded.sourceBundle).length, previewCharacters: report.preview.length })
    }
  }
  const mock = []
  for (const unit of config.units.filter(unit => unit.phase === "initial" && (unit.caseId === "owui-file" || (unit.arm === "D1" && ["memos-get-shared", "memos-member-leave"].includes(unit.caseId)))))
    mock.push(await runUnit(unit, true))
  if (mock.some(row => row.status !== "completed")) throw new Error(`Offline lifecycle failed: ${JSON.stringify(mock)}`)
  await writeFile(path.join(root, "pre-run-check.json"), `${JSON.stringify({ schemaVersion: "authorization-aj-pre-run/v1", configSha256, checked, mock,
    modelProviderCalls: 0, targetExecutions: 0 }, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ status: "valid", cases: config.cases.length, units: config.units.length, mock })}\n`)
} else if (command === "run") {
  const only = process.argv.find(arg => arg.startsWith("--unit="))?.slice(7)
  const count = Number(process.argv.find(arg => arg.startsWith("--count="))?.slice(8) ?? "1")
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count must be an integer from 1 to 4")
  const selected = config.units.filter(unit => !only || unit.id === only)
  if (!selected.length) throw new Error(`Unknown unit ${only}`)
  let dispatched = 0, consecutiveFailures = 0
  for (const unit of selected) {
    if (!only && dispatched >= count) break
    const outRoot = path.join(root, "runs", unit.id)
    if (await exists(path.join(outRoot, "claim.json"))) continue
    try {
      const row = await runUnit(unit, false)
      process.stdout.write(`${JSON.stringify(row)}\n`)
      dispatched++
      consecutiveFailures = row.status === "transport-failed" ? consecutiveFailures + 1 : 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await mkdir(outRoot, { recursive: true })
      await writeFile(path.join(outRoot, "unit-error.json"), `${JSON.stringify({ unit, message, afterClaim: await exists(path.join(outRoot, "claim.json")) }, null, 2)}\n`, { flag: "wx" })
      process.stderr.write(`${JSON.stringify({ unit: unit.id, status: "error-preserve-no-resend", message })}\n`)
      dispatched++
      process.stderr.write("Unexpected unit error: stop new dispatch until the failure is reviewed.\n")
      break
    }
    if (consecutiveFailures >= 2) { process.stderr.write("Two consecutive transport/service failures: stop new dispatch until reviewed.\n"); break }
  }
} else if (command === "status" || command === "replay") {
  const rows = []
  for (const unit of config.units) {
    const outRoot = path.join(root, "runs", unit.id)
    const claim = await exists(path.join(outRoot, "claim.json"))
    const completed = await exists(path.join(outRoot, "unit.json"))
    const result = completed ? await readJson(path.join(outRoot, "unit.json")) : undefined
    if (result && (result.configSha256 !== configSha256 || result.unit.id !== unit.id)) throw new Error(`Result identity drift ${unit.id}`)
    const inspected = command === "replay" && completed ? await inspectLocalAuthorizationOutput(outRoot) : undefined
    rows.push({ unit: unit.id, phase: unit.phase, status: completed ? result.report.status : claim ? "completion-unknown" : "not-dispatched",
      ...(inspected ? { inspectedStatus: inspected.status } : {}) })
  }
  const report = { schemaVersion: "authorization-aj-panel-status/v1", configSha256, planned: rows.length,
    claimed: rows.filter(row => row.status !== "not-dispatched").length,
    terminal: rows.filter(row => !["not-dispatched", "completion-unknown"].includes(row.status)).length,
    rows, providerCallsThisCommand: 0, targetExecutionsThisCommand: 0 }
  if (command === "replay") await writeFile(path.join(root, "replay.json"), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
