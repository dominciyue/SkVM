import { describe, expect, test } from "bun:test";
import { parseApiTesterOperationDependencyRevisionArgs } from "./api-tester-operation-dependency-verification-revision-run";

describe("API Tester operation dependency-verification revision CLI", () => {
  test("requires explicit offline inputs and does not accept unseen-source or readiness overrides", () => {
    expect(parseApiTesterOperationDependencyRevisionArgs([
      "--root=repo",
      "--cache-root=cache",
      "--node=node",
      "--git=git",
      "--out=result",
    ])).toEqual({ rootDir: "repo", cacheRoot: "cache", nodeExecutable: "node", gitExecutable: "git", outputRoot: "result" });
    expect(() => parseApiTesterOperationDependencyRevisionArgs(["--root=repo"])).toThrow();
    expect(() => parseApiTesterOperationDependencyRevisionArgs([
      "--root=repo", "--cache-root=cache", "--node=node", "--git=git", "--out=result", "--held-out=input",
    ])).toThrow("invalid or duplicate argument");
  });
});
