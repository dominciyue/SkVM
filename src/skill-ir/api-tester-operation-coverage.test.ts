import { describe, expect, test } from "bun:test";
import {
  independentlyEnumerateApiTesterOperations,
  verifyApiTesterOperationCoverage,
  verifyApiTesterProjectionDependencies,
} from "./api-tester-operation-coverage";
import {
  parseApiTesterOperationSource,
  projectApiTesterOperation,
} from "./api-tester-operation-source";

const SOURCE = {
  openapi: "3.1.0",
  info: { title: "coverage", version: "1" },
  security: [{ BearerAuth: [] }],
  components: {
    parameters: {
      Search: { name: "q", in: "query", required: true, schema: { type: "string" } },
    },
    securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } },
  },
  paths: {
    "/items": {
      parameters: [{ $ref: "#/components/parameters/Search" }],
      get: {
        operationId: "listItems",
        summary: "List items",
        responses: {
          "200": { description: "ok" },
          "400": { description: "bad" },
          "401": { description: "unauthorized" },
        },
      },
      post: {
        operationId: "createItem",
        summary: "Create item",
        security: [],
        responses: { "200": { description: "ok" }, "400": { description: "bad" } },
      },
    },
  },
};

function rows() {
  return [
    {
      key: "GET /items",
      locator: "#/paths/~1items/get",
      operationId: "listItems",
      summary: "List items",
      status: "accepted" as const,
    },
    {
      key: "POST /items",
      locator: "#/paths/~1items/post",
      operationId: "createItem",
      summary: "Create item",
      status: "rejected" as const,
    },
  ];
}

describe("API Tester independent operation coverage", () => {
  test("rebuilds the operation universe directly from raw source bytes", () => {
    const universe = independentlyEnumerateApiTesterOperations(`${JSON.stringify(SOURCE, null, 2)}\n`, "json");
    expect(universe).toMatchObject({ complete: true, unresolved: [] });
    expect(universe.operations).toEqual([
      {
        key: "GET /items",
        locator: "#/paths/~1items/get",
        operationId: "listItems",
        summary: "List items",
      },
      {
        key: "POST /items",
        locator: "#/paths/~1items/post",
        operationId: "createItem",
        summary: "Create item",
      },
    ]);
  });

  test("passes only when analyzer, projection, contract, and artifact sets conserve the source", () => {
    const report = verifyApiTesterOperationCoverage({
      sourceText: JSON.stringify(SOURCE),
      format: "json",
      analyzedOperations: rows(),
      projectedOperationKeys: ["GET /items"],
      contractOperationKeys: ["GET /items"],
      artifactOperationKeys: ["GET /items"],
    });
    expect(report).toMatchObject({
      status: "pass",
      sourceOperationCount: 2,
      acceptedOperationCount: 1,
      errors: [],
      checks: {
        sourceEnumerationComplete: true,
        analyzerExactCoverage: true,
        sourceMetadataMatch: true,
        projectionExactAcceptedCoverage: true,
        contractExactAcceptedCoverage: true,
        artifactExactAcceptedCoverage: true,
      },
    });
  });

  test("detects analyzer omission, duplication, summary drift, and accepted-set loss", () => {
    const omitted = verifyApiTesterOperationCoverage({
      sourceText: JSON.stringify(SOURCE),
      format: "json",
      analyzedOperations: rows().slice(0, 1),
      projectedOperationKeys: ["GET /items"],
      contractOperationKeys: ["GET /items"],
      artifactOperationKeys: ["GET /items"],
    });
    expect(omitted.errors).toContain("ANALYZER_OPERATION_OMITTED");

    const duplicateAndDrift = verifyApiTesterOperationCoverage({
      sourceText: JSON.stringify(SOURCE),
      format: "json",
      analyzedOperations: [rows()[0]!, { ...rows()[0]! }, { ...rows()[1]!, summary: "drift" }],
      projectedOperationKeys: [],
      contractOperationKeys: [],
      artifactOperationKeys: [],
    });
    expect(duplicateAndDrift.errors).toEqual(expect.arrayContaining([
      "ANALYZER_OPERATION_DUPLICATE",
      "ANALYZER_SOURCE_METADATA_DRIFT",
      "ACCEPTED_OPERATION_NOT_PROJECTED",
      "ACCEPTED_OPERATION_NOT_IN_CONTRACT",
      "ACCEPTED_OPERATION_NOT_IN_ARTIFACT",
    ]));
  });

  test("independently detects parameter, reference, and security dependency loss", () => {
    const parsed = parseApiTesterOperationSource(JSON.stringify(SOURCE), "json");
    const projection = projectApiTesterOperation(parsed.document, "GET /items");
    expect(verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: projection.document,
    })).toMatchObject({ status: "pass", errors: [] });

    const missingParameter = structuredClone(projection.document);
    delete (((missingParameter.paths as Record<string, Record<string, unknown>>)["/items"]!.get as Record<string, unknown>).parameters);
    expect(verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: missingParameter,
    }).errors).toContain("PARAMETER_DEPENDENCY_LOST");

    const missingReference = structuredClone(projection.document);
    const parameterComponents = (missingReference.components as Record<string, unknown>).parameters as Record<string, unknown>;
    delete parameterComponents.Search;
    expect(verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: missingReference,
    }).errors).toContain("REFERENCE_DEPENDENCY_LOST");

    const missingSecurity = structuredClone(projection.document);
    (((missingSecurity.paths as Record<string, Record<string, unknown>>)["/items"]!.get as Record<string, unknown>).security) = [];
    expect(verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: missingSecurity,
    }).errors).toContain("SECURITY_DEPENDENCY_LOST");
  });
});
