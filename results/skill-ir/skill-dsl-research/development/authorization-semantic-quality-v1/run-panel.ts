import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"
import type { AuthorizationReasoningStrategy } from "../../../../../src/task-dsl/authorization/reasoning-plan.ts"

type Arm = "M0" | "D0" | "M1" | "D1"
type FileBinding = { path: string; sha256: string }
type Case = { id: string; taskId: string; input: FileBinding; markdown: FileBinding; sources: FileBinding[] }
type Unit = { id: string; phase: "initial" | "repeat"; caseId: string; arm: Arm; reasoningStrategy: AuthorizationReasoningStrategy; wire: "v4" }
type Config = { implementationRevision: string; implementation: FileBinding[]; model: string; executionOptions: NonNullable<Parameters<typeof executeLocalAuthorizationRun>[0]["executionOptions"]>; cases: Case[]; units: Unit[] }

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const command = process.argv[2]
const rawConfig = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(rawConfig) as Config
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const configSha256 = hash(rawConfig)
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))

// Only model-visible material is opened on this path. The evaluator directory
// is deliberately absent from the runner import graph and file reads.
async function verifyFrozenInputs(): Promise<void> {
  for (const file of config.implementation) if (hash(await readFile(path.join(repo, file.path))) !== file.sha256) throw Error(`Implementation changed: ${file.path}`)
  for (const item of config.cases) {
    for (const file of [item.input, item.markdown, ...item.sources]) if (hash(await readFile(path.join(repo, file.path))) !== file.sha256) throw Error(`Model-visible material changed: ${file.path}`)
  }
  if (config.cases.length !== 8 || config.units.length !== 44) throw Error("Registered denominator changed")
}

async function runUnit(unit: Unit, offlineMock: boolean): Promise<Record<string, unknown>> {
  const item = config.cases.find(candidate => candidate.id === unit.caseId)
  if (!item) throw Error(`Unregistered case ${unit.caseId}`)
  const outRoot = path.join(root, offlineMock ? "mock-runs" : "runs", unit.id)
  await mkdir(outRoot, { recursive: true })
  const claimFile = path.join(outRoot, "claim.json")
  if (await exists(claimFile)) {
    const claim = await readJson(claimFile)
    if (claim.configSha256 !== configSha256 || claim.unit.id !== unit.id) throw Error(`Claim identity changed: ${unit.id}`)
    const report = await inspectLocalAuthorizationOutput(outRoot).catch(() => ({ status: "completion-unknown" }))
    return { unit: unit.id, action: "preserve-no-resend", status: report.status }
  }
  const inputFile = path.join(repo, item.input.path)
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", "v4", unit.reasoningStrategy)
  if (checked.status !== "valid") throw Error(`Invalid input ${unit.id}: ${JSON.stringify(checked.diagnostics)}`)
  const loaded = await loadLocalAuthorizationInput(inputFile)
  if (loaded.status !== "valid") throw Error(`Invalid source ${unit.id}`)
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw Error(`Invalid source catalog ${unit.id}`)
  const providerFactory = offlineMock ? (() => ({
    name: "AH-offline-mock",
    async complete() {
      return {
        text: "",
        toolCalls: [{ id: "mock", name: "submit_authorization_result", arguments: { results: compileAuthorizationTask(loaded.task).runnableObligations.map(obligation => ({
          obligationId: obligation.id, conclusion: "unknown", explanation: "Offline lifecycle check only; no semantic answer.",
          facts: ["entry", "binding", "control", "effect", "condition"].map(kind => ({ id: kind, kind, statement: "Offline mock citation.", citations: [{ sourceId: catalog.catalog.sources[0]!.sourceId, startLine: 1, endLine: 1 }] })),
          decisiveMissingFacts: ["Real registered model analysis."], suggestedObservations: ["No target execution in this check."],
        })) } }],
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" as const,
      }
    },
    async completeWithToolResults() { throw Error("Offline mock must never execute a target") },
  })) as Parameters<typeof executeLocalAuthorizationRun>[0]["providerFactory"] : undefined
  await writeFile(claimFile, `${JSON.stringify({ unit, configSha256, implementationRevision: config.implementationRevision, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
  console.log(JSON.stringify({ unit: unit.id, action: "start", offlineMock }))
  const common = {
    inputFile, model: config.model, outRoot, method: "plain" as const, wireVersion: "v4" as const,
    reasoningStrategy: unit.reasoningStrategy, executionOptions: config.executionOptions,
    ...(providerFactory ? { providerFactory } : {}),
  }
  const report = unit.arm.startsWith("M")
    ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(path.join(repo, item.markdown.path), "utf8"), instructionOrigin: "independent-author", instructionPath: item.markdown.path } })
    : await executeLocalAuthorizationRun(common)
  await writeFile(path.join(outRoot, "unit.json"), `${JSON.stringify({ unit, configSha256, report }, null, 2)}\n`, { flag: "wx" })
  const row = { unit: unit.id, action: "finished", status: report.status, sessionId: "sessionId" in report ? report.sessionId : null, offlineMock }
  await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), stage: offlineMock ? "AH7-mock" : "AH8", ...row })}\n`)
  return row
}

if (!["check", "run", "status", "evaluate", "replay"].includes(command ?? "")) throw Error("Usage: bun run-panel.ts check|run|status|evaluate|replay [--unit=<registered-id>]")
await verifyFrozenInputs()
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
if (command === "check") {
  const checks = []
  for (const item of config.cases) for (const reasoningStrategy of ["standard", "control-binding-v1"] as const) {
    const result = await checkLocalAuthorizationInput(path.join(repo, item.input.path), "B", "plain", "v4", reasoningStrategy)
    if (result.status !== "valid" || result.preview?.includes("evaluator/")) throw Error(`Offline check failed: ${item.id}/${reasoningStrategy}`)
    checks.push({ caseId: item.id, reasoningStrategy, status: result.status, previewCharacters: result.preview?.length ?? 0 })
  }
  const mock = await runUnit(config.units[0]!, true)
  if (mock.status !== "completed") throw Error(`Offline lifecycle failed: ${JSON.stringify(mock)}`)
  const report = { status: "valid", configSha256, cases: config.cases.length, units: config.units.length, checks, mock, networkProviderCalls: 0, targetExecutions: 0 }
  await writeFile(path.join(root, "pre-run-check.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
} else if (command === "run") {
  const only = process.argv.find(argument => argument.startsWith("--unit="))?.slice("--unit=".length)
  const selected = only ? config.units.filter(unit => unit.id === only) : config.units
  if (!selected.length) throw Error(`Unknown unit ${only}`)
  for (const unit of selected) {
    try { console.log(JSON.stringify(await runUnit(unit, false))) }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await writeFile(path.join(root, "runs", unit.id, "unit-error.json"), `${JSON.stringify({ unit, message, afterClaim: true }, null, 2)}\n`).catch(() => {})
      console.error(JSON.stringify({ unit: unit.id, status: "error-preserve-no-resend", message }))
    }
  }
} else if (command === "status") {
  const rows = []
  for (const unit of config.units) {
    const dir = path.join(root, "runs", unit.id)
    const claimed = await exists(path.join(dir, "claim.json"))
    const completed = await exists(path.join(dir, "unit.json"))
    const status = completed ? (await readJson(path.join(dir, "unit.json"))).report.status : claimed ? "completion-unknown" : "not-dispatched"
    rows.push({ unit: unit.id, status })
  }
  console.log(JSON.stringify({ planned: rows.length, claimed: rows.filter(row => row.status !== "not-dispatched").length, terminal: rows.filter(row => !["not-dispatched", "completion-unknown"].includes(row.status)).length, rows }, null, 2))
} else {
  await import("./evaluate-panel.ts")
}
