import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { createInquiryWorklist } from "./inquiry-worklist.ts"

async function fixture(structure = true) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-structure-"))
  await writeFile(path.join(sourceRoot, "view.py"), "def create(caller, item):\n    return check(caller, item)\ndef check(caller, item):\n    return caller == item.owner\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure, maxToolCalls: 12 })
  return { sourceRoot, tools }
}
test("opt-in structural tool returns bounded source relations without promoting metadata to read evidence", async () => {
  const { tools, sourceRoot } = await fixture()
  expect(tools.definitions.map(t => t.name)).toContain("source_structure")
  const entry = tools.locateSymbols("create")[0]!
  const out = await tools.execute("source_structure", { symbolId: entry.id })
  expect(out.structure!.calls[0]!.expression).toBe("check")
  expect(out.structure!.calls[0]!.resolution).toBe("resolved")
  expect(out.evidence).toEqual([])
  expect(tools.evidence).toEqual([])
  await writeFile(path.join(sourceRoot, "view.py"), "def create():\n    return False\n")
  expect((await tools.execute("source_structure", { symbolId: entry.id })).code).toBe("source-changed")
  expect((await (await fixture(false)).tools.execute("source_structure", { symbolId: entry.id })).code).toBe("tool-not-registered")
})
test("omitted bound helper is actionable without a model dependency and v2 has only one entry queue", async () => {
  const { tools } = await fixture()
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "create", request: "Investigate create", entryHint: "create" }], questions: [{ id: "a", operationId: "create", intent: "behavior", request: "Describe create", premises: [] }, { id: "b", operationId: "create", intent: "scope", request: "Explain its scope", premises: [] }] })
  const work = createInquiryWorklist({ program, tools, structural: true })
  await work.run(createControlSlice(), 2)
  expect(work.snapshot().filter(w => w.origin === "question-duty" && w.kind === "entry")).toHaveLength(1)
  const helper = work.snapshot().find(w => w.origin === "structure-relation" && w.symbol === "check")!
  expect(helper).toMatchObject({ state: "awaiting-interpretation", selected: { name: "check" }, semanticSupport: "unreviewed" })
  expect(work.actions.map(a => a.arguments.path)).toEqual(["view.py", "view.py"])
  expect(work.report().relations[0]!.reason).toContain("AST-bound")
})
