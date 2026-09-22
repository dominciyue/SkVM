import {readFile,writeFile} from "node:fs/promises"
import path from "node:path"
import {compareAuthorizationInput} from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
const root=import.meta.dir
const read=async(p:string)=>JSON.parse(await readFile(path.join(root,p),"utf8"))
const difference=(a:any,b:any,p=""):string[]=>JSON.stringify(a)===JSON.stringify(b)?[]:a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)?[...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>difference(a[k],b[k],p?`${p}.${k}`:k)):[p]
const authors=[]
for(const name of ["gitea","fastapi"]) {
  const previous=await read(`runs/author-${name}-original/unit.json`)
  const original=await read(`authors/${name}/original.json`),changed=await read(`authors/${name}/changed.json`)
  const comparison=await compareAuthorizationInput(previous.report.sessionPath,path.join(root,`authors/${name}/changed.json`))
  await writeFile(path.join(root,`authors/${name}/comparison.json`),JSON.stringify(comparison,null,2)+"\n")
  authors.push({name,firstValid:name==="fastapi",revisionRounds:name==="gitea"?1:0,revisionMechanism:name==="gitea"?"new clean-context author relay; real diagnostics":"none",originalAndChangedValid:true,mainAgentFieldCorrections:0,sharedDiagnosticImprovement:name==="gitea"?"author field path plus exact local line range; no policy/expectation edits":null,changedFields:difference(original,changed),policyUnchanged:JSON.stringify(original.policies)===JSON.stringify(changed.policies),sourceSelectionUnchanged:JSON.stringify(original.sources)===JSON.stringify(changed.sources),comparisonStatus:comparison.status,humanMinutes:null,authorModelCost:"unmeasured; separate from analysis provider usage"})
}
await writeFile(path.join(root,"author-steps.json"),JSON.stringify({schemaVersion:"authorization-aa-author-steps/v1",authors,proceduralIsolationOnly:true,humanStudy:false},null,2)+"\n")
console.log(JSON.stringify(authors))
