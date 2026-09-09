import { describe, expect, test } from "bun:test";
import { parseApiTesterOperationValidationArgs } from "./api-tester-operation-validation-run";

describe("API Tester operation validation CLI", () => {
  test("requires explicit offline and clean roots while rejecting branch overrides", () => {
    expect(parseApiTesterOperationValidationArgs([
      "--root=repo",
      "--cache-root=cache",
      "--clean-root=clean",
      "--node=node",
      "--git=git",
    ])).toEqual({ rootDir: "repo", cacheRoot: "cache", cleanRoot: "clean", nodeExecutable: "node", gitExecutable: "git" });
    expect(() => parseApiTesterOperationValidationArgs(["--root=repo"])).toThrow();
    expect(() => parseApiTesterOperationValidationArgs([
      "--root=repo", "--cache-root=cache", "--clean-root=clean", "--node=node", "--git=git", "--branch=all-negative",
    ])).toThrow("invalid or duplicate argument");
  });
});
