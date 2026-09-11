import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildApiPytestSuite } from "../../src/skill-ir/api-pytest-suite";
import { verifyApiPytestOracle } from "../../src/skill-ir/api-pytest-oracle";
import { createContainedDirectory } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const exec = promisify(execFile), sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const response = (status: number) => ({ description: "Explicit hand-written fixture rule", content: { "application/json": { schema: {
  type: "object", required: ["status"], additionalProperties: false, properties: { status: { type: "integer", enum: [status] } },
} } } });

export async function runNativePytestLoopback(options: { outputDirectory: string; pythonExecutable: string }) {
  const runtimeResult = await exec(options.pythonExecutable, ["-I", "-c", 'import sys,json,importlib.metadata as m; print(json.dumps({"python":sys.version,"pytest":m.version("pytest"),"httpx":m.version("httpx")}))'], { windowsHide: true, encoding: "utf8", timeout: 10000 });
  const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Independent native fixture", version: "1" }, paths: {
    "/items/{id}": { post: {
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } }],
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["name"], properties: { name: { type: "string", enum: ["a&中文"] } },
      } } } }, responses: { "200": response(200), "422": response(422) },
    } },
  } });
  const artifact = await buildApiPytestSuite(source, "json"), suite = JSON.parse(artifact.suiteJson);
  const out = options.outputDirectory;
  await writeFile(resolve(out, "source.json"), source, { flag: "wx" });
  await writeFile(resolve(out, "suite.json"), artifact.suiteJson, { flag: "wx" });
  await writeFile(resolve(out, "test_api_requests.py"), artifact.testPython, { flag: "wx" });
  const observations: Array<{ method: string; target: string; text: string; status: number }> = [];
  const runs: Array<{ kind: string; expectedMarker: string | null; expectedCalls: number; actualCalls: number; detectedAtExpectedLayer: boolean;
    exitCode: number | string | null; stdout: string; stderr: string }> = [];
  const invoke = async (kind: string, oracle: unknown, expectedMarker: string | null, expectedCalls: number) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", PYTHONDONTWRITEBYTECODE: "1",
      HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1", NO_PROXY: "" };
    delete env.SKVM_PYTEST_ORACLE;
    if (oracle) {
      const path = resolve(out, `${kind}-oracle.json`);
      await writeFile(path, JSON.stringify(oracle, null, 2) + "\n", { flag: "wx" });
      env.SKVM_PYTEST_ORACLE = path;
    }
    const before = observations.length;
    let result: { exitCode: number | string | null; stdout: string; stderr: string };
    try {
      const output = await exec(options.pythonExecutable, ["-I", "-m", "pytest", "-q", "-p", "no:cacheprovider", `--confcutdir=${out}`, `--junitxml=${kind}.xml`, "test_api_requests.py"],
        { cwd: out, env, windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 16777216 });
      result = { ...output, exitCode: 0 };
    } catch (error) { const e = error as any; result = { exitCode: e.code ?? null, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? e.message) }; }
    const detectedAtExpectedLayer = expectedMarker
      ? result.exitCode === 1 && result.stdout.includes("3 failed") && (result.stdout.match(new RegExp(`AssertionError: ${expectedMarker}`, "gu")) ?? []).length === 3
      : result.exitCode === 0 && result.stdout.includes(oracle ? "3 passed" : "3 skipped");
    const row = { kind, expectedMarker, expectedCalls, actualCalls: observations.length - before, detectedAtExpectedLayer, ...result };
    runs.push(row);
    await writeFile(resolve(out, `${kind}-run.json`), JSON.stringify(row, null, 2) + "\n", { flag: "wx" });
  };
  await invoke("no-oracle", null, null, 0);
  let redirect = false;
  const fixtureSha256 = sha(await readFile(import.meta.path));
  // Independent fixture predicates. No generated request is used to decide validity.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const target = new URL(request.url).pathname, text = await request.text();
    let body: any; try { body = JSON.parse(text); } catch { body = null; }
    const validTarget = request.method === "POST" && target === "/items/a%2Fb";
    const status = redirect ? 302 : !validTarget ? 409 : body?.name === "a&中文" ? 200 : 422;
    observations.push({ method: request.method, target, text, status });
    return new Response(JSON.stringify({ status }), { status, headers: { "content-type": "application/json", ...(redirect ? { location: "/redirected" } : {}) } });
  } });
  const oracle = { schemaVersion: "api-pytest-loopback-oracle/v1", suiteSha256: sha(artifact.suiteJson), fixtureSha256,
    origin: `http://127.0.0.1:${server.port}`, cases: suite.rows.map((row: any) => {
      const statusCode = JSON.parse(row.caseId)[2] === "body" ? 422 : 200;
      return { id: row.id, requestSha256: sha(row.requestJson), response: { statusCode, mediaType: "application/json", bodyText: JSON.stringify({ status: statusCode }) } };
    }) };
  let oracleVerification: Awaited<ReturnType<typeof verifyApiPytestOracle>> | null = null;
  try {
    oracleVerification = await verifyApiPytestOracle(source, "json", artifact, oracle);
    if (oracleVerification.status !== "pass") throw new Error(`fixture oracle failed: ${oracleVerification.errors.join(";")}`);
    await invoke("valid", oracle, null, 3);
    // Deliberate post-verification faults exercise runtime assertions, not authority acquisition.
    for (const [field, value, marker] of [["statusCode", 201, "STATUS_MISMATCH"], ["mediaType", "text/plain", "MEDIA_MISMATCH"], ["bodyText", "wrong", "RESPONSE_BODY_MISMATCH"]] as const) {
      const changed = structuredClone(oracle);
      changed.cases.forEach((c: any) => c.response[field] = value);
      await invoke(`wrong-${field}`, changed, marker, 3);
    }
    const changed = structuredClone(oracle); changed.cases.forEach((c: any) => c.requestSha256 = "0".repeat(64));
    await invoke("wrong-binding", changed, "ORACLE_REQUEST_BINDING_MISMATCH", 0);
    redirect = true;
    await invoke("redirect-response", oracle, "STATUS_MISMATCH", 3);
  } finally { await server.stop(true); }
  if (!oracleVerification) throw new Error("fixture oracle was not checked");
  const report = { exposure: "synthetic-loopback-development", sourceSha256: sha(source), suiteSha256: sha(artifact.suiteJson),
    runtime: { ...JSON.parse(runtimeResult.stdout), bun: Bun.version, pythonExecutable: options.pythonExecutable },
    runtimeSha256: sha(artifact.testPython), fixtureSha256, oracleVerification, runs, observations,
    status: runs.every((r) => r.detectedAtExpectedLayer && r.actualCalls === r.expectedCalls) ? "pass" : "fail",
    injectedCases: 15, correctlyDetected: runs.filter((r) => r.expectedMarker && r.detectedAtExpectedLayer).length * 3,
    loopbackHttpCalls: observations.length, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0,
    independentRealSamples: 0, claimLimit: "This finite synthetic error set does not establish real API or whole-skill reliability" };
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}

if (import.meta.main) {
  const output = process.argv.find((s) => s.startsWith("--out="))?.slice(6), python = process.argv.find((s) => s.startsWith("--python="))?.slice(9);
  if (!output || !python) throw new Error("--out=<new-directory> --python=<explicit-python>");
  const directory = await createContainedDirectory(process.cwd(), output, "native fixture output");
  const report = await runNativePytestLoopback({ outputDirectory: directory, pythonExecutable: python });
  console.log(JSON.stringify({ status: report.status, calls: report.loopbackHttpCalls, detected: report.correctlyDetected, injected: report.injectedCases }));
  if (report.status !== "pass") process.exitCode = 1;
}
