import { assessBehaviorTrace } from "../authorization-purpose-scoped-program-v1/behavior-assessment.ts"
type Span = { path: string; startLine: number; endLine: number }
/** Evaluation-only boundary fixed before new author results. Local scope is
 * request/root lookup through descriptor selection, not DRF request admission.
 * No external grant or expected value is supplied to the execution. */
export const downloadUpstreamSpans: Span[] = [
  { path: "src/documents/permissions.py", startLine: 30, endLine: 44 },
  { path: "framework/rest_framework-3.18.1/rest_framework/permissions.py", startLine: 233, endLine: 246 },
  { path: "framework/rest_framework-3.18.1/rest_framework/views.py", startLine: 404, endLine: 421 },
]
export function assessScopedTrace(execution: any, expected: Parameters<typeof assessBehaviorTrace>[1], upstreamSpans: readonly Span[] = downloadUpstreamSpans) {
  const events: any[] = execution?.events ?? [], inside = (source: any) => source && upstreamSpans.some(s => source.path === s.path && source.startLine >= s.startLine && (source.endLine ?? source.startLine) <= s.endLine)
  const upstreamEvents = events.filter(e => inside(e.source)), upstreamIds = new Set(upstreamEvents.map(e => e.id))
  const upstreamConditions = (execution?.conditions ?? []).filter((c: any) => upstreamIds.has(c.step)), conditions = (execution?.conditions ?? []).filter((c: any) => !upstreamIds.has(c.step))
  // Conditional is a cumulative runtime label. Remove only the admitted upstream
  // label for the local projection; the original execution remains unchanged.
  const localEvents = events.filter(e => !upstreamIds.has(e.id)).map(e => ({ ...e, outcome: !conditions.length && e.outcome === "conditional" ? e.op === "guard" && e.inputs?.test?.truth === "false" ? "rejected" : "computed" : e.outcome }))
  const localExecution = execution && { ...execution, events: localEvents, conditions }
  return { local: assessBehaviorTrace(localExecution, expected), originalStrict: assessBehaviorTrace(execution, expected), localExecution,
    upstream: { status: upstreamConditions.length || upstreamEvents.some(e => e.outcome === "unresolved") ? "unresolved" : upstreamEvents.length ? "observed" : "not-modeled", events: upstreamEvents, conditions: upstreamConditions, scope: upstreamSpans, suppliedGrant: false },
    scopeSupport: "source-location partition; source meanings still need independent review", requestOperationCertified: false }
}
