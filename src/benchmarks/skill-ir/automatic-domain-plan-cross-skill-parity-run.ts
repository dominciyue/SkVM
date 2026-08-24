import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildCrossSkillDomainPlanParityReport,
  CrossSkillDomainPlanParityCatalogSchema,
} from "./automatic-domain-plan-cross-skill-parity";

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-cross-skill-parity-v1.json");
const outputPath = resolve(rootDir, "results/skill-ir/automatic-domain-plan-cross-skill-parity-v1/report.json");
const catalog = CrossSkillDomainPlanParityCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const report = await buildCrossSkillDomainPlanParityReport({ rootDir, catalog, outputPath });

console.log(JSON.stringify({
  path: "results/skill-ir/automatic-domain-plan-cross-skill-parity-v1/report.json",
  cases: report.cases,
  semanticParity: report.semanticParity,
  summary: report.summary,
}, null, 2));
