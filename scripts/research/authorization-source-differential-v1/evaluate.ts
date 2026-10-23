import path from "node:path"
import {checkAuthorizationInquiry} from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import {base,load,save,hash,relative} from "./evidence.ts"
import {readFile} from "node:fs/promises"

export async function registerUnshown(){
 const target=path.join(base,"evaluation/unshown-registration.json")
 if(await Bun.file(target).exists())throw Error("already-registered")
 const source=await load(path.join(base,"inputs/memos-original.json"))
 source.sourceRoot=path.resolve(base,"inputs",source.sourceRoot)
 const normal=structuredClone(source);normal.resourceInputs["shared-memo-access"].users[0].RowStatus="NORMAL"
 const cases:any[]=[]
 const add=(id:string,input:any,change:string)=>cases.push({id,input,change})
 const ids=structuredClone(normal),w=ids.resourceInputs["shared-memo-access"]
 for(const key of ["users","conversionUsers"])for(const row of w[key])row.ID+=100
 w.contextUserID+=100
 for(const row of w.memos){row.ID+=100;row.CreatorID+=100;if(row.SpaceID!==null)row.SpaceID+=100}
 for(const row of w.shares){row.MemoID+=100;row.CreatorID+=100}
 for(const row of w.spaces)row.ID+=100
 for(const row of w.memberships){row.SpaceID+=100;row.UserID+=100}
 add("distinct-identities",ids,"All relevant entity IDs shifted, distinct creator/viewer preserved")
 const noSpace=structuredClone(normal);noSpace.resourceInputs["shared-memo-access"].memos[0].SpaceID=null
 add("no-placement",noSpace,"No SpaceID; optional space/member queries absent")
 const noMember=structuredClone(normal);noMember.resourceInputs["shared-memo-access"].memberships=[]
 add("missing-member",noMember,"Complete empty membership population")
 const memberError=structuredClone(source);memberError.resourceInputs["shared-memo-access"].storeErrors.membership="member-fault"
 add("invalid-creator-member-error",memberError,"Context membership error occurs before invalid-creator policy rejection")
 const audience=structuredClone(normal);audience.resourceInputs["shared-memo-access"].memos[0].Visibility="UNKNOWN"
 add("unrecognized-audience",audience,"Valid context but unrecognized visibility rejects after resolution")
 await save(target,{registeredAt:new Date().toISOString(),beforeAuthorCalls:true,modelVisible:false,scope:"Fixed exposed development source; input generalization only, not held-out projects",cases})
 return {cases:cases.map(c=>c.id),providerCalls:0}
}
export async function evaluate(position:string){
 const file=path.join(base,`automatic/${position}-first-last-raw.json`)
 const registration=await load(path.join(base,"evaluation/unshown-registration.json"))
 const current=await load(path.join(base,"inputs/memos-original.json"));current.sourceRoot=path.resolve(base,"inputs",current.sourceRoot)
 const cases=[{id:"current",input:current},...registration.cases],results=[]
 for(const c of cases){
  const inputFile=path.join(base,`evaluation/inputs/${c.id}.json`),portableInput={...c.input,sourceRoot:path.relative(path.dirname(inputFile),c.input.sourceRoot).replaceAll("\\","/")};await save(inputFile,portableInput)
  const r:any=await checkAuthorizationInquiry(inputFile,"D1","question-checked-v1",file,{executionPolicy:"progressive",sourceVerificationFile:path.join(base,"verification-config.json")})
  const v=r.executableContract?.sourceVerification
  await save(path.join(base,`evaluation/author-observations/${position}-${c.id}.json`),{input:portableInput,program:relative(file),checkStatus:r.status,checkDiagnostics:r.diagnostics,sourceVerification:v,resourceExecution:r.executableContract?.resourceExecution,diagnostics:r.executableContract?.diagnostics})
  results.push({id:c.id,checkStatus:r.status,checkDiagnostics:r.diagnostics,requirements:v?.requirements.map(({id,status,diagnostics,firstDifference}:any)=>({id,status,diagnostics,firstDifference})),observerAccounting:v?.observerAccounting,executionStatus:r.executableContract?.resourceExecution?.status})
 }
 const report={position,program:relative(file),sha256:hash(await readFile(file)),providerCalls:0,results,isolatedExecutions:results.reduce((n,r)=>n+(r.observerAccounting?.executions??0),0)}
 await save(path.join(base,`evaluation/${position}-replay.json`),report)
 return report
}
if(import.meta.main){const [command,position]=process.argv.slice(2);console.log(JSON.stringify(command==="register"?await registerUnshown():await evaluate(position!),null,2))}
