import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PilotAdapterCatalogSchema,
  runPilotLifecycleShadow,
  type PilotLifecycleShadowCaseReport,
} from "./pilot-lifecycle";

const DEFAULT_CATALOG = "benchmarks/skill-ir/corpus/pilot-adapters.json";
const DEFAULT_OUT = "results/skill-ir/pilot-lifecycle-shadow-parity.json";

export type PilotLifecycleShadowParityReport = {
  schemaVersion: "skill-ir-pilot-lifecycle-shadow-parity/v1";
  cases: PilotLifecycleShadowCaseReport[];
  summary: {
    caseCount: number;
    positiveParityCount: number;
    negativeCanaryCount: number;
    packageCount: number;
    byteParityCount: number;
    planParityCount: number;
    reportParityCount: number;
    coreBranchDelta: number;
    paidCalls: number;
    ready: boolean;
  };
};

export async function runDefaultPilotLifecycleShadowParity(
  rootDir: string,
): Promise<PilotLifecycleShadowParityReport> {
  const catalog = PilotAdapterCatalogSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, DEFAULT_CATALOG),
    "utf8",
  )));
  const cases: PilotLifecycleShadowCaseReport[] = [];
  for (const adapter of catalog.adapters) {
    cases.push(await runPilotLifecycleShadow(rootDir, adapter));
  }
  const positive = cases.filter((entry) => entry.blocker === null);
  const negative = cases.filter((entry) => entry.decision === "measurement-invalid");
  const summary = {
    caseCount: cases.length,
    positiveParityCount: positive.filter((entry) => entry.ready).length,
    negativeCanaryCount: negative.filter((entry) => entry.ready).length,
    packageCount: cases.reduce((sum, entry) => sum + entry.shadow.packageCount, 0),
    byteParityCount: cases.reduce((sum, entry) => sum + entry.shadow.byteParityCount, 0),
    planParityCount: cases.filter((entry) => entry.shadow.planParity).length,
    reportParityCount: cases.filter((entry) => entry.shadow.reportParity).length,
    coreBranchDelta: cases.reduce((sum, entry) => sum + entry.shadow.coreBranchDelta, 0),
    paidCalls: cases.reduce((sum, entry) => sum + entry.paidCalls.total, 0),
    ready: false,
  };
  summary.ready = summary.caseCount === 3
    && summary.positiveParityCount === 2
    && summary.negativeCanaryCount === 1
    && summary.packageCount === 4
    && summary.byteParityCount === 4
    && summary.planParityCount === 2
    && summary.reportParityCount === 2
    && summary.coreBranchDelta === 0
    && summary.paidCalls === 0;
  return {
    schemaVersion: "skill-ir-pilot-lifecycle-shadow-parity/v1",
    cases,
    summary,
  };
}

export async function writeDefaultPilotLifecycleShadowParityReport(
  rootDir: string,
  outPath: string,
): Promise<PilotLifecycleShadowParityReport> {
  const report = await runDefaultPilotLifecycleShadowParity(rootDir);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (import.meta.main) {
  const outArgument = process.argv.slice(2).find((argument) => argument.startsWith("--out="));
  const outPath = path.resolve(process.cwd(), outArgument?.slice("--out=".length) || DEFAULT_OUT);
  const report = await writeDefaultPilotLifecycleShadowParityReport(process.cwd(), outPath);
  process.stdout.write(`${JSON.stringify({ out: outPath, ready: report.summary.ready }, null, 2)}\n`);
  if (!report.summary.ready) process.exitCode = 1;
}
