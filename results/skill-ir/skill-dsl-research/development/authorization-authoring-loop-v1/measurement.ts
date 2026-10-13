export function classifyTerminalReport(report: any) {
  const account = report.telemetry?.account
  const terminalError = account?.terminalError
  const reason = account?.reason ?? report.error ?? report.recovery ?? (typeof terminalError === "string" ? terminalError : terminalError?.message ?? (terminalError && JSON.stringify(terminalError)))
  const channelEvidence = [reason, terminalError && JSON.stringify(terminalError)].filter(Boolean).join("\n")
  return { status: ["timeout-unknown", "completion-unknown"].includes(report.status) ? "unknown" : report.status,
    reason, quotaOrAuth: !!report.quotaRefused || !!account?.quotaRefused || /quota|authentication|unauthorized/i.test(channelEvidence), routingFailure: /routing/i.test(channelEvidence) }
}

export function observedAccountCost(report: any) {
  const account = report.telemetry?.account
  return { inferenceDispatched: account?.inferenceDispatched ?? false, usage: account?.usage ?? null, providerRequests: account?.providerRequests ?? null, actualUsd: account?.actualUsd ?? null }
}

function computation(execution: any) {
  if (!execution) return undefined
  return { returned: execution.returned, termination: execution.termination, conditions: execution.conditions ?? [], gaps: execution.gaps ?? [], events: execution.events?.length ?? 0 }
}

/** Read archived observations only; never infer machine values from the natural answer. */
export function measureAuthorTimeline(run: any) {
  const history: any[] = run.native?.history ?? []
  const timeline = history.flatMap((entry, index) => {
    const name = entry.call?.name, output = entry.output ?? {}, proposal = ["authorization_program", "authorization_program_patch", "authorization_declare"].includes(name)
    if (!proposal && !name?.startsWith("source_") && name !== "authorization_program_details") return []
    const revision = output.currentDraft?.revision, candidate = revision !== undefined && output.candidate?.revision === revision ? output.candidate : undefined
    const diagnostics = output.currentDraftDiagnostics ?? candidate?.diagnostics ?? []
    const valid = proposal && !!candidate && !diagnostics.some((d: any) => d.severity === "error")
    return [{ historyOrdinal: index + 1, toolUnit: output.toolBudget?.totalUsed ?? null, name,
      ...(name?.startsWith("source_") ? { source: entry.call.arguments } : {}),
      ...(proposal ? { draftRevision: revision, valid, adopted: candidate?.adopted ?? false, activeRevision: output.executableContract?.revision,
        diagnostics: diagnostics.map((d: any) => ({ code: d.code, path: d.path, severity: d.severity })), execution: computation(candidate?.resourceExecution), changes: output.executableContract?.authorLoop?.lastChange ?? output.authorLoop?.lastChange } : {}) }]
  })
  const proposals = timeline.filter(entry => ["authorization_program", "authorization_program_patch", "authorization_declare"].includes(entry.name))
  const active = run.domain?.executableContract, execution = active?.status === "invalidated" ? undefined : active?.resourceExecution
  const result = computation(execution), hasReturn = execution?.returned !== undefined
  const machineStatus = !hasReturn ? "not-computed" : result!.conditions.length || result!.gaps.length ? "conditional" : "computed"
  return { schemaVersion: "authorization-author-timeline/v1", restoredDraftRevision: run.domain?.programDraft?.restoredDraftRevision ?? null,
    firstProgramAttemptToolUnit: proposals.find(entry => entry.name === "authorization_program")?.toolUnit ?? null,
    firstProposalToolUnit: proposals[0]?.toolUnit ?? null, firstValidDraftToolUnit: proposals.find(entry => entry.valid)?.toolUnit ?? null,
    firstExecutionToolUnit: proposals.find(entry => entry.execution?.events)?.toolUnit ?? null, patchCount: proposals.filter(entry => entry.name === "authorization_program_patch").length,
    timeline, activeRevision: active?.revision ?? null, currentDraftRevision: run.domain?.programDraft?.currentDraft?.revision ?? null,
    machine: { status: machineStatus, ...result }, natural: { delivery: run.answerDelivery ?? "unknown", semanticReview: "pending" },
    status: run.status, perToolWallTimes: "not exposed by native history; use the original lifecycle for wall timing" }
}
