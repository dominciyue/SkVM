import { readFile } from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { z } from "zod"
import { compareProgramVerification, VerificationRequirementSchema, VerificationMappingsSchema, type SourceObservation, type ProgramVerifier } from "../../task-dsl/authorization/program-verification.ts"

const Config=z.object({schemaVersion:z.literal("authorization-source-verification/v1"),sources:z.array(z.object({path:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1),adapter:z.object({command:z.string().min(1),args:z.array(z.string()).max(32),timeoutMs:z.number().int().min(1).max(60000).default(60000)}).strict(),requirements:z.array(VerificationRequirementSchema).min(1).max(64),mappings:VerificationMappingsSchema.optional()}).strict()
const Observation=z.object({status:z.literal("observed"),events:z.array(z.object({name:z.string(),arguments:z.unknown().optional(),value:z.unknown().optional(),error:z.unknown().optional()}).passthrough()).max(256),result:z.unknown(),error:z.unknown()}).passthrough()

/** Explicit host configuration only. Model tools cannot supply an adapter,
 * command, source observation, requirement or verification verdict. */
export async function loadSourceVerifier(file:string|undefined,sourceRoot:string):Promise<ProgramVerifier|undefined> {
 if(!file)return undefined
 const absolute=path.resolve(file),config=Config.parse(JSON.parse(await readFile(absolute,"utf8")))
 if(new Set(config.requirements.map(r=>r.id)).size!==config.requirements.length)throw new Error("verification-requirement-id-ambiguous")
 const cache=new Map<string,SourceObservation>()
 let totalExecutions=0,totalElapsedMs=0
 return async options=>{
  const requirements=config.requirements
  let source:SourceObservation={status:"unavailable",reason:"source-not-current"}, executions=0,cacheHit=false
  const sourcesMatch=config.sources.every(s=>options.tools.files.some(f=>f.path===s.path&&f.sha256===s.sha256))
  const before=sourcesMatch?await options.tools.verifyCurrentSources(config.sources.map(s=>s.path)):undefined
  const key=JSON.stringify(options.resourceInputs),started=Date.now()
  if(sourcesMatch&&before?.valid){
   const cached=cache.get(key)
   if(cached){source=cached;cacheHit=true}
   else try{
    executions++;totalExecutions++
    const stdout=await new Promise<string>((resolve,reject)=>{
     const child=execFile(config.adapter.command,config.adapter.args,{cwd:path.dirname(absolute),windowsHide:true,timeout:config.adapter.timeoutMs,maxBuffer:1048576,encoding:"utf8"},(error,stdout,stderr)=>error?reject(new Error(`observer-exit:${error.message}:${stderr.slice(0,1000)}`)):resolve(stdout))
     child.stdin?.on("error",reject)
     child.stdin?.end(JSON.stringify({sourceRoot,resourceInputs:options.resourceInputs}))
    })
    source=Observation.parse(JSON.parse(stdout))
    const after=await options.tools.verifyCurrentSources(config.sources.map(s=>s.path))
    if(!after.valid)source={status:"unavailable",reason:"source-changed-during-observation"}
    else cache.set(key,source)
   }catch(error){source={status:"unavailable",reason:`source-observation-failed:${String(error).slice(0,2000)}`}}
  }
  const report=compareProgramVerification({requirements,questionId:options.questionId,source,execution:options.execution,mappings:options.raw?.verificationMappings??config.mappings,revision:options.revision,sourceCurrent:sourcesMatch&&before?.valid,stepIds:options.raw?.resourceWorkflow?.steps?.map((s:any)=>s?.id),input:options.resourceInputs})
  const elapsedMs=Date.now()-started;totalElapsedMs+=elapsedMs
  return {...report,observerAccounting:{executions,cacheHit,elapsedMs,totalExecutions,totalElapsedMs},configuration:{schemaVersion:config.schemaVersion,sources:config.sources},mappingInstruction:"verificationMappings maps requirement IDs to existing event step IDs only. Requirements and source observations are host-owned. Use details for full events; missing or unsupported mappings stay unknown."}
 }
}
