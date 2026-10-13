import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { QuestionDeclarationSchema, SourceCitationSchema, compileQuestionDeclaration, type QuestionReference } from "./question-workflow.ts"
import { compileSourceEdit } from "./source-edit.ts"
import { lowerSourceInterpretation, type SourceInterpretation } from "./source-interpretation.ts"
import { propertySourceReference, type PropertyQueryContext } from "./property-query.ts"
import { createSourceMaterials, type SourceMaterial } from "./source-materials.ts"
import { createControlSlice, sourceMaterialSemanticVersion, FiniteValueSchema } from "./control-slice.ts"
import type { FiniteValue } from "./control-evaluation.ts"
import { checkPropertyQueries } from "./control-conclusion.ts"
import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { projectSourceMaterials, type SourceFunctionRoot } from "../../benchmarks/authorization-dsl/source-material-projection.ts"
import { sourceRelationRevision } from "../../benchmarks/authorization-dsl/operation-work.ts"
import { lowerIntoControlSlice } from "../../benchmarks/authorization-dsl/inquiry-semantic.ts"
import { ResourceWorkflowSchema, ResourceWorkflowDraftSchema, inspectResourceDraft, executeResourceWorkflow, type ResourceValue, type ExternalAssumptionsSchema } from "./resource-relations.ts"
import { ProgramInputBindingSchema, programInputBindingSummary, type ProgramInputResolution } from "./program-input-binding.ts"
import { AuthoringTargetSchema } from "./program-coverage.ts"

const scope = z.object({ kind: z.enum(["function-contract", "request-operation"]), questionId: InquiryText, operationId: InquiryText.optional(), root: SourceCitationSchema, upstream: z.array(InquiryText).max(32) }).strict()
export const ExecutableContractSchema = z.object({ schemaVersion: z.literal("authorization-executable-contract/v1"), id: InquiryText, scope,
  sourceDeclarations: z.array(QuestionDeclarationSchema).min(1).max(32), queries: QuestionDeclarationSchema.shape.properties.unwrap().default([]),
  assumptions: z.array(z.object({ text: InquiryText, origin: z.enum(["user", "source", "development-premise"]), source: SourceCitationSchema.optional() }).strict()).max(32).default([]),
  resourceWorkflow: ResourceWorkflowSchema.optional(),
  inputBinding: ProgramInputBindingSchema.optional(),
  authoringTarget: AuthoringTargetSchema.optional(),
}).strict()
const sourceInput = z.union([SourceCitationSchema, z.object({ symbol: InquiryText, path: InquiryText.optional(), receiverClass: InquiryText.optional(), sha256: InquiryText.optional() }).strict()])
/** Author-facing mechanical omissions; normalization still resolves source identity in the live index. */
export const ExecutableContractInputSchema = ExecutableContractSchema.extend({
  schemaVersion: ExecutableContractSchema.shape.schemaVersion.optional(),
  scope: scope.extend({ root: sourceInput }),
  sourceDeclarations: z.array(z.record(z.unknown())).min(1).max(32),
  resourceWorkflow: ResourceWorkflowDraftSchema.optional(),
  notes: z.string().optional(), description: z.string().optional(),
})
export type ExecutableContract = z.infer<typeof ExecutableContractSchema>
export type ExecutableContractCompilation = Awaited<ReturnType<typeof compileExecutableContract>>
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")

export type ExecutionPolicy = "strict" | "progressive"
export type ProgramMode = "consume" | "edit"
export interface ExecutableSourceSnapshot { program: unknown; files: readonly { path: string; sha256: string }[]; revision?: string }
/** Bind omitted source identities to the verified previous canonical view.
 * This changes only the check input, never archived raw proposal bytes. */
export function pinExecutableSourceSnapshot(snapshot: ExecutableSourceSnapshot) {
  const value: any = structuredClone(snapshot.program), files = new Map(snapshot.files.map(f => [f.path, f.sha256]))
  const pin = (at: any) => {
    if (at && typeof at === "object" && typeof at.path === "string" && at.sha256 === undefined) at.sha256 = files.get(at.path) ?? "previous-source-unavailable"
  }
  pin(value?.scope?.root)
  for (const declaration of value?.sourceDeclarations ?? []) pin(declaration?.source)
  for (const step of value?.resourceWorkflow?.steps ?? []) { pin(step?.source); for (const at of step?.sources ?? []) pin(at) }
  for (const assumption of value?.assumptions ?? []) pin(assumption?.source)
  for (const item of value?.authoringTarget?.coverage ?? []) pin(item?.source)
  return value
}
/** Mechanical omissions only; the raw proposal retains nonsemantic notes. */
export function normalizeExecutableContract(raw: unknown, index: InquiryTools["structure"]) {
  const value: any = structuredClone(raw), normalizations: string[] = []
  const object = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
  const version = (v: any, expected: string, at: string) => { if (object(v) && v.schemaVersion === undefined) { v.schemaVersion = expected; normalizations.push(`${at}.schemaVersion`) } }
  const source = (v: any, at: string) => {
    if (!object(v) || !index || typeof v.symbol !== "string") return
    const candidates = index.symbols.filter(s => (!v.path || s.path === v.path) && (s.qualifiedName === v.symbol || s.name === v.symbol) && ["function", "method"].includes(s.kind))
    if (candidates.length !== 1) return
    const s = candidates[0]!
    if (v.startLine !== undefined && v.startLine !== s.startLine || v.endLine !== undefined && v.endLine !== s.endLine) return
    delete v.symbol; Object.assign(v, { path: s.path, startLine: s.startLine, endLine: s.endLine }); normalizations.push(at)
  }
  if (object(value)) {
    version(value, "authorization-executable-contract/v1", "$")
    for (const key of ["description", "notes"]) if (typeof value[key] === "string") { delete value[key]; normalizations.push(`$.${key}:retained-in-raw`) }
    source(value.scope?.root, "scope.root")
    if (Array.isArray(value.sourceDeclarations)) for (const [i, d] of value.sourceDeclarations.entries()) { version(d, "authorization-question-declaration/v1", `sourceDeclarations.${i}`); if (object(d)) source(d.source, `sourceDeclarations.${i}.source`) }
    if (Array.isArray(value.resourceWorkflow?.steps)) for (const [i, step] of value.resourceWorkflow.steps.entries()) if (object(step)) {
      source(step.source, `resourceWorkflow.steps.${i}.source`)
      if (Array.isArray(step.sources)) for (const [j, at] of step.sources.entries()) source(at, `resourceWorkflow.steps.${i}.sources.${j}`)
    }
  }
  return { value, normalizations }
}

export async function readExecutableContractSources(raw: unknown, tools: InquiryTools) {
  const normalized = normalizeExecutableContract(raw, tools.structure), value = normalized.value
  const citations = [...(Array.isArray(value?.sourceDeclarations) ? value.sourceDeclarations.map((d: any) => d?.source) : []), ...(Array.isArray(value?.resourceWorkflow?.steps) ? value.resourceWorkflow.steps.flatMap((s: any) => [s?.source, ...(Array.isArray(s?.sources) ? s.sources : [])]) : [])]
  for (const candidate of citations) {
    const at = SourceCitationSchema.safeParse(candidate)
    if (!at.success || !at.data.path) continue
    const s = at.data, file = tools.files.find(f => f.path === s.path)
    if (file && tools.evidence.some(e => e.path === s.path && e.sha256 === file.sha256 && e.startLine <= s.startLine && e.endLine >= (s.endLine ?? s.startLine))) continue
    await tools.execute("source_read", { path: s.path!, startLine: s.startLine, endLine: s.endLine ?? s.startLine })
  }
  return normalized
}

/** One source-declaration compiler, material projector and property evaluator.
 * Files and native tools call this same host function. It never reads source on
 * behalf of a model, accepts verdicts, or promotes a local root to request entry. */
export async function compileExecutableContract(raw: unknown, options: { tools: InquiryTools; program: AuthorizationInquiryProgram; confirmedEntries?: BoundSemanticBlock[]; inputs?: Record<string, FiniteValue>; interpretationSource?: SourceMaterial["interpretationSource"]; executionPolicy?: ExecutionPolicy; resourceInputs?: Record<string, ResourceValue>; externalAssumptions?: z.infer<typeof ExternalAssumptionsSchema>; inputResolution?: ProgramInputResolution }) {
  const progressive = options.executionPolicy === "progressive", normalized = normalizeExecutableContract(raw, options.tools.structure)
  const diagnostics: InquiryDiagnostic[] = [], candidate: any = normalized.value
  if (progressive && Array.isArray(candidate?.sourceDeclarations)) candidate.sourceDeclarations = candidate.sourceDeclarations.filter((d: unknown, i: number) => {
    const result = QuestionDeclarationSchema.safeParse(d)
    if (result.success) return true
    for (const issue of result.error.issues) diagnostics.push({ code: "contract-local-shape", path: `sourceDeclarations.${i}.${issue.path.join(".")}`, message: issue.message, severity: "error" })
    return false
  })
  const parsed = (progressive ? ExecutableContractSchema.extend({ resourceWorkflow: ResourceWorkflowDraftSchema.optional() }) : ExecutableContractSchema).safeParse(candidate)
  const fail = (code: string, path: string, message: string) => diagnostics.push({ code: `contract-${code}`, path, message, severity: "error", ...(parsed.success ? { questionId: parsed.data.scope.questionId } : {}) })
  const empty = () => ({ diagnostics, normalizations: normalized.normalizations, units: [] as BoundSemanticBlock[], materialUses: [] as ReturnType<typeof projectSourceMaterials>["uses"], requestOperationCertified: false as const })
  if (!parsed.success) { for (const issue of parsed.error.issues) fail("shape", issue.path.join("."), issue.message); return empty() }
  const contract = parsed.data, index = options.tools.structure, question = options.program.questions.find(q => q.id === contract.scope.questionId)
  if (contract.resourceWorkflow) {
    const draft = inspectResourceDraft(contract.resourceWorkflow)
    for (const id of draft.duplicateIds) fail("resource-shape", "resourceWorkflow.identities", `Duplicate input/computed identity:${id}`)
    for (const slot of draft.steps) for (const issue of slot.issues) fail("resource-shape", `resourceWorkflow.${issue.path}`, issue.message)
  }
  if (!index) fail("structure", "$", "The current strategy needs the original source structure index.")
  if (!question) fail("question", "scope.questionId", "The contract must keep one current original question identity.")
  if (!index || !question) return empty()
  const operationId = options.program.operationQuestions?.find(q => q.questionId === question.id)?.operationId ?? contract.scope.operationId ?? `question:${question.id}`
  if (contract.scope.operationId && contract.scope.operationId !== operationId) { fail("operation", "scope.operationId", "The current question belongs to another operation."); return empty() }
  const skeletons: SourceSkeleton[] = []
  const declarations: typeof contract.sourceDeclarations = []
  const resolveReceiver = (at: z.infer<typeof SourceCitationSchema>, symbol: NonNullable<typeof index>["symbols"][number], path: string) => {
    if (!at.receiverClass) return
    const qualified = index.qualifySourceName(at.receiverClass, symbol.path) ?? at.receiverClass
    const classes = index.symbols.filter(s => s.kind === "class" && s.qualifiedName === qualified)
    if (classes.length !== 1 || !symbol.className || symbol.className !== classes[0]!.qualifiedName && !index.lookupMethod(classes[0]!.qualifiedName, symbol.name).some(s => s.id === symbol.id)) { fail("source-receiver", path, "The receiver must resolve uniquely in this original source scope and own this method through the current method lookup."); return }
    at.receiverClass = classes[0]!.qualifiedName
  }
  for (const [i, declaration] of contract.sourceDeclarations.entries()) {
    const before = diagnostics.length
    const at = declaration.source, candidates = index.symbols.filter(s => s.path === at.path && s.startLine === at.startLine && s.endLine === (at.endLine ?? at.startLine))
    if (!options.tools.files.some(f => f.path === at.path)) { fail("source-scope", `sourceDeclarations.${i}.source`, "The source is outside the current allowed files."); return empty() }
    if (candidates.length !== 1) { fail("source-owner", `sourceDeclarations.${i}.source`, `A complete current source owner must resolve uniquely; candidates=${candidates.length}.`); continue }
    const symbol = candidates[0]!
    resolveReceiver(at, symbol, `sourceDeclarations.${i}.source.receiverClass`)
    if (diagnostics.length > before) continue
    const skeleton = await options.tools.sourceSkeleton(symbol.id, at.receiverClass)
    if (!skeleton || !skeleton.modelCovered) { fail("source-unread", `sourceDeclarations.${i}.source`, "Read the complete current original passage before interpreting it; indexing or an imported file is not read coverage."); continue }
    if (at.sha256 && at.sha256 !== skeleton.source.sha256) { fail("source-stale", `sourceDeclarations.${i}.source`, "The cited source SHA is not current."); continue }
    if (skeletons.some(s => s.sourceId === skeleton.sourceId && declarations[skeletons.indexOf(s)]!.source.receiverClass === at.receiverClass)) { fail("source-duplicate", `sourceDeclarations.${i}.source`, "One current source/receiver owner must have one declaration."); continue }
    skeletons.push(skeleton); declarations.push(declaration)
  }
  if (diagnostics.length && !progressive) return empty()
  const rootDiagnosticStart = diagnostics.length
  const rootAt = contract.scope.root, roots = skeletons.filter(s => s.source.path === rootAt.path && s.source.startLine === rootAt.startLine && s.source.endLine === (rootAt.endLine ?? rootAt.startLine))
  if (roots.length === 1) {
    resolveReceiver(rootAt, index.symbols.find(s => s.id === roots[0]!.sourceId)!, "scope.root.receiverClass")
    const declarationReceiver = declarations[skeletons.indexOf(roots[0]!) ]!.source.receiverClass
    if (rootAt.receiverClass !== declarationReceiver) fail("root-receiver", "scope.root.receiverClass", "The scope root and its declaration must select the same current receiver.")
  }
  if (roots.length !== 1 || rootAt.sha256 && roots[0]?.source.sha256 !== rootAt.sha256) fail("root", "scope.root", "The root must be one uniquely current declared complete source.")
  const root = roots[0]
  if (contract.scope.kind === "request-operation" && (!root || !(options.confirmedEntries ?? []).some(u => u.questionId === question.id && u.role === "entry" && u.source?.id === root.sourceId && u.source.sha256 === root.source.sha256 && u.receiverClass === rootAt.receiverClass))) fail("entry-unconfirmed", "scope", "A request operation needs the existing host-confirmed request entry; a helper cannot be relabeled through an import.")
  if (diagnostics.length > rootDiagnosticStart || !root) return empty()
  const conditions = options.inputs ?? {}
  if (Object.keys(conditions).length && contract.scope.kind !== "function-contract") fail("input-scope", "inputs", "Explicit entry values are available only to a local function contract; request injection remains the existing host responsibility.")
  for (const [parameter, value] of Object.entries(conditions)) {
    if (!root.anchors.some(a => a.kind === "parameter" && a.name === parameter) || ["__proto__", "constructor", "prototype"].includes(parameter)) fail("input-parameter", `inputs.${parameter}`, "Only actual entry formal inputs are admissible; internal guards, property IDs, call results and verdicts cannot be assigned.")
    if (!FiniteValueSchema.safeParse(value).success) fail("input-value", `inputs.${parameter}`, "Use one bounded finite value; unspecified inputs are omitted, never converted to false or null.")
  }
  if (diagnostics.length > rootDiagnosticStart) return empty()
  const owners = skeletons.map((skeleton, i) => ({ skeleton, questionId: question.id, operationId, receiverClass: declarations[i]!.source.receiverClass, handle: `contract-${digest([question.id, skeleton.sourceId, declarations[i]!.source.receiverClass]).slice(0, 24)}`, interpretation: undefined as SourceInterpretation | undefined }))
  const references: QuestionReference[] = owners.flatMap(owner => owner.skeleton.anchors.map(anchor => ({ ref: propertySourceReference(owner, anchor.id), kind: anchor.kind, text: anchor.text, source: { path: owner.skeleton.source.path, startLine: anchor.selector.startLine, endLine: anchor.selector.endLine } })))
  for (const [i, owner] of owners.entries()) {
    const transactionId = `contract:${digest([contract.id, owner.skeleton.revision, question.id])}`, declaration = declarations[i]!
    const withQueries = owner.skeleton === root && contract.queries.length ? { ...declaration, properties: contract.queries } : declaration
    let compiled = compileQuestionDeclaration(owner.skeleton, withQueries, { transactionId, questionId: question.id, references, properties: question.properties })
    diagnostics.push(...compiled.diagnostics)
    if (progressive && !compiled.edit && compiled.diagnostics.length && compiled.diagnostics.every(d => d.code.startsWith("question-property-"))) compiled = compileQuestionDeclaration(owner.skeleton, { ...declaration, properties: undefined }, { transactionId, questionId: question.id, references, properties: question.properties })
    if (compiled.edit) owner.interpretation = compileSourceEdit(owner.skeleton, compiled.edit, { transactionId, questionId: question.id, progressive: true }).interpretation
  }
  if (diagnostics.length && !progressive) return empty()
  const propertyContext: PropertyQueryContext = { operationId, sources: owners }, units: BoundSemanticBlock[] = [], demands = [] as NonNullable<ReturnType<typeof lowerSourceInterpretation>["demand"]>[]
  for (const owner of owners) {
    const role = contract.scope.kind === "request-operation" && owner.skeleton === root ? "entry" as const : "helper" as const
    const lowered = lowerSourceInterpretation(owner.skeleton, owner.interpretation, { index, questionId: question.id, itemId: owner.handle, handle: owner.handle, role, propertyDirected: true, propertyAbstraction: true, question: { ...question, premises: question.premises.map(p => p.text) }, propertyContext, sourceObjectBindings: true })
    diagnostics.push(...lowered.diagnostics)
    if (lowered.unit && !lowered.diagnostics.some(d => d.severity === "error")) units.push({ ...lowered.unit, questionId: question.id, evidenceIds: owner.skeleton.evidenceIds, source: owner.skeleton.source, receiverClass: owner.receiverClass })
    if (lowered.demand) demands.push(lowered.demand)
  }
  if (diagnostics.length && !progressive) return empty()
  const invalidSteps: Record<string, string[]> = {}
  if (contract.resourceWorkflow) for (const slot of inspectResourceDraft(contract.resourceWorkflow).steps) {
    const step: any = slot.raw, i = slot.index
    for (const rawAt of [step?.source, ...(Array.isArray(step?.sources) ? step.sources : [])]) {
    // Even malformed steps cannot smuggle an out-of-scope citation.
    if (rawAt && typeof rawAt.path === "string" && !options.tools.files.some(f => f.path === rawAt.path)) { fail("source-scope", `resourceWorkflow.steps.${i}.source`, "The resource summary source is outside the allowed files."); return empty() }
    const citation = SourceCitationSchema.safeParse(rawAt)
    if (!citation.success) continue
    const at = citation.data
    const file = options.tools.files.find(f => f.path === at.path)
    if (!file) { fail("source-scope", `resourceWorkflow.steps.${i}.source`, "The resource summary source is outside the allowed files."); return empty() }
    const evidence = options.tools.evidence.find(e => e.path === at.path && e.sha256 === file.sha256 && e.startLine <= at.startLine && e.endLine >= (at.endLine ?? at.startLine))
    const reason = at.sha256 && at.sha256 !== file.sha256 ? `resource-source-stale:${at.path}` : !evidence ? `resource-source-unread:${at.path}:${at.startLine}` : undefined
    if (reason) { (invalidSteps[slot.id] ??= []).push(reason); fail("resource-source", `resourceWorkflow.steps.${i}.source`, reason) }
    else rawAt.sha256 = file.sha256
    }
  }
  if (diagnostics.length && !progressive) return empty()
  if (contract.resourceWorkflow) for (const step of inspectResourceDraft(contract.resourceWorkflow).unreachableSteps)
    diagnostics.push({ code: "contract-resource-unreachable", path: `resourceWorkflow.steps.${step.index}`, questionId: question.id, severity: "warning", message: `Step ${step.id} follows declared unconditional return ${step.after} and is unreachable when that return executes. Use an explicit complete stepOrder in authorization_program_patch to move it before the return if supported by source; no implicit reordering occurs.` })
  for (const [i, item] of (contract.authoringTarget?.coverage ?? []).entries()) {
    const at = item.source, file = options.tools.files.find(f => f.path === at.path)
    const supported = file && (!at.sha256 || at.sha256 === file.sha256) && options.tools.evidence.some(e => e.path === at.path && e.sha256 === file.sha256 && e.startLine <= at.startLine && e.endLine >= (at.endLine ?? at.startLine))
    const missingSteps = item.stepIds.filter(id => !contract.resourceWorkflow?.steps.some((s: any) => s?.id === id))
    if (!supported || missingSteps.length || item.disposition === "implemented" && !item.stepIds.length) diagnostics.push({ code: "contract-coverage-reference", path: `authoringTarget.coverage.${i}`, questionId: question.id, severity: "warning", message: `Author coverage is unreviewed: current source reference=${!!supported}; missing steps=${JSON.stringify(missingSteps)}; implemented claims require explicit steps. Coverage metadata does not change current execution.` })
    else if (file) at.sha256 = file.sha256
  }
  const resourceInputs = { ...options.resourceInputs }
  if (contract.resourceWorkflow && options.inputResolution) diagnostics.push(...options.inputResolution.diagnostics)
  if (progressive && contract.resourceWorkflow) for (const key of Object.keys(resourceInputs)) if (!contract.resourceWorkflow.inputs.includes(key)) {
    delete resourceInputs[key]
    diagnostics.push({ code: "contract-resource-input-unused", path: `resourceInputs.${key}`, message: "This supplied scenario fact is not declared by the draft and was not used.", severity: "warning" })
  }
  const resourceExecution = contract.resourceWorkflow ? executeResourceWorkflow(contract.resourceWorkflow, resourceInputs, { progressive, invalidSteps, externalAssumptions: options.externalAssumptions }) : undefined
  const semanticVersion = sourceMaterialSemanticVersion("question-checked-v1"), materials = createSourceMaterials({ ...options.tools.identity, semanticVersion })
  for (const unit of units) materials.accept(unit, [{ kind: "source-span", key: unit.source!.path, revision: unit.source!.sha256 }, { kind: "symbol-resolution", key: unit.source!.id, revision: unit.source!.sha256 }, { kind: "candidate-set", key: `relations:${unit.source!.id}:${unit.receiverClass ?? ""}`, revision: sourceRelationRevision(index, unit.source!.id, unit.receiverClass)! }], options.interpretationSource ?? "model")
  const localRoot: SourceFunctionRoot = { questionId: question.id, operationId, source: root.source, receiverClass: rootAt.receiverClass }
  const projected = projectSourceMaterials(options.program, units, materials.snapshot(), index, { semanticVersion, questionDirected: true, ...(contract.scope.kind === "function-contract" ? { functionRoots: [localRoot], requestOperations: false } : {}) })
  const rootUnit = projected.units.find(u => u.questionId === question.id && u.source?.id === root.sourceId && u.receiverClass === rootAt.receiverClass)
  const functionRoots = contract.scope.kind === "function-contract" && rootUnit ? [{ questionId: question.id, handle: rootUnit.handle, inputs: conditions }] : []
  const lowered = lowerIntoControlSlice(createControlSlice(), projected.units, options.program, { questionIds: options.program.questions.map(q => q.id), shownEvidenceIds: options.tools.evidence.map(e => e.id) }, true, true, true, functionRoots)
  // Lowering gaps remain source rules. They are not rejected source transactions:
  // a later return/exception gap cannot invalidate an already covered prefix.
  const evaluation = checkPropertyQueries(options.program, lowered.state, demands, projected.units, [], progressive ? [] : diagnostics, true, "semantic-completion/v1")
  return { diagnostics, normalizations: normalized.normalizations, resourceExecution, inputBinding: options.inputResolution && programInputBindingSummary(options.inputResolution), contract, revision: digest([contract, options.program, conditions, options.resourceInputs, options.externalAssumptions, options.inputResolution && programInputBindingSummary(options.inputResolution), owners.map(o => o.skeleton.revision)]), scope: contract.scope, assumptions: contract.assumptions, conditions: structuredClone(conditions), units, projectedUnits: projected.units, functionRoots, sourceMaterials: materials.snapshot(), materialUses: projected.uses, materialProjection: { diagnostics: projected.diagnostics, stages: projected.stages }, demands, slice: lowered.state, loweringDiagnostics: lowered.diagnostics, evaluation, requestOperationCertified: false as const, semanticReview: "unreviewed" as const }
}
