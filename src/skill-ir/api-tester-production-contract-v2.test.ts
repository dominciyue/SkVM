import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION_V2,
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
  ApiTesterProductionBindingSchemaV2,
  ApiTesterProductionContractSchemaV2,
  buildApiTesterProductionContractV2,
  constructApiTesterProductionValidValueV2,
  parseApiTesterProductionBindingV2,
  parseApiTesterProductionDocumentV2,
} from "./api-tester-production-contract-v2";
import { ApiTesterProductionUnsupportedError } from "./api-tester-production-contract";

const FIXTURE = join(import.meta.dir, "fixtures", "api-tester-production-v2", "local-ref-arrays");

function baseOperation(overrides: Record<string, unknown> = {}) {
  return {
    responses: { "200": { description: "ok" }, "400": { description: "bad" } },
    ...overrides,
  };
}

function documentWith(operation: Record<string, unknown>, components?: Record<string, unknown>) {
  return {
    openapi: "3.1.0",
    info: { title: "v2 contract test", version: "1" },
    ...(components ? { components } : {}),
    paths: { "/items": { get: operation } },
  };
}

function unsupportedCode(document: unknown): string {
  try {
    buildApiTesterProductionContractV2(document);
    throw new Error("expected unsupported document");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiTesterProductionUnsupportedError);
    return (error as ApiTesterProductionUnsupportedError).code;
  }
}

describe("API Tester production contract v2", () => {
  test("publishes strict v2 binding and public-contract identities", async () => {
    const binding = parseApiTesterProductionBindingV2(JSON.parse(
      await readFile(join(FIXTURE, "binding.json"), "utf8"),
    ));
    expect(binding).toMatchObject({
      schemaVersion: "skill-ir-api-tester-production-binding/v2",
      bindingId: "local-ref-arrays-api",
    });
    expect(() => ApiTesterProductionBindingSchemaV2.parse({ ...binding, taskId: "forbidden" })).toThrow();
    expect(() => parseApiTesterProductionBindingV2({
      ...binding,
      outputs: { ...binding.outputs, plan: binding.input.path },
    })).toThrow(/distinct/u);
  });

  test("resolves bounded component refs and normalizes primitive arrays and formats", async () => {
    const value = parseApiTesterProductionDocumentV2(
      await readFile(join(FIXTURE, "openapi.yaml"), "utf8"),
      "yaml",
    );
    const contract = ApiTesterProductionContractSchemaV2.parse(
      buildApiTesterProductionContractV2(value),
    );
    expect(contract).toMatchObject({
      schemaVersion: API_TESTER_PRODUCTION_CONTRACT_SCHEMA_VERSION_V2,
      supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    });
    expect(contract.operations.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /items",
      "POST /items",
    ]);

    const queryTags = contract.operations[0]!.fields[0]!;
    expect(queryTags).toEqual({
      kind: "array",
      location: "query",
      name: "tags",
      required: false,
      items: { type: "string", enumValues: ["weather", "marine", "energy"] },
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      encoding: { style: "form", explode: false, wireFormat: "comma-separated" },
    });
    expect(constructApiTesterProductionValidValueV2(queryTags)).toEqual(["weather"]);

    const bodyFields = contract.operations[1]!.fields;
    expect(bodyFields.find(({ name }) => name === "tags")).toMatchObject({
      kind: "array",
      location: "body",
      required: true,
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
    });
    expect(bodyFields.find(({ name }) => name === "publishedOn")).toMatchObject({
      kind: "scalar",
      type: "string",
      format: "date",
    });
    expect(bodyFields.find(({ name }) => name === "score")).toMatchObject({
      kind: "scalar",
      type: "number",
      format: "float",
    });
  });

  test("supports both query form encodings and records their wire meaning", () => {
    const contract = buildApiTesterProductionContractV2(documentWith(baseOperation({
      parameters: [
        { in: "query", name: "csv", explode: false, schema: { type: "array", items: { type: "integer" } } },
        { in: "query", name: "repeat", schema: { type: "array", items: { type: "boolean" } } },
      ],
    })));
    expect(contract.operations[0]!.fields).toEqual([
      expect.objectContaining({
        name: "csv",
        encoding: { style: "form", explode: false, wireFormat: "comma-separated" },
      }),
      expect.objectContaining({
        name: "repeat",
        encoding: { style: "form", explode: true, wireFormat: "repeated-value" },
      }),
    ]);
  });

  test("fails closed on unsafe local-reference shapes", () => {
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ $ref: "https://example.test/parameter.json" }],
    })))).toBe("UNSUPPORTED_REFERENCE");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ $ref: "#/components/parameters/Missing" }],
    }), { parameters: {} }))).toBe("UNSUPPORTED_REFERENCE");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ $ref: "#/components/schemas/Id" }],
    }), { schemas: { Id: { type: "string" } } }))).toBe("UNSUPPORTED_REFERENCE");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ $ref: "#/components/parameters/Id", description: "sibling" }],
    }), { parameters: { Id: { name: "id", in: "query", schema: { type: "string" } } } })))
      .toBe("UNSUPPORTED_REFERENCE");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "id",
        in: "query",
        schema: { $ref: "#/components/schemas/A" },
      }],
    }), { schemas: { A: { $ref: "#/components/schemas/B" }, B: { $ref: "#/components/schemas/A" } } })))
      .toBe("UNSUPPORTED_REFERENCE");
  });

  test("rejects unsupported array serialization, item shape, and bounds", () => {
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "ids",
        in: "query",
        style: "spaceDelimited",
        schema: { type: "array", items: { type: "integer" } },
      }],
    })))).toBe("UNSUPPORTED_PARAMETER");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "ids",
        in: "path",
        required: true,
        schema: { type: "array", items: { type: "integer" } },
      }],
    })))).toBe("UNSUPPORTED_PARAMETER");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "objects",
        in: "query",
        schema: { type: "array", items: { type: "object", properties: {} } },
      }],
    })))).toBe("UNSUPPORTED_SCHEMA");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "too-many",
        in: "query",
        schema: { type: "array", maxItems: 65, items: { type: "string" } },
      }],
    })))).toBe("UNSUPPORTED_SCHEMA");
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "impossible",
        in: "query",
        schema: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: { type: "string", enum: ["only"] },
        },
      }],
    })))).toBe("UNCONSTRUCTIBLE_CONSTRAINT");
  });

  test("constructs bounded edge values without deferring failures to the generator", () => {
    const emptyScalar = buildApiTesterProductionContractV2(documentWith(baseOperation({
      parameters: [{
        name: "empty",
        in: "query",
        schema: { type: "string", maxLength: 0 },
      }],
    }))).operations[0]!.fields[0]!;
    expect(constructApiTesterProductionValidValueV2(emptyScalar)).toBe("");

    const narrowUniqueNumbers = buildApiTesterProductionContractV2(documentWith(baseOperation({
      parameters: [{
        name: "ratios",
        in: "query",
        schema: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
          items: { type: "number", minimum: 0, maximum: 0.5 },
        },
      }],
    }))).operations[0]!.fields[0]!;
    expect(constructApiTesterProductionValidValueV2(narrowUniqueNumbers)).toEqual([0, 0.5]);

    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        name: "never-has-an-item",
        in: "query",
        schema: { type: "array", maxItems: 0, items: { type: "string" } },
      }],
    })))).toBe("UNCONSTRUCTIBLE_CONSTRAINT");
  });
});
