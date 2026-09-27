import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { compareAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"

type Binding = { path: string; sha256: string }
type Unit = { id: string; packageId: string; phase: "original" | "changed"; representation: "markdown" | "dsl"; input: Binding; markdown?: Binding; scenarios: string[] }
type Config = { rubric: Binding; brief: Binding; sources: Binding[]; model: string; executionOptions: NonNullable<Parameters<typeof executeLocalAuthorizationRun>[0]["executionOptions"]>; units: Unit[] }
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const rawConfig = await readFile(path.join(root, "author-use-config.json"), "utf8")
const config = JSON.parse(rawConfig) as Config
const configSha256 = createHash("sha256").update(rawConfig).digest("hex")
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const command = process.argv[2]
if (!["check", "run", "status", "replay"].includes(command ?? "")) throw Error("Usage: bun run-use.ts check|run|status|replay [--unit=id]")
if (config.units.length !== 8 || config.units.reduce((sum, unit) => sum + unit.scenarios.length, 0) !== 16) throw Error("Registered use denominator changed")
for (const item of [config.rubric, config.brief, ...config.sources, ...config.units.flatMap(unit => [unit.input, ...(unit.markdown ? [unit.markdown] : [])])]) {
  if (hash(await readFile(path.join(repo, item.path))) !== item.sha256) throw Error(`Frozen author-use input changed: ${item.path}`)
}
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const outRoot = (unit: Unit) => path.join(root, "author-use-runs", unit.id)
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))

if (command === "check") {
  for (const unit of config.units) {
    const checked = await checkLocalAuthorizationInput(path.join(repo, unit.input.path), "B", "plain", "v6", "standard", "explicit-v1")
    if (checked.status !== "valid") throw Error(`${unit.id}: ${JSON.stringify(checked.diagnostics)}`)
    const scenarioIds = Object.keys((await readJson(path.join(repo, unit.input.path))).scenarios).sort()
    if (JSON.stringify(scenarioIds) !== JSON.stringify(unit.scenarios)) throw Error(`Scenario identity changed: ${unit.id}`)
  }
  console.log(JSON.stringify({ status: "valid", configSha256, sessions: 8, scenarioAnswers: 16, providerCalls: 0 }))
} else if (command === "run") {
  const only = process.argv.find(argument => argument.startsWith("--unit="))?.slice("--unit=".length)
  const selected = config.units.filter(unit => !only || unit.id === only)
  if (!selected.length) throw Error(`Unknown author-use unit ${only}`)
  for (const unit of selected) {
    const output = outRoot(unit)
    await mkdir(output, { recursive: true })
    const claimFile = path.join(output, "claim.json")
    if (await exists(claimFile)) {
      const claim = await readJson(claimFile)
      if (claim.configSha256 !== configSha256 || claim.unit.id !== unit.id) throw Error(`Claim identity differs: ${unit.id}`)
      const report = await inspectLocalAuthorizationOutput(output).catch(() => ({ status: "completion-unknown" }))
      console.log(JSON.stringify({ unit: unit.id, action: "preserve-no-resend", status: report.status }))
      continue
    }
    const inputFile = path.join(repo, unit.input.path)
    await writeFile(claimFile, `${JSON.stringify({ unit, configSha256, date: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
    try {
      console.log(JSON.stringify({ unit: unit.id, action: "start" }))
      const common = { inputFile, model: config.model, outRoot: output, method: "plain" as const, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, executionOptions: config.executionOptions }
      const report = unit.representation === "markdown"
        ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(path.join(repo, unit.markdown!.path), "utf8"), instructionOrigin: "independent-author", instructionPath: unit.markdown!.path } })
        : await executeLocalAuthorizationRun(common)
      await writeFile(path.join(output, "unit.json"), `${JSON.stringify({ unit, configSha256, report }, null, 2)}\n`, { flag: "wx" })
      const row = { unit: unit.id, action: "finished", status: report.status, sessionId: "sessionId" in report ? report.sessionId : null }
      await appendFile(path.join(root, "author-use-journal.jsonl"), `${JSON.stringify({ date: new Date().toISOString(), ...row })}\n`)
      console.log(JSON.stringify(row))
      try {
        const inspected = await inspectLocalAuthorizationOutput(output)
        const original = config.units.find(candidate => candidate.packageId === unit.packageId && candidate.phase === "original" && candidate.representation === unit.representation)
        const originalFile = original ? path.join(outRoot(original), "unit.json") : ""
        const prior = originalFile && await exists(originalFile) ? await readJson(originalFile) : null
        const comparison = unit.phase === "changed" && prior?.report?.sessionPath
          ? await compareAuthorizationInput(prior.report.sessionPath, inputFile) : null
        await writeFile(path.join(output, "post-run.json"), `${JSON.stringify({ inspected: { status: inspected.status, sessionId: inspected.sessionId }, comparison }, null, 2)}\n`, { flag: "wx" })
      } catch (error) {
        await writeFile(path.join(output, "post-run-error.json"), `${JSON.stringify({ message: error instanceof Error ? error.message : String(error) }, null, 2)}\n`, { flag: "wx" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await writeFile(path.join(output, "unit-error.json"), `${JSON.stringify({ unit, message, afterClaim: true }, null, 2)}\n`)
      console.error(JSON.stringify({ unit: unit.id, status: "error-preserve-no-resend", message }))
    }
  }
} else if (command === "status") {
  const rows = []
  for (const unit of config.units) {
    const output = outRoot(unit)
    rows.push({ unit: unit.id, status: await exists(path.join(output, "unit.json")) ? (await readJson(path.join(output, "unit.json"))).report.status : await exists(path.join(output, "claim.json")) ? "completion-unknown" : "not-dispatched" })
  }
  console.log(JSON.stringify({ configSha256, rows }, null, 2))
} else {
  for (const unit of config.units) {
    const output = outRoot(unit)
    if (!await exists(path.join(output, "unit.json"))) continue
    const stored = await readJson(path.join(output, "unit.json"))
    const inspected = await inspectLocalAuthorizationOutput(output)
    if (stored.report.status !== inspected.status || stored.report.sessionId !== inspected.sessionId) throw Error(`Replay identity mismatch: ${unit.id}`)
  }
  console.log(JSON.stringify({ status: "replayed", configSha256, providerCalls: 0 }))
}
