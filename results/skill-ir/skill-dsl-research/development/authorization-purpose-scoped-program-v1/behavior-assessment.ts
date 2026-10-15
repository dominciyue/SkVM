import { isDeepStrictEqual } from "node:util"
import { sourceDownloadOracle } from "../authorization-authoring-loop-v1/evaluation/source-oracle.ts"

/** Evaluation only: expected calls come from independent source review. Never
 * imported by production or included in an author's source allowlist. */
export function assessBehaviorTrace(execution: any, expected: {
  calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  rejected?: boolean; termination?: string; returned?: unknown; conditional?: boolean; requiredConditionCalls?: string[]
}) {
  const failures: string[] = [], events: any[] = execution?.events ?? []
  const calls = events.filter(e => e.op === "external" && e.outcome !== "skipped").map(e => ({ name: e.inputs?.name,
    arguments: Object.fromEntries(Object.entries(e.inputs?.arguments ?? {}).map(([k, v]: [string, any]) => [k, v?.known ? v.value : { unresolved: true }])) }))
  if (!execution) failures.push("execution-missing")
  if (!isDeepStrictEqual(calls, expected.calls)) failures.push("ordered-exact-external-calls")
  if (expected.termination !== undefined && execution?.termination !== expected.termination) failures.push("termination")
  if (Object.hasOwn(expected, "returned") && !isDeepStrictEqual(execution?.returned, expected.returned)) failures.push("returned-value")
  // Coverage warnings and unused external gaps are not execution conditions.
  // Required missing calls must still occur in an actual control condition below.
  const conditional = !!execution?.conditions?.length
  if (expected.conditional !== undefined && conditional !== expected.conditional) failures.push("required-conditions")
  const contains = (value: any, wanted: string): boolean => value === wanted || !!value && typeof value === "object" && Object.values(value).some(v => contains(v, wanted))
  for (const name of expected.requiredConditionCalls ?? []) {
    const call = events.find(e => e.op === "external" && e.outcome !== "skipped" && e.inputs?.name === name)
    if (!call || !(execution.conditions ?? []).some((c: any) => contains(c, call.id) || contains(c, `external:${name}`))) failures.push(`required-call-condition:${name}`)
  }
  if (expected.rejected) {
    const stop = events.findIndex(e => e.op === "guard" && e.outcome === "rejected")
    if (stop < 0 || !execution?.termination || execution.termination === "return") failures.push("explicit-rejection")
    if (execution?.returned !== undefined || events.some(e => e.op === "return" && e.outcome !== "skipped")) failures.push("return-after-rejection")
    if (stop >= 0 && events.slice(stop + 1).some(e => e.outcome !== "skipped")) failures.push("action-after-rejection")
  }
  return { pass: failures.length === 0, failures, actualCalls: calls, semanticSupport: "independently-reviewed-finite-expectation", requestOperationCertified: false }
}

/** Independent evaluation expectation from permissions.py:634-635 and
 * views.py:1408-1447. Constructor completion precedes both owner shortcuts.
 * Source semantic values stay in the historical finite oracle, unchanged. */
export function downloadTraceExpectation(facts: any, assumptions: readonly any[]) {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [], requiredConditionCalls: string[] = []
  const requested = facts.documents?.find((d: any) => d.id === facts.request?.pk)
  const root = requested && (requested.root_document_id === null ? requested : facts.related_root ?? facts.documents.find((d: any) => d.id === requested.root_document_id) ?? requested)
  if (root && facts.actor !== null && facts.actor !== undefined) {
    const init = { name: "ObjectPermissionChecker.construct", arguments: { user: facts.actor.id } }; calls.push(init)
    if (!assumptions.some(a => a.name === init.name && isDeepStrictEqual(a.arguments, init.arguments) && a.value === true)) requiredConditionCalls.push(init.name)
    if (root.owner_id !== null && root.owner_id !== facts.actor.id) calls.push({ name: "ObjectPermissionChecker.has_perm", arguments: { user: facts.actor.id, resource: root.id, permission: "view_document" } })
  }
  const expected = sourceDownloadOracle(facts, assumptions)
  return { calls, requiredConditionCalls, rejected: ["denied", "rejected"].includes(expected.kind) && !expected.conditions.length, conditional: expected.conditions.length > 0, ...(expected.returned ? { termination: "return" } : {}) }
}
