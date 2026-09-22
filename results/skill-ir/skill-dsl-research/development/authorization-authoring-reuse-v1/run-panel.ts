// Frozen one-round orchestration; all analysis uses the ordinary local host.
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import {loadLocalAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import {buildAuthorizationSourceCatalog} from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import {compileAuthorizationTask} from "../../../../../src/task-dsl/authorization/semantics.ts"
const mock = process.argv.includes("--mock")
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const configFile = process.argv.find(a => a.startsWith("--config="))?.slice(9) ?? "panel-config.json"
const bytes = await readFile(path.join(root, configFile), "utf8")
const config = JSON.parse(bytes)
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
for (const c of config.cases) {
  if (hash(await readFile(path.join(repo, c.input))) !== c.inputSha256) throw new Error(`Changed input ${c.id}`)
  for (const s of c.sources) if (hash(await readFile(path.join(repo, s.path))) !== s.sha256) throw new Error(`Changed source ${s.path}`)
  for (const unit of config.units.filter((u:any)=>u.caseId===c.id)) {
    const check = await checkLocalAuthorizationInput(path.join(repo,c.input), "B", unit.method, unit.wire)
    if(check.status!=="valid") throw new Error(JSON.stringify(check.diagnostics))
  }
}
if (process.argv.includes("--check")) { console.log(JSON.stringify({ status: "valid", cases: config.cases.length, units: config.units.length, configSha256: hash(bytes), providerCalls: 0 })); process.exit(0) }
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
for (const unit of config.units) {
  const outRoot = path.join(root, mock ? "mock-runs" : "runs", unit.id)
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
  const loaded=await loadLocalAuthorizationInput(path.join(repo,c.input))
  if(loaded.status!=="valid")throw Error("input invalid")
  const catalog=buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if(!catalog.success)throw Error("catalog invalid")
  const providerFactory = mock ? ()=>({name:"AA-mock",async complete(){
    if(process.argv.includes("--mock-failure") && unit.id===config.units[0].id)throw Error("intentional mock failure")
    return {text:"",toolCalls:[{id:"mock",name:"submit_authorization_result",arguments:{results:compileAuthorizationTask(loaded.task).runnableObligations.map(o=>({obligationId:o.id,conclusion:"unknown",explanation:"Mock lifecycle only; no semantic evaluation",facts:["entry","binding","control","effect","condition"].map(kind=>({id:kind,kind,statement:"Mock fact",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:loaded.sourceBundle.files[0]!.cropRange.startLine,endLine:loaded.sourceBundle.files[0]!.cropRange.startLine}]})),decisiveMissingFacts:["Mock unknown"],suggestedObservations:["No real observation"],...(unit.method!=="plain"?{coverage:loaded.analysisPlan.entries.filter(e=>e.obligationId===o.id).map(e=>({requirementId:e.requirementId,status:"unknown",explanation:"Mock only",factIds:[]}))}:{}),...(unit.method==="conditions"?{condition:{branches:[{id:"mock",assumptions:loaded.conditionPlan!.entries.find(e=>e.obligationId===o.id)!.conditions.map(c=>({conditionId:c.id,value:"unknown"})),effect:"unknown",explanation:"Mock unknown",factIds:[],missingFacts:["Mock unknown"]}],unexaminedConditionIds:[],completeness:"bounded",limitations:["Mock only"]}}:{})}))}}],tokens:{input:1,output:1,cacheRead:0,cacheWrite:0},durationMs:1,stopReason:"tool_use" as const}
  },async completeWithToolResults(){throw Error("no target execution")}}):undefined
  const report = await executeLocalAuthorizationRun({ inputFile: path.join(repo, c.input), model: config.model, outRoot, method: unit.method, wireVersion: unit.wire, executionOptions: config.executionOptions, ...(providerFactory?{providerFactory}:{}) })
  await writeFile(path.join(outRoot, "unit.json"), JSON.stringify({ unit, configSha256: hash(bytes), report }, null, 2), { encoding: "utf8", flag: "wx" })
  console.log(JSON.stringify({ unit: unit.id, status: report.status, ...( "telemetry" in report ? { telemetry: report.telemetry } : {}) }))
}
