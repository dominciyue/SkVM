import {mkdir,readFile,writeFile} from "node:fs/promises"
import path from "node:path"
import {executeLocalAuthorizationRun} from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import {compareAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
import {loadLocalAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import {buildAuthorizationSourceCatalog} from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import {compileAuthorizationTask} from "../../../../../src/task-dsl/authorization/semantics.ts"
const root=path.join(import.meta.dir,"compare-demo")
await mkdir(path.join(root,"project/src"),{recursive:true})
const example=path.resolve(import.meta.dir,"../../../../../examples/authorization-assessment")
const source=await readFile(path.join(example,"project/src/record.ts"),"utf8")
await writeFile(path.join(root,"project/src/record.ts"),source)
const base=JSON.parse(await readFile(path.join(example,"authoring-v2.json"),"utf8"))
base.scenarios.second={...base.scenarios.archive}
const input=path.join(root,"original.json")
await writeFile(input,JSON.stringify(base,null,2)+"\n")
const loaded=await loadLocalAuthorizationInput(input)
if(loaded.status!=="valid")throw Error(JSON.stringify(loaded))
const catalog=buildAuthorizationSourceCatalog(loaded.sourceBundle)
if(!catalog.success)throw Error("catalog")
const run=await executeLocalAuthorizationRun({inputFile:input,model:"mock/offline",outRoot:path.join(root,"runs"),method:"plain",wireVersion:"v4",providerFactory:()=>({name:"mock",async complete(){return {text:"",toolCalls:[{id:"demo",name:"submit_authorization_result",arguments:{results:compileAuthorizationTask(loaded.task).runnableObligations.map(o=>({obligationId:o.id,conclusion:"unknown",explanation:"Synthetic lifecycle demonstration only, no semantic claim.",facts:["entry","binding","control","effect"].map(kind=>({id:kind,kind,statement:"Mock source fact",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:11,endLine:11}]})),decisiveMissingFacts:["Mock semantic review absent"],suggestedObservations:["Review source independently"]}))}}],tokens:{input:0,output:0,cacheRead:0,cacheWrite:0},durationMs:0,stopReason:"tool_use" as const}},async completeWithToolResults(){throw Error("forbidden")}})})
if(!("sessionPath" in run)||run.status!=="completed")throw Error(JSON.stringify(run))
const reports=[]
for(const [name,mutate] of [
  ["unchanged",(v:any)=>{}],
  ["principal",(v:any)=>{v.principals.support.capabilities.push("supervisor")}],
  ["policy",(v:any)=>{v.policies.archive.text="Only supervisors may archive records."}],
  ["rename",(v:any)=>{v.scenarios.renamed=v.scenarios.archive;delete v.scenarios.archive}],
] as Array<[string,(v:any)=>void]>) {
  const v=structuredClone(base);mutate(v)
  const p=path.join(root,`${name}.json`);await writeFile(p,JSON.stringify(v,null,2)+"\n")
  reports.push({change:name,report:await compareAuthorizationInput(run.sessionPath,p)})
}
await writeFile(path.join(root,"project/src/record.ts"),source+"\n// unrelated to final citations, still read by the model\n")
reports.push({change:"source",report:await compareAuthorizationInput(run.sessionPath,input)})
await writeFile(path.join(root,"comparison-results.json"),JSON.stringify({providerCalls:0,kind:"offline mock lifecycle; not semantic evidence",reports},null,2)+"\n")
console.log(JSON.stringify(reports.map(r=>({change:r.change,status:r.report.status,affected:r.report.affectedScenarioIds}))))
