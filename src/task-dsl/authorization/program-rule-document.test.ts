import { expect, test } from "bun:test"
const api: any = await import("./program-rule-document.ts").catch(() => ({}))
const at = { path: "anonymous.py", startLine: 2, endLine: 8, sha256: "source" }
test("pure rule rendering preserves all authored fields and ordered steps without consulting execution", () => {
  expect(typeof api.renderProgramRuleDocument).toBe("function")
  const raw = { id: "rules", scope: { root: at, upstream: ["unreviewed upstream"] }, sourceDeclarations: [{ source: at, statements: [] }], resourceWorkflow: { inputs: ["rows"], gaps: ["unwritten fallback"], steps: [
    { id: "select", op: "select", from: "rows", where: { op: "truthy", language: "python", value: { binding: "row.visible" } }, order: [{ field: "index", direction: "desc", nulls: "last" }], unique: false, source: at },
    { id: "call", op: "external", when: { op: "truthy", language: "python", value: { binding: "select" } }, name: "outside", arguments: { object: { field: { of: { ref: "select" }, key: "id" } } }, source: at, sources: [at] },
    { id: "guard", op: "guard", test: { op: "eq", left: { binding: "call" }, right: { literal: true } }, failure: "denied", source: at },
    { id: "future", op: "unsupported-future", extra: { deeply: "must-survive" }, source: at },
    { id: "return", op: "return", value: { record: { description: { literal: "authored literal must remain" }, object: { ref: "select" } } }, source: at },
  ] } }
  const report = { program: raw, resourceExecution: { returned: "SIBLING_EXECUTION_SENTINEL" } }
  const before = JSON.stringify(raw), doc = api.renderProgramRuleDocument(report.program)
  expect(doc.semanticSupport).toBe("author-declared-unreviewed")
  expect(doc.representedStepIds).toEqual(raw.resourceWorkflow.steps.map(s => s.id))
  expect(doc.markdown).not.toContain("SIBLING_EXECUTION_SENTINEL")
  expect(doc.markdown).toContain("Unsupported or malformed step")
  expect(doc.markdown).toContain("authored literal must remain")
  expect(doc.markdown).toContain("must-survive")
  const blocks = [...doc.markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]!))
  expect(blocks.at(-1)).toEqual(raw)
  expect(JSON.stringify(raw)).toBe(before)
  expect(api.renderProgramRuleDocument(raw)).toEqual(doc)
})
test("malformed local drafts remain explicitly retrievable without silently dropping slots", () => {
  expect(typeof api.renderProgramRuleDocument).toBe("function")
  const doc = api.renderProgramRuleDocument({ id: "partial", resourceWorkflow: { steps: [null, { id: "broken", op: "value" }] } })
  expect(doc.representedStepIds).toEqual(["$invalid-step-0", "broken"])
  expect(doc.markdown).toContain("Unsupported or malformed step")
})
