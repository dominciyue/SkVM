import { describe, expect, test } from "bun:test";
import { parseScoringArgs } from "./score-real-agent-runs";

describe("score-real-agent-runs arguments", () => {
  test("accepts an explicit corpus for registry-backed multi-skill scoring", () => {
    expect(parseScoringArgs(["--corpus=pilot"])).toMatchObject({ corpus: "pilot" });
  });

  test("rejects unknown corpora and corpus/manifest ambiguity", () => {
    expect(() => parseScoringArgs(["--corpus=unknown"])).toThrow("Unknown Skill IR corpus");
    expect(() => parseScoringArgs(["--corpus=pilot", "--manifest=tmp/pilot.json"])).toThrow(
      "mutually exclusive",
    );
  });
});
