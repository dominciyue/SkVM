import { z } from "zod"
import type { AuthorizationAuthoringInputV1, AuthorizationAuthoringNormalization, AuthorizationAuthoringDiagnostic } from "./authoring.ts"

const Text = z.string().trim().min(1)
const Key = z.string().min(1).refine(v => v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v) && !["__proto__", "prototype", "constructor"].includes(v), "Use a non-empty name without surrounding whitespace, control characters or prototype keys.")
const dictionary = <T extends z.ZodTypeAny>(shape:T, required=true) => z.record(Key, shape).refine(v => !required || Object.keys(v).length > 0, "Provide at least one named declaration.")
const Location = z.object({path:Text,startLine:z.number().int().positive(),endLine:z.number().int().positive()}).strict().refine(v=>v.endLine>=v.startLine,"endLine must not precede startLine")
export const AuthorizationAuthoringInputV2Schema = z.object({
  schemaVersion:z.literal("authorization-assessment-authoring/v2"),
  taskId:Text, request:Text, repository:Text, sourceRef:Text, sourceRoot:Text, sources:z.array(Text).min(1),
  policies:dictionary(z.object({text:Text,location:Text,revision:Text,acceptance:z.enum(["accepted","conflicted","unresolved"]),reason:Text}).strict()),
  principals:dictionary(z.object({role:Text,facts:z.array(Text).optional(),capabilities:z.array(Text).optional()}).strict()),
  resources:dictionary(z.object({type:Text,facts:z.array(Text).optional()}).strict()),
  entries:dictionary(z.object({name:Text,locations:z.array(Location).min(1)}).strict()),
  scenarios:dictionary(z.object({principal:Key,resource:Key,policy:Key,entries:z.array(Key).min(1),relation:Text,operation:Text,expectation:z.enum(["allow","deny","conditional"]),conditions:dictionary(z.object({basis:Text}).strict(),false).optional(),analyzeConditions:z.object({names:z.array(Key).min(1),maxBranches:z.number().int().min(1).max(12).optional()}).strict().optional()}).strict()),
  additionalQuestions:z.array(Text).optional(), additionalConstraints:z.array(Text).optional(),
}).strict()
export type AuthorizationAuthoringInputV2 = z.infer<typeof AuthorizationAuthoringInputV2Schema>
export const AUTHORING_V2_NORMALIZER = "authoring-v2-lowering/1"
export const authoringId = (kind:string, name:string) => `${kind}:${encodeURIComponent(name)}`
const sorted = <T>(v:Record<string,T>) => Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
const facts = (values?:string[]) => values?.length ? `Author facts: ${JSON.stringify(values)}` : "Author facts: not declared."

export function lowerAuthorizationAuthoringV2(input:unknown, normalizeV1:(v:unknown)=>AuthorizationAuthoringNormalization): AuthorizationAuthoringNormalization {
  const parsed = AuthorizationAuthoringInputV2Schema.safeParse(input)
  if(!parsed.success) return {status:"needs-input",diagnostics:parsed.error.issues.map(issue=>({code:"author-v2-invalid",path:issue.path.join(".")||"$",message:issue.message,fix:issue.code==="unrecognized_keys" ? `Remove unknown fields: ${issue.keys.join(", ")}. See the complete authoring-v2 example.` : `Provide ${issue.path.join(".")||"the declaration"} using the authoring-v2 example; policy and expectation must be authored, never inferred from code.`}))}
  const v = parsed.data
  const diagnostics:AuthorizationAuthoringDiagnostic[]=[]
  const add=(field:string,message:string,fix:string)=>diagnostics.push({code:"author-v2-reference",path:field,message,fix})
  for(const [key,s] of sorted(v.scenarios)) {
    for(const [field,collection] of [["principal","principals"],["resource","resources"],["policy","policies"]] as const) {
      if(!Object.hasOwn(v[collection],s[field])) add(`scenarios.${key}.${field}`,`Unknown ${field} ${s[field]}.`,`Choose a declared name from ${collection}: ${Object.keys(v[collection]).join(", ")}.`)
    }
    s.entries.forEach((name,i)=>{
      if(!Object.hasOwn(v.entries,name) || s.entries.indexOf(name)!==i) add(`scenarios.${key}.entries.${i}`,`Unknown or repeated entry ${name}.`,`Choose each declared entry at most once: ${Object.keys(v.entries).join(", ")}.`)
    })
    s.analyzeConditions?.names.forEach((name,i)=>{
      if(!Object.hasOwn(s.conditions??{},name)||s.analyzeConditions!.names.indexOf(name)!==i) add(`scenarios.${key}.analyzeConditions.names.${i}`,`Missing or repeated condition ${name}.`,`Declare ${name} under scenarios.${key}.conditions with its author-provided basis, or remove this request.`)
    })
    if(v.policies[s.policy] && v.policies[s.policy]!.acceptance!=="accepted") add(`policies.${s.policy}.acceptance`,"Policy is not accepted; its scenarios cannot run.","Resolve the policy and record the author acceptance reason before running; do not infer acceptance from implementation.")
  }
  if(diagnostics.length) return {status:"needs-input",diagnostics:[...new Map(diagnostics.map(d=>[d.path,d])).values()]}
  const requests=sorted(v.scenarios).flatMap(([key,s])=>s.analyzeConditions ? [{obligationId:authoringId("scenario",key),conditionBindings:s.analyzeConditions.names.map(name=>({id:`condition:${encodeURIComponent(key)}:${encodeURIComponent(name)}`,name})),maxBranches:s.analyzeConditions.maxBranches??8}] : [])
  const authoring:AuthorizationAuthoringInputV1={
    schemaVersion:"authorization-assessment-authoring/v1",sourceRoot:v.sourceRoot,sources:v.sources,
    task:{schemaVersion:"source-authorization-assessment/v0",taskId:v.taskId,request:v.request,repository:v.repository,sourceRef:v.sourceRef,sourceMode:"fixed-context",
      policySources:sorted(v.policies).map(([key,p])=>({id:authoringId("policy",key),kind:"explicit-task-requirement",text:p.text,location:p.location,revision:p.revision,acceptance:{status:p.acceptance,reason:p.reason,actorRole:"task-author"}})),
      principals:sorted(v.principals).map(([key,p])=>({id:authoringId("principal",key),role:p.role,description:facts(p.facts),startingCapabilities:p.capabilities??[]})),
      resources:sorted(v.resources).map(([key,r])=>({id:authoringId("resource",key),type:r.type,description:facts(r.facts)})),
      entries:sorted(v.entries).map(([key,e])=>({id:authoringId("entry",key),...e})),
      obligations:sorted(v.scenarios).map(([key,s])=>({id:authoringId("scenario",key),principalId:authoringId("principal",s.principal),resourceId:authoringId("resource",s.resource),policySourceId:authoringId("policy",s.policy),entryIds:s.entries.map(e=>authoringId("entry",e)),relation:s.relation,operation:s.operation,expectation:s.expectation,conditions:sorted(s.conditions??{}).map(([name,c])=>({name,basis:c.basis}))})),
      scopeAssurance:"Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.",
      requiredAnalysis:["Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.",...(v.additionalQuestions??[])],
      constraints:["Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.",...(v.additionalConstraints??[])],
    },...(requests.length ? {conditionAnalysisRequest:{schemaVersion:"authorization-condition-analysis-request/v1",requests}} : {}),
  }
  const result=normalizeV1(authoring)
  if(result.status!=="ready") return result
  return {...result,authoringInput:v,provenance:{...result.provenance,normalizerVersion:AUTHORING_V2_NORMALIZER,fieldSources:{author:["taskId","request","repository","sourceRef","sourceRoot","sources","policies","principals","resources","entries","scenarios","additionalQuestions","additionalConstraints"],derived:["IDs from names","sourceIdentity","sourceMode","scopeAssurance","requiredAnalysis base","constraints base","analysisProfile","conditionBindings"],omitted:"facts/capabilities/conditions absent means not declared, never inferred"}}}
}
