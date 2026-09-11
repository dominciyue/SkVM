import { test, expect } from "bun:test";
import { constructSchemaWitness } from "./api-schema-witness";
import { checkSchemaValue, createSchemaChecker } from "./api-schema-checker";

test("a legal narrow number interval is not restricted to a half-unit grid", () => {
  const schema = { type: "number", minimum: 0.1, maximum: 0.2, exclusiveMinimum: true, exclusiveMaximum: true };
  expect(checkSchemaValue({}, schema, 0.15).valid).toBe(true);
  const result = constructSchemaWitness({}, schema);
  expect(result.status).toBe("constructed");
  expect(checkSchemaValue({}, schema, result.value).valid).toBe(true);
});

test("bounded dyadic intervals retain a known legal witness across sign and endpoint inclusion", () => {
  for (const center of [-2, -0.125, 0, 0.125, 2]) for (const radius of [1 / 32, 1 / 16])
    for (const exclusiveMinimum of [false, true]) for (const exclusiveMaximum of [false, true]) {
      const schema = { type: "number", minimum: center - radius, maximum: center + radius, exclusiveMinimum, exclusiveMaximum };
      expect(checkSchemaValue({}, schema, center).valid).toBe(true);
      const witness = constructSchemaWitness({}, schema, "full");
      expect(witness.status).toBe("constructed");
      expect(checkSchemaValue({}, schema, witness.value).valid).toBe(true);
    }
});

test("inclusive singleton and exclusive negative upper bound have legal finite witnesses", () => {
  for (const [schema, known] of [
    [{ type: "number", minimum: 0.125, maximum: 0.125 }, 0.125],
    [{ type: "number", maximum: -0.1, exclusiveMaximum: true }, -1],
  ] as const) {
    expect(checkSchemaValue({}, schema, known).valid).toBe(true);
    const witness = constructSchemaWitness({}, schema);
    expect(witness.status).toBe("constructed");
    expect(checkSchemaValue({}, schema, witness.value).valid).toBe(true);
  }
});

test("narrow interval search cannot relax integer or multipleOf predicates", () => {
  for (const schema of [
    { type: "integer", minimum: 0.1, maximum: 0.2 },
    { type: "number", minimum: 0.1, maximum: 0.2, multipleOf: 0.5 },
    { type: "number", minimum: 0.125, maximum: 0.125, exclusiveMinimum: true },
  ]) expect(constructSchemaWitness({}, schema).status).toBe("unresolved");
});

test("decimal divisibility matches an independent integer-cents oracle without tolerance", () => {
  const mismatches: unknown[] = [];
  for (const divisorCents of [1, 2, 5, 10, 25]) {
    const check = createSchemaChecker({}, { type: "number", multipleOf: divisorCents / 100 });
    for (let cents = -50; cents <= 50; cents++) {
      const actual = check(cents / 100), expected = cents % divisorCents === 0;
      if (actual.status !== "checked" || actual.valid !== expected) mismatches.push({ divisorCents, cents, expected, actual });
    }
  }
  expect(mismatches).toEqual([]);
});

test("decimal multipleOf retains strict nonmultiples, exponents and nested error identity", () => {
  for (const [divisor, value, expected] of [
    [0.1, 0.30000000000000004, false], [0.1, 0.3, true], [0.2, -0.6, true],
    [1e-7, 3e-7, true], [1e-7, 3.0000000000000004e-7, false],
    [5e-324, 1e-323, true], [1e20, 3e20, true], [0.1, 0, true],
  ] as const) expect(checkSchemaValue({}, { type: "number", multipleOf: divisor }, value).valid).toBe(expected);
  const schema = { type: "object", properties: { "a/b": { allOf: [{ type: "number", multipleOf: 0.1 }] } } };
  const failure = checkSchemaValue({}, schema, { "a/b": 0.31 });
  expect(failure.errors.some(e => e.keyword === "multipleOf" && e.instancePath === "/a~1b" && e.schemaPath === "#/properties/a~1b/allOf/0/multipleOf")).toBe(true);
  for (const divisor of [0, -1, "0.1", null]) expect(checkSchemaValue({}, { multipleOf: divisor }, 1).status).toBe("invalid-schema");
  for (const value of [0.3, -0.3]) {
    const bounded = { type: "number", minimum: value, maximum: value, multipleOf: 0.1 };
    const witness = constructSchemaWitness({}, bounded);
    expect(witness.status).toBe("constructed");
    expect(witness.value).toBe(value);
  }
});
