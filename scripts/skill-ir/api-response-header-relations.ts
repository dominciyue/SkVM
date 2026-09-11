import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { checkApiResponseHeaders } from "../../src/skill-ir/api-response-headers";
import { createContainedDirectory } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";
type Json = Record<string, any>;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function reverse(value: any): any {
  if (Array.isArray(value)) return value.map(reverse);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)]));
  return value;
}
export function runHeaderRelations() {
  const doc: Json = { openapi: "3.0.3", info: { title: "Synthetic header relations", version: "1" }, paths: {
    "/target": { get: { responses: { "200": { description: "explicit", headers: {
      "X-Count": { required: true, schema: { type: "integer", minimum: 1, maximum: 5 } },
      "X-Flags": { required: true, schema: { type: "array", items: { type: "boolean" }, minItems: 2, maxItems: 2 } },
      "X-Optional": { schema: { type: "string" } },
    } } } } },
  } };
  const observation = { operationKey: "GET /target", statusCode: 200,
    headers: [{ name: "X-Count", value: "3" }, { name: "x-flags", value: "true,false" }] };
  const source = JSON.stringify(doc), baseline = checkApiResponseHeaders(source, "json", observation);
  const normalize = (result: ReturnType<typeof checkApiResponseHeaders>) => ({ status: result.status, valid: result.valid,
    responseKey: result.responseKey, errors: result.errors, wholeResponseVerified: result.wholeResponseVerified,
    remainingObligations: result.remainingObligations, headers: result.headers.map(h => ({ name: h.name.toLowerCase(),
      status: h.status, valid: h.valid, value: h.value, errors: h.errors, schemaCheck: h.schemaCheck })).sort((a,b) => a.name.localeCompare(b.name)),
    unclaimed: result.unclaimedObservedHeaders.map(n => n.toLowerCase()).sort() });
  const expected = [
    { name: "x-count", status: "checked", valid: true, value: 3 },
    { name: "x-flags", status: "checked", valid: true, value: [true, false] },
    { name: "x-optional", status: "absent-optional", valid: true },
  ];
  const baselineValid = baseline.status === "checked" && baseline.valid === true &&
    JSON.stringify(normalize(baseline).headers.map(({ name, status, valid, value }) => ({ name, status, valid, value }))) === JSON.stringify(expected);
  const descriptions = structuredClone(doc); descriptions.info.description = "Irrelevant prose";
  descriptions.paths["/target"].get.responses["200"].description = "Same validation contract, different prose";
  const cased = structuredClone(doc), h = cased.paths["/target"].get.responses["200"].headers;
  cased.paths["/target"].get.responses["200"].headers = Object.fromEntries(Object.entries(h).map(([k,v]) => [k.toUpperCase(),v]));
  const refs = structuredClone(doc), response = refs.paths["/target"].get.responses["200"];
  refs.components = { responses: { R: response }, headers: { C: response.headers["X-Count"] }, schemas: { N: response.headers["X-Count"].schema } };
  refs.components.headers.C.schema = { $ref: "#/components/schemas/N" };
  response.headers["X-Count"] = { $ref: "#/components/headers/C" };
  refs.paths["/target"].get.responses["200"] = { $ref: "#/components/responses/R" };
  const sibling = structuredClone(doc); sibling.paths["/unsupported"] = { post: { responses: {
    "200": { description: "unsupported header content", headers: { Complex: { content: { "application/json": { schema: { type: "object" } } } } } },
  } } };
  const variants: Array<{ kind: string; format: "json" | "yaml"; source: string; observation: typeof observation; parameters: Json }> = [
    { kind: "object-and-observation-order", format: "json", source: JSON.stringify(reverse(doc)), observation: { ...observation, headers: [...observation.headers].reverse() }, parameters: { reverseObjectKeys: true, reverseHeaderPairs: true } },
    { kind: "formatting", format: "json", source: JSON.stringify(doc, null, 4) + "\r\n", observation, parameters: { indent: 4, finalNewline: "CRLF" } },
    { kind: "same-model-yaml", format: "yaml", source: stringify(doc), observation, parameters: { inputModel: "JSON-compatible" } },
    { kind: "header-case-and-prose", format: "json", source: JSON.stringify({ ...descriptions, paths: cased.paths }), observation: { ...observation, headers: observation.headers.map(h => ({ ...h, name: h.name.toLowerCase() })) }, parameters: { sourceNames: "uppercase", observedNames: "lowercase", infoDescription: true } },
    { kind: "local-reference-equivalence", format: "json", source: JSON.stringify(refs), observation, parameters: { levels: ["response", "header", "schema"], acyclic: true, validationSiblings: false } },
    { kind: "unsupported-sibling-isolation", format: "json", source: JSON.stringify(sibling), observation, parameters: { addedOperation: "POST /unsupported", unsupportedHeaderContent: true } },
  ];
  const relations = variants.map(v => { const result = checkApiResponseHeaders(v.source, v.format, v.observation); return {
    ...v, parentSha256: sha(source), sourceSha256: sha(v.source), result,
    holds: baselineValid && JSON.stringify(normalize(result)) === JSON.stringify(normalize(baseline)),
  }; });
  return { exposure: "development-synthetic-relations", source, observation, baseline, baselineValid, relations,
    addedSiblingResult: checkApiResponseHeaders(JSON.stringify(sibling), "json", { operationKey: "POST /unsupported", statusCode: 200, headers: [] }),
    realSamplesAdded: 0, realHttpCalls: 0, modelCalls: 0, paidCalls: 0,
    notClaimed: ["all-header-semantics", "live-response-correctness", "unseen-input-generalization"] };
}
if (import.meta.main) {
  const out = process.argv.find(v => v.startsWith("--out="))?.slice(6);
  if (!out) throw new Error("--out=<new repository-relative directory> required");
  const directory = await createContainedDirectory(process.cwd(), out, "header relation evidence"), report = runHeaderRelations();
  await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ baselineValid: report.baselineValid, relations: report.relations.length, held: report.relations.filter(r => r.holds).length }));
  if (!report.baselineValid || report.relations.some(r => !r.holds) || report.addedSiblingResult.status !== "unresolved") process.exitCode = 1;
}
