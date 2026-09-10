import { test, expect } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { acquireSkills } from "./skill-family-acquire";
import type { Request, Response } from "./deadline-acquire";

const oid = (body: string) => createHash("sha1").update(`blob ${Buffer.byteLength(body)}\0`).update(body).digest("hex");
test("real bundle data flow pins source, retains resource failures and resumes cached bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "family-acquire-"));
  const body = '---\nname: api-test\ndescription: Generate tests from OpenAPI\n---\nRead [rules](references/rules.md).\n';
  const rules = 'Check all declared operations.';
  let failed = true;
  let bodyRequests = 0;
  const request: Request = async (endpoint: string): Promise<Response> => {
    let value: unknown;
    if (endpoint === "repos/example/skills") value = { full_name: "example/skills", private: false, fork: false, default_branch: "main", license: { spdx_id: "MIT" } };
    else if (endpoint.includes("/commits/")) value = { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } };
    else if (endpoint.includes("/git/trees/")) value = { truncated: false, tree: [
      { path: "skills/api-test/SKILL.md", sha: oid(body), size: Buffer.byteLength(body), type: "blob", mode: "100644" },
      { path: "skills/api-test/references/rules.md", sha: oid(rules), size: rules.length, type: "blob", mode: "100644" },
      { path: "skills/api-test-link/SKILL.md", sha: oid(body), size: 40, type: "blob", mode: "120000" },
    ] };
    else if (endpoint.endsWith(oid(body))) { bodyRequests++; value = { encoding: "base64", content: Buffer.from(body).toString("base64") }; }
    else if (endpoint.endsWith(oid(rules))) {
      if (failed) return { status: 403, headers: { "x-ratelimit-remaining": "0" }, body: Buffer.from("limited") };
      value = { encoding: "base64", content: Buffer.from(rules).toString("base64") };
    } else throw new Error(`unexpected ${endpoint}`);
    return { status: 200, headers: {}, body: Buffer.from(JSON.stringify(value)) };
  };
  const options = { root, repositories: [{ repository: "example/skills", maximumSkills: 5 }], request };
  const first = await acquireSkills(options);
  expect(first.skills.length).toBe(1);
  expect(first.skills[0]!.issues.some((x) => x.code === "resource-fetch-failed")).toBe(true);
  failed = false;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const resumed = await acquireSkills(options);
  expect(resumed.skills[0]!.files.map((x) => x.kind)).toEqual(["skill", "resource"]);
  expect(resumed.skills[0]!.issues.some((x) => x.code === "resource-fetch-failed")).toBe(false);
  expect(bodyRequests).toBe(1);
  expect(await readFile(join(root, resumed.skills[0]!.files[1]!.localPath), "utf8")).toBe(rules);
  expect(resumed.skills[0]!.commit).toBe("a".repeat(40));
  expect(resumed.skills[0]!.acquiredAt).toBe(first.skills[0]!.acquiredAt);
  expect(await readFile(join(root, "source-history.jsonl"), "utf8")).toContain("resource-fetch-failed");
});
