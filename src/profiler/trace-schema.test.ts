import { describe, expect, test } from "bun:test";
import { ExecutionTraceSchema } from "./trace-schema";

describe("ExecutionTraceSchema", () => {
  test("accepts a trace with rule violation evidence", () => {
    const trace = ExecutionTraceSchema.parse({
      schemaVersion: "skill-ir-trace/v1",
      traceId: "trace-001",
      skillId: "skill-review",
      agent: "codex",
      environment: "windows",
      context: "noisy",
      taskId: "review-finding-order-001",
      success: false,
      tokenCost: 1200,
      latencyMs: 8000,
      events: [
        {
          kind: "rule-violation",
          targetRef: "rule-findings-first",
          message: "Summary appeared before findings.",
        },
      ],
    });

    expect(trace.success).toBe(false);
    expect(trace.events[0]!.kind).toBe("rule-violation");
  });

  test("rejects negative token cost and latency", () => {
    expect(() =>
      ExecutionTraceSchema.parse({
        schemaVersion: "skill-ir-trace/v1",
        traceId: "trace-bad",
        skillId: "skill-review",
        agent: "codex",
        environment: "windows",
        context: "clean",
        taskId: "review-finding-order-001",
        success: true,
        tokenCost: -1,
        latencyMs: -1,
        events: [],
      }),
    ).toThrow();
  });
});
