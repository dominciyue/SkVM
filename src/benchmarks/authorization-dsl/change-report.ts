import {createHash} from "node:crypto"
import {readFile} from "node:fs/promises"
import path from "node:path"
import {stableAuthorizationJson} from "../../task-dsl/authorization/result.ts"
import {compileAuthorizationTask} from "../../task-dsl/authorization/semantics.ts"
import type {AuthorizationMethod} from "../../task-dsl/authorization/method.ts"
import {loadLocalAuthorizationInput,type LocalInputResult} from "./local-input.ts"
import type {LocalAuthorizationCheckReport} from "./local-run.ts"

type ValidInput=Extract<LocalInputResult,{status:"valid"}>
const hash=(v:unknown)=>createHash("sha256").update(stableAuthorizationJson(v)).digest("hex")
export function createExecutionDependencies(loaded:ValidInput, checked:LocalAuthorizationCheckReport) {
  const task=loaded.task
  const scenarios=Object.fromEntries(task.obligations.map(o=>[o.id,{
    name:o.id.startsWith("scenario:")?decodeURIComponent(o.id.slice(9)):o.id,
    obligation:o,principal:task.principals.find(p=>p.id===o.principalId),resource:task.resources.find(r=>r.id===o.resourceId),policy:task.policySources.find(p=>p.id===o.policySourceId),entries:o.entryIds.map(id=>task.entries.find(e=>e.id===id)),
    expandedIds:compileAuthorizationTask(task).runnableObligations.filter(x=>x.authorObligationId===o.id).map(x=>x.id),
  }]))
  return {schemaVersion:"authorization-execution-dependencies/v1" as const,
    task:structuredClone(task), scenarios,
    sourceBundle:loaded.sourceBundle.files.map(f=>({path:f.relativePath,sha256:hash(f.content),cropRange:f.cropRange,originalLocations:f.originalLocations})),
    sourceRoot:loaded.normalizedInput.sourceRoot, sources:loaded.normalizedInput.sources,
    profile:loaded.analysisProfile,requirements:loaded.analysisRequirements,conditionRequest:loaded.conditionAnalysisRequest??null,
    normalizerVersion:loaded.provenance.normalizerVersion??"authoring-v1-lowering/1",
    method:checked.methodSelection!.effective,wireVersion:checked.wireVersion!,arm:checked.arm!,
    resultContract:"source-authorization-assessment-result/v0",promptSha256:hash(checked.preview??""),
  }
}
type Snapshot=ReturnType<typeof createExecutionDependencies>

export async function compareAuthorizationInput(previousSessionPath:string,inputPath:string,options:{method?:AuthorizationMethod;wireVersion?:"legacy"|"v4"}={}) {
  const {inspectLocalAuthorizationOutput,checkLocalAuthorizationInput}=await import("./local-run.ts")
  const previous=await inspectLocalAuthorizationOutput(previousSessionPath)
  const loaded=await loadLocalAuthorizationInput(inputPath)
  const base={schemaVersion:"authorization-change-report/v1",previousSessionPath:previous.sessionPath,inputPath:path.resolve(inputPath),semanticRevalidation:"not-performed",providerCalls:0}
  if(loaded.status!=="valid")return {...base,status:"input-invalid",affectedScenarioIds:[],missingDependencies:[],diagnostics:loaded.diagnostics,reasons:["current-input-invalid"]}
  let old:Snapshot|undefined
  try {old=JSON.parse(await readFile(path.join(previous.sessionPath,"execution-dependencies.json"),"utf8"))} catch { /* Historical sessions are never backfilled. */ }
  const required=["task","scenarios","sourceBundle","sourceRoot","sources","profile","requirements","conditionRequest","normalizerVersion","method","wireVersion","arm","resultContract","promptSha256"] as const
  const missingDependencies=old?.schemaVersion!=="authorization-execution-dependencies/v1" ? ["execution-dependencies/v1"] : required.filter(k=>!Object.hasOwn(old!,k))
  const method=options.method??old?.method??previous.methodSelection?.effective
  const wireVersion=options.wireVersion??((old?.wireVersion??previous.wireVersion)==="source-authorization-assessment-wire/v4"?"v4":"legacy")
  if(!method)missingDependencies.push("method")
  if(!old?.wireVersion&&!previous.wireVersion)missingDependencies.push("wireVersion")
  const checked=await checkLocalAuthorizationInput(inputPath,old?.arm??previous.arm??"B",method,wireVersion)
  if(checked.status!=="valid")return {...base,status:"input-invalid",affectedScenarioIds:[],missingDependencies,diagnostics:checked.diagnostics,reasons:["current-input-invalid"]}
  const next=createExecutionDependencies(loaded,checked)
  const oldScenarios=old?.scenarios??{}
  const keys=Object.keys(next.scenarios),beforeKeys=Object.keys(oldScenarios)
  const added=keys.filter(k=>!Object.hasOwn(oldScenarios,k)),removed=beforeKeys.filter(k=>!Object.hasOwn(next.scenarios,k))
  const changed=keys.filter(k=>Object.hasOwn(oldScenarios,k)&&hash(next.scenarios[k])!==hash(oldScenarios[k]))
  const reasons:string[]=[]
  if(missingDependencies.length)reasons.push("missing-execution-dependencies")
  if(old && !missingDependencies.length) {
    for(const k of required.filter(k=>k!=="scenarios"))if(hash(old[k])!==hash(next[k]))reasons.push(k==="sourceBundle"?"source-bundle-changed":`${k}-changed`)
  }
  if(added.length)reasons.push("scenarios-added")
  if(removed.length)reasons.push("scenarios-removed")
  if(changed.length)reasons.push("scenario-dependencies-changed")
  // Every declared scenario shares one model context. A dependency change can affect uncited reasoning.
  const affected=reasons.length?[...new Set([...beforeKeys,...keys])]:[]
  const name=(k:string)=>(next.scenarios[k]??oldScenarios[k])!.name
  return {...base,status:reasons.length?"needs-review":"current",previousRunStatus:previous.status,applicabilityOnly:true,
    addedScenarioIds:added.map(name),removedScenarioIds:removed.map(name),changedScenarioIds:changed.map(name),affectedScenarioIds:affected.map(name),
    affectedObligationIds:[...new Set(affected.flatMap(k=>[...(oldScenarios[k]?.expandedIds??[]),...(next.scenarios[k]?.expandedIds??[])]))],
    reasons,missingDependencies,diagnostics:[],impactScope:reasons.length?"all scenarios sharing the model context; final citations do not narrow dependencies":"unchanged inputs; semantic quality unchanged",
  }
}
