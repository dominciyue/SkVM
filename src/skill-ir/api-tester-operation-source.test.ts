import { describe, expect, test } from "bun:test";
import {
  aggregateApiTesterOperations,
  parseApiTesterOperationSource,
  projectApiTesterOperation,
} from "./api-tester-operation-source";

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "operation source test", version: "1" },
  servers: [{ url: "https://api.example.test" }],
  security: [{ BearerAuth: [] }],
  components: {
    parameters: {
      SharedQuery: {
        in: "query",
        name: "q",
        schema: { type: "string", minLength: 1 },
      },
    },
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  paths: {
    "/things/{id}": {
      summary: "Things",
      servers: [{ url: "https://path.example.test" }],
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "integer" } },
        { $ref: "#/components/parameters/SharedQuery" },
      ],
      get: {
        operationId: "listThing",
        summary: "List one thing",
        parameters: [
          { in: "query", name: "q", schema: { type: "string", minLength: 2 } },
        ],
        responses: {
          "200": { description: "ok" },
          "400": { description: "bad request" },
          "401": { description: "unauthorized" },
        },
      },
      post: {
        operationId: "replaceThing",
        summary: "Replace one thing",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["labels"],
                properties: {
                  labels: { type: "array", items: { type: "string" }, minItems: 1 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "ok" },
          "400": { description: "bad request" },
        },
      },
    },
    "/health": {
      get: {
        operationId: "health",
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

describe("API Tester operation source inventory", () => {
  test("enumerates every operation with source and effective dependency facts", () => {
    const parsed = parseApiTesterOperationSource(`${JSON.stringify(DOCUMENT, null, 2)}\n`, "json");

    expect(parsed.enumeration.complete).toBe(true);
    expect(parsed.enumeration.unresolved).toEqual([]);
    expect(parsed.enumeration.operations.map((operation) => operation.key)).toEqual([
      "GET /health",
      "GET /things/{id}",
      "POST /things/{id}",
    ]);

    const get = parsed.enumeration.operations[1]!;
    expect(get).toMatchObject({
      key: "GET /things/{id}",
      locator: "#/paths/~1things~1{id}/get",
      operationId: "listThing",
      summary: "List one thing",
      request: { present: false, mediaTypes: [] },
      responses: { statuses: ["200", "400", "401"] },
      security: { source: "global", schemeNames: ["BearerAuth"] },
    });
    expect(get.parameters.map(({ name, origin, overridesLocator }) => ({ name, origin, overridesLocator })))
      .toEqual([
        { name: "id", origin: "path", overridesLocator: null },
        {
          name: "q",
          origin: "operation",
          overridesLocator: "#/paths/~1things~1{id}/parameters/1",
        },
      ]);
    expect(get.references).toContainEqual(expect.objectContaining({
      ref: "#/components/parameters/SharedQuery",
      locator: "#/paths/~1things~1{id}/parameters/1/$ref",
      resolution: "resolved",
    }));

    const post = parsed.enumeration.operations[2]!;
    expect(post).toMatchObject({
      request: { present: true, required: true, mediaTypes: ["application/json"] },
      security: { source: "operation", schemeNames: [] },
      responses: { statuses: ["200", "400"] },
    });
  });

  test("fails the enumeration closed for duplicate keys and unresolved path-item references", () => {
    const duplicate = parseApiTesterOperationSource(
      '{"openapi":"3.1.0","info":{"title":"x","version":"1"},"paths":{"/x":{"get":{"responses":{"200":{}}}},"/x":{"post":{"responses":{"200":{}}}}}}',
      "json",
    );
    expect(duplicate.document).toBeNull();
    expect(duplicate.enumeration).toMatchObject({
      complete: false,
      operations: [],
      unresolved: [expect.objectContaining({ code: "DUPLICATE_SOURCE_KEY" })],
    });

    const pathRef = parseApiTesterOperationSource(`openapi: 3.1.0
info: { title: x, version: "1" }
paths:
  /remote:
    $ref: https://example.test/path-item.yaml
`, "yaml");
    expect(pathRef.enumeration.complete).toBe(false);
    expect(pathRef.enumeration.operations).toEqual([]);
    expect(pathRef.enumeration.unresolved).toContainEqual(expect.objectContaining({
      code: "UNRESOLVED_PATH_ITEM_REFERENCE",
      locator: "#/paths/~1remote/$ref",
    }));
  });

  test("keeps the operation universe complete when only one operation dependency is unresolved", () => {
    const parsed = parseApiTesterOperationSource(JSON.stringify({
      openapi: "3.1.0",
      info: { title: "dependency-local", version: "1" },
      paths: {
        "/healthy": { get: { responses: { "200": { description: "ok" } } } },
        "/broken": {
          get: {
            parameters: [{ $ref: "#/components/parameters/Missing" }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    }), "json");

    expect(parsed.enumeration.complete).toBe(true);
    expect(parsed.enumeration.operations.map((operation) => operation.key)).toEqual([
      "GET /broken",
      "GET /healthy",
    ]);
    expect(parsed.enumeration.unresolved).toContainEqual(expect.objectContaining({
      code: "UNRESOLVED_PARAMETER_IDENTITY",
      locator: "#/paths/~1broken/get/parameters/0",
    }));
    expect(projectApiTesterOperation(parsed.document, "GET /healthy").complete).toBe(true);
    expect(projectApiTesterOperation(parsed.document, "GET /broken").complete).toBe(false);
  });

  test("projects one or several operations while preserving effective semantics", () => {
    const parsed = parseApiTesterOperationSource(JSON.stringify(DOCUMENT), "json");
    const projected = projectApiTesterOperation(parsed.document, "GET /things/{id}");
    expect(projected.complete).toBe(true);
    expect(projected.dependencies).toMatchObject({
      parameterInheritancePreserved: true,
      securitySemanticsPreserved: true,
      referenceClosurePreserved: true,
    });
    const pathItem = (projected.document.paths as Record<string, Record<string, unknown>>)["/things/{id}"]!;
    expect(pathItem.parameters).toBeUndefined();
    expect(pathItem.post).toBeUndefined();
    expect(pathItem.servers).toEqual([{ url: "https://path.example.test" }]);
    expect((pathItem.get as Record<string, unknown>).parameters).toEqual([
      { in: "path", name: "id", required: true, schema: { type: "integer" } },
      { in: "query", name: "q", schema: { type: "string", minLength: 2 } },
    ]);
    expect((pathItem.get as Record<string, unknown>).security).toEqual([{ BearerAuth: [] }]);

    const aggregate = aggregateApiTesterOperations(parsed.document, [
      "GET /things/{id}",
      "POST /things/{id}",
    ]);
    const aggregatePath = (aggregate.document.paths as Record<string, Record<string, unknown>>)["/things/{id}"]!;
    expect(Object.keys(aggregatePath).sort()).toEqual(["get", "post", "servers", "summary"]);
    expect((aggregatePath.post as Record<string, unknown>).security).toEqual([]);
    expect(aggregate.operationKeys).toEqual(["GET /things/{id}", "POST /things/{id}"]);
  });
});
