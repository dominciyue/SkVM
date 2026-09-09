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

const TRANSITIVE_DEPENDENCY_SOURCE = {
  openapi: "3.1.0",
  info: { title: "transitive coverage", version: "1" },
  security: [{ ApiKey: [] }],
  components: {
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { $ref: "#/components/schemas/LimitValue" },
      },
    },
    responses: {
      ItemResponse: {
        description: "ok",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ItemPayload" },
          },
        },
      },
    },
    schemas: {
      ItemPayload: { type: "string" },
      LimitValue: { type: "integer", minimum: 1 },
    },
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: {
          "200": { $ref: "#/components/responses/ItemResponse" },
          "400": { description: "bad" },
          "401": { description: "unauthorized" },
        },
      },
    },
  },
};

function transitiveDependencyFixture() {
  const parsed = parseApiTesterOperationSource(JSON.stringify(TRANSITIVE_DEPENDENCY_SOURCE), "json");
  const projection = projectApiTesterOperation(parsed.document, "GET /items");
  return { sourceDocument: parsed.document, projectedDocument: projection.document };
}

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

  test("passes an unchanged projection with transitive dependencies", () => {
    expect(verifyApiTesterProjectionDependencies({
      ...transitiveDependencyFixture(),
      operationKey: "GET /items",
    })).toMatchObject({
      status: "pass",
      dimensions: {
        projectionPreservation: "pass",
        constructionObligations: "pass",
        sourceValidity: "pass",
      },
      errors: [],
    });
  });

  test("detects response component schema drift through a transitive reference", () => {
    const fixture = transitiveDependencyFixture();
    const schemas = (fixture.projectedDocument.components as Record<string, unknown>).schemas as Record<string, Record<string, unknown>>;
    schemas.ItemPayload!.type = "integer";
    const report = verifyApiTesterProjectionDependencies({ ...fixture, operationKey: "GET /items" });
    expect(report.status).toBe("fail");
    expect(report.dimensions).toEqual({
      projectionPreservation: "fail",
      constructionObligations: "pass",
      sourceValidity: "pass",
    });
    expect(report.errors).toEqual(expect.arrayContaining(["REFERENCE_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST"]));
  });

  test("detects nested schema dependency drift inside a referenced parameter", () => {
    const fixture = transitiveDependencyFixture();
    const schemas = (fixture.projectedDocument.components as Record<string, unknown>).schemas as Record<string, Record<string, unknown>>;
    schemas.LimitValue!.minimum = 99;
    const report = verifyApiTesterProjectionDependencies({ ...fixture, operationKey: "GET /items" });
    expect(report.status).toBe("fail");
    expect(report.dimensions.constructionObligations).toBe("fail");
    expect(report.errors).toEqual(expect.arrayContaining(["PARAMETER_DEPENDENCY_LOST", "REFERENCE_DEPENDENCY_LOST"]));
  });

  test("detects same-name effective apiKey security-scheme drift", () => {
    const fixture = transitiveDependencyFixture();
    const securitySchemes = (fixture.projectedDocument.components as Record<string, unknown>).securitySchemes as Record<string, Record<string, unknown>>;
    securitySchemes.ApiKey!.name = "X-Other";
    const report = verifyApiTesterProjectionDependencies({ ...fixture, operationKey: "GET /items" });
    expect(report.status).toBe("fail");
    expect(report.dimensions.constructionObligations).toBe("fail");
    expect(report.errors).toContain("SECURITY_DEPENDENCY_LOST");
  });

  test("detects transitive drift through shared cyclic schema references without recursing forever", () => {
    const source = structuredClone(TRANSITIVE_DEPENDENCY_SOURCE);
    source.components.schemas.ItemPayload = {
      type: "object",
      properties: {
        next: { $ref: "#/components/schemas/ItemPayload" },
        limit: { $ref: "#/components/schemas/LimitValue" },
      },
    } as unknown as { type: string };
    const parsed = parseApiTesterOperationSource(JSON.stringify(source), "json");
    const projection = projectApiTesterOperation(parsed.document, "GET /items");
    const schemas = (projection.document.components as Record<string, unknown>).schemas as Record<string, Record<string, unknown>>;
    schemas.LimitValue!.maximum = 100;
    const report = verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: projection.document,
    });
    expect(report.status).toBe("fail");
    expect(report.errors).toEqual(expect.arrayContaining(["PARAMETER_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST"]));
  });

  test("reports an unchanged missing response target as source-invalid but not a construction obligation", () => {
    const source = structuredClone(TRANSITIVE_DEPENDENCY_SOURCE);
    source.paths["/items"].get.responses["200"].$ref = "#/components/responses/Missing";
    const parsed = parseApiTesterOperationSource(JSON.stringify(source), "json");
    const projection = projectApiTesterOperation(parsed.document, "GET /items");
    const report = verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: projection.document,
    });
    expect(report).toMatchObject({
      status: "pass",
      dimensions: {
        projectionPreservation: "pass",
        constructionObligations: "pass",
        sourceValidity: "fail",
      },
      sourceIssues: [{
        code: "REFERENCE_MISSING",
        role: "response",
        reference: "#/components/responses/Missing",
        constructionObligation: false,
      }],
      errors: [],
    });
  });
});
