import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRestrictedDomainPlanTransportFreeze,
  RestrictedDomainPlanTransportCatalogSchema,
  RestrictedDomainPlanTransportFreezeSchema,
  runRestrictedDomainPlanTransportQualification,
} from "./automatic-domain-plan-transport-qualification";

function value(name: string): string | undefined {
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
}

const phase = value("--phase");
if (phase !== "freeze" && phase !== "execute") {
  throw new Error("usage: --phase=freeze|execute [--measurement-completed-at=<ISO>]");
}
const rootDir = resolve(process.cwd());
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-plan-transport-qualification-v1");
const catalog = RestrictedDomainPlanTransportCatalogSchema.parse(JSON.parse(await readFile(resolve(
  rootDir,
  "benchmarks/skill-ir/corpus/automatic-domain-plan-transport-qualification-v1.json",
), "utf8")));

if (phase === "freeze") {
  const freeze = await buildRestrictedDomainPlanTransportFreeze(rootDir, catalog, outDir);
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-transport-qualification-v1/pre-model-freeze.json",
    ...freeze.summary,
    authorization: freeze.authorization,
  }, null, 2));
} else {
  const completedAt = value("--measurement-completed-at");
  if (!completedAt) throw new Error("execute requires --measurement-completed-at=<ISO>");
  const freezePath = resolve(outDir, "pre-model-freeze.json");
  const freeze = RestrictedDomainPlanTransportFreezeSchema.parse(JSON.parse(await readFile(freezePath, "utf8")));
  const report = await runRestrictedDomainPlanTransportQualification({
    rootDir,
    catalog,
    freeze,
    freezePath,
    reportPath: resolve(outDir, "report.json"),
    measurementCompletedAt: completedAt,
  });
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-transport-qualification-v1/report.json",
    status: report.status,
    failureStage: report.failure?.stage ?? null,
    canonicalPlanMatched: report.canonicalPlanMatched,
    tokens: report.tokens,
    durationMs: report.durationMs,
    conclusion: report.conclusion,
    historicalTaskFailuresReclassified: report.historicalTaskFailuresReclassified,
  }, null, 2));
}
