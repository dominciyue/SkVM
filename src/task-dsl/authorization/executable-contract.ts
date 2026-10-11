import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { QuestionDeclarationSchema, SourceCitationSchema, compileQuestionDeclaration, type QuestionReference } from "./question-workflow.ts"
import { compileSourceEdit } from "./source-edit.ts"
import { lowerSourceInterpretation, type SourceInterpretation } from "./source-interpretation.ts"
import { propertySourceReference, type PropertyQueryContext } from "./property-query.ts"
import { createSourceMaterials } from "./source-materials.ts"
import { createControlSlice, sourceMaterialSemanticVersion } from "./control-slice.ts"
import { checkPropertyQueries } from "./control-conclusion.ts"
import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { projectSourceMaterials, type SourceFunctionRoot } from "../../benchmarks/authorization-dsl/source-material-projection.ts"
import { sourceRelationRevision } from "../../benchmarks/authorization-dsl/operation-work.ts"
import { lowerIntoControlSlice } from "../../benchmarks/authorization-dsl/inquiry-semantic.ts"

const scope = z.object({ kind: z.enum(["function-contract", "request-operation"]), questionId: InquiryText, operationId: InquiryText.optional(), root: SourceCitationSchema, upstream: z.array(InquiryText).max(32) }).strict()
export const ExecutableContractSchema = z.object({ schemaVersion: z.literal("authorization-executable-contract/v1"), id: InquiryText, scope,
  sourceDeclarations: z.array(QuestionDeclarationSchema).min(1).max(32), queries: QuestionDeclarationSchema.shape.properties.unwrap().default([]),
  assumptions: z.array(z.object({ text: InquiryText, origin: z.enum(["user", "source", "development-premise"]), source: SourceCitationSchema.optional() }).strict()).max(32).default([]),
}).strict()
export type ExecutableContract = z.infer<typeof ExecutableContractSchema>
export type ExecutableContractCompilation = Awaited<ReturnType<typeof compileExecutableContract>>
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")

/** One source-declaration compiler, material projector and property evaluator.
 * Files and native tools call this same host function. It never reads source on
 * behalf of a model, accepts verdicts, or promotes a local root to request entry. */
export async function compileExecutableContract(raw: unknown, options: { tools: InquiryTools; program: AuthorizationInquiryProgram; confirmedEntries?: BoundSemanticBlock[] }) {
  const diagnostics: InquiryDiagnostic[] = [], parsed = ExecutableContractSchema.safeParse(raw)
  const fail = (code: string, path: string, message: string) => diagnostics.push({ code: `contract-${code}`, path, message, severity: "error", ...(parsed.success ? { questionId: parsed.data.scope.questionId } : {}) })
  const empty = () => ({ diagnostics, units: [] as BoundSemanticBlock[], materialUses: [] as ReturnType<typeof projectSourceMaterials>["uses"], requestOperationCertified: false as const })
  if (!parsed.success) { for (const issue of parsed.error.issues) fail("shape", issue.path.join("."), issue.message); return empty() }
  const contract = parsed.data, index = options.tools.structure, question = options.program.questions.find(q => q.id === contract.scope.questionId)
  if (!index) fail("structure", "$", "The current strategy needs the original source structure index.")
  if (!question) fail("question", "scope.questionId", "The contract must keep one current original question identity.")
  if (diagnostics.length || !index || !question) return empty()
  const operationId = options.program.operationQuestions?.find(q => q.questionId === question.id)?.operationId ?? contract.scope.operationId ?? `question:${question.id}`
  if (contract.scope.operationId && contract.scope.operationId !== operationId) fail("operation", "scope.operationId", "The current question belongs to another operation.")
  const skeletons: SourceSkeleton[] = []
  for (const [i, declaration] of contract.sourceDeclarations.entries()) {
    const at = declaration.source, candidates = index.symbols.filter(s => s.path === at.path && s.startLine === at.startLine && s.endLine === (at.endLine ?? at.startLine))
    if (candidates.length !== 1) { fail("source-owner", `sourceDeclarations.${i}.source`, `A complete current source owner must resolve uniquely; candidates=${candidates.length}.`); continue }
    const symbol = candidates[0]!, skeleton = await options.tools.sourceSkeleton(symbol.id, at.receiverClass)
    if (!skeleton || !skeleton.modelCovered) { fail("source-unread", `sourceDeclarations.${i}.source`, "Read the complete current original passage before interpreting it; indexing or an imported file is not read coverage."); continue }
    if (at.sha256 && at.sha256 !== skeleton.source.sha256) { fail("source-stale", `sourceDeclarations.${i}.source`, "The cited source SHA is not current."); continue }
    if (skeletons.some(s => s.sourceId === skeleton.sourceId && contract.sourceDeclarations[skeletons.indexOf(s)]!.source.receiverClass === at.receiverClass)) { fail("source-duplicate", `sourceDeclarations.${i}.source`, "One current source/receiver owner must have one declaration."); continue }
    skeletons.push(skeleton)
  }
  if (diagnostics.length) return empty()
  const rootAt = contract.scope.root, roots = skeletons.filter(s => s.source.path === rootAt.path && s.source.startLine === rootAt.startLine && s.source.endLine === (rootAt.endLine ?? rootAt.startLine))
  if (roots.length !== 1 || rootAt.sha256 && roots[0]?.source.sha256 !== rootAt.sha256) fail("root", "scope.root", "The root must be one uniquely current declared complete source.")
  const root = roots[0]
  if (contract.scope.kind === "request-operation" && (!root || !(options.confirmedEntries ?? []).some(u => u.questionId === question.id && u.role === "entry" && u.source?.id === root.sourceId && u.source.sha256 === root.source.sha256 && u.receiverClass === rootAt.receiverClass))) fail("entry-unconfirmed", "scope", "A request operation needs the existing host-confirmed request entry; a helper cannot be relabeled through an import.")
  if (diagnostics.length || !root) return empty()
  const owners = skeletons.map((skeleton, i) => ({ skeleton, questionId: question.id, operationId, receiverClass: contract.sourceDeclarations[i]!.source.receiverClass, handle: `contract-${digest([question.id, skeleton.sourceId, contract.sourceDeclarations[i]!.source.receiverClass]).slice(0, 24)}`, interpretation: undefined as SourceInterpretation | undefined }))
  const references: QuestionReference[] = owners.flatMap(owner => owner.skeleton.anchors.map(anchor => ({ ref: propertySourceReference(owner, anchor.id), kind: anchor.kind, text: anchor.text, source: { path: owner.skeleton.source.path, startLine: anchor.selector.startLine, endLine: anchor.selector.endLine } })))
  for (const [i, owner] of owners.entries()) {
    const transactionId = `contract:${digest([contract.id, owner.skeleton.revision, question.id])}`, declaration = contract.sourceDeclarations[i]!
    const withQueries = owner.skeleton === root && contract.queries.length ? { ...declaration, properties: contract.queries } : declaration
    const compiled = compileQuestionDeclaration(owner.skeleton, withQueries, { transactionId, questionId: question.id, references, properties: question.properties })
    diagnostics.push(...compiled.diagnostics)
    if (compiled.edit) owner.interpretation = compileSourceEdit(owner.skeleton, compiled.edit, { transactionId, questionId: question.id, progressive: true }).interpretation
  }
  if (diagnostics.length) return empty()
  const propertyContext: PropertyQueryContext = { operationId, sources: owners }, units: BoundSemanticBlock[] = [], demands = [] as NonNullable<ReturnType<typeof lowerSourceInterpretation>["demand"]>[]
  for (const owner of owners) {
    const role = contract.scope.kind === "request-operation" && owner.skeleton === root ? "entry" as const : "helper" as const
    const lowered = lowerSourceInterpretation(owner.skeleton, owner.interpretation, { index, questionId: question.id, itemId: owner.handle, handle: owner.handle, role, propertyDirected: true, propertyAbstraction: true, question: { ...question, premises: question.premises.map(p => p.text) }, propertyContext, sourceObjectBindings: true })
    diagnostics.push(...lowered.diagnostics)
    if (lowered.unit) units.push({ ...lowered.unit, questionId: question.id, evidenceIds: owner.skeleton.evidenceIds, source: owner.skeleton.source, receiverClass: owner.receiverClass })
    if (lowered.demand) demands.push(lowered.demand)
  }
  if (diagnostics.length) return empty()
  const semanticVersion = sourceMaterialSemanticVersion("question-checked-v1"), materials = createSourceMaterials({ ...options.tools.identity, semanticVersion })
  for (const unit of units) materials.accept(unit, [{ kind: "source-span", key: unit.source!.path, revision: unit.source!.sha256 }, { kind: "symbol-resolution", key: unit.source!.id, revision: unit.source!.sha256 }, { kind: "candidate-set", key: `relations:${unit.source!.id}:${unit.receiverClass ?? ""}`, revision: sourceRelationRevision(index, unit.source!.id, unit.receiverClass)! }], "revalidated-original")
  const localRoot: SourceFunctionRoot = { questionId: question.id, operationId, source: root.source, receiverClass: rootAt.receiverClass }
  const projected = projectSourceMaterials(options.program, units, materials.snapshot(), index, { semanticVersion, questionDirected: true, ...(contract.scope.kind === "function-contract" ? { functionRoots: [localRoot], requestOperations: false } : {}) })
  const rootUnit = projected.units.find(u => u.questionId === question.id && u.source?.id === root.sourceId && u.receiverClass === rootAt.receiverClass)
  const functionRoots = contract.scope.kind === "function-contract" && rootUnit ? [{ questionId: question.id, handle: rootUnit.handle }] : []
  const lowered = lowerIntoControlSlice(createControlSlice(), projected.units, options.program, { questionIds: options.program.questions.map(q => q.id), shownEvidenceIds: options.tools.evidence.map(e => e.id) }, true, true, true, functionRoots)
  // Lowering gaps remain source rules. They are not rejected source transactions:
  // a later return/exception gap cannot invalidate an already covered prefix.
  const evaluation = checkPropertyQueries(options.program, lowered.state, demands, projected.units, [], diagnostics, true, "semantic-completion/v1")
  return { diagnostics, contract, revision: digest([contract, options.program, owners.map(o => o.skeleton.revision)]), scope: contract.scope, assumptions: contract.assumptions, units, projectedUnits: projected.units, functionRoots, sourceMaterials: materials.snapshot(), materialUses: projected.uses, materialProjection: { diagnostics: projected.diagnostics, stages: projected.stages }, demands, slice: lowered.state, loweringDiagnostics: lowered.diagnostics, evaluation, requestOperationCertified: false as const, semanticReview: "unreviewed" as const }
}
