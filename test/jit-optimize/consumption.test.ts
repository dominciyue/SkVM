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
    ], {
      skillPaths: ["skill/SKILL.md"],
      executableEntries: ["scripts/api-task-solidify.js"],
    })
    expect(analysis).toEqual({
      skillRead: true,
      helperInvoked: true,
      helperSucceeded: true,
      skillReadToolCallIds: ["read-1"],
      skillReadUnknownToolCallIds: [],
      helperToolCallIds: ["bash-1"],
      helperSuccessfulToolCallIds: ["bash-1"],
      helperHelpToolCallIds: [],
      helperFailedToolCallIds: [],
      helperNotApplicableToolCallIds: [],
      helperUnassertedToolCallIds: [],
      helperUnknownToolCallIds: [],
      entrypointDiscoveryToolCallIds: [],
      programRewriteToolCallIds: [],
      programExecutionToolCallIds: ["bash-1"],
      helperExitStatus: { zero: ["bash-1"], nonZero: [], unknown: [] },
      helperOutputAssertion: { passed: ["bash-1"], failed: [], notApplicable: [], unknown: [] },
      invocations: [{
        toolCallId: "bash-1",
        entry: "scripts/api-task-solidify.js",
        match: "shell-command",
        exitStatus: "zero",
        outputAssertion: "passed",
      }],
      observations: {
        skillReadCount: 1,
        helperInvocationCount: 1,
        helperHelpCount: 0,
        entrypointDiscoveryCount: 0,
        programRewriteCount: 0,
        programExecutionCount: 1,
      },
      fallbackUsed: false,
      declaredEntrypoints: ["scripts/api-task-solidify.js"],
      documentationOnly: false,
      residualWorkRequired: false,
      residualWorkCompleted: false,
      taskOutcome: "not-checked",
      taskQuality: { status: "not-checked", passed: false },
      residualCompletion: { required: false, completed: false },
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
    }], { executableEntries: ["scripts/api-task-solidify.js"] })
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
      helperUnassertedToolCallIds: [],
      residualWorkCompleted: true,
      taskOutcome: "passed",
      consumptionComplete: true,
    })
  })

  test("matches structured argv exactly and ignores echo/cat mentions and same-name directories", () => {
    const analysis = analyzeSkillConsumption([{
      role: "tool",
      timestamp: 1,
      toolCalls: [{
        id: "echo-mention",
        name: "execute_command",
        input: { command: "echo node skill/tools/convert.mjs" },
        output: "node skill/tools/convert.mjs",
        exitCode: 0,
      }, {
        id: "cat-mention",
        name: "execute_command",
        input: { command: "cat other/tools/convert.mjs" },
        output: "...",
        exitCode: 0,
      }, {
        id: "structured-run",
        name: "execute_command",
        input: { program: "node", args: ["skill/tools/convert.mjs", "--input", "rows.json"] },
        output: "{\"status\":\"success\"}",
        exitCode: 0,
      }],
    }], {
      skillPaths: ["skill/SKILL.md"],
      executableEntries: ["tools/convert.mjs"],
    })

    expect(analysis.helperToolCallIds).toEqual(["structured-run"])
    expect(analysis.helperUnknownToolCallIds).toEqual([])
    expect(analysis.invocations).toEqual([expect.objectContaining({
      toolCallId: "structured-run",
      match: "structured-argv",
      entry: "tools/convert.mjs",
    })])
  })

  test("does not assume the API helper when no entrypoint is declared", () => {
    const analysis = analyzeSkillConsumption([{
      role: "tool",
      timestamp: 1,
      toolCalls: [{
        id: "api-implicit",
        name: "execute_command",
        input: { command: "node skill/api-task-solidify.js" },
        output: "{\"status\":\"passed\"}",
        exitCode: 0,
      }],
    }])

    expect(analysis.declaredEntrypoints).toEqual([])
    expect(analysis.helperInvoked).toBe(false)
    expect(analysis.helperToolCallIds).toEqual([])
  })

  test("keeps a normal exit separate from output assertion and task quality", () => {
    const analysis = analyzeSkillConsumption([{
      role: "tool",
      timestamp: 1,
      toolCalls: [{
        id: "plain-success",
        name: "execute_command",
        input: { argv: ["python", "skill/tools/convert.py", "rows.json"] },
        output: "completed without a structured result",
        exitCode: 0,
      }],
    }], {
      skillPaths: ["skill/SKILL.md"],
      executableEntries: ["tools/convert.py"],
      taskOutcome: "not-checked",
    })

    expect(analysis.helperInvoked).toBe(true)
    expect(analysis.helperSucceeded).toBe(false)
    expect(analysis.helperFailedToolCallIds).toEqual([])
    expect(analysis.helperUnassertedToolCallIds).toEqual(["plain-success"])
    expect(analysis.helperExitStatus).toEqual({ zero: ["plain-success"], nonZero: [], unknown: [] })
    expect(analysis.helperOutputAssertion).toEqual({ passed: [], failed: [], notApplicable: [], unknown: ["plain-success"] })
    expect(analysis.taskQuality).toEqual({ status: "not-checked", passed: false })
  })

  test("retains unknown exits and reports entry discovery, rewrite, and execution separately", () => {
    const analysis = analyzeSkillConsumption([{
      role: "tool",
      timestamp: 1,
      toolCalls: [{
        id: "read-skill",
        name: "read_file",
        input: { path: "skill/SKILL.md" },
        exitCode: 0,
      }, {
        id: "read-entry",
        name: "read_file",
        input: { path: "skill/tools/convert.py" },
        exitCode: 0,
      }, {
        id: "rewrite-entry",
        name: "write_file",
        input: { path: "skill/tools/convert.py", content: "print('new')" },
        exitCode: 0,
      }, {
        id: "unknown-run",
        name: "execute_command",
        input: { argv: ["python", "skill/tools/convert.py"] },
        output: "finished",
      }],
    }], {
      skillPaths: ["skill/SKILL.md"],
      executableEntries: ["tools/convert.py"],
    })

    expect(analysis.helperUnknownToolCallIds).toEqual(["unknown-run"])
    expect(analysis.helperFailedToolCallIds).toEqual([])
    expect(analysis.observations).toEqual({
      skillReadCount: 1,
      helperInvocationCount: 1,
      helperHelpCount: 0,
      entrypointDiscoveryCount: 1,
      programRewriteCount: 1,
      programExecutionCount: 1,
    })
    expect(analysis.entrypointDiscoveryToolCallIds).toEqual(["read-entry"])
    expect(analysis.programRewriteToolCallIds).toEqual(["rewrite-entry"])
  })

  test("marks an ambiguous shell mention unknown without proving execution", () => {
    const analysis = analyzeSkillConsumption([{
      role: "tool",
      timestamp: 1,
      toolCalls: [{
        id: "ambiguous",
        name: "execute_command",
        input: { command: "node skill/tools/convert.py && echo done" },
        output: "done",
        exitCode: 0,
      }],
    }], {
      skillPaths: ["skill/SKILL.md"],
      executableEntries: ["tools/convert.py"],
    })

    expect(analysis.helperInvoked).toBe(false)
    expect(analysis.helperToolCallIds).toEqual([])
    expect(analysis.helperUnknownToolCallIds).toEqual(["ambiguous"])
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
