import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildSingleDomainPlanGenerationFreeze,
  runSingleDomainPlanGeneration,
  SingleDomainPlanGenerationCatalogSchema,
  SingleDomainPlanGenerationFreezeSchema,
} from "./automatic-domain-plan-single-generation";

function value(name: string): string | undefined {
  return process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

const phase = value("--phase");
if (phase !== "freeze" && phase !== "execute") throw new Error("usage: --phase=freeze|execute");

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-single-generation-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-plan-single-generation-v1");
const catalog = SingleDomainPlanGenerationCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));

if (phase === "freeze") {
  const freeze = await buildSingleDomainPlanGenerationFreeze(rootDir, catalog, outDir);
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-single-generation-v1/pre-model-freeze.json",
    case: freeze.case,
    request: freeze.request,
    authorization: freeze.authorization,
    summary: freeze.summary,
  }, null, 2));
} else {
  const freezePath = resolve(outDir, "pre-model-freeze.json");
  const freeze = SingleDomainPlanGenerationFreezeSchema.parse(JSON.parse(await readFile(freezePath, "utf8")));
  const report = await runSingleDomainPlanGeneration({ rootDir, catalog, freeze, freezePath, outDir });
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-single-generation-v1/report.json",
    caseId: report.caseId,
    status: report.status,
    usageStatus: report.usageStatus,
    tokens: report.tokens,
    durationMs: report.durationMs,
    audits: report.audits,
    staticTypeIssueCount: report.staticTypeIssueCount,
    generatedPlan: report.generatedPlan,
    summary: report.summary,
  }, null, 2));
}
