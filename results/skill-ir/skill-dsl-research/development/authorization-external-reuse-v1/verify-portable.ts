import {mkdtemp,cp,readFile,writeFile} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {checkLocalAuthorizationInput,executeLocalAuthorizationRun,inspectLocalAuthorizationOutput} from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import {compareAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
import {loadLocalAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import {buildAuthorizationSourceCatalog} from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import {compileAuthorizationTask} from "../../../../../src/task-dsl/authorization/semantics.ts"
const root=import.meta.dir,repo=path.resolve(root,"../../../../..")
const workspace=await mkdtemp(path.join(os.tmpdir(),"skvm-ab-portable-"))
await cp(path.join(repo,"examples/authorization-assessment/reusable-skill"),workspace,{recursive:true})
const inputFile=path.join(workspace,"authoring.json"),outRoot=path.join(workspace,"runs")
const check=await checkLocalAuthorizationInput(inputFile,"B","plain","v4")
if(check.status!=="valid")throw Error(JSON.stringify(check.diagnostics))
const loaded=await loadLocalAuthorizationInput(inputFile);if(loaded.status!=="valid")throw Error("invalid")
const catalog=buildAuthorizationSourceCatalog(loaded.sourceBundle);if(!catalog.success)throw Error("catalog")
let calls=0
const report=await executeLocalAuthorizationRun({inputFile,outRoot,model:"mock/portable",method:"plain",wireVersion:"v4",providerFactory:()=>({name:"portable",async complete(){calls++;return{text:"",toolCalls:[{id:"mock",name:"submit_authorization_result",arguments:{results:compileAuthorizationTask(loaded.task).runnableObligations.map(o=>({obligationId:o.id,conclusion:"unknown",explanation:"Portable lifecycle only",facts:["entry","binding","control","effect","condition"].map(kind=>({id:kind,kind,statement:"Mock only",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:1,endLine:1}]})),decisiveMissingFacts:["Mock"],suggestedObservations:["None"]}))}}],tokens:{input:1,output:1},durationMs:1,stopReason:"tool_use" as const}},async completeWithToolResults(){throw Error("no tool")}})})
const inspected=await inspectLocalAuthorizationOutput(outRoot)
const current=await compareAuthorizationInput(report.sessionPath,inputFile)
const changed=JSON.parse(await readFile(inputFile,"utf8"));changed.principals.support.facts=["Is a supervisor"];changed.scenarios.archive.relation="supervisor";changed.scenarios.archive.expectation="allow";changed.request="May this supervisor archive the record?"
const changedPath=path.join(workspace,"changed.json");await writeFile(changedPath,JSON.stringify(changed,null,2))
const impact=await compareAuthorizationInput(report.sessionPath,changedPath)
if(report.status!=="completed"||inspected.status!=="completed"||current.status!=="current"||impact.status!=="needs-review"||calls!==1)throw Error("portable verification failed")
await writeFile(path.join(root,"portable-verification.json"),JSON.stringify({workspace,check:check.status,run:report.status,inspect:inspected.status,current,impact,mockCalls:calls,paidCalls:0,retainedForInspection:true},null,2)+"\n")
console.log(JSON.stringify({check:check.status,run:report.status,inspect:inspected.status,compare:impact.status,mockCalls:calls,paidCalls:0}))
