import { expect, test } from "bun:test"
import example from "../../../examples/authorization-assessment/assessment.json" with { type: "json" }
import { compileAuthorizationTask } from "./semantics.ts"
import { renderAuthorizationTask } from "./render.ts"
import { resolveCurrentTaskContract } from "./task-contract.ts"

const oldRule = "return source_supported_failure, source_refuted, or unknown with exact supplied-source locations"

test("current contract migrates only the known old output instruction and records its source", () => {
  const result = resolveCurrentTaskContract(["identify the decisive control", oldRule], undefined)
  expect(result.status).toBe("ready")
  expect(result.effectiveRequiredAnalysis).toEqual(["identify the decisive control", "Use exact supplied-source locations to support the source-visible behavior and policy comparison."])
  expect(result.migrations[0]?.original).toBe(oldRule)
  expect(result.migrations[0]?.source).toBe("task.requiredAnalysis.1")
  const inputLocations = resolveCurrentTaskContract(["return source_supported_failure, source_refuted, or unknown with exact input locations"])
  expect(inputLocations.status).toBe("ready")
  expect(inputLocations.migrations[0]?.original).toContain("input locations")
})

test("unknown output instruction receives a path diagnostic while quoted task data remains unchanged", () => {
  const unknown = resolveCurrentTaskContract(["Return source_refuted or a private custom tag."], undefined)
  expect(unknown.status).toBe("needs-input")
  expect(unknown.diagnostics[0]?.path).toBe("task.requiredAnalysis.0")
  const quoted = resolveCurrentTaskContract(["Explain the source path."], "The task quotes the literal `return source_refuted` as source data.")
  expect(quoted.status).toBe("ready")
  const publicRequirement = resolveCurrentTaskContract([], undefined, "Return source_supported_failure or unknown for each case.")
  expect(publicRequirement.status).toBe("needs-input")
  expect(publicRequirement.diagnostics[0]?.path).toBe("publicRequirementsText.0")
})

test("renderer current-v1 gives DSL and Markdown the same v6 result contract without old return labels", () => {
  const task = { ...example.task, request: `${example.task.request} The source string \"return source_supported_failure\" is quoted data.`, requiredAnalysis: [oldRule] }
  const compiled = compileAuthorizationTask(task as any)
  const dsl = renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v6", taskContract: "current-v1" })
  const markdown = renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v6", taskContract: "current-v1", researchInstructions: { instructions: "Assess the current archive policy using the fixed source.", instructionOrigin: "independent-author", instructionPath: "independent.md" } })
  expect(dsl.prompt).not.toContain(oldRule)
  expect(dsl.prompt).toContain("The source string")
  expect(dsl.prompt).toContain("decision {kind:\"observed\"")
  expect(markdown.sections.outputContract).toBe(dsl.sections.outputContract)
  expect(markdown.prompt).not.toContain(oldRule)
  expect(renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v6" }).prompt).toContain(oldRule)
})
