import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../schema";
import { lowerToAdapterSpec } from "./adapter";
import { lowerToCheckerSpec } from "./checker";
import { lowerToControllerPlan } from "./controller";

function shellSkillIr(): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-shell",
    name: "Shell Skill",
    category: ["tool-use", "environment-sensitive"],
    intent: "Run shell commands portably.",
    source: { kind: "inline", text: "Use shell carefully." },
    inputs: [],
    outputs: [],
    preconditions: [
      {
        id: "condition-shell-needed",
        description: "A compatible shell is needed.",
        checkability: "runtime",
      },
    ],
    steps: [
      {
        id: "step-check-shell",
        title: "Check shell",
        description: "Check shell availability.",
        kind: "verify",
        required: true,
        dependsOn: [],
        toolRefs: ["tool-shell"],
        produces: [],
        successCheckRefs: ["preflight-tool-shell"],
        failureModes: ["missing-shell"],
      },
      {
        id: "step-run-command",
        title: "Run command",
        description: "Run the selected shell command.",
        kind: "execute",
        required: true,
        dependsOn: ["step-check-shell"],
        toolRefs: ["tool-shell"],
        produces: ["command-output"],
        successCheckRefs: ["check-command-output"],
        failureModes: ["non-zero-exit"],
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
        platformNotes: { windows: "Prefer PowerShell", linux: "Prefer bash" },
        availabilityCheck: "detect shell",
      },
    ],
    environment: [
      {
        id: "env-os",
        description: "Shell syntax differs by operating system.",
        platforms: ["windows", "linux"],
        checkability: "runtime",
      },
    ],
    checks: [
      {
        id: "preflight-tool-shell",
        name: "Check shell availability",
        kind: "preflight",
        targetRef: "tool-shell",
        command: "detect shell",
        assertion: "shell is available",
        onFailure: "fallback",
      },
      {
        id: "check-command-output",
        name: "Command produced output",
        kind: "step-success",
        targetRef: "step-run-command",
        assertion: "Command output is available.",
        onFailure: "retry",
      },
    ],
    recovery: [
      {
        id: "recover-shell",
        trigger: "preflight-tool-shell",
        action: "use-alternative-tool",
        maxAttempts: 1,
        explanation: "Try a supported shell alternative.",
      },
    ],
    profile: [],
  };
}

describe("lowering", () => {
  test("lowers required execution steps into a controller plan", () => {
    const plan = lowerToControllerPlan(shellSkillIr());

    expect(plan).toEqual({
      skillId: "skill-shell",
      skillName: "Shell Skill",
      intent: "Run shell commands portably.",
      steps: [
        {
          id: "step-check-shell",
          title: "Check shell",
          kind: "verify",
          required: true,
          dependsOn: [],
          toolRefs: ["tool-shell"],
          checks: ["preflight-tool-shell"],
          produces: [],
        },
        {
          id: "step-run-command",
          title: "Run command",
          kind: "execute",
          required: true,
          dependsOn: ["step-check-shell"],
          toolRefs: ["tool-shell"],
          checks: ["check-command-output"],
          produces: ["command-output"],
        },
      ],
    });
  });

  test("lowers runtime checks and recovery policies into a checker spec", () => {
    const spec = lowerToCheckerSpec(shellSkillIr());

    expect(spec.skillId).toBe("skill-shell");
    expect(spec.checks.map((check) => check.id)).toEqual(["preflight-tool-shell", "check-command-output"]);
    expect(spec.recovery).toContainEqual({
      id: "recover-shell",
      trigger: "preflight-tool-shell",
      action: "use-alternative-tool",
      maxAttempts: 1,
      explanation: "Try a supported shell alternative.",
    });
  });

  test("lowers tool and environment data into an adapter spec", () => {
    const spec = lowerToAdapterSpec(shellSkillIr());

    expect(spec).toEqual({
      skillId: "skill-shell",
      tools: [
        {
          id: "tool-shell",
          name: "shell",
          purpose: "Execute commands",
          required: true,
          alternatives: ["powershell", "bash"],
          platformNotes: { windows: "Prefer PowerShell", linux: "Prefer bash" },
          availabilityCheck: "detect shell",
        },
      ],
      environment: [
        {
          id: "env-os",
          description: "Shell syntax differs by operating system.",
          platforms: ["windows", "linux"],
          checkability: "runtime",
        },
      ],
    });
  });

  test("returns artifact arrays that are independent from the source IR arrays", () => {
    const ir = shellSkillIr();

    const plan = lowerToControllerPlan(ir);
    const checker = lowerToCheckerSpec(ir);
    const adapter = lowerToAdapterSpec(ir);

    expect(plan.steps).not.toBe(ir.steps);
    expect(plan.steps[0]?.dependsOn).not.toBe(ir.steps[0]?.dependsOn);
    expect(checker.checks).not.toBe(ir.checks);
    expect(checker.recovery).not.toBe(ir.recovery);
    expect(adapter.tools).not.toBe(ir.tools);
    expect(adapter.environment).not.toBe(ir.environment);
  });
});
