import { test, expect } from "bun:test";
import { checkApiResponseHeaders } from "./api-response-headers";
const doc = { openapi: "3.0.3", info: { title: "Header fixture", version: "1" }, paths: { "/x": { get: { responses: {
  "200": { description: "explicit", headers: {
    "X-Count": { required: true, schema: { type: "integer", minimum: 0 } },
    "X-Tags": { schema: { type: "array", items: { type: "string", enum: ["a", "b"] }, minItems: 2 } },
    "X-Optional": { schema: { type: "boolean" } },
    "Content-Type": { schema: { type: "string", enum: ["ignored"] } },
  } }, "2XX": { description: "range", headers: { "X-Range": { schema: { type: "string" } } } },
} } } } };
const observation = { operationKey: "GET /x", statusCode: 200, headers: [{ name: "x-count", value: "3" }, { name: "X-Tags", value: "a,b" }, { name: "Server", value: "fixture" }] };
test("header observation preserves every source declaration and distinguishes optional absence", () => {
  const result = checkApiResponseHeaders(JSON.stringify(doc), "json", observation);
  expect(result.status).toBe("checked"); expect(result.valid).toBe(true);
  expect(result.responseKey).toBe("200"); expect(result.headers).toHaveLength(4);
  expect(result.headers.find((r: any) => r.name === "X-Optional")?.status).toBe("absent-optional");
  expect(result.headers.find((r: any) => r.name === "Content-Type")?.status).toBe("ignored-content-type");
  expect(result.unclaimedObservedHeaders).toEqual(["Server"]);
  expect(result.wholeResponseVerified).toBe(false);
});
test("required absence, malformed scalar, field constraint and array loss fail at declared field", () => {
  for (const headers of [[], [{ name: "x-count", value: "-1" }], [{ name: "x-count", value: "3x" }],
    [{ name: "x-count", value: "3" }, { name: "X-Tags", value: "a" }]]) {
    const r = checkApiResponseHeaders(JSON.stringify(doc), "json", { ...observation, headers });
    expect(r.status).toBe("checked"); expect(r.valid).toBe(false);
  }
});
test("duplicate observed/source names and unsupported header semantics cannot silently pass", () => {
  const duplicate = checkApiResponseHeaders(JSON.stringify(doc), "json", { ...observation, headers: [...observation.headers, { name: "X-COUNT", value: "3" }] });
  expect(duplicate.status).toBe("invalid-observation");
  const changed: any = structuredClone(doc); changed.paths["/x"].get.responses["200"].headers["x-count"] = { schema: { type: "string" } };
  const duplicateSource = checkApiResponseHeaders(JSON.stringify(changed), "json", observation);
  expect(duplicateSource.status).toBe("unresolved");
  expect(duplicateSource.headers).toHaveLength(5);
  delete changed.paths["/x"].get.responses["200"].headers["x-count"];
  changed.paths["/x"].get.responses["200"].headers["X-Complex"] = { content: { "application/json": { schema: { type: "object" } } } };
  const r = checkApiResponseHeaders(JSON.stringify(changed), "json", observation);
  expect(r.status).toBe("unresolved"); expect(r.valid).toBe(null); expect(r.headers).toHaveLength(5);
});

test("source collisions retain both rows and malformed raw observations never get coerced", () => {
  for (const value of ["line\nfold", "nul\u0000byte", "x".repeat(4097)]) {
    expect(checkApiResponseHeaders(JSON.stringify(doc), "json", { ...observation, headers: [{ name: "X-Count", value }] }).status).toBe("invalid-observation");
  }
  expect(checkApiResponseHeaders(JSON.stringify(doc), "json", { ...observation, statusCode: 201, headers: [] }).responseKey).toBe("2XX");
  expect(checkApiResponseHeaders(JSON.stringify(doc), "json", { ...observation, statusCode: 404, headers: [] }).errors).toContain("RESPONSE_STATUS_UNDECLARED");
});
test("local response/header/schema references are checked; missing reference stays unresolved", () => {
  const changed: any = structuredClone(doc);
  changed.components = { responses: { R: changed.paths["/x"].get.responses["200"] }, headers: { C: { required: true, schema: { $ref: "#/components/schemas/N" } } }, schemas: { N: { type: "integer", minimum: 0 } } };
  changed.paths["/x"].get.responses["200"] = { $ref: "#/components/responses/R" };
  changed.components.responses.R.headers["X-Count"] = { $ref: "#/components/headers/C" };
  expect(checkApiResponseHeaders(JSON.stringify(changed), "json", observation).valid).toBe(true);
  delete changed.components.schemas.N;
  expect(checkApiResponseHeaders(JSON.stringify(changed), "json", observation).status).toBe("unresolved");
});
