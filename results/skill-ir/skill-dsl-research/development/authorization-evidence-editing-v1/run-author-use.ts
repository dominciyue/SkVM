import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { compareAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

type Binding = { path: string; sha256: string }
type Unit = { id: string; packageId: string; phase: "original" | "changed"; representation: "markdown" | "dsl";
  input: Binding; markdown?: Binding; scenarios: string[] }
type Config = { schemaVersion: "authorization-aj-author-use-config/v1"; planSha256: string; brief: Binding;
  selected: Binding[]; sources: Binding[]; implementation: Binding[]; model: string;
  executionOptions: NonNullable<Parameters<typeof executeLocalAuthorizationRun>[0]["executionOptions"]>; units: Unit[] }
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const rawConfig = await readFile(path.join(root, "author-use-config.json"), "utf8")
const config = JSON.parse(rawConfig) as Config
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const configSha256 = hash(rawConfig)
const absolute = (file: Binding) => path.join(repo, ...file.path.split("/"))
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const command = process.argv[2]
if (!["check", "run", "status", "replay"].includes(command ?? "")) throw new Error("Usage: bun run-author-use.ts check|run|status|replay [--count=1..4]")
if (config.schemaVersion !== "authorization-aj-author-use-config/v1" || config.units.length !== 8
  || config.units.reduce((sum, unit) => sum + unit.scenarios.length, 0) !== 16) throw new Error("Author-use denominator changed")
if (hash(await readFile(path.join(root, "author-use-plan.json"))) !== config.planSha256) throw new Error("Author-use plan changed")
for (const binding of [config.brief, ...config.selected, ...config.sources, ...config.implementation,
  ...config.units.flatMap(unit => [unit.input, ...(unit.markdown ? [unit.markdown] : [])])])
  if (hash(await readFile(absolute(binding))) !== binding.sha256) throw new Error(`Frozen author-use file changed: ${binding.path}`)
for (const unit of config.units) {
  const loaded = await loadLocalAuthorizationInput(absolute(unit.input))
  if (loaded.status !== "valid") throw new Error(`Invalid author-use input ${unit.id}`)
  if (JSON.stringify(loaded.task.obligations.map(item => item.id.replace(/^scenario:/, "")).sort()) !== JSON.stringify(unit.scenarios))
    throw new Error(`Scenario identity changed ${unit.id}`)
}
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const outRoot = (unit: Unit) => path.join(root, "author-use-runs", unit.id)

async function runUnit(unit: Unit): Promise<{ unit: string; action: string; status: string }> {
  const output = outRoot(unit)
  await mkdir(output, { recursive: true })
  const claimFile = path.join(output, "claim.json")
  if (await exists(claimFile)) {
    const claim = await readJson(claimFile)
    if (claim.configSha256 !== configSha256 || claim.unit.id !== unit.id) throw new Error(`Claim changed ${unit.id}`)
    const inspected = await inspectLocalAuthorizationOutput(output).catch(() => ({ status: "completion-unknown" }))
    return { unit: unit.id, action: "preserve-no-resend", status: inspected.status }
  }
  const inputFile = absolute(unit.input)
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", "v6", "standard", "explicit-v1")
  if (checked.status !== "valid") throw new Error(`Input check failed ${unit.id}: ${JSON.stringify(checked.diagnostics)}`)
  await writeFile(claimFile, `${JSON.stringify({ unit, configSha256, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ unit: unit.id, action: "start" })}\n`)
  const common = { inputFile, model: config.model, outRoot: output, method: "plain" as const,
    wireVersion: "v6" as const, reasoningStrategy: "standard" as const,
    assessmentMode: "explicit-v1" as const, executionOptions: config.executionOptions }
  const report = unit.representation === "markdown"
    ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(absolute(unit.markdown!), "utf8"),
      instructionOrigin: "independent-author", instructionPath: unit.markdown!.path } })
    : await executeLocalAuthorizationRun(common)
  await writeFile(path.join(output, "unit.json"), `${JSON.stringify({ unit, configSha256, report }, null, 2)}\n`, { flag: "wx" })
  const row = { unit: unit.id, action: "finished", status: report.status }
  await appendFile(path.join(root, "journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), stage: "AJ12", ...row })}\n`)
  const inspected = await inspectLocalAuthorizationOutput(output)
  const priorUnit = config.units.find(candidate => candidate.packageId === unit.packageId
    && candidate.representation === unit.representation && candidate.phase === "original")
  const priorFile = priorUnit ? path.join(outRoot(priorUnit), "unit.json") : ""
  const prior = unit.phase === "changed" && priorFile && await exists(priorFile) ? await readJson(priorFile) : null
  const comparison = unit.phase === "changed" && prior?.report?.sessionPath
    ? await compareAuthorizationInput(prior.report.sessionPath, inputFile) : null
  await writeFile(path.join(output, "post-run.json"), `${JSON.stringify({ inspected: { status: inspected.status, sessionId: inspected.sessionId }, comparison }, null, 2)}\n`, { flag: "wx" })
  return row
}

if (command === "check") {
  const rows = []
  for (const unit of config.units) {
    const checked = await checkLocalAuthorizationInput(absolute(unit.input), "B", "plain", "v6", "standard", "explicit-v1")
    if (checked.status !== "valid" || !checked.preview) throw new Error(`Author-use check failed ${unit.id}`)
    rows.push({ id: unit.id, status: "valid", previewCharacters: checked.preview.length })
  }
  await writeFile(path.join(root, "author-use-pre-run-check.json"), `${JSON.stringify({ configSha256, rows, providerCalls: 0 }, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ status: "valid", configSha256, units: rows.length, scenarios: 16, providerCalls: 0 })}\n`)
} else if (command === "run") {
  const count = Number(process.argv.find(arg => arg.startsWith("--count="))?.slice(8) ?? "1")
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count must be 1..4")
  let dispatched = 0, failures = 0
  for (const unit of config.units) {
    if (dispatched >= count) break
    if (await exists(path.join(outRoot(unit), "claim.json"))) continue
    try {
      const row = await runUnit(unit)
      process.stdout.write(`${JSON.stringify(row)}\n`)
      dispatched++
      failures = row.status === "transport-failed" ? failures + 1 : 0
    } catch (error) {
      const output = outRoot(unit)
      await mkdir(output, { recursive: true })
      const message = error instanceof Error ? error.message : String(error)
      await writeFile(path.join(output, "unit-error.json"), `${JSON.stringify({ unit, message, afterClaim: await exists(path.join(output, "claim.json")) }, null, 2)}\n`, { flag: "wx" })
      process.stderr.write(`${JSON.stringify({ unit: unit.id, status: "error-preserve-no-resend", message })}\n`)
      break
    }
    if (failures >= 2) { process.stderr.write("Two consecutive transport failures; stop new dispatch until reviewed.\n"); break }
  }
} else {
  const rows = []
  for (const unit of config.units) {
    const output = outRoot(unit)
    const claimed = await exists(path.join(output, "claim.json"))
    const completed = await exists(path.join(output, "unit.json"))
    const stored = completed ? await readJson(path.join(output, "unit.json")) : null
    if (stored && (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id)) throw new Error(`Run identity changed ${unit.id}`)
    const inspected = command === "replay" && completed ? await inspectLocalAuthorizationOutput(output) : null
    rows.push({ id: unit.id, status: completed ? stored.report.status : claimed ? "completion-unknown" : "not-dispatched",
      ...(inspected ? { inspectedStatus: inspected.status } : {}) })
  }
  const report = { configSha256, planned: rows.length, terminal: rows.filter(row => !["not-dispatched", "completion-unknown"].includes(row.status)).length,
    rows, providerCallsThisCommand: 0, targetExecutionsThisCommand: 0 }
  if (command === "replay") await writeFile(path.join(root, "author-use-replay.json"), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
