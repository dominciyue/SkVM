import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AutomaticJsonPointerConstructionShadowCatalogSchema,
  runAutomaticJsonPointerConstructionShadow,
} from "./automatic-json-pointer-construction-shadow";

function value(name: string): string {
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`));
  if (!argument) throw new Error(`missing ${name}`);
  return argument.slice(name.length + 1);
}

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-json-pointer-construction-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-json-pointer-construction-shadow-v1");
const catalog = AutomaticJsonPointerConstructionShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await runAutomaticJsonPointerConstructionShadow(rootDir, catalog, outDir, {
  measurementCompletedAt: value("--measurement-completed-at"),
  meteredHumanMinutes: Number.parseInt(value("--metered-human-minutes"), 10),
});
console.log(JSON.stringify({
  reportPath: "results/skill-ir/automatic-json-pointer-construction-shadow-v1/report.json",
  ...report.summary,
  ceiling: report.ceiling,
}, null, 2));
