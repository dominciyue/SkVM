import path from "node:path"
import {readdir} from "node:fs/promises"
import {base,repo,load,save} from "./evidence.ts"
import {countObservedUsage} from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"
function observer(value:any):{executions:number;elapsedMs:number}{
 let executions=0,elapsedMs=0
 function visit(v:any){if(!v||typeof v!=="object")return
  if(v.observerAccounting){const a=v.observerAccounting;executions=Math.max(executions,a.totalExecutions??a.executions??0);elapsedMs=Math.max(elapsedMs,a.totalElapsedMs??a.elapsedMs??0)}
  for(const child of Object.values(v))visit(child)
 }
 visit(value);return {executions,elapsedMs}
}
async function optional(file:string){return await Bun.file(file).exists()?await load(file):undefined}
export async function accounting(){
 const ledger=await load(path.join(base,"attempts.json")),rows=[]
 for(const entry of ledger){
  if(!entry.session){rows.push({position:entry.position,attempt:entry.attempt,status:entry.status,inferenceDispatched:entry.inferenceDispatched??null});continue}
  const dir=path.resolve(repo,entry.session),r=await load(path.join(dir,"run.json")),check=await optional(path.join(dir,"check.json"))
  rows.push({position:entry.position,attempt:entry.attempt,status:entry.status,inferenceDispatched:entry.inferenceDispatched,usage:countObservedUsage(entry.turns??[]),durationMs:entry.durationMs,tools:r.native?.toolBudget?.totalUsed,sourceAccounting:r.native?.sourceAccounting,transmissionBytes:r.native?.transmissionAccounting?.samples?.reduce((n:number,s:any)=>n+s.bytes,0),instructionEpochs:r.telemetry?.account?.turns?.map((t:any)=>({attempt:t.lifecycle?.attempt,inferenceDispatched:t.inferenceDispatched,instructionSources:t.capability?.instructionSources})),sourceObserver:{precheck:observer(check),native:observer(r.native)},actualUsd:entry.actualUsd??null})
 }
 const offline=[]
 const replay=await load(path.join(base,"evaluation/replay-summary.json"));offline.push({purpose:"registered-natural-mutation-controls",executions:replay.isolatedExecutions,elapsedMs:replay.results.reduce((n:number,r:any)=>n+(r.observerAccounting?.elapsedMs??0),0)})
 for(const position of ["A-M-base","A-M-check"]){const r=await optional(path.join(base,`evaluation/${position}-replay.json`));if(r)offline.push({purpose:position+"-current-unshown-replay",executions:r.isolatedExecutions,elapsedMs:r.results.reduce((n:number,x:any)=>n+(x.observerAccounting?.elapsedMs??0),0)})}
 // Every CLI stdout below represents an independent check. Summary JSON copies
 // of those observations are excluded to avoid counting their serialized copies.
 for(const dir of ["verification/ordinary-M","verification/portable-M"]){
  const folder=path.join(base,dir);let names:string[]=[];try{names=await readdir(folder)}catch{}
  for(const name of names.filter(n=>n.endsWith("-stdout.json")))offline.push({purpose:dir+"/"+name,...observer(await load(path.join(folder,name)))})
 }
 const sourceRuns=rows.reduce((n,r)=>n+(r.sourceObserver?.precheck.executions??0)+(r.sourceObserver?.native.executions??0),0)+offline.reduce((n,r)=>n+r.executions,0)
 const turns=ledger.flatMap((e:any)=>e.turns??[])
 const result={plannedPurposes:10,recordedPurposes:new Set(ledger.map((e:any)=>e.position)).size,attempts:ledger.length,actuallyDispatched:ledger.filter((e:any)=>e.inferenceDispatched).length,observedTurnRecords:turns.length,actualInferenceTurns:turns.filter((t:any)=>t.inferenceDispatched===true).length,notDispatchedTurnRecords:turns.filter((t:any)=>t.inferenceDispatched===false).length,usage:countObservedUsage(turns.filter((t:any)=>t.inferenceDispatched===true)),observedTurnRecordUsage:countObservedUsage(turns),nonDispatchedUsageNote:"Both refused records had no inference; one stores zero usage and one null. Generic observed-record unknownTurns does not mean an unknown actual inference cost.",inputIncludesCacheReadOnce:true,actualUsd:null,providerHiddenRequests:null,rows,offline,knownStudyIsolatedOriginalExecutions:sourceRuns,preparatoryObserverExecutions:{preflight:1,otherDevelopmentAndTests:"unknown-total; red/green and projection invocations recorded in execution.md, not silently counted as zero"},targetServiceExecutions:0,realDatabaseExecutions:0,durableBusinessWrites:0,developerAndScoutCost:null,humanMinutes:null,wallTimeCaution:"Observed end-to-end durations include host/tool work. Documentation and short typechecks occurred concurrently; wall times are not isolated performance estimates."}
 await save(path.join(base,"accounting.json"),result);return result
}
if(import.meta.main){const r=await accounting();console.log(JSON.stringify({purposes:r.recordedPurposes,attempts:r.attempts,dispatched:r.actuallyDispatched,usage:r.usage,isolatedOriginalExecutions:r.knownStudyIsolatedOriginalExecutions},null,2))}
