import { describe, expect, test } from "bun:test";
import type { ExecutionEnvelope } from "./execution-resilience";
import {
  buildExecutionEnvelope,
  executeStaticDevelopmentV2Candidates,
  selectRawRowsForScoring,
} from "./static-development-v2-run";
import type { RunExecutionObservation } from "../../core/types";
import type { StaticDevelopmentV2Plan } from "./static-development-v2";

function envelope(taskId: string, block: number, system: string, empty = false): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: "future-static-v2",
    taskId,
    system,
    candidateBlock: block,
    attemptId: `${taskId}:block-${block}:${system}`,
    process: { started: true, exitCode: 0, termination: "natural", durationMs: 10 },
    activity: {
      requestDispatched: true, providerResponses: 1, assistantMessages: empty ? 0 : 1,
      toolCalls: 0, toolResults: 0,
    },
    terminal: { present: true, stopReason: "stop" },
    usage: { available: true, input: empty ? 0 : 10, output: empty ? 0 : 2, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: empty ? "empty" : "ok", unknownTypes: [] },
    outputs: { fileCount: empty ? 0 : 1 },
    classification: empty ? "empty-terminal" : "semantic-complete",
    replacementEligible: empty,
  };
}

describe("static development v2 sequential runner", () => {
  test("combines a value-free sidecar with row identity and canonical classification", () => {
    const observation: RunExecutionObservation = {
      schemaVersion: "skvm-run-execution-observation/v1",
      process: { exitCode: 0, termination: "natural", durationMs: 10 },
      activity: { requestDispatched: true, providerResponses: 1, assistantMessages: 0, toolCalls: 0, toolResults: 0 },
      terminal: { present: true, stopReason: "stop" },
      usage: { available: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: "empty", unknownTypes: [] },
    };
    expect(buildExecutionEnvelope({
      experimentId: "future-static-v2", taskId: "task-a", system: "original", candidateBlock: 1,
      attemptId: "task-a:block-1:original", observation, outputFileCount: 0,
    })).toMatchObject({ classification: "empty-terminal", replacementEligible: true });
  });

  test("never executes unused reserve rows and persists all attempted rows", async () => {
    const systems = ["no-skill", "original", "ir-static"] as const;
    const planRows = [];
    for (const runIndex of [1, 2, 3]) for (const system of systems) planRows.push({
      caseId: "skill:skvm:windows:clean:task-a", system, runIndex,
    });
    const calls: string[] = [];
    const result = await executeStaticDevelopmentV2Candidates({
      plan: { plan: planRows } as unknown as StaticDevelopmentV2Plan,
      taskIds: ["task-a"], systems, targetBlocksPerTask: 2, reserveBlocksPerTask: 1,
      executeRow: async (row) => {
        calls.push(`${row.runIndex}:${row.system}`);
        const evidence = envelope("task-a", row.runIndex, row.system, row.runIndex === 1 && row.system === "original");
        return { raw: { attemptId: evidence.attemptId }, envelope: evidence };
      },
    });
    expect(calls).toHaveLength(9);
    expect(result.selection.selectedBlocks.map((block) => block.candidateBlock)).toEqual([2, 3]);
    expect(result.rawRows).toHaveLength(9);
    expect(result.envelopes).toHaveLength(9);
  });

  test("stops before future task blocks after an execution blocker", async () => {
    const systems = ["no-skill", "original", "ir-static"] as const;
    const planRows = ["task-a", "task-b"].flatMap((taskId) => systems.map((system) => ({
      caseId: `skill:skvm:windows:clean:${taskId}`, system, runIndex: 1,
    })));
    const calls: string[] = [];
    const result = await executeStaticDevelopmentV2Candidates({
      plan: { plan: planRows } as unknown as StaticDevelopmentV2Plan,
      taskIds: ["task-a", "task-b"], systems, targetBlocksPerTask: 1, reserveBlocksPerTask: 0,
      executeRow: async (row) => {
        calls.push(`${row.caseId}:${row.system}`);
        const base = envelope("task-a", 1, row.system);
        const evidence = row.system === "original"
          ? { ...base, process: { started: true, exitCode: 3, termination: "crash" as const, durationMs: 10 }, terminal: { present: false }, classification: "runtime-crash" as const }
          : base;
        return { raw: {}, envelope: evidence };
      },
    });
    expect(result.selection.abortReason).toBe("execution-blocker");
    expect(calls).toHaveLength(3);
  });

  test("scores every semantic attempt only after selection is fixed", () => {
    const systems = ["no-skill", "original", "ir-static"];
    const rawRows = [1, 2].flatMap((runIndex) => systems.map((system) => ({
      caseId: "skill:skvm:windows:clean:task-a", system, runIndex,
    })));
    const envelopes = [1, 2].flatMap((block) => systems.map((system) => envelope("task-a", block, system)));
    envelopes.find((item) => item.candidateBlock === 2 && item.system === "ir-static")!.classification = "active-absolute-timeout";
    expect(selectRawRowsForScoring({
      rawRows,
      selectedBlocks: [{ taskId: "task-a", candidateBlock: 2 }],
      envelopes,
    })).toHaveLength(5);
  });
});
