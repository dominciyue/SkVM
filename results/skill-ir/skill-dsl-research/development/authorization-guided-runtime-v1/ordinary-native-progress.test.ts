import { expect, test } from "bun:test"
const api = await import("./ordinary-native-progress.ts").catch(() => ({} as any))
const evidence = { id: "ev-123abc", repository: "neutral", sourceRef: "fixed", path: "src/gate.ts", sha256: "original", startLine: 1, endLine: 1, text: '1 | return "中文";\n', quote: 'return "中文";', bytes: Buffer.byteLength('return "中文";') }
const work = (questionId: string, state: string, evidenceIds: string[] = []) => ({ id: "shared", questionId, state, evidenceIds, kind: "entry", origin: "question-duty" })
const request = (items: unknown[], windows: unknown[] = []) => ({ params: { messages: [{ role: "user", content: "Current local explanation context: " + JSON.stringify({ sourceWindows: windows, state: { worklist: items } }) }], system: "system中文", tools: [], maxTokens: 100 } })
const attempt = (id: string, req: any, toolCalls: unknown[] = []) => ({ id, status: "response", request: { messageCount: req.params.messages.length, messageCharacters: req.params.messages.reduce((n: number, m: any) => n + m.content.length, 0), toolNames: [], maxTokens: 100 }, response: { toolCalls }, usage: { input: 3, output: 2, cacheRead: 4, cacheWrite: 0 }, costUsd: null })
const trace = (requests: any[], toolCalls: any[][] = []) => ({ requests, attempts: requests.map((r, i) => attempt(`a${i + 1}`, r, toolCalls[i] ?? [])), events: requests.map((_, i) => ({ kind: "dispatch", attemptId: `a${i + 1}` })), evidence: [evidence], history: [], domain: { worklist: { items: [], actions: [] } }, sourceAccounting: { physicalReadBytes: 100 } })

test("counts actual UTF-8 source resends separately from serialized request fields and unchanged work", () => {
  expect(typeof api.nativeProgress).toBe("function")
  const requests = [request([work("q1", "awaiting-read")], [evidence]), request([work("q1", "awaiting-interpretation", [evidence.id])], [evidence]), request([work("q1", "awaiting-interpretation", [evidence.id])], [evidence])]
  const result = api.nativeProgress(trace(requests))
  expect(result.requests[0].bytes.serializedMessages).toBe(Buffer.byteLength(JSON.stringify(requests[0]!.params.messages)))
  expect(result.requests[0].bytes.messageContent).toBeGreaterThan(requests[0]!.params.messages[0]!.content.length)
  expect(result.requests[0].bytes.system).toBe(Buffer.byteLength("system中文"))
  expect(result.totals.modelSourceBytes).toBe(3 * evidence.bytes)
  expect(result.totals.resentSourceBytes).toBe(2 * evidence.bytes)
  expect(result.requests[1].worklist.transitions).toHaveLength(1)
  expect(result.requests[2].worklist.noStateProgressStreak).toBe(1)
  expect(result.requests[0].bytes.actualProviderPayload).toBeNull()
  expect(result.requests[0].sourceReads.physicalReadBytes).toBeNull()
})

test("joins dispatched attempts by ID rather than array position and refuses ambiguous missing bindings", () => {
  const r1 = request([]), r2 = request([]), t = trace([r1, r2], [[{ id: "c1", name: "source_read", arguments: {} }], []])
  t.attempts.reverse()
  t.history = [{ call: { id: "c1", name: "source_read", arguments: {} }, output: { evidence: [evidence] }, executed: true }] as any
  let result = api.nativeProgress(t)
  expect(result.requests[0].attemptId).toBe("a1")
  expect(result.requests[0].toolCalls.map((c: any) => c.id)).toEqual(["c1"])
  expect(result.requests[0].usage.fullPromptTokens).toBe(7)
  t.events = []
  result = api.nativeProgress(t)
  expect(result.requests.every((r: any) => r.attemptId === null)).toBe(true)
  expect(result.totals.unboundRequests).toBe(2)
  expect(result.unboundToolCalls).toHaveLength(1)
  t.events = [{ kind: "dispatch", attemptId: "a1" }]
  expect(api.nativeProgress(t).totals.unboundRequests).toBe(2)
})

test("keeps identical work IDs in different questions separate and does not invent attribution", () => {
  const r1 = request([work("q1", "awaiting-read"), work("q2", "awaiting-read")]), r2 = request([work("q1", "closed", [evidence.id]), work("q2", "awaiting-read")])
  const result = api.nativeProgress(trace([r1, r2]))
  expect(result.workItems).toHaveLength(2)
  expect(result.workItems.find((i: any) => i.questionId === "q1")).toMatchObject({ firstSeenRequest: 1, firstClosedRequest: 2, lastState: "closed", costAttribution: "shared-session-prefix" })
  expect(result.workItems.find((i: any) => i.questionId === "q2").firstClosedRequest).toBeNull()
  expect(result.requests[1].worklist.transitions.map((i: any) => i.questionId)).toEqual(["q1"])
})

test("counts submissions once and recurring checker diagnostics separately from distinct new errors", () => {
  const requests = [request([]), request([])], calls = [[{ id: "c1", name: "authorization_observe", arguments: {} }], [{ id: "c2", name: "authorization_check_result", arguments: {} }]], t = trace(requests, calls)
  const diagnostic = { code: "missing-source", path: "rules.q1.effect", message: "Read original source." }
  t.history = calls.flat().map((call, i) => ({ call, executed: true, output: { accepted: i ? [{ group: "rules", questionId: "q1", targetKey: "entry" }] : [], rejected: i ? [] : [{ group: "rules", questionId: "q1", targetKey: "effect", diagnostics: [diagnostic] }], diagnostics: [diagnostic] } })) as any
  const result = api.nativeProgress(t)
  expect(result.totals.acceptedUpdates).toBe(1)
  expect(result.totals.rejectedUpdates).toBe(1)
  expect(result.totals.distinctDiagnostics).toBe(1)
  expect(result.requests.map((r: any) => r.newDistinctDiagnostics)).toEqual([1, 0])
  expect(result.workItems).toEqual([])
})

test("legacy archives without request worklists retain unknown progress rather than a zero-stall claim", () => {
  const r = { params: { messages: [{ role: "user", content: "legacy prompt" }], tools: [], maxTokens: 100 } }, t = trace([r])
  const result = api.nativeProgress(t)
  expect(result.totals.worklistSnapshotRequests).toBe(0)
  expect(result.totals.maxNoStateProgressStreak).toBeNull()
  expect(result.totals.queueStateTransitions).toBeNull()
})
