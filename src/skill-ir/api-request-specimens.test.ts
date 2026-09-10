import { test, expect } from "bun:test";
import { buildApiRequestSpecimens } from "./api-request-specimens";
import { verifyApiRequestSpecimens } from "./api-request-specimens-checker";

const document = {
  openapi: "3.0.3", info: { title: "Synthetic assembly", version: "1" },
  servers: [{ url: "https://example.invalid/v1" }], security: [{ Token: [] }],
  components: { securitySchemes: { Token: { type: "http", scheme: "bearer" } } },
  paths: { "/items/{id}": {
    parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } }],
    post: { parameters: [
      { in: "query", name: "q", required: true, schema: { type: "string", enum: ["a&b"] } },
      { in: "header", name: "X-Optional", schema: { type: "integer", enum: [3] } },
    ], requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", required: ["name"], properties: { name: { type: "string", enum: ["item"] }, note: { type: "boolean" } },
    } } } }, responses: { "201": { description: "created" } } },
  } },
};

test("source-bound specimens assemble inherited presence, query, header and JSON body", () => {
  const source = JSON.stringify(document), report = buildApiRequestSpecimens(source, "json");
  const op = report.operations[0]!;
  expect(op.security).toEqual(document.security);
  expect(op.servers).toEqual(document.servers);
  expect(op.cases).toHaveLength(4);
  const minimal = op.cases.find((c) => c.mode === "minimal" && c.omit === null)!;
  expect(minimal.status).toBe("constructed");
  expect(minimal.request?.target).toBe("/items/a%2Fb?q=a%26b");
  expect(minimal.request?.headers).toEqual([{ name: "content-type", value: "application/json" }]);
  expect(minimal.request?.body?.value).toEqual({ name: "item" });
  const full = op.cases.find((c) => c.mode === "full")!;
  expect(full.request?.headers).toContainEqual({ name: "x-optional", value: "3" });
  expect(full.request?.body?.value).toHaveProperty("note");
  expect(op.cases.find((c) => c.omit === "query:q")?.request?.target).toBe("/items/a%2Fb");
  expect(op.cases.find((c) => c.omit === "body")?.request?.body).toBeNull();
  expect(report.wholeSkillCompleted).toBe(false);
  expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
});

test("independent specimen checker catches lost required values, cases, source runtime requirements and tampered layout", () => {
  const source = JSON.stringify(document), base = buildApiRequestSpecimens(source, "json");
  const mutations = [
    (r: any) => r.operations.pop(),
    (r: any) => r.operations[0].cases.pop(),
    (r: any) => r.operations[0].cases.push(r.operations[0].cases[0]),
    (r: any) => r.operations[0].security = [],
    (r: any) => r.operations[0].servers = [],
    (r: any) => r.operations[0].cases[0].request.target = "/items/a/b?q=a&b",
    (r: any) => r.operations[0].cases[0].request.parameters.pop(),
    (r: any) => r.operations[0].cases[0].request.body.text = "{}",
    (r: any) => r.operations[0].cases[0].expectedHttpStatus = 400,
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base); mutate(changed);
    expect(verifyApiRequestSpecimens(source, "json", changed).status).toBe("fail");
  }
});

test("optional bodies retain unsupported media cases while minimal omits the body", () => {
  const doc = structuredClone(document) as any;
  doc.paths["/items/{id}"].post.requestBody = { content: {
    "application/json": { schema: { type: "integer", enum: [2] } },
    "text/plain": { schema: { type: "string" } },
  } };
  const source = JSON.stringify(doc), report = buildApiRequestSpecimens(source, "json"), cases = report.operations[0]!.cases;
  expect(cases.find((c) => c.mode === "minimal" && c.omit === null)?.request?.body).toBeNull();
  expect(cases.find((c) => c.mediaType === "text/plain")?.status).toBe("unresolved");
  expect(cases.find((c) => c.mediaType === "application/json")?.status).toBe("constructed");
  expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
});

test("no-schema operations and operation-level parameter overrides have explicit presence semantics", () => {
  const doc = structuredClone(document) as any;
  doc.paths["/health"] = { get: { security: [], responses: { "200": { description: "ok" } } } };
  doc.paths["/items/{id}"].parameters.push({ in: "query", name: "q", required: true, schema: { type: "integer" } });
  doc.paths["/items/{id}"].post.parameters[0].required = false;
  const source = JSON.stringify(doc), report = buildApiRequestSpecimens(source, "json");
  expect(report.operations.find((o) => o.key === "GET /health")?.cases.every((c) => c.status === "constructed")).toBe(true);
  expect(report.operations.find((o) => o.key === "POST /items/{id}")?.cases.find((c) => c.mode === "minimal" && c.omit === null)?.request?.target).toBe("/items/a%2Fb");
  expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
});

test("malformed URI source paths cannot become constructed request targets", () => {
  for (const path of ["/bad%escape", "/raw中文", "/dot/../segment", "/path#fragment"]) {
    const source = JSON.stringify({ openapi: "3.0.3", info: { title: "bad target", version: "1" }, paths: { [path]: { get: { responses: { "200": { description: "ok" } } } } } });
    const report = buildApiRequestSpecimens(source, "json");
    expect(report.operations[0]!.cases.every((c) => c.status === "unresolved")).toBe(true);
    expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
  }
});

test("duplicate declarations and missing body dependencies retain incomplete case inventory", () => {
  for (const mutate of [
    (d: any) => d.paths["/items/{id}"].post.parameters.push(d.paths["/items/{id}"].post.parameters[0]),
    (d: any) => d.paths["/items/{id}"].post.requestBody = { $ref: "#/components/requestBodies/Missing" },
  ]) {
    const doc = structuredClone(document); mutate(doc);
    const source = JSON.stringify(doc), report = buildApiRequestSpecimens(source, "json");
    expect(report.operations[0]!.caseInventoryComplete).toBe(false);
    expect(report.operations[0]!.issues.length).toBeGreaterThan(0);
    expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
  }
});

test("body declarations on unsupported HTTP methods remain unresolved, not silently discarded", () => {
  for (const method of ["get", "head", "delete", "options", "trace"]) {
    const doc = structuredClone(document) as any, item = doc.paths["/items/{id}"];
    item[method] = item.post; delete item.post;
    const source = JSON.stringify(doc), report = buildApiRequestSpecimens(source, "json");
    expect(report.operations[0]!.cases).toHaveLength(4);
    expect(report.operations[0]!.cases.every((c) => c.status === "unresolved" && c.reasons.some((r) => r.includes("method")))).toBe(true);
    expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("pass");
  }
});

test("checker rejects a constructed POST specimen relabeled to DELETE even when the source binding is updated", () => {
  const original = JSON.stringify(document), report = buildApiRequestSpecimens(original, "json");
  const doc = structuredClone(document) as any, item = doc.paths["/items/{id}"];
  item.delete = item.post; delete item.post;
  const source = JSON.stringify(doc);
  report.sourceSha256 = new Bun.CryptoHasher("sha256").update(source).digest("hex");
  report.operations[0]!.key = "DELETE /items/{id}";
  for (const c of report.operations[0]!.cases) if (c.request) c.request.method = "DELETE";
  expect(verifyApiRequestSpecimens(source, "json", report).status).toBe("fail");
});
