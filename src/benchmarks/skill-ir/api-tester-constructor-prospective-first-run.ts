import { resolve } from "node:path";
import { runApiTesterProspectiveFirstRun } from "./api-tester-constructor-prospective";

function value(name: string): string {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!entry) throw new Error(`Missing --${name}=...`);
  return entry.slice(prefix.length);
}

const rootDir = resolve(value("root"));
const cacheRoot = resolve(value("cache-root"));
const freezeCommit = value("freeze-commit");
const outPath = resolve(value("out"));
const nodeExecutable = resolve(value("node"));
const lockPath = "benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/experiment-lock.json";

console.log("BUDGET-CHECK identity=skill-ir-api-tester-constructor-prospective-001 denominator=8 modelCalls=0 apiCalls=0 paidCalls=0");
console.log("STOP-LOSS attemptsPerRow=1 retries=0 replacements=0 candidateFixes=0 retainAllOutcomes=true");
const report = await runApiTesterProspectiveFirstRun({
  rootDir,
  cacheRoot,
  lockPath,
  freezeCommit,
  outPath,
  nodeExecutable,
});
console.log(JSON.stringify({
  identity: report.identity,
  status: report.status,
  denominator: report.denominator,
  predictionParity: report.predictionParity,
}));
