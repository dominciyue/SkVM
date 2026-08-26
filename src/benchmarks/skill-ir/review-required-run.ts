import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { ReviewRequiredCatalogSchema, runReviewRequiredSlice } from "./review-required";

const DEFAULT_CATALOG_PATH = "benchmarks/skill-ir/corpus/review-required-env-2026-08-26.json";
const DEFAULT_OUTPUT_PATH = "results/skill-ir/review-required-env-2026-08-26/report.json";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function rootRelative(rootDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(rootDir, path);
}

const rootDir = resolve(argument("root") ?? process.cwd());
const catalogPath = rootRelative(rootDir, argument("catalog") ?? DEFAULT_CATALOG_PATH);
const outputPath = rootRelative(rootDir, argument("output") ?? DEFAULT_OUTPUT_PATH);
const measurementCompletedAt = argument("measurement-completed-at");
const humanMinutesText = argument("human-minutes");

if (!measurementCompletedAt) {
  throw new Error("--measurement-completed-at=<ISO timestamp> is required for prospective accounting");
}
if (!humanMinutesText) {
  throw new Error("--human-minutes=<non-negative number> is required for prospective accounting");
}
const humanMinutes = Number(humanMinutesText);
if (!Number.isFinite(humanMinutes) || humanMinutes < 0) {
  throw new Error("--human-minutes must be a non-negative finite number");
}

const catalog = ReviewRequiredCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await runReviewRequiredSlice({
  rootDir,
  catalog,
  outputPath,
  measurementCompletedAt,
  humanMinutes,
});

console.log(JSON.stringify({
  status: report.status,
  automatic: report.automaticOnly.summary,
  reviewed: report.reviewed.summary,
  humanMinutes: report.patch.humanMinutes,
  paidCalls: report.authorization.paidCalls,
  outputPath,
}, null, 2));
