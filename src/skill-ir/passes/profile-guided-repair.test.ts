import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../schema";
import { applyProfileGuidedRepair } from "./profile-guided-repair";

function baseIr(overrides: Partial<SkillIR> = {}): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-profiled",
    name: "Profiled Skill",
    category: ["workflow"],
    intent: "Improve skill behavior from execution traces.",
    source: { kind: "inline", text: "profiled skill" },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
    ...overrides,
  };
}

describe("applyProfileGuidedRepair", () => {
  test("adds retryable step-success checks for frequently skipped steps", () => {
    const ir = baseIr({
      profile: [
        {
          id: "profile-step-read",
          sourceTrace: "trace-1",
          targetRef: "step-read",
          observation: "frequent-skip",
          evidenceCount: 3,
          suggestedPass: "profile-guided-repair",
        },
      ],
    });

    expect(applyProfileGuidedRepair(ir).checks).toContainEqual({
      id: "check-step-read-profile",
      name: "Profile check for step-read",
      kind: "step-success",
      targetRef: "step-read",
      assertion: "Execution trace contains evidence that this required step completed.",
      onFailure: "retry",
    });
  });

  test("adds retry recovery policies for frequent failures", () => {
    const ir = baseIr({
      profile: [
        {
          id: "profile-rule-output",
          sourceTrace: "trace-1",
          targetRef: "rule-output",
          observation: "frequent-failure",
          evidenceCount: 4,
          suggestedPass: "profile-guided-repair",
        },
      ],
    });

    expect(applyProfileGuidedRepair(ir).recovery).toContainEqual({
      id: "recover-rule-output",
      trigger: "rule-output",
      action: "retry",
      maxAttempts: 1,
      explanation: "Profile-guided repair from 4 trace observations.",
    });
  });

  test("does not duplicate generated checks or recovery policies and does not mutate the input", () => {
    const existingCheck = {
      id: "check-step-read-profile",
      name: "Existing profile check",
      kind: "step-success" as const,
      targetRef: "step-read",
      assertion: "Existing assertion.",
      onFailure: "report" as const,
    };
    const existingRecovery = {
      id: "recover-rule-output",
      trigger: "rule-output",
      action: "retry" as const,
      maxAttempts: 2,
      explanation: "Existing recovery.",
    };
    const ir = baseIr({
      checks: [existingCheck],
      recovery: [existingRecovery],
      profile: [
        {
          id: "profile-step-read",
          sourceTrace: "trace-1",
          targetRef: "step-read",
          observation: "frequent-skip",
          evidenceCount: 3,
          suggestedPass: "profile-guided-repair",
        },
        {
          id: "profile-rule-output",
          sourceTrace: "trace-1",
          targetRef: "rule-output",
          observation: "frequent-failure",
          evidenceCount: 4,
          suggestedPass: "profile-guided-repair",
        },
      ],
    });
    const originalChecks = [...ir.checks];
    const originalRecovery = [...ir.recovery];

    const repaired = applyProfileGuidedRepair(ir);

    expect(repaired.checks).toEqual([existingCheck]);
    expect(repaired.recovery).toEqual([existingRecovery]);
    expect(ir.checks).toEqual(originalChecks);
    expect(ir.recovery).toEqual(originalRecovery);
  });
});
