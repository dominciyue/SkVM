import { describe, expect, test } from "bun:test";
import { parseMatrixRunArgs } from "./run";

describe("skill-ir matrix run args", () => {
  test("requires an explicit corpus", () => {
    expect(() => parseMatrixRunArgs([])).toThrow("--corpus is required");
  });

  test("accepts an explicit corpus", () => {
    expect(parseMatrixRunArgs(["--corpus=calibration"])).toEqual({ corpus: "calibration" });
  });
});
