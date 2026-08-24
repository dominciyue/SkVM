import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  runDomainAutomaticConstructionShadow,
} from "./automatic-domain-construction-shadow";

const rootDir = resolve(process.cwd());
const completedAtArgument = process.argv.slice(2).find((argument) => argument.startsWith("--measurement-completed-at="));
if (!completedAtArgument) {
  throw new Error("usage: bun run src/benchmarks/skill-ir/automatic-domain-construction-shadow-run.ts --measurement-completed-at=<ISO-8601>");
}
const measurementCompletedAt = completedAtArgument.slice("--measurement-completed-at=".length);
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-construction-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-construction-shadow-v1");
const catalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await runDomainAutomaticConstructionShadow(rootDir, catalog, outDir, { measurementCompletedAt });

console.log(JSON.stringify({
  reportPath: "results/skill-ir/automatic-domain-construction-shadow-v1/report.json",
  ...report.summary,
}, null, 2));
