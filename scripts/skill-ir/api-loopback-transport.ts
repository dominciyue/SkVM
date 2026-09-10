import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { buildApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives-checker";
import { checkApiResponseObservation } from "../../src/skill-ir/api-response-observation";
import type { RequestSpecimen } from "../../src/skill-ir/api-request-specimens";

const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
function send(port: number, specimen: RequestSpecimen): Promise<{ status: number; bodyText: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, agent: false, method: specimen.method, path: specimen.target,
      headers: Object.fromEntries(specimen.headers.map((h) => [h.name, h.value])) }, (response) => {
      const chunks: Buffer[] = []; let length = 0;
      response.on("data", (chunk) => { const bytes = Buffer.from(chunk); length += bytes.length;
        if (length > 1048576) response.destroy(new Error("response byte budget")); else chunks.push(bytes); });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, bodyText: Buffer.concat(chunks).toString("utf8"), mediaType: String(response.headers["content-type"] ?? "") }));
    });
    request.on("error", reject);
    request.setTimeout(5000, () => request.destroy(new Error("loopback request timeout")));
    request.end(specimen.body?.text ?? "");
  });
}

export async function runLoopbackTransportVerification() {
  const errorResponse = (value: string) => ({ description: "Explicit fixture rule", content: { "application/json": { schema: {
    type: "object", required: ["error"], additionalProperties: false, properties: { error: { type: "string", enum: [value] } },
  } } } });
  const document = { openapi: "3.0.3", info: { title: "Synthetic loopback only", version: "1" }, paths: { "/items/{id}": { post: {
    parameters: [
      { in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } },
      { in: "query", name: "q", required: true, schema: { type: "string", enum: ["a&b"] } },
      { in: "query", name: "tags", required: true, style: "form", explode: true, schema: { type: "array", minItems: 2, maxItems: 2, uniqueItems: true, items: { type: "string", enum: ["a,b", "x y"] } } },
      { in: "header", name: "X-Mode", required: true, schema: { type: "string", enum: ["fixed"] } },
    ], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "count"], additionalProperties: false,
      properties: { name: { type: "string", enum: ["item"] }, count: { type: "integer", minimum: 2, maximum: 4 } },
    } } } }, responses: { "200": { description: "Fixture valid body", content: { "application/json": { schema: { type: "object", required: ["ok", "id"],
      additionalProperties: false, properties: { ok: { type: "boolean", enum: [true] }, id: { type: "integer", readOnly: true } },
    } } } }, "422": errorResponse("invalid-body"), "409": errorResponse("wire-mismatch") },
  } } } };
  const source = JSON.stringify(document), artifact = buildApiRequestBodyNegatives(source, "json");
  const constructionCheck = verifyApiRequestBodyNegatives(source, "json", artifact);
  const baseline = artifact.specimens.operations[0]!.cases.find((c) => c.mode === "full" && c.status === "constructed")?.request;
  if (!baseline) throw new Error("synthetic full baseline unavailable");
  const requests = [{ id: "positive", kind: "positive", expectedStatus: 200, request: baseline },
    ...artifact.operations[0]!.cases.filter((c) => c.status === "constructed").map((c) => ({ id: c.id, kind: "body-negative", expectedStatus: 422, request: c.request! }))];
  const corrupted = structuredClone(baseline); corrupted.target = corrupted.target.replace("q=a%26b", "q=a&b");
  if (corrupted.target === baseline.target) throw new Error("fixture query corruption not applied");
  requests.push({ id: "corrupted-query", kind: "intentional-wire-corruption", expectedStatus: 409, request: corrupted });
  const observed: unknown[] = [];
  // Independent hand-coded fixture predicates: no constructor/checker/schema imports used here.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url), tags = url.searchParams.getAll("tags"), bodyText = await request.text();
    let body: any; try { body = JSON.parse(bodyText); } catch { body = undefined; }
    const wireOkay = request.method === "POST" && url.pathname === "/items/a%2Fb" && url.searchParams.getAll("q").length === 1
      && url.searchParams.get("q") === "a&b" && tags.length === 2 && tags.includes("a,b") && tags.includes("x y")
      && request.headers.get("x-mode") === "fixed" && request.headers.get("content-type") === "application/json";
    const bodyOkay = body !== null && typeof body === "object" && !Array.isArray(body) && body.name === "item"
      && Number.isInteger(body.count) && body.count >= 2 && body.count <= 4 && Object.keys(body).every((k) => ["name", "count"].includes(k));
    const status = !wireOkay ? 409 : !bodyOkay ? 422 : 200;
    observed.push({ pathname: url.pathname, query: [...url.searchParams], mode: request.headers.get("x-mode"), bodyText, wireOkay, bodyOkay, status });
    return new Response(JSON.stringify(status === 200 ? { ok: true, id: 7 } : { error: status === 409 ? "wire-mismatch" : "invalid-body" }),
      { status, headers: { "content-type": "application/json" } });
  } });
  const rows: Array<{ id: string; kind: string; expectedStatus: number; actualStatus: number | null; status: string; request: RequestSpecimen;
    received: unknown; responseCheck?: unknown; responseBody?: string; error?: string }> = [];
  let loopbackHttpCalls = 0;
  try {
    for (const candidate of requests) {
      try {
        loopbackHttpCalls++;
        const response = await send(server.port!, candidate.request);
        const responseCheck = checkApiResponseObservation(source, "json", { operationKey: "POST /items/{id}", statusCode: response.status,
          mediaType: response.mediaType, bodyText: response.bodyText });
        rows.push({ ...candidate, actualStatus: response.status, status: constructionCheck.status === "pass" && response.status === candidate.expectedStatus
          && responseCheck.status === "checked" && responseCheck.valid ? "pass" : "fail", received: observed.at(-1) ?? null, responseCheck, responseBody: response.bodyText });
      } catch (error) { rows.push({ ...candidate, actualStatus: null, status: "error", received: null, error: String(error) }); }
    }
  } finally { await server.stop(true); }
  return { exposure: "synthetic-loopback-development", source, sourceSha256: sha(source), constructionCheck,
    unresolvedNegatives: artifact.operations[0]!.cases.filter((c) => c.status === "unresolved").map((c) => ({ id: c.id, reasons: c.reasons })),
    rows, loopbackHttpCalls, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0, independentRealSamples: 0,
    statusBasis: "Independent hand-coded synthetic fixture, not inferred real API behavior" };
}

if (import.meta.main) {
  const out = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
  if (!out) throw new Error("--out=<new-report.json>");
  const report = await runLoopbackTransportVerification();
  const files = ["scripts/skill-ir/api-loopback-transport.ts", "src/skill-ir/api-request-body-negatives.ts", "src/skill-ir/api-request-body-negatives-checker.ts",
    "src/skill-ir/api-request-specimens.ts", "src/skill-ir/api-response-observation.ts", "src/skill-ir/api-schema-checker.ts", "bun.lock"];
  const sourceBindings = await Promise.all(files.map(async (path) => ({ path, sha256: sha(await readFile(path)) })));
  await writeFile(out, JSON.stringify({ ...report, runtime: { bun: Bun.version, nodeCompatibility: process.version }, sourceBindings }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ calls: report.loopbackHttpCalls, passed: report.rows.filter((r) => r.status === "pass").length, failed: report.rows.filter((r) => r.status !== "pass") }));
  if (report.rows.some((r) => r.status !== "pass")) process.exitCode = 1;
}
