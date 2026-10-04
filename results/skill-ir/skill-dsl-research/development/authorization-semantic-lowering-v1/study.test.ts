import { expect, test } from "bun:test"
const api = await import("./study.ts").catch(() => ({} as any))
const row = { id: "quality-a-D-S", task: "a", kind: "quality", studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1", admission: "eligible", components: ["wire"] }
const manifest = { rows: [row], tasks: [{ id: "a", admission: "eligible" }], arms: [{ studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1" }] }
test("AS admission preserves logical seals despite row names and refuses arm/core asymmetry", () => {
  expect(typeof api.selectQualityRow).toBe("function")
  expect(api.selectQualityRow(manifest, row.id)).toEqual(row)
  expect(() => api.selectQualityRow({ ...manifest, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, row.id)).toThrow("sealed")
  expect(() => api.selectQualityRow({ ...manifest, rows: [{ ...row, method: "M" }] }, row.id)).toThrow("arm")
  expect(() => api.selectQualityRow(manifest, "renamed-a-D-S")).toThrow("registered")
})
test("ordinary skill admission requires the registered native scope and full original skill contract", async () => {
  const native = await import("./native.ts").catch(() => ({} as any))
  const entry = { id: "native-a-original", task: "a", kind: "native", admission: "eligible", method: "D1", strategy: "semantic-flow-v1", sourceSkill: "original/SKILL.md", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 12, totalToolBudget: 24 }
  const registered = { rows: [entry], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof native.selectNativeRow).toBe("function")
  expect(native.selectNativeRow(registered, entry.id)).toEqual(entry)
  expect(() => native.selectNativeRow({ ...registered, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, entry.id)).toThrow("sealed")
  expect(() => native.selectNativeRow({ ...registered, rows: [{ ...entry, completeSkillAndReferencesRequired: false }] }, entry.id)).toThrow("original skill")
  expect(() => native.selectNativeRow(registered, "renamed")).toThrow("registered")
})
test("variation admission binds a registered semantic base and cannot bypass an inherited seal", async () => {
  const variations = await import("./variations.ts").catch(() => ({} as any))
  const base = { ...row, id: "quality-a-D-S" }, changed = { id: "variation-a-policy-previous", task: "a", kind: "variation", method: "D1", strategy: "semantic-flow-v1", admission: "depends-on-checked-bounded-base", blockedBy: null, baseRow: base.id, change: "policy", route: "previous" }
  const registered = { rows: [base, changed], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof variations.selectVariationRow).toBe("function")
  expect(variations.selectVariationRow(registered, changed.id)).toEqual(changed)
  expect(() => variations.selectVariationRow({ ...registered, rows: [base, { ...changed, blockedBy: "inherited-unknown" }] }, changed.id)).toThrow("sealed")
  expect(() => variations.selectVariationRow({ ...registered, rows: [{ ...base, strategy: "legacy" }, changed] }, changed.id)).toThrow("base")
  expect(() => variations.selectVariationRow(registered, "renamed")).toThrow("registered")
})
test("native delivery requires the actual final response and a bounded current check", async () => {
  const native = await import("./native.ts").catch(() => ({} as any))
  const trace = { status: "completed", domain: { check: { structureValid: true, sourceBound: true, ruleConsistency: true, taskResolution: "bounded" } }, attempts: [{ state: "responded", response: { text: "Earlier explanation", toolCalls: [] } }, { state: "responded", response: { text: "Now checking", toolCalls: [{ name: "authorization_check_result" }] } }] }
  expect(typeof native.nativeDelivery).toBe("function")
  expect(native.nativeDelivery(trace, 0).status).toBe("completed-with-diagnostics")
  const final = { ...trace, attempts: [...trace.attempts, { state: "responded", response: { text: "Final user-facing answer", toolCalls: [] } }] }
  expect(native.nativeDelivery(final, 0)).toMatchObject({ status: "completed", finalProse: "Final user-facing answer" })
  expect(native.nativeDelivery({ ...final, domain: { check: { ...trace.domain.check, taskResolution: "partial" } } }, 0).status).toBe("completed-with-diagnostics")
})
