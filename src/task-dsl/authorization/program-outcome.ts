/** A view of actual events, not a second evaluator or a semantic certificate. */
export function projectProgramOutcome(report: any) {
  const e = report?.resourceExecution, events: any[] = e?.events ?? []
  const executionGaps: string[] = [...new Set<string>(events.filter(x => x.outcome !== "skipped").flatMap(x => x.gaps ?? []))]
  const premises = e?.conditions ?? []
  const denied = events.some(x => x.op === "guard" && x.outcome === "rejected")
  const returnEvent = [...events].reverse().find(x => x.op === "return" && x.outcome !== "skipped")
  const returnStep = report?.program?.resourceWorkflow?.steps?.find((s: any) => s.id === returnEvent?.id)
  const coverageGaps = [...(report?.program?.scope?.upstream ?? report?.scope?.upstream ?? []), ...(report?.program?.resourceWorkflow?.gaps ?? []), ...(report?.obligations ?? []).filter((o: any) => o.state !== "mapped-unreviewed")]
  return { execution: !e ? "unresolved" : premises.length ? "conditional" : denied ? "denied" : executionGaps.length ? "conditional" : e.termination === "return" && e.returned !== undefined ? "computed" : "unresolved",
    value: denied ? undefined : e?.returned, termination: e?.termination, requiredPremises: premises, executionGaps, coverageGaps,
    executedAssumptions: events.filter(x => x.op === "external" && x.outcome !== "skipped" && x.inputs?.assumption).map(x => ({ stepId: x.id, fact: x.inputs.assumption, origin: "supplied-unreviewed" })),
    outputFields: e?.returned && typeof e.returned === "object" && !Array.isArray(e.returned) ? Object.entries(e.returned).map(([key, value]) => ({ key, value, expression: returnStep?.value?.record?.[key], source: returnStep?.source, explanation: returnStep?.because, meaningOrigin: returnStep?.value?.record?.[key] ? "author-expression-unreviewed" : "undeclared" })) : [],
    legacyStatus: e?.status, semanticSupport: "unreviewed", requestOperationCertified: false }
}
