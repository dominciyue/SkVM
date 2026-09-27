import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"

type Arm = "M0" | "D0" | "M1" | "D1"
type Phase = "initial" | "repeat" | "outcome-only"
type Wire = "v4" | "v6"
type AssessmentMode = "legacy" | "explicit-v1"
type FileBinding = { path: string; sha256: string }
type Case = { id: string; taskId: string; input: FileBinding; markdown: FileBinding; sources: FileBinding[]; publicInstructionSha256: string }
type Unit = { id: string; phase: Phase; caseId: string; arm: Arm; wire: Wire; assessmentMode: AssessmentMode; mechanism?: string }
type Config = {
  implementationRevision: string
  implementation: FileBinding[]
  publicRequirementsSha256: string
  rubricSha256: string
  model: string
  executionOptions: NonNullable<Parameters<typeof executeLocalAuthorizationRun>[0]["executionOptions"]> & { maxProviderDispatches: number }
  cases: Case[]
  units: Unit[]
}

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const command = process.argv[2]
const rawConfig = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(rawConfig) as Config
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const configSha256 = hash(rawConfig)
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const count = (text: string, fragment: string) => text.split(fragment).length - 1

// This generation path reads only registered model-visible material. The
// independent evaluator is intentionally outside its imports and file reads.
async function verifyFrozenInputs(): Promise<void> {
  const bound = [...config.implementation, { path: path.relative(repo, path.join(root, "public-requirements.json")), sha256: config.publicRequirementsSha256 }, { path: path.relative(repo, path.join(root, "rubric.json")), sha256: config.rubricSha256 }]
  for (const file of bound) if (hash(await readFile(path.join(repo, file.path))) !== file.sha256) throw Error(`Frozen material changed: ${file.path}`)
  for (const item of config.cases) {
    for (const file of [item.input, item.markdown, ...item.sources]) if (hash(await readFile(path.join(repo, file.path))) !== file.sha256) throw Error(`Model-visible material changed: ${file.path}`)
    const authored = await readJson(path.join(repo, item.input.path))
    if (hash(authored.analysisContract?.publicInstruction ?? "") !== item.publicInstructionSha256) throw Error(`Public requirement identity changed: ${item.id}`)
  }
  const phases = { initial: 32, repeat: 16, "outcome-only": 6 }
  if (config.cases.length !== 8 || config.units.length !== 54 || new Set(config.units.map(unit => unit.id)).size !== 54) throw Error("Registered denominator changed")
  for (const [phase, expected] of Object.entries(phases)) if (config.units.filter(unit => unit.phase === phase).length !== expected) throw Error(`Registered ${phase} denominator changed`)
  for (const unit of config.units) {
    if (!config.cases.some(item => item.id === unit.caseId)) throw Error(`Unregistered case ${unit.caseId}`)
    if ((unit.phase === "outcome-only" || unit.arm.endsWith("0") ? "legacy" : "explicit-v1") !== unit.assessmentMode) throw Error(`Assessment mode drift: ${unit.id}`)
    if ((unit.phase === "outcome-only" || unit.arm.endsWith("1") ? "v6" : "v4") !== unit.wire) throw Error(`Wire drift: ${unit.id}`)
  }
}

async function mockProvider(inputFile: string) {
  const loaded = await loadLocalAuthorizationInput(inputFile)
  if (loaded.status !== "valid") throw Error("Offline mock input invalid")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw Error("Offline mock source catalog invalid")
  const sourceId = catalog.catalog.sources[0]!.sourceId
  return (() => ({
    name: "AI-offline-mock",
    async complete() {
      const results = compileAuthorizationTask(loaded.task).runnableObligations.map(obligation => ({
        obligationId: obligation.id,
        decision: obligation.obligation.expectation === "conditional" ? { kind: "conditional-policy", policyStatus: "undetermined" } : { kind: "observed", observed: "unknown" },
        explanation: "Offline lifecycle check only; no semantic answer.",
        facts: ["entry", "binding", "control", "effect", "condition"].map((kind, index) => ({ id: `f${index}`, kind, statement: "Offline mock citation only.", citations: [{ sourceId, startLine: 1, endLine: 1 }] })),
        decisiveMissingFacts: ["Real registered model analysis."], suggestedObservations: ["No target execution in this check."], branchResults: [],
      }))
      return { text: "", toolCalls: [{ id: "mock", name: "submit_authorization_result", arguments: { results } }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" as const }
    },
    async completeWithToolResults() { throw Error("Offline mock must never execute a target") },
  })) as Parameters<typeof executeLocalAuthorizationRun>[0]["providerFactory"]
}

async function runUnit(unit: Unit, offlineMock: boolean): Promise<Record<string, unknown>> {
  const item = config.cases.find(candidate => candidate.id === unit.caseId)!
  const outRoot = offlineMock ? path.join(root, "mock-runs", configSha256, unit.id) : path.join(root, "runs", unit.id)
  await mkdir(outRoot, { recursive: true })
  const claimFile = path.join(outRoot, "claim.json")
  if (await exists(claimFile)) {
    const claim = await readJson(claimFile)
    if (claim.configSha256 !== configSha256 || claim.unit.id !== unit.id) throw Error(`Claim identity changed: ${unit.id}`)
    const report = await inspectLocalAuthorizationOutput(outRoot).catch(() => ({ status: "completion-unknown" }))
    return { unit: unit.id, action: "preserve-no-resend", status: report.status }
  }
  const inputFile = path.join(repo, item.input.path)
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", unit.wire, "standard", unit.assessmentMode)
  if (checked.status !== "valid") throw Error(`Invalid registered input ${unit.id}: ${JSON.stringify(checked.diagnostics)}`)
  const providerFactory = offlineMock ? await mockProvider(inputFile) : undefined
  await writeFile(claimFile, `${JSON.stringify({ unit, configSha256, implementationRevision: config.implementationRevision, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
  console.log(JSON.stringify({ unit: unit.id, action: "start", offlineMock }))
  const common = { inputFile, model: config.model, outRoot, method: "plain" as const, wireVersion: unit.wire, assessmentMode: unit.assessmentMode, executionOptions: config.executionOptions, ...(providerFactory ? { providerFactory } : {}) }
  const report = unit.arm.startsWith("M")
    ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(path.join(repo, item.markdown.path), "utf8"), instructionOrigin: "independent-author", instructionPath: item.markdown.path } })
    : await executeLocalAuthorizationRun(common)
  await writeFile(path.join(outRoot, "unit.json"), `${JSON.stringify({ unit, configSha256, report }, null, 2)}\n`, { flag: "wx" })
  const row = { unit: unit.id, action: "finished", status: report.status, sessionId: "sessionId" in report ? report.sessionId : null, offlineMock }
  await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), stage: offlineMock ? "AI8-mock" : "AI9", ...row })}\n`)
  return row
}

if (!["check", "run", "status", "evaluate", "replay"].includes(command ?? "")) throw Error("Usage: bun run-panel.ts check|run|status|evaluate|replay [--phase=initial|repeat|outcome-only] [--unit=<registered-id>] [--parallel=1..4]")
await verifyFrozenInputs()
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
if (command === "check") {
  const commonInstruction = (await readJson(path.join(root, "public-requirements.json"))).commonInstruction as string
  const checks = []
  for (const item of config.cases) for (const assessmentMode of ["legacy", "explicit-v1"] as const) {
    const wire = assessmentMode === "legacy" ? "v4" : "v6"
    const checked = await checkLocalAuthorizationInput(path.join(repo, item.input.path), "B", "plain", wire, "standard", assessmentMode)
    const authored = await readJson(path.join(repo, item.input.path))
    if (checked.status !== "valid" || !checked.preview || count(checked.preview, commonInstruction) !== 1 || count(checked.preview, authored.analysisContract.publicInstruction) !== 1 || checked.preview.includes("evaluator/")) throw Error(`Offline check failed: ${item.id}/${assessmentMode}: ${JSON.stringify(checked.diagnostics)}`)
    checks.push({ caseId: item.id, assessmentMode, wire, status: checked.status, previewCharacters: checked.preview.length })
  }
  const mock = await runUnit(config.units.find(unit => unit.id === "initial-owui-file-M1")!, true)
  if (mock.status !== "completed") throw Error(`Offline lifecycle failed: ${JSON.stringify(mock)}`)
  const report = { status: "valid", configSha256, cases: config.cases.length, units: config.units.length, checks, mock, networkProviderCalls: 0, targetExecutions: 0 }
  await writeFile(path.join(root, "pre-run-check.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report))
} else if (command === "run") {
  const only = process.argv.find(argument => argument.startsWith("--unit="))?.slice("--unit=".length)
  const phase = process.argv.find(argument => argument.startsWith("--phase="))?.slice("--phase=".length)
  const parallelText = process.argv.find(argument => argument.startsWith("--parallel="))?.slice("--parallel=".length)
  const parallel = parallelText === undefined ? config.executionOptions.maxProviderDispatches : Number(parallelText)
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > config.executionOptions.maxProviderDispatches) throw Error(`Parallel dispatch must be an integer from 1 to ${config.executionOptions.maxProviderDispatches}`)
  if (phase && !["initial", "repeat", "outcome-only"].includes(phase)) throw Error(`Unknown phase ${phase}`)
  const selected = config.units.filter(unit => (!only || unit.id === only) && (!phase || unit.phase === phase))
  if (!selected.length) throw Error(`Unknown selection ${only ?? phase}`)
  let next = 0
  const worker = async () => {
    while (next < selected.length) {
      const unit = selected[next++]!
      try { console.log(JSON.stringify(await runUnit(unit, false))) }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const outRoot = path.join(root, "runs", unit.id)
        await mkdir(outRoot, { recursive: true })
        await writeFile(path.join(outRoot, "unit-error.json"), `${JSON.stringify({ unit, message, afterClaim: await exists(path.join(outRoot, "claim.json")) }, null, 2)}\n`)
        console.error(JSON.stringify({ unit: unit.id, status: "error-preserve-no-resend", message }))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, selected.length) }, worker))
} else if (command === "status") {
  const rows = []
  for (const unit of config.units) {
    const dir = path.join(root, "runs", unit.id)
    const claimed = await exists(path.join(dir, "claim.json"))
    const completed = await exists(path.join(dir, "unit.json"))
    const status = completed ? (await readJson(path.join(dir, "unit.json"))).report.status : claimed ? "completion-unknown" : "not-dispatched"
    rows.push({ unit: unit.id, phase: unit.phase, status })
  }
  console.log(JSON.stringify({ planned: rows.length, claimed: rows.filter(row => row.status !== "not-dispatched").length, terminal: rows.filter(row => !["not-dispatched", "completion-unknown"].includes(row.status)).length, byPhase: { initial: 32, repeat: 16, "outcome-only": 6 }, rows }, null, 2))
} else {
  await import("./evaluate-panel.ts")
}
