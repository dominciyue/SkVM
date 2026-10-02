import { expect, test } from "bun:test"
import { modelSourceDisplay, type InquiryEvidence } from "./inquiry-tools.ts"
const source = (id: string, path: string): InquiryEvidence => ({ id, path, repository: "neutral", sourceRef: "fixed", sha256: "original", startLine: 1, endLine: 1, text: '1 | function gate() { return "same"; }\n', quote: 'function gate() { return "same"; }', bytes: 39 })
test("identical original text in another path cannot acquire an unseen evidence identity from a catalog", () => {
  const a = source("ev-aaa", "a.ts"), b = source("ev-bbb", "b.ts")
  const { text: _text, quote: _quote, ...catalogB } = b
  const request = `Original windows: ${JSON.stringify([a])}\nCatalog: ${JSON.stringify([catalogB])}`
  expect(modelSourceDisplay([a, b], request, new Set())).toEqual({ bytes: a.bytes, resentBytes: 0, evidenceIds: [a.id] })
  expect(modelSourceDisplay([a, b], request, new Set([a.id]))).toEqual({ bytes: a.bytes, resentBytes: a.bytes, evidenceIds: [a.id] })
})
test("an evidence ID paired with altered source metadata is not a shown original window", () => {
  const a = source("ev-aaa", "a.ts")
  expect(modelSourceDisplay([a], JSON.stringify({ ...a, sha256: "changed" }), new Set())).toEqual({ bytes: 0, resentBytes: 0, evidenceIds: [] })
})
