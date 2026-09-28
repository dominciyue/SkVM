import type { PreparedSourceSegment } from "./schema.ts"

export interface OriginalSourceRange { originalStartLine: number; originalEndLine: number; origins: string[] }
export const physicalSourceLines = (content: string): string[] => content.match(/[^\n]*\n|[^\n]+$/g) ?? []

/** Canonical ordered union; adjacent ranges have no omitted line and can share a segment. */
export function mergeSourceRanges(ranges: OriginalSourceRange[]): OriginalSourceRange[] {
  const merged: OriginalSourceRange[] = []
  for (const range of [...ranges].sort((a, b) => a.originalStartLine - b.originalStartLine || a.originalEndLine - b.originalEndLine)) {
    if (!Number.isInteger(range.originalStartLine) || !Number.isInteger(range.originalEndLine) || range.originalStartLine < 1 || range.originalEndLine < range.originalStartLine || !range.origins.length) throw new Error("Invalid original source range")
    const previous = merged.at(-1)
    if (previous && range.originalStartLine <= previous.originalEndLine + 1) {
      previous.originalEndLine = Math.max(previous.originalEndLine, range.originalEndLine)
      previous.origins = [...new Set([...previous.origins, ...range.origins])]
    } else merged.push({ ...range, origins: [...new Set(range.origins)] })
  }
  return merged
}

export function packSourceSegments(content: string, ranges: OriginalSourceRange[]): { content: string; segments: PreparedSourceSegment[]; bytes: number } {
  const lines = physicalSourceLines(content), pieces: string[] = [], segments: PreparedSourceSegment[] = []
  let snapshotLine = 1
  for (const range of mergeSourceRanges(ranges)) {
    if (range.originalEndLine > lines.length) throw new Error("Original source range exceeds physical lines")
    const count = range.originalEndLine - range.originalStartLine + 1
    pieces.push(lines.slice(range.originalStartLine - 1, range.originalEndLine).join(""))
    segments.push({ ...range, snapshotStartLine: snapshotLine, snapshotEndLine: snapshotLine + count - 1 })
    snapshotLine += count
  }
  const snapshot = pieces.join("")
  return { content: snapshot, segments, bytes: Buffer.byteLength(snapshot, "utf8") }
}

/** Verify coordinates against actual snapshot lines. This is mechanical provenance, not source semantics. */
export function validateSourceSegments(content: string, segments: PreparedSourceSegment[]): string[] {
  const errors: string[] = []
  let nextSnapshot = 1, previousOriginal = 0
  if (!segments.length) errors.push("missing-segments")
  for (const segment of segments) {
    const values = [segment.originalStartLine, segment.originalEndLine, segment.snapshotStartLine, segment.snapshotEndLine]
    if (values.some(v => !Number.isInteger(v) || v < 1) || segment.originalStartLine <= previousOriginal || segment.originalEndLine < segment.originalStartLine || segment.snapshotStartLine !== nextSnapshot || segment.snapshotEndLine - segment.snapshotStartLine !== segment.originalEndLine - segment.originalStartLine || !segment.origins.length) errors.push("invalid-segment-coordinates")
    nextSnapshot = segment.snapshotEndLine + 1
    previousOriginal = segment.originalEndLine
  }
  if (nextSnapshot - 1 !== physicalSourceLines(content).length) errors.push("snapshot-line-count-mismatch")
  return errors
}

export function containsOriginalRange(segments: PreparedSourceSegment[], start: number, end: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && end >= start && segments.some(segment => start >= segment.originalStartLine && end <= segment.originalEndLine)
}
