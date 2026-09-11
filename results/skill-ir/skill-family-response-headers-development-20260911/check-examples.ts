import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { checkApiResponseHeaders } from "../../../src/skill-ir/api-response-headers";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const base = "results/skill-ir/skill-family-response-headers-development-20260911/";
const inventoryBytes = await readFile(base + "source-inventory.json"), inventory = JSON.parse(inventoryBytes.toString("utf8"));
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json", index = JSON.parse(await readFile(indexPath, "utf8"));
const documents = [];
for (const input of index.inputs) {
  const bytes = await readFile(resolve(dirname(indexPath), input.localPath));
  if (sha(bytes) !== input.sha256) throw new Error("source digest mismatch");
  const declared = inventory.documents.find((d: any) => d.inputId === input.inputId);
  if (!declared || declared.sha256 !== input.sha256) throw new Error("inventory source binding mismatch");
  const groups = new Map<string, any>(), unavailable = [];
  for (const h of declared.rows) {
    const example = h.resolved.example ?? h.resolved.schema?.example;
    if (typeof example !== "string" || !/^[1-5][0-9]{2}$/u.test(h.responseKey)) { unavailable.push({ ...h, reason: "explicit string wire example and exact status required" }); continue; }
    const key = JSON.stringify([h.operationKey, h.responseKey]);
    const observation = groups.get(key) ?? { operationKey: h.operationKey, statusCode: Number(h.responseKey), headers: [] };
    observation.headers.push({ name: h.name, value: example }); groups.set(key, observation);
  }
  const observations = [...groups.values()].map(observation => ({ observation, check: checkApiResponseHeaders(bytes.toString("utf8"), input.format, observation) }));
  documents.push({ inputId: input.inputId, sourceSha256: input.sha256, declaredHeaderOccurrences: declared.rows.length,
    discoveryUnresolved: declared.unresolved, unavailable, observations, status: declared.rows.length ? "source-examples-evaluated" : "no-declared-response-headers" });
}
const report = { exposure: "development-source-examples-not-live", sourceInventorySha256: sha(inventoryBytes),
  checkerSha256: sha(await readFile("src/skill-ir/api-response-headers.ts")), documents,
  counts: { documents: documents.length, withHeaders: documents.filter(d => d.declaredHeaderOccurrences).length,
    declaredHeaders: documents.reduce((n,d) => n + d.declaredHeaderOccurrences, 0),
    observations: documents.reduce((n,d) => n + d.observations.length, 0),
    validObservations: documents.flatMap(d => d.observations).filter(o => o.check.status === "checked" && o.check.valid).length,
    checkedHeaderValues: documents.flatMap(d => d.observations).flatMap(o => o.check.headers).filter(h => h.status === "checked" && h.valid).length },
  wholeResponseVerified: false, realHttpCalls: 0, modelCalls: 0, paidCalls: 0 };
const output = process.argv.find(v => v.startsWith("--out="))?.slice(6);
if (!output) throw new Error("--out=<new-report> required");
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(report.counts));
