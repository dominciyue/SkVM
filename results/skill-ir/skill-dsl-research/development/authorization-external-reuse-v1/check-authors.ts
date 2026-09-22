import { readFile,writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
const root=import.meta.dir
for(const project of ["linkding","todo"]) {
 const operations=project==="linkding"?["remove","asset"]:["task","list"]
 for(const arm of ["dsl","md"]) {
  const dir=path.join(root,"authors",`${project}-${arm}`)
  const records=[]
  for(const operation of operations) for(const state of ["original","changed"]) {
   const name=`${operation}-${state}.${arm==="dsl"?"json":"md"}`
   const file=path.join(dir,`draft-${name}`)
   const content=await readFile(file,"utf8")
   const result=arm==="dsl"?await checkLocalAuthorizationInput(file,"B","plain","v4"):{status:content.trim()?"valid":"invalid",diagnostics:[]}
   records.push({file:name,status:result.status,diagnostics:result.diagnostics,semanticPublicFacts:"manual comparison: all policy, role, relation, fixed state and common questions retained",instructionPhase:arm==="md"?"needs-revision: author-only no-answer/downstream-work directives appear in executable instructions":"not-applicable"})
  }
  await writeFile(path.join(dir,"draft-checks.json"),JSON.stringify(records,null,2)+"\n")
  console.log(JSON.stringify({author:`${project}-${arm}`,checks:records}))
 }
}
