import { z } from "zod"
import { zodToJsonSchema } from "../../providers/structured.ts"
import type { LLMTool } from "../../providers/types.ts"
import { QuestionDeclarationSchema } from "../../task-dsl/authorization/question-workflow.ts"
import { ExecutableContractSchema } from "../../task-dsl/authorization/executable-contract.ts"
import { FINITE_PREDICATE_GUIDE } from "../../task-dsl/authorization/control-evaluation.ts"
import { PropertyIntentProposalSchema } from "../../task-dsl/authorization/property-intent.ts"
import { isQuestionCheckedStrategy, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import type { AuthorizationInquiry } from "../../task-dsl/authorization/inquiry.ts"
import type { InquiryTools } from "./inquiry-tools.ts"

export const QuestionGuidanceSchema = z.object({ action: z.enum(["status", "locate", "next-question", "next-source", "materials"]).default("status"), questionId: z.string().min(1).optional(), symbol: z.string().min(1).optional() }).strict()
export const QUESTION_WORKFLOW_GUIDE = "Use authorization_question for optional question-oriented location, coverage and source candidates. This helper is independent of semantic drafts: continue using common source tools and deliver the original skill's natural answer with citations and precise limits. Candidates and read counts are not authorization evidence. Map every decisive unspecified fact to the conclusion it prevents. The checked strategy additionally accepts source-supported domain statements with authorization_declare and current property queries with authorization_check_properties. No machine result is required to save natural delivery; report unknown machine relations honestly. Do not infer source meaning from this helper."
export function questionWorkflowSchemas(strategy: InquiryStrategy): Record<string, z.ZodTypeAny> {
  return { authorization_question: QuestionGuidanceSchema, ...(isQuestionCheckedStrategy(strategy) ? { authorization_declare: z.union([QuestionDeclarationSchema, ExecutableContractSchema]), authorization_prepare_properties: PropertyIntentProposalSchema, authorization_check_properties: z.object({}).strict() } : {}) }
}
export function questionWorkflowDefinitions(strategy: InquiryStrategy): LLMTool[] {
  const descriptions: Record<string, string> = {
    authorization_question: "Get optional current-question source locations, read coverage or retained materials. H requires no declarations. next-source advances the checked strategy to an available read candidate while keeping old meanings and gaps; H simply offers the next candidate.",
    authorization_declare: "After reading the complete relevant source, submit its supported meanings with this tool, then use authorization_check_properties to inspect their current composition. Keep unexpressed meanings as named gaps and still deliver the original natural answer. If imported or restored materials already cover the source, inspect and use their current results without duplicate authoring. Explain a current read source passage, or submit authorization-executable-contract/v1 with id, scope (function-contract or confirmed request-operation, questionId, complete root citation, upstream gaps), sourceDeclarations, queries and assumptions with provenance. Every declared complete source must already be read. A local root keeps its helper role; upstream request duties stay unresolved. The host supplies syntax identities and actual call mapping through the same checker; partial meanings keep named gaps. No trusted verdict or use record is accepted. Each condition test uses this finite predicate contract: " + FINITE_PREDICATE_GUIDE,
    authorization_prepare_properties: "Declare queries from the exact original task requirements for every undeclared question, or preserve the task uncertainty. This contains no source interpretation or verdict.",
    authorization_check_properties: "Inspect/recompute current local properties from adopted source meanings and actual call instances. Unknown is retained and never blocks the original natural answer.",
  }
  return Object.entries(questionWorkflowSchemas(strategy)).map(([name, schema]) => ({ name, description: descriptions[name]!, inputSchema: zodToJsonSchema(schema) }))
}

/** Shared, read-only aid. It can operate without any declaration/checker state. */
export function createQuestionGuidance(inquiry: AuthorizationInquiry | undefined, tools: InquiryTools) {
  const questions = inquiry?.questions ?? [], history: Array<{ action: string; questionId?: string; symbol?: string }> = []
  let position = 0, sourcePosition = 0
  const context = (symbol?: string, questionId?: string) => {
    const q = questionId ? questions.find(q => q.id === questionId) ?? questions[position] : questions[position], candidates = tools.symbolHints(symbol ?? [q?.entryHint, "operation" in (q ?? {}) ? (q as any).operation : undefined, q?.request].filter(Boolean).join(" ")).slice(0, 16)
    const qualifiedName = (candidate: { id: string; name: string }) => tools.structure?.symbols.find(s => s.id === candidate.id)?.qualifiedName ?? candidate.name
    const related = tools.structure ? candidates.flatMap(c => tools.structure!.relatedCalls(c.id).flatMap(call => call.candidateIds.map(id => tools.symbolById(id)).filter(c => !!c))).slice(0, 24) : []
    return { currentQuestion: q, originalQuestionIds: questions.map(q => q.id), policy: inquiry?.policy,
      candidates: candidates.map(c => ({ id: c.id, name: c.name, qualifiedName: qualifiedName(c), path: c.path, startLine: c.startLine, endLine: c.endLine, basis: c.basis, read: tools.evidence.some(e => e.path === c.path && e.sha256 === c.sha256 && e.startLine <= c.startLine && e.endLine >= c.endLine) })),
      relatedSources: related.map(c => ({ name: c!.name, path: c!.path, startLine: c!.startLine, endLine: c!.endLine })),
      nextSource: related[sourcePosition % Math.max(1, related.length)] && (() => { const c = related[sourcePosition % related.length]!; return { name: qualifiedName(c), path: c.path, startLine: c.startLine, endLine: c.endLine } })(), coverage: { readRanges: tools.evidence.length, indexedFiles: tools.files.length, scopeGaps: tools.scopeGaps },
      instruction: QUESTION_WORKFLOW_GUIDE, semanticSupport: "unreviewed" }
  }
  const execute = (raw: unknown) => {
    const args = QuestionGuidanceSchema.parse(raw)
    if (args.questionId) { const selected = questions.findIndex(q => q.id === args.questionId); if (selected < 0) throw new Error("question-guidance-unknown-question"); position = selected }
    if (args.action === "next-question" && questions.length) { position = (position + 1) % questions.length; sourcePosition = 0 }
    if (args.action === "next-source") sourcePosition++
    history.push({ action: args.action, questionId: questions[position]?.id, symbol: args.symbol })
    return { guidance: context(args.symbol) }
  }
  return { context, execute, report: () => ({ originalQuestionIds: questions.map(q => q.id), history: structuredClone(history), draftRequired: false }) }
}
