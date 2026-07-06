import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../schema";
import { insertEnvironmentGuards } from "./environment-guards";

function baseIr(overrides: Partial<SkillIR> = {}): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-tool-use",
    name: "Tool Use",
    category: ["tool-use", "environment-sensitive"],
    intent: "Use required tools robustly across environments.",
    source: { kind: "inline", text: "tool skill" },
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

describe("insertEnvironmentGuards", () => {
  test("prepends preflight checks for required tools with availability checks", () => {
    const ir = baseIr({
      checks: [
        {
          id: "check-existing",
          name: "Existing check",
          kind: "step-success",
          targetRef: "step-run",
          assertion: "Step completed.",
          onFailure: "report",
        },
      ],
      tools: [
        {
          id: "tool-rg",
          name: "rg",
          purpose: "Fast text search",
          required: true,
          alternatives: ["grep"],
          platformNotes: {},
          availabilityCheck: "rg --version",
        },
      ],
    });

    const guarded = insertEnvironmentGuards(ir);

    expect(guarded.checks[0]).toEqual({
      id: "preflight-tool-rg",
      name: "Check rg availability",
      kind: "preflight",
      targetRef: "tool-rg",
      command: "rg --version",
      assertion: "rg is available or an alternative exists: grep",
      onFailure: "fallback",
    });
    expect(guarded.checks[1]?.id).toBe("check-existing");
  });

  test("skips optional tools and existing preflight checks", () => {
    const existingCheck = {
      id: "preflight-tool-rg",
      name: "Existing rg preflight",
      kind: "preflight" as const,
      targetRef: "tool-rg",
      command: "rg --version",
      assertion: "Existing assertion.",
      onFailure: "report" as const,
    };
    const ir = baseIr({
      checks: [existingCheck],
      tools: [
        {
          id: "tool-rg",
          name: "rg",
          purpose: "Fast text search",
          required: true,
          alternatives: ["grep"],
          platformNotes: {},
          availabilityCheck: "rg --version",
        },
        {
          id: "tool-bat",
          name: "bat",
          purpose: "Pretty file display",
          required: false,
          alternatives: ["cat"],
          platformNotes: {},
          availabilityCheck: "bat --version",
        },
      ],
    });

    const guarded = insertEnvironmentGuards(ir);

    expect(guarded.checks).toEqual([existingCheck]);
    expect(ir.checks).toEqual([existingCheck]);
  });

  test("aborts when a required tool has no alternatives", () => {
    const ir = baseIr({
      tools: [
        {
          id: "tool-bun",
          name: "bun",
          purpose: "Run tests",
          required: true,
          alternatives: [],
          platformNotes: {},
          availabilityCheck: "bun --version",
        },
      ],
    });

    expect(insertEnvironmentGuards(ir).checks[0]).toMatchObject({
      id: "preflight-tool-bun",
      assertion: "bun is available or an alternative exists: none",
      onFailure: "abort",
    });
  });
});
