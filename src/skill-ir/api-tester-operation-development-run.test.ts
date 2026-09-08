import { describe, expect, test } from "bun:test";
import { parseApiTesterOperationDevelopmentArgs } from "./api-tester-operation-development-run";

describe("API Tester operation development CLI", () => {
  test("requires explicit root, cache root, and node while allowing one fresh output override", () => {
    expect(parseApiTesterOperationDevelopmentArgs([
      "--root=D:/repo",
      "--cache-root=D:/cache",
      "--node=C:/node.exe",
      "--out=D:/fresh-result",
      "--completed-at=2026-09-09T00:00:00.000Z",
    ])).toEqual({
      rootDir: "D:/repo",
      cacheRoot: "D:/cache",
      nodeExecutable: "C:/node.exe",
      outputRoot: "D:/fresh-result",
      completedAt: "2026-09-09T00:00:00.000Z",
    });
    expect(() => parseApiTesterOperationDevelopmentArgs(["--root=D:/repo", "--cache-root=D:/cache"])).toThrow();
    expect(() => parseApiTesterOperationDevelopmentArgs([
      "--root=D:/repo", "--cache-root=D:/cache", "--node=C:/node.exe", "--network=true",
    ])).toThrow();
  });
});
