import { test, expect } from "bun:test";
import { buildApiRequestSpecimens, buildApiFormRequestSpecimens } from "./api-request-specimens";
import { verifyApiRequestSpecimens, verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";

const media = "application/x-www-form-urlencoded";
const doc = {
  openapi: "3.0.3", info: { title: "Synthetic form", version: "1" }, security: [{ Token: [] }],
  components: { securitySchemes: { Token: { type: "http", scheme: "bearer" } }, schemas: {
    Form: { type: "object", properties: { name: { type: "string", enum: ["a+b &中文"] }, note: { type: "string" } } },
  } }, paths: { "/items/{id}": { parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } }],
    post: { requestBody: { required: true, content: { [media]: { schema: { $ref: "#/components/schemas/Form" } } } }, responses: { "200": { description: "unknown business status" } } },
  } },
};

test("new profile constructs full forms while old JSON profile and empty minimal remain unresolved", () => {
  const source = JSON.stringify(doc), old = buildApiRequestSpecimens(source, "json"), form = buildApiFormRequestSpecimens(source, "json");
  expect(old.operations[0]!.cases.filter((c) => c.omit === null).every((c) => c.status === "unresolved")).toBe(true);
  expect(form.schemaVersion).toBe("api-request-form-specimens/v1");
  const cases = form.operations[0]!.cases;
  expect(cases.find((c) => c.mode === "full")?.request?.body?.text).toBe("name=a%2Bb+%26%E4%B8%AD%E6%96%87&note=example");
  expect(cases.find((c) => c.mode === "full")?.request?.target).toBe("/items/a%2Fb");
  expect(cases.find((c) => c.mode === "minimal" && !c.omit)?.status).toBe("unresolved");
  expect(cases.find((c) => c.omit === "body")?.request?.body).toBeNull();
  expect(form.operations[0]!.security).toEqual(doc.security);
  expect(verifyApiFormRequestSpecimens(source, "json", form).status).toBe("pass");
  expect(verifyApiRequestSpecimens(source, "json", old).status).toBe("pass");
  expect(verifyApiRequestSpecimens(source, "json", form).errors).toContain("INVALID_SPECIMEN_REPORT");
  expect(verifyApiFormRequestSpecimens(source, "json", old).errors).toContain("INVALID_SPECIMEN_REPORT");
});

test("form checker locates wire/media corruption and source coverage/dependency loss", () => {
  const source = JSON.stringify(doc), base = buildApiFormRequestSpecimens(source, "json");
  for (const text of ["name=a+b+%26%E4%B8%AD%E6%96%87&note=example", "name=wrong&note=example", "name=x&name=x", "note=example"]) {
    const report = structuredClone(base), c = report.operations[0]!.cases.find((c) => c.mode === "full")!;
    c.request!.body!.text = text;
    expect(verifyApiFormRequestSpecimens(source, "json", report).errors).toContain(`SPECIMEN_REQUEST_MISMATCH: ${report.operations[0]!.key}: ${c.id}`);
  }
  const changed = structuredClone(base); changed.operations[0]!.security = [];
  expect(verifyApiFormRequestSpecimens(source, "json", changed).errors).toContain("RUNTIME_SOURCE_REQUIREMENTS_LOST");
  changed.operations.pop();
  expect(verifyApiFormRequestSpecimens(source, "json", changed).errors).toContain("SOURCE_COVERAGE_MISMATCH");
  const altered = structuredClone(base), c = altered.operations[0]!.cases.find((c) => c.mode === "full")!;
  c.request!.body!.mediaType = "application/json";
  expect(verifyApiFormRequestSpecimens(source, "json", altered).status).toBe("fail");
});

test("custom encoding, non-string values and missing references remain recorded", () => {
  for (const mutate of [
    (d: any) => d.paths["/items/{id}"].post.requestBody.content[media].encoding = {},
    (d: any) => d.components.schemas.Form.properties.name = { type: "integer" },
    (d: any) => delete d.components.schemas.Form,
  ]) {
    const document = structuredClone(doc); mutate(document);
    const source = JSON.stringify(document), report = buildApiFormRequestSpecimens(source, "json");
    expect(report.operations[0]!.cases.find((c) => c.mode === "full")?.status).toBe("unresolved");
    expect(verifyApiFormRequestSpecimens(source, "json", report).status).toBe("pass");
  }
});
