import { test, expect } from "bun:test";
import { encodeApiFormBody } from "./api-form-wire";
import { verifyApiFormBodyWire } from "./api-form-wire-checker";

test("flat string form values encode UTF-8 without structural ambiguity", () => {
  const value = { "a+b": "x y&z=%", "中文": "🙂", empty: "", "__proto__": "ignored-literal" };
  const text = encodeApiFormBody(value);
  expect(text).toBe("a%2Bb=x+y%26z%3D%25&empty=&%E4%B8%AD%E6%96%87=%F0%9F%99%82");
  expect(verifyApiFormBodyWire(value, text)).toBe(true);
  expect(verifyApiFormBodyWire(value, "%e4%b8%ad%e6%96%87=%f0%9f%99%82&empty=&a%2Bb=x%20y%26z%3d%25")).toBe(true);
  const special = JSON.parse('{"__proto__":"x","constructor":"y","":"z"}');
  expect(verifyApiFormBodyWire(special, encodeApiFormBody(special))).toBe(true);
});

test("independent decoder rejects duplicate, malformed, lossy and corrupted form wires", () => {
  for (const text of ["a=x&a=x", "a=x&%61=x", "a=x&", "&a=x", "a", "a=x=y", "a=%", "a=%GG",
    "a=%FF", "a=%C0%AF", "a=%ED%A0%80", "a=%F4%90%80%80", "a=中文", "a=y", "b=x", "a=x&b=", "a=%2578"])
    expect(verifyApiFormBodyWire({ a: "x" }, text)).toBe(false);
  expect(verifyApiFormBodyWire({ a: "+" }, "a=+")).toBe(false);
  expect(verifyApiFormBodyWire({ a: "+" }, "a=%2B")).toBe(true);
});

test("both sides reject unsupported value shapes, malformed Unicode and bounds", () => {
  for (const value of [{}, [], null, "x", { a: 1 }, { a: true }, { a: null }, { a: ["x"] }, { a: {} },
    { a: "\ud800" }, { "\udc00": "x" }, { a: "x".repeat(4097) }, { ["x".repeat(4097)]: "x" },
    Object.fromEntries(Array.from({ length: 65 }, (_, i) => [String(i), "x"]))]) {
    expect(() => encodeApiFormBody(value)).toThrow();
    expect(verifyApiFormBodyWire(value, "a=x")).toBe(false);
  }
  const large = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [String(i), " ".repeat(4096)]));
  expect(() => encodeApiFormBody(large)).toThrow();
  expect(verifyApiFormBodyWire({ a: "x" }, "a=" + "x".repeat(262144))).toBe(false);
});
