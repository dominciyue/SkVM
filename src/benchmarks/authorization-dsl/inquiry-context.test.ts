import { expect, test } from "bun:test"
const api = await import("./inquiry-context.ts").catch(() => ({} as any))
// Resolve actual previously transmitted values, rather than a host-side copy.
function expand(value: any, packets: any[]): any {
  if (value && typeof value === "object" && value.contextReference) {
    const r = value.contextReference
    let prior = packets[r.sequence - 1].context
    for (const component of r.path) prior = prior[component]
    return expand(prior, packets)
  }
  if (Array.isArray(value)) return value.map(v => expand(v, packets))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, packets)]))
  return value
}
test("incremental account context retains exact full state and changed source without resending shared windows", () => {
  const encode = api.createInquiryContextEncoder(), window = { id: "e", sha256: "first", text: "original source\n".repeat(500) }
  const first = { focus: { id: "focus", stage: "interpret" }, sourceWindows: [window], tasks: [{ sourceSkeleton: { revision: "r1", anchors: [{ id: "a", text: "constant source".repeat(100) }] }, draft: [] }], toolBudget: { totalRemaining: 8 } }
  const second = { ...first, tasks: [{ ...first.tasks[0], draft: [{ anchorId: "a", role: "context" }] }], toolBudget: { totalRemaining: 7 } }
  const packets = [encode(first), encode(second)]
  expect(expand(packets[1].context, packets)).toEqual({ ...second, contextSequence: 2 })
  expect(JSON.stringify(packets[1]).length).toBeLessThan(JSON.stringify(second).length * 0.3)
  const changed = { ...second, sourceWindows: [{ ...window, sha256: "second", text: "changed decisive source\n".repeat(500) }] }
  packets.push(encode(changed))
  expect(expand(packets[2].context, packets)).toEqual({ ...changed, contextSequence: 3 })
  expect(JSON.stringify(packets[2])).toContain("changed decisive source")
  expect(packets[1].context.focus).toEqual(second.focus)
  expect(packets[1].context.toolBudget).toEqual(second.toolBudget)
  expect(first.sourceWindows[0]!.text).toBe(window.text)
  expect(api.resolveInquiryContext(packets[1].context, packets.map((p: any) => p.context))).toEqual({ ...second, contextSequence: 2 })
  const altered = JSON.parse(JSON.stringify(packets[0].context)); altered.sourceWindows[0].text += " changed"
  expect(() => api.resolveInquiryContext(packets[1].context, [altered])).toThrow("context-reference-digest")
})
