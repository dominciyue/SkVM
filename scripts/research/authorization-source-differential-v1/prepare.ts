import { copyFile, readFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { base, prior, repo, root, load, save, hash, relative } from "./evidence.ts"
export const positions=["L-M-bad","L-G-control","L-M-control","L-G-bad","A-M-base","A-M-check","A-G-check","A-G-base","U-M","U-G"]
export const limits={maxToolCalls:64,maxDisplayBytes:786432,maxReadBytes:33554432,sessionTimeoutMs:2700000}
export async function prepare() {
 if(await Bun.file(path.join(base,"registration.json")).exists())throw Error("already-registered")
 const m=await load(path.join(prior,"inputs/memos-original.json")),g=await load(path.join(prior,"inputs/gitea-original.json"))
 // A shared discriminating scenario, visible equally to both repair arms.
 const w=m.resourceInputs["shared-memo-access"]
 w.contextUserID=22; w.memos[0].SpaceID=8; w.users[0].RowStatus="DELETED"
 w.spaces=[{ID:8},{ID:9}];w.memberships=[{SpaceID:8,UserID:22,Role:"USER"},{SpaceID:9,UserID:17,Role:"ADMIN"}]
 await save(path.join(base,"inputs/memos-original.json"),m)
 await save(path.join(base,"inputs/gitea-original.json"),g)
 await mkdir(path.join(base,"automatic"),{recursive:true})
 await copyFile(path.join(prior,"automatic/M-initial.json"),path.join(base,"automatic/M-initial.json"))
 await copyFile(path.join(prior,"automatic/G-final.json"),path.join(base,"automatic/G-initial.json"))
 await mkdir(path.join(base,"packets"),{recursive:true})
 // Opaque packet names; identity and qualification are evaluation-side only.
 for(const [packet,file] of [["01","M-initial"],["03","M-final"],["04","G-final"]]) await copyFile(path.join(prior,`automatic/${file}.json`),path.join(base,`packets/${packet}.json`))
 const gc=await load(path.join(prior,"automatic/G-final.json"))
 // Developer-assisted scope control: remove the unsupported rejection only.
 gc.resourceWorkflow.steps=gc.resourceWorkflow.steps.filter((s:any)=>s.id!=="response_load_completed")
 gc.resourceWorkflow.gaps.push("Converter internals are not executable in this finite summary. Source review: ToAPIIssue returns an empty API issue on loader failure; handler still invokes JSON with 201. Body fields remain unknown.")
 await save(path.join(base,"packets/02.json"),gc)
 const requirements=[
  {id:"creator-query",kind:"query-binding",objectRelation:"same-object",sourceEvents:["GetUser"],valueFields:["ID","RowStatus","Role"],scope:"Creator lookup arguments and row from original ResolveMemoReadFacts"},
  {id:"space-query",kind:"query-binding",objectRelation:"same-object",sourceEvents:["GetSpace"],valueFields:["ID"],scope:"Optional placement lookup arguments and row"},
  {id:"member-query",kind:"query-binding",objectRelation:"same-object",sourceEvents:["GetSpaceMember"],valueFields:["Role"],scope:"Optional viewer membership lookup arguments and row"},
  {id:"context-call-order",kind:"call-order",objectRelation:"none",sourceEvents:["GetUser","GetSpace","GetSpaceMember"],scope:"Ordered invocation markers in original context resolution; final handler error text and durable effects outside scope"},
  {id:"read-decision",kind:"decision",objectRelation:"same-object",sourceEvents:[],resultField:"allowed",scope:"CheckMemoReadContext boolean decision after successful context resolution; exact gate locations require author mapping"}
 ].map(r=>({...r,questionId:"shared-memo-access"}))
 const mappings={"creator-query":{events:[{name:"GetUser",stepId:"creator"}]},"space-query":{events:[{name:"GetSpace",stepId:"space"}]},"member-query":{events:[{name:"GetSpaceMember",stepId:"membership"}]},"context-call-order":{events:[{name:"GetUser",stepId:"creator_store_ok"},{name:"GetSpace",stepId:"space_store_ok"},{name:"GetSpaceMember",stepId:"membership_store_ok"}]}}
 const source=path.resolve(path.dirname(path.join(base,"inputs/memos-original.json")),m.sourceRoot)
 await save(path.join(base,"verification-config.json"),{schemaVersion:"authorization-source-verification/v1",sources:await Promise.all(["core/access/memo.go","core/access/memo_resolve.go"].map(async p=>({path:p,sha256:hash(await readFile(path.join(source,p)))}))),adapter:{command:"python",args:[path.relative(base,path.join(import.meta.dir,"source-tests/observe.py")),"--stdin"],timeoutMs:60000},requirements,mappings})
 for(const [task,input] of [["M",m],["G",g]] as const){
  for(const arm of ["base","check"]){const v=structuredClone(input);v.sourceNotes.text+=" Repair the supplied draft from the original source, including alternate reachable inputs. Preserve the original skill duties. Use normal details, source reading, patch and trial tools; retain unknowns where evidence is missing."
   if(task==="G"&&arm==="check")v.sourceNotes.text+=" Independent source-review feedback (not executed source): inspect services/convert/issue.go ToAPIIssue/toIssue body and routers/api/v1/repo/issue.go:646-652 together. Reassess whether response_load_completed's rejection and no-201 claim follow from the converter return type and loader failure returns. This is a location and inconsistency report, not a supplied patch."
   await save(path.join(base,`inputs/${task}-${arm}.json`),v)
  }
 }
 for(const [packet,task] of [["01","M"],["02","G"],["03","M"],["04","G"]]){const v=structuredClone(task==="M"?m:g);v.sourceNotes.text+=" Independently review the supplied finite program against original source. Identify concrete translation errors with source lines and discriminating inputs, or explain insufficient evidence. Do not assume the program is correct. Keep the program unchanged and address the original skill task.";await save(path.join(base,`inputs/review-${packet}.json`),v)}
 await save(path.join(base,"attempts.json"),[]);await save(path.join(base,"repairs.json"),[])
 await save(path.join(base,"status.json"),{stage:"BU8",activeRequests:[],unknownRequests:[],plannedPurposes:positions})
 await save(path.join(base,"evaluation/controls.json"),{M:{packet:"03",provenance:"exact BT model final; qualification requires BU original-function cases",qualified:false},G:{packet:"02",provenance:"developer-assisted narrow removal of unsupported rejection; only converter failure status scope",qualified:false},packetOrder:["01","02","03","04"],automaticSuccess:false})
 return {positions,limits,providerCalls:0}
}
if(import.meta.main)console.log(JSON.stringify(await prepare(),null,2))
