import {mkdir,readFile,writeFile,copyFile,open,unlink,readdir} from "node:fs/promises"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {executeLocalInquiryRun,inspectLocalInquiry} from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import {createNativeInquiryRuntime} from "../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import {classifyTerminalReport,observedAccountCost,measureAuthorTimeline} from "../../../results/skill-ir/skill-dsl-research/development/authorization-authoring-loop-v1/measurement.ts"
import {countObservedUsage,recordRunError} from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"
import {base,root,repo,load,save,hash,relative} from "./evidence.ts"
import {positions,limits} from "./prepare.ts"
const ledgerFile=path.join(base,"attempts.json"),boundary=path.join(base,"account-boundary.json")
const git=(...args:string[])=>execFileSync("git",args,{cwd:repo,encoding:"utf8"}).trim()
export function admit(ledger:any[],position:string,attempt:string,repairs:any[]){
 const index=positions.indexOf(position)
 if(index<0||!/^[a-z0-9-]+$/.test(attempt)||ledger.some(e=>e.position===position&&e.attempt===attempt))throw Error("invalid-or-duplicate-attempt")
 if(ledger.some(e=>["running","unknown"].includes(e.status)||e.quotaOrAuth||e.lifecycle?.localExecution!=="closed"))throw Error("active-unknown-or-paused-channel")
 if(attempt==="first"&&index>0&&!ledger.some(e=>e.position===positions[index-1]))throw Error("registered-order-required")
 const repair=repairs.find(r=>r.position===position&&r.attempt===attempt)
 if(attempt!=="first"&&(!repair?.cause||!repair.evidence||!repair.uniqueConfirmation||!ledger.some(e=>e.position===position)))throw Error("named-confirmation-not-admitted")
 if(attempt!=="first"&&ledger.filter(e=>e.repairCause).length>=2)throw Error("confirmation-limit")
 return repair
}
export function optionsFor(position:string){
 if(!positions.includes(position))throw Error("unregistered-position")
 const author=position.startsWith("A-"),review=position.startsWith("L-"),task=position.split("-")[1]!,arm=position.split("-")[2]
 const packets:Record<string,string>={"L-M-bad":"01","L-G-control":"02","L-M-control":"03","L-G-bad":"04"}
 return {author,review,task,inputFile:path.join(base,review?`inputs/review-${packets[position]}.json`:author?`inputs/${task}-${arm}.json`:`inputs/${task==="M"?"memos":"gitea"}-original.json`),
  skillFile:path.join(root,"authorization-domain-execution-v1/model/source-skills/github-security-review/SKILL.md"),
  domainProgramFile:path.join(base,review?`packets/${packets[position]}.json`:author?`automatic/${task}-initial.json`:`automatic/${task}-final.json`),
  programSupport:review?"rules" as const:"execute" as const,programMode:author?"edit" as const:"consume" as const,strategy:"question-checked-v1" as const,
  sourceVerificationFile:task==="M"&&(arm==="check"||position==="U-M")?path.join(base,"verification-config.json"):undefined}
}
async function files(dir:string):Promise<string[]>{return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat()}
export async function register(){
 if(await Bun.file(path.join(base,"registration.json")).exists())throw Error("already-registered")
 const bindings:Record<string,string>={}
 for(const dir of ["inputs","packets"])for(const file of await files(path.join(base,dir)))bindings[relative(file)]=hash(await readFile(file))
 for(const file of ["automatic/M-initial.json","automatic/G-initial.json","verification-config.json"])bindings[relative(path.join(base,file))]=hash(await readFile(path.join(base,file)))
 for(const dir of ["public-source/memos","public-source/gitea","source-skills/github-security-review"])for(const file of await files(path.join(root,"authorization-domain-execution-v1/model",dir)))bindings[relative(file)]=hash(await readFile(file))
 await save(path.join(base,"registration.json"),{identity:"authorization-source-differential-v1",beforeFirstCall:true,positions,limits,model:"gpt-5.6-sol",effort:"high",files:bindings,confirmationLimit:2,maximumAuthorContinuations:2,reviewPacketOrder:["01","02","03","04"],sourceModelScope:"original allowed source and original skill only; evaluation/results/taskbooks inaccessible",comparison:"M base then check; G check then base. G check has labelled source-review feedback only. Controls qualify narrow scope only. Source fidelity, policy and whole-task completeness separate."})
 return {registeredFiles:Object.keys(bindings).length,providerCalls:0}
}
async function checkRegistration(){const r=await load(path.join(base,"registration.json"));for(const [p,sha]of Object.entries(r.files))if(hash(await readFile(path.resolve(repo,p)))!==sha)throw Error(`registered-bytes-changed:${p}`);return r}
export async function preflight(){
 const views=[]
 for(const position of positions.filter(p=>!p.startsWith("U-"))){const o=optionsFor(position),runtime=await createNativeInquiryRuntime({...o,workDir:base,domainTools:true,method:"D1",sourceStructure:true,authoringTargetMode:o.author?"reusable":undefined,executionPolicy:"progressive",programContext:"directed",...limits})
  try{const context=await runtime.accountContext(false);views.push({position,context,tools:runtime.definitions.map(t=>t.name),sourceFiles:runtime.report().sourceFiles})}finally{await runtime.close()}
 }
 await save(path.join(base,"verification/preflight.json"),{providerCalls:0,views,limits});return {providerCalls:0,positions:views.map(v=>v.position)}
}
export async function run(position:string,attempt="first",resume=false){
 await checkRegistration();await load(path.join(base,"verification/preflight.json"))
 if(git("status","--porcelain","--","src"))throw Error("commit-tested-production-before-dispatch")
 const ledger=await load(ledgerFile),repair=admit(ledger,position,attempt,await load(path.join(base,"repairs.json"))),o=optionsFor(position)
 const previous=resume?ledger.filter((e:any)=>e.position===position&&e.session).at(-1):undefined
 if(resume&&(!o.author||!previous||attempt==="first"))throw Error("recovery-requires-own-known-author")
 if(o.author&&attempt!=="first"&&!resume)throw Error("author-recovery-must-continue-original-budget")
 const outDir=path.join(base,`runs/${position}-${attempt}`),entry:any={position,attempt,status:"running",startedAt:new Date().toISOString(),model:"gpt-5.6-sol",effort:"high",limits,input:relative(o.inputFile),inputSha256:hash(await readFile(o.inputFile)),program:relative(o.domainProgramFile),programSha256:await Bun.file(o.domainProgramFile).exists()?hash(await readFile(o.domainProgramFile)):null,skillSha256:hash(await readFile(o.skillFile)),codeEpoch:{commit:git("rev-parse","HEAD"),sourceTree:git("rev-parse","HEAD:src")},repairCause:repair?.cause,actualUsd:null}
 if(position.startsWith("U-")){const eligibility=await load(path.join(base,`automatic/${o.task}-eligibility.json`));if(eligibility.sha256!==entry.programSha256)throw Error("eligibility-raw-mismatch");if(!eligibility.eligible){Object.assign(entry,{status:"ineligible",inferenceDispatched:false,providerRequests:0,lifecycle:{localExecution:"closed",providerTerminalObserved:false},eligibility,endedAt:new Date().toISOString()});ledger.push(entry);await save(ledgerFile,ledger);return entry}}
 await mkdir(outDir,{recursive:true});const leasePath=path.join(outDir,"local-owner.json"),lease=await open(leasePath,"wx");await lease.writeFile(JSON.stringify({pid:process.pid,position,attempt}));await lease.close()
 ledger.push(entry);await save(ledgerFile,ledger)
 try{
  const report:any=await executeLocalInquiryRun({...o,domainProgramFile:resume?undefined:o.domainProgramFile,previous:previous?.session&&path.resolve(repo,previous.session),resumeAuthorThread:resume,sourceStructure:true,purpose:position,attempt,outDir,model:"gpt-5.6-sol",method:"D1",harness:"codex-account",domainTools:true,authoringTargetMode:o.author?"reusable":undefined,executionPolicy:"progressive",programContext:"directed",accountBoundaryFile:boundary,execution:{...limits,maxAuthorContinuations:o.author?2:0}})
  const account=report.telemetry?.account
  Object.assign(entry,classifyTerminalReport(report),observedAccountCost(report),{...(account?.hostFailure?{status:"host-failed"}:{}),endedAt:new Date().toISOString(),session:report.sessionPath&&relative(report.sessionPath),terminalStatus:report.terminalStatus,answerDelivery:report.answerDelivery,durationMs:report.durationMs,lifecycle:account?.lifecycle??{localExecution:report.status==="invalid"?"closed":"unknown"},turns:account?.turns?.map((t:any)=>({status:t.status,lifecycle:t.lifecycle,usage:t.usage,reason:t.reason,inferenceDispatched:t.inferenceDispatched})),reason:account?.hostFailure??account?.reason??report.diagnostics})
  await save(ledgerFile,ledger)
  if(report.sessionPath){const archived=await load(path.join(report.sessionPath,"run.json"));await save(path.join(base,`evaluation/timeline-${position}-${attempt}.json`),measureAuthorTimeline(archived));await mkdir(path.join(base,"evaluation/answers"),{recursive:true});await writeFile(path.join(base,`evaluation/answers/${position}-${attempt}.txt`),account?.text??"","utf8")
   if(o.author){const raw=report.domain?.programDraft?.currentDraft?.raw??report.domain?.executableContract?.currentDraft?.raw;if(raw)await save(path.join(base,`automatic/${position}-${attempt}-last-raw.json`),raw);await save(path.join(base,`automatic/${position}-${attempt}-process.json`),report.domain);await save(path.join(base,`automatic/${position}-${attempt}-proposals.json`),(archived.native?.history??[]).filter((h:any)=>["authorization_program","authorization_program_patch","authorization_program_trial"].includes(h.call.name)))}
  }
  return entry
 }catch(error){recordRunError(entry,error);throw error}
 finally{await save(ledgerFile,ledger);await unlink(leasePath);await save(path.join(base,"status.json"),{stage:position,activeRequests:ledger.filter((e:any)=>e.status==="running").map((e:any)=>`${e.position}/${e.attempt}`),unknownRequests:ledger.filter((e:any)=>e.status==="unknown").map((e:any)=>`${e.position}/${e.attempt}`),lastUpdated:new Date().toISOString()})}
}
export async function freeze(task:string){
 if(!["M","G"].includes(task))throw Error("unknown-task")
 const entry=(await load(ledgerFile)).filter((e:any)=>e.position===`A-${task}-check`).at(-1)
 if(!entry||["running","unknown"].includes(entry.status)||entry.lifecycle?.localExecution!=="closed")throw Error("author-not-known-closed")
 const target=path.join(base,`automatic/${task}-final.json`);if(await Bun.file(target).exists())throw Error("already-frozen")
 await copyFile(path.join(base,`automatic/A-${task}-check-${entry.attempt}-last-raw.json`),target)
 await save(path.join(base,`automatic/${task}-selection.json`),{attempt:entry.attempt,sha256:hash(await readFile(target)),source:entry.session,chosenBy:"chronologically-last-check-arm-raw-no-score-selection",developerSemanticEdits:false})
 return {task,sha256:hash(await readFile(target))}
}
export async function verify(){await checkRegistration();const ledger=await load(ledgerFile),inspected=[];for(const e of ledger)if(e.session){const r=await inspectLocalInquiry(path.resolve(repo,e.session));inspected.push({position:e.position,attempt:e.attempt,status:r.status})}const result={providerCalls:0,inspected,usage:countObservedUsage(ledger.flatMap((e:any)=>e.turns??[])),actualUsd:null,developerCost:null,plannedPurposes:10,recordedPurposes:new Set(ledger.map((e:any)=>e.position)).size,activeOrUnknown:ledger.filter((e:any)=>["running","unknown"].includes(e.status)||e.lifecycle?.localExecution!=="closed").map((e:any)=>e.position),confirmations:ledger.filter((e:any)=>e.repairCause).length};await save(path.join(base,"verification/lifecycle.json"),result);return result}
if(import.meta.main){const [command,a,b="first"]=process.argv.slice(2);console.log(JSON.stringify(command==="register"?await register():command==="preflight"?await preflight():command==="run"?await run(a!,b):command==="recover"?await run(a!,b,true):command==="freeze"?await freeze(a!):command==="verify"?await verify():(()=>{throw Error("register|preflight|run POSITION|freeze M/G|verify")})(),null,2))}
