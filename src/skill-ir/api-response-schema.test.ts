import { test, expect } from "bun:test";
import { createSchemaChecker, createResponseSchemaChecker } from "./api-schema-checker";

const schema = { type: "object", required: ["id", "secret"], additionalProperties: false, properties: {
  id: { type: "integer", minimum: 1, readOnly: true }, secret: { type: "string", minLength: 2, writeOnly: true },
} };

test("response and request directional properties have separate required and forbidden semantics", () => {
  const response = createResponseSchemaChecker({}, schema), request = createSchemaChecker({}, schema);
  expect(response({ id: 1 }).valid).toBe(true);
  expect(response({}).valid).toBe(false);
  expect(response({ id: 0 }).valid).toBe(false);
  expect(response({ id: 1, secret: "pw" }).valid).toBe(false);
  expect(request({ secret: "pw" }).valid).toBe(true);
  expect(request({ id: 1 }).valid).toBe(false);
  expect(createResponseSchemaChecker({}, schema)({ id: 1 }).valid).toBe(true);
});

test("response direction flows through local references and nested object array properties", () => {
  const document = { components: { schemas: { Id: { type: "integer", minimum: 3, readOnly: true }, Secret: { type: "string", writeOnly: true } } } };
  const nested = { type: "array", items: { type: "object", required: ["id", "secret"], properties: {
    id: { $ref: "#/components/schemas/Id" }, secret: { $ref: "#/components/schemas/Secret" },
  } } };
  const check = createResponseSchemaChecker(document, nested);
  expect(check([{ id: 3 }]).valid).toBe(true);
  expect(check([{ id: 2 }]).valid).toBe(false);
  expect(check([{ id: 3, secret: "leaked" }]).valid).toBe(false);
  expect(check([{}]).valid).toBe(false);
  expect(createResponseSchemaChecker({}, { type: "string", writeOnly: true })("root annotation").valid).toBe(true);
});

test("ambiguous response directional composition and malformed flags remain unsupported", () => {
  for (const s of [
    { allOf: [schema, { type: "object", required: ["secret"] }] },
    { type: "object", properties: { p: { type: "string", readOnly: true, writeOnly: true } } },
    { type: "object", properties: { p: { type: "string", writeOnly: "yes" } } },
  ]) expect(createResponseSchemaChecker({}, s)({}).status).toBe("unsupported");
  expect(createResponseSchemaChecker({}, { allOf: [{ type: "integer", minimum: 2 }, { maximum: 4 }] })(3).valid).toBe(true);
});
