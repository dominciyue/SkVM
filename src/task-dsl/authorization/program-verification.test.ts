import { expect, test } from "bun:test"
import { compareProgramVerification, type VerificationRequirement } from "./program-verification.ts"
import { executeResourceWorkflow } from "./resource-relations.ts"
import { createProgramDraft, patchProgramDraft } from "./resource-program-draft.ts"

const requirement: VerificationRequirement = { id:"object-query", questionId:"q", kind:"query-binding", objectRelation:"same-object", sourceEvents:["load"], scope:"isolated protected read" }
const source = { status:"observed", events:[{name:"load",arguments:{ID:1},value:{ID:1},error:null}], result:{allowed:true}, error:null }
const event = (id:string, value:any, args:any={ID:1}) => ({id,op:"external",outcome:"computed",inputs:{name:"load",arguments:Object.fromEntries(Object.entries(args).map(([k,v])=>[k,{known:true,value:v}]))},outputs:{known:true,value}})
const mapping = { "object-query":{events:[{name:"load",stepId:"read"}]} }
const run = (patch:any={}) => compareProgramVerification({requirements:[requirement],source,execution:{events:[event("read",{ID:1})]},mappings:mapping,revision:"r1",...patch})
test("independent requirement survives absent/deleted author mappings",()=>{
 expect(run({mappings:{}}).requirements[0]!.status).toBe("unknown")
 expect(run({mappings:{}}).requirements[0]!.id).toBe("object-query")
 expect(run({mappings:{"object-query":{...mapping["object-query"],objectRelation:"authorized-root"}}}).requirements[0]!.status).toBe("unknown")
})
test("switching the authored question retains the original independent duty",()=>{
 const r=run({questionId:"other"}).requirements[0]!
 expect(r.id).toBe("object-query")
 expect(r.status).toBe("unknown")
 expect(r.diagnostics).toContain("requirement-question-not-executed")
})
test("self-consistent wrong object differs from independent source",()=>{
 const result=run({execution:{events:[event("read",{ID:2},{ID:2})]}}).requirements[0]!
 expect(result.status).toBe("counterexample")
 expect(result.firstDifference?.field).toBe("events[0].arguments")
})
test("matching and neutral event names preserve correct control",()=>{
 expect(run().requirements[0]!.status).toBe("matched-on-cases")
 expect(run({execution:{events:[event("renamed",{ID:1})]},mappings:{"object-query":{events:[{name:"load",stepId:"renamed"}]}}}).requirements[0]!.status).toBe("matched-on-cases")
})
test("legitimate absent branch matches but missing mapped step is unknown",()=>{
 expect(run({source:{...source,events:[]},execution:{events:[{...event("read",null),outcome:"skipped"}]}}).requirements[0]!.status).toBe("matched-on-cases")
 expect(run({execution:{events:[]}}).requirements[0]!.status).toBe("unknown")
})
test("early rejection retains a concrete missing-call counterexample",()=>{
 const r=run({execution:{events:[{id:"stop",op:"guard",outcome:"rejected"}]},stepIds:["stop","read"]}).requirements[0]!
 expect(r.status).toBe("counterexample")
 expect(r.firstDifference?.field).toBe("events.length")
})
test("a source query error without a program query result is unknown, not a false missing-call finding",()=>{
 const r=run({source:{...source,events:[{name:"load",arguments:{ID:1},value:null,error:"db"}],error:"db"},execution:{events:[{id:"error",op:"guard",outcome:"rejected"}]},stepIds:["error","read"]}).requirements[0]!
 expect(r.status).toBe("unknown")
 expect(r.diagnostics).toContain("query-error-result-unobserved:read")
})
test("write request before later error survives, value cannot manufacture request",()=>{
 const req={...requirement,id:"write",kind:"effect-request" as const,sourceEvents:["save"]}
 const args={requirements:[req],source:{...source,events:[{name:"save",arguments:{ID:1},value:null,error:null}]},mappings:{write:{events:[{name:"save",stepId:"write"}]}}}
 expect(run({...args,execution:{events:[event("write",null),{id:"later",op:"guard",outcome:"rejected"}]}}).requirements[0]!.status).toBe("matched-on-cases")
 expect(run({...args,execution:{events:[{...event("write",null),op:"value"}]}}).requirements[0]!.status).toBe("unknown")
})
test("unavailable observer, changed source, old revision, and root relation remain named unknown",()=>{
 for(const args of [{source:{status:"failed",reason:"adapter-failed"}},{sourceCurrent:false},{observationRevision:"old"},{requirements:[{...requirement,objectRelation:"authorized-root"}]}]) {
  const r=run(args).requirements[0]!; expect(r.status).toBe("unknown"); expect(r.diagnostics.length).toBeGreaterThan(0)
 }
})
test("selection records evaluated query identities even when no row matches",()=>{
 const workflow={inputs:["rows","wanted"],steps:[{id:"read",op:"select",from:"rows",where:{op:"eq",left:{binding:"row.ID"},right:{binding:"wanted"}},source:{path:"read.go",startLine:1,endLine:3}}]}
 const result=executeResourceWorkflow(workflow,{rows:[],wanted:42})
 expect(result.events[0]?.inputs.query).toEqual({ID:42})
})
test("omitting a required event mapping remains unknown even on a skipped branch",()=>{
 expect(run({source:{...source,events:[]},mappings:{"object-query":{events:[]}}}).requirements[0]!.status).toBe("unknown")
})
test("an author cannot hide another observed external request in the named scope",()=>{
 const r=run({execution:{events:[event("read",{ID:1}),event("hidden",{ID:2},{ID:2})]}}).requirements[0]!
 expect(r.status).toBe("unknown")
 expect(r.diagnostics).toContain("unmapped-related-external:hidden")
})
test("normal revision-bound patch edits only event mapping, not host requirements",()=>{
 const before=createProgramDraft({id:"p",scope:{questionId:"q"},resourceWorkflow:{inputs:[],steps:[]}})
 const patched=patchProgramDraft(before,{baseRevision:before.revision,upsertSteps:[],verificationMappings:mapping})
 expect(patched.diagnostics).toEqual([])
 expect(patched.draft?.raw.verificationMappings).toEqual(mapping)
 expect(patched.draft?.revision).not.toBe(before.revision)
})
