import { describe, expect, test } from "bun:test"
import type { AgentStep } from "../../src/core/types.ts"
import { buildOperationContext } from "../../src/jit-optimize/operation-context.ts"
import type { Evidence } from "../../src/jit-optimize/types.ts"

function evidenceFromSteps(steps: AgentStep[]): Evidence {
  return {
    taskId: "operation-trace",
    taskPrompt: "Read the input, run the existing transformer, and write the result. Also mention scripts/not-run.py in the report.",
    conversationLog: [
      {
        type: "request",
        ts: "2026-09-14T00:00:00Z",
        text: "Read the input, run the existing transformer, and write the result. Also mention scripts/not-run.py in the report.",
      },
      {
        type: "response",
        ts: "2026-09-14T00:00:01Z",
        text: "I will also use scripts/not-run.py.",
        toolCalls: steps[0]?.toolCalls ?? [],
        sourceLocator: "trace:response-1",
      },
    ],
    trace: {
      format: "test",
      representation: "conversation-trace",
      sourcePath: "trace.jsonl",
      inputSha256: "a".repeat(64),
      recordLocator: "record:0",
      taskIdSource: "source",
      workDirPath: "C:/work",
      unknownFields: [],
      diagnostics: [],
    },
  }
}

describe("operation context", () => {
  test("recognizes Pi file and bash events without confusing searches with execution", () => {
    const context = buildOperationContext([{
      role: "assistant", timestamp: 1000,
      toolCalls: [
        { id: "pi-read", name: "read", input: { path: "./input.json" } },
        { id: "pi-edit", name: "edit", input: { path: "./input.json", edits: [] } },
        { id: "pi-write", name: "write", input: { path: "./out.json", content: "{}" } },
        { id: "pi-run", name: "bash", input: { command: "node ./skill/scripts/convert.mjs --input input.json --out out.json" }, exitCode: 0 },
        { id: "pi-find", name: "find", input: { pattern: "scripts/convert.mjs", path: "." } },
      ],
    }], { sourceEntries: ["scripts/convert.mjs"] })
    expect(context.operations.map((item) => item.kind)).toEqual(["read", "write", "write", "execute", "other"])
    expect(context.operations[3]).toMatchObject({
      toolCallId: "pi-run", toolName: "bash", entry: "skill/scripts/convert.mjs", exitCode: 0,
    })
    expect(context.operations[4]?.entry).toBeUndefined()
    expect(context.summary.sourceEntriesNotCalled).toEqual([])
    expect(context.operations[3]?.executionRelation).toBe("existing-entry")
  })

  test("retains the real call ID from a bound Pi conversation locator", () => {
    const observed = evidenceFromSteps([])
    observed.conversationLog = [{
      type: "tool", ts: "2026-09-14T00:00:01Z", name: "read",
      input: { path: "input.json" }, sourceLocator: "gzip-pi-events:tool-call:call_real",
    }]
    expect(buildOperationContext(observed).operations[0]?.toolCallId).toBe("call_real")
  })

  test("keeps written-entry history when a deployed entry also matches a source entry", () => {
    const context = buildOperationContext([{
      role: "assistant", timestamp: 1000, toolCalls: [
        { id: "write-program", name: "write", input: { path: "skill/scripts/convert.mjs", content: "" } },
        { id: "run-program", name: "bash", input: { command: "node skill/scripts/convert.mjs" } },
      ],
    }], { sourceEntries: ["scripts/convert.mjs"] })
    expect(context.summary.writtenThenExecuted).toEqual(["skill/scripts/convert.mjs"])
    expect(context.summary.sourceEntriesNotCalled).toEqual([])
  })

  test("records only actual read, execute, and write calls with locators and raw argv", () => {
    const steps: AgentStep[] = [{
      role: "assistant",
      timestamp: 1000,
      toolCalls: [
        { id: "call-read", name: "read_file", input: { path: "input/data.csv" }, output: "a,b\n1,2\n", durationMs: 2 },
        {
          id: "call-run",
          name: "execute_command",
          input: { command: "python scripts/transform.py --input input/data.csv --out output/report.json" },
          output: "wrote output/report.json\nexit code: 0",
          exitCode: 0,
          durationMs: 12,
        },
        { id: "call-write", name: "write_file", input: { path: "output/report.md", content: "done" }, output: "File written: output/report.md", durationMs: 1 },
      ],
    }]
    const context = buildOperationContext(evidenceFromSteps(steps), {
      sourceEntries: ["scripts/transform.py", "scripts/not-run.py"],
    })

    expect(context.schemaVersion).toBe("jit-optimize-operation-context/v1")
    expect(context.operations.map((operation) => operation.toolCallId)).toEqual([
      "call-read", "call-run", "call-write",
    ])
    expect(context.operations[0]).toMatchObject({
      kind: "read",
      readFiles: ["input/data.csv"],
      sourceLocator: "trace:response-1#tool-call/call-read",
    })
    expect(context.operations[1]).toMatchObject({
      kind: "execute",
      entry: "scripts/transform.py",
      argv: ["python", "scripts/transform.py", "--input", "input/data.csv", "--out", "output/report.json"],
      cwd: "C:/work",
      writeFiles: ["output/report.json"],
      exitCode: 0,
      durationMs: 12,
      status: "observed",
    })
    expect(context.operations[2]).toMatchObject({
      kind: "write",
      writeFiles: ["output/report.md"],
    })
    expect(context.operations.some((operation) => operation.entry === "scripts/not-run.py")).toBe(false)
    expect(context.summary.sourceEntriesNotCalled).toEqual(["scripts/not-run.py"])
  })

  test("distinguishes a temporary script that was written before execution and keeps repeated calls", () => {
    const steps: AgentStep[] = [{
      role: "assistant",
      timestamp: 1000,
      toolCalls: [
        { id: "call-temp-write", name: "write_file", input: { path: "tmp/generated.py", content: "print('ok')" }, output: "File written: tmp/generated.py" },
        { id: "call-temp-run-1", name: "execute_command", input: { command: "python tmp/generated.py" }, output: "exit code: 0", exitCode: 0 },
        { id: "call-temp-run-2", name: "execute_command", input: { command: "python tmp/generated.py" }, output: "exit code: 0", exitCode: 0 },
      ],
    }]
    const context = buildOperationContext(steps)

    expect(context.operations.filter((operation) => operation.toolCallId?.startsWith("call-temp-run")).map((operation) => operation.executionRelation))
      .toEqual(["written-entry", "written-entry"])
    expect(context.summary.repeatedEntries).toEqual(["tmp/generated.py"])
    expect(context.summary.writtenThenExecuted).toEqual(["tmp/generated.py"])
  })

  test("retains ambiguous shell commands as unknown instead of guessing argv", () => {
    const context = buildOperationContext([{
      role: "assistant",
      timestamp: 1000,
      toolCalls: [{
        id: "call-ambiguous",
        name: "execute_command",
        input: { command: "python scripts/a.py | python scripts/b.py; echo done" },
        output: "exit code: 0",
        exitCode: 0,
      }],
    }])

    expect(context.operations[0]).toMatchObject({
      status: "unknown",
      unknownReason: "ambiguous-shell-command",
    })
    expect(context.operations[0]?.argv).toBeUndefined()
    expect(context.operations[0]?.sourceLocator).toContain("call-ambiguous")
  })

  test("binds positional and --input values to the task prompt without splitting a spaced Chinese path", () => {
    const taskPrompt = "把 数据/原始 文档.txt 转成 Markdown，输入文件就是这个带空格的路径。"
    const context = buildOperationContext({
      taskId: "provenance-path",
      taskPrompt,
      conversationLog: [],
      trace: {
        format: "test",
        representation: "conversation-trace",
        sourcePath: "trace.jsonl",
        inputSha256: "b".repeat(64),
        recordLocator: "record:1",
        taskIdSource: "source",
        unknownFields: [],
        diagnostics: [],
      },
      steps: [{
        role: "assistant",
        timestamp: 1000,
        toolCalls: [{
          id: "call-path",
          name: "execute_command",
          input: {
            command: "python scripts/convert.py \"数据/原始 文档.txt\" --input \"数据/原始 文档.txt\"",
          },
          exitCode: 0,
        }],
      }],
    } as Evidence & { steps: AgentStep[] }, {
      sourceEntries: ["scripts/convert.py"],
    })

    const parameters = context.operations[0]?.parameters ?? []
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "arg0",
      binding: "argv",
      value: "数据/原始 文档.txt",
      origin: "task-variable",
      present: true,
    }))
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "input",
      binding: "argv",
      value: "数据/原始 文档.txt",
      origin: "task-variable",
      present: true,
    }))
    expect(parameters.find((parameter) => parameter.name === "input")?.promptIndex).toBeGreaterThanOrEqual(0)
  })

  test("marks source-fixed constants, config fields and missing optional values separately", () => {
    const context = buildOperationContext({
      taskId: "provenance-config",
      taskPrompt: "生成配置驱动的报告。输入文件由任务提供。",
      conversationLog: [],
      workDirSnapshot: {
        files: new Map([
          ["config.json", JSON.stringify({ input: "数据/原始 文档.txt", mode: "strict" })],
        ]),
      },
      trace: {
        format: "test",
        representation: "conversation-trace",
        sourcePath: "trace.jsonl",
        inputSha256: "c".repeat(64),
        recordLocator: "record:2",
        taskIdSource: "source",
        unknownFields: [],
        diagnostics: [],
      },
      steps: [{
        role: "assistant",
        timestamp: 1000,
        toolCalls: [{
          id: "call-config",
          name: "execute_command",
          input: {
            command: "python scripts/convert.py --config config.json --seed 42",
            configPath: "config.json",
          },
          exitCode: 0,
        }],
      }],
    } as Evidence & { steps: AgentStep[] }, {
      sourceEntries: ["scripts/convert.py"],
      sourceParameterRules: [
        { name: "seed", binding: "argv", origin: "source-fixed", values: ["42"], sourceLocator: "SKILL.md:88" },
        { name: "input", binding: "config-field", origin: "task-variable", sourceLocator: "SKILL.md:12", required: true },
        { name: "output", binding: "config-field", origin: "task-variable", sourceLocator: "SKILL.md:13", optional: true },
      ],
    })

    const parameters = context.operations[0]?.parameters ?? []
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "seed",
      binding: "argv",
      value: "42",
      origin: "source-fixed",
      present: true,
    }))
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "input",
      binding: "config-field",
      value: "数据/原始 文档.txt",
      origin: "task-variable",
      configField: "input",
      present: true,
    }))
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "output",
      binding: "config-field",
      origin: "unknown",
      configField: "output",
      present: false,
      optional: true,
    }))
  })

  test("does not bind an old prompt path or globally rewrite an observed path", () => {
    const oldPath = "数据/旧 文档.txt"
    const newPath = "数据/新 文档.txt"
    const taskPrompt = `迁移 ${oldPath} 的处理流程，当前实际输入改为 ${newPath}。`
    const context = buildOperationContext({
      taskId: "provenance-old-path",
      taskPrompt,
      conversationLog: [],
      trace: {
        format: "test",
        representation: "conversation-trace",
        sourcePath: "trace.jsonl",
        inputSha256: "d".repeat(64),
        recordLocator: "record:3",
        taskIdSource: "source",
        unknownFields: [],
        diagnostics: [],
      },
      steps: [{
        role: "assistant",
        timestamp: 1000,
        toolCalls: [{
          id: "call-new-path",
          name: "execute_command",
          input: { command: `python scripts/convert.py --input "${newPath}"` },
          exitCode: 0,
        }],
      }],
    } as Evidence & { steps: AgentStep[] }, {
      sourceEntries: ["scripts/convert.py"],
    })

    const parameters = context.operations[0]?.parameters ?? []
    expect(parameters).toContainEqual(expect.objectContaining({
      name: "input",
      value: newPath,
      origin: "task-variable",
      present: true,
    }))
    expect(parameters.some((parameter) => parameter.value === oldPath)).toBe(false)
    expect(context.operations[0]?.rawCommand).toContain(newPath)
    expect(context.operations[0]?.rawCommand).not.toContain(`${newPath.replace("新", "旧")}`)
  })
})
