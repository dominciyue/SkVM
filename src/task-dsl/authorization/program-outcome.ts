/** Structural expression dependencies annotated with existing actual events.
 * Both branches of choose remain possible dependencies; this is not dynamic taint. */
function returnBasis(program: any, execution: any, returnedStep: any) {
  if (!returnedStep) return undefined
  const steps: any[] = program?.resourceWorkflow?.steps ?? [], events: any[] = execution?.events ?? []
  const expressionBasis = (expression: any) => {
    const kinds = new Set<string>(), dependencies = new Map<string, any>(), seen = new Set<string>()
    const reference = (name: string) => {
      const step = steps.find(s => s.id === name) ?? [...steps].sort((a, b) => b.id.length - a.id.length).find(s => name.startsWith(s.id + "."))
      if (!step) { kinds.add((program.resourceWorkflow.inputs ?? []).some((n: string) => n === name || name.startsWith(n + ".")) ? "supplied-input" : "unresolved-reference"); return }
      if (seen.has(step.id)) return
      seen.add(step.id)
      const event = events.find(e => e.id === step.id)
      dependencies.set(step.id, { id: step.id, op: step.op, source: step.source, sources: step.sources, outcome: event?.outcome ?? "not-executed", meaningOrigin: event?.meaningOrigin, assumption: event?.inputs?.assumption })
      if (step.op === "external") kinds.add(!event || event.outcome === "skipped" ? "unexecuted-external-branch" : event.inputs?.assumption ? "supplied-external-fact" : "unresolved-external-fact")
      else if (step.op === "select" || step.op === "guard") kinds.add("finite-computation")
      if (typeof step.from === "string") reference(step.from)
      for (const key of ["value", "test", "where", "when", "arguments", "principal", "resource"]) visit(step[key], key === "where" && step.op === "select")
    }
    const visit = (value: any, selectionRow = false) => {
      if (!value || typeof value !== "object") return
      if (Object.hasOwn(value, "literal")) { kinds.add("authored-literal"); return }
      if (typeof value.ref === "string") { reference(value.ref); return }
      if (typeof value.binding === "string") { if (selectionRow && value.binding.startsWith("row.")) kinds.add("selection-row"); else reference(value.binding); return }
      if (value.field || value.test || value.choose || value.coalesce || value.integer || value.op) kinds.add("finite-computation")
      for (const child of Object.values(value)) visit(child, selectionRow)
    }
    visit(expression)
    return { kinds: [...kinds], dependencies: [...dependencies.values()], semanticSupport: "author-declared-unreviewed" }
  }
  return { kind: "structural-dependencies-with-actual-events", fields: returnedStep.value?.record ? Object.fromEntries(Object.entries(returnedStep.value.record).map(([key, value]) => [key, expressionBasis(value)])) : { $return: expressionBasis(returnedStep.value) }, controlDependencies: events.filter(e => e.op === "guard" && e.outcome !== "skipped").map(e => ({ id: e.id, outcome: e.outcome, source: e.source, condition: e.condition, gaps: e.gaps })), requiredPremises: execution?.conditions ?? [], instruction: "Dependency kinds describe authored expressions, not source proof. An authored literal does not establish upstream behavior. Structural branches may not execute; consult actual outcomes and retain completion conditions." }
}
/** A view of actual events, not a second evaluator or a semantic certificate. */
export function projectProgramOutcome(report: any) {
  const e = report?.resourceExecution, events: any[] = e?.events ?? []
  const executionGaps: string[] = [...new Set<string>(events.filter(x => x.outcome !== "skipped").flatMap(x => x.gaps ?? []))]
  const premises = e?.conditions ?? []
  const denied = events.some(x => x.op === "guard" && x.outcome === "rejected")
  const returnEvent = [...events].reverse().find(x => x.op === "return" && x.outcome !== "skipped")
  const returnStep = report?.program?.resourceWorkflow?.steps?.find((s: any) => s.id === returnEvent?.id)
  const coverageGaps = [...(report?.program?.scope?.upstream ?? report?.scope?.upstream ?? []), ...(report?.program?.resourceWorkflow?.gaps ?? []), ...(report?.obligations ?? []).filter((o: any) => o.state !== "mapped-unreviewed")]
  const stop = events.find(x => x.op === "guard" && x.outcome === "rejected")
  const prefix = stop ? events.slice(0, events.indexOf(stop)) : events
  return { execution: !e ? "unresolved" : premises.length ? "conditional" : denied ? "denied" : executionGaps.length ? "conditional" : e.termination === "return" && e.returned !== undefined ? "computed" : "unresolved",
    value: denied ? undefined : e?.returned, termination: e?.termination, requiredPremises: premises, executionGaps, coverageGaps,
    eventOrder: events.map(x => x.id),
    stoppedAt: stop && { id: stop.id, source: stop.source, termination: e?.termination },
    priorCalls: prefix.filter(x => x.op === "external" && x.outcome !== "skipped").map(x => ({ id: x.id, outcome: x.outcome, value: x.outputs?.value, source: x.source, meaningOrigin: x.inputs?.assumption ? "supplied-unreviewed" : "unresolved-external-fact", targetExecution: false })),
    orderScope: "Actual finite event order; source order and business effects require source review. Earlier simulated calls survive a later error. No target service or database was executed.",
    returnBasis: returnBasis(report?.program, e, returnStep),
    executedAssumptions: events.filter(x => x.op === "external" && x.outcome !== "skipped" && x.inputs?.assumption).map(x => ({ stepId: x.id, fact: x.inputs.assumption, origin: "supplied-unreviewed" })),
    outputFields: e?.returned && typeof e.returned === "object" && !Array.isArray(e.returned) ? Object.entries(e.returned).map(([key, value]) => ({ key, value, expression: returnStep?.value?.record?.[key], source: returnStep?.source, explanation: returnStep?.because, meaningOrigin: returnStep?.value?.record?.[key] ? "author-expression-unreviewed" : "undeclared" })) : [],
    legacyStatus: e?.status, semanticSupport: "unreviewed", requestOperationCertified: false }
}
