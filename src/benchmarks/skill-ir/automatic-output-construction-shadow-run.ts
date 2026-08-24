import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AutomaticOutputConstructionShadowCatalogSchema,
  runAutomaticOutputConstructionShadow,
} from "./automatic-output-construction-shadow";

function value(name: string): string {
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`));
  if (!argument) throw new Error(`missing ${name}`);
  return argument.slice(name.length + 1);
}

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-output-construction-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-output-construction-shadow-v1");
const catalog = AutomaticOutputConstructionShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await runAutomaticOutputConstructionShadow(rootDir, catalog, outDir, {
  measurementCompletedAt: value("--measurement-completed-at"),
  meteredHumanMinutes: Number.parseInt(value("--metered-human-minutes"), 10),
});
console.log(JSON.stringify({
  reportPath: "results/skill-ir/automatic-output-construction-shadow-v1/report.json",
  ...report.summary,
}, null, 2));
