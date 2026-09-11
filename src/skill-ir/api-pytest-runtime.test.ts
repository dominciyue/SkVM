import { test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildApiPytestSuite } from "./api-pytest-suite";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Independent fixture", version: "1" }, paths: {
  "/items/{id}": { post: {
    parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } }],
    requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", required: ["name"], properties: { name: { type: "string", enum: ["a&中文"] } },
    } } } }, responses: { "200": { description: "fixture valid" }, "422": { description: "fixture body absent" } },
  } },
} });

async function run(directory: string, oraclePath?: string) {
  const python = process.env.SKVM_TEST_PYTHON ?? Bun.which("python");
  if (!python) throw new Error("Python with pinned pytest/httpx required");
  const env: Record<string, string | undefined> = { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", PYTHONDONTWRITEBYTECODE: "1",
    HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1", NO_PROXY: "" };
  delete env.SKVM_PYTEST_ORACLE;
  if (oraclePath) env.SKVM_PYTEST_ORACLE = oraclePath;
  const child = Bun.spawn([python, "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_api_requests.py"], { cwd: directory, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exitCode };
}

test("real pytest skips without an oracle, executes bound loopback bytes, and detects wrong expected statuses", async () => {
  const artifact = await buildApiPytestSuite(source, "json"), suite = JSON.parse(artifact.suiteJson);
  const directory = await mkdtemp(join(tmpdir(), "skvm-native-pytest-"));
  await writeFile(join(directory, "suite.json"), artifact.suiteJson);
  await writeFile(join(directory, "test_api_requests.py"), artifact.testPython);
  const skipped = await run(directory);
  expect(skipped.exitCode).toBe(0); expect(skipped.stdout).toContain("3 skipped");
  const observations: Array<{ target: string; text: string; status: number }> = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const text = await request.text();
    const right = request.method === "POST" && new URL(request.url).pathname === "/items/a%2Fb";
    let body: any; try { body = JSON.parse(text); } catch { body = null; }
    const status = !right ? 409 : body?.name === "a&中文" ? 200 : 422;
    observations.push({ target: new URL(request.url).pathname, text, status });
    return new Response(JSON.stringify({ status }), { status, headers: { "content-type": "application/json" } });
  } });
  try {
    const oracle = { schemaVersion: "api-pytest-loopback-oracle/v1", suiteSha256: sha(artifact.suiteJson),
      fixtureSha256: sha("hand-coded predicate in api-pytest-runtime.test.ts; not a real API"),
      origin: `http://127.0.0.1:${server.port}`, cases: suite.rows.map((row: any) => {
        const statusCode = row.caseId.includes('"body"') ? 422 : 200;
        return { id: row.id, requestSha256: sha(row.requestJson), response: { statusCode, mediaType: "application/json", bodyText: JSON.stringify({ status: statusCode }) } };
      }) };
    const oraclePath = join(directory, "oracle.json");
    await writeFile(oraclePath, JSON.stringify(oracle));
    const valid = await run(directory, oraclePath);
    if (valid.exitCode !== 0) console.error(JSON.stringify({ directory, valid }));
    expect(valid.exitCode).toBe(0); expect(valid.stdout).toContain("3 passed");
    expect(observations).toHaveLength(3);
    expect(observations.filter((o) => o.status === 200).every((o) => o.text === '{"name":"a&中文"}')).toBe(true);
    oracle.cases.forEach((c: any) => c.response.statusCode = 201);
    await writeFile(join(directory, "wrong-status.json"), JSON.stringify(oracle));
    const badStatus = await run(directory, join(directory, "wrong-status.json"));
    expect(badStatus.exitCode).toBe(1); expect(badStatus.stdout).toContain("STATUS_MISMATCH");
    expect(observations).toHaveLength(6);
    for (const [field, value, message] of [["mediaType", "text/plain", "MEDIA_MISMATCH"], ["bodyText", "wrong", "RESPONSE_BODY_MISMATCH"]]) {
      const wrong = structuredClone(oracle);
      wrong.cases.forEach((c: any) => { c.response.statusCode = JSON.parse(c.response.bodyText).status; c.response[field!] = value; });
      const path = join(directory, `wrong-${field}.json`);
      await writeFile(path, JSON.stringify(wrong));
      const result = await run(directory, path);
      expect(result.exitCode).toBe(1); expect(result.stdout).toContain(message!);
      expect(result.stdout).not.toContain('AssertionError: STATUS_MISMATCH');
    }
    expect(observations).toHaveLength(12);
    oracle.cases.forEach((c: any) => c.requestSha256 = "0".repeat(64));
    await writeFile(join(directory, "wrong-binding.json"), JSON.stringify(oracle));
    const badBinding = await run(directory, join(directory, "wrong-binding.json"));
    expect(badBinding.exitCode).toBe(1); expect(badBinding.stdout).toContain("ORACLE_REQUEST_BINDING_MISMATCH");
    expect(observations).toHaveLength(12);
  } finally { await server.stop(true); }
}, 30000);
