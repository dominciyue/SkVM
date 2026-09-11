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

  test("accepts an explicit generated request-example duty without an offline keyword", () => {
    const result = preflightSkillEligibility(input({
      body: "Use an OpenAPI contract to generate request examples and test cases for every operation.",
      resources: [openapi("  /health:\n    get:\n      responses:\n        '200': { description: ok }\n  /users:\n    post:\n      requestBody:\n        content:\n          application/json:\n            schema: { type: object }\n      responses:\n        '201': { description: created }\n")],
    }));
    expect(result.decision).toBe("eligible");
    expect(result.exclusionReasons).not.toContain("offline-output-duty-missing");
  });

  test("does not flag an internal JSON Pointer reference as an unresolved external resource", () => {
    const result = preflightSkillEligibility(input({
      resources: [openapi("  /pets:\n    get:\n      responses:\n        '200':\n          description: ok\n          content:\n            application/json:\n              schema:\n                $ref: '#/components/schemas/Pet'\n  /dogs:\n    get:\n      responses:\n        '200': { description: ok }\n", "components:\n  schemas:\n    Pet:\n      type: object\n")],
    }));
    expect(result.exclusionReasons.some((reason) => reason.includes("resource-closure-unresolved:"))).toBe(false);
  });

  test("recognizes a Postman collection as an offline specimen and endpoint-wide coverage", () => {
    const result = preflightSkillEligibility(input({
      body: "Convert the OpenAPI document into an import-ready Postman Collection with one request item per operation.",
    }));
    expect(result.decision).toBe("eligible");
    expect(result.evidence.some((row) => row.kind === "output")).toBe(true);
    expect(result.evidence.some((row) => row.kind === "coverage")).toBe(true);
  });

  test("recognizes an explicitly declared Chinese script/report output duty", () => {
    const result = preflightSkillEligibility(input({
      body: "输入 OpenAPI 文档，逐接口生成接口自动化测试脚本与测试报告。",
    }));
    expect(result.decision).toBe("eligible");
    expect(result.exclusionReasons).not.toContain("offline-output-duty-missing");
    expect(result.exclusionReasons).not.toContain("coverage-duty-missing");
  });

  test("recognizes a declared API test suite output even when generation is phrased as writing tests", () => {
    const result = preflightSkillEligibility(input({
      body: "Use the OpenAPI contract to write API tests and test cases for every endpoint, including error paths.",
    }));
    expect(result.decision).toBe("eligible");
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
