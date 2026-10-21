import type { ProgramMode } from "./executable-contract.ts"
import { createHash } from "node:crypto"
import { projectProgramConsumption, type ProgramContext } from "./program-consumption-context.ts"
import type { ResourceProgramInputs } from "./resource-relations.ts"
import { resolveProgramInputBinding } from "./program-input-binding.ts"
import { projectAuthoringTarget } from "./program-coverage.ts"
import { projectProgramCandidateFrontier, projectProgramCallRelations, projectProgramInvestigation } from "./program-obligations.ts"

type OriginalQuestion = { id: string; request?: string }
export type ProgramPurpose = "author" | "consume"
export const resolveProgramPurpose = (context?: ProgramContext, mode?: ProgramMode, enabled = true): ProgramPurpose | undefined => enabled && context === "directed" ? mode === "edit" ? "author" : "consume" : undefined
export function programPurposeAllows(purpose: ProgramPurpose | undefined, name: string) {
  return !purpose || name.startsWith("source_") || name === "skill_reference_read" || name === "authorization_program_details" || purpose === "author" && ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(name)
}
export function programPurposeInstruction(purpose: ProgramPurpose) {
  return purpose === "author" ? INITIAL_PROGRAM_AUTHORING_INSTRUCTION : "Use the current program's finite result, conditions, scope and rules for what it actually computes. Read original source and program details for every remaining original question. Report incorrect or incomplete rules and missing facts explicitly; consumption does not alter the program. Deliver all original questions in the original skill format. No property preparation or source declaration workflow is required."
}
export const PROGRAM_AUTHORING_GOAL = "Continue authoring the source-supported resource relations requested by every original question. A current or computed partial program is not authoring completion. Inspect the current raw draft with authorization_program_details({view:'draft'}); use authorization_program_patch with its draftRevision, upsertSteps and an explicit complete stepOrder to insert steps before return. Repair mechanical gaps and read original source for missing meanings. When a source-supported relationship matters, coverage may carry relation:{kind:'ordered-prefix',effectStepIds?:[]} with ordered stepIds, or relation:{kind:'guard-effect',entryStepId,guardStepId,effectStepId,principalArgument,resourceArgument} for a Boolean entry and guard identities matched to an external call's arguments. Checks compare your declarations with finite events; source activation and object meaning still need review. Keep unsupported facts as named gaps. You may end with a partial program and a natural answer, explaining the remaining authoring work."
export const INITIAL_PROGRAM_AUTHORING_INSTRUCTION = `Program-authoring task: produce or repair a persistent executable source program, then deliver every original natural question. A prose-only investigation does not fulfill edit mode. ${PROGRAM_AUTHORING_GOAL} Start with the current draft or a small source-supported program, inspect its actual execution, and trial supplied or source-supported varying facts while budget remains. Do not postpone all program work until after broad source investigation. No expected answers or grants may be invented.`
type AuthorInputs = ResourceProgramInputs & { programContext?: ProgramContext; operationQuestions?: readonly { questionId: string; operationId: string }[]; obligations?: readonly import("./program-obligations.ts").ProgramObligation[] }
const shape = (value: any) => Array.isArray(value) ? { kind: "collection", rowCount: value.length, fields: [...new Set(value.flatMap(row => Object.keys(row ?? {})))] } : value && typeof value === "object" ? { kind: "object", fields: Object.keys(value) } : { kind: value === null ? "null" : typeof value }
const shownValue = (value: any) => Array.isArray(value) ? { ...shape(value), sample: structuredClone(value.slice(0, 3)), truncated: value.length > 3 } : { ...shape(value), values: structuredClone(value) }

/** One session's mechanical progress, using existing replies rather than a
 * separate generation call. A checkpoint never disables source tools. */
export function createProgramAuthorLoop() {
  let firstProgramToolUnit: number | undefined, firstProposalToolUnit: number | undefined, firstDraftToolUnit: number | undefined, patchCount = 0, programCount = 0
  let checkpoint: { toolUnit: number; explorationUnits: number; completeSources: readonly any[]; instruction: string } | undefined
  let previousValues: Record<string, unknown> = {}
  let stage: "locate" | "edit" | "trial" | "review" | "answer" = "locate", trialCount = 0, lastProgressUnit = 0, lastRevision: string | undefined
  const trials = new Set<string>()
  const changes: Array<{ kind: "program" | "patch"; toolUnit?: number; revision?: string; valid: boolean; newValues?: Record<string, unknown>; removedValues?: string[]; returned?: unknown; termination?: string; unresolvedGaps?: string[] }> = []
  return {
    record(record: { kind: "program" | "patch"; toolUnit?: number; revision?: string; valid: boolean; execution?: any }) {
      stage = record.valid ? "trial" : "edit"
      if (record.revision && record.revision !== lastRevision) { lastRevision = record.revision; lastProgressUnit = record.toolUnit ?? lastProgressUnit }
      firstProposalToolUnit ??= record.toolUnit
      if (record.kind === "program") firstProgramToolUnit ??= record.toolUnit
      if (record.kind === "patch") patchCount++; else programCount++
      if (record.valid) firstDraftToolUnit ??= record.toolUnit
      const execution = record.execution
      const newValues = execution && Object.fromEntries(Object.entries(execution.values ?? {}).filter(([id, value]) => JSON.stringify(value) !== JSON.stringify(previousValues[id])))
      changes.push({ kind: record.kind, toolUnit: record.toolUnit, revision: record.revision, valid: record.valid, ...(execution ? { newValues: structuredClone(newValues), removedValues: Object.keys(previousValues).filter(id => !Object.hasOwn(execution.values ?? {}, id)), returned: execution.returned, termination: execution.termination, unresolvedGaps: execution.gaps } : {}) })
      if (execution) previousValues = structuredClone(execution.values ?? {})
    },
    recordTrial(result: any, toolUnit?: number) {
      trialCount++; stage = result.status === "rejected" ? "edit" : "review"
      const signature = createHash("sha256").update(JSON.stringify({ revision: result.revision, cases: result.cases })).digest("hex")
      if (result.status !== "rejected" && !trials.has(signature)) { trials.add(signature); lastProgressUnit = toolUnit ?? lastProgressUnit }
    },
    markAnswer() { stage = "answer" },
    snapshot(progress?: { toolUnit: number; explorationUnits: number; completeSources: readonly any[]; hasDraft?: boolean }) {
      if (!checkpoint && firstDraftToolUnit === undefined && progress && progress.explorationUnits >= 12 && progress.completeSources.length) checkpoint = { toolUnit: progress.toolUnit, explorationUnits: progress.explorationUnits, completeSources: structuredClone(progress.completeSources.slice(0, 8)), instruction: progress.hasDraft
        ? "Early authoring checkpoint: the existing draft has not received a proposal in this author session. Inspect authorization_program_details({view:'draft'}) and use authorization_program_trial on source-supported varying facts before spending the remaining budget only on broader investigation. Repair actual gaps with authorization_program_patch; preserve every original question and necessary source reads. This reminder supplies neither semantic fixes nor expected answers and does not disable tools."
        : "Early authoring checkpoint: a complete current source function is available. Submit a small source-supported authorization_program now, inspect its actual preview, then patch its named gaps while continuing necessary source reads. Retain every original duty; this checkpoint neither supplies source meanings nor closes source tools." }
      if (!checkpoint && lastRevision && progress && progress.explorationUnits >= 12 && progress.toolUnit - lastProgressUnit >= 8) checkpoint = { toolUnit: progress.toolUnit, explorationUnits: progress.explorationUnits, completeSources: [], instruction: "No new program revision or distinct trial has been recorded during recent exploration. Make one source-supported edit or trial against the current frontier, or finish with explicit remaining work. Further source candidates alone are not author progress." }
      return structuredClone({ stage, progressKey: JSON.stringify([lastRevision, [...trials]]), lastProgressUnit, trialCount, firstProgramToolUnit, firstProposalToolUnit, firstDraftToolUnit, patchCount, programCount, changes, checkpoint })
    },
  }
}

function executionBlockers(execution: any, declaredNames: readonly string[]) {
  type Blocker = { stepId: string; code: string; dependencies: string[]; affectedStepIds: string[]; inputs: unknown }
  const roots: Blocker[] = [], gapRoots = new Map<string, Blocker[]>(), stepRoots = new Map<string, Blocker[]>()
  for (const event of execution?.events ?? []) {
    const affected = new Set<Blocker>(), gaps: string[] = event.gaps ?? []
    // An external call whose arguments are already unknown is downstream of
    // those arguments. A later predicate names the unresolved step rather than
    // repeating its original input gap; follow that actual event identity.
    for (const gap of [...gaps.filter(g => !g.startsWith("external:")), ...gaps.filter(g => g.startsWith("external:"))]) {
      let owners = gapRoots.get(gap) ?? stepRoots.get(gap) ?? [...stepRoots.entries()].find(([id]) => gap.startsWith(id + "."))?.[1]
      if (!owners && gap.startsWith("external:") && affected.size) owners = [...affected]
      if (!owners) {
        const blocker = { stepId: event.id, code: declaredNames.includes(gap) ? "missing-input" : gap.startsWith("field-") ? "object-field" : /^(selection-|record-collection-required:)/.test(gap) ? "selection" : gap.startsWith("external:") ? "external-assumption" : gap.startsWith("resource-step:") ? "invalid-expression" : event.op === "guard" ? "unknown-guard" : "unresolved-dependency", dependencies: [gap], affectedStepIds: [], inputs: event.inputs }
        roots.push(blocker); owners = [blocker]
      }
      gapRoots.set(gap, owners); for (const owner of owners) affected.add(owner)
    }
    for (const owner of affected) owner.affectedStepIds.push(event.id)
    if (affected.size) stepRoots.set(event.id, [...affected])
  }
  return roots
}

/** Presentation only. Output fields are computation, never semantic coverage. */
export function projectProgramAuthoring(report: any, questions: readonly OriginalQuestion[], remainingActions?: number, inputs: AuthorInputs = {}) {
  const hasDraft = !!report?.currentDraft, candidate = hasDraft && report.currentDraft.revision !== undefined && report?.candidate?.revision === report.currentDraft.revision ? report.candidate : undefined
  const execution = hasDraft ? candidate?.resourceExecution : report?.resourceExecution, scopeQuestion = report?.scope?.questionId
  const returned = execution?.returned
  const fields = returned && typeof returned === "object" && !Array.isArray(returned) ? Object.keys(returned) : []
  const raw = report?.currentDraft?.raw ?? report?.program, questionId = raw?.scope?.questionId ?? scopeQuestion
  const declaredNames: string[] = Array.isArray(raw?.resourceWorkflow?.inputs) ? raw.resourceWorkflow.inputs.filter((n: unknown) => typeof n === "string") : []
  const resolution = resolveProgramInputBinding(raw, { questions, operationQuestions: inputs.operationQuestions }, inputs)
  const inputNames = Object.keys(resolution.resourceInputs)
  const suppliedScopes = [...new Set([...Object.keys(inputs.resourceInputs ?? {}), ...Object.keys(inputs.externalAssumptions ?? {})])].map(id => ({ questionId: id, inputNames: Object.keys(inputs.resourceInputs?.[id] ?? {}), valueShapes: Object.fromEntries(Object.entries(inputs.resourceInputs?.[id] ?? {}).map(([name, value]) => [name, shape(value)])), externalAssumptionNames: [...new Set((inputs.externalAssumptions?.[id] ?? []).map(a => a.name))], operationId: inputs.operationQuestions?.find(q => q.questionId === id)?.operationId }))
  const diagnostics = candidate?.diagnostics ?? report?.currentDraftDiagnostics ?? report?.diagnostics ?? []
  const rootBlockers = executionBlockers(execution, declaredNames)
  const inputError = resolution.diagnostics.find(d => d.severity === "error" || d.code === "program-input-dataset-missing")
  const proofDiagnostic = (d: any) => /property|properties/.test(d.code ?? "") || /(?:^|\.)properties(?:\.|\[|$)/.test(d.path ?? "")
  const sourceVisible = (report?.externalBoundaries ?? []).filter((b: any) => b.kind === "source-visible-unwritten")
  const external = rootBlockers.filter(b => b.code === "external-assumption" && !sourceVisible.some((s: any) => s.stepId === b.stepId))
  // A successful local return does not discharge relations the author explicitly
  // left outside this root. Review these claims against the original source;
  // they are not host-supplied meanings or evidence of a correct repair.
  const unresolvedSemantics: string[] = [...(raw?.scope?.upstream ?? []), ...(raw?.resourceWorkflow?.gaps ?? [])]
  const target = projectAuthoringTarget(raw, inputs.authoringTargetMode ?? report?.authoringTargetMode)
  const sourceObligations = inputs.obligations ?? report?.obligations ?? []
  const frontier = projectProgramCandidateFrontier(sourceObligations, raw, sourceVisible.flatMap((b: any) => b.candidates ?? []))
  const currentTrials = (report?.trials ?? []).filter((batch: any) => report?.sourcesCurrent !== false && batch.revision === report?.currentDraft?.revision && batch.status === "completed")
  const callRelations = projectProgramCallRelations(raw, execution, currentTrials.flatMap((batch: any) => batch.cases ?? []), inputs.obligations ?? report?.obligations)
  const relations = (hasDraft ? candidate?.outcome?.relations : report?.outcome?.relations) ?? []
  const loop = report?.authorLoop && inputs.programContext === "directed" ? { ...report.authorLoop, changes: report.authorLoop.changes?.slice(-1) } : report?.authorLoop
  const feedbackGroups = {
    sourceVerification: (report?.sourcesCurrent === false ? [] : candidate?.sourceVerification?.requirements ?? report?.sourceVerification?.requirements ?? []).map(({sourceEvents,programEvents,...r}:any)=>r),
    relations: relations.filter((row: any) => row.status !== "consistent"),
    callRelations: callRelations.filter(row => row.diagnostics.length),
    sourceCandidates: inputs.programContext === "directed" ? frontier.items : sourceObligations.filter((o: any) => o.state === "unmapped" || o.diagnostics?.length),
    inputStructure: [...resolution.diagnostics, ...diagnostics.filter((d: any) => !proofDiagnostic(d))],
    execution: [...rootBlockers.filter(b => !external.includes(b)), ...sourceVisible],
    proof: diagnostics.filter(proofDiagnostic), external,
    coverage: target.mode === "reusable" ? target.coverage.filter(c => c.disposition === "unwritten" || c.missingStepIds.length || c.disposition === "implemented" && !c.stepIds.length) : [],
    authoredScope: [...new Set(unresolvedSemantics)].filter(message => !external.some(b => b.dependencies.includes(message))).map(message => ({ code: "authored-scope-review", message, instruction: "Review your own named gap against available original source. Extend source-supported relations where possible; keep genuinely external facts conditional. Do not repeat an unchanged proposal." })),
  }
  const firstError = feedbackGroups.inputStructure.find((d: any) => d.severity === "error")
  const proofError = feedbackGroups.proof.find((d: any) => d.severity === "error")
  const firstBlocker = inputError ? { code: inputError.code, dependencies: declaredNames, affectedStepIds: [...new Set(rootBlockers.flatMap((b: any) => b.affectedStepIds))], message: inputError.message } : firstError ? { code: firstError.code, dependencies: [firstError.path], message: firstError.message } : feedbackGroups.execution[0] ?? external[0] ?? (feedbackGroups.relations.length ? { code: "program-relation-review", relationId: feedbackGroups.relations[0].id, diagnostics: feedbackGroups.relations[0].diagnostics } : undefined) ?? (feedbackGroups.callRelations.length ? { code: "call-relation-review", stepId: feedbackGroups.callRelations[0]!.stepId, diagnostics: feedbackGroups.callRelations[0]!.diagnostics } : undefined) ?? (inputs.programContext === "directed" && frontier.items.length ? { code: "related-source-candidates", candidateIds: frontier.items.map(o => o.id), function: frontier.function } : undefined) ?? (proofError ? { code: proofError.code, dependencies: [proofError.path], message: proofError.message } : external[0])
  return {
    goal: PROGRAM_AUTHORING_GOAL, target, ...(inputs.programContext === "directed" ? { candidateFrontier: { ...frontier, items: undefined } } : { sourceObligations }), candidateInstruction: "These are locations from already-read source structure, independently of author coverage. Interpret each relevant exit and call completion, including short-circuit execution conditions. Map an exact candidate source span to your own stepIds with authoringTarget.coverage or retain an explicit external/unwritten reason. A mapped span is not a semantic proof; broad claims do not discharge individual candidates. Trial your own varying inputs without inventing external facts.", completion: "unreviewed", activeRevision: report?.program ? report.revision : undefined,
    draftRevision: report?.currentDraft?.revision, candidateRevision: report?.candidate?.revision,
    candidateAdopted: candidate?.adopted, candidatePreviewAvailable: !!candidate?.resourceExecution,
    draftStepOrder: Array.isArray(report?.currentDraft?.raw?.resourceWorkflow?.steps) ? report.currentDraft.raw.resourceWorkflow.steps.map((s: any) => ({ id: s?.id, op: s?.op })) : undefined,
    phase: !raw ? "discover" : firstBlocker ? "repair" : execution ? "review" : "draft", ...loop,
    adoptedStepIds: report?.program?.resourceWorkflow?.steps?.map((s: any) => s.id) ?? [], firstBlocker, rootBlockers,
    externalBoundaries: report?.externalBoundaries ?? [],
    computed: execution && { returned, termination: execution.termination, conditions: execution.conditions },
    gaps: execution?.gaps ?? [], diagnostics, feedbackGroups, callRelations, relations,
    verificationInstruction: "Source verification requirements are independently supplied by the host task. Inspect sourceVerification counterexamples and current draft details, patch the actual program using the existing tools, then trial again. verificationMappings may only name existing program step IDs; missing mappings remain unknown and cannot remove duties. A finite match is not policy safety or complete task coverage.",
    inputBindings: { questionId, inputQuestionId: resolution.inputQuestionId, origin: resolution.origin, datasetPresent: resolution.datasetPresent, diagnostics: resolution.diagnostics, declaredNames, inputNames, missingDeclaredNames: declaredNames.filter(n => !inputNames.includes(n)), values: Object.fromEntries(Object.entries(resolution.resourceInputs).map(([name, value]) => [name, shownValue(value)])), externalAssumptions: resolution.externalAssumptions, suppliedScopes, instruction: "scope.questionId retains the semantic duty. Resource inputs and external assumptions default to that exact question. Optional inputBinding:{questionId} explicitly selects one supplied dataset from the same current operationQuestions mapping; it never transfers policy, premises or property inputs. Empty datasets are meaningful; no candidate is auto-selected. Current bound values and exact external calls are shown here, with bounded collection samples; authorization_program_details or the original scenario recovers full values. Author only source-supported relations." },
    unresolvedSemantics, semanticSupport: "unreviewed",
    questions: questions.map(q => ({ questionId: q.id, request: q.request, computedFields: q.id === scopeQuestion ? fields : [], coverage: "unreviewed", remaining: q.id === scopeQuestion ? "Only the listed fields were computed; express the remaining requested source relations or retain named gaps." : "This resource program does not compute this original question; investigate and author relevant relations or retain the duty for natural explanation." })),
    trialVerification: { revision: report?.currentDraft?.revision, status: report?.sourcesCurrent === false ? "source-invalidated" : currentTrials.length ? "observed-unreviewed" : "unverified", currentCaseIds: currentTrials.flatMap((batch: any) => batch.cases.map((c: any) => c.id)) },
    trials: (report?.trials ?? []).map((batch: any) => ({ revision: batch.revision, current: currentTrials.includes(batch), status: batch.status, diagnostics: batch.diagnostics, cases: batch.cases.map((c: any) => ({ id: c.id, status: c.status, returned: c.execution?.returned, termination: c.execution?.termination, conditions: c.execution?.conditions, gaps: c.execution?.gaps, diagnostics: c.diagnostics })) })),
    remainingActions, tools: ["authorization_program", "authorization_program_patch", "authorization_program_trial", "authorization_program_details", "source_read", "source_symbol"],
  }
}

/** Same decision for both transports; no semantic answers or fresh budgets. */
export function decideProgramAuthorContinuation(options: {
  mode?: ProgramMode; terminal: string; continuations: number; remainingMs: number; maxContinuations?: 0 | 1 | 2
  context: any; previousProgress?: string
}) {
  const a = options.context?.authoring, budget = options.context?.toolBudget
  const progress = JSON.stringify({ revision: a?.draftRevision, progressKey: a?.progressKey })
  const stop = (reason: string) => ({ continue: false, reason, progress })
  if (options.mode !== "edit") return stop("not-an-author")
  if (options.terminal !== "completed") return stop("known-completed-terminal-required")
  if (options.continuations >= (options.maxContinuations ?? 2)) return stop("author-continuation-limit")
  if (options.remainingMs <= 0 || !(budget?.explorationRemaining > 0) || !(budget?.totalRemaining > 0) || budget?.finalOnly || budget?.formatBudgetExhausted || budget?.deliveryClosed) return stop("author-budget-exhausted")
  if (!a) return stop("author-context-unavailable")
  if (options.previousProgress === progress) return stop("no-new-author-progress")
  const groups = a.feedbackGroups
  const actionable = !a.draftRevision || !a.candidatePreviewAvailable && a.phase === "draft" ||
    groups?.inputStructure?.some((d: any) => d.severity === "error" || d.code === "program-input-dataset-missing") || groups?.execution?.length || groups?.relations?.length || groups?.callRelations?.length || groups?.proof?.some((d: any) => d.severity === "error") || groups?.authoredScope?.length || groups?.coverage?.length || groups?.sourceCandidates?.length || a.target?.mode === "reusable" && a.target?.coverageStatus === "undeclared"
  if (!actionable) return stop("no-actionable-author-gap")
  return { continue: true, reason: a.draftRevision ? "repair-current-draft-feedback" : "author-first-source-supported-draft", progress }
}

/** Shared mode-first context for native and structured provider entry points. */
export function projectProgramTaskContext(options: AuthorInputs & { report?: any; draftReport?: any; questions: readonly OriginalQuestion[]; programMode?: ProgramMode; programContext?: ProgramContext; local?: any; evidence?: readonly any[]; remainingActions?: number }) {
  const mode = options.programMode ?? "consume", report = options.report ?? options.draftReport
  const local = options.local
  const obligations = options.obligations ?? (report?.sourcesCurrent === false || report?.status === "invalidated" ? [] : report?.obligations ?? [])
  return {
    programMode: mode, ...(options.programContext === "directed" ? { purpose: resolveProgramPurpose(options.programContext, mode) } : {}), currentStage: local?.focus?.stage ?? "source-investigation",
    executableContract: projectProgramConsumption(options.report, options.questions, options.programContext),
    ...(mode === "edit" ? { authoring: projectProgramAuthoring(report, options.questions, options.remainingActions, options) } : {}),
    ...(options.programContext === "directed" ? {} : { sourceWindows: local?.sourceWindows ?? [] }),
    sourceIndex: (options.evidence ?? []).map(({ id, path, startLine, endLine, sha256 }) => ({ id, path, startLine, endLine, sha256 })),
    sourceCandidates: local?.pendingSourceWork ?? [],
    remainingDuties: projectProgramInvestigation(obligations, report?.currentDraft?.raw ?? report?.program, options.questions, options.operationQuestions),
  }
}
