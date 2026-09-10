import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { buildApiRequestCases } from "../../src/skill-ir/api-request-cases";
import { verifyApiRequestCases } from "../../src/skill-ir/api-request-cases-checker";

// Development evidence runner: declared input index, never historical first-run runners.
const input = process.argv.find((v) => v.startsWith("--inputs="))?.slice(9);
const output = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
if (!input || !output) throw new Error("--inputs=<index.json> --out=<new-directory> required");
const indexPath = resolve(input), out = resolve(output);
await mkdir(out, { recursive: false });
const indexBytes = await readFile(indexPath);
const index = JSON.parse(indexBytes.toString("utf8"));
const rows: unknown[] = [];
for (const row of index.inputs) {
  const started = performance.now();
  try {
    if (row.status !== "acquired") throw new Error("declared input unavailable");
    const bytes = await readFile(resolve(dirname(indexPath), row.localPath));
    if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new Error("input digest mismatch");
    const report = buildApiRequestCases(bytes.toString("utf8"), row.format);
    const verification = verifyApiRequestCases(bytes.toString("utf8"), row.format, report);
    const evidence = { inputId: row.inputId, report, verification };
    await writeFile(join(out, `${row.inputId}.json`), JSON.stringify(evidence, null, 2) + "\n");
    rows.push({ inputId: row.inputId, status: verification.status, operations: report.operations.length,
      covered: verification.schemaCasesCovered, obligations: verification.schemaObligations, errors: verification.errors,
      witnessesAvailable: verification.operationChecks.filter((r) => r.allSchemaWitnessesAvailable).length,
      elapsedMs: performance.now() - started });
  } catch (error) { rows.push({ inputId: row.inputId, status: "error", error: String(error), elapsedMs: performance.now() - started }); }
  console.log(JSON.stringify(rows.at(-1)));
  await writeFile(join(out, "report.json"), JSON.stringify({ development: true, inputIndexSha256: createHash("sha256").update(indexBytes).digest("hex"),
    runtime: process.version, rows, wholeSkillCompleted: false, projectModelCalls: 0, paidCalls: 0 }, null, 2) + "\n");
}
