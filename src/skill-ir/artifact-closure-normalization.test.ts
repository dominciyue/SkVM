import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { normalizeDerivedSkillView } from "./artifact-closure-normalization";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("artifact closure normalization", () => {
  test("makes CRLF and LF source views identical while raw source authority stays byte-sensitive", () => {
    const crlf = Buffer.from("# Skill\r\n\r\nDo work.\r\n", "utf8");
    const lf = Buffer.from("# Skill\n\nDo work.\n", "utf8");
    expect(sha256(crlf)).not.toBe(sha256(lf));
    expect(normalizeDerivedSkillView(crlf)).toEqual(lf);
    expect(normalizeDerivedSkillView(crlf)).toEqual(normalizeDerivedSkillView(lf));
  });

  test("preserves lone CR, BOM, terminal newline state, and other UTF-8 text", () => {
    const source = Buffer.from("\uFEFF标题\r保留\n终止", "utf8");
    expect(normalizeDerivedSkillView(source)).toEqual(source);
    expect(normalizeDerivedSkillView(Buffer.from("no-terminal\r\n", "utf8"))).toEqual(
      Buffer.from("no-terminal\n", "utf8"),
    );
    expect(normalizeDerivedSkillView(Buffer.from("no-terminal", "utf8"))).toEqual(
      Buffer.from("no-terminal", "utf8"),
    );
  });

  test("rejects invalid UTF-8 instead of silently changing the derived view", () => {
    expect(() => normalizeDerivedSkillView(Uint8Array.from([0xc3, 0x28]))).toThrow("valid UTF-8");
  });
});
