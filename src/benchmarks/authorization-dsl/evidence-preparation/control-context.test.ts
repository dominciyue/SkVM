import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { buildControlContext } from "./control-context.ts"
import { indexAuthorizationSymbols } from "./discovery.ts"

const identity = { repository: "https://example.test/control", sourceRef: "fixed" }
function pack(content: string, selected: Array<{ startLine: number; endLine: number }>, maxBytes = 65536) {
  const source = { path: "guard.py", content, sha256: createHash("sha256").update(content).digest("hex") }
  return buildControlContext({ selected: selected.map(s => ({ ...s, path: source.path, origins: ["model-proposal:selected"] })), units: indexAuthorizationSymbols(source.path, content, identity), sources: [source], allowedFiles: [source.path], sourceIdentity: identity, maxBytes })
}

test("callable context fills a renamed multiline Python helper instead of keeping only head and tail", () => {
  for (const name of ["guard", "renamed_guard"]) {
    const text = `def ${name}(\n    caller,\n):\n    if caller.denied:\n        raise PermissionError()\n    return write()\n\ndef unrelated():\n    return False\n`
    const value = pack(text, [{ startLine: 1, endLine: 3 }, { startLine: 6, endLine: 6 }])
    expect(value.ranges).toEqual([expect.objectContaining({ path: "guard.py", startLine: 1, endLine: 7 })])
    expect(value.report.units[0]?.status).toBe("unit-complete")
    expect(value.report.expansions).toContainEqual(expect.objectContaining({ origin: "host-context", startLine: 4, endLine: 5 }))
  }
})

test("one selected class method does not pack unrelated methods or choose a same-name peer", () => {
  const text = "class First:\n    def guard(self):\n        if denied:\n            raise PermissionError()\n        return write()\n    def unrelated(self):\n        return huge()\nclass Second:\n    def guard(self):\n        return bypass()\n"
  const value = pack(text, [{ startLine: 3, endLine: 3 }])
  expect(value.ranges).toEqual([expect.objectContaining({ startLine: 2, endLine: 5 })])
  expect(value.report.units).toHaveLength(1)
  expect(value.report.finalBytes).toBeLessThan(Buffer.byteLength(text))
})

test("budget exhaustion preserves exact selected Unicode lines and reports the omitted unit", () => {
  const text = "def guard():\n    # 中文\n    if denied:\n        raise PermissionError()\n    return write()\n"
  const selectedBytes = Buffer.byteLength("    if denied:\n    return write()\n")
  const value = pack(text, [{ startLine: 3, endLine: 3 }, { startLine: 5, endLine: 5 }], selectedBytes)
  expect(value.ranges.map(r => [r.startLine, r.endLine])).toEqual([[3, 3], [5, 5]])
  expect(value.report.units[0]?.status).toBe("unit-partial")
  expect(value.report.units[0]?.omitted).toContainEqual({ path: "guard.py", startLine: 4, endLine: 4 })
  expect(value.report.finalBytes).toBe(selectedBytes)
})

test("incomplete declaration and conflicting bounds stay range-uncertain", () => {
  const value = pack("def guard(\n    x,\n", [{ startLine: 1, endLine: 1 }])
  expect(value.report.units[0]?.status).toBe("range-uncertain")
  expect(value.report.expansions).toEqual([])
})

test("source digest drift and escaping allowlists fail before context can be used", () => {
  const text = "def guard():\n    return True\n", units = indexAuthorizationSymbols("guard.py", text, identity)
  const args = { sourceIdentity: identity, selected: [{ path: "guard.py", startLine: 1, endLine: 1, origins: ["author:line"] }], units, sources: [{ path: "guard.py", content: text, sha256: "bad" }], allowedFiles: ["guard.py"], maxBytes: 65536 }
  expect(() => buildControlContext(args)).toThrow("digest")
  expect(() => buildControlContext({ ...args, allowedFiles: ["../guard.py"] })).toThrow("allowlist")
})

test("Python strings and dedented continuation closers cannot invent a peer boundary", () => {
  const text = 'def guard():\n    """\ndef decoy():\n    text only\n    """\n    values = (\n        denied,\n)\n    if values:\n        raise PermissionError()\n    return write()\ndef peer():\n    return True\n'
  const value = pack(text, [{ startLine: 1, endLine: 1 }, { startLine: 11, endLine: 11 }])
  expect(value.report.units.some(u => u.status !== "unit-complete")).toBe(false)
  expect(value.ranges).toEqual([expect.objectContaining({ startLine: 1, endLine: 11 })])
})

test("a selected single-line decorator belongs to its callable without expanding a peer", () => {
  const value = pack('@route("/update")\ndef guard():\n    return write()\ndef peer():\n    return True\n', [{ startLine: 1, endLine: 3 }])
  expect(value.report.units[0]?.status).toBe("unit-complete")
  expect(value.ranges).toEqual([expect.objectContaining({ startLine: 1, endLine: 3 })])
})
