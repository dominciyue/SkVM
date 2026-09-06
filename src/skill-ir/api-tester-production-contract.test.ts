import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  ApiTesterProductionUnsupportedError,
  buildApiTesterProductionContract,
  parseApiTesterProductionBinding,
  parseApiTesterProductionDocument,
} from "./api-tester-production-contract";

const FIXTURES = join(import.meta.dir, "fixtures", "api-tester-production");

async function fixture(name: "books" | "orders") {
  const binding = parseApiTesterProductionBinding(JSON.parse(
    await readFile(join(FIXTURES, name, "binding.json"), "utf8"),
  ));
  const document = parseApiTesterProductionDocument(
    await readFile(join(FIXTURES, name, binding.input.path), "utf8"),
    binding.input.format,
  );
  return { binding, contract: buildApiTesterProductionContract(document) };
}

function unsupportedCode(document: unknown): string {
  try {
    buildApiTesterProductionContract(document);
    throw new Error("expected unsupported document");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiTesterProductionUnsupportedError);
    return (error as ApiTesterProductionUnsupportedError).code;
  }
}

function baseOperation(overrides: Record<string, unknown> = {}) {
  return {
    responses: { "200": { description: "ok" }, "400": { description: "bad" } },
    ...overrides,
  };
}

function documentWith(operation: Record<string, unknown>, components?: Record<string, unknown>) {
  return {
    openapi: "3.0.3",
    info: { title: "contract test", version: "1" },
    ...(components ? { components } : {}),
    paths: { "/items": { get: operation } },
  };
}

describe("API Tester production binding", () => {
  test("accepts ordinary JSON/YAML input-output bindings and rejects drift", async () => {
    const books = (await fixture("books")).binding;
    const orders = (await fixture("orders")).binding;
    expect(books).toMatchObject({
      schemaVersion: "skill-ir-api-tester-production-binding/v1",
      bindingId: "books-api",
      input: { path: "api/openapi.json", format: "json" },
    });
    expect(orders.outputs).toEqual({
      plan: "build/orders-plan.json",
      report: "build/orders-report.json",
    });
    expect(() => parseApiTesterProductionBinding({ ...books, taskId: "forbidden" })).toThrow();
    expect(() => parseApiTesterProductionBinding({
      ...books,
      outputs: { ...books.outputs, plan: books.input.path },
    })).toThrow(/distinct/u);
    expect(() => parseApiTesterProductionBinding({
      ...books,
      input: { path: "api/openapi.yaml", format: "json" },
    })).toThrow(/extension/u);
    expect(() => parseApiTesterProductionBinding({
      ...books,
      input: { path: "../openapi.json", format: "json" },
    })).toThrow();
  });

  test("derives one normalized public contract for two new development inputs", async () => {
    const books = await fixture("books");
    const orders = await fixture("orders");
    expect(books.contract.schemaVersion).toBe("skill-ir-api-tester-public-contract/v1");
    expect(books.contract.operations.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /books",
      "GET /books/{bookId}",
    ]);
    expect(books.contract.operations[0]!.securityHeaders).toEqual(["Authorization"]);
    expect(books.contract.operations[0]!.fields.map(({ name }) => name)).toEqual([
      "edition",
      "genre",
      "title",
    ]);
    expect(orders.contract.operations.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /orders",
      "POST /orders",
    ]);
    expect(orders.contract.operations[0]!.securityHeaders).toEqual(["X-Orders-Key"]);
    expect(orders.contract.operations[1]!.fields.find(({ name }) => name === "customerEmail")?.format)
      .toBe("email");
  });

  test("rejects unsupported public structures with stable reason codes", () => {
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ $ref: "#/components/parameters/Limit" }],
    })))).toBe("UNSUPPORTED_REFERENCE");

    expect(unsupportedCode(documentWith(baseOperation({ security: [{ oauth: ["read"] }] }), {
      securitySchemes: { oauth: { type: "oauth2", flows: {} } },
    }))).toBe("UNSUPPORTED_SECURITY");

    expect(unsupportedCode(documentWith(baseOperation({
      requestBody: { content: { "multipart/form-data": { schema: { type: "object" } } } },
    })))).toBe("UNSUPPORTED_REQUEST_BODY");

    expect(unsupportedCode(documentWith({ responses: { "404": { description: "missing" } } })))
      .toBe("UNSUPPORTED_RESPONSE");

    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{ in: "query", name: "q", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "ok" } },
    })))).toBe("MISSING_REQUIRED_ERROR_RESPONSE");

    expect(unsupportedCode(documentWith(baseOperation({
      security: [{ bearer: [] }],
      responses: { "200": { description: "ok" }, "400": { description: "bad" } },
    }), {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    }))).toBe("MISSING_SECURITY_ERROR_RESPONSE");
  });

  test("rejects semantic constraints that cannot produce a valid request", () => {
    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        in: "query",
        name: "limit",
        schema: { type: "integer", minimum: 10, maximum: 2 },
      }],
    })))).toBe("UNCONSTRUCTIBLE_CONSTRAINT");

    expect(unsupportedCode(documentWith(baseOperation({
      parameters: [{
        in: "query",
        name: "email",
        schema: { type: "string", enum: ["not-an-email"], format: "email" },
      }],
    })))).toBe("UNCONSTRUCTIBLE_CONSTRAINT");
  });
});
