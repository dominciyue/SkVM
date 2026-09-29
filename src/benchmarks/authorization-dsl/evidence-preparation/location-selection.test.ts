import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { evidenceLocationId, selectEvidenceLocation, type EvidenceLocationContext } from "./location-selection.ts"

function fixture(): EvidenceLocationContext {
  const content = "function first() {\r\n return item // 汉😀\r\n}\r\n// omitted\r\nfunction second() {\r\n return item\r\n}\r\n"
  const source = { path: "renamed.ts", content, sha256: createHash("sha256").update(content).digest("hex") }
  const sourceIdentity = { repository: "https://example.test/renamed", sourceRef: "fixed-2" }
  const bind = (kind: "window" | "symbol", startLine: number, endLine: number, name?: string) => {
    const value = { path: source.path, sha256: source.sha256, startLine, endLine, ...(name ? { name } : {}) }
    return { ...value, id: evidenceLocationId(kind, sourceIdentity, value) }
  }
  return { sourceIdentity, sources: [source], windows: [bind("window", 1, 3), bind("window", 5, 6)], symbols: [bind("symbol", 5, 7, "second")] }
}

test("a shown range disambiguates a literal repeated outside that fragment", () => {
  const c = fixture()
  expect(selectEvidenceLocation(c, { kind: "shown-range", windowId: c.windows[0]!.id, startLine: 1, endLine: 3, exactLiteral: "return item" })).toEqual({ status: "resolved", path: "renamed.ts", startLine: 1, endLine: 3 })
  expect(selectEvidenceLocation(c, { kind: "literal-search", path: "renamed.ts", literal: "return item" })).toMatchObject({ status: "unresolved", code: "ambiguous", candidates: [{ path: "renamed.ts", startLine: 2, endLine: 2 }, { path: "renamed.ts", startLine: 6, endLine: 6 }] })
})

test("a reason containing ellipsis cannot become a literal source location", () => {
  const c = fixture()
  expect(selectEvidenceLocation(c, { kind: "shown-range", windowId: c.windows[0]!.id, startLine: 1, endLine: 3, exactLiteral: "return ... item" })).toMatchObject({ status: "unresolved", code: "not-found", candidates: [] })
})

test("unknown IDs and range envelopes across omitted lines fail closed", () => {
  const c = fixture()
  expect(selectEvidenceLocation(c, { kind: "shown-range", windowId: "unknown", startLine: 1, endLine: 2 })).toMatchObject({ status: "unresolved", code: "not-shown" })
  expect(selectEvidenceLocation(c, { kind: "indexed-symbol", symbolId: "unknown" })).toMatchObject({ status: "unresolved", code: "not-found" })
  expect(selectEvidenceLocation(c, { kind: "shown-range", windowId: c.windows[0]!.id, startLine: 2, endLine: 6 })).toMatchObject({ status: "unresolved", code: "not-shown" })
})

test("an indexed body is a read candidate until every line has been displayed", () => {
  const c = fixture(), selector = { kind: "indexed-symbol" as const, symbolId: c.symbols[0]!.id }
  expect(selectEvidenceLocation(c, selector)).toMatchObject({ status: "unresolved", code: "not-shown" })
  expect(selectEvidenceLocation(c, selector, "read")).toEqual({ status: "resolved", path: "renamed.ts", startLine: 5, endLine: 7 })
})

test("scoped literals retain range conflicts and repeated in-range candidates", () => {
  const c = fixture()
  expect(selectEvidenceLocation(c, { kind: "literal-search", path: "renamed.ts", literal: "return item", startLine: 1, endLine: 3 }, "read")).toMatchObject({ status: "resolved", startLine: 1, endLine: 3 })
  expect(selectEvidenceLocation(c, { kind: "literal-search", path: "renamed.ts", literal: "return item", startLine: 3, endLine: 5 }, "read")).toMatchObject({ status: "unresolved", code: "range-conflict" })
  expect(selectEvidenceLocation(c, { kind: "literal-search", path: "renamed.ts", literal: "return item", startLine: 1, endLine: 7 }, "read")).toMatchObject({ status: "unresolved", code: "ambiguous" })
  expect(selectEvidenceLocation(c, { kind: "literal-search", path: "renamed.ts", literal: "汉😀", startLine: 1, endLine: 3 })).toMatchObject({ status: "resolved", startLine: 1, endLine: 3 })
})

test("IDs are bound to repository, ref, digest and the actual fragment", () => {
  const c = fixture(), original = c.windows[0]!.id
  c.sourceIdentity.sourceRef = "another-ref"
  expect(selectEvidenceLocation(c, { kind: "shown-range", windowId: original, startLine: 1, endLine: 2 })).toMatchObject({ status: "unresolved", code: "not-shown" })
  const changed = fixture(); changed.sources[0]!.content += "tamper"
  expect(() => selectEvidenceLocation(changed, { kind: "shown-range", windowId: changed.windows[0]!.id, startLine: 1, endLine: 2 })).toThrow("digest")
})
