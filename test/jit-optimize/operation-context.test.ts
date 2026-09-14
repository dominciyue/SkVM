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
})
