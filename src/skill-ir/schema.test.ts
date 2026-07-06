import { describe, expect, test } from "bun:test";
import { SkillIRSchema } from "./schema";

describe("SkillIRSchema", () => {
  test("accepts a minimal valid workflow skill IR", () => {
    const parsed = SkillIRSchema.parse({
      schemaVersion: "skill-ir/v1",
      id: "skill-review",
      name: "Code Review",
      category: ["workflow", "constraint-heavy"],
      intent: "Review code changes and report findings first.",
      source: { kind: "file", path: "skills/review/SKILL.md" },
      inputs: [],
      outputs: [{ id: "final-response", description: "Review findings", required: true }],
      preconditions: [],
      steps: [
        {
          id: "step-read-diff",
          title: "Read diff",
          description: "Inspect changed files before producing findings.",
          kind: "read",
          required: true,
          dependsOn: [],
          toolRefs: [],
          produces: ["diff-understanding"],
          successCheckRefs: ["check-diff-read"],
          failureModes: ["missing-diff"],
        },
      ],
      rules: [
        {
          id: "rule-findings-first",
          sourceText: "Findings should lead the response.",
          level: "must",
          scope: "output",
          checkability: "human",
          severity: "high",
          normalizedForm: "Output begins with findings before summary.",
        },
      ],
      tools: [],
      environment: [],
      checks: [
        {
          id: "check-diff-read",
          name: "Diff was inspected",
          kind: "step-success",
          targetRef: "step-read-diff",
          assertion: "The execution trace includes a diff or file inspection action.",
          onFailure: "abort",
        },
      ],
      recovery: [],
      profile: [],
    });

    expect(parsed.id).toBe("skill-review");
  });

  test("rejects unknown categories", () => {
    expect(() =>
      SkillIRSchema.parse({
        schemaVersion: "skill-ir/v1",
        id: "bad",
        name: "Bad",
        category: ["unknown"],
        intent: "Invalid",
        source: { kind: "inline", text: "bad" },
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
      }),
    ).toThrow();
  });
});
