import path from "node:path"
import { checkAuthorizationInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, prior, load, save } from "./evidence.ts"
export async function replay() {
 const input=await load(path.join(base,"inputs/memos-original.json")), original=await load(path.join(prior,"automatic/M-final.json"))
 const good=structuredClone(input);good.resourceInputs["shared-memo-access"].users[0].RowStatus="NORMAL"
 const errors=structuredClone(good);errors.resourceInputs["shared-memo-access"].storeErrors.creator="creator-fault"
 const cases:Array<{id:string;group:string;program:any;input:any;change:string}>=[]
 const add=(id:string,group:string,program:any,world:any,change:string)=>cases.push({id,group,program,input:world,change})
 add("natural-M-initial","natural",await load(path.join(prior,"automatic/M-initial.json")),input,"Exact BT raw, invalid creator with existing space and active viewer")
 add("natural-M-final","natural-control",original,input,"Exact BT final, same witness")
 add("control-normal","control",original,good,"All three context calls, successful decision")
 add("control-error","control",original,errors,"Source lookup error; absent select result must remain unknown")
 const anonymous=structuredClone(good);anonymous.resourceInputs["shared-memo-access"].contextUserID=0
 add("control-anonymous","control",original,anonymous,"Legitimate membership skip")
 const object=structuredClone(original);object.resourceWorkflow.steps.find((s:any)=>s.id==="creator").where.right={binding:"viewer.ID"}
 add("mutation-object","semantic-mutation",object,good,"Creator query changed to distinct viewer ID")
 const order=structuredClone(original),steps=order.resourceWorkflow.steps,ids=["space_store_ok","space"],block=steps.filter((s:any)=>ids.includes(s.id))
 order.resourceWorkflow.steps=steps.filter((s:any)=>!ids.includes(s.id));order.resourceWorkflow.steps.splice(order.resourceWorkflow.steps.findIndex((s:any)=>s.id==="creator_store_ok"),0,...block)
 add("mutation-order","semantic-mutation",order,good,"Space query block before creator query block")
 const early=structuredClone(original),gate=early.resourceWorkflow.steps.find((s:any)=>s.id==="read_policy_valid")
 early.resourceWorkflow.steps=early.resourceWorkflow.steps.filter((s:any)=>s.id!==gate.id);early.resourceWorkflow.steps.splice(early.resourceWorkflow.steps.findIndex((s:any)=>s.id==="space_store_ok"),0,gate)
 add("mutation-exit","semantic-mutation",early,input,"Reject invalid creator before remaining context resolution")
 const swallow=structuredClone(original),errorGate=swallow.resourceWorkflow.steps.findIndex((s:any)=>s.id==="creator_store_ok")
 swallow.resourceWorkflow.steps[errorGate]={id:"creator_store_ok",op:"value",value:{literal:true},source:swallow.resourceWorkflow.steps[errorGate].source}
 add("mutation-error","semantic-mutation",swallow,errors,"Ignore creator lookup error and use successful row")
 const note=structuredClone(original);note.resourceWorkflow.steps[0].because="Neutral explanatory wording; predicate unchanged."
 add("neutral-comment","neutral",note,good,"Explanatory wording only")
 const reordered=structuredClone(original);reordered.resourceWorkflow.inputs.reverse()
 add("neutral-input-order","neutral",reordered,good,"Input declaration order only")
 const identifier=structuredClone(original);identifier.id+="-neutral"
 add("neutral-program-id","neutral",identifier,good,"Program identity label only")
 const label=structuredClone(original);label.resourceWorkflow.gaps.push("Same bounded scope, restated without new semantics.")
 add("neutral-gap-text","neutral",label,good,"Restated scope gap only")
 await save(path.join(base,"evaluation/case-registration.json"),cases.map(({id,group,change})=>({id,group,change,selectedBeforeExecution:true})))
 const results=[]
 for(const c of cases){
  const programFile=path.join(base,`evaluation/programs/${c.id}.json`),inputFile=path.join(base,`inputs/${c.id}.json`)
  await save(programFile,c.program);await save(inputFile,c.input)
  const r:any=await checkAuthorizationInquiry(inputFile,"D1","question-checked-v1",programFile,{executionPolicy:"progressive",sourceVerificationFile:path.join(base,"verification-config.json")})
  const v=r.executableContract?.sourceVerification
  await save(path.join(base,`evaluation/observations/${c.id}.json`),{...c,program:programFile,sourceVerification:v,programExecution:r.executableContract?.resourceExecution,diagnostics:r.executableContract?.diagnostics})
  results.push({id:c.id,group:c.group,requirements:v?.requirements.map(({id,status,diagnostics,firstDifference}:any)=>({id,status,diagnostics,firstDifference})),observerAccounting:v?.observerAccounting})
 }
 const summary={providerCalls:0,results,isolatedExecutions:results.reduce((n,r)=>n+(r.observerAccounting?.executions??0),0),gitea:{status:"source-review-only",error:"response_load_completed rejects even though ToAPIIssue returns empty api.Issue and handler writes 201",source:["routers/api/v1/repo/issue.go:646-652","services/convert/issue.go:28-48"],isolation:"Converter calls DB-backed Issue loaders and multiple converters. No original G function executed, no handwritten simulator used."},policyAssessment:"not-evaluated-no-normative-policy",taskCompleteness:"not-evaluated-local-check-does-not-answer-whole-skill"}
 await save(path.join(base,"evaluation/replay-summary.json"),summary)
 const controls=await load(path.join(base,"evaluation/controls.json"))
 controls.M={...controls.M,qualified:results.filter(r=>r.group==="control"||r.group==="natural-control").every(r=>r.requirements?.every((q:any)=>q.status!=="counterexample")),scope:"Four event requirements on registered inputs only; decision mapping remains unknown; source errors lack exact select result"}
 controls.G={...controls.G,qualified:true,scope:"Source-reviewed converter-failure HTTP status only; response body and full task unqualified"}
 await save(path.join(base,"evaluation/controls.json"),controls)
 return summary
}
if(import.meta.main){const s=await replay();console.log(JSON.stringify({isolatedExecutions:s.isolatedExecutions,results:s.results.map(r=>({id:r.id,status:r.requirements?.map((q:any)=>`${q.id}:${q.status}`)}))},null,2))}
