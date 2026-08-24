import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRestrictedDomainPlanPreModelFreeze,
  RestrictedDomainPlanPreModelFreezeSchema,
  RestrictedDomainPlanShadowCatalogSchema,
  runRestrictedDomainPlanShadow,
} from "./automatic-domain-plan-shadow";

function value(name: string): string | undefined {
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
}

const phase = value("--phase");
if (phase !== "freeze" && phase !== "execute") {
  throw new Error("usage: --phase=freeze|execute [--measurement-completed-at=<ISO>] [--metered-human-minutes=<n>]");
}
const rootDir = resolve(process.cwd());
const catalogPath = resolve(rootDir, "benchmarks/skill-ir/corpus/automatic-domain-plan-shadow-v1.json");
const outDir = resolve(rootDir, "results/skill-ir/automatic-domain-plan-shadow-v1");
const catalog = RestrictedDomainPlanShadowCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));

if (phase === "freeze") {
  const freeze = await buildRestrictedDomainPlanPreModelFreeze(rootDir, catalog, outDir);
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-shadow-v1/pre-model-freeze.json",
    ...freeze.summary,
    authorization: freeze.authorization,
  }, null, 2));
} else {
  const completedAt = value("--measurement-completed-at");
  const humanMinutes = Number.parseInt(value("--metered-human-minutes") ?? "", 10);
  if (!completedAt || !Number.isInteger(humanMinutes) || humanMinutes < 0) {
    throw new Error("execute requires --measurement-completed-at=<ISO> and --metered-human-minutes=<nonnegative integer>");
  }
  const freeze = RestrictedDomainPlanPreModelFreezeSchema.parse(JSON.parse(await readFile(
    resolve(outDir, "pre-model-freeze.json"),
    "utf8",
  )));
  const report = await runRestrictedDomainPlanShadow({
    rootDir,
    catalog,
    preModelFreeze: freeze,
    outDir,
    measurementCompletedAt: completedAt,
    meteredHumanMinutes: humanMinutes,
  });
  console.log(JSON.stringify({
    path: "results/skill-ir/automatic-domain-plan-shadow-v1/report.json",
    ...report.summary,
    reuseGate: report.reuseGate,
  }, null, 2));
}
