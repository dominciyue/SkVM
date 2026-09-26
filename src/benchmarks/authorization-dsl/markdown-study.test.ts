import { afterEach, expect, test } from "bun:test"
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { executeMarkdownStudyRun, type MarkdownStudyInput } from "./markdown-study.ts"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "./local-run.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import { buildAuthorizationSourceCatalog } from "./inputs.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import type { LLMProvider } from "../../providers/types.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root,{recursive:true,force:true}) })
const instructions = "Independently authored: assess support archiving another owner's record under owner-or-supervisor policy. Trace the visible control and effect; do not infer deployment facts."
const markdown: MarkdownStudyInput = {instructions,instructionOrigin:"independent-author",instructionPath:"author.md"}
async function fixture(wireVersion = "v4") {
  const root = await mkdtemp(path.join(tmpdir(),"authorization-md-")); roots.push(root)
  await cp(path.resolve(import.meta.dir,"../../../examples/authorization-assessment/reusable-skill"),root,{recursive:true})
  const inputFile = path.join(root,"authoring.json")
  const author = JSON.parse(await readFile(inputFile,"utf8")); author.request = "MANIFEST-ONLY-CANARY"; await writeFile(inputFile,JSON.stringify(author))
  const loaded = await loadLocalAuthorizationInput(inputFile)
  if(loaded.status!=="valid") throw Error(JSON.stringify(loaded))
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if(!catalog.success) throw Error("catalog")
  const id = compileAuthorizationTask(loaded.task).runnableObligations[0]!.id
  const result = {results:[{obligationId:id,conclusion:"source_refuted",explanation:"Owner check denies archive.",facts:["entry","binding","control","effect","condition"].map((kind,i)=>({id:`f${i}`,kind,statement:"Source-backed test fact.",citations:[{sourceId:catalog.catalog.sources[0]!.sourceId,startLine:11,endLine:16}]})),decisiveMissingFacts:[],suggestedObservations:[]}]}
  const prompts:string[]=[]; let calls=0
  const provider = (repair=false,timeout=false): LLMProvider => ({
    name:"mock",modelId:"test",async complete(params) {
      prompts.push(JSON.stringify(params.messages)); calls++
      if(timeout) await new Promise(r=>setTimeout(r,50))
      const answer=structuredClone(result)
      if (wireVersion === "v5") { const item = answer.results[0] as any; delete item.conclusion; item.policyStatus = "satisfied" }
      if(repair && calls===1) answer.results[0]!.facts[0]!.citations[0]!.startLine=999
      return {text:"",toolCalls:[{id:"answer",name:"submit_authorization_result",arguments:answer}],stopReason:"tool_use",tokens:{input:10,output:10,cacheRead:0,cacheWrite:0},durationMs:1}
    },async *stream(){throw Error("unused")},async completeWithToolResults(){throw Error("unused")},
  } as LLMProvider)
  return {root,inputFile,prompts,provider,calls:()=>calls}
}

test("MD replaces declaration exactly once, shares source and output contract, and persists origin",async()=>{
  const f=await fixture()
  const md=await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown,providerFactory:()=>f.provider()})
  expect(md.status).toBe("completed")
  if(!("sessionPath" in md)) throw Error("session")
  const mdRun=JSON.parse(await readFile(path.join(md.sessionPath,"run.json"),"utf8"))
  expect(mdRun.renderedPrompt.split(instructions)).toHaveLength(2)
  expect(mdRun.renderedPrompt).not.toContain("MANIFEST-ONLY-CANARY")
  expect(mdRun.renderedPrompt).not.toContain("Canonical declaration")
  expect(mdRun.renderedPrompt).not.toContain("evaluator")
  const dsl=await executeLocalAuthorizationRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"dsl"),method:"plain",wireVersion:"v4",providerFactory:()=>f.provider()})
  if(!("sessionPath" in dsl)) throw Error("session")
  const dslRun=JSON.parse(await readFile(path.join(dsl.sessionPath,"run.json"),"utf8"))
  expect(mdRun.renderedPrompt.split("## Result contract")[1]).toBe(dslRun.renderedPrompt.split("## Result contract")[1])
  const saved=JSON.parse(await readFile(path.join(md.sessionPath,"research-instructions.json"),"utf8"))
  expect(saved.instructions).toBe(instructions)
  expect(saved.instructionOrigin).toBe("independent-author")
  expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/)
  await inspectLocalAuthorizationOutput(md.sessionPath)
  expect(f.calls()).toBe(2)
  await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown,providerFactory:()=>f.provider()})
  expect(f.calls()).toBe(2)
  await expect(executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown:{...markdown,instructions:"changed"},providerFactory:()=>f.provider()})).rejects.toThrow("identity")
})

test("repair preserves independent MD and diagnostics without recovering the manifest declaration",async()=>{
  const f=await fixture()
  const r=await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown,providerFactory:()=>f.provider(true)})
  expect(r.status).toBe("completed")
  expect(f.calls()).toBe(2)
  for(const prompt of f.prompts) {expect(prompt).toContain(instructions);expect(prompt).not.toContain("MANIFEST-ONLY-CANARY")}
  expect(f.prompts[1]).toContain("citation-out-of-range")
})

test("unknown origin and empty Markdown fail before provider creation; missing semantic information is not filled",async()=>{
  const f=await fixture();let created=0
  for(const bad of [{...markdown,instructions:" "},{...markdown,instructionOrigin:"dsl-rendered"}]) {
    const r=await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown:bad as MarkdownStudyInput,providerFactory:()=>{created++;return f.provider()}})
    expect(r.status).toBe("invalid")
  }
  expect(created).toBe(0)
  const r=await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"missing"),markdown:{...markdown,instructions:"Incomplete authored request."},providerFactory:()=>f.provider()})
  expect(r.status).toBe("completed") // Semantic omissions are an author/evaluator duty, never inferred by host.
  expect(f.prompts[0]).not.toContain("MANIFEST-ONLY-CANARY")
})

test("timeout closes MD lifecycle and inspection does not redispatch",async()=>{
  const f=await fixture()
  const r=await executeMarkdownStudyRun({inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md"),markdown,executionOptions:{timeoutMs:5,unitTimeoutMs:100,maxTokens:100,maxDomainRepairs:1,maxProviderDispatches:4},providerFactory:()=>f.provider(false,true)})
  expect(r.status).toBe("timeout-unknown")
  if(!("sessionPath" in r)) throw Error("session")
  expect((await inspectLocalAuthorizationOutput(r.sessionPath)).status).toBe("timeout-unknown")
  await new Promise(resolve=>setTimeout(resolve,70))
  expect(f.calls()).toBe(1)
})

test("v5 MD repair retains protocol and resume refuses a wire change or redispatch after timeout",async()=>{
  const f=await fixture("v5")
  const input={inputFile:f.inputFile,model:"mock/test",outRoot:path.join(f.root,"md-v5"),markdown,wireVersion:"v5" as const,providerFactory:()=>f.provider(true)}
  const report=await executeMarkdownStudyRun(input)
  expect(report.status).toBe("completed")
  if(!("sessionPath" in report)) throw Error("session")
  expect((await inspectLocalAuthorizationOutput(report.sessionPath)).wireVersion).toBe("source-authorization-assessment-wire/v5")
  expect(f.calls()).toBe(2)
  for (const prompt of f.prompts) {expect(prompt).toContain("policyStatus");expect(prompt).not.toContain("MANIFEST-ONLY-CANARY")}
  await executeMarkdownStudyRun(input)
  expect(f.calls()).toBe(2)
  await expect(executeMarkdownStudyRun({...input,wireVersion:"v4"})).rejects.toThrow("identity")
  const t=await fixture("v5")
  const timed={inputFile:t.inputFile,model:"mock/test",outRoot:path.join(t.root,"timeout"),markdown,wireVersion:"v5" as const,executionOptions:{timeoutMs:5,unitTimeoutMs:100,maxTokens:100,maxDomainRepairs:1 as const,maxProviderDispatches:4},providerFactory:()=>t.provider(false,true)}
  expect((await executeMarkdownStudyRun(timed)).status).toBe("timeout-unknown")
  await executeMarkdownStudyRun(timed)
  await new Promise(r=>setTimeout(r,70))
  expect(t.calls()).toBe(1)
})
