import { createHash } from "node:crypto"

export const INCREMENTAL_INQUIRY_CONTEXT_GUIDE = "Current local explanation contexts carry contextSequence. A contextReference {sequence,path,sha256,bytes} denotes the EXACT unchanged JSON value previously transmitted at that contextSequence and property/index path. Retain that value from the conversation; the reference is transport state, not source evidence or a semantic annotation. Current focus, toolBudget and diagnostics remain explicit. Full original source remains available with source_read/source_structure. Do not invent omitted source meaning. Submit current propertyDemand.frontier fields incrementally before expanding unrelated source work; correct one named field while retaining the accepted draft."
export const PROGRAM_CONTEXT_TRANSPORT_GUIDE = "Packets carry contextSequence. contextReference {sequence,path,sha256,bytes} is the exact previously SENT value at that packet/path. sourceIndexDelta applies removed IDs, upsert entries, then order to its base contextReference; sha256 verifies the resulting full array. These are transport references, not evidence. Retain previously sent source and values; details catalog queries or source_read recover originals. A new child starts with a self-contained snapshot. Never infer omitted source meaning."

/** Lossless references to previously SENT context values. No semantic filtering,
 * source reachability or host-only values enter this transport projection. */
export function createInquiryContextEncoder(options: { sourceIndexDelta?: boolean } = {}) {
  let sequence = 0
  const cache = new Map<string, { sequence: number; path: Array<string | number>; sha256: string; bytes: number }>()
  const indexes = new Map<string, { rows: any[]; ref: { sequence: number; path: Array<string | number>; sha256: string; bytes: number } }>()
  return (input: unknown) => {
    const current = ++sequence; let references = 0
    const visit = (value: any, location: Array<string | number>): any => {
      const json = JSON.stringify(value)
      if (json === undefined) return value
      if (options.sourceIndexDelta && location.at(-1) === "sourceIndex" && Array.isArray(value) && value.every(v => typeof v?.id === "string") && new Set(value.map(v => v.id)).size === value.length) {
        const key = JSON.stringify(location), prior = indexes.get(key), sha256 = createHash("sha256").update(json).digest("hex")
        indexes.set(key, { rows: structuredClone(value), ref: { sequence: current, path: location, sha256, bytes: Buffer.byteLength(json) } })
        if (prior) {
          const old = new Map(prior.rows.map(v => [v.id, v])), ids = new Set(value.map(v => v.id))
          const removed = prior.rows.filter(v => !ids.has(v.id)).map(v => v.id), upsert = value.filter(v => JSON.stringify(old.get(v.id)) !== JSON.stringify(v))
          const naturalOrder = [...prior.rows.filter(v => ids.has(v.id)).map(v => v.id), ...upsert.filter(v => !old.has(v.id)).map(v => v.id)], order = value.map(v => v.id)
          references++
          return { sourceIndexDelta: { base: { contextReference: prior.ref }, removed, upsert, totalCount: value.length, ...(JSON.stringify(naturalOrder) === JSON.stringify(order) ? {} : { order }), sha256 } }
        }
        return structuredClone(value)
      }
      const bytes = Buffer.byteLength(json), explicit = location.length === 0 || location.length === 1 && ["focus", "toolBudget", "diagnostics", "state"].includes(String(location[0]))
      const digest = bytes >= 512 && !explicit ? createHash("sha256").update(json).digest("hex") : undefined
      if (digest) {
        const previous = cache.get(digest)
        // References never point to another value in the packet being built.
        if (previous && previous.sequence < current) { references++; return { contextReference: previous } }
        if (!previous) cache.set(digest, { sequence: current, path: location, sha256: digest, bytes })
      }
      if (Array.isArray(value)) return value.map((child, index) => visit(child, [...location, index]))
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child, [...location, key])]))
      return value
    }
    const context = { ...visit(input, []), contextSequence: current }
    return { context, sequence: current, references, originalBytes: Buffer.byteLength(JSON.stringify(input)), sentBytes: Buffer.byteLength(JSON.stringify(context)) }
  }
}

/** Offline reconstruction of the actual wire packets, including digest checks.
 * This performs no model call and never consults hidden host context. */
export function resolveInquiryContext(context: Record<string, any>, previous: Array<Record<string, any>>) {
  const resolve = (value: any, depth = 0): any => {
    if (depth > 256) throw new Error("context-reference-depth")
    if (value && typeof value === "object" && Object.keys(value).length === 1 && value.sourceIndexDelta) {
      const delta = value.sourceIndexDelta, base = resolve(delta.base, depth + 1)
      if (!Array.isArray(base) || !Array.isArray(delta.removed) || !Array.isArray(delta.upsert) || delta.order !== undefined && !Array.isArray(delta.order)) throw new Error("source-index-delta-invalid")
      const rows = new Map(base.map(v => [v.id, v]))
      for (const id of delta.removed) rows.delete(id)
      for (const row of delta.upsert) rows.set(row.id, row)
      const order = delta.order ?? [...rows.keys()]
      if (rows.size !== delta.totalCount || rows.size !== order.length || new Set(order).size !== rows.size || order.some((id: string) => !rows.has(id))) throw new Error("source-index-delta-order")
      const result = order.map((id: string) => rows.get(id))
      if (createHash("sha256").update(JSON.stringify(result)).digest("hex") !== delta.sha256) throw new Error("source-index-delta-digest")
      return result
    }
    if (value && typeof value === "object" && Object.keys(value).length === 1 && value.contextReference) {
      const ref = value.contextReference
      if (!Number.isSafeInteger(ref.sequence) || ref.sequence < 1 || ref.sequence >= context.contextSequence || !Array.isArray(ref.path)) throw new Error("context-reference-invalid")
      let prior: any = previous[ref.sequence - 1]
      for (const part of ref.path) prior = prior?.[part]
      if (prior === undefined) throw new Error("context-reference-missing")
      const restored = resolve(prior, depth + 1), json = JSON.stringify(restored)
      if (createHash("sha256").update(json).digest("hex") !== ref.sha256 || Buffer.byteLength(json) !== ref.bytes) throw new Error("context-reference-digest")
      return restored
    }
    if (Array.isArray(value)) return value.map(child => resolve(child, depth + 1))
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child, depth + 1)]))
    return value
  }
  return resolve(context) as Record<string, any>
}

type TransmissionComponents = { source: number; taskSkill: number; stateGap: number; schemaProtocol: number }
/** Rendering is a view: all original duties remain in the host and return in
 * the answer phase. Source meaning and question-owned bindings stay separate. */
export function projectInquiryQuestionContext<T extends { focus?: { stage?: string; questionId?: string }; questions?: Array<{ id: string }> }>(input: T): T {
  const questionId = input.focus?.stage === "answer" ? undefined : input.focus?.questionId
  if (!questionId) return input
  const value = input as T & Record<string, any>, projected: Record<string, any> = { ...value, originalQuestionIds: value.questions?.map((q: { id: string }) => q.id), scopeNotice: "Current question and its related source meaning only. All original questions and unresolved duties return in the answer phase. Retrieve original source or full syntax with source_read/source_structure." }
  for (const key of ["questions", "summaries", "branchCoverage", "gaps", "obligations", "questionProgress", "repairActions"]) if (Array.isArray(value[key])) projected[key] = value[key].filter((row: any) => key === "questions" ? row.id === questionId : !row.questionId || row.questionId === questionId)
  if (value.semanticCompletion) projected.semanticCompletion = { ...value.semanticCompletion, residuals: value.semanticCompletion.residuals?.filter((row: any) => row.questionId === questionId) }
  return projected as T
}
/** Measure exactly the serialized values sent at the account boundary. These
 * coarse byte categories are not a tokenizer or a causal protocol-cost model. */
export function createInquiryTransmissionMeter() {
  const samples: Array<{ sequence: number; kind: string; bytes: number; sha256: string; components: TransmissionComponents; repeatedBytes: number; repeatedParts: number; sourceRanges: Array<{ path: string; startLine: number; endLine: number }>; actions: string[] }> = []
  const seen = new Set<string>()
  const digest = (text: string) => createHash("sha256").update(text).digest("hex")
  const classify = (key: string): keyof TransmissionComponents | undefined =>
    /^(sourceSkeleton|sourceText|sourceExcerpt|sourceWindows|sourceStatements|relatedPropertySources|evidence|quote|content)$/.test(key) ? "source" :
    /^(questions|originalQuestions|questionFacts|request|brief|policy|premises|naturalTask|skill)$/.test(key) ? "taskSkill" :
    /^(schemaVersion|inputSchema|sourceEdit|template|contract|fields|instruction|predicateGuide)$/.test(key) ? "schemaProtocol" : undefined
  const record = (kind: string, payload: unknown, text = JSON.stringify(payload), category?: keyof TransmissionComponents) => {
    const components: TransmissionComponents = { source: 0, taskSkill: 0, stateGap: 0, schemaProtocol: 0 }, ranges = new Map<string, { path: string; startLine: number; endLine: number }>(), actions = new Set<string>()
    let repeatedBytes = 0, repeatedParts = 0
    const newlySeen = new Set<string>()
    const count = (json: string, group: keyof TransmissionComponents) => {
      const bytes = Buffer.byteLength(json); components[group] += bytes
      if (bytes >= 128) { const key = `${group}:${digest(json)}`; if (seen.has(key)) { repeatedBytes += bytes; repeatedParts++ } else newlySeen.add(key) }
    }
    const metadata = (value: any) => {
      if (!value || typeof value !== "object") return
      if (typeof value.path === "string" && Number.isSafeInteger(value.startLine) && Number.isSafeInteger(value.endLine)) ranges.set(`${value.path}:${value.startLine}:${value.endLine}`, { path: value.path, startLine: value.startLine, endLine: value.endLine })
      if (value.nextAction?.kind) actions.add(value.nextAction.kind)
      if (value.focus?.stage) actions.add(value.focus.stage)
      for (const child of Object.values(value)) metadata(child)
    }
    const visit = (value: any, group?: keyof TransmissionComponents) => {
      const json = JSON.stringify(value); if (json === undefined) return 0
      if (group || !value || typeof value !== "object") { count(json, group ?? "stateGap"); return Buffer.byteLength(json) }
      let childBytes = 0
      for (const [key, child] of Object.entries(value)) childBytes += visit(child, Array.isArray(value) ? undefined : value.kind === "skill-guidance" && key === "content" ? "taskSkill" : classify(key))
      components.schemaProtocol += Buffer.byteLength(json) - childBytes
      return Buffer.byteLength(json)
    }
    metadata(payload)
    const serializedBytes = visit(payload, category)
    components.schemaProtocol += Buffer.byteLength(text) - serializedBytes
    for (const key of newlySeen) seen.add(key)
    samples.push({ sequence: samples.length + 1, kind, bytes: Buffer.byteLength(text), sha256: digest(text), components, repeatedBytes, repeatedParts, sourceRanges: [...ranges.values()], actions: [...actions] })
  }
  const recordSystem = (system: string, skill: string) => {
    const before = samples.length
    record("system", system, JSON.stringify(system), "schemaProtocol")
    const sample = samples[before]!, skillBytes = Buffer.byteLength(skill)
    sample.bytes = Buffer.byteLength(system); sample.sha256 = digest(system); sample.components = { source: 0, taskSkill: skillBytes, stateGap: 0, schemaProtocol: sample.bytes - skillBytes }
    sample.repeatedBytes = 0; sample.repeatedParts = 0
  }
  return { record, recordSystem, report: () => ({ schemaVersion: "authorization-transmission-accounting/v1", boundary: "official-account-static-tools-and-sent-envelopes", exactUtf8Bytes: true, exactComponentTokens: null, classification: "Disjoint coarse JSON field categories; JSON framing and host instructions are schemaProtocol. Skill bytes are exact. No archive domain is measured.", samples: structuredClone(samples) }) }
}
