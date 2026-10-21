import path from "node:path"
import {prior,base,load,save} from "./evidence.ts"
const rows=[]
for(const name of ["M-initial","M-final","G-final"]){
 const p=await load(path.join(prior,`automatic/${name}.json`)),steps=p.resourceWorkflow.steps
 rows.push({name,questionId:p.scope.questionId,steps:steps.map((s:any)=>({id:s.id,op:s.op,category:s.op==="select"?"finite-data-query":s.op==="external"?"external-request-assumption":s.op==="guard"?"authored-source-condition":s.op==="return"?"finite-return-with-unreviewed-meaning":s.value&&Object.hasOwn(s.value,"literal")?"authored-literal-assertion":"finite-expression",source:s.source,claim:s.because??s.failure??null})),sourceDeclarations:p.sourceDeclarations.map((d:any)=>({source:d.source,statementCount:d.statements?.length??0,semanticSupport:"author-declared"})),unknowns:[...(p.scope.upstream??[]),...(p.resourceWorkflow.gaps??[])],coverageUnit:"original question and independent relation, never step percentage",relations:name.startsWith("M")?["creator query","space query","member query","context order","read decision"]:["route gates","field preparation","create/close/refetch order","converter return and HTTP status"],policy:"none independently supplied",taskCompleteness:"requires original skill review separately"})
}
await save(path.join(base,"evaluation/claim-inventory.json"),rows)
console.log(JSON.stringify(rows.map(r=>({name:r.name,steps:r.steps.length,unknowns:r.unknowns.length}))))
