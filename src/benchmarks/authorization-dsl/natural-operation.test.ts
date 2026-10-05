import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { normalizeNaturalOperation } from "../../task-dsl/authorization/operation-program.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
test("natural frontend retains the complete brief and supplied policy without inventing question splits or source hints", () => {
  const brief = "Check create; explain caller, object, policy and deployment limits without assuming a grant."
  const policy = { text: "Creation requires an exact object grant.", origin: "user" as const, location: "current-user" }
  const declaration = normalizeNaturalOperation(brief, "conformance", policy)
  expect(declaration.questions).toHaveLength(1)
  expect(declaration.questions[0]!.request).toBe(brief)
  expect(declaration.operations[0]!.request).toBe(brief)
  expect(declaration.operations[0]!.entryHint).toBeUndefined()
  expect(declaration.policy).toEqual(policy)
  expect(declaration.questions[0]!.premises).toEqual([])
})
test("ordinary native natural operation compiles through the production frontend with zero declaration provider/tool calls", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "au-natural-")), brief = "Inspect create and its source limits."
  await writeFile(path.join(workDir, "view.py"), "def create():\n    return True\n")
  const inputFile = path.join(workDir, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "fixture", repository: "fixture", sourceRef: "r", sourceRoot: ".", allowedPaths: ["view.py"], brief, mode: "behavior" }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir, domainTools: true, strategy: "operation-evidence-v1" })
  expect(runtime.definitions.some(d => d.name === "authorization_compile")).toBe(false)
  expect(runtime.report().compilationOrigin).toBe("host-natural")
  expect(runtime.report().program!.originalDeclaration!.questions[0]!.request).toBe(brief)
  expect(runtime.report().compilationToolCalls).toBe(0)
  expect(runtime.report().requests).toHaveLength(0)
  await runtime.close()
})
