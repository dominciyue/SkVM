// Frozen one-round orchestration; all analysis uses the ordinary local host.
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const bytes = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(bytes)
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
for (const c of config.cases) {
  if (hash(await readFile(path.join(repo, c.input))) !== c.inputSha256) throw new Error(`Changed input ${c.id}`)
  for (const s of c.sources) if (hash(await readFile(path.join(repo, s.path))) !== s.sha256) throw new Error(`Changed source ${s.path}`)
  for (const wire of ["legacy", "v4"] as const) {
    const check = await checkLocalAuthorizationInput(path.join(repo, c.input), "B", "conditions", wire)
    if (check.status !== "valid") throw new Error(JSON.stringify(check.diagnostics))
  }
}
if (process.argv.includes("--check")) { console.log(JSON.stringify({ status: "valid", cases: 4, units: 8, configSha256: hash(bytes), providerCalls: 0 })); process.exit(0) }
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
for (const unit of config.units) {
  const outRoot = path.join(root, "runs", unit.id)
  await mkdir(outRoot, { recursive: true })
  const claim = path.join(outRoot, "claim.json")
  if (await exists(claim)) {
    const identity = JSON.parse(await readFile(claim, "utf8"))
    if (identity.configSha256 !== hash(bytes)) throw new Error("Claim config mismatch")
    const report = await inspectLocalAuthorizationOutput(outRoot).catch(() => ({ status: "completion-unknown" }))
    console.log(JSON.stringify({ unit: unit.id, action: "preserve-no-resend", status: report.status }))
    continue
  }
  await writeFile(claim, JSON.stringify({ unit, configSha256: hash(bytes), implementationRevision: config.implementationRevision, createdAt: new Date().toISOString() }, null, 2), { encoding: "utf8", flag: "wx" })
  const c = config.cases.find((c: any) => c.id === unit.caseId)
  console.log(JSON.stringify({ unit: unit.id, action: "start" }))
  const report = await executeLocalAuthorizationRun({ inputFile: path.join(repo, c.input), model: config.model, outRoot, method: unit.method, wireVersion: unit.wire, executionOptions: config.executionOptions })
  await writeFile(path.join(outRoot, "unit.json"), JSON.stringify({ unit, configSha256: hash(bytes), report }, null, 2), { encoding: "utf8", flag: "wx" })
  console.log(JSON.stringify({ unit: unit.id, status: report.status, ...( "telemetry" in report ? { telemetry: report.telemetry } : {}) }))
}
