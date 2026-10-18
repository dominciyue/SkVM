import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { createProgramDraft, patchProgramDraft, type ProgramDraft } from "./resource-program-draft.ts"
import { ExecutableContractInputSchema, normalizeExecutableContract, readExecutableContractSources, type ProgramMode } from "./executable-contract.ts"
import { inspectResourceDraft } from "./resource-relations.ts"
import { projectProgramCallRelations, collectProgramObligations } from "./program-obligations.ts"
import { renderProgramRuleDocument } from "./program-rule-document.ts"
import { ProgramDetailsSchema } from "./program-consumption-context.ts"
import type { createInquiryDomainRuntime } from "../../benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { PROGRAM_AUTHORING_GOAL } from "./program-authoring-context.ts"
import { projectAuthoringTarget, type AuthoringTargetMode } from "./program-coverage.ts"

type ExecutionReport = ReturnType<ReturnType<typeof createInquiryDomainRuntime>["report"]>
type RulesReport = Omit<Partial<ExecutionReport>, "programDraft" | "executableContract"> & {
  programSupport: "rules"
  executableContract?: undefined
  programDraft: Partial<ExecutionReport["programDraft"]> & { programSupport: "rules"; status: "rules-only" }
}

export const PROGRAM_RULES_INSTRUCTION = "Program support is rules only. Read the same authored rules/raw and original source to answer every original question in the original skill format. No host evaluation, trial, computed outcome or permission proof is available. Source meanings and literal descriptions remain author-declared and unreviewed. Edit mode may submit or patch raw rules and inspect schema/source-structure diagnostics; it does not run them."
export function programRulesInstruction(mode: ProgramMode = "consume") {
  return mode === "edit" ? `Program-authoring task: produce or repair a persistent executable source program, then deliver every original natural question. A prose-only investigation does not fulfill edit mode. ${PROGRAM_AUTHORING_GOAL} Start with the current draft or a small source-supported program and inspect schema/source-structure diagnostics while budget remains. Do not postpone all program work until after broad source investigation. No expected answers or grants may be invented. ${PROGRAM_RULES_INSTRUCTION}` : PROGRAM_RULES_INSTRUCTION
}
/** A capability-limited draft view inside the existing host. Reuses the exact
 * patch/schema/source tools; never invokes the executable compiler or evaluator. */
export function createProgramRulesContext(tools: InquiryTools, mode: ProgramMode = "consume", authoringTargetMode?: AuthoringTargetMode) {
  let draft: ProgramDraft | undefined, diagnostics: any[] = [], sourcesCurrent = true
  const refresh = () => {
    diagnostics = []
    if (!draft) return
    const normalized = normalizeExecutableContract(draft.raw, tools.structure).value
    const parsed = ExecutableContractInputSchema.safeParse(normalized)
    if (!parsed.success) diagnostics.push(...parsed.error.issues.map(i => ({ code: "program-rule-schema", path: i.path.join("."), message: i.message, severity: "error" })))
    if (parsed.success && normalized.resourceWorkflow) {
      const inspected = inspectResourceDraft(normalized.resourceWorkflow)
      diagnostics.push(...inspected.steps.flatMap(s => s.issues.map(i => ({ code: "program-rule-step", ...i, severity: "error" }))))
    }
    const citations: any[] = []
    const visit = (v: any) => { if (!v || typeof v !== "object") return; if (typeof v.path === "string" && Number.isInteger(v.startLine)) citations.push(v); else for (const [key, child] of Object.entries(v)) if (key !== "literal") visit(child) }
    visit(normalized)
    sourcesCurrent = tools.snapshotVerification?.valid !== false
    for (const at of citations) {
      const file = tools.files.find(f => f.path === at.path)
      if (!file || at.sha256 && at.sha256 !== file.sha256) { sourcesCurrent = false; diagnostics.push({ code: "program-rule-source-stale", path: at.path, severity: "error", message: "Source identity is unavailable or differs from the declared revision." }) }
      else if (!tools.evidence.some(e => e.path === at.path && e.sha256 === file.sha256 && e.startLine <= at.startLine && e.endLine >= (at.endLine ?? at.startLine))) diagnostics.push({ code: "program-rule-source-unread", path: at.path, severity: "warning", message: `Read source lines ${at.startLine}-${at.endLine ?? at.startLine} before interpreting this rule.` })
    }
  }
  const snapshot = () => { refresh(); return { programSupport: "rules" as const, status: "rules-only" as const, revision: draft?.revision, currentDraft: draft && structuredClone(draft), program: draft?.raw, sourcesCurrent, diagnostics: structuredClone(diagnostics), semanticSupport: "author-declared-unreviewed" } }
  const project = () => {
    const state = snapshot()
    return { programSupport: "rules", status: "rules-only", revision: draft?.revision, sourcesCurrent, ruleDocument: draft && renderProgramRuleDocument(draft.raw), diagnostics: state.diagnostics, semanticSupport: "author-declared-unreviewed" }
  }
  return {
    restore(value: ProgramDraft) { draft = createProgramDraft(value.raw); refresh() },
    async import(raw: unknown, readSources = false) { draft = createProgramDraft(raw, draft); if (readSources) await readExecutableContractSources(draft.raw, tools); return project() },
    patch(raw: unknown) { const result = patchProgramDraft(draft, raw); if (result.diagnostics.length) return { ...project(), patchDiagnostics: result.diagnostics }; draft = result.draft; return { ...project(), changedStepIds: result.changedStepIds } },
    async details(query: any) {
      const args = ProgramDetailsSchema.parse(query); refresh()
      if (args.trialCaseId) return { programSupport: "rules", status: "capability-unavailable", capability: "execution-trial", instruction: PROGRAM_RULES_INSTRUCTION }
      if (args.expectedRevision && args.expectedRevision !== draft?.revision || args.expectedBasis && args.expectedBasis !== draft?.revision) return { status: "stale-program-reference", revision: draft?.revision }
      if (args.catalog) {
        const items = args.catalog === "source-index" ? tools.evidence.map(({ id, path, startLine, endLine, sha256 }) => ({ id, path, startLine, endLine, sha256 })) : await collectProgramObligations(tools, draft?.raw)
        return { status: "catalog", items: items.slice(args.offset, args.offset + args.limit), total: items.length, nextOffset: args.offset + args.limit < items.length ? args.offset + args.limit : undefined }
      }
      const steps = draft?.raw?.resourceWorkflow?.steps
      const catalog = await collectProgramObligations(tools, draft?.raw)
      return { ...project(), view: args.view, raw: draft?.raw, callRelations: projectProgramCallRelations(draft?.raw, undefined, [], catalog).map(({ event: _event, trials: _trials, ...row }) => row).filter(r => !args.stepId || r.stepId === args.stepId), steps: (Array.isArray(steps) ? steps : []).filter((s: any) => (!args.stepId || s?.id === args.stepId) && (!args.questionId || draft?.raw?.scope?.questionId === args.questionId)) }
    },
    async context() {
      const state = project(), candidates = mode === "edit" ? await collectProgramObligations(tools, draft?.raw) : []
      const relations = projectProgramCallRelations(draft?.raw, undefined, [], candidates).map(({ event: _event, trials: _trials, completionGuard, ...row }) => ({ ...row, ...(completionGuard ? { completionGuard: { id: completionGuard.id, test: completionGuard.test } } : {}) }))
      const target = mode === "edit" ? projectAuthoringTarget(draft?.raw, authoringTargetMode, "rules") : undefined
      return { ...state, ...(target ? { authoring: { goal: PROGRAM_AUTHORING_GOAL, target, draftRevision: draft?.revision, phase: draft ? "review" : "draft", progressKey: draft?.revision, feedbackGroups: { inputStructure: diagnostics, callRelations: relations.filter(r => r.diagnostics.length), sourceCandidates: candidates, coverage: target.mode === "reusable" ? target.coverage.filter(c => c.disposition === "unwritten" || c.missingStepIds.length || c.disposition === "implemented" && !c.stepIds.length) : [] }, tools: ["authorization_program", "authorization_program_patch", "authorization_program_details"] } } : {}), instruction: programRulesInstruction(mode) }
    },
    report: (): RulesReport => ({ programSupport: "rules", programDraft: snapshot(), executableContract: undefined }),
  }
}
