Write authorization-inquiry/v1 from this CURRENT natural brief. Do not answer the source question, infer code behavior, add an expectation, future policy or unprovided premises.
Fields: schemaVersion, mode behavior|conformance, questions:[{id,request,principal?,resource?,operation?,entryHint?,premises:[{text,origin:user}]}], optional policy:{text,origin:user|external-policy,location} only for conformance.
Keep every requested scenario in question.request or a separate question. Optional principal/resource/operation are task wording, never invented code facts. Unspecified facts remain unspecified. Conformance copies the independently supplied policy verbatim.
Unrelated synthetic example: {schemaVersion:'authorization-inquiry/v1',mode:'behavior',questions:[{id:'museum',request:'Can a visitor reserve an exhibit?',premises:[]}]}. This is a structural example with no source answer.

Current mode: behavior
Current user policy: null
Current natural brief:
Declare only the current user question, not a source answer.

The runtime supplies the current mode and independent policy in the task. For conformance, copy that supplied policy exactly. Call authorization_compile({inquiry}) once. Read original source through source_list/search/symbol/read. Optional authorization_observe takes observations [{questionId,kind:entry|principal-binding|resource-binding|guard|effect|exception,subject,object?,claim,state:pending|observed|unresolved,evidenceIds}]. Cite IDs actually returned by source tools.

Call authorization_check_result({result}) using {schemaVersion:"authorization-inquiry-result/v1",questions:[{questionId,behavior:{disposition:allow|deny|conditional|unknown,explanation},branches:[{id,condition,disposition,explanation,evidenceIds}],evidenceIds,missing:[{kind:source-gap|premise-unspecified|deployment-unverified|dependency-out-of-scope,detail,nextRead?}],policyAssessment?:{status:satisfied|violated|undetermined,explanation}}],observations:[],scope}. behavior has no policyAssessment; conformance requires it. Relevant conditional branches need evidence. unknown names a decisive gap. Check is mechanical, semantic support remains unreviewed. At most one delivery repair. Then answer the user in the original skill's prose format.

Runtime: existing SkVM checkout plus installed Bun dependencies. Use ordinary skvm run --skill=SKILL.md --prompt=<current-task> --authorization-scope=<inquiry-input> --authorization-domain-tools --authorization-trace=<new-file> --model=<provider/model>. This package preserves all original companions and license; it is not a standalone runtime.
