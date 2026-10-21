import { isDeepStrictEqual } from "node:util"
import { z } from "zod"

const id=z.string().min(1).max(256)
export const VerificationRequirementSchema=z.object({id,questionId:id,kind:z.enum(["query-binding","call-order","decision","effect-request"]),objectRelation:z.enum(["same-object","none","authorized-root"]),sourceEvents:z.array(id).max(64),scope:z.string().min(1).max(4000),resultField:id.optional(),valueFields:z.array(id).optional()}).strict()
export type VerificationRequirement=z.infer<typeof VerificationRequirementSchema>
export const VerificationMappingsSchema=z.record(id,z.object({events:z.array(z.object({name:id,stepId:id}).strict()).max(128).default([]),resultStepId:id.optional(),resultField:id.optional(),decisionStepIds:z.array(id).max(64).optional()}).strict())
export type VerificationMappings=z.infer<typeof VerificationMappingsSchema>
export interface SourceObservation { status:string; events?:Array<{name:string;arguments?:unknown;value?:unknown;error?:unknown}>; result?:unknown; error?:unknown; reason?:string; [key:string]:unknown }
export interface VerificationOptions {
 requirements:readonly VerificationRequirement[]; source:SourceObservation; execution?:any; mappings?:unknown;
 revision:string; questionId?:string; observationRevision?:string; sourceCurrent?:boolean; stepIds?:string[]; input?:unknown
}
const fields=(v:any,keys?:string[])=>keys && v!==null && typeof v==="object" ? Object.fromEntries(keys.map(k=>[k,v[k]])) : v
export type ProgramVerifier = (options:{raw:any;execution:any;resourceInputs:any;questionId:string;revision:string;tools:import("../../benchmarks/authorization-dsl/inquiry-tools.ts").InquiryTools})=>Promise<ReturnType<typeof compareProgramVerification>>

/** Requirements belong to the host task. The author's contribution is only a
 * projection of actual finite events; it cannot change requirements or sources. */
export function compareProgramVerification(options:VerificationOptions) {
 const {source,execution}=options, events:any[]=execution?.events??[]
 const parsed=VerificationMappingsSchema.safeParse(options.mappings??{})
 const requirements=options.requirements.map(requirement=>{
  const diagnostics:string[]=[], observed:any[]=[], expected=(source.events??[]).filter(e=>requirement.sourceEvents.includes(e.name))
  let firstDifference:{field:string;source:unknown;program:unknown}|undefined
  const differ=(field:string,a:unknown,b:unknown)=>{if(!firstDifference&&!isDeepStrictEqual(a,b))firstDifference={field,source:a,program:b}}
  const mapping=parsed.success?parsed.data[requirement.id]:undefined
  if(!parsed.success)diagnostics.push("mapping-shape-invalid")
  if(!mapping)diagnostics.push("requirement-mapping-missing")
  if(options.questionId!==undefined&&requirement.questionId!==options.questionId)diagnostics.push("requirement-question-not-executed")
  if(source.status!=="observed")diagnostics.push(`source-observation-unavailable:${source.reason??source.status}`)
  if(options.sourceCurrent===false)diagnostics.push("source-observation-stale")
  if(options.observationRevision&&options.observationRevision!==options.revision)diagnostics.push("program-revision-stale")
  if(requirement.objectRelation==="authorized-root")diagnostics.push("authorized-root-evidence-unsupported")
  if(!execution)diagnostics.push("program-execution-unavailable")
  if(mapping && new Set(mapping.events.map(e=>e.stepId)).size!==mapping.events.length)diagnostics.push("mapping-step-ambiguous")
  if(mapping?.events.some(e=>!requirement.sourceEvents.includes(e.name)))diagnostics.push("mapping-outside-requirement")
  if(mapping&&requirement.sourceEvents.some(name=>!mapping.events.some(e=>e.name===name)))diagnostics.push("required-event-mapping-missing")
  for(const e of events)if(e.op==="external"&&e.outcome!=="skipped"&&requirement.sourceEvents.includes(e.inputs?.name)&&!mapping?.events.some(m=>m.stepId===e.id))diagnostics.push(`unmapped-related-external:${e.id}`)
  if(!diagnostics.length&&mapping){
   for(const mapped of mapping.events){
    const e=events.find(e=>e.id===mapped.stepId)
    if(!e){
     if(requirement.kind==="query-binding"&&expected.some(s=>s.name===mapped.name&&s.error!==null&&s.error!==undefined))diagnostics.push(`query-error-result-unobserved:${mapped.stepId}`)
     if(!(options.stepIds?.includes(mapped.stepId)&&events.some(e=>e.outcome==="rejected"||e.op==="return"&&e.outputs?.known)))diagnostics.push(`mapped-event-unavailable:${mapped.stepId}`)
     continue
    }
    if(e.outcome==="skipped")continue
    if(e.outcome==="unresolved"||e.outcome==="conditional")diagnostics.push(`mapped-event-unresolved:${mapped.stepId}`)
    if(requirement.kind==="call-order") { observed.push({name:mapped.name,sequence:events.indexOf(e)}); continue }
    if(requirement.kind==="effect-request"&&e.op!=="external") { diagnostics.push(`effect-request-not-observed:${mapped.stepId}`);continue }
    let args:unknown
    if(e.op==="external"){
     const values:any[]=Object.values(e.inputs?.arguments??{})
     if(values.some(v=>!v?.known))diagnostics.push(`query-arguments-unresolved:${mapped.stepId}`)
     else args=Object.fromEntries(Object.entries(e.inputs?.arguments??{}).map(([k,v]:[string,any])=>[k,v.value]))
    }else if(e.op==="select")args=e.inputs?.query
    if(args===undefined)diagnostics.push(`query-arguments-unobserved:${mapped.stepId}`)
    if(!e.outputs?.known)diagnostics.push(`query-result-unobserved:${mapped.stepId}`)
    observed.push({name:mapped.name,arguments:args,value:fields(e.outputs?.value,requirement.valueFields),error:null,sequence:events.indexOf(e)})
   }
   observed.sort((a,b)=>a.sequence-b.sequence)
   if(requirement.kind==="decision"){
    let actual:unknown
    if(mapping.decisionStepIds){
     const gates=mapping.decisionStepIds.map(id=>events.find(e=>e.id===id))
     if(gates.some(e=>e?.op==="guard"&&e.outcome==="rejected"))actual=false
     else if(gates.length&&gates.every(e=>e?.op==="guard"&&(e.outcome==="skipped"||e.outcome==="computed"&&e.outputs?.value===true)))actual=true
     else diagnostics.push("decision-events-unobserved")
    }else{
     const e=events.find(e=>e.id===mapping.resultStepId)
     if(!e?.outputs?.known||e.outcome!=="computed")diagnostics.push("decision-value-unobserved")
     else actual=mapping.resultField ? e.outputs.value?.[mapping.resultField]:e.outputs.value
    }
    if(source.error!==null&&source.error!==undefined)diagnostics.push("source-return-blocked-by-error")
    differ("result",requirement.resultField ? (source.result as any)?.[requirement.resultField]:source.result,actual)
   }else{
    differ("events.length",expected.length,observed.length)
    for(let i=0;i<Math.min(expected.length,observed.length);i++){
     differ(`events[${i}].name`,expected[i]!.name,observed[i].name)
     if(requirement.kind!=="call-order")for(const key of ["arguments","value","error"] as const)differ(`events[${i}].${key}`,key==="value"?fields(expected[i]![key],requirement.valueFields):expected[i]![key],observed[i][key])
    }
   }
  }
  // Unobserved/invalid mappings cannot manufacture either a pass or a failure.
  const status=diagnostics.length?"unknown" as const:firstDifference?"counterexample" as const:"matched-on-cases" as const
  return {...requirement,requiredSourceEvents:requirement.sourceEvents,mapping,status,diagnostics,firstDifference:status==="counterexample"?firstDifference:undefined,sourceEvents:expected,programEvents:observed.map(({sequence,...e})=>e),durableCommit:"unknown",policyAssessment:"not-evaluated",taskCompleteness:"not-evaluated"}
 })
 return {revision:options.revision,input:options.input,sourceObservation:source,requirements,scope:"Only these inputs and observed local functions; source fidelity is separate from user policy and original task completeness.",requestOperationCertified:false as const}
}

/** Keep the duty visible when its former observation is no longer current. */
export function currentSourceVerification<T extends ReturnType<typeof compareProgramVerification> | undefined>(report:T,current:boolean):T {
 if(!report||current)return report
 return {...report,sourceObservation:{status:"unavailable",reason:"source-changed"},requirements:report.requirements.map(r=>({...r,status:"unknown",diagnostics:[...new Set([...r.diagnostics,"source-observation-stale"])],firstDifference:undefined,sourceEvents:[],programEvents:[]}))} as T
}
