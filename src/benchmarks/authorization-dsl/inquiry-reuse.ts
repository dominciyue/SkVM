import { isDeepStrictEqual } from "node:util"
import { ControlSliceDeltaSchema, createControlSlice, mergeControlSlice, isGuidedInquiryStrategy, isSemanticInquiryStrategy, canonicalControl, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { checkControlConclusions } from "../../task-dsl/authorization/control-conclusion.ts"
import { validateAuthorizationInquiryResult } from "../../task-dsl/authorization/inquiry-result.ts"
import type { AuthorizationInquiryInput } from "./inquiry-local.ts"
import type { AuthorizationInquiryRun, InquiryMethod } from "./inquiry-run.ts"
import type { InquiryEvidence, InquiryTools } from "./inquiry-tools.ts"
import type { z } from "zod"
import { hasUnknownAuthorizationCompletion } from "./telemetry.ts"
import { SemanticBlockSchema, lowerSemanticFlow, type BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import type { StructureIndex } from "./evidence-preparation/structure-index.ts"
import { structuralDependencyRevision } from "./operation-work.ts"

export interface InquiryReuseSeed { delta: z.infer<typeof ControlSliceDeltaSchema>; evidence: InquiryEvidence[]; semanticUnits?: BoundSemanticBlock[] }
export interface InquiryReuseInfo {
  previousSessionId: string; change: "unchanged" | "policy-only" | "premise-only" | "policy-and-premise" | "source-changed" | "incompatible";
  answerReused: false; semanticSupport: "unreviewed"; reusedRuleKeys: string[]; invalidatedPolicyKeys: string[]; invalidatedPremiseKeys: string[]
  reuseLevel?: "materials"; reusedMaterials?: string[]; invalidatedMaterials?: Array<{ handle: string; reasons: string[] }>
  legacyRebindings?: Array<{ handle: string; previousId: string; currentId: string }>
}
/** Plan reuse of bounded source interpretation; never reuse answers, check results or dependency state. */
export function planInquiryReuse(options: {
  currentInput: AuthorizationInquiryInput; previousInput: AuthorizationInquiryInput; previousRun: Partial<AuthorizationInquiryRun>;
  previousSessionId: string; currentFiles: InquiryTools["files"]; currentMethod: InquiryMethod; previousMethod: InquiryMethod;
  currentStrategy: InquiryStrategy; previousStrategy: InquiryStrategy; currentModel: string; previousModel: string;
  currentStructure?: StructureIndex;
}) {
  const current = options.currentInput, old = options.previousInput, prior = options.previousRun, reasons: string[] = []
  const omitRoot = (v: AuthorizationInquiryInput) => ({ ...v, sourceRoot: undefined })
  const withoutPolicy = (v: AuthorizationInquiryInput) => ({ ...omitRoot(v), policy: undefined, inquiry: v.inquiry ? { ...v.inquiry, policy: undefined } : undefined })
  const withoutPremises = (v: AuthorizationInquiryInput) => ({ ...omitRoot(v), inquiry: v.inquiry ? { ...v.inquiry, questions: v.inquiry.questions.map(q => ({ ...q, premises: [] })) } : undefined })
  const sourceChanged = !isDeepStrictEqual(options.currentFiles, prior.sourceFiles)
  const taskChanged = !isDeepStrictEqual(omitRoot(current), omitRoot(old))
  const policyOnly = taskChanged && isDeepStrictEqual(withoutPolicy(current), withoutPolicy(old))
  const premiseOnly = taskChanged && isDeepStrictEqual(withoutPremises(current), withoutPremises(old))
  const change: InquiryReuseInfo["change"] = sourceChanged ? "source-changed" : !taskChanged ? "unchanged" : policyOnly ? "policy-only" : premiseOnly ? "premise-only" : "incompatible"
  const info: InquiryReuseInfo = { previousSessionId: options.previousSessionId, change, answerReused: false, semanticSupport: "unreviewed", reusedRuleKeys: [], invalidatedPolicyKeys: [], invalidatedPremiseKeys: [] }
  if (options.currentStrategy === "operation-evidence-v1") return planOperationMaterials(options, info)
  if (sourceChanged) reasons.push("Allowed source bytes or indexed file set changed; dependency closure cannot prove unaffected interpretation.")
  if (!isGuidedInquiryStrategy(options.currentStrategy) || options.currentStrategy !== options.previousStrategy || options.currentMethod !== options.previousMethod || options.currentModel !== options.previousModel) reasons.push("Model, method or exact guided strategy is incompatible with the previous extraction.")
  if (!current.inquiry || !old.inquiry || change === "incompatible") reasons.push("Reuse requires compatible complete questions; changed natural briefs require fresh declaration and analysis.")
  const checks = prior.validation?.questionChecks
  if (prior.status !== "completed" || hasUnknownAuthorizationCompletion(prior) || !prior.validation?.valid || !prior.domain?.slice || !Array.isArray(prior.domain?.dependencies) || !Array.isArray(checks) || !old.inquiry?.questions.every(q => checks.some(c => c.questionId === q.id && c.deliveryStatus === "checked" && c.transportValid && c.referenceValid && c.ruleConsistent === true && c.evidenceCoverage === "bounded" && c.trace))) reasons.push("Previous session lacks checked bounded question/dependency footprints or has unknown completion; old partial output cannot be promoted.")
  if (reasons.length) return { status: "needs-fresh-analysis" as const, info, reasons }
  const slice = prior.domain!.slice
  const content = ({ id: _id, digest: _digest, sourceBound: _bound, semanticSupport: _semantic, ...item }: any) => item
  // A repeated quote in a changed premise may be negated or superseded. Retain
  // values only for questions whose entire supplied premise context is unchanged.
  const bindings = slice.bindings.filter(b => !premiseOnly || isDeepStrictEqual(current.inquiry!.questions.find(q => q.id === b.questionId)?.premises, old.inquiry!.questions.find(q => q.id === b.questionId)?.premises))
  info.invalidatedPremiseKeys = slice.bindings.filter(b => !bindings.includes(b)).map(b => `${b.questionId}.${b.key}`)
  info.invalidatedPolicyKeys = policyOnly ? slice.policyRules.map(p => `${p.questionId}.${p.key}`) : []
  try {
    const previousProgram = compileAuthorizationInquiry(old.inquiry!)
    const context = { questionIds: previousProgram.questions.map(q => q.id), shownEvidenceIds: (prior.evidence ?? []).map(e => e.id) }
    const semanticUnits = prior.domain?.semantic?.units
    if (isSemanticInquiryStrategy(options.currentStrategy)) {
      if (!semanticUnits?.length) throw new Error("Missing semantic units")
      for (const { questionId, evidenceIds, source: _source, ...unit } of semanticUnits) { SemanticBlockSchema.parse(unit); if (!old.inquiry!.questions.some(q => q.id === questionId) || !evidenceIds.length) throw new Error("Unbound semantic unit") }
      const lowered = lowerSemanticFlow(semanticUnits, { compositional: options.currentStrategy === "focused-closure-v1" })
      if (lowered.diagnostics.length || canonicalControl(lowered.delta.rules) !== canonicalControl(slice.rules.filter(r => r.sourceOrigin).map(content))) throw new Error("Semantic/canonical footprint mismatch")
    }
    const original = ControlSliceDeltaSchema.parse({ schemaVersion: slice.schemaVersion, rules: slice.rules.map(content), dependencies: slice.dependencies.map(content), bindings: slice.bindings.map(content), policyRules: slice.policyRules.map(content) })
    const restored = mergeControlSlice(createControlSlice(), original, previousProgram, context)
    const checked = checkControlConclusions(previousProgram, restored.state, prior.final, prior.domain!.dependencies)
    const validated = validateAuthorizationInquiryResult(previousProgram, prior.final, context, checked)
    if (restored.diagnostics.length || slice.conflicts.some(c => !c.resolved) || !validated.valid || validated.questionChecks.some(q => q.deliveryStatus !== "checked" || q.evidenceCoverage !== "bounded")) return { status: "needs-fresh-analysis" as const, info, reasons: ["Recorded extraction no longer passes the current mechanical checks; recorded checked flags are not sufficient."] }
    const delta = ControlSliceDeltaSchema.parse({ schemaVersion: slice.schemaVersion, rules: slice.rules.map(content), dependencies: slice.dependencies.map(content), bindings: bindings.map(content), policyRules: policyOnly ? [] : slice.policyRules.map(content) })
    const needed = new Set([...delta.rules, ...delta.dependencies, ...(semanticUnits ?? [])].flatMap(r => r.evidenceIds))
    const evidence = (prior.evidence ?? []).filter(e => needed.has(e.id))
    if ([...needed].some(id => !evidence.some(e => e.id === id))) return { status: "needs-fresh-analysis" as const, info, reasons: ["Original evidence footprint is incomplete; recover with fresh analysis."] }
    info.reusedRuleKeys = delta.rules.map(r => `${r.questionId}.${r.key}`)
    return { status: "reusable" as const, info, reasons, seed: structuredClone({ delta, evidence, ...(semanticUnits ? { semanticUnits } : {}) }) }
  } catch {
    return { status: "needs-fresh-analysis" as const, info, reasons: ["Previous extraction no longer matches the current bounded control schema."] }
  }
}

function planOperationMaterials(options: Parameters<typeof planInquiryReuse>[0], info: InquiryReuseInfo) {
  const current = options.currentInput, old = options.previousInput, prior = options.previousRun, index = options.currentStructure, reasons: string[] = []
  const stable = (v: AuthorizationInquiryInput) => ({ ...v, sourceRoot: undefined, policy: undefined, inquiry: v.inquiry ? { ...v.inquiry, policy: undefined, questions: v.inquiry.questions.map(q => ({ ...q, premises: [] })) } : undefined })
  if (!current.inquiry || !old.inquiry || !isDeepStrictEqual(stable(current), stable(old))) reasons.push("Materials require the same original operation/questions/source scope; policy and explicit premises may change.")
  if (!index || options.previousStrategy !== "operation-evidence-v1" || options.currentMethod !== options.previousMethod || options.currentModel !== options.previousModel) reasons.push("Current structure, model, method and exact operation strategy must match.")
  if (hasUnknownAuthorizationCompletion(prior) || !prior.domain?.operationFacts || !prior.domain.semantic?.units) reasons.push("Known retained operation materials are required; unknown completion stays sealed.")
  if (reasons.length) return { status: "needs-fresh-analysis" as const, info, reasons }
  info.reuseLevel = "materials"; info.reusedMaterials = []; info.invalidatedMaterials = []
  if (info.change === "incompatible") info.change = "policy-and-premise"
  const files = new Map(options.currentFiles.map(f => [f.path, f.sha256])), sourceFacts = prior.domain!.operationFacts!, retained: BoundSemanticBlock[] = [], evidence = prior.evidence ?? []
  for (const original of prior.domain!.semantic!.units) {
    const unit = structuredClone(original)
    const failures: string[] = [], fact = sourceFacts.facts.find(f => f.current && f.unit && isDeepStrictEqual(f.unit, original))
    let rebound = false
    if (unit.source && !index!.symbols.some(s => s.id === unit.source!.id && s.sha256 === unit.source!.sha256)) {
      const exact = index!.symbols.filter(s => s.path === unit.source!.path && s.sha256 === unit.source!.sha256 && s.startLine === unit.source!.startLine && s.endLine === unit.source!.endLine)
      const priorStructure = prior.domain!.structure
      const sameStructure = isDeepStrictEqual(options.currentFiles, prior.sourceFiles) && priorStructure?.parser === index!.parser && (priorStructure.relationshipVersion ?? "source-bindings/v1") === index!.relationshipVersion
      if (exact.length !== 1) failures.push(exact.length > 1 ? "legacy-source-ambiguous" : "legacy-source-unavailable")
      else if (!sameStructure || unit.receiverClass && !index!.symbols.some(s => s.kind === "class" && s.qualifiedName === unit.receiverClass)) failures.push("legacy-structural-dependencies-unverified")
      else {
        const previousId = unit.source.id
        unit.source.id = exact[0]!.id; rebound = true
        ;(info.legacyRebindings ??= []).push({ handle: unit.handle, previousId, currentId: unit.source.id })
      }
    }
    try { const { questionId: _q, evidenceIds: _e, source: _s, receiverClass: _r, ...raw } = unit; SemanticBlockSchema.parse(raw) } catch { failures.push("semantic-schema") }
    if (!fact || !unit.source || !fact.dependencies.length) failures.push("missing source/fact dependency footprint")
    for (const d of fact?.dependencies ?? []) {
      const dependency = rebound && d.kind === "symbol-resolution" && d.key === original.source!.id ? { ...d, key: unit.source!.id }
        : rebound && d.kind === "candidate-set" && d.key.startsWith(`relations:${original.source!.id}:`) ? { ...d, key: d.key.replace(`relations:${original.source!.id}:`, `relations:${unit.source!.id}:`) } : d
      const revision = dependency.kind === "source-span" ? files.get(dependency.key) : structuralDependencyRevision(index!, dependency)
      // Legacy runtime identity salts can only be retired when all indexed
      // originals and the parser/relation version are unchanged. No old
      // framework binding or absent dependency is silently reconstructed.
      if (!revision || revision !== d.revision && !(rebound && d.kind === "candidate-set")) failures.push(`${d.kind}:${d.key}:changed-or-unavailable`)
    }
    if (!unit.evidenceIds.length || unit.evidenceIds.some(id => { const e = evidence.find(e => e.id === id); return !e || e.repository !== current.repository || e.sourceRef !== current.sourceRef || files.get(e.path) !== e.sha256 })) failures.push("original evidence changed-or-unavailable")
    if (failures.length) info.invalidatedMaterials.push({ handle: unit.handle, reasons: [...new Set(failures)] })
    else { retained.push(structuredClone(unit)); info.reusedMaterials.push(unit.handle) }
  }
  // Rebuild all rules/relations from retained source templates in the new runtime.
  // Known values require the entire same-question user context to remain unchanged.
  const content = ({ id: _id, digest: _digest, sourceBound: _b, semanticSupport: _s, ...item }: any) => item
  const bindings = prior.domain!.slice.bindings.filter(b => isDeepStrictEqual(current.inquiry!.questions.find(q => q.id === b.questionId), old.inquiry!.questions.find(q => q.id === b.questionId)))
  info.invalidatedPremiseKeys = prior.domain!.slice.bindings.filter(b => !bindings.includes(b)).map(b => `${b.questionId}.${b.key}`)
  info.invalidatedPolicyKeys = prior.domain!.slice.policyRules.map(p => `${p.questionId}.${p.key}`)
  const needed = new Set(retained.flatMap(u => u.evidenceIds)), parsed = ControlSliceDeltaSchema.safeParse({ schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: bindings.map(content), policyRules: [] })
  if (!parsed.success) return { status: "needs-fresh-analysis" as const, info, reasons: ["Retained premise values no longer match the bounded schema."] }
  return { status: "reusable" as const, info, reasons, seed: { delta: parsed.data, evidence: structuredClone(evidence.filter(e => needed.has(e.id))), semanticUnits: retained } }
}
