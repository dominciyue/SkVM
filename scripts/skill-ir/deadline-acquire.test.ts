import { test, expect } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAcquirer, qualifySource } from "./deadline-acquire";

test("successful bytes survive a 403 and resume fetches only the missing item", async () => {
  const root = await mkdtemp(join(tmpdir(), "deadline-acquire-"));
  const calls: string[] = [];
  let limited = true;
  const request = async (endpoint: string) => {
    calls.push(endpoint);
    return { status: endpoint === "b" && limited ? 403 : 200, headers: { "retry-after": "1" }, body: Buffer.from(endpoint) };
  };
  const first = await createAcquirer(root, request);
  expect((await first.get("a")).body.toString()).toBe("a");
  await expect(first.get("b")).rejects.toThrow("403");
  limited = false;
  const resumed = await createAcquirer(root, request);
  await resumed.get("a");
  await resumed.get("b");
  await resumed.get("b");
  expect(calls).toEqual(["a", "b", "b"]);
  const rows = (await readFile(join(root, "acquisition.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  expect(rows.map((r) => r.status)).toEqual([200, 403, 200]);
  expect(rows[1].retryAfter).toBe("1");
});

test("qualification depends on public document shape, not supported operations", () => {
  const source = Buffer.from(JSON.stringify({ openapi: "3.0.3", paths: { "/x": { get: { security: [{ oauth: [] }] } } } }));
  expect(qualifySource(source, "json").eligible).toBe(true);
  expect(qualifySource(Buffer.from('{"swagger":"2.0"}'), "json").eligible).toBe(false);
});

test("duplicate YAML keys are not eligible", () => {
  expect(qualifySource(Buffer.from('openapi: 3.0.3\npaths: {}\npaths: {}\n'), "yaml").eligible).toBe(false);
});
