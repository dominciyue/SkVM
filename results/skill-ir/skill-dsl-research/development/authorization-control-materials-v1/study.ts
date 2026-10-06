import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { runAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-run.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { lowerSourceInterpretation } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { createSourceMaterials } from "../../../../../src/task-dsl/authorization/source-materials.ts"
import { sourceRelationRevision } from "../../../../../src/benchmarks/authorization-dsl/operation-work.ts"
import { emptyTokenUsage } from "../../../../../src/core/types.ts"
import { runCodexAccountSession } from "../../../../../src/adapters/codex-account-session.ts"

const root = import.meta.dir, av = path.resolve(root, "../authorization-source-assisted-closure-v1")
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex")
const save = async (name: string, value: unknown) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), JSON.stringify(value, null, 2) + "\n", "utf8") }
const cases = [{ id: "download", position: "debug-paperless-download-D1/revision-module-instances", input: "paperless-download-original.json" }, { id: "owui", position: "debug-owui-ingestion-D1/revision-module-instances-wire", input: "owui-ingestion-original.json" }]
function oldSkeleton(run: any, source: any) {
  for (const r of run.requests) for (const m of r.params.messages) {
    const prefix = "Current local explanation context: ", start = m.content.lastIndexOf(prefix); if (start < 0) continue
    try { const c = JSON.parse(m.content.slice(start + prefix.length).split("\n\nRemaining dispatches:")[0]); const s = c.tasks?.map((t: any) => t.sourceSkeleton).find((s: any) => s?.sourceId === source.id); if (s) return s } catch { /* Non-context messages are not source skeletons. */ }
  }
}
async function offline(revision?: string) {
  if (revision && revision !== "compact-source-metadata") throw new Error("Unknown offline revision")
  if (revision) {
    const prior = JSON.parse(await readFile(path.join(root, "evaluations/offline-summary.json"), "utf8"))
    const file = path.join(root, "evaluations/context-before-compaction.json")
    await writeFile(file, JSON.stringify({ schemaVersion: "authorization-aw-context-comparison/v1", outcomes: prior.outcomes.map((o: any) => ({ id: o.id, actualRequestComparison: o.actualRequestComparison })), kind: "offline-pre-compaction", modelEffect: "not-measured" }, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  }
  const outcomes: any[] = []
  for (const c of cases) {
    const rawPath = path.join(av, "positions", c.position, "raw/inquiry-run.json.gz"), bytes = await readFile(rawPath), original = JSON.parse(gunzipSync(bytes).toString("utf8")), loaded = await loadInquiryInput(path.join(av, "model/inputs", c.input))
    const result: any = { id: c.id, kind: "offline-original-replay", rawPath: path.relative(path.resolve(root, "../../../../.."), rawPath).replaceAll("\\", "/"), rawSha256: sha(bytes), inputSha256: loaded.inputSha256, realModelCalls: 0, targetExecutions: 0, currentModelEffect: "not-measured", historicalMaterials: original.domain.operationFacts.facts.length, retainedHelperCount: original.domain.semantic.units.length }
    const replays: any[] = []
    for (const strategy of ["operation-evidence-v2", "operation-evidence-v3"] as const) {
      let cursor = 0
      const run = await runAuthorizationInquiry({ ...loaded.context, ...{ brief: loaded.value.brief, mode: loaded.value.mode, policy: loaded.value.policy }, strategy, method: "D1", maxDispatches: 24, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432,
        provider: { name: "offline-av-replay", complete: async () => { const response = original.attempts[cursor++]?.response; return response ? { ...structuredClone(response), tokens: emptyTokenUsage(), costUsd: undefined, durationMs: 0 } : { text: "", toolCalls: [], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "end_turn" } }, completeWithToolResults: async () => { throw new Error("not-a-provider-path") } } })
      const raw = gzipSync(JSON.stringify(run)), rawPath = path.join("attempts", `${c.id}-${strategy}`, ...(revision ? [`revision-${revision}`] : []), "raw/replay.json.gz").replaceAll("\\", "/")
      await mkdir(path.dirname(path.join(root, rawPath)), { recursive: true }); await writeFile(path.join(root, rawPath), raw)
      replays.push({ strategy, ...(revision ? { revision } : {}), rawPath, status: run.status, requestCount: run.requests.length, serializedRequestBytes: run.requests.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r.params)), 0), sourceAccounting: run.sourceAccounting, originalQuestionCount: original.inquiry.questions.length, currentQuestionCount: run.inquiry?.questions.length, materialCount: run.domain?.sourceMaterials?.materials.length ?? 0, sourceUnits: run.domain?.semantic?.units.length ?? 0, rawSha256: sha(raw), diagnostics: [...new Set(run.domain?.currentRejections.map((d: any) => d.code) ?? [])], semanticComparison: "Exact historical response bytes; stale current IDs are not repaired by this replay; no success/quality promotion." })
    }
    result.actualRequestComparison = { historicalSerializedRequestBytes: original.requests.reduce((n: number, r: any) => n + Buffer.byteLength(JSON.stringify(r.params)), 0), replays }
    const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", maxToolCalls: 64, maxReadBytes: 33554432 })
    const oldUnit = original.domain.semantic.units[0], source = tools.structure!.symbols.find(s => s.path === oldUnit.source.path && s.sha256 === oldUnit.source.sha256 && s.startLine === oldUnit.source.startLine && s.endLine === oldUnit.source.endLine)!
    if (!source) throw new Error(`original-source-unavailable:${c.id}`)
    const began = Date.now(); await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const current = (await tools.sourceSkeleton(source.id, source.className))!, previous = oldSkeleton(original, oldUnit.source)
    if (!previous) throw new Error(`old-skeleton-unavailable:${c.id}`)
    const anchors = new Map(previous.anchors.flatMap((a: any) => { const found = current.anchors.filter(n => n.kind === a.kind && n.text === a.text && n.selector.path === a.selector.path && n.selector.startLine === a.selector.startLine && n.selector.endLine === a.selector.endLine); return found.length === 1 ? [[a.id, found[0]!.id]] : [] }))
    const rebind = (v: any): any => typeof v === "string" ? anchors.get(v) ?? v : Array.isArray(v) ? v.map(rebind) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebind(x)])) : v
    const draft = structuredClone(original.domain.focus.sourceDrafts.find((d: any) => d.handle === oldUnit.handle).interpretation)
    const raw = { ...rebind(draft), revision: current.revision }
    const lowered = lowerSourceInterpretation(current, raw, { index: tools.structure, itemId: oldUnit.itemId, handle: oldUnit.handle, questionId: oldUnit.questionId, role: oldUnit.role })
    result.freshValidation = { interpretationSource: "revalidated-original", elapsedMs: Date.now() - began, sourceBytesRead: tools.ioReadBytes, matchedAnchors: anchors.size, historicalAnchors: previous.anchors.length, diagnostics: lowered.diagnostics, finiteRegions: current.flow.map(f => f.kind), locatedGaps: current.gaps.map(g => ({ code: g.code, selector: g.selector })), oldReportChanged: false }
    if (lowered.unit) {
      const unit: any = { ...lowered.unit, questionId: oldUnit.questionId, evidenceIds: tools.evidence.map(e => e.id), source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, receiverClass: source.className }
      const store = createSourceMaterials({ ...tools.identity, semanticVersion: "finite-control/v1" }), accept = (u: any, provenance: "test-authored" | "revalidated-original") => store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:${u.receiverClass ?? ""}`, revision: sourceRelationRevision(tools.structure!, u.source.id, u.receiverClass)! }], provenance)
      accept(unit, "revalidated-original")
      const program = compileAuthorizationInquiry(original.inquiry), helperOnly = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v3", sourceAssisted: true, initialSourceMaterials: store.snapshot(), initialSemanticUnits: [unit] })
      result.freshValidation.materialsSaved = helperOnly.report().sourceMaterials?.materials.filter(m => m.current).length
      result.freshValidation.materialRecords = helperOnly.report().sourceMaterials?.materials.length
      result.freshValidation.materialsUsed = helperOnly.report().materialUses?.length
      await helperOnly.close()
      if (c.id === "download") {
        const entry = tools.structure!.symbols.find(s => s.path === source.path && s.name === "download" && s.className === source.className)!
        await tools.execute("source_read", { path: entry.path, startLine: entry.startLine, endLine: entry.endLine }); const s = (await tools.sourceSkeleton(entry.id, entry.className))!
        const annotated = lowerSourceInterpretation(s, { schemaVersion: "source-interpretation/v1", revision: s.revision, annotations: s.anchors.filter(a => ["call", "return", "raise"].includes(a.kind) || a.kind === "parameter" && a.name !== "self").map(a => ({ anchorId: a.id, role: a.kind === "call" ? "permission" : a.name === "request" ? "principal" : a.name === "pk" ? "resource" : "context", explanation: "TEST-AUTHORED host integration from actual Download wrapper; not a model success", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "operation" } : {}) })), unresolved: [] }, { index: tools.structure, itemId: "test-download-entry", handle: "test-download-entry", questionId: oldUnit.questionId, role: "entry" })
        if (!annotated.unit) throw new Error("test-wrapper-interpretation-failed")
        const entryUnit: any = { ...annotated.unit, source: { id: entry.id, path: entry.path, sha256: entry.sha256, startLine: entry.startLine, endLine: entry.endLine }, receiverClass: entry.className, questionId: oldUnit.questionId, evidenceIds: tools.evidence.map(e => e.id) }
        accept(entryUnit, "test-authored")
        const bound = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v3", sourceAssisted: true, initialSourceMaterials: store.snapshot(), initialSemanticUnits: [unit, entryUnit] })
        result.testAuthoredConnection = { interpretationSource: "test-authored", uses: bound.report().materialUses, sourceMaterialCount: bound.report().sourceMaterials?.materials.filter(m => m.current).length, provenance: bound.report().sourceMaterials?.materials.filter(m => m.current).map(m => m.interpretationSource), remainingGaps: bound.report().slice.rules.filter(r => r.kind === "unresolved").map(r => r.gap), modelSuccess: false }
        await bound.close()
      }
    }
    outcomes.push(result); await save(`evaluations/${c.id}-offline.json`, result)
  }
  await save("evaluations/offline-summary.json", { schemaVersion: "authorization-aw-offline/v1", outcomes, thirdPartyApiCalls: 0, accountInferenceCalls: 0, targetExecutions: 0, rawOriginalsUntouched: true })
  console.log(JSON.stringify(outcomes.map(o => ({ id: o.id, freshDiagnostics: o.freshValidation.diagnostics.map((d: any) => d.code), materialsSaved: o.freshValidation.materialsSaved, testUses: o.testAuthoredConnection?.uses?.length, requests: o.actualRequestComparison.replays.map((r: any) => r.requestCount) }))))
}
async function replay() {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), hashes: any[] = [], raws: any[] = []
  for (const item of manifest.sourceAttempts) {
    const base = path.join(av, "positions", item.position)
    for (const [file, expected] of [["report.json", item.reportSha256], [item.rawFile ?? "raw/inquiry-run.json.gz", item.rawSha256], ["final.txt", item.finalSha256]]) {
      const actual = sha(await readFile(path.join(base, file)))
      hashes.push({ position: item.position, file, expected, actual, unchanged: actual === expected })
    }
    if (item.input) { const actual = sha(await readFile(path.join(av, "model/inputs", item.input))); hashes.push({ position: item.position, file: item.input, expected: item.inputSha256, actual, unchanged: actual === item.inputSha256 }) }
  }
  for (const name of ["evaluations/context-before-compaction.json", "evaluations/offline-summary.json"]) {
    const data = JSON.parse(await readFile(path.join(root, name), "utf8"))
    for (const item of data.outcomes) for (const retained of item.actualRequestComparison.replays) {
      const file = retained.rawPath ?? `attempts/${item.id}-${retained.strategy}/raw/replay.json.gz`, bytes = await readFile(path.join(root, file)), raw = JSON.parse(gunzipSync(bytes).toString("utf8"))
      const requestBytes = raw.requests.reduce((n: number, r: any) => n + Buffer.byteLength(JSON.stringify(r.params)), 0)
      const mockTokens = raw.attempts.reduce((n: number, a: any) => n + Object.values(a.response?.tokens ?? {}).reduce((s: number, v: any) => s + Number(v), 0), 0)
      raws.push({ file, rawSha256: sha(bytes), expectedSha256: retained.rawSha256, status: raw.status, requests: raw.requests.length, requestBytes, mockTokens, matched: sha(bytes) === retained.rawSha256 && raw.status === retained.status && raw.requests.length === retained.requestCount && requestBytes === retained.serializedRequestBytes && mockTokens === 0 })
    }
  }
  const account = JSON.parse(await readFile(path.join(root, "verification/account-boundary.json"), "utf8"))
  const accountSafe = account.status === "unavailable" && account.inferenceDispatched === false && account.usage === null && account.actualUsd === null && account.providerRequests === null && !account.events.some((e: any) => ["thread/start", "turn/start"].includes(e.method))
  const result = { schemaVersion: "authorization-aw-replay/v1", status: hashes.every(h => h.unchanged) && raws.every(r => r.matched) && accountSafe ? "verified" : "invalid", protectedOriginals: hashes, offlineArchives: raws, accountSafe, inferenceDispatches: 0, targetExecutions: 0, modelEffect: "not-measured" }
  await save("verification/final-replay.json", result)
  if (result.status !== "verified") throw new Error("AW retained artifact verification failed")
  console.log(JSON.stringify({ status: result.status, protectedFiles: hashes.length, offlineArchives: raws.length, accountSafe }))
}
if (process.argv[2] === "offline") await offline(process.argv[3]?.replace(/^--revision=/, ""))
else if (process.argv[2] === "account-check") { const account = await runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: root, system: "Anonymous bounded capability check", prompt: "Read only registered anonymous data.", tools: [{ name: "anonymous_read", description: "Read anonymous constant", inputSchema: { type: "object", properties: {}, additionalProperties: false } }], execute: async () => ({ output: "anonymous", exitCode: 0, durationMs: 0 }), timeoutMs: 30000 }); await save("verification/account-boundary.json", account); console.log(JSON.stringify({ status: account.status, reason: account.reason, inferenceDispatched: account.inferenceDispatched })) }
else if (process.argv[2] === "replay") await replay()
else throw new Error("Use offline, account-check or replay; real positions require verified public exclusive tool inventory. Internal provider request counts remain unknown.")
