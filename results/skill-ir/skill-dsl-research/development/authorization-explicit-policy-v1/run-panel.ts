import { createHash } from "node:crypto"
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"
const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const checkOnly = process.argv.includes("--check"), bytes = await readFile(path.join(root, "panel-config.json"), "utf8"), config = JSON.parse(bytes)
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex")
const exists = async (p: string) => { try { await access(p); return true } catch { return false } }
// Hash only registered model-visible material. The evaluator never enters this process.
for (const file of config.implementation) if (hash(await readFile(path.join(repo, file.path))) !== file.sha256) throw Error(`Implementation changed: ${file.path}`)
for (const c of config.cases) {
  for (const key of ["dsl", "markdown", "manifest"]) if (hash(await readFile(path.join(repo, c[key]))) !== c[key + "Sha256"]) throw Error(`Changed ${key}: ${c.id}`)
  for (const s of c.sources) if (hash(await readFile(path.join(repo, s.path))) !== s.sha256) throw Error(`Changed source: ${s.path}`)
}
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const checks: any[] = []
for (const unit of config.units) {
  const c = config.cases.find((c: any) => c.id === unit.caseId), outRoot = path.join(root, checkOnly ? "mock-runs" : "runs", unit.id)
  await mkdir(outRoot, { recursive: true })
  const claim = path.join(outRoot, "claim.json")
  if (await exists(claim)) {
    if (JSON.parse(await readFile(claim, "utf8")).configSha256 !== hash(bytes)) throw Error("Claim identity changed")
    const report = await inspectLocalAuthorizationOutput(outRoot).catch(() => ({ status: "completion-unknown" }))
    console.log(JSON.stringify({ unit: unit.id, action: "preserve-no-resend", status: report.status }))
    continue
  }
  const inputFile = path.join(repo, unit.arm === "dsl" ? c.dsl : c.manifest)
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", unit.wire)
  if (checked.status !== "valid") throw Error(JSON.stringify(checked.diagnostics))
  const loaded = await loadLocalAuthorizationInput(inputFile)
  if (loaded.status !== "valid") throw Error("Input invalid")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw Error("Sources invalid")
  const providerFactory = checkOnly ? () => ({ name: "AE-mock", async complete() { return { text: "", toolCalls: [{ id: "mock", name: "submit_authorization_result", arguments: { results: compileAuthorizationTask(loaded.task).runnableObligations.map(o => ({ obligationId: o.id, ...(unit.wire === "v5" ? { policyStatus: "undetermined" } : { conclusion: "unknown" }), explanation: "Mock lifecycle only; no task answer.", facts: ["entry", "binding", "control", "effect", "condition"].map(kind => ({ id: kind, kind, statement: "Mock citation.", citations: [{ sourceId: catalog.catalog.sources[0]!.sourceId, startLine: 1, endLine: 1 }] })), decisiveMissingFacts: ["No semantic analysis in mock."], suggestedObservations: ["Real registered model analysis."] })) } }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" as const } }, async completeWithToolResults() { throw Error("No target execution") } }) : undefined
  await writeFile(claim, JSON.stringify({ unit, configSha256: hash(bytes), implementationRevision: config.implementationRevision, createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ unit: unit.id, action: "start" }))
  const common = { inputFile, model: config.model, outRoot, method: "plain" as const, wireVersion: unit.wire, executionOptions: config.executionOptions, ...(providerFactory ? { providerFactory } : {}) }
  const report = unit.arm === "dsl" ? await executeLocalAuthorizationRun(common) : await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(path.join(repo, c.markdown), "utf8"), instructionOrigin: "independent-author", instructionPath: c.markdown } })
  await writeFile(path.join(outRoot, "unit.json"), JSON.stringify({ unit, configSha256: hash(bytes), report }, null, 2) + "\n", { flag: "wx" })
  checks.push({ unit: unit.id, status: report.status, wire: report.wireVersion })
  console.log(JSON.stringify(checks.at(-1)))
  await appendFile(path.join(root, "journal.jsonl"), JSON.stringify({ date: new Date().toISOString(), stage: checkOnly ? "AE4" : "AE5", ...checks.at(-1) }) + "\n")
  if (checkOnly && report.status !== "completed") throw Error("Mock unit failed")
}
if (checkOnly) await writeFile(path.join(root, "pre-run-check.json"), JSON.stringify({ status: "valid", cases: config.cases.length, units: checks.length, networkProviderCalls: 0, targetExecutions: 0, checks }, null, 2) + "\n")
