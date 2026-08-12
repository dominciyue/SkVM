import { describe, expect, test } from "bun:test";
import {
  ExecutionEnvelopeSchema,
  classifyExecutionEnvelope,
  selectMatchedExecutionBlocks,
  type ExecutionEnvelope,
} from "./execution-resilience";

function envelope(overrides: Partial<ExecutionEnvelope> = {}): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: "future-static-v2",
    taskId: "task-a",
    system: "no-skill",
    candidateBlock: 1,
    attemptId: "task-a:block-1:no-skill",
    process: {
      started: true,
      exitCode: 0,
      termination: "natural",
      durationMs: 1000,
    },
    activity: {
      requestDispatched: true,
      providerResponses: 1,
      assistantMessages: 1,
      toolCalls: 0,
      toolResults: 0,
      firstActivityMs: 100,
      lastActivityMs: 900,
    },
    terminal: { present: true, stopReason: "stop" },
    usage: { available: true, input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: "ok", unknownTypes: [] },
    outputs: { fileCount: 1 },
    classification: "semantic-complete",
    replacementEligible: false,
    ...overrides,
  };
}

describe("execution resilience envelope", () => {
  test("classifies only pre-semantic transient failures as replacement eligible", () => {
    const empty = classifyExecutionEnvelope(envelope({
      activity: {
        requestDispatched: true,
        providerResponses: 1,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
      },
      terminal: { present: true, stopReason: "stop" },
      usage: { available: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: "empty", unknownTypes: [] },
      outputs: { fileCount: 0 },
    }));
    expect(empty).toEqual({ classification: "empty-terminal", replacementEligible: true });

    const transport = classifyExecutionEnvelope(envelope({
      process: { started: true, exitCode: 1, termination: "crash", durationMs: 100 },
      activity: {
        requestDispatched: true,
        providerResponses: 0,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
      },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: "empty", unknownTypes: [] },
      outputs: { fileCount: 0 },
      transientError: "provider-5xx",
    }));
    expect(transport).toEqual({ classification: "transport-transient", replacementEligible: true });
  });

  test("fails closed for parser/runtime blockers and preserves active timeouts", () => {
    const parser = classifyExecutionEnvelope(envelope({
      parser: { outcome: "incompatible", unknownTypes: ["thinking"] },
    }));
    expect(parser).toEqual({ classification: "parser-incompatible", replacementEligible: false });

    const activeTimeout = classifyExecutionEnvelope(envelope({
      process: { started: true, exitCode: 143, termination: "absolute-timeout", durationMs: 600000 },
      terminal: { present: false },
    }));
    expect(activeTimeout).toEqual({ classification: "active-absolute-timeout", replacementEligible: false });

    const runtime = classifyExecutionEnvelope(envelope({
      process: { started: true, exitCode: 3, termination: "crash", durationMs: 1000 },
      terminal: { present: false },
    }));
    expect(runtime).toEqual({ classification: "runtime-crash", replacementEligible: false });
  });

  test("strict compact schema rejects private payload fields", () => {
    expect(() => ExecutionEnvelopeSchema.parse({
      ...envelope(),
      stdout: "PRIVATE MODEL OUTPUT",
      apiKey: "secret",
    })).toThrow();
    expect(JSON.stringify(ExecutionEnvelopeSchema.parse(envelope()))).not.toMatch(/stdout|stderr|apiKey|toolArguments/);
  });
});

describe("matched execution block selection", () => {
  test("replaces the whole earliest transient triplet without reading scores", () => {
    const systems = ["no-skill", "original", "ir-static"] as const;
    const rows: ExecutionEnvelope[] = [];
    for (const candidateBlock of [1, 2, 3]) {
      for (const system of systems) {
        const base = envelope({
          system,
          candidateBlock,
          attemptId: `task-a:block-${candidateBlock}:${system}`,
        });
        rows.push(candidateBlock === 1 && system === "original"
          ? {
              ...base,
              activity: {
                requestDispatched: true,
                providerResponses: 1,
                assistantMessages: 0,
                toolCalls: 0,
                toolResults: 0,
              },
              terminal: { present: true, stopReason: "stop" },
              usage: { available: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              parser: { outcome: "empty", unknownTypes: [] },
              outputs: { fileCount: 0 },
              classification: "empty-terminal",
              replacementEligible: true,
            }
          : base);
      }
    }

    const selected = selectMatchedExecutionBlocks({
      taskIds: ["task-a"],
      systems,
      targetBlocksPerTask: 2,
      reserveBlocksPerTask: 1,
      envelopes: rows,
    });
    expect(selected).toMatchObject({
      complete: true,
      selectedBlocks: [
        { taskId: "task-a", candidateBlock: 2 },
        { taskId: "task-a", candidateBlock: 3 },
      ],
      replacedBlocks: [{ taskId: "task-a", candidateBlock: 1, reasons: ["empty-terminal"] }],
      attemptedRows: 9,
      selectedRows: 6,
    });
  });

  test("selects active failures into the denominator and fails on reserve exhaustion", () => {
    const systems = ["no-skill", "original", "ir-static"] as const;
    const activeRows = systems.map((system) => envelope({
      system,
      attemptId: `task-a:block-1:${system}`,
      ...(system === "ir-static"
        ? {
            process: {
              started: true,
              exitCode: 143,
              termination: "absolute-timeout" as const,
              durationMs: 600000,
            },
            terminal: { present: false },
            classification: "active-absolute-timeout" as const,
            replacementEligible: false,
          }
        : {}),
    }));
    expect(selectMatchedExecutionBlocks({
      taskIds: ["task-a"], systems, targetBlocksPerTask: 1, reserveBlocksPerTask: 0, envelopes: activeRows,
    })).toMatchObject({ complete: true, selectedBlocks: [{ taskId: "task-a", candidateBlock: 1 }] });

    const transientRows = activeRows.map((row) => ({
      ...row,
      process: { started: true, exitCode: 0, termination: "natural" as const, durationMs: 100 },
      activity: {
        requestDispatched: true,
        providerResponses: 1,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
      },
      terminal: { present: true, stopReason: "stop" },
      usage: { available: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: "empty" as const, unknownTypes: [] },
      outputs: { fileCount: 0 },
      classification: "empty-terminal" as const,
      replacementEligible: true,
    }));
    expect(selectMatchedExecutionBlocks({
      taskIds: ["task-a"], systems, targetBlocksPerTask: 1, reserveBlocksPerTask: 0, envelopes: transientRows,
    })).toMatchObject({ complete: false, abortReason: "replacement-budget-exhausted", selectedRows: 0 });
  });

  test("rejects a stored classification that disagrees with compact evidence", () => {
    const forged = envelope({ classification: "empty-terminal", replacementEligible: true });
    expect(() => selectMatchedExecutionBlocks({
      taskIds: ["task-a"],
      systems: ["no-skill", "original"],
      targetBlocksPerTask: 1,
      reserveBlocksPerTask: 0,
      envelopes: [forged, envelope({ system: "original", attemptId: "task-a:block-1:original" })],
    })).toThrow("classification mismatch");
  });
});
