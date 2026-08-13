import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExecutionEnvelopeSchema } from "./execution-resilience";
import { buildMultiModelDevelopmentPanelSupplementalAudit } from "./multi-model-development-panel";

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const rootDir = path.resolve(option("root", process.cwd()));
const reportRelative = option(
  "report",
  "results/skill-ir/three-family-development-panel-v4/panel-report.json",
);
const envelopesRelative = option(
  "envelopes",
  "results/skill-ir/three-family-development-panel-v4/execution-envelopes.jsonl",
);
const outputRelative = option(
  "out",
  "results/skill-ir/three-family-development-panel-v4/supplemental-audit.json",
);
const reportPath = path.resolve(rootDir, ...reportRelative.split("/"));
const envelopesPath = path.resolve(rootDir, ...envelopesRelative.split("/"));
const outputPath = path.resolve(rootDir, ...outputRelative.split("/"));
const reportBytes = await readFile(reportPath);
const envelopesBytes = await readFile(envelopesPath);
const sourceReport = JSON.parse(reportBytes.toString("utf8"));
const envelopes = envelopesBytes.toString("utf8").trim().split(/\r?\n/)
  .filter(Boolean).map((line) => ExecutionEnvelopeSchema.parse(JSON.parse(line)));
const audit = buildMultiModelDevelopmentPanelSupplementalAudit({
  sourceReport,
  envelopes,
  sourceReportPath: reportRelative,
  sourceReportSha256: sha256(reportBytes),
  sourceEnvelopesPath: envelopesRelative,
  sourceEnvelopesSha256: sha256(envelopesBytes),
});
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputRelative, status: audit.status }, null, 2));
