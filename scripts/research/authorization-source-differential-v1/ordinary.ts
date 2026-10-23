import path from "node:path"
import {mkdir,copyFile,cp,readFile,writeFile} from "node:fs/promises"
import {execFileSync} from "node:child_process"
import {base,repo,load,save,hash,relative} from "./evidence.ts"
async function check(input:string,program:string,config:string|undefined,out:string){
 const args=["src/index.ts","authorization","inquiry","check",`--input=${input}`,`--domain-program=${program}`,"--strategy=question-checked-v1","--execution-policy=progressive","--program-mode=consume","--program-context=directed","--program-support=execute",`--out=${out}`]
 if(config)args.push(`--source-verification=${config}`)
 const stdout=execFileSync("bun",args,{cwd:repo,encoding:"utf8",maxBuffer:32*1024*1024,windowsHide:true})
 await writeFile(out+"-stdout.json",stdout,"utf8")
 return {command:["bun",...args],result:JSON.parse(stdout)}
}
export async function ordinary(task:string){
 if(!["M","G"].includes(task))throw Error("unknown-task")
 const program=path.join(base,`automatic/${task}-final.json`),input=path.join(base,`inputs/${task==="M"?"memos":"gitea"}-original.json`),config=task==="M"?path.join(base,"verification-config.json"):undefined
 const dir=path.join(base,`verification/ordinary-${task}`);await mkdir(dir,{recursive:true})
 const original=await check(input,program,config,path.join(dir,"original"))
 const changed=await load(input);changed.sourceRoot=path.relative(dir,path.resolve(path.dirname(input),changed.sourceRoot)).replaceAll("\\","/")
 if(task==="M")changed.resourceInputs["shared-memo-access"].users[0].RowStatus="NORMAL"
 else changed.resourceInputs["create-issue"].errors.responseLoad="converter-LoadAttachments-error"
 const changedInput=path.join(dir,"changed-input.json");await save(changedInput,changed)
 const alternate=await check(changedInput,program,config,path.join(dir,"changed"))
 const record={task,providerCalls:0,program:relative(program),sha256:hash(await readFile(program)),original,alternate,sourceScope:task==="M"?"isolated original access functions":"source-review-only; no G original execution"}
 await save(path.join(base,`verification/ordinary-${task}.json`),record)
 return {task,providerCalls:0,sha256:record.sha256}
}
export async function portable(){
 const inputFile=path.join(base,"inputs/memos-original.json"),input=await load(inputFile),source=path.resolve(path.dirname(inputFile),input.sourceRoot)
 const dir=path.join(base,"verification/portable-M"),target=path.join(dir,"source")
 if(await Bun.file(path.join(dir,"input.json")).exists())throw Error("existing-portability-evidence")
 await mkdir(target,{recursive:true});await cp(source,target,{recursive:true,errorOnExist:true,force:false})
 const program=path.join(dir,"program.json");await copyFile(path.join(base,"automatic/M-final.json"),program)
 const config=await load(path.join(base,"verification-config.json"));config.adapter.args[0]=path.join(repo,"scripts/research/authorization-source-differential-v1/source-tests/observe.py")
 const configFile=path.join(dir,"config.json");await save(configFile,config)
 input.sourceRoot="./source";const movedInput=path.join(dir,"input.json");await save(movedInput,input)
 const moved=await check(movedInput,program,configFile,path.join(dir,"moved"))
 const originalFile=path.join(source,"core/access/memo.go"),copy=path.join(target,"core/access/memo.go"),before=await readFile(copy)
 await writeFile(copy,Buffer.concat([before,Buffer.from("\n// BU copied-source comment: no control-flow change.\n")]))
 const stale=await check(movedInput,program,configFile,path.join(dir,"stale"))
 config.sources.find((s:any)=>s.path==="core/access/memo.go").sha256=hash(await readFile(copy))
 const refreshed=path.join(dir,"refreshed-config.json");await save(refreshed,config)
 const reobserved=await check(movedInput,program,refreshed,path.join(dir,"reobserved"))
 const v=stale.result.executableContract?.sourceVerification
 const verified=hash(await readFile(originalFile))===hash(before)&&v?.requirements?.length===5&&v.requirements.every((q:any)=>q.status==="unknown")
 const result={providerCalls:0,sameRaw:hash(await readFile(program))===hash(await readFile(path.join(base,"automatic/M-final.json"))),originalSourcePreserved:hash(await readFile(originalFile))===hash(before),change:"Unreferenced comment appended to copied allowed memo.go; original source and raw preserved",moved,stale,reobserved,verified,note:"Refreshing observer source evidence does not silently rebind old program source assertions. Remaining unknowns are retained."}
 await save(path.join(base,"verification/portability-M.json"),result)
 if(!verified||!result.sameRaw)throw Error("source-withdrawal-or-portability-failed")
 return {verified,sameRaw:result.sameRaw,originalSourcePreserved:result.originalSourcePreserved}
}
if(import.meta.main){const [command,task]=process.argv.slice(2);console.log(JSON.stringify(command==="portable"?await portable():await ordinary(task!),null,2))}
