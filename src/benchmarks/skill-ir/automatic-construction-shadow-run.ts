import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AutomaticConstructionShadowCatalogSchema,
  runAutomaticConstructionShadow,
} from "./automatic-construction-shadow";

const rootDir = resolve(process.cwd());
const completedAtArgument = process.argv.slice(2).find((argument) => argument.startsWith("--measurement-completed-at="));
if (!completedAtArgument) {
  throw new Error("usage: bun run src/benchmarks/skill-ir/automatic-construction-shadow-run.ts --measurement-completed-at=<ISO-8601>");
}
const measurementCompletedAt = completedAtArgument.slice("--measurement-completed-at=".length);
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-construction-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-construction-shadow-v1");
const catalog = AutomaticConstructionShadowCatalogSchema.parse(
  JSON.parse(await readFile(catalogPath, "utf8")),
);
const report = await runAutomaticConstructionShadow(rootDir, catalog, outDir, {
  measurementStartedAt: catalog.measurementStartedAt,
  measurementCompletedAt,
});

console.log(JSON.stringify({
  reportPath: "results/skill-ir/automatic-construction-shadow-v1/report.json",
  ...report.summary,
}, null, 2));
