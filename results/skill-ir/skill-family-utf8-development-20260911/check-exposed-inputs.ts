import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { decodeDevelopmentUtf8 } from "../../../src/skill-ir/development-utf8";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const out = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
if (!out) throw new Error("--out=<new-report.json>");
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const indexBytes = await readFile(indexPath), index = JSON.parse(decodeDevelopmentUtf8(indexBytes));
const rows = [];
for (const input of index.inputs) {
  const bytes = await readFile(resolve(dirname(indexPath), input.localPath)), text = decodeDevelopmentUtf8(bytes);
  const bodyPath = `results/skill-ir/skill-family-body-negatives-development-20260911/first-run/${input.inputId}.json`;
  const responsePath = `results/skill-ir/skill-family-response-schema-development-20260911/first-run/${input.inputId}.json`;
  const bodyBytes = await readFile(bodyPath), responseBytes = await readFile(responsePath);
  const body = JSON.parse(bodyBytes.toString()), response = JSON.parse(responseBytes.toString());
  rows.push({ inputId: input.inputId, sourceSha256: sha(bytes), declaredDigestMatches: sha(bytes) === input.sha256,
    textUnchanged: text === bytes.toString("utf8"), byteRoundTrip: Buffer.from(text, "utf8").equals(bytes),
    archivedBodySourceMatches: body.report.fields.sourceSha256 === sha(text) && body.report.specimens.sourceSha256 === sha(text),
    archivedResponseSourceMatches: response.sourceSha256 === sha(text), bodyPath, bodyReportSha256: sha(bodyBytes), responsePath, responseReportSha256: sha(responseBytes) });
}
const sourceBindings = [];
for (const path of ["src/skill-ir/development-utf8.ts", "src/skill-ir/api-skill-mapping.ts", "scripts/skill-ir/api-request-specimens-development.ts", "scripts/skill-ir/api-response-schema-development.ts"]) {
  sourceBindings.push({ path, sha256: sha(await readFile(path)) });
}
const report = { exposure: "development-ingestion-correction", inputIndexSha256: sha(indexBytes), sourceBindings, rows,
  pass: rows.every((r) => r.declaredDigestMatches && r.textUnchanged && r.byteRoundTrip && r.archivedBodySourceMatches && r.archivedResponseSourceMatches),
  artifactsRegenerated: false, cleanEvidenceStillBindsCommit: "be89a50", remoteApiCalls: 0, modelCalls: 0, paidCalls: 0,
  developerAgentCost: "unmeasured-separate", limitation: "Proves unchanged decoded text and existing artifact source bindings for this exposed panel, not a new full clean execution." };
await writeFile(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ inputs: rows.length, pass: report.pass, artifactsRegenerated: false }));
if (!report.pass) process.exitCode = 1;
