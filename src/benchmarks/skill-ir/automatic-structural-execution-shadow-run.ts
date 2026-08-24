import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  runStructuralExecutionShadow,
  StructuralExecutionShadowCatalogSchema,
} from "./automatic-structural-execution-shadow";

const completedAtArgument = process.argv.slice(2)
  .find((argument) => argument.startsWith("--measurement-completed-at="));
if (!completedAtArgument) {
  throw new Error("usage: bun run src/benchmarks/skill-ir/automatic-structural-execution-shadow-run.ts --measurement-completed-at=<ISO-8601>");
}

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-structural-execution-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-structural-execution-shadow-v1");
const catalog = StructuralExecutionShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await runStructuralExecutionShadow(rootDir, catalog, outDir, {
  measurementCompletedAt: completedAtArgument.slice("--measurement-completed-at=".length),
});

console.log(JSON.stringify({
  reportPath: "results/skill-ir/automatic-structural-execution-shadow-v1/report.json",
  ...report.summary,
}, null, 2));
