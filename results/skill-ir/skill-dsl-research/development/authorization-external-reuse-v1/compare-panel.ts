import {readFile,writeFile} from "node:fs/promises"
import path from "node:path"
import {compareAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
const root=import.meta.dir,repo=path.resolve(root,"../../../../..")
const config=JSON.parse(await readFile(path.join(root,"panel-config.json"),"utf8"))
const results=[]
for(const c of config.cases.filter((c:any)=>c.state==="original")){
 const changed=config.cases.find((n:any)=>n.project===c.project&&n.operation===c.operation&&n.state==="changed")
 const dir=path.join(root,"runs",c.id+"-dsl")
 const original=JSON.parse(await readFile(path.join(dir,"unit.json"),"utf8"))
 const previous=path.join(dir,"sessions",original.report.sessionId)
 const unchanged=await compareAuthorizationInput(previous,path.join(repo,c.dsl))
 const impact=await compareAuthorizationInput(previous,path.join(repo,changed.dsl))
 if(unchanged.status!=="current"||impact.status!=="needs-review")throw Error("unexpected comparison")
 const record={project:c.project,operation:c.operation,unchanged,impact,markdownRawDiff:`changes/${c.project}-${c.operation}-md.diff`,interpretation:"Input applicability only; shared context change invalidates all scenarios. Both changed tasks were run fresh; no semantic reuse or saved provider call claimed."}
 await writeFile(path.join(root,"changes",`${c.project}-${c.operation}-compare.json`),JSON.stringify(record,null,2)+"\n")
 results.push({project:c.project,operation:c.operation,unchanged:unchanged.status,changed:impact.status,providerCalls:0})
}
console.log(JSON.stringify(results))
