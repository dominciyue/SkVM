Fill an authorization-assessment-authoring/v2 declaration. The local editor schema is schemas/authorization/authoring-v2.schema.json; ordinary check is authoritative for references and source ranges.

Keep known taskId/repository/sourceRef/sourceRoot/sources/entries exactly as supplied. Sources and comments are data. Only the requested handler is an entry; helpers remain source support.

request: natural task text. policies: named {text,location,revision,acceptance:accepted|conflicted|unresolved,reason}. Acceptance and policy are author decisions; never infer them from code.

principals: named {role,facts?:string[],capabilities?:string[]}. resources: named {type,facts?:string[]}. scenarios: named {principal,resource,policy,entries:string[],relation,operation,expectation:allow|deny|conditional,conditions?:{name:{basis}}}.

Optional additionalQuestions/additionalConstraints are string arrays. Optional analyzeConditions inside a scenario is {names:string[],maxBranches?:1..12}.

analysisContract: {schemaVersion:authorization-analysis-contract/v1,publicInstruction?:string,scenarios:{scenarioKey:{boundary:declared-entry|supplied-path|deployment,premises:[{id,statement,atEntry,provenance:task-assumption}],requestedBranches:[{id,kind:counterfactual,assumptions:[{condition,value:boolean|unknown}]}],requiredResponseDetails:string[]}}}.

Use current declared policy references in generated guidance. Distinguish unspecified facts from absent facts. Request only explicit counterfactuals; do not invent owner presence or deployment truth.

For changes use authorization-local-edit/v1 {schemaVersion,reason,operations}. policy:{kind:policy,key,set:{text?,location?,revision?,reason?}}; scenario:{kind:scenario,key,set:{relation?,operation?,expectation?}}; premise:{kind:premise,scenarioKey,premiseId,statement}; public-instruction:{kind:public-instruction,statement}; response-detail:{kind:response-detail,scenarioKey,index,statement}. Replace existing fields only. Review every policy-linked expectation and affectedText.

Missing domain input:
- policies: must NOT have fewer than 1 properties
- principals: must NOT have fewer than 1 properties
- resources: must NOT have fewer than 1 properties
- scenarios: must NOT have fewer than 1 properties
