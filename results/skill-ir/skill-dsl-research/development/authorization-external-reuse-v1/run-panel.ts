import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"
import {mkdir,readFile,writeFile,access} from "node:fs/promises"
import path from "node:path"
import {checkLocalAuthorizationInput,executeLocalAuthorizationRun,inspectLocalAuthorizationOutput} from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import {executeMarkdownStudyRun} from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import {loadLocalAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import {buildAuthorizationSourceCatalog} from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import {compileAuthorizationTask} from "../../../../../src/task-dsl/authorization/semantics.ts"
const root=import.meta.dir,repo=path.resolve(root,"../../../../..")
const mock=process.argv.includes("--mock")
const bytes=await readFile(path.join(root,"panel-config.json"),"utf8"),config=JSON.parse(bytes)
const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest("hex")
const exists=async(p:string)=>{try{await access(p);return true}catch{return false}}
const checks=[]
for(const c of config.cases){
 for(const key of ["dsl","markdown","manifest"]) if(hash(await readFile(path.join(repo,c[key])))!==c[key+"Sha256"])throw Error(`Changed ${key}: ${c.id}`)
 for(const s of c.sources)if(hash(await readFile(path.join(repo,s.path)))!==s.sha256)throw Error(`Changed source ${s.path}`)
 for(const key of ["dsl","manifest"]){const check=await checkLocalAuthorizationInput(path.join(repo,c[key]),"B","plain","v4");checks.push({case:c.id,input:key,status:check.status,diagnostics:check.diagnostics});if(check.status!=="valid")throw Error(JSON.stringify(checks.at(-1)))}
 if(!(await readFile(path.join(repo,c.markdown),"utf8")).trim())throw Error("Empty Markdown")
}
if(process.argv.includes("--check")){await writeFile(path.join(root,"final-checks.json"),JSON.stringify(checks,null,2)+"\n");console.log(JSON.stringify({status:"valid",cases:config.cases.length,units:config.units.length,providerCalls:0}));process.exit(0)}
process.env.SKVM_AUTO_PROBE="0";process.env.SKVM_CACHE=path.join(repo,".skvm")
for(const unit of config.units){
 const outRoot=path.join(root,mock?"mock-runs":"runs",unit.id)
 await mkdir(outRoot,{recursive:true});const claim=path.join(outRoot,"claim.json")
 if(await exists(claim)){
  if(JSON.parse(await readFile(claim,"utf8")).configSha256!==hash(bytes))throw Error("Claim identity mismatch")
  const report=await inspectLocalAuthorizationOutput(outRoot).catch(()=>({status:"completion-unknown"}))
  console.log(JSON.stringify({unit:unit.id,action:"preserve-no-resend",status:report.status}));continue
 }
 await writeFile(claim,JSON.stringify({unit,configSha256:hash(bytes),implementationRevision:execFileSync("git",["rev-parse","HEAD"],{cwd:repo,encoding:"utf8"}).trim(),createdAt:new Date().toISOString()},null,2)+"\n",{flag:"wx"})
 const c=config.cases.find((c:any)=>c.id===unit.caseId),inputFile=path.join(repo,unit.arm==="dsl"?c.dsl:c.manifest)
 console.log(JSON.stringify({unit:unit.id,action:"start"}))
 const loaded=await loadLocalAuthorizationInput(inputFile);if(loaded.status!=="valid")throw Error("invalid input")
 const catalog=buildAuthorizationSourceCatalog(loaded.sourceBundle);if(!catalog.success)throw Error("invalid sources")
 const providerFactory=mock?()=>({name:"AB-mock",async complete(){return{text:"",toolCalls:[{id:"mock",name:"submit_authorization_result",arguments:{results:compileAuthorizationTask(loaded.task).runnableObligations.map(o=>({obligationId:o.id,conclusion:"unknown",explanation:"Mock lifecycle only",facts:["entry","binding","control","effect","condition"].map(kind=>({id:kind,kind,statement:"Mock fact",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:1,endLine:1}]})),decisiveMissingFacts:["Mock unknown"],suggestedObservations:["No real observation"]}))}}],tokens:{input:1,output:1,cacheRead:0,cacheWrite:0},durationMs:1,stopReason:"tool_use" as const}},async completeWithToolResults(){throw Error("no target execution")}}):undefined
 const common={inputFile,model:config.model,outRoot,method:"plain" as const,wireVersion:"v4" as const,executionOptions:config.executionOptions,...(providerFactory?{providerFactory}:{})}
 const report=unit.arm==="dsl"?await executeLocalAuthorizationRun(common):await executeMarkdownStudyRun({...common,markdown:{instructions:await readFile(path.join(repo,c.markdown),"utf8"),instructionOrigin:"independent-author",instructionPath:c.markdown}})
 await writeFile(path.join(outRoot,"unit.json"),JSON.stringify({unit,configSha256:hash(bytes),report},null,2)+"\n",{flag:"wx"})
 console.log(JSON.stringify({unit:unit.id,status:report.status}))
}
