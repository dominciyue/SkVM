import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { modelSourceDisplay, type InquiryEvidence } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"

type RecordValue = Record<string, any>
const object = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {}
const array = (v: unknown): RecordValue[] => Array.isArray(v) ? v.map(object) : []
const bytes = (v: unknown) => Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v ?? null), "utf8")
const contents = (v: unknown) => array(v).map(m => String(m.content ?? ""))
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter(x => typeof x === "string") : []
const key = (item: RecordValue) => JSON.stringify([item.questionId, item.id])
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0)
const usage = (attempt: RecordValue) => {
  const u = object(attempt.usage), count = (k: string) => typeof u[k] === "number" ? u[k] as number : null
  const input = count("input"), cacheRead = count("cacheRead")
  return { input, output: count("output"), cacheRead, cacheWrite: count("cacheWrite"), fullPromptTokens: input === null || cacheRead === null ? null : input + cacheRead, actualUsd: typeof attempt.costUsd === "number" ? attempt.costUsd : null }
}
const currentWorklist = (request: RecordValue) => {
  for (const content of contents(object(request.params).messages).reverse()) {
    if (!content.startsWith("Current local explanation context: ")) continue
    try {
      const state = object(object(JSON.parse(content.slice("Current local explanation context: ".length))).state)
      if (Array.isArray(state.worklist)) return array(state.worklist)
    } catch { /* A missing or malformed snapshot remains unknown. */ }
  }
  return null
}
const diagnostics = (output: RecordValue) => {
  const found = new Map<string, RecordValue>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { for (const child of value) visit(child); return }
    const row = object(value)
    for (const [name, child] of Object.entries(row)) {
      if (name === "diagnostics" || name === "controlDiagnostics") for (const d of array(child)) found.set(JSON.stringify([d.code, d.path, d.message, d.severity]), d)
      else if (["rejected", "withdrawalRejected", "domain", "domainCheck"].includes(name)) visit(child)
    }
  }
  visit(output)
  return found
}

/** Derive archive observations, never SDK payload sizes or causal per-item costs. */
export function nativeProgress(raw: unknown) {
  const trace = object(raw), requests = array(trace.requests), attempts = array(trace.attempts), history = array(trace.history)
  const events = array(trace.events).filter(e => e.kind === "dispatch"), attemptMap = new Map(attempts.map(a => [a.id, a]))
  const uniqueDispatches = events.length === requests.length && new Set(events.map(e => e.attemptId)).size === events.length
  const bindings = requests.map((request, i) => {
    if (!uniqueDispatches) return null
    const attempt = attemptMap.get(events[i]!.attemptId), params = object(request.params), meta = object(attempt?.request)
    if (!attempt || attempts.filter(a => a.id === attempt.id).length !== 1 || meta.messageCount !== array(params.messages).length || meta.messageCharacters !== sum(contents(params.messages).map(c => c.length)) || meta.maxTokens !== params.maxTokens || JSON.stringify(meta.toolNames) !== JSON.stringify(array(params.tools).map(t => t.name))) return null
    return attempt
  })
  const callOwners = new Map<string, Set<string>>()
  const owner = (call: RecordValue, attemptId: string) => { if (typeof call.id !== "string") return; const ids = callOwners.get(call.id) ?? new Set<string>(); ids.add(attemptId); callOwners.set(call.id, ids) }
  for (const attempt of attempts) for (const call of array(object(attempt.response).toolCalls)) owner(call, attempt.id)
  for (let i = 1; i < requests.length; i++) if (bindings[i - 1]) for (const call of array(object(requests[i]!.previousResponse).toolCalls)) owner(call, bindings[i - 1]!.id)
  const perAttempt = new Map<string, RecordValue[]>(), unboundToolCalls: RecordValue[] = []
  for (const row of history) {
    const call = object(row.call), ids = callOwners.get(call.id)
    if (!ids || ids.size !== 1 || !bindings.some(a => a?.id === [...ids][0])) { unboundToolCalls.push({ id: call.id, name: call.name }); continue }
    const id = [...ids][0]!, list = perAttempt.get(id) ?? []; list.push(row); perAttempt.set(id, list)
  }
  const evidence = array(trace.evidence) as InquiryEvidence[], displayed = new Set<string>(), distinctDiagnostics = new Set<string>()
  const itemRows = new Map<string, RecordValue>(), knownEvidence = new Map(evidence.map(e => [e.id, e])), observations: RecordValue[] = []
  let previous: Map<string, RecordValue> | null = null, noStateProgressStreak = 0
  const snapshot = (items: RecordValue[] | null, position: number, final = false) => {
    if (items === null) { previous = null; noStateProgressStreak = 0; return { known: false, transitions: [], noStateProgressStreak: null } }
    const current = new Map(items.filter(i => typeof i.id === "string" && typeof i.questionId === "string").map(i => [key(i), i])), transitions: RecordValue[] = []
    for (const [identity, item] of current) {
      const old = previous?.get(identity), evidenceIds = strings(item.evidenceIds)
      if (previous && (!old || old.state !== item.state || evidenceIds.some(id => !strings(old.evidenceIds).includes(id)))) transitions.push({ id: item.id, questionId: item.questionId, from: old?.state ?? null, to: item.state, newEvidenceIds: evidenceIds.filter(id => !strings(old?.evidenceIds).includes(id)) })
      const row = itemRows.get(identity) ?? { id: item.id, questionId: item.questionId, kind: item.kind, origin: item.origin, firstSeenRequest: position, firstClosedRequest: null, closedAfterFinalTools: false, evidenceIds: [], costAttribution: "shared-session-prefix", sessionPrefixAtFirstClosure: null }
      row.lastState = item.state; row.evidenceIds = [...new Set([...row.evidenceIds, ...evidenceIds])]
      if (item.state === "closed" && row.firstClosedRequest === null) {
        row.firstClosedRequest = position; row.closedAfterFinalTools = final
        const prefix = observations.slice(0, final ? position : position - 1)
        row.sessionPrefixAtFirstClosure = { dispatchedCalls: prefix.length, serializedMessageBytes: sum(prefix.map(r => r.bytes.serializedMessages)), modelSourceBytes: sum(prefix.map(r => r.bytes.modelSource)), resentSourceBytes: sum(prefix.map(r => r.bytes.resentSource)) }
      }
      itemRows.set(identity, row)
    }
    const removed = previous ? [...previous.values()].filter(i => !current.has(key(i))).map(i => ({ id: i.id, questionId: i.questionId, lastState: i.state })) : []
    noStateProgressStreak = previous && !transitions.length && !removed.length ? noStateProgressStreak + 1 : 0
    previous = current
    return { known: true, counts: Object.fromEntries([...new Set(items.map(i => i.state))].map(s => [s, items.filter(i => i.state === s).length])), transitions, removed, noStateProgressStreak }
  }
  for (const [i, request] of requests.entries()) {
    const params = object(request.params), messages = contents(params.messages), toolContents = contents(request.toolResults), shown = modelSourceDisplay(evidence, [...messages, ...toolContents].join("\n"), displayed)
    for (const id of shown.evidenceIds) displayed.add(id)
    const attempt = bindings[i], calls = attempt ? perAttempt.get(attempt.id) ?? [] : [], ds = new Set<string>()
    for (const row of calls) for (const id of diagnostics(object(row.output)).keys()) ds.add(id)
    const newDistinctDiagnostics = [...ds].filter(id => !distinctDiagnostics.has(id)).length
    for (const id of ds) distinctDiagnostics.add(id)
    const reads = calls.filter(r => object(r.call).name === "source_read" && r.executed !== false)
    const returned = [...reads.flatMap(r => array(object(r.output).evidence)), ...calls.flatMap(r => array(object(r.output).autoReads).flatMap(a => array(a.evidence)))]
    const explicitItems = calls.flatMap(r => array(object(object(r.call).arguments).controlDelta?.locals).map(l => l.itemId)).filter(id => typeof id === "string")
    observations.push({ request: i + 1, attemptId: attempt?.id ?? null, binding: attempt ? "dispatch-event-id-and-request-metadata" : "unknown", status: attempt?.status ?? null, usage: usage(attempt ?? {}), bytes: { serializedMessages: bytes(params.messages), messageContent: sum(messages.map(bytes)), system: params.system === undefined ? 0 : bytes(params.system), serializedTools: params.tools === undefined ? 0 : bytes(params.tools), serializedToolResults: request.toolResults === undefined ? 0 : bytes(request.toolResults), toolResultContent: sum(toolContents.map(bytes)), modelSource: shown.bytes, resentSource: shown.resentBytes, actualProviderPayload: null }, worklist: snapshot(currentWorklist(request), i + 1), toolCalls: calls.map(r => ({ id: object(r.call).id, name: object(r.call).name, executed: r.executed ?? null, exitCode: r.exitCode ?? null, accepted: array(object(r.output).accepted).length, rejected: array(object(r.output).rejected).length, withdrawn: array(object(r.output).withdrawn).length })), explicitlyAddressedItemIds: [...new Set(explicitItems)], sourceReads: { explicitReadCalls: reads.length, automaticReadOutputs: calls.reduce((n, r) => n + array(object(r.output).autoReads).length, 0), returnedWindowBytes: sum(returned.map(e => typeof e.bytes === "number" ? e.bytes : 0)), physicalReadBytes: null }, newDistinctDiagnostics, diagnosticObservations: ds.size })
  }
  const finalItems = object(object(trace.domain).worklist).items
  const finalWorklist = snapshot(Array.isArray(finalItems) ? array(finalItems) : null, requests.length, true)
  for (const item of itemRows.values()) item.associatedDistinctSourceWindowBytes = sum(item.evidenceIds.map((id: string) => knownEvidence.get(id)?.bytes ?? 0))
  // Include unbound outputs in session totals without attributing them to a call.
  for (const row of history) for (const id of diagnostics(object(row.output)).keys()) distinctDiagnostics.add(id)
  const worklistSnapshotRequests = observations.filter(r => r.worklist.known).length
  return { schemaVersion: "ordinary-native-progress/v1", meaning: { byteUnit: "UTF-8", messageSerialization: "JSON.stringify archived params.messages; separate system/tool definitions/continuation tool results", actualProviderPayload: "unknown: SDK transformation and transport payload not archived", tokenMeaning: "fullPromptTokens = provider input + cacheRead; cacheWrite separately retained", progress: "Queue states/evidence associations, accepted mutations, and distinct diagnostic observations are separate; closed is a host state, not independently reviewed semantics.", perItemCost: "Shared session prefix at first closure; no causal allocation or unique call cost is claimed.", perReadPhysicalBytes: "unknown per call; use archived aggregate sourceAccounting without apportioning index/full-file reads", crossRunComparison: "Different generated trajectories; descriptive, not paired causal performance proof", providerCallsDuringAnalysis: 0, targetExecutionsDuringAnalysis: 0 }, totals: { archivedRequests: requests.length, dispatchedAttempts: attempts.length, unboundRequests: bindings.filter(a => !a).length, unboundToolCalls: unboundToolCalls.length, serializedMessageBytes: sum(observations.map(r => r.bytes.serializedMessages)), messageContentBytes: sum(observations.map(r => r.bytes.messageContent)), serializedToolBytes: sum(observations.map(r => r.bytes.serializedTools)), systemBytes: sum(observations.map(r => r.bytes.system)), serializedToolResultBytes: sum(observations.map(r => r.bytes.serializedToolResults)), modelSourceBytes: sum(observations.map(r => r.bytes.modelSource)), resentSourceBytes: sum(observations.map(r => r.bytes.resentSource)), acceptedUpdates: sum(history.map(r => array(object(r.output).accepted).length)), rejectedUpdates: sum(history.map(r => array(object(r.output).rejected).length)), withdrawnDrafts: sum(history.map(r => array(object(r.output).withdrawn).length)), distinctDiagnostics: distinctDiagnostics.size, worklistSnapshotRequests, queueStateTransitions: worklistSnapshotRequests ? sum(observations.map(r => r.worklist.transitions.length)) + finalWorklist.transitions.length : null, maxNoStateProgressStreak: worklistSnapshotRequests > 1 ? Math.max(0, ...observations.map(r => r.worklist.noStateProgressStreak ?? 0)) : null, closedWorkItems: [...itemRows.values()].filter(i => i.lastState === "closed").length }, providerTelemetry: trace.telemetry ?? null, sourceAccounting: trace.sourceAccounting ?? null, requests: observations, finalWorklist, workItems: [...itemRows.values()], unboundToolCalls }
}

if (import.meta.main) {
  const root = import.meta.dir, names = process.argv.slice(2)
  if (!names.length) names.push("native-memos", "native-memos-repaired", "native-memos-policy-change", "native-memos-policy-change-repaired", "native-memos-policy-change-eof-repaired", "native-memos-policy-change-compact-repaired")
  const runs = []
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Use a local archive stage name")
    const result = nativeProgress(JSON.parse(await readFile(path.join(root, "ordinary", name, "native-trace.json"), "utf8")))
    await writeFile(path.join(root, "ordinary", name, "derived-progress.json"), JSON.stringify(result, null, 2) + "\n")
    runs.push({ name, totals: result.totals, sourceAccounting: result.sourceAccounting, providerTelemetry: result.providerTelemetry })
  }
  await writeFile(path.join(root, "ordinary-native-progress.json"), JSON.stringify({ schemaVersion: "ordinary-native-progress-summary/v1", providerCallsDuringAnalysis: 0, targetExecutionsDuringAnalysis: 0, comparisonMeaning: "Descriptive archived trajectories, not paired causal estimates", runs }, null, 2) + "\n")
  console.log(JSON.stringify(runs.map(r => ({ name: r.name, ...r.totals })), null, 2))
}
