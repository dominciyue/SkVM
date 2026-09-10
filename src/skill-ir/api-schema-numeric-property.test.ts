import { test, expect } from "bun:test";
import { constructSchemaWitness } from "./api-schema-witness";
import { checkSchemaValue } from "./api-schema-checker";

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
