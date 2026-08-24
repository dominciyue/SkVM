import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  DomainPlanManualParityCaseInputSchema,
  runDomainPlanManualParityCase,
} from "./automatic-domain-plan-manual-parity";

function value(name: string): string | undefined {
  return process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

function contained(rootDir: string, path: string): string {
  const candidate = resolve(rootDir, path);
  const fromRoot = relative(rootDir, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`${path} escapes repository root`);
  return candidate;
}

const rootDir = resolve(process.cwd());
const inputArg = value("--input");
const outputArg = value("--out");
if (!inputArg || !outputArg) throw new Error("usage: --input=<repo-relative-json> --out=<repo-relative-json>");
const inputPath = contained(rootDir, inputArg);
const outputPath = contained(rootDir, outputArg);
const input = DomainPlanManualParityCaseInputSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const report = await runDomainPlanManualParityCase({ rootDir, input, outputPath });

console.log(JSON.stringify({
  path: relative(rootDir, outputPath).replaceAll("\\", "/"),
  caseId: report.caseId,
  tasks: report.tasks.map((task) => ({
    taskId: task.taskId,
    runtime: task.runtime,
    protectedInputsPreserved: task.protectedInputsPreserved,
    declaredOutputs: task.declaredOutputs,
    baseline: task.baseline.summary,
    postPlan: task.postPlan.summary,
    passedCriterionDelta: task.passedCriterionDelta,
    weightedScoreDelta: task.weightedScoreDelta,
    fullParity: task.fullParity,
  })),
  caseParity: report.caseParity,
  summary: report.summary,
}, null, 2));
