import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import Ajv from "ajv"
import { createInquiryTools } from "./inquiry-tools.ts"
import { inquiryNativeDefinitions, inquiryNativeArgumentSchema, inquiryStepSchemas } from "./inquiry-wire.ts"
const api: any = await import("./semantic-completion-wire.ts").catch(() => ({}))
async function syntax() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bd-wire-"))
  await writeFile(path.join(root, "app.py"), "def entry(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot: root, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 6 })
  return (await tools.sourceSkeleton(tools.structure!.symbols.find(s => s.name === "entry")!.id))!
}
test("offered slots expand only current host fields and preserve strict value validation", async () => {
  const s = await syntax()
  expect(typeof api.completionEditModelView).toBe("function")
  const view = api.completionEditModelView(s, { transactionId: "current", questionIds: ["q"] })
  const role = view.slots.find((v: any) => v.field === "role"), optional = view.slots.find((v: any) => v.field === "guardBranch"), root = view.slots.find((v: any) => v.field === "propertyBindings")
  expect(view.template).toEqual({ transactionId: "current", edits: [] })
  expect(new Set(view.slots.map((v: any) => v.slot)).size).toBe(view.slots.length)
  const expanded = api.expandCompletionEditProposal(view, { transactionId: "current", edits: [{ slot: role.slot, value: "context" }, { slot: optional.slot, value: null }, { slot: root.slot, value: [] }] })
  expect(expanded.diagnostics).toEqual([])
  expect(expanded.raw).toMatchObject({ schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: "current", edits: [{ anchorId: role.anchorId, field: "role", value: "context" }, { anchorId: optional.anchorId, field: "guardBranch", value: null }, { field: "propertyBindings", value: [] }] })
  for (const raw of [{ transactionId: "stale", edits: [] }, { transactionId: "current", edits: [{ slot: "foreign", value: "context" }] }, { transactionId: "current", edits: [{ slot: role.slot, value: null }] }, { transactionId: "current", edits: [{ slot: role.slot }] }, { transactionId: "current", edits: [], schemaVersion: "wrong" }]) {
    const rejected = api.expandCompletionEditProposal(view, raw)
    expect(rejected.raw).toBeUndefined(); expect(rejected.diagnostics.length).toBeGreaterThan(0)
  }
})
test("static account advertisement and provider parsing use the same narrow source envelope", () => {
  const raw = { transactionId: "current", edits: [{ slot: "offered", value: "context" }] }
  const definition = inquiryNativeDefinitions("semantic-completion-v1").find(t => t.name === "authorization_observe")!
  expect(new Ajv({ strict: false }).compile(definition.inputSchema)({ controlDelta: raw })).toBe(true)
  expect(inquiryNativeArgumentSchema("semantic-completion-v1", "authorization_observe", { controlDelta: raw })!.safeParse({ controlDelta: raw }).success).toBe(true)
  const step = inquiryStepSchemas("semantic-completion-v1", false, "behavior", "interpret")
  expect(step.schema.parse(raw)).toEqual({ kind: "control", controlDelta: raw })
  expect(step.modelSchema.safeParse(raw).success).toBe(true)
  const advertised = JSON.stringify(definition.inputSchema)
  expect(advertised).not.toContain("authorization-source-update/v1")
  expect(advertised).not.toContain("authorization-source-edit/v1")
  const legacy = { schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: "current", edits: [] }
  expect(inquiryNativeArgumentSchema("semantic-completion-v1", "authorization_observe", { controlDelta: legacy })!.safeParse({ controlDelta: legacy }).success).toBe(true)
  expect(step.schema.safeParse(legacy).success).toBe(true)
})
