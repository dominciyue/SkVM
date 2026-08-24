import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRestrictedDomainPlanAttributionFreeze,
  RestrictedDomainPlanAttributionCatalogSchema,
  RestrictedDomainPlanAttributionFreezeSchema,
  runRestrictedDomainPlanAttribution,
} from "./automatic-domain-plan-attribution";

function value(name: string): string | undefined {
  return process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

const phase = value("--phase");
if (phase !== "freeze" && phase !== "execute") throw new Error("usage: --phase=freeze|execute");

const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-attribution-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-plan-attribution-v1");
const catalog = RestrictedDomainPlanAttributionCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));

if (phase === "freeze") {
  const freeze = await buildRestrictedDomainPlanAttributionFreeze(rootDir, catalog, outDir);
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-attribution-v1/pre-model-freeze.json",
    stages: freeze.stages.map((stage) => ({
      stageId: stage.stageId,
      toolSchemaMode: stage.toolSchemaMode,
      requestChars: stage.requestChars,
      providerPayloadChars: stage.providerPayloadChars,
    })),
    authorization: freeze.authorization,
    summary: freeze.summary,
  }, null, 2));
} else {
  const freezePath = resolve(outDir, "pre-model-freeze.json");
  const freeze = RestrictedDomainPlanAttributionFreezeSchema.parse(JSON.parse(await readFile(freezePath, "utf8")));
  const report = await runRestrictedDomainPlanAttribution({ rootDir, catalog, freeze, freezePath, outDir });
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-attribution-v1/report.json",
    status: report.status,
    bisection: report.bisection,
    stages: report.stages.map((stage) => ({
      stageId: stage.stageId,
      status: stage.status,
      failure: stage.failure,
      responseMetadata: stage.responseMetadata,
      postParseAudits: stage.postParseAudits,
    })),
    generatedPlan: report.generatedPlan,
    summary: report.summary,
  }, null, 2));
}
