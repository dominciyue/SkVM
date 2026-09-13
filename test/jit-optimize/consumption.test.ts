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
      helperSuccessfulToolCallIds: ["bash-1"],
      helperHelpToolCallIds: [],
      helperFailedToolCallIds: [],
      helperNotApplicableToolCallIds: [],
      fallbackUsed: false,
      declaredEntrypoints: ["api-task-solidify.js"],
      documentationOnly: false,
      residualWorkRequired: false,
      residualWorkCompleted: false,
      taskOutcome: "not-checked",
      consumptionComplete: false,
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

  test("recognizes an exit-zero structured ok result without accepting ok false", () => {
    const analysis = analyzeSkillConsumption([{
      role: "assistant",
      timestamp: 1,
      toolCalls: [{
        id: "failed-ok",
        name: "bash",
        input: { command: "python skill/scripts/check_json_locales.py bad.json" },
        output: "{\"ok\":false,\"missingKeys\":[\"title\"]}",
        exitCode: 0,
      }, {
        id: "successful-ok",
        name: "bash",
        input: { command: "python skill/scripts/check_json_locales.py good.json" },
        output: "{\"ok\":true,\"missingKeys\":[]}",
        exitCode: 0,
      }],
    }], {
      executableEntries: ["scripts/check_json_locales.py"],
    })

    expect(analysis.helperSuccessfulToolCallIds).toEqual(["successful-ok"])
    expect(analysis.helperFailedToolCallIds).toEqual(["failed-ok"])
    expect(analysis.helperSucceeded).toBe(true)
  })

  test("uses arbitrary declared entrypoints and does not count help or failed calls as success", () => {
    const analysis = analyzeSkillConsumption([
      {
        role: "assistant",
        timestamp: 1,
        toolCalls: [{
          id: "read-generic",
          name: "execute_command",
          input: { command: "Get-Content ./portable/SKILL.md" },
          output: "# Portable",
          exitCode: 0,
        }],
      },
      {
        role: "assistant",
        timestamp: 2,
        toolCalls: [{
          id: "help",
          name: "execute_command",
          input: { command: "python portable/tools/transform_records.py --help" },
          output: "Usage: transform_records",
          exitCode: 0,
        }, {
          id: "failed",
          name: "execute_command",
          input: { command: "python portable/tools/transform_records.py --input missing.json" },
          output: "required input unavailable",
          exitCode: 3,
        }, {
          id: "success",
          name: "execute_command",
          input: { command: "python portable/tools/transform_records.py --input rows.json" },
          output: "{\"status\":\"success\",\"output\":\"result.json\"}",
          exitCode: 0,
        }],
      },
    ], {
      skillPaths: ["portable/SKILL.md"],
      executableEntries: ["tools/transform_records.py"],
      residualWorkRequired: true,
      residualWorkCompleted: true,
      taskOutcome: "passed",
    })

    expect(analysis).toMatchObject({
      skillRead: true,
      helperInvoked: true,
      helperSucceeded: true,
      helperHelpToolCallIds: ["help"],
      helperFailedToolCallIds: ["failed"],
      helperSuccessfulToolCallIds: ["success"],
      residualWorkCompleted: true,
      taskOutcome: "passed",
      consumptionComplete: true,
    })
  })

  test("allows a documentation-only package to complete through a real read and independently checked task result", () => {
    const analysis = analyzeSkillConsumption([{
      role: "assistant",
      timestamp: 1,
      toolCalls: [{
        id: "read-docs",
        name: "read_file",
        input: { path: "skill/SKILL.md" },
        output: "# Review workflow",
        exitCode: 0,
      }],
    }], {
      executableEntries: [],
      documentationOnly: true,
      taskOutcome: "passed",
    })

    expect(analysis).toMatchObject({
      skillRead: true,
      helperInvoked: false,
      helperSucceeded: false,
      documentationOnly: true,
      consumptionComplete: true,
    })
  })

  test("allows the original workflow only after an explicit not-applicable helper result", () => {
    const analysis = analyzeSkillConsumption([{
      role: "assistant",
      timestamp: 1,
      toolCalls: [{ id: "read", name: "read", input: { path: "skill/SKILL.md" }, exitCode: 0 }, {
        id: "unsupported",
        name: "exec",
        input: { command: "node skill/bin/project.mjs input.bin" },
        output: "{\"status\":\"not-applicable\",\"reason\":\"unsupported format\"}",
        exitCode: 2,
      }],
    }], {
      executableEntries: ["bin/project.mjs"],
      taskOutcome: "passed",
    })

    expect(analysis).toMatchObject({
      helperInvoked: true,
      helperSucceeded: false,
      helperNotApplicableToolCallIds: ["unsupported"],
      helperFailedToolCallIds: [],
      fallbackUsed: true,
      consumptionComplete: true,
    })
  })
})
