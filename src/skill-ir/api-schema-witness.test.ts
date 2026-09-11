import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { constructSchemaWitness } from "./api-schema-witness";
import { checkSchemaValue } from "./api-schema-checker";

test("nested objects, arrays and local refs construct independently checked minimal and full values", () => {
  const document = { components: { schemas: { Item: { type: "object", required: ["id"], additionalProperties: false,
    properties: { id: { type: "integer", minimum: 3, maximum: 8 }, label: { type: "string", minLength: 2 },
      server: { type: "string", readOnly: true } } } } } };
  const schema = { type: "object", required: ["items"], properties: {
    items: { type: "array", minItems: 2, maxItems: 3, uniqueItems: true, items: { $ref: "#/components/schemas/Item" } },
    note: { type: "string" },
  } };
  const minimal = constructSchemaWitness(document, schema, "minimal");
  const full = constructSchemaWitness(document, schema, "full");
  expect(minimal.status).toBe("constructed");
  expect(full.status).toBe("constructed");
  expect(checkSchemaValue(document, schema, minimal.value).valid).toBe(true);
  expect(checkSchemaValue(document, schema, full.value).valid).toBe(true);
  expect((minimal.value as any).note).toBeUndefined();
  expect((full.value as any).note).toBeDefined();
  expect((full.value as any).items[0].server).toBeUndefined();
  const broken = structuredClone(full.value) as any;
  delete broken.items[0].id;
  expect(checkSchemaValue(document, schema, broken).valid).toBe(false);
});

test("composition witnesses satisfy all branches and impossible oneOf does not silently select its first branch", () => {
  const schema = { allOf: [
    { type: "object", required: ["n"], properties: { n: { type: "integer", minimum: 3 } } },
    { type: "object", required: ["name"], properties: { n: { type: "integer", maximum: 5 }, name: { type: "string", enum: ["a", "b"] } } },
  ] };
  const r = constructSchemaWitness({}, schema, "full");
  expect(r.status).toBe("constructed");
  expect(checkSchemaValue({}, schema, r.value).valid).toBe(true);
  const impossible = { oneOf: [{ type: "integer" }, { type: "integer" }] };
  expect(constructSchemaWitness({}, impossible, "minimal").status).toBe("unresolved");
});

test("actual Brex nested blueprint and 1Password date-time contract produce checked values", async () => {
  const root = "results/skill-ir/skill-family-deepening-20260911/api-inputs/sources/";
  for (const [file, name] of [["brex-budgets.yaml", "CreateBudgetBlueprintRequest"], ["onepassword-partnership.yaml", "UpdatePartnerAccountRequest"]]) {
    const document = parse(await readFile(root + file, "utf8"));
    const schema = { $ref: `#/components/schemas/${name}` };
    const r = constructSchemaWitness(document, schema, "full");
    expect(r.status).toBe("constructed");
    expect(checkSchemaValue(document, schema, r.value).valid).toBe(true);
  }
});

test("checker preserves nullable enum, exclusive bounds, readOnly and unsupported semantics", () => {
  expect(checkSchemaValue({}, { type: "string", nullable: true, enum: ["a"] }, null).valid).toBe(false);
  expect(checkSchemaValue({}, { type: "number", minimum: 2, exclusiveMinimum: true }, 2).valid).toBe(false);
  expect(checkSchemaValue({}, { type: "number", minimum: 2, exclusiveMinimum: true }, 2.5).valid).toBe(true);
  const schema = { type: "object", required: ["id"], properties: { id: { type: "string", readOnly: true } } };
  expect(checkSchemaValue({}, schema, {}).valid).toBe(true);
  expect(checkSchemaValue({}, schema, { id: "server-value" }).valid).toBe(false);
  expect(checkSchemaValue({}, { type: "string", format: "custom-format" }, "anything").status).toBe("unsupported");
  expect(checkSchemaValue({}, { $ref: "https://example.org/schema" }, {}).status).toBe("unsupported");
  expect(checkSchemaValue({}, { type: "string", pattern: "^(a+)+$" }, "a").status).toBe("unsupported");
});

test("short constrained strings can provide distinct unique array items", () => {
  const schema = { type: "array", minItems: 3, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 1 } };
  const result = constructSchemaWitness({}, schema, "minimal");
  expect(result.status).toBe("constructed");
  expect(checkSchemaValue({}, schema, result.value).valid).toBe(true);
});

test("checker does not silently treat an incompatible numeric format as a string annotation", () => {
  expect(checkSchemaValue({}, { type: "string", format: "int32" }, "not-a-number").status).toBe("unsupported");
});

test("constructs and independently checks the OpenAPI url format used by class-proof inputs", () => {
  const schema = { type: "string", format: "url" };
  const result = constructSchemaWitness({}, schema, "full");
  expect(result.status).toBe("constructed");
  expect(typeof result.value).toBe("string");
  expect(checkSchemaValue({}, schema, result.value).valid).toBe(true);
  expect(checkSchemaValue({}, schema, "not a url").valid).toBe(false);
});

test("full witnesses can distinguish overlapping optional object branches without weakening oneOf", async () => {
  const schema = { oneOf: [
    { type: "object", properties: { left: { type: "string" } } },
    { type: "object", properties: { right: { type: "integer" } } },
  ] };
  const synthetic = constructSchemaWitness({}, schema, "full");
  expect(synthetic.status).toBe("constructed");
  expect(checkSchemaValue({}, schema, synthetic.value).valid).toBe(true);
  const document = parse(await readFile("results/skill-ir/skill-family-deepening-20260911/api-inputs/sources/adatree-consent.yaml", "utf8"));
  const actual = { $ref: "#/components/schemas/ConsentUpdateViaDashboardRequest" };
  const result = constructSchemaWitness(document, actual, "full");
  expect(result.status).toBe("constructed");
  expect(checkSchemaValue(document, actual, result.value).valid).toBe(true);
  expect(constructSchemaWitness(document, actual, "minimal").status).toBe("unresolved");
  expect(constructSchemaWitness({}, { oneOf: [{ type: "object" }, { type: "object" }] }, "full").status).toBe("unresolved");
});
