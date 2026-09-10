import { test, expect } from "bun:test";
import { encodeApiParameter } from "./api-parameter-wire";
import { verifyApiParameterWire } from "./api-parameter-wire-checker";

test("primitive array encoding uses source style and explode, with URI atoms escaped", () => {
  const cases = [
    [{ name: "id", in: "path" }, ["a/b", "c,d"], "a%2Fb,c%2Cd"],
    [{ name: "id", in: "query" }, ["a b", "c,d"], "id=a%20b&id=c%2Cd"],
    [{ name: "id", in: "query", explode: false }, [1, 2], "id=1,2"],
    [{ name: "id", in: "query", style: "pipeDelimited", explode: false }, [1, 2], "id=1|2"],
    [{ name: "id", in: "query", style: "spaceDelimited", explode: false }, [1, 2], "id=1%202"],
    [{ name: "X-Test", in: "header" }, [1, 2], "1,2"],
    [{ name: "id", in: "cookie", explode: false }, [1, 2], "id=1,2"],
  ] as const;
  for (const [parameter, value, expected] of cases) {
    const encoded = encodeApiParameter(parameter, [...value]);
    expect(encoded).toEqual({ status: "encoded", wire: expected });
    expect(verifyApiParameterWire(parameter, [...value], expected).status).toBe("pass");
    expect(verifyApiParameterWire(parameter, [...value], expected + ",extra").status).toBe("fail");
  }
});

test("unsupported or ambiguous parameter semantics never silently flatten", () => {
  for (const [p, value] of [[{ in: "query", name: "q" }, { a: 1 }], [{ in: "query", name: "q" }, []],
    [{ in: "query", name: "q", allowReserved: true }, "a&b"], [{ in: "path", name: "q", style: "matrix" }, "a"],
    [{ in: "header", name: "X" }, "a\r\nb"], [{ in: "header", name: "X" }, ["a,b", "c"]]]) {
    expect(encodeApiParameter(p, value).status).toBe("unsupported");
    expect(verifyApiParameterWire(p, value, "whatever").status).toBe("unsupported");
  }
});

test("ignored OpenAPI header parameters are not emitted as validated wire obligations", () => {
  for (const name of ["Accept", "content-type", "AUTHORIZATION"]) {
    expect(encodeApiParameter({ name, in: "header" }, "example").status).toBe("unsupported");
    expect(verifyApiParameterWire({ name, in: "header" }, "example", "example").status).toBe("unsupported");
  }
});

test("inverse checker rejects raw URI structure in encoded parameter names", () => {
  for (const name of ["q#fragment", "q space", "q/path", "q?option", "q[part]"]) {
    const parameter = { in: "query", name };
    const encoded = encodeApiParameter(parameter, "value");
    expect(encoded.status).toBe("encoded");
    if (encoded.status !== "encoded") throw new Error(encoded.reason);
    expect(verifyApiParameterWire(parameter, "value", encoded.wire).status).toBe("pass");
    expect(verifyApiParameterWire(parameter, "value", `${name}=value`).status).toBe("fail");
  }
});

test("bounded Unicode and reserved-atom matrix roundtrips without accepting altered values", () => {
  const parameters = [
    { in: "query", name: "q#name" }, { in: "cookie", name: "c[name]" },
    { in: "path", name: "id" }, { in: "query", name: "q", explode: false },
    { in: "query", name: "q", style: "pipeDelimited", explode: false },
  ];
  for (const parameter of parameters) for (const value of ["a/b", "a&b", "a=b", "a#b", "a%b", "中文", "😀", "", "a|b", "a,b"]) {
    const expected = [value, "tail"];
    const encoded = encodeApiParameter(parameter, expected);
    expect(encoded.status).toBe("encoded");
    if (encoded.status !== "encoded") throw new Error(encoded.reason);
    expect(verifyApiParameterWire(parameter, expected, encoded.wire).status).toBe("pass");
    expect(verifyApiParameterWire(parameter, [value, "changed"], encoded.wire).status).toBe("fail");
  }
});
