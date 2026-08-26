import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  auditReviewedAotConstructionCost,
  ReviewedAotConstructionCostPolicySchema,
} from "./reviewed-aot-construction-cost-readiness";

const DEFAULT_POLICY_PATH = "benchmarks/skill-ir/corpus/reviewed-aot-construction-cost-readiness-env-2026-08-26.json";
const DEFAULT_OUTPUT_PATH = "results/skill-ir/reviewed-aot-construction-cost-readiness-env-2026-08-26.json";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function rootRelative(rootDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(rootDir, path);
}

const rootDir = resolve(argument("root") ?? process.cwd());
const policyPath = rootRelative(rootDir, argument("policy") ?? DEFAULT_POLICY_PATH);
const outputPath = rootRelative(rootDir, argument("output") ?? DEFAULT_OUTPUT_PATH);
const policy = ReviewedAotConstructionCostPolicySchema.parse(JSON.parse(await readFile(policyPath, "utf8")));
const report = await auditReviewedAotConstructionCost({ rootDir, policy, outputPath });

console.log(JSON.stringify({
  status: report.status,
  qualityEquivalent: report.qualityEvidence.equivalent,
  builderMapping: report.productionOneTime.builderMapping,
  missing: report.productionOneTime.missing,
  authorization: report.authorization,
  outputPath,
}, null, 2));
