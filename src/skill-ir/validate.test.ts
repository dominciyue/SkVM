import { describe, expect, test } from "bun:test";
import type { SkillIR } from "./schema";
import { validateSkillIR } from "./validate";

const baseIR: SkillIR = {
  schemaVersion: "skill-ir/v1",
  id: "skill-env",
  name: "Environment Skill",
  category: ["environment-sensitive"],
  intent: "Run commands portably.",
  source: { kind: "inline", text: "Use available tools carefully." },
  inputs: [],
  outputs: [{ id: "result", description: "Final result", required: true }],
  preconditions: [],
  steps: [
    {
      id: "step-run",
      title: "Run command",
      description: "Run the selected command.",
      kind: "execute",
      required: true,
      dependsOn: [],
      toolRefs: ["tool-shell"],
      produces: ["command-output"],
      successCheckRefs: ["check-run"],
      failureModes: ["command-missing"],
    },
  ],
  rules: [],
  tools: [
    {
      id: "tool-shell",
      name: "shell",
      purpose: "Execute commands",
      required: true,
      alternatives: ["powershell", "bash"],
      platformNotes: { windows: "Use PowerShell", linux: "Use bash" },
      availabilityCheck: "detect shell",
    },
  ],
  environment: [
    {
      id: "env-os",
      description: "Operating system affects command syntax.",
      platforms: ["windows", "linux"],
      checkability: "runtime",
    },
  ],
  checks: [
    {
      id: "check-run",
      name: "Command succeeded",
      kind: "step-success",
      targetRef: "step-run",
      assertion: "Exit code is zero.",
      onFailure: "fallback",
    },
  ],
  recovery: [],
  profile: [],
};

describe("validateSkillIR", () => {
  test("accepts internally consistent IR", () => {
    expect(validateSkillIR(baseIR)).toEqual({ errors: [], warnings: [] });
  });

  test("reports missing step dependency", () => {
    const ir = structuredClone(baseIR);
    ir.steps[0]!.dependsOn = ["missing-step"];

    expect(validateSkillIR(ir).errors).toContain("step step-run depends on missing step missing-step");
  });

  test("reports missing tool and check references", () => {
    const ir = structuredClone(baseIR);
    ir.steps[0]!.toolRefs = ["missing-tool"];
    ir.steps[0]!.successCheckRefs = ["missing-check"];

    expect(validateSkillIR(ir).errors).toEqual([
      "step step-run references missing tool missing-tool",
      "step step-run references missing check missing-check",
    ]);
  });

  test("requires required steps to define a success check or produced artifact", () => {
    const ir = structuredClone(baseIR);
    ir.steps[0]!.successCheckRefs = [];
    ir.steps[0]!.produces = [];

    expect(validateSkillIR(ir).errors).toContain(
      "required step step-run must define a success check or produced artifact",
    );
  });

  test("requires environment assumptions for environment-sensitive skills", () => {
    const ir = structuredClone(baseIR);
    ir.environment = [];

    expect(validateSkillIR(ir).errors).toContain(
      "environment-sensitive skill skill-env must define at least one environment assumption",
    );
  });

  test("warns when high-severity must or never rules are only human-checkable", () => {
    const ir = structuredClone(baseIR);
    ir.rules = [
      {
        id: "rule-dangerous-command",
        sourceText: "Never run destructive commands.",
        level: "never",
        scope: "safety",
        checkability: "human",
        severity: "high",
        normalizedForm: "Execution must not include destructive commands.",
      },
    ];

    expect(validateSkillIR(ir).warnings).toContain("high severity rule rule-dangerous-command is only human-checkable");
  });
});
