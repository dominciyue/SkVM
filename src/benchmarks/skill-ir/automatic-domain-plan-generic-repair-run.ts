import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildGenericDomainPlanRepairFreeze,
  GenericDomainPlanRepairCatalogSchema,
  GenericDomainPlanRepairFreezeSchema,
  runGenericDomainPlanRepair,
} from "./automatic-domain-plan-generic-repair";

function value(name: string): string | undefined {
  return process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

const phase = value("--phase");
if (phase !== "freeze" && phase !== "execute") throw new Error("usage: --phase=freeze|execute");

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-generic-repair-env-2026-08-25.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-plan-generic-repair-env-2026-08-25");
const catalog = GenericDomainPlanRepairCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));

if (phase === "freeze") {
  const freeze = await buildGenericDomainPlanRepairFreeze(rootDir, catalog, outDir);
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-generic-repair-env-2026-08-25/pre-model-freeze.json",
    attemptId: freeze.attemptId,
    case: freeze.case,
    request: freeze.request,
    requiredOutputPaths: freeze.requiredOutputPaths,
    authorization: freeze.authorization,
    summary: freeze.summary,
  }, null, 2));
} else {
  const freezePath = resolve(outDir, "pre-model-freeze.json");
  const freeze = GenericDomainPlanRepairFreezeSchema.parse(JSON.parse(await readFile(freezePath, "utf8")));
  const report = await runGenericDomainPlanRepair({ rootDir, catalog, freeze, freezePath, outDir });
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-generic-repair-env-2026-08-25/report.json",
    attemptId: report.attemptId,
    status: report.status,
    audits: report.audits,
    typeNamespaceIssueCount: report.typeNamespaceIssueCount,
    staticTypeIssueCount: report.staticTypeIssueCount,
    generatedPlan: report.generatedPlan,
    cleanAttribution: report.cleanAttribution,
    paritySummary: report.parity?.summary ?? null,
    summary: report.summary,
  }, null, 2));
}
