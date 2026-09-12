import { describe, expect, test } from "bun:test"
import { analyzeSkillConsumption } from "../../src/jit-optimize/consumption.ts"

describe("analyzeSkillConsumption", () => {
  test("requires tool evidence for the skill read and helper invocation", () => {
    const analysis = analyzeSkillConsumption([
      {
        role: "assistant",
        text: "I will read skill/SKILL.md and call api-task-solidify.js.",
        timestamp: 1,
        toolCalls: [],
      },
      {
        role: "assistant",
        timestamp: 2,
        toolCalls: [{
          id: "read-1",
          name: "read",
          input: { path: "skill/SKILL.md" },
          output: "# API Tester",
          exitCode: 0,
        }],
      },
      {
        role: "assistant",
        timestamp: 3,
        toolCalls: [{
          id: "bash-1",
          name: "bash",
          input: { command: "bun skill/scripts/api-task-solidify.js --binding binding.json" },
          output: "{\"status\":\"passed\"}",
          exitCode: 0,
        }],
      },
    ])
    expect(analysis).toEqual({
      skillRead: true,
      helperInvoked: true,
      helperSucceeded: true,
      skillReadToolCallIds: ["read-1"],
      helperToolCallIds: ["bash-1"],
    })
  })

  test("does not count prompt or assistant claims as tool evidence", () => {
    const analysis = analyzeSkillConsumption([{
      role: "assistant",
      text: "I read skill/SKILL.md and the helper passed.",
      timestamp: 1,
      toolCalls: [],
    }])
    expect(analysis).toMatchObject({ skillRead: false, helperInvoked: false, helperSucceeded: false })
  })

  test("distinguishes invocation from a successful helper result", () => {
    const analysis = analyzeSkillConsumption([{
      role: "assistant",
      timestamp: 1,
      toolCalls: [{
        id: "bash-2",
        name: "bash",
        input: { command: "bun skill/scripts/api-task-solidify.js" },
        output: "binding missing",
        exitCode: 1,
      }],
    }])
    expect(analysis).toMatchObject({ helperInvoked: true, helperSucceeded: false })
  })
})
