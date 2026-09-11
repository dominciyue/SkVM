import { test, expect } from "bun:test";
import { checkSchemaValue, checkSchemaWitnessShape } from "./api-schema-checker";
import { constructSchemaWitness } from "./api-schema-witness";

type Combination = "allOf" | "anyOf" | "oneOf";
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const property = (name: string) => ({ type: "object", required: [name], properties: { [name]: { type: "boolean" } } });
const branch = (value: unknown, name: string) => plain(value) && Object.hasOwn(value, name) && typeof value[name] === "boolean";
const combine = (operator: Combination, bits: boolean[]) => operator === "allOf" ? bits.every(Boolean) : operator === "anyOf" ? bits.some(Boolean) : bits.filter(Boolean).length === 1;
function domain(names: string[]): unknown[] {
  let objects: Record<string, unknown>[] = [{}];
  for (const name of names) objects = objects.flatMap((base) => [base, ...[false, true, 0, "wrong"].map((value) => ({ ...base, [name]: value }))]);
  return [...objects, null, 7, []];
}

test("source checker matches independent finite Boolean-object truth tables across nesting and branch order", () => {
  const names = ["a/b~c", "right"], values = domain(names);
  for (const operator of ["allOf", "anyOf", "oneOf"] as const) for (const reversed of [false, true]) {
    const ordered = reversed ? [...names].reverse() : names;
    const inner = { [operator]: ordered.map(property) };
    for (const container of ["root", "object", "array"] as const) {
      const schema = container === "root" ? inner : container === "object"
        ? { type: "object", required: ["value"], properties: { value: inner } }
        : { type: "array", minItems: 1, maxItems: 1, items: inner };
      for (const value of values) {
        const candidate = container === "root" ? value : container === "object" ? { value } : [value];
        const expected = combine(operator, names.map((name) => branch(value, name)));
        const actual = checkSchemaValue({}, schema, candidate);
        expect(actual.status).toBe("checked");
        expect(actual.valid).toBe(expected);
      }
    }
  }
});

test.each([ ["anyOf", "anyOf"], ["anyOf", "oneOf"], ["oneOf", "anyOf"], ["oneOf", "oneOf"] ] as const)(
  "intersected %s and %s groups retain both constraints and construct a known finite full witness", (left, right) => {
    const source = { allOf: [ { [left]: [property("a"), property("b")] }, { [right]: [property("c"), property("d")] } ] };
    const oracle = (v: unknown) => combine(left, [branch(v, "a"), branch(v, "b")]) && combine(right, [branch(v, "c"), branch(v, "d")]);
    for (const value of domain(["a", "b", "c", "d"])) {
      expect(checkSchemaValue({}, source, value).valid).toBe(oracle(value));
    }
    const known = { a: true, c: true };
    expect(oracle(known)).toBe(true);
    expect(checkSchemaWitnessShape({}, source, known, "full")).toBe(true);
    const witness = constructSchemaWitness({}, source, "full");
    expect(witness.status).toBe("constructed");
    expect(oracle(witness.value)).toBe(true);
    expect(checkSchemaWitnessShape({}, source, witness.value, "full")).toBe(true);
  },
);

test("joint selection can satisfy a shared-property off-diagonal intersection", () => {
  const choice = (value: number) => ({ type: "object", required: ["value"], properties: { value: { type: "integer", enum: [value] } } });
  const source = { allOf: [{ anyOf: [choice(0), choice(1)] }, { oneOf: [choice(1), choice(2)] }] };
  const witness = constructSchemaWitness({}, source, "full");
  expect(witness.status).toBe("constructed");
  expect(witness.value).toEqual({ value: 1 });
  expect(witness.attempts).toBeLessThanOrEqual(64);
});
