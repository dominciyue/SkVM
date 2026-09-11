import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildApiPytestSuite } from "../../src/skill-ir/api-pytest-suite";
import { verifyApiPytestOracle } from "../../src/skill-ir/api-pytest-oracle";
import { createContainedDirectory } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";
const exec = promisify(execFile), sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

export async function runNativeWireFixture(options: { outputDirectory: string; pythonExecutable: string }) {
  const response = (code: number) => ({ description: "Independent fixture rule only", content: { "application/json": { schema: {
    type: "object", required: ["status"], additionalProperties: false, properties: { status: { type: "integer", enum: [code] } },
  } } } });
  const document = { openapi: "3.0.3", info: { title: "Hand-written native wire fixture", version: "1" }, paths: {
    "/forms/{id}": { parameters: [
      { in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } },
      { in: "query", name: "q#name", required: true, style: "form", explode: true, schema: { type: "array", items: { type: "string" }, enum: [["a&b", "c,d"]] } },
      { in: "header", name: "X-Trace", required: true, schema: { type: "string", enum: ["trace-1"] } },
      { in: "cookie", name: "token", required: true, schema: { type: "string", enum: ["a&b"] } },
    ], post: { requestBody: { required: true, content: { "application/x-www-form-urlencoded": { schema: {
      type: "object", required: ["label"], properties: { label: { type: "string", enum: ["a&中文 +"] } },
    } } } }, responses: { "200": response(200), "422": response(422) } } },
  } };
  // Keep the initially attempted cookie operation as an explicit unresolved control.
  // Cookie encoding exists at field level but request assembly does not support it.
  const cookieOperation = structuredClone(document.paths["/forms/{id}"]);
  document.paths["/forms/{id}"].parameters = document.paths["/forms/{id}"].parameters.filter(p => p.in !== "cookie");
  const source = JSON.stringify({ ...document, paths: { ...document.paths, "/cookie-unsupported/{id}": cookieOperation } });
  const artifact = await buildApiPytestSuite(source, "json"), suite = JSON.parse(artifact.suiteJson), out = options.outputDirectory;
  for (const [name, text] of [["source.json", source], ["suite.json", artifact.suiteJson], ["test_api_requests.py", artifact.testPython]])
    await writeFile(resolve(out, name!), text!, { flag: "wx" });
  const observations: Array<{ method: string; target: string; cookie: string | null; trace: string | null; media: string | null; body: string; wireValid: boolean; status: number }> = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url), target = url.pathname + url.search, body = await request.text();
    const cookie = request.headers.get("cookie"), trace = request.headers.get("x-trace"), media = request.headers.get("content-type");
    // Literal hand-written wire predicates: never use emitted rows as the expected universe.
    const wireValid = request.method === "POST" && ["/forms/a%2Fb?q%23name=a%26b&q%23name=c%2Cd", "/forms/a%2Fb"].includes(target)
      && cookie === null && (trace === "trace-1" || trace === null)
      && (body === "" || (body === "label=a%26%E4%B8%AD%E6%96%87+%2B" && media === "application/x-www-form-urlencoded"));
    const status = !wireValid ? 409 : body === "" || trace === null || url.search === "" ? 422 : 200;
    observations.push({ method: request.method, target, cookie, trace, media, body, wireValid, status });
    return new Response(JSON.stringify({ status }), { status, headers: { "content-type": "application/json" } });
  } });
  const fixtureSha256 = sha(await readFile(import.meta.path));
  const oracle = { schemaVersion: "api-pytest-loopback-oracle/v1", fixtureSha256, suiteSha256: sha(artifact.suiteJson), origin: `http://127.0.0.1:${server.port}`,
    cases: suite.rows.filter((r: any) => r.status === "constructed").map((r: any) => {
      const statusCode = JSON.parse(r.caseId)[2] !== null ? 422 : 200;
      return { id: r.id, requestSha256: sha(r.requestJson), response: { statusCode, mediaType: "application/json", bodyText: JSON.stringify({ status: statusCode }) } };
    }) };
  let oracleVerification: Awaited<ReturnType<typeof verifyApiPytestOracle>>;
  let python: { exitCode: number | string | null; stdout: string; stderr: string };
  try {
    oracleVerification = await verifyApiPytestOracle(source, "json", artifact, oracle);
    if (oracleVerification.status !== "pass") throw new Error(JSON.stringify(oracleVerification));
    const oraclePath = resolve(out, "oracle.json");
    await writeFile(oraclePath, JSON.stringify(oracle, null, 2) + "\n", { flag: "wx" });
    try {
      const result = await exec(options.pythonExecutable, ["-X", "utf8", "-I", "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider", `--confcutdir=${out}`, "--junitxml=pytest.junit.xml", "test_api_requests.py"],
        { cwd: out, env: { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", SKVM_PYTEST_ORACLE: oraclePath }, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16777216 });
      python = { exitCode: 0, ...result };
    } catch (e) { const error = e as any; python = { exitCode: error.code ?? null, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? error.message) }; }
  } finally { await server.stop(true); }
  const report = { exposure: "synthetic-native-wire-development", sourceSha256: sha(source), suiteSha256: sha(artifact.suiteJson), fixtureSha256, oracleVerification, python, observations,
    cookieUnsupportedRows: suite.rows.filter((r: any) => r.operationKey === "POST /cookie-unsupported/{id}" && r.status === "unresolved" && r.reasons.includes("Error: cookie assembly unsupported")).length,
    minimalArrayShapeUnresolvedRows: suite.rows.filter((r: any) => r.operationKey === "POST /forms/{id}" && r.status === "unresolved" && r.reasons.some((v: string) => v.includes("does not cover requested minimal/full shape"))).length,
    status: python.exitCode === 0 && python.stdout.includes("2 passed, 8 skipped") && observations.length === 2 && observations.every(v => v.wireValid) ? "pass" : "fail",
    loopbackHttpCalls: observations.length, remoteHttpCalls: 0, modelCalls: 0, paidCalls: 0, wholeSkillCompleted: false };
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}
if (import.meta.main) {
  const arg = (n: string) => process.argv.find(v => v.startsWith(`--${n}=`))?.slice(n.length + 3);
  const out = arg("out"), python = arg("python");
  if (!out || !python) throw new Error("--out=<new-directory> --python=<explicit-python>");
  const report = await runNativeWireFixture({ outputDirectory: await createContainedDirectory(process.cwd(), out, "wire fixture"), pythonExecutable: python });
  console.log(JSON.stringify(report));
  if (report.status !== "pass") process.exitCode = 1;
}
