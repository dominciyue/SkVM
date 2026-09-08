import { resolve } from "node:path";
import {
  API_TESTER_V2_FEATURE_MIGRATION_IDENTITY,
  runApiTesterV2FeatureMigrationFirstRun,
} from "./api-tester-v2-feature-migration";

function requiredValue(name: string): string {
  const prefix = `--${name}=`;
  const values = process.argv.slice(2).filter((argument) => argument.startsWith(prefix));
  if (values.length !== 1 || values[0]!.length === prefix.length) throw new Error(`Expected exactly one ${prefix}<value>`);
  return values[0]!.slice(prefix.length);
}

function rejectUnknownArguments(): void {
  const allowed = new Set(["root", "cache-root", "freeze-commit", "out", "node", "bun", "completed-at"]);
  for (const argument of process.argv.slice(2)) {
    const match = argument.match(/^--([^=]+)=/u);
    if (!match || !allowed.has(match[1]!)) throw new Error(`Unknown argument: ${argument}`);
  }
}

rejectUnknownArguments();
const rootDir = resolve(requiredValue("root"));
const cacheRoot = resolve(requiredValue("cache-root"));
const freezeCommit = requiredValue("freeze-commit");
const outPath = resolve(requiredValue("out"));
const nodeExecutable = resolve(requiredValue("node"));
const bunExecutable = resolve(requiredValue("bun"));
const completedAt = requiredValue("completed-at");

console.log(`BUDGET-CHECK identity=${API_TESTER_V2_FEATURE_MIGRATION_IDENTITY} denominator=10 modelCalls=0 apiCalls=0 paidCalls=0`);
console.log("STOP-LOSS attemptsPerRow=1 retries=0 replacements=0 candidateFixes=0 retainAllOutcomes=true");
const report = await runApiTesterV2FeatureMigrationFirstRun({
  rootDir,
  cacheRoot,
  freezeCommit,
  outPath,
  nodeExecutable,
  bunExecutable,
  completedAt,
});
console.log(JSON.stringify({
  identity: report.identity,
  status: report.status,
  denominator: report.denominator,
  predictionParity: report.predictionParity,
  costs: report.costs,
}));
