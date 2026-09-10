import { test, expect } from "bun:test";
import { createSchemaChecker, getSchemaCheckerCacheMetrics } from "./api-schema-checker";

test("equal source constraints reuse compilation without stale reference or annotation state", () => {
  const document = { components: { schemas: { Value: { type: "integer", minimum: 17391 } } } };
  const schema = { $ref: "#/components/schemas/Value" };
  const before = getSchemaCheckerCacheMetrics();
  const first = createSchemaChecker(document, schema);
  expect(first(17391).valid).toBe(true);
  const second = createSchemaChecker(structuredClone(document), schema);
  expect(second(17390).valid).toBe(false);
  expect(getSchemaCheckerCacheMetrics().compiles - before.compiles).toBe(1);
  expect(getSchemaCheckerCacheMetrics().hits - before.hits).toBe(1);
  document.components.schemas.Value.minimum = 17392;
  expect(createSchemaChecker(document, schema)(17391).valid).toBe(false);
  expect(first(17391).valid).toBe(true);
  const annotated = createSchemaChecker({}, { type: "integer", minimum: 17392, "x-note": "source" });
  expect(annotated(0).annotationsNotValidated).toEqual(["x-note"]);
  expect(createSchemaChecker(document, schema)(0).annotationsNotValidated).toEqual([]);
});

test("cached validators copy errors and evict least recently used entries", () => {
  const schema = { type: "string", minLength: 93 };
  const first = createSchemaChecker({}, schema);
  const invalid = first(1);
  const saved = structuredClone(invalid);
  createSchemaChecker({}, schema)("a".repeat(93));
  expect(invalid).toEqual(saved);
  for (let i = 0; i < 129; i++) createSchemaChecker({}, { type: "number", minimum: 23400 + i });
  expect(getSchemaCheckerCacheMetrics().entries).toBeLessThanOrEqual(128);
  const before = getSchemaCheckerCacheMetrics().compiles;
  createSchemaChecker({}, schema);
  expect(getSchemaCheckerCacheMetrics().compiles).toBe(before + 1);
});
