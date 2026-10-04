import { isDeepStrictEqual } from "node:util"
import { ControlSliceDeltaSchema, createControlSlice, mergeControlSlice, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { checkControlConclusions } from "../../task-dsl/authorization/control-conclusion.ts"
import { validateAuthorizationInquiryResult } from "../../task-dsl/authorization/inquiry-result.ts"
import type { AuthorizationInquiryInput } from "./inquiry-local.ts"
import type { AuthorizationInquiryRun, InquiryMethod } from "./inquiry-run.ts"
import type { InquiryEvidence, InquiryTools } from "./inquiry-tools.ts"
import type { z } from "zod"
import { hasUnknownAuthorizationCompletion } from "./telemetry.ts"

export interface InquiryReuseSeed { delta: z.infer<typeof ControlSliceDeltaSchema>; evidence: InquiryEvidence[] }
export interface InquiryReuseInfo {
  previousSessionId: string; change: "unchanged" | "policy-only" | "premise-only" | "source-changed" | "incompatible";
  answerReused: false; semanticSupport: "unreviewed"; reusedRuleKeys: string[]; invalidatedPolicyKeys: string[]; invalidatedPremiseKeys: string[]
}
/** Plan reuse of bounded source interpretation; never reuse answers, check results or dependency state. */
export function planInquiryReuse(options: {
  currentInput: AuthorizationInquiryInput; previousInput: AuthorizationInquiryInput; previousRun: Partial<AuthorizationInquiryRun>;
  previousSessionId: string; currentFiles: InquiryTools["files"]; currentMethod: InquiryMethod; previousMethod: InquiryMethod;
  currentStrategy: InquiryStrategy; previousStrategy: InquiryStrategy; currentModel: string; previousModel: string;
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
  if (sourceChanged) reasons.push("Allowed source bytes or indexed file set changed; dependency closure cannot prove unaffected interpretation.")
  if (options.currentStrategy !== "guided-evidence-v2" || options.previousStrategy !== "guided-evidence-v2" || options.currentMethod !== options.previousMethod || options.currentModel !== options.previousModel) reasons.push("Model, method or guided strategy is incompatible with the previous extraction.")
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
    const original = ControlSliceDeltaSchema.parse({ schemaVersion: "authorization-control-slice/v1", rules: slice.rules.map(content), dependencies: slice.dependencies.map(content), bindings: slice.bindings.map(content), policyRules: slice.policyRules.map(content) })
    const restored = mergeControlSlice(createControlSlice(), original, previousProgram, context)
    const checked = checkControlConclusions(previousProgram, restored.state, prior.final, prior.domain!.dependencies)
    const validated = validateAuthorizationInquiryResult(previousProgram, prior.final, context, checked)
    if (restored.diagnostics.length || slice.conflicts.some(c => !c.resolved) || !validated.valid || validated.questionChecks.some(q => q.deliveryStatus !== "checked" || q.evidenceCoverage !== "bounded")) return { status: "needs-fresh-analysis" as const, info, reasons: ["Recorded extraction no longer passes the current mechanical checks; recorded checked flags are not sufficient."] }
    const delta = ControlSliceDeltaSchema.parse({ schemaVersion: "authorization-control-slice/v1", rules: slice.rules.map(content), dependencies: slice.dependencies.map(content), bindings: bindings.map(content), policyRules: policyOnly ? [] : slice.policyRules.map(content) })
    const needed = new Set([...delta.rules, ...delta.dependencies].flatMap(r => r.evidenceIds))
    const evidence = (prior.evidence ?? []).filter(e => needed.has(e.id))
    if ([...needed].some(id => !evidence.some(e => e.id === id))) return { status: "needs-fresh-analysis" as const, info, reasons: ["Original evidence footprint is incomplete; recover with fresh analysis."] }
    info.reusedRuleKeys = delta.rules.map(r => `${r.questionId}.${r.key}`)
    return { status: "reusable" as const, info, reasons, seed: structuredClone({ delta, evidence }) }
  } catch {
    return { status: "needs-fresh-analysis" as const, info, reasons: ["Previous extraction no longer matches the current bounded control schema."] }
  }
}
