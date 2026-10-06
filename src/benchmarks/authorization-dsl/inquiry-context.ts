import { createHash } from "node:crypto"

export const INCREMENTAL_INQUIRY_CONTEXT_GUIDE = "Current local explanation contexts carry contextSequence. A contextReference {sequence,path,sha256,bytes} denotes the EXACT unchanged JSON value previously transmitted at that contextSequence and property/index path. Retain that value from the conversation; the reference is transport state, not source evidence or a semantic annotation. Current focus, toolBudget and diagnostics remain explicit. Full original source remains available with source_read/source_structure. Do not invent omitted source meaning. Submit current propertyDemand.frontier fields incrementally before expanding unrelated source work; correct one named field while retaining the accepted draft."

/** Lossless references to previously SENT context values. No semantic filtering,
 * source reachability or host-only values enter this transport projection. */
export function createInquiryContextEncoder() {
  let sequence = 0
  const cache = new Map<string, { sequence: number; path: Array<string | number>; sha256: string; bytes: number }>()
  return (input: unknown) => {
    const current = ++sequence; let references = 0
    const visit = (value: any, location: Array<string | number>): any => {
      const json = JSON.stringify(value)
      if (json === undefined) return value
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
