import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiTesterOperationDevelopmentReportSchema } from "./api-tester-operation-development";
import {
  API_TESTER_OPERATION_TRANSFORM_REGISTRY,
  evaluateApiTesterOperationTransform,
  runApiTesterOperationFaultDetection,
  selectApiTesterOperationValidationBranch,
} from "./api-tester-operation-validation";

const TASK_1_REPORT = "results/skill-ir/api-tester-operation-admission-development-001/report.json";

const RICH_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "transform fixture", version: "1.0.0", description: "baseline" },
  security: [{ ApiKey: [] }],
  components: {
    parameters: {
      ItemId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
    },
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
  paths: {
    "/items/{id}": {
      parameters: [{ $ref: "#/components/parameters/ItemId" }],
      get: {
        operationId: "getItem",
        summary: "Get one item",
        responses: {
          "200": { description: "ok" },
          "401": { description: "unauthorized" },
          "404": { description: "missing" },
        },
      },
    },
  },
};

describe("API Tester operation validation", () => {
  test("selects the real-positive branch only from the strict Task 1 report", async () => {
    const report = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(await readFile(TASK_1_REPORT, "utf8")));
    expect(selectApiTesterOperationValidationBranch(report)).toBe("real-positive");
    expect(selectApiTesterOperationValidationBranch({
      ...report,
      totals: { ...report.totals, accepted: 0, artifactCheckedPassedOperations: 0 },
    })).toBe("all-negative");
  });

  test("preregisters applicability, relation, and comparison fields for every required transform", () => {
    expect(API_TESTER_OPERATION_TRANSFORM_REGISTRY.map((entry) => entry.type)).toEqual([
      "object-order",
      "formatting",
      "json-yaml",
      "irrelevant-description",
      "add-unsupported-operation",
      "local-ref-inline",
    ]);
    for (const entry of API_TESTER_OPERATION_TRANSFORM_REGISTRY) {
      expect(entry.applicability.length).toBeGreaterThan(0);
      expect(entry.expectedRelation.length).toBeGreaterThan(0);
      expect(entry.comparisonFields.length).toBeGreaterThan(0);
    }
  });

  test("preserves preregistered semantics across applicable representation changes", () => {
    const sourceText = `${JSON.stringify(RICH_DOCUMENT, null, 2)}\n`;
    for (const registration of API_TESTER_OPERATION_TRANSFORM_REGISTRY) {
      const result = evaluateApiTesterOperationTransform({
        sourceText,
        format: "json",
        type: registration.type,
      });
      expect(result.status).toBe("pass");
      expect(result.applicability).toBe("applicable");
      expect(result.parentSha256).not.toBe(result.derivedSha256);
      expect(result.comparisonFields).toEqual(registration.comparisonFields);
      expect(result.errors).toEqual([]);
    }
  });

  test("records typed non-applicability instead of forcing local-ref expansion", () => {
    const withoutReferences = structuredClone(RICH_DOCUMENT) as unknown as {
      [key: string]: unknown;
      paths: Record<string, { parameters: Array<Record<string, unknown>> }>;
    };
    withoutReferences.paths["/items/{id}"]!.parameters = [{
      name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 },
    }];
    const result = evaluateApiTesterOperationTransform({
      sourceText: JSON.stringify(withoutReferences),
      format: "json",
      type: "local-ref-inline",
    });
    expect(result).toMatchObject({ applicability: "not-applicable", status: "not-applicable" });
    expect(result.reason).toContain("resolved local reference");
  });

  test("treats reordered wording in a fail-fast observation as non-semantic", () => {
    const rejected = {
      openapi: "3.1.0",
      info: { title: "rejected order fixture", version: "1" },
      paths: {
        "/nested": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      metadata: {
                        type: "object",
                        properties: { label: { type: "string" } },
                        required: ["label"],
                      },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "ok" }, "400": { description: "bad" } },
          },
        },
      },
    };
    expect(evaluateApiTesterOperationTransform({
      sourceText: JSON.stringify(rejected),
      format: "json",
      type: "object-order",
    })).toMatchObject({ applicability: "applicable", status: "pass", errors: [] });
  });

  test("detects omission, duplicate, dependency, security, summary, false acceptance, endpoint, and witness faults", async () => {
    const detections = await runApiTesterOperationFaultDetection({
      nodeExecutable: Bun.which("node")!,
      fixtureRoot: join(import.meta.dir, "fixtures", "api-tester-production-v2", "local-ref-arrays"),
    });
    expect(detections.map((entry) => [entry.fault, entry.detectorLayer, entry.code, entry.detected])).toEqual([
      ["operation-omission", "source-coverage", "ANALYZER_OPERATION_OMITTED", true],
      ["operation-duplicate", "source-coverage", "ANALYZER_OPERATION_DUPLICATE", true],
      ["parameter-dependency-loss", "dependency-verifier", "PARAMETER_DEPENDENCY_LOST", true],
      ["reference-dependency-loss", "dependency-verifier", "REFERENCE_DEPENDENCY_LOST", true],
      ["security-dependency-loss", "dependency-verifier", "SECURITY_DEPENDENCY_LOST", true],
      ["summary-drift", "source-coverage", "ANALYZER_SOURCE_METADATA_DRIFT", true],
      ["false-acceptance", "admission-consistency", "FALSE_ACCEPTANCE", true],
      ["artifact-endpoint-loss", "independent-checker", "OPERATION_COVERAGE_FAILED", true],
      ["artifact-witness-loss", "independent-checker", "SCHEMA_DERIVED_CASES_FAILED", true],
    ]);
  });
});
