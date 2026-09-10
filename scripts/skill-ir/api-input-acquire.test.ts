import { test, expect } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitBlobOid } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive";
import { acquireApiInputs } from "./api-input-acquire";

test("declared API acquisition preserves bytes, isolates failure and resumes cached successes", async () => {
  const root = await mkdtemp(join(tmpdir(), "api-input-acquire-"));
  const bytes = Buffer.from('openapi: 3.0.3\r\ninfo: {title: Test, version: "1"}\r\npaths: {}\r\n');
  const oid = gitBlobOid(bytes);
  const commit = "a".repeat(40), tree = "b".repeat(40);
  const config = { repository: "example/apis", commit, tree, documents: [
    { inputId: "missing", provider: "one", path: "missing.yaml" },
    { inputId: "valid", provider: "two", path: "valid.yaml" },
  ] };
  let calls = 0;
  const request = async (endpoint: string) => {
    calls++;
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify(endpoint.includes("/commits/") ? { tree: { sha: tree } } : endpoint.includes("/trees/")
      ? { truncated: false, tree: [{ path: "valid.yaml", type: "blob", mode: "100644", sha: oid, size: bytes.length }] }
      : { encoding: "base64", content: bytes.toString("base64") })) };
  };
  const report = await acquireApiInputs({ root, config, request });
  expect(report.inputs.map((r) => r.status)).toEqual(["failed", "acquired"]);
  expect(await readFile(join(root, report.inputs[1]!.localPath!))).toEqual(bytes);
  expect(report.inputs[1]!.qualification?.eligible).toBe(true);
  await acquireApiInputs({ root, config, request });
  expect(calls).toBe(3);
});

test("a Git blob mismatch is retained as a failure rather than qualified input", async () => {
  const root = await mkdtemp(join(tmpdir(), "api-input-acquire-"));
  const config = { repository: "example/apis", commit: "a".repeat(40), tree: "b".repeat(40),
    documents: [{ inputId: "one", provider: "one", path: "one.json" }] };
  const report = await acquireApiInputs({ root, config, request: async (endpoint) => ({ status: 200, headers: {},
    body: Buffer.from(JSON.stringify(endpoint.includes("/commits/") ? { tree: { sha: config.tree } } : endpoint.includes("/trees/")
      ? { truncated: false, tree: [{ path: "one.json", type: "blob", mode: "100644", sha: "c".repeat(40), size: 2 }] }
      : { encoding: "base64", content: Buffer.from("{}").toString("base64") })) }) });
  expect(report.inputs[0]!.status).toBe("failed");
  expect(report.inputs[0]!.error).toContain("blob integrity");
});
