import { test, expect } from "bun:test";
import { decodeDevelopmentUtf8 } from "./development-utf8";

test("development decoding preserves valid text bytes including BOM and literal replacement characters", () => {
  for (const text of ["plain", "中文😀", "\uFEFF{\"title\":\"示例\"}", "literal\uFFFD", ""]) {
    const bytes = Buffer.from(text, "utf8");
    expect(decodeDevelopmentUtf8(bytes)).toBe(text);
    expect(Buffer.from(decodeDevelopmentUtf8(bytes), "utf8").equals(bytes)).toBe(true);
  }
});

test("development decoding rejects malformed scalar encodings instead of normalizing them", () => {
  for (const bytes of [[0xff], [0x80], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x28, 0xa1]]) {
    expect(() => decodeDevelopmentUtf8(Uint8Array.from(bytes))).toThrow("UTF-8");
  }
});
