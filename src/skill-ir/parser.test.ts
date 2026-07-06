import { describe, expect, test } from "bun:test";
import type { SkillIR } from "./schema";
import { buildSkillIRExtractionPrompt, parseSkillIRFromJsonCandidate } from "./parser";

function baseCandidate(): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "review",
    name: "Review",
    category: ["workflow"],
    intent: "Review changes.",
    source: { kind: "inline", text: "Review skill" },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [
      {
        id: "",
        title: "Read files",
        description: "Read changed files.",
        kind: "read",
        required: true,
        dependsOn: [],
        toolRefs: [],
        produces: [],
        successCheckRefs: [],
        failureModes: [],
      },
    ],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

describe("parseSkillIRFromJsonCandidate", () => {
  test("repairs empty step id fields with stable generated ids", () => {
    const ir = parseSkillIRFromJsonCandidate(baseCandidate());

    expect(ir.steps[0]!.id).toBe("step-read-files");
  });

  test("repairs empty rule ids from normalized forms", () => {
    const candidate = baseCandidate();
    candidate.rules = [
      {
        id: "",
        sourceText: "Findings must come first.",
        level: "must",
        scope: "output",
        checkability: "runtime",
        severity: "high",
        normalizedForm: "Output begins with findings.",
      },
    ];

    const ir = parseSkillIRFromJsonCandidate(candidate);

    expect(ir.rules[0]!.id).toBe("rule-output-begins-with-findings");
  });

  test("deduplicates generated ids while preserving existing stable ids", () => {
    const candidate = baseCandidate();
    const baseStep = candidate.steps[0]!;
    candidate.steps = [
      { ...baseStep, id: "step-read-files", title: "Read files" },
      { ...baseStep, id: "", title: "Read files" },
      { ...baseStep, id: "", title: "Read files" },
    ];

    const ir = parseSkillIRFromJsonCandidate(candidate);

    expect(ir.steps.map((step) => step.id)).toEqual(["step-read-files", "step-read-files-2", "step-read-files-3"]);
  });

  test("trims top-level identity text before schema parsing", () => {
    const candidate = baseCandidate();
    candidate.id = " review ";
    candidate.name = " Review ";
    candidate.intent = " Review changes. ";

    const ir = parseSkillIRFromJsonCandidate(candidate);

    expect(ir.id).toBe("review");
    expect(ir.name).toBe("Review");
    expect(ir.intent).toBe("Review changes.");
  });
});

describe("buildSkillIRExtractionPrompt", () => {
  test("builds a strict JSON extraction prompt that embeds the skill text", () => {
    const prompt = buildSkillIRExtractionPrompt("Use shell carefully.");

    expect(prompt).toContain("Extract Skill IR as strict JSON");
    expect(prompt).toContain("Do not include markdown fences.");
    expect(prompt).toContain("Use shell carefully.");
  });
});
