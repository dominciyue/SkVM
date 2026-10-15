import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
import { positionOptions } from "./study.ts"
const studyApi: any = await import("./study.ts")
test("selection retains a current delivered draft after a known host interruption, never an unknown or stale answer", () => {
  expect(typeof studyApi.hasCurrentClosedDelivery).toBe("function")
  const entry = { status: "interrupted", terminalStatus: "interrupted", answerDelivery: "delivered", deliveryStatus: "current", lifecycle: { localExecution: "closed", providerTerminalObserved: true } }
  expect(studyApi.hasCurrentClosedDelivery(entry)).toBe(true)
  expect(studyApi.hasCurrentClosedDelivery({ ...entry, status: "unknown" })).toBe(false)
  expect(studyApi.hasCurrentClosedDelivery({ ...entry, deliveryStatus: "stale" })).toBe(false)
  expect(studyApi.hasCurrentClosedDelivery({ ...entry, lifecycle: { localExecution: "active" } })).toBe(false)
})
test("BO keeps separate repair and empty author tracks and excludes a paid denied position", () => {
  expect(positionOptions("A0")).toEqual({ author: true, baseline: false, variant: "root-default" })
  expect(positionOptions("A1")).toEqual({ author: true, baseline: false, variant: "root-default" })
  expect(positionOptions("B1")).toEqual({ author: false, baseline: true, variant: "empty-version" })
  expect(positionOptions("C1")).toEqual({ author: false, baseline: false, variant: "empty-version" })
  expect(positionOptions("S0").author).toBe(true)
  expect(() => positionOptions("C2")).toThrow("Unknown BO purpose")
})
const api: any = await import("./scope-assessment.ts").catch(() => ({}))
const local = { path: "local.py", startLine: 1, endLine: 10 }, upstream = { path: "framework.py", startLine: 1, endLine: 3 }
const truth = (binding: string): any => ({ op: "truthy", language: "python", value: { binding } })
const workflow: any = { inputs: [], steps: [
  { id: "outer", op: "external", name: "outer-service", arguments: {}, source: upstream },
  { id: "outer-guard", op: "guard", test: truth("outer"), failure: "outer-denied", source: upstream },
  { id: "init", op: "external", name: "initialize", arguments: {}, source: local },
  { id: "init-guard", op: "guard", test: truth("init"), failure: "completion-unknown", source: local },
  { id: "result", op: "return", value: { literal: 7 }, source: local },
] }
test("scope separates source-supported upstream unknown without granting it or masking local missing completion", () => {
  expect(typeof api.assessScopedTrace).toBe("function")
  const execution = executeResourceWorkflow(workflow, {}), before = structuredClone(execution)
  const expected = { calls: [{ name: "initialize", arguments: {} }], conditional: true, requiredConditionCalls: ["initialize"], returned: 7 }
  const result = api.assessScopedTrace(execution, expected, [upstream])
  expect(result.local.pass).toBe(true)
  expect(result.upstream.conditions).toHaveLength(1)
  expect(result.upstream.status).toBe("unresolved")
  expect(result.localExecution.conditions).toHaveLength(1)
  expect(execution).toEqual(before)
  const broken = structuredClone(workflow); broken.steps.splice(3, 1)
  expect(api.assessScopedTrace(executeResourceWorkflow(broken, {}), expected, [upstream]).local.pass).toBe(false)
})
test("scope never accepts an extra local query or an arbitrary gap as a required control condition", () => {
  expect(typeof api.assessScopedTrace).toBe("function")
  const extra = structuredClone(workflow); extra.steps.splice(4, 0, { id: "extra", op: "external", name: "extra-query", arguments: {}, source: local })
  const expected = { calls: [{ name: "initialize", arguments: {} }], conditional: true, requiredConditionCalls: ["initialize"] }
  expect(api.assessScopedTrace(executeResourceWorkflow(extra, {}), expected, [upstream]).local.failures).toContain("ordered-exact-external-calls")
  const run = executeResourceWorkflow(workflow, {}); run.conditions = run.conditions.filter((c: any) => c.step !== "init-guard")
  expect(api.assessScopedTrace(run, expected, [upstream]).local.failures).toContain("required-call-condition:initialize")
  expect(api.assessScopedTrace(executeResourceWorkflow(workflow, {}), expected, []).local.pass).toBe(false)
})
test("upstream conditionality does not hide explicit local rejection or later actions", () => {
  expect(typeof api.assessScopedTrace).toBe("function")
  const execution = executeResourceWorkflow(workflow, {}, { externalAssumptions: [{ name: "initialize", arguments: {}, value: false, reason: "Explicit finite marker denial" }] })
  const expected = { calls: [{ name: "initialize", arguments: {} }], conditional: false, rejected: true }
  expect(api.assessScopedTrace(execution, expected, [upstream]).local.pass).toBe(true)
  const bad = { ...execution, events: [...execution.events, { id: "late", op: "return", source: local, outcome: "conditional", inputs: {}, outputs: { value: 7 } }] }
  expect(api.assessScopedTrace(bad, expected, [upstream]).local.pass).toBe(false)
})
