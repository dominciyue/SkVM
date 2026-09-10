import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { stringify } from "yaml";
import { buildApiRequestBodyNegatives, type ApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "../../src/skill-ir/api-request-body-negatives-checker";

const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const stable = (v: unknown) => JSON.stringify(canonical(v));
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const reverse = (v: any): any => Array.isArray(v) ? v.map(reverse) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reverse(v[k])])) : v;

export { semantics as bodyNegativeSemantics, reverse as reverseObjectKeys };

function semantics(report: ApiRequestBodyNegatives, keys: string[]) {
  return report.operations.filter((o) => keys.includes(o.key)).map((o) => ({ key: o.key, cases: o.cases.map((c) => {
    const field = report.fields.operations.find((f) => f.key === o.key)!.schemas.find((f) => f.id === c.fieldId)!;
    const target = field.cases.cases.find((v) => v.id === c.obligationId)!;
    const request = structuredClone(c.request);
    if (request?.body) request.body.text = stable(JSON.parse(request.body.text));
    return { target: { field: field.id, kind: target.kind, instancePath: target.instancePath,
      validationPath: target.validationSchemaPath, operand: target.operand }, status: c.status,
      request, expectedHttpStatus: c.expectedHttpStatus };
  }).sort((a, b) => stable(a).localeCompare(stable(b))) })).sort((a, b) => a.key.localeCompare(b.key));
}

export function runBodyMetamorphisms() {
  const document: any = { openapi: "3.0.3", info: { title: "Synthetic transformations", version: "1" },
    components: { schemas: { Body: { type: "object", required: ["name", "count", "tags"], properties: {
      name: { type: "string", enum: ["item"] }, count: { type: "integer", minimum: 2, maximum: 9 },
      tags: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
    } } } }, paths: { "/items": { parameters: [{ in: "query", name: "limit", required: true, schema: { type: "integer", minimum: 1 } }],
      post: { requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Body" } } } },
        responses: { "201": { description: "created" } } } }, "/health": { get: { responses: { "200": { description: "ok" } } } } } };
  const source = JSON.stringify(document), parent = buildApiRequestBodyNegatives(source, "json");
  const parentCheck = verifyApiRequestBodyNegatives(source, "json", parent), keys = parent.operations.map((o) => o.key);
  const description = structuredClone(document); description.info.description = "Unrelated explanatory text";
  description.paths["/items"].post.summary = "Different prose, same request constraints";
  const inline = structuredClone(document); inline.paths["/items"].post.requestBody.content["application/json"].schema = inline.components.schemas.Body;
  const extra = structuredClone(document); extra.paths["/unsupported"] = { post: { requestBody: { required: true,
    content: { "text/plain": { schema: { type: "integer", minimum: 1 } } } }, responses: { "200": { description: "not executed" } } } };
  const variants: Array<{ transform: string; parameters: unknown; source: string; format: "json" | "yaml" }> = [
    { transform: "object-key-order", parameters: { recursive: true, arraysUnchanged: true }, source: JSON.stringify(reverse(document)), format: "json" },
    { transform: "whitespace", parameters: { indent: 2, newline: "CRLF" }, source: JSON.stringify(document, null, 2).replaceAll("\n", "\r\n") + "\r\n", format: "json" },
    { transform: "json-to-yaml", parameters: { sameDataModel: true }, source: stringify(document), format: "yaml" },
    { transform: "description", parameters: { locations: ["info.description", "paths./items.post.summary"] }, source: JSON.stringify(description), format: "json" },
    { transform: "local-ref-inline", parameters: { reference: "#/components/schemas/Body", noSiblings: true }, source: JSON.stringify(inline), format: "json" },
    { transform: "append-unsupported-operation", parameters: { operation: "POST /unsupported", media: "text/plain" }, source: JSON.stringify(extra), format: "json" },
  ];
  const rows = variants.map((v) => {
    const report = buildApiRequestBodyNegatives(v.source, v.format), check = verifyApiRequestBodyNegatives(v.source, v.format, report);
    const additional = report.operations.filter((o) => !keys.includes(o.key));
    const additionalRecorded = v.transform !== "append-unsupported-operation" ? additional.length === 0
      : additional.length === 1 && additional[0]!.key === "POST /unsupported" && additional[0]!.cases.length > 0
        && additional[0]!.cases.every((c) => c.status === "unresolved" && c.reasons.length > 0);
    const sameSemantics = stable(semantics(report, keys)) === stable(semantics(parent, keys));
    return { ...v, parentSha256: sha(source), sha256: sha(v.source), check, sameSemantics, additionalRecorded,
      normalizedSemanticsSha256: sha(stable(semantics(report, keys))), parentSemanticsSha256: sha(stable(semantics(parent, keys))),
      status: check.status === "pass" && sameSemantics && additionalRecorded ? "pass" : "fail" };
  });
  return { exposure: "synthetic-development", parent: { source, sha256: sha(source), check: parentCheck }, rows,
    independentRealSamples: 0, projectModelCalls: 0, paidCalls: 0 };
}

if (import.meta.main) {
  const out = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
  if (!out) throw new Error("--out=<new-report.json>");
  const report = runBodyMetamorphisms();
  const sourceFiles = ["scripts/skill-ir/api-request-body-metamorphic.ts", "src/skill-ir/api-request-body-negatives.ts",
    "src/skill-ir/api-request-body-negatives-checker.ts", "src/skill-ir/api-request-specimens.ts", "src/skill-ir/api-request-specimens-checker.ts",
    "src/skill-ir/api-request-cases.ts", "src/skill-ir/api-request-cases-checker.ts", "src/skill-ir/api-schema-obligations.ts", "bun.lock"];
  const sourceBindings = await Promise.all(sourceFiles.map(async (path) => ({ path, sha256: sha(await readFile(path, "utf8")) })));
  await writeFile(out, JSON.stringify({ ...report, runtime: { bun: Bun.version, nodeCompatibility: process.version }, sourceBindings }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report.rows.map(({ transform, status, sameSemantics, additionalRecorded, check }) => ({ transform, status, sameSemantics, additionalRecorded, check }))));
  if (report.parent.check.status !== "pass" || report.rows.some((r) => r.status !== "pass")) process.exitCode = 1;
}
