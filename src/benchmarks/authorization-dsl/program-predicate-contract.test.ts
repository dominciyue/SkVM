import { expect, test } from "bun:test"
import { questionWorkflowDefinitions, programRulesToolDescription } from "./question-workflow-wire.ts"
import { partialEvaluate } from "../../task-dsl/authorization/control-evaluation.ts"

test("author and patch contracts disclose the numeric predicates already accepted by the executor", () => {
  const definitions = questionWorkflowDefinitions("question-checked-v1")
  for (const name of ["authorization_program", "authorization_program_patch", "authorization_declare"]) {
    const description = definitions.find(t => t.name === name)!.description
    expect(description).toContain('op:"gt"|"gte"|"lt"|"lte"')
    expect(description).toContain("Numeric comparisons need no order")
    expect(description).toContain("Unknown user values remain residual")
  }
  for (const name of ["authorization_program", "authorization_program_patch"]) {
    const description = programRulesToolDescription(name)!
    expect(description).toContain('op:"gt"|"gte"|"lt"|"lte"')
    expect(description).toContain("No evaluation")
  }
})

test("the advertised ordering applies to anonymous thresholds and stock counts, retaining missing values", () => {
  for (const [left, right] of [["temperature", "threshold"], ["available", "requested"]]) {
    const predicate = { op: "gt", left: { binding: left! }, right: { binding: right! } }
    expect(partialEvaluate(predicate, { [left!]: 17, [right!]: 17 }).truth).toBe("false")
    expect(partialEvaluate(predicate, { [left!]: 18, [right!]: 17 }).truth).toBe("true")
    expect(partialEvaluate(predicate, { [right!]: 17 }).truth).toBe("unknown")
  }
})
