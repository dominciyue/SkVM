import { z } from "zod"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"

const RepairRequest = z.object({ schemaVersion: z.literal("authorization-author-draft-repair/v1"), reason: z.string().trim().min(1),
  operations: z.array(z.object({ path: z.string().min(1), value: z.string().trim().min(1) }).strict()).min(1),
}).strict()
type Diagnostic = { code: string; path: string; message: string }
const pointer = (parts: Array<string | number>) => `/${parts.map(part => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
const getRecord = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** Only registered reference leaves can be repaired as a format/reference correction. */
export function draftRepairPaths(candidate: unknown, diagnostics: readonly { path: string; schemaPath?: string }[]): string[] {
  const root = getRecord(candidate), contract = getRecord(root?.analysisContract), scenarios = getRecord(contract?.scenarios)
  if (!scenarios) return []
  const leaves: Array<{ dotted: string; pointer: string }> = []
  for (const [name, raw] of Object.entries(scenarios)) {
    const scenario = getRecord(raw)
    for (const [index, value] of (Array.isArray(scenario?.premises) ? scenario.premises : []).entries()) if (getRecord(value) && Object.hasOwn(value, "atEntry")) {
      const parts = ["analysisContract", "scenarios", name, "premises", index, "atEntry"]
      leaves.push({ dotted: parts.join("."), pointer: pointer(parts) })
    }
    for (const [branchIndex, branch] of (Array.isArray(scenario?.requestedBranches) ? scenario.requestedBranches : []).entries()) {
      const assumptions = getRecord(branch)?.assumptions
      for (const [index, value] of (Array.isArray(assumptions) ? assumptions : []).entries()) if (getRecord(value) && Object.hasOwn(value, "condition")) {
        const parts = ["analysisContract", "scenarios", name, "requestedBranches", branchIndex, "assumptions", index, "condition"]
        leaves.push({ dotted: parts.join("."), pointer: pointer(parts) })
      }
    }
  }
  const matched = new Set<string>()
  for (const diagnostic of diagnostics) for (const leaf of leaves) if (diagnostic.path === leaf.dotted || diagnostic.schemaPath === leaf.pointer) matched.add(leaf.pointer)
  return leaves.filter(leaf => matched.has(leaf.pointer)).map(leaf => leaf.pointer)
}

const bad = (code: string, path: string, message: string): Diagnostic => ({ code, path, message })
const safeParts = (value: string): string[] | undefined => {
  if (!value.startsWith("/")) return undefined
  const parts = value.slice(1).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"))
  if (parts.some(part => !part || ["__proto__", "prototype", "constructor"].includes(part))) return undefined
  return parts
}
const targetFor = (root: unknown, parts: string[]): Record<string, unknown> | undefined => {
  let cursor: unknown = root
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      if (!/^(0|[1-9]\d*)$/.test(part)) return undefined
      cursor = cursor[Number(part)]
    } else {
      const record = getRecord(cursor)
      if (!record || !Object.hasOwn(record, part)) return undefined
      cursor = record[part]
    }
  }
  const record = getRecord(cursor)
  return record && Object.hasOwn(record, parts.at(-1)!) ? record : undefined
}

export function applyAuthorizationDraftRepair(candidate: unknown, allowedPaths: readonly string[], request: unknown) {
  const parsed = RepairRequest.safeParse(request)
  if (!parsed.success) return { status: "needs-input" as const, diagnostics: parsed.error.issues.map(issue => bad("draft-repair-schema-invalid", issue.path.join(".") || "$", issue.message)), draft: structuredClone(candidate), changedPaths: [] }
  const diagnostics: Diagnostic[] = [], seen = new Set<string>(), allowed = new Set(allowedPaths)
  const draft = structuredClone(candidate)
  const planned: Array<{ path: string; target: Record<string, unknown>; key: string; value: string }> = []
  for (const operation of parsed.data.operations) {
    const parts = safeParts(operation.path)
    if (!parts || !["atEntry", "condition"].includes(parts.at(-1)!)) { diagnostics.push(bad("draft-repair-path-not-allowed", operation.path, "Only diagnosed entry and condition reference leaves may be repaired.")); continue }
    if (!allowed.has(operation.path)) { diagnostics.push(bad("draft-repair-path-not-allowed", operation.path, "Path was not in the registered diagnostic scope.")); continue }
    if (seen.has(operation.path)) { diagnostics.push(bad("duplicate-draft-repair", operation.path, "This field was assigned twice.")); continue }
    seen.add(operation.path)
    const target = targetFor(draft, parts)
    if (!target) { diagnostics.push(bad("draft-repair-target-missing", operation.path, "Declared field is absent; no object or array is created.")); continue }
    planned.push({ path: operation.path, target, key: parts.at(-1)!, value: operation.value })
  }
  if (diagnostics.length) return { status: "needs-input" as const, diagnostics, draft: structuredClone(candidate), changedPaths: [] }
  for (const operation of planned) operation.target[operation.key] = operation.value
  const normalized = normalizeAuthorizationAuthoringInput(draft)
  if (normalized.status !== "ready") return { status: "needs-input" as const, diagnostics: normalized.diagnostics.map(item => bad(item.code, item.path, item.message)), draft, changedPaths: planned.map(item => item.path) }
  return { status: "ready" as const, diagnostics: [] as Diagnostic[], value: draft, changedPaths: planned.map(item => item.path) }
}
