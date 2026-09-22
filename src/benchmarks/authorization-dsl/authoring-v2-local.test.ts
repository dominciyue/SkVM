import {test,expect,afterEach} from "bun:test"
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import path from "node:path"
import fixture from "../../../examples/authorization-assessment/authoring-v2.json"
import {runAuthorizationCli} from "../../cli/authorization.ts"
import {loadLocalAuthorizationInput} from "./local-input.ts"
import {executeLocalAuthorizationRun} from "./local-run.ts"
import {buildAuthorizationSourceCatalog} from "./inputs.ts"
import {compileAuthorizationTask} from "../../task-dsl/authorization/semantics.ts"

const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true})})
test("init v2, direct check/run and inspect retain raw/normalized/provenance with original source base",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"aa-v2-"));roots.push(root)
  await mkdir(path.join(root,"project/src"),{recursive:true})
  await writeFile(path.join(root,"project/src/record.ts"),await readFile(path.resolve(import.meta.dir,"../../../examples/authorization-assessment/project/src/record.ts")))
  const input=path.join(root,"authoring.json"), output:string[]=[]
  let factories=0
  const deps={stdout:(s:string)=>output.push(s),stderr:(s:string)=>output.push(s),providerFactory:()=>{factories++;throw Error("unexpected")}}
  expect(await runAuthorizationCli(["init","--format=authoring-v2",`--out=${input}`],deps)).toBe(0)
  expect(await runAuthorizationCli(["init","--format=authoring-v2",`--out=${input}`],deps)).toBe(1)
  expect(await runAuthorizationCli(["check",`--input=${input}`,"--method=plain","--wire=v4"],deps)).toBe(0)
  expect(factories).toBe(0)
  const badLocation=structuredClone(fixture);badLocation.entries.archive.locations[0]!.endLine=999
  await writeFile(input,JSON.stringify(badLocation))
  await runAuthorizationCli(["check",`--input=${input}`],deps)
  expect(JSON.parse(output.at(-1)!).diagnostics[0].path).toBe("entries.archive.locations.0")
  expect(JSON.parse(output.at(-1)!).diagnosticGroups.source[0].fix).toContain("supplied-file line numbers")
  await writeFile(input,JSON.stringify(fixture))
  const loaded=await loadLocalAuthorizationInput(input)
  expect(loaded.status).toBe("valid");if(loaded.status!=="valid")return
  expect(loaded.sourceRoot).toBe(path.join(root,"project"))
  const catalog=buildAuthorizationSourceCatalog(loaded.sourceBundle);if(!catalog.success)throw Error("catalog")
  const report=await executeLocalAuthorizationRun({inputFile:input,model:"mock/model",outRoot:path.join(root,"runs"),method:"plain",wireVersion:"v4",providerFactory:()=>({name:"mock",async complete(){return {text:"",toolCalls:[{id:"r",name:"submit_authorization_result",arguments:{results:compileAuthorizationTask(loaded.task).runnableObligations.map(o=>({obligationId:o.id,conclusion:"source_refuted",explanation:"Synthetic test response",facts:["entry","binding","control","effect"].map(kind=>({id:kind,kind,statement:"Synthetic fact",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:11,endLine:11}]})),decisiveMissingFacts:[],suggestedObservations:[]}))}}],tokens:{input:1,output:1,cacheRead:0,cacheWrite:0},durationMs:1,stopReason:"tool_use" as const}},async completeWithToolResults(){throw Error("forbidden")}})})
  expect(report.status).toBe("completed");if(!("sessionPath" in report))return
  expect(await readFile(path.join(report.sessionPath,"input.json"),"utf8")).toBe(await readFile(input,"utf8"))
  expect(JSON.parse(await readFile(path.join(report.sessionPath,"normalized-input.json"),"utf8")).task).toEqual(loaded.task)
  expect(JSON.parse(await readFile(path.join(report.sessionPath,"field-provenance.json"),"utf8")).normalizerVersion).toBe("authoring-v2-lowering/1")
  expect(await runAuthorizationCli(["inspect",`--out=${report.sessionPath}`],deps)).toBe(0)
  expect(await runAuthorizationCli(["compare",`--previous=${report.sessionPath}`,`--input=${input}`],deps)).toBe(0)
  expect(JSON.parse(output.at(-1)!).status).toBe("current")
  const previousResult=await readFile(path.join(report.sessionPath,"result.json"),"utf8")
  const base=JSON.parse(await readFile(input,"utf8"))
  for(const mutate of [
    (v:any)=>{v.principals.support.capabilities.push("supervisor")},
    (v:any)=>{v.resources.record.facts.push("Shared")},
    (v:any)=>{v.entries.archive.locations[0].startLine=12},
    (v:any)=>{v.request+=" Explain errors too."},
    (v:any)=>{v.additionalQuestions=["Explain rejection"]},
    (v:any)=>{v.policies.archive.text="Supervisors only"},
  ]) {
    const changed=structuredClone(base);mutate(changed);await writeFile(input,JSON.stringify(changed))
    expect(await runAuthorizationCli(["compare",`--previous=${report.sessionPath}`,`--input=${input}`],deps)).toBe(0)
    const comparison=JSON.parse(output.at(-1)!)
    expect(comparison.status).toBe("needs-review")
    expect(comparison.affectedScenarioIds).toContain("archive")
  }
  await writeFile(input,JSON.stringify(Object.fromEntries(Object.entries(base).reverse()),null,4))
  await writeFile(path.join(root,"project/unread.txt"),"Unrelated")
  expect(await runAuthorizationCli(["compare",`--previous=${report.sessionPath}`,`--input=${input}`],deps)).toBe(0)
  expect(JSON.parse(output.at(-1)!).status).toBe("current")
  await writeFile(path.join(root,"project/src/record.ts"),(await readFile(path.join(root,"project/src/record.ts"),"utf8"))+"\n// uncited change\n")
  await runAuthorizationCli(["compare",`--previous=${report.sessionPath}`,`--input=${input}`],deps)
  expect(JSON.parse(output.at(-1)!).reasons).toContain("source-bundle-changed")
  expect(await readFile(path.join(report.sessionPath,"result.json"),"utf8")).toBe(previousResult)
  await rm(path.join(report.sessionPath,"execution-dependencies.json"))
  await runAuthorizationCli(["compare",`--previous=${report.sessionPath}`,`--input=${input}`],deps)
  expect(JSON.parse(output.at(-1)!).missingDependencies).toContain("execution-dependencies/v1")
  for(const changed of [{...fixture,schemaVersion:"wrong"},{...fixture,policies:undefined},{...fixture,sourceRoot:"../escape"}]) {
    await writeFile(input,JSON.stringify(changed))
    expect(await runAuthorizationCli(["run",`--input=${input}`,"--model=mock/model",`--out=${root}/runs`],deps)).toBe(1)
    const invalid=JSON.parse(output.at(-1)!)
    expect(Object.keys(invalid.diagnosticGroups).length).toBeGreaterThan(0)
  }
  expect(factories).toBe(0)
})
