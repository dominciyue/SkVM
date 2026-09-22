import {readFile,writeFile,mkdir} from "node:fs/promises"
import path from "node:path"
import {createHash} from "node:crypto"
const root=import.meta.dir
const read=async(p:string)=>JSON.parse(await readFile(path.join(root,p),"utf8"))
const config=await read("panel-config.json")
const rubrics=(await read("evaluator/rubrics-v3.json")).cases
const stored=await Promise.all(config.units.map((u:any)=>read(`runs/${u.id}/unit.json`)))
await mkdir(path.join(root,"review-packets"),{recursive:true})
const groups=[{id:"file-text",cases:["file","text"]},{id:"fastapi-collaborator",cases:["fastapi","collaborator"]},{id:"self-header",cases:["self","header"]}]
for(const group of groups) {
  const cases=[]
  for(const caseId of group.cases) {
    const c=config.cases.find((c:any)=>c.id===caseId)
    const answers=[];let sources
    for(const unit of config.units.filter((u:any)=>u.caseId===caseId)) {
      const record=stored.find((r:any)=>r.unit.id===unit.id)
      const session=`runs/${unit.id}/sessions/${record.report.sessionId}`
      const run=await read(`${session}/run.json`)
      sources=await read(`${session}/source-bundle.json`)
      const a=run.finalKind?run[run.finalKind]:undefined
      answers.push({unitId:unit.id,status:run.status,rawOutputSha256:a?createHash("sha256").update(a.rawResponse).digest("hex"):null,canonicalResult:a?.result,coverage:a?.relationCoverage,conditionAnalysis:a?.conditionAnalysis})
    }
    cases.push({caseId,task:JSON.parse(await readFile(path.resolve(root,"../../../../..",c.input),"utf8")).task,rubric:rubrics.find((r:any)=>r.taskId===c.taskId),sources,answers})
  }
  await writeFile(path.join(root,`review-packets/${group.id}.json`),JSON.stringify({instructions:"All generation closed. Independently judge actual answer claims against source and frozen criteria. Field existence alone earns no credit. Report unsupported extra facts too.",cases},null,2)+"\n")
}
console.log("Three review packets prepared after all twelve terminal records exist.")
