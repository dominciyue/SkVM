import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../schema";
import { normalizeRules } from "./rule-normalization";

function baseIr(overrides: Partial<SkillIR> = {}): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-review",
    name: "Code Review",
    category: ["workflow", "constraint-heavy"],
    intent: "Review code changes and report findings first.",
    source: { kind: "inline", text: "review skill" },
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

describe("normalizeRules", () => {
  test("generates output checks for runtime output rules", () => {
    const ir = baseIr({
      rules: [
        {
          id: "rule-findings-first",
          sourceText: "Findings should lead the response.",
          level: "must",
          scope: "output",
          checkability: "runtime",
          severity: "high",
          normalizedForm: "Output begins with review findings.",
        },
      ],
    });

    const normalized = normalizeRules(ir);

    expect(normalized.checks).toContainEqual({
      id: "check-rule-findings-first",
      name: "Check rule: rule-findings-first",
      kind: "output",
      targetRef: "rule-findings-first",
      assertion: "Output begins with review findings.",
      onFailure: "abort",
    });
  });

  test("generates report-only rule violation checks for non-output medium severity runtime rules", () => {
    const ir = baseIr({
      rules: [
        {
          id: "rule-read-before-edit",
          sourceText: "Read the target file before editing.",
          level: "must",
          scope: "file-edit",
          checkability: "runtime",
          severity: "medium",
          normalizedForm: "Trace reads the target file before applying edits.",
        },
      ],
    });

    const normalized = normalizeRules(ir);

    expect(normalized.checks).toContainEqual({
      id: "check-rule-read-before-edit",
      name: "Check rule: rule-read-before-edit",
      kind: "rule-violation",
      targetRef: "rule-read-before-edit",
      assertion: "Trace reads the target file before applying edits.",
      onFailure: "report",
    });
  });

  test("does not generate checks for static or human-checkable rules", () => {
    const ir = baseIr({
      rules: [
        {
          id: "rule-human",
          sourceText: "Use judgment.",
          level: "should",
          scope: "output",
          checkability: "human",
          severity: "low",
          normalizedForm: "Reviewer uses judgment.",
        },
      ],
    });

    expect(normalizeRules(ir).checks).toEqual([]);
  });

  test("does not duplicate an existing generated rule check or mutate the input", () => {
    const existingCheck = {
      id: "check-rule-findings-first",
      name: "Existing output check",
      kind: "output" as const,
      targetRef: "rule-findings-first",
      assertion: "Existing assertion.",
      onFailure: "report" as const,
    };
    const ir = baseIr({
      rules: [
        {
          id: "rule-findings-first",
          sourceText: "Findings should lead the response.",
          level: "must",
          scope: "output",
          checkability: "runtime",
          severity: "high",
          normalizedForm: "Output begins with review findings.",
        },
      ],
      checks: [existingCheck],
    });
    const originalChecks = [...ir.checks];

    const normalized = normalizeRules(ir);

    expect(normalized.checks).toEqual([existingCheck]);
    expect(ir.checks).toEqual(originalChecks);
  });
});
