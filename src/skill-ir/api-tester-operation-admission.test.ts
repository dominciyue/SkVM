import { describe, expect, test } from "bun:test";
import {
  analyzeApiTesterOperation,
  verifyApiTesterOperationAdmissionConsistency,
} from "./api-tester-operation-admission";
import { parseApiTesterOperationSource } from "./api-tester-operation-source";

function acceptedDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "accepted", version: "1" },
    security: [{ BearerAuth: [] }],
    components: {
      parameters: {
        Search: { name: "q", in: "query", required: true, schema: { type: "string", minLength: 1 } },
      },
      securitySchemes: { BearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths: {
      "/items": {
        parameters: [{ $ref: "#/components/parameters/Search" }],
        get: {
          summary: "List items",
          responses: {
            "200": { description: "ok" },
            "400": { description: "bad" },
            "401": { description: "unauthorized" },
          },
        },
      },
    },
  };
}

describe("API Tester operation admission", () => {
  test("accepts one dependency-preserving operation through the unchanged v2 contract", () => {
    const parsed = parseApiTesterOperationSource(JSON.stringify(acceptedDocument()), "json");
    const admission = analyzeApiTesterOperation({
      document: parsed.document,
      operation: parsed.enumeration.operations[0]!,
    });

    expect(admission).toMatchObject({
      operationKey: "GET /items",
      status: "accepted",
      findings: [],
      firstObservedRejection: null,
      normalizedOperation: {
        method: "GET",
        path: "/items",
        successStatuses: [200],
        errorStatuses: [400, 401],
        securityHeaders: ["Authorization"],
      },
      projection: {
        complete: true,
        dependencies: {
          parameterInheritancePreserved: true,
          securitySemanticsPreserved: true,
          referenceClosurePreserved: true,
          requestResponsePreserved: true,
        },
      },
    });
  });

  test("reports all locatable gaps instead of presenting the v2 first rejection as the gap set", () => {
    const value = {
      openapi: "3.1.0",
      info: { title: "many gaps", version: "1" },
      security: [{ OAuth: ["write"] }],
      components: {
        securitySchemes: {
          OAuth: { type: "oauth2", flows: {} },
        },
      },
      paths: {
        "/items": {
          post: {
            callbacks: { done: { "{$request.body#/callback}": {} } },
            parameters: [
              { name: "session", in: "cookie", schema: { type: "string", pattern: "^[a-z]+$" } },
              { name: "limit", in: "query", schema: { type: "integer", multipleOf: 2 } },
            ],
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: { type: "object", properties: { ids: { type: "array", items: { type: "object" } } } },
                },
              },
            },
            responses: {
              default: { description: "default" },
              "302": { description: "redirect" },
            },
          },
        },
      },
    };
    const parsed = parseApiTesterOperationSource(JSON.stringify(value), "json");
    const admission = analyzeApiTesterOperation({
      document: parsed.document,
      operation: parsed.enumeration.operations[0]!,
    });

    expect(admission.status).toBe("rejected");
    expect(admission.firstObservedRejection).toMatchObject({
      code: "UNSUPPORTED_OPENAPI_FEATURE",
      completeGapSet: false,
    });
    expect(admission.findings.length).toBeGreaterThanOrEqual(7);
    expect(new Set(admission.findings.map((finding) => finding.locator)).size)
      .toBe(admission.findings.length);
    expect(admission.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNSUPPORTED_CALLBACK", category: "semantics-not-preserved" }),
      expect.objectContaining({ code: "UNSUPPORTED_PARAMETER_LOCATION", category: "unsupported-syntax" }),
      expect.objectContaining({ code: "UNSUPPORTED_SCHEMA_PATTERN", category: "missing-public-construction-evidence" }),
      expect.objectContaining({ code: "UNSUPPORTED_SCHEMA_MULTIPLE_OF", category: "missing-public-construction-evidence" }),
      expect.objectContaining({ code: "UNSUPPORTED_REQUEST_MEDIA_TYPE", category: "semantics-not-preserved" }),
      expect.objectContaining({ code: "UNSUPPORTED_RESPONSE_STATUS", category: "unsupported-syntax" }),
      expect.objectContaining({ code: "MISSING_SUCCESS_RESPONSE", category: "missing-public-construction-evidence" }),
      expect.objectContaining({ code: "UNSUPPORTED_SECURITY_SCOPE", category: "semantics-not-preserved" }),
    ]));
  });

  test("records unexpected projection failures as implementation failures", () => {
    const parsed = parseApiTesterOperationSource(JSON.stringify(acceptedDocument()), "json");
    const poisoned = structuredClone(parsed.document!);
    poisoned.components = new Proxy(poisoned.components as object, {
      ownKeys() {
        throw new Error("injected projection crash");
      },
    });
    const admission = analyzeApiTesterOperation({
      document: poisoned,
      operation: parsed.enumeration.operations[0]!,
    });
    expect(admission.status).toBe("unresolved");
    expect(admission.findings).toContainEqual(expect.objectContaining({
      code: "IMPLEMENTATION_FAILURE",
      category: "implementation-failure",
      message: expect.stringContaining("injected projection crash"),
    }));
  });

  test("rejects a false accepted row during report consistency validation", () => {
    const result = verifyApiTesterOperationAdmissionConsistency([
      {
        operationKey: "GET /items",
        status: "accepted",
        findings: [{
          code: "UNSUPPORTED_SCHEMA_PATTERN",
          category: "missing-public-construction-evidence",
          locator: "#/paths/~1items/get/parameters/0/schema/pattern",
          message: "pattern has no construction basis",
        }],
        firstObservedRejection: {
          code: "UNSUPPORTED_SCHEMA",
          message: "unsupported",
          completeGapSet: false,
        },
        normalizedOperation: null,
      },
    ]);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain("FALSE_ACCEPTANCE");
  });
});
