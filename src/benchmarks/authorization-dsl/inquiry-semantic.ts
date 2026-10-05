import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import { InquiryQuestionResultSchema } from "../../task-dsl/authorization/inquiry-result.ts"
import { canonicalControl, mergeControlSlice, type ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { controlRuleReach, evaluateControlPaths, type DependencyCheckState } from "../../task-dsl/authorization/control-conclusion.ts"
import { SemanticBlockSchema, lowerSemanticFlow, semanticBlockDiagnostics, type BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import { LocalUpdateItemSchemas, type LocalExplanationTask } from "./inquiry-local-extraction.ts"
import { WorkSelectionSchema } from "./inquiry-control-updates.ts"
import { FINITE_PERMISSION_GUIDE } from "../../task-dsl/authorization/control-evaluation.ts"

const updateFields = { schemaVersion: z.literal("authorization-semantic-update/v1"), semanticBlocks: z.array(SemanticBlockSchema).max(8).default([]), premiseValues: z.array(LocalUpdateItemSchemas.premiseValues).max(64).default([]), workSelections: z.array(WorkSelectionSchema).max(16).default([]) }
export const SemanticUpdateSchema = z.object(updateFields).strict()
/** Preserve malformed local siblings for the shared runtime's scoped diagnostics. */
export const SemanticUpdateEnvelopeSchema = z.object({ ...updateFields, semanticBlocks: z.array(z.unknown()).max(8).default([]), premiseValues: z.array(z.unknown()).max(64).default([]), workSelections: z.array(z.unknown()).max(16).default([]) }).strict()
const policy = z.object({ expected: z.enum(["allow", "deny"]), text: InquiryText }).strict()
const pathExplanation = z.object({ pathId: InquiryText, explanation: InquiryText, disposition: z.enum(["allow", "deny", "unknown"]).optional(), protectedEffect: z.enum(["none", "performed", "unresolved"]).optional(), policy: policy.optional() }).strict()
export const SemanticResultSchema = z.object({ schemaVersion: z.literal("authorization-semantic-result/v1"), revision: z.number().int().min(0), questions: z.array(z.object({ questionId: InquiryText, explanation: InquiryText, disposition: z.enum(["allow", "deny", "conditional", "unknown"]).optional(), paths: z.array(pathExplanation).max(16).default([]), counterfactuals: z.array(z.object({ pathId: InquiryText, explanation: InquiryText }).strict()).max(16).default([]), missing: InquiryQuestionResultSchema.shape.missing.default([]), policyAssessment: InquiryQuestionResultSchema.shape.policyAssessment }).strict()).min(1).max(32), scope: InquiryText }).strict()
export const SEMANTIC_EXECUTION_GUIDE = [
  'semantic-flow-v1: explain ACTUALLY SHOWN source in controlDelta {schemaVersion:"authorization-semantic-update/v1",semanticBlocks:[],premiseValues:[],workSelections:[]}. No target code is executed. Both task expressions use this identical shared runtime. Meaning remains unreviewed.',
  'Read current locationTasks separately from tasks. A locationTasks item is a locate/select-candidate duty, NOT an offered semantic unit. If tasks is empty, first select the shown candidate matching the ORIGINAL requested entry using controlDelta.workSelections:[{questionId:<shown question.id>,itemId:<shown locationTasks itemId>,candidateId:<shown candidate id>}], then wait for its original sourceWindows in the next current tasks before submitting semanticBlocks. In native tools submit authorization_observe({controlDelta:{schemaVersion:"authorization-semantic-update/v1",workSelections:[...]}}). Ordinary source reads establish evidence but do not choose an ambiguous work item or invent an offer. DeferredTasks likewise are not current offers. An alternative same-name entry must not replace the user-requested route.',
  'An entryHint is a lexical lead, not a verified location. If the selected source is unrelated, locate the requested declaration with source_search and source_symbol({name:<actual declaration>,path:<allowed path>}). You may explicitly select a candidateId actually returned by source_symbol for the SAME current work item/question through controlDelta.workSelections, even if absent from its initial candidates. The next current offer uses that original indexed range; interpret it and replace the mistaken same-handle unit. Previously accepted source meaning is not silently deleted. Unseen or invented IDs remain invalid; a read range alone does not invent a complete declaration boundary.',
  'Each semanticBlocks item is {itemId:<current explanation task>,handle:<stable same-question function name>,op:add|replace,role:entry|helper,start:<block name>,complete:boolean,fallthrough?:allow|deny|unresolved,parameters?:[{name,type}],blocks:[{name,steps:[]}]} . Model supplies source meaning; host supplies questionId, evidenceIds, node keys, after and path ids. A changed accepted handle needs op:replace, never a new handle to hide an error. Replacement can reuse its original itemId/windows; an added unit needs a current offer. All block and step names are unique inside a unit.',
  'Steps in a block are sequential. bind {kind:bind,name,type:principal|resource|permission|configuration|value,claim,aliasOf?} declares a distinct object. Guard {kind:guard,name,claim,condition?,principal?,resource?} conditions are reachability/success REQUIRED for continuation, not a failing guard proposition. TWO sequential guards remain AND. choose {kind:choose,name,claim,cases:[{condition,body:<named block>}],otherwise?:<block>} describes an explicit ordered exclusive choice. Host clones common suffix across alternatives; return/reject skips suffix. Explicit otherwise permits a complement; omitted otherwise leaves a gap. Use empty named blocks for explicit fallthrough arms. Do not silently omit a feasible error/role/null branch.',
  'call {kind:call,name,claim,symbol,callee?:<same-question helper handle>,arguments?:[{parameter,object}],result?,pathHint?,candidateId?} declares a decisive helper relationship. A callee handle may be declared before its source body is read; the host retains an open dependency until an offered helper unit interprets it. Cite and explain upstream authentication/routing and object resolution when decisive. Metadata and same-name candidates do not settle semantics. Model chooses shown candidates with controlDelta.workSelections:[{questionId,itemId,candidateId}] or ordinary source tools. A selection-only step is {kind:control,controlDelta:{schemaVersion:"authorization-semantic-update/v1",workSelections:[...]}}; a tool step may include this same controlDelta alongside calls. Never place workSelections at step root. Optional lexical leads are not obligations unless relevant. Do not declare unrelated library/logging calls decisive.',
  'Object names resolve in this invocation. Entry parameters declare typed identities without known values; a duplicate bind is unnecessary. A bind with the same name explicitly declares a new identity; use aliasOf when sharing is intended. caller/helper names are different unless explicit arguments or aliasOf links the same typed identity. A qualified handle.object or handle.guard references an already explicit same-question identity/control; same spelling alone does not alias. Helper parameters receive ONLY explicitly mapped objects of the matching type; argument diagnostics name missing mappings, unbound objects or mismatched types. effect {kind:effect,name,claim,principal?,resource?,operation?,authorizedBy?:[guard name]} is an actual protected operation, not successful return or reaching a call. authorizedBy only asserts a source-visible guard on THIS identical principal/resource; omit an unsupported assertion and explain the missing authorization.',
  'return {kind:return,name,claim,value?:scalar,outcome?:allow|deny|unknown} ends this function. For ENTRY returns give source permit/reject outcome explicitly, including success without mutation; never infer outcome from the boolean value. Helper return resumes the caller, without declaring a protected effect. A known scalar helper return substitutes only the explicit call.result name in later predicates. reject {kind:reject,name,claim} terminates the request as deny; helper false success/failure values are return, not automatically rejection. unresolved {kind:unresolved,name,claim,reason} names unsupported loops/dynamic aliases, missing controls, or genuine unavailable facts. complete:true asserts all decisive source paths were actually interpreted; entry normal end also requires explicit fallthrough outcome.',
  'Predicates use wrapped operands {op:eq|neq,left:{binding:name}|{literal:scalar},right:{binding:name}|{literal:scalar}}, {op:is-null,value:operand}, {op:all|any,args:[predicates]}, {op:not,arg:predicate}. scalar:string/number/boolean/null. No arbitrary operators, target evaluation or source-to-user values. Only premiseValues {op:add|replace,questionId,targetKey:<predicate binding>,status:known,value,text:<EXACT original current user span>} supply known user facts. Omit unspecified values (null never means unknown). Mapping meaning remains unreviewed. Bounds: depth12,16 paths,128 canonical nodes/question; unsupported relations remain explicit partial answers.',
  'Final result uses authorization-semantic-result/v1: {schemaVersion,revision:<CURRENT resultSkeleton revision>,questions:[{questionId,explanation,paths?:[{pathId:<CURRENT host path id>,explanation,disposition?,protectedEffect?:none|performed|unresolved,policy?:{expected:allow|deny,text:<EXACT supplied independent policy span>}}],missing?,policyAssessment?,counterfactuals?:[{pathId:<host excluded path id>,explanation}]}],scope}. Host derives all CURRENT branches, conditions/citations and outcomes from the SAME graph; you explain source and map independent policy to each feasible path. Optional disposition/effect assertions are checked, never silently changed. Missing known source is source-gap; unspecified premise remains conditional when alternatives are fully described. Source gaps and missing callees cannot be concealed by premise/deployment uncertainty. Only counterfactuals REQUESTED by the original user belong separately; do not add arbitrary alternatives as new duties. Do not attach a changing block to final before seeing its new skeleton. Free text and policy meaning still require source review.',
  'Structured inquiry final step is {kind:"final",result:<the COMPLETE semantic result>,controlDelta?:<update>}; revision is inside result, not step root. A delta-only step cannot deliver an answer. Optional path policy is an object when supplied; omit it when absent, never policy:null. Control steps contain kind/controlDelta only; supplemental observations require kind:observe, never observations at a control root. A requested dependency range must equal its indexed candidate boundary; dependency-locator-range-mismatch means the file is allowed but its locator needs explicit correction, not external source unavailability.',
  'Feedback preserves accepted units and rejected drafts. sourceTerminals maps each host pathId to its exact sourceOrigin handle/block/step, outcome, gap and original evidence. Repair only that named handle using its original source. An entry-return-outcome-unspecified diagnosis means that return permission outcome was not interpreted; do not hide it by asserting conditional in final or by inferring permission from its scalar value. Keep a genuine source gap and name its decisive helper instead. Current sourceWindows are whole original windows. No extra extraction call is introduced; use the next ordinary model/native step. A read original helper with no accepted semantic body is awaiting-interpretation, not an unread external gap. An unchanged repeated diagnostic is not a repair.',
  'A semanticBlocks[] item is a COMPLETE source unit; a {name,steps} block belongs inside its blocks array. Never invent itemId: copy it from the current source-window task, or reuse an accepted unit itemId for op:replace. rejectedBlocks carries host draftId plus the exact rejected raw proposal/diagnostics. A corrected unit may add repairsDraftId:<that live draftId> to identify an unbound bad draft. Only an accepted source-bound unit clears that draft; known question/handle scope must match. Original raw and the repair link remain archived. Empty updates, nonexistent draft IDs and invalid repairs never clear errors.',
  FINITE_PERMISSION_GUIDE,
].join("\n")

export interface SemanticDraftRecord { raw: unknown; questionId?: string; handle: string; draftId: string; accepted: boolean; repairedDraftId?: string; diagnostics: InquiryDiagnostic[] }
export function applySemanticBlocks(previous: BoundSemanticBlock[], raw: unknown[], offered: LocalExplanationTask[], rejectedDrafts: SemanticDraftRecord[] = []) {
  const units = structuredClone(previous), diagnostics: InquiryDiagnostic[] = [], records: SemanticDraftRecord[] = []
  for (const input of raw) {
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {}, handle = String(value.handle ?? ""), itemId = String(value.itemId ?? "")
    const task = offered.find(t => t.itemId === itemId), retained = units.find(u => u.itemId === itemId && u.handle === handle), questionId = task?.question.id ?? retained?.questionId
    const draftId = "semantic-draft-" + createHash("sha256").update(canonicalControl({ input, questionId, handle })).digest("hex").slice(0, 24)
    const local: InquiryDiagnostic[] = [], fail = (code: string, message: string, suffix = "") => local.push({ code, path: `${questionId ? `semanticBlocks.${questionId}.${handle}` : `semanticDrafts.${draftId}`}${suffix}`, ...(questionId ? { questionId } : {}), message, severity: "error" })
    const parsed = SemanticBlockSchema.safeParse(input)
    if (!parsed.success) for (const issue of parsed.error.issues) fail("semantic-block-schema", issue.message, `.${issue.path.join(".")}`)
    else if (!task && !(parsed.data.op === "replace" && retained)) fail("semantic-work-not-offered", `A new semantic unit must bind a current original-window offer. A replacement may reference its own retained itemId. Current offered itemIds: ${JSON.stringify(offered.map(t => t.itemId))}. Choose by its shown source, never by a new name.`)
    else {
      const repair = parsed.data.repairsDraftId && rejectedDrafts.find(d => d.draftId === parsed.data.repairsDraftId)
      if (parsed.data.repairsDraftId && !repair) fail("semantic-draft-repair-not-live", "Use an exact currently rejected host draftId; accepted or missing drafts cannot be cleared.")
      else if (repair && (repair.questionId && repair.questionId !== questionId || repair.handle && repair.handle !== handle)) fail("semantic-draft-repair-scope", "A repair must preserve the rejected draft's known question and handle.")
      const old = units.find(u => u.questionId === questionId && u.handle === handle)
      const { repairsDraftId: _repair, ...sourceData } = parsed.data
      const candidate: BoundSemanticBlock = { ...sourceData, questionId: questionId!, evidenceIds: [...new Set([...(task?.evidenceIds ?? retained!.evidenceIds), ...(task?.callsiteEvidenceIds ?? [])])] }
      local.push(...semanticBlockDiagnostics(parsed.data).map(d => ({ ...d, questionId, path: `semanticBlocks.${questionId}.${handle}.${d.path}` })))
      if (old && parsed.data.op === "add" && canonicalControl({ ...candidate, itemId: old.itemId, op: "add" }) !== canonicalControl({ ...old, op: "add" })) fail("semantic-handle-conflict", "Changed accepted handle requires op:replace; accepted source interpretation was preserved.")
      if (!old && parsed.data.op === "replace") fail("semantic-handle-missing", "Use op:add for an unaccepted handle.")
      if (!local.length) { if (old) units[units.indexOf(old)] = candidate; else units.push(candidate) }
    }
    records.push({ raw: structuredClone(input), questionId, handle, draftId, accepted: !local.length, ...(parsed.success && parsed.data.repairsDraftId ? { repairedDraftId: parsed.data.repairsDraftId } : {}), diagnostics: local }); diagnostics.push(...local)
  }
  return { units, records, diagnostics }
}

export function lowerIntoControlSlice(previous: ControlSlice, units: BoundSemanticBlock[], program: AuthorizationInquiryProgram, context: Parameters<typeof mergeControlSlice>[3], compositional = false) {
  const lowered = lowerSemanticFlow(units, { compositional }), base = structuredClone(previous)
  // Replace only host-owned semantic expansions. Raw canonical/other question facts stay intact.
  base.rules = base.rules.filter(r => !r.sourceOrigin)
  base.dependencies = base.dependencies.filter(d => !d.key.startsWith("sem-"))
  const merged = mergeControlSlice(base, lowered.delta, program, context)
  return { ...lowered, state: merged.state, diagnostics: [...lowered.diagnostics, ...merged.diagnostics] }
}

export function semanticResultSkeleton(slice: ControlSlice, dependencies: DependencyCheckState[]) {
  const paths = evaluateControlPaths(slice).paths
  return { revision: slice.revision, paths: paths.map(path => {
    const retained = slice.rules.filter(r => r.questionId === path.questionId && r.pathKey === path.pathKey)
    const terminals = retained.filter(r => r.terminal === true || r.terminal !== false && (r.kind === "effect" || r.kind === "reject"))
    return { ...path, evidenceIds: [...new Set(slice.rules.filter(r => r.questionId === path.questionId && path.nodeKeys.includes(r.key)).flatMap(r => r.evidenceIds))], retainedEvidenceIds: [...new Set((terminals.length ? terminals : retained).flatMap(r => controlRuleReach(slice, r, false).ancestors.flatMap(n => n.evidenceIds)))] }
  }), openDependencies: dependencies.filter(d => d.decisive && !["checked", "inapplicable"].includes(d.state)), semanticSupport: "unreviewed" }
}

/** Model prose remains raw; typed supplements are checked against one current skeleton. */
export function assembleSemanticResult(program: AuthorizationInquiryProgram, slice: ControlSlice, dependencies: DependencyCheckState[], input: unknown) {
  const parsed = SemanticResultSchema.safeParse(input), skeleton = semanticResultSkeleton(slice, dependencies), diagnostics: InquiryDiagnostic[] = []
  const fail = (code: string, path: string, message: string, questionId?: string) => diagnostics.push({ code, path, message, severity: "error", ...(questionId ? { questionId } : {}) })
  if (!parsed.success) return { result: input, paths: skeleton.paths, diagnostics: parsed.error.issues.map(i => ({ code: "semantic-result-schema", path: i.path.join("."), message: i.message, severity: "error" } as InquiryDiagnostic)), policyRules: [] }
  const raw = parsed.data, policyRules: Array<Record<string, unknown>> = []
  if (raw.revision !== slice.revision) fail("semantic-result-stale", "revision", `Result refers to revision ${raw.revision}; current extraction is ${slice.revision}. Regenerate explanation from current resultSkeleton.`)
  const seen = new Set<string>()
  for (const q of raw.questions) { if (seen.has(q.questionId)) fail("semantic-question-duplicate", q.questionId, "Duplicate question supplement.", q.questionId); seen.add(q.questionId); if (!program.questions.some(p => p.id === q.questionId)) fail("unknown-question", q.questionId, "Question is undeclared.", q.questionId) }
  const questions = program.questions.map(question => {
    const q = raw.questions.find(q => q.questionId === question.id), paths = skeleton.paths.filter(p => p.questionId === question.id), live = paths.filter(p => p.state !== "inapplicable"), open = skeleton.openDependencies.filter(d => d.questionId === question.id)
    if (!q) fail("semantic-question-missing", question.id, "Every original question needs its own explanation.", question.id)
    const outcomes = new Set(live.map(p => p.disposition)), disposition = !live.length || live.some(p => !p.complete) || open.length ? "unknown" as const : outcomes.size === 1 && live.some(p => p.predicate.truth === "true") ? live[0]!.disposition : "conditional" as const
    if (q?.disposition && q.disposition !== disposition) fail("semantic-disposition-conflict", question.id, `Current rules derive ${disposition}; supplement claims ${q.disposition}. Raw assertion retained.`, question.id)
    for (const path of q?.paths ?? []) {
      const current = live.find(p => p.pathKey === path.pathId)
      if (!current) { fail("semantic-path-missing", `${question.id}.${path.pathId}`, "Use a CURRENT feasible host path id; excluded paths belong in requested counterfactuals.", question.id); continue }
      if (path.disposition && path.disposition !== current.disposition) fail("semantic-disposition-conflict", `${question.id}.${path.pathId}`, `Path derives ${current.disposition}; raw assertion is ${path.disposition}.`, question.id)
      if (path.protectedEffect && path.protectedEffect !== current.protectedEffect) fail("semantic-effect-conflict", `${question.id}.${path.pathId}`, `Current path effect is ${current.protectedEffect}; raw assertion is ${path.protectedEffect}. Return/call is not mutation.`, question.id)
      if (path.policy) {
        if (!program.policy || !program.policy.text.includes(path.policy.text)) fail("policy-not-supplied", `${question.id}.${path.pathId}`, "Map an exact current independent policy span.", question.id)
        else { const key = `semantic-policy-${path.pathId}`, old = slice.policyRules.find(p => p.questionId === question.id && p.key === key); policyRules.push({ key, questionId: question.id, pathKey: path.pathId, expected: path.policy.expected, text: path.policy.text, location: program.policy.location, origin: "policy", ...(old ? { revisionOf: old.digest, revisionReason: "Explicit current semantic policy supplement" } : {}) }) }
      }
    }
    const missing = [...(q?.missing ?? [])]
    for (const p of live.filter(p => !p.complete)) if (!missing.some(m => m.kind === "source-gap" && m.detail.includes(p.pathKey))) missing.push({ kind: "source-gap", detail: `${p.pathKey}: ${p.gaps.join(", ") || "source interpretation not closed"}` })
    for (const d of open) if (!missing.some(m => m.detail.includes(d.key) || m.detail.includes(d.symbol))) missing.push({ kind: d.state === "external-unknown" ? "dependency-out-of-scope" : "source-gap", detail: `${d.key}: ${d.symbol} (${d.state})`, nextRead: d.symbol })
    const unresolved = [...new Set(live.flatMap(p => p.predicate.missingBindings))]
    if (unresolved.length && !missing.some(m => m.kind === "premise-unspecified")) missing.push({ kind: "premise-unspecified", detail: `Current user values unspecified: ${unresolved.join(", ")}. Source-supported alternatives remain separate.` })
    const evidenceIds = [...new Set(live.flatMap(p => p.evidenceIds))]
    let explanation = q?.explanation ?? "Missing original-question explanation."
    for (const cf of q?.counterfactuals ?? []) {
      const excluded = paths.find(p => p.pathKey === cf.pathId && p.state === "inapplicable")
      if (!excluded) fail("semantic-counterfactual-path", `${question.id}.${cf.pathId}`, "Counterfactual reference must name an excluded retained path.", question.id)
      else { const cited = excluded.retainedEvidenceIds; explanation += `\nRequested counterfactual (${cf.pathId}, ${cited.join(", ")}): ${cf.explanation}`; evidenceIds.push(...cited) }
    }
    if (!live.length && !missing.length) missing.push({ kind: "source-gap", detail: "No currently feasible source interpretation is closed." })
    return { questionId: question.id, behavior: { disposition, explanation }, evidenceIds: [...new Set(evidenceIds)], branches: live.map(p => ({ id: p.pathKey, condition: canonicalControl(p.predicate.truth === "unknown" ? p.predicate.residual : p.condition), disposition: p.disposition, explanation: q?.paths.find(e => e.pathId === p.pathKey)?.explanation ?? explanation, evidenceIds: p.evidenceIds })), missing, ...(q?.policyAssessment ? { policyAssessment: q.policyAssessment } : program.mode === "conformance" ? { policyAssessment: { status: "undetermined" as const, explanation: "Independent policy interpretation is incomplete." } } : {}) }
  })
  return { result: { schemaVersion: "authorization-inquiry-result/v1" as const, questions, observations: [], scope: raw.scope }, paths: skeleton.paths, diagnostics, policyRules }
}
