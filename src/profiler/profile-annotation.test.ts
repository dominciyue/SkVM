import { describe, expect, test } from "bun:test";
import { buildProfileAnnotations } from "./profile-annotation";
import type { ExecutionTrace } from "./trace-schema";

function trace(overrides: Partial<ExecutionTrace>): ExecutionTrace {
  return {
    schemaVersion: "skill-ir-trace/v1",
    traceId: "trace-default",
    skillId: "skill-review",
    agent: "codex",
    environment: "windows",
    context: "noisy",
    taskId: "review-finding-order-001",
    success: false,
    tokenCost: 1000,
    latencyMs: 5000,
    events: [],
    ...overrides,
  };
}

describe("buildProfileAnnotations", () => {
  test("turns repeated rule violations into frequent-failure annotations", () => {
    const annotations = buildProfileAnnotations([
      trace({
        traceId: "trace-1",
        events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
      }),
      trace({
        traceId: "trace-2",
        agent: "skvm",
        environment: "linux",
        context: "long",
        taskId: "review-missing-test-001",
        events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
      }),
    ]);

    expect(annotations[0]).toMatchObject({
      targetRef: "rule-findings-first",
      observation: "frequent-failure",
      evidenceCount: 2,
      suggestedPass: "profile-guided-repair",
    });
  });

  test("turns repeated skipped steps into frequent-skip annotations", () => {
    const annotations = buildProfileAnnotations([
      trace({
        traceId: "trace-1",
        events: [{ kind: "step-skip", targetRef: "step-read-diff", message: "No diff read" }],
      }),
      trace({
        traceId: "trace-2",
        events: [{ kind: "step-skip", targetRef: "step-read-diff", message: "No diff read" }],
      }),
    ]);

    expect(annotations[0]).toMatchObject({
      targetRef: "step-read-diff",
      observation: "frequent-skip",
      evidenceCount: 2,
    });
  });

  test("turns repeated tool errors into environment-sensitive annotations", () => {
    const annotations = buildProfileAnnotations([
      trace({
        traceId: "trace-1",
        events: [{ kind: "tool-error", targetRef: "tool-shell", message: "sh missing" }],
      }),
      trace({
        traceId: "trace-2",
        environment: "linux",
        events: [{ kind: "tool-error", targetRef: "tool-shell", message: "shell mismatch" }],
      }),
    ]);

    expect(annotations[0]).toMatchObject({
      targetRef: "tool-shell",
      observation: "environment-sensitive",
      evidenceCount: 2,
    });
  });

  test("ignores low-frequency events", () => {
    const annotations = buildProfileAnnotations([
      trace({
        traceId: "trace-1",
        events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
      }),
    ]);

    expect(annotations).toEqual([]);
  });

  test("allows the minimum evidence threshold to be configured for small calibration runs", () => {
    const annotations = buildProfileAnnotations(
      [
        trace({
          traceId: "trace-1",
          events: [{ kind: "rule-violation", targetRef: "rule-findings-first", message: "Bad order" }],
        }),
      ],
      { minEvidence: 1 },
    );

    expect(annotations).toContainEqual({
      id: "profile-rule-findings-first",
      sourceTrace: "trace-1",
      targetRef: "rule-findings-first",
      observation: "frequent-failure",
      evidenceCount: 1,
      suggestedPass: "profile-guided-repair",
    });
  });
});
