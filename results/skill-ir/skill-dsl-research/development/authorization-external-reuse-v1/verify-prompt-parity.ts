import {readFile,writeFile} from "node:fs/promises"
import path from "node:path"
import {createHash} from "node:crypto"
const root=import.meta.dir,repo=path.resolve(root,"../../../../..")
const config=JSON.parse(await readFile(path.join(root,"panel-config.json"),"utf8"))
const mode=process.argv.includes("--real")?"runs":"mock-runs"
const read=async(p:string)=>JSON.parse(await readFile(p,"utf8"))
const hash=(s:string)=>createHash("sha256").update(s).digest("hex")
const records=[]
for(const c of config.cases){
 const arms:Record<string,any>={}
 for(const arm of ["markdown","dsl"]){
  const p=path.join(root,mode,c.id+"-"+arm),unit=await read(path.join(p,"unit.json"))
  const dir=path.join(p,"sessions",unit.report.sessionId)
  arms[arm]={run:await read(path.join(dir,"run.json")),source:await read(path.join(dir,"source-bundle.json"))}
 }
 const md=arms.markdown.run.promptSections,dsl=arms.dsl.run.promptSections
 const original=await readFile(path.join(repo,c.markdown),"utf8")
 const record={case:c.id,exactAuthorText:md.declaration===original,defaultQuestionsAbsent:!Object.hasOwn(md,"publicAnalysis"),sameOutputContract:md.outputContract===dsl.outputContract,sameSourceBundle:JSON.stringify(arms.markdown.source)===JSON.stringify(arms.dsl.source),markdownSha256:hash(original),extraAuthorNavigationHints:"retained as author-produced task preparation; not syntax-only comparison"}
 if(!record.exactAuthorText||!record.defaultQuestionsAbsent||!record.sameOutputContract||!record.sameSourceBundle)throw Error(JSON.stringify(record))
 records.push(record)
}
await writeFile(path.join(root,mode==="runs"?"prompt-parity-real.json":"prompt-parity-mock.json"),JSON.stringify(records,null,2)+"\n")
console.log(JSON.stringify({states:records.length,allParityChecks:true,providerCalls:0}))
