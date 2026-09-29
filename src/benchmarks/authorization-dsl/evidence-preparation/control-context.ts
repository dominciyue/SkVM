import { createHash } from "node:crypto"
import type { DiscoverySymbol } from "./discovery.ts"
import { evidenceLocationId, type EvidenceLocationContext, type EvidenceLocationRange } from "./location-selection.ts"
import type { AuthorizationControlContextReport } from "./schema.ts"
import { mergeSourceRanges, packSourceSegments, physicalSourceLines } from "./segments.ts"

export interface ControlContextRange extends EvidenceLocationRange { origins: string[] }
const portable = (file: string) => !!file && !/[\\\0]/.test(file) && !/^(?:[A-Za-z]:|\/)/.test(file) && file.split("/").every(p => p && p !== "." && p !== "..")
const coordinates = ({ path, startLine, endLine }: EvidenceLocationRange): EvidenceLocationRange => ({ path, startLine, endLine })
const ordered = (a: EvidenceLocationRange, b: EvidenceLocationRange) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.startLine - b.startLine || a.endLine - b.endLine

function union(ranges: ControlContextRange[]): ControlContextRange[] {
  return [...new Set(ranges.map(r => r.path))].sort().flatMap(path => mergeSourceRanges(ranges.filter(r => r.path === path).map(r => ({ originalStartLine: r.startLine, originalEndLine: r.endLine, origins: r.origins })))
    .map(r => ({ path, startLine: r.originalStartLine, endLine: r.originalEndLine, origins: r.origins })))
}

/** Exact complement within a known unit. No indentation/keyword guesses for omitted control blocks. */
function omitted(unit: EvidenceLocationRange, ranges: ControlContextRange[]): EvidenceLocationRange[] {
  let next = unit.startLine
  const missing: EvidenceLocationRange[] = []
  for (const range of union(ranges).filter(r => r.path === unit.path && r.endLine >= unit.startLine && r.startLine <= unit.endLine)) {
    if (range.startLine > next) missing.push({ path: unit.path, startLine: next, endLine: range.startLine - 1 })
    next = Math.max(next, range.endLine + 1)
  }
  if (next <= unit.endLine) missing.push({ path: unit.path, startLine: next, endLine: unit.endLine })
  return missing
}

/** Expand only host-bound, uniquely enclosing callables. Original ranges have first claim on the budget. */
export function buildControlContext(input: {
  selected: ControlContextRange[]; units: DiscoverySymbol[]; sources: EvidenceLocationContext["sources"];
  allowedFiles: string[]; sourceIdentity: EvidenceLocationContext["sourceIdentity"]; maxBytes: number
}): { ranges: ControlContextRange[]; report: AuthorizationControlContextReport } {
  if (input.allowedFiles.some(file => !portable(file)) || new Set(input.allowedFiles).size !== input.allowedFiles.length) throw new Error("Unsafe context allowlist")
  if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 65536) throw new Error("Context budget must be 1..65536 bytes")
  const sources = new Map(input.sources.map(source => [source.path, source]))
  for (const source of input.sources) if (!input.allowedFiles.includes(source.path) || createHash("sha256").update(source.content).digest("hex") !== source.sha256) throw new Error("Context source digest/allowlist mismatch")
  const bytes = (ranges: ControlContextRange[]) => [...new Set(ranges.map(r => r.path))].reduce((sum, path) => sum + packSourceSegments(sources.get(path)!.content,
    ranges.filter(r => r.path === path).map(r => ({ originalStartLine: r.startLine, originalEndLine: r.endLine, origins: r.origins }))).bytes, 0)
  for (const range of input.selected) if (!input.allowedFiles.includes(range.path) || !sources.has(range.path) || range.endLine > physicalSourceLines(sources.get(range.path)!.content).length) throw new Error("Selected context range unavailable")
  let ranges = union(input.selected)
  if (bytes(ranges) > input.maxBytes) throw new Error("Selected ranges exceed context budget")
  const report: AuthorizationControlContextReport = { strategy: "callable-v1", selected: structuredClone(input.selected).sort(ordered), units: [], expansions: [], finalBytes: bytes(ranges), maxBytes: input.maxBytes }
  const candidates = new Map<string, { unit: DiscoverySymbol; triggers: EvidenceLocationRange[] }>()
  for (const selection of report.selected) {
    const matches = input.units.filter(unit => unit.kind === "function" && unit.path === selection.path && unit.startLine <= selection.startLine && unit.endLine >= selection.endLine)
      .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))
    const unit = matches[0], peers = unit ? matches.filter(u => u.endLine - u.startLine === unit.endLine - unit.startLine) : []
    if (!unit || peers.length !== 1 || unit.boundary !== "complete") {
      const range = unit ? coordinates(unit) : coordinates(selection)
      report.units.push({ ...range, id: unit?.id ?? `range:${selection.path}:${selection.startLine}-${selection.endLine}`, status: "range-uncertain", triggers: [coordinates(selection)], omitted: [] })
      continue
    }
    const source = sources.get(unit.path)!
    if (unit.id !== evidenceLocationId("symbol", input.sourceIdentity, unit) || unit.sha256 !== source.sha256) throw new Error("Context unit source identity/digest mismatch")
    const previous = candidates.get(unit.id)
    if (previous) previous.triggers.push(coordinates(selection))
    else candidates.set(unit.id, { unit, triggers: [coordinates(selection)] })
  }
  const fullRange = (unit: DiscoverySymbol): ControlContextRange => ({ ...coordinates(unit), origins: [`host-context:${unit.id}`] })
  const additions = [...candidates.values()].sort((a, b) => (bytes(union([...ranges, fullRange(a.unit)])) - bytes(ranges)) - (bytes(union([...ranges, fullRange(b.unit)])) - bytes(ranges)) || ordered(a.unit, b.unit))
  for (const { unit, triggers } of additions) {
    const proposed = union([...ranges, fullRange(unit)])
    if (bytes(proposed) <= input.maxBytes) {
      report.expansions.push(...omitted(unit, ranges).map(range => ({ ...range, unitId: unit.id, origin: "host-context" as const })))
      ranges = proposed
    }
    const missing = omitted(unit, ranges)
    report.units.push({ ...coordinates(unit), id: unit.id, status: missing.length ? "unit-partial" : "unit-complete", triggers, omitted: missing })
  }
  report.units.sort(ordered); report.expansions.sort(ordered); report.finalBytes = bytes(ranges)
  return { ranges, report }
}
