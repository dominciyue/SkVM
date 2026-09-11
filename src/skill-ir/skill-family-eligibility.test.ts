import { describe, expect, test } from "bun:test";
import { preflightSkillEligibility, type EligibilityInput } from "./skill-family-eligibility";

const openapi = (paths: string, extra = "") => ({
  path: "references/api.yaml",
  text: `openapi: 3.0.3\ninfo:\n  title: Demo\n  version: 1.0.0\npaths:\n${paths}${extra}`,
});

const baseBody = (extra = "") => `# API test skill\n\nInput: OpenAPI contract at references/api.yaml.\nGenerate offline request examples and test cases for every operation.\nCover required, valid and invalid cases without calling a live service.\n${extra}`;

const twoPaths = "  /pets:\n    get:\n      responses:\n        '200': { description: ok }\n  /pets/{id}:\n    get:\n      parameters:\n        - name: id\n          in: path\n          required: true\n          schema: { type: string }\n      responses:\n        '200': { description: ok }\n";

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    skillId: "owner/demo:api-test",
    sourcePath: "SKILL.md",
    body: baseBody(),
    resources: [openapi(twoPaths)],
    ...overrides,
  };
}

describe("skill-family eligibility preflight", () => {
  test("excludes a skill without a public API contract marker", () => {
    const result = preflightSkillEligibility(input({ body: "Generate offline test fixtures and coverage cases." }));
    expect(result.decision).toBe("excluded");
    expect(result.exclusionReasons.join(" ")).toContain("public-contract");
    expect(result.modelCalls).toBe(0);
  });

  test("excludes a skill with a contract but no offline output duty", () => {
    const result = preflightSkillEligibility(input({ body: "Read the OpenAPI contract and call the live API." }));
    expect(result.decision).toBe("excluded");
    expect(result.exclusionReasons.join(" ")).toContain("offline-output");
  });

  test("excludes live/auth-only responsibilities", () => {
    const result = preflightSkillEligibility(input({ body: "Use the OpenAPI contract to authenticate and execute requests against the live service." }));
    expect(result.decision).toBe("excluded");
    expect(result.exclusionReasons.join(" ")).toContain("offline-determinacy");
  });

  test("marks an unreadable direct contract resource as uncertain", () => {
    const result = preflightSkillEligibility(input({ resources: [{ path: "references/api.yaml", text: null, error: "permission denied" }] }));
    expect(result.decision).toBe("uncertain");
    expect(result.exclusionReasons.join(" ")).toContain("resource-unreadable");
    expect(result.applicableInputs).toHaveLength(0);
  });

  test("requires two derivable inputs and accepts two operations", () => {
    const result = preflightSkillEligibility(input());
    expect(result.decision).toBe("eligible");
    expect(result.applicableInputs).toHaveLength(2);
    expect(result.applicableInputs.every((row) => row.operationCount === 1)).toBe(true);
    expect(result.evidence.some((row) => row.kind === "coverage")).toBe(true);
  });

  test("keeps one operation eligible when two coverage scenarios are explicit", () => {
    const body = baseBody("For each operation emit both minimal and full request cases.");
    const result = preflightSkillEligibility(input({ body, resources: [openapi("  /pets:\n    post:\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: { type: object, required: [name] }\n      responses:\n        '201': { description: created }\n")] }));
    expect(result.decision).toBe("eligible");
    expect(result.applicableInputs).toHaveLength(2);
    expect(new Set(result.applicableInputs.map((row) => row.inputId)).size).toBe(2);
  });

  test("does not treat an operation without a request or coverage basis as two inputs", () => {
    const result = preflightSkillEligibility(input({ resources: [openapi("  /health:\n    get:\n      responses:\n        '200': { description: ok }\n")] }));
    expect(result.decision).toBe("excluded");
    expect(result.applicableInputs).toHaveLength(1);
    expect(result.exclusionReasons.join(" ")).toContain("minimum-inputs");
  });

  test("marks an external reference closure as uncertain instead of guessing", () => {
    const result = preflightSkillEligibility(input({ resources: [openapi("  /pets:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                $ref: './missing.yaml#/Pet'\n  /dogs:\n    get:\n      responses:\n        '200': { description: ok }\n")] }));
    expect(result.decision).toBe("uncertain");
    expect(result.exclusionReasons.join(" ")).toContain("resource-closure");
  });

  test("returns stable uncertain diagnostics for malformed OpenAPI", () => {
    const result = preflightSkillEligibility(input({ resources: [{ path: "references/api.yaml", text: "openapi: [", format: "yaml" }] }));
    expect(result.decision).toBe("uncertain");
    expect(result.exclusionReasons.some((reason) => reason.includes("parse"))).toBe(true);
    expect(result.bodyReadForScreening).toBe(true);
    expect(result.modelCalls).toBe(0);
  });
});
