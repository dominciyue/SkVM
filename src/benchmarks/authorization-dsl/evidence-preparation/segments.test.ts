import { expect, test } from "bun:test"
import { mergeSourceRanges, packSourceSegments, validateSourceSegments } from "./segments.ts"

test("merges overlapping and adjacent ranges in stable original order with deduplicated origins", () => {
  expect(mergeSourceRanges([
    { originalStartLine: 900, originalEndLine: 902, origins: ["late"] },
    { originalStartLine: 12, originalEndLine: 14, origins: ["b"] },
    { originalStartLine: 10, originalEndLine: 12, origins: ["a"] },
    { originalStartLine: 15, originalEndLine: 15, origins: ["b"] },
  ])).toEqual([
    { originalStartLine: 10, originalEndLine: 15, origins: ["a", "b"] },
    { originalStartLine: 900, originalEndLine: 902, origins: ["late"] },
  ])
})

test("packs distant 10-12 and 900-902 without any intervening bytes and maps original lines", () => {
  const source = Array.from({ length: 1000 }, (_, i) => `${i + 1}:😀\r\n`).join("")
  const result = packSourceSegments(source, [
    { originalStartLine: 10, originalEndLine: 12, origins: ["entry"] },
    { originalStartLine: 900, originalEndLine: 902, origins: ["helper"] },
  ])
  expect(result.content).toBe("10:😀\r\n11:😀\r\n12:😀\r\n900:😀\r\n901:😀\r\n902:😀\r\n")
  expect(result.bytes).toBe(Buffer.byteLength(result.content))
  expect(result.bytes).toBeGreaterThan(result.content.length)
  expect(result.segments.map(s => [s.snapshotStartLine, s.snapshotEndLine])).toEqual([[1, 3], [4, 6]])
  expect(validateSourceSegments(result.content, result.segments)).toEqual([])
})

test("duplicate slices are charged once and the final line without a newline is preserved", () => {
  const result = packSourceSegments("α\r\nβ\r\n末", [
    { originalStartLine: 1, originalEndLine: 1, origins: ["a"] },
    { originalStartLine: 1, originalEndLine: 1, origins: ["a"] },
    { originalStartLine: 3, originalEndLine: 3, origins: ["b"] },
  ])
  expect(result.content).toBe("α\r\n末")
  expect(result.segments).toHaveLength(2)
  expect(result.bytes).toBe(7)
  const duplicate = structuredClone(result.segments); duplicate[1]!.originalStartLine = 1; duplicate[1]!.originalEndLine = 1
  expect(validateSourceSegments(result.content, duplicate).length).toBeGreaterThan(0)
  const bad = structuredClone(result.segments); bad[1]!.snapshotStartLine = 3
  expect(validateSourceSegments(result.content, bad).length).toBeGreaterThan(0)
})
