import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import {
  ContractRepairArtifactDevelopmentLockSchema,
  parseSafeRelativePath,
} from "./artifact-package";
import {
  buildArtifactDevelopmentGateReport,
  type ArtifactDevelopmentGateReport,
  type ArtifactDevelopmentGateTask,
} from "./artifact-development-gate";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

type GateRunArgs = {
  raw: string;
  scored: string;
  lock: string;
  out: string;
  rootDir: string;
};

const GateTaskSetSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().min(1),
    split: z.string().min(1),
    hardGateIds: z.array(z.string().min(1)),
  }).passthrough()),
}).passthrough();

function parseArgs(argv: string[]): GateRunArgs {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    values.set(match[1]!, match[2]!);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  return {
    raw: required("raw"),
    scored: required("scored"),
    lock: required("lock"),
    out: required("out"),
    rootDir: values.get("root-dir") ?? process.cwd(),
  };
}

function fromRoot(rootDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(rootDir, path);
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function assertDigest(path: string, expected: string, label: string): Promise<Buffer> {
  const bytes = await readFile(path);
  if (sha256Bytes(bytes) !== expected) {
    throw new Error(`Contract-repair artifact gate ${label} digest mismatch`);
  }
  return bytes;
}

export async function runArtifactDevelopmentGateCli(
  argv: string[],
): Promise<ArtifactDevelopmentGateReport> {
  const args = parseArgs(argv);
  const rootDir = resolve(args.rootDir);
  const lock = ContractRepairArtifactDevelopmentLockSchema.parse(
    JSON.parse(await readFile(fromRoot(rootDir, args.lock), "utf8")),
  );
  const packageDir = fromRoot(rootDir, parseSafeRelativePath(lock.package.path));
  await Promise.all([
    assertDigest(
      resolve(packageDir, "package-manifest.json"),
      lock.package.manifestSha256,
      "package manifest",
    ),
    assertDigest(
      resolve(packageDir, "package-provenance.json"),
      lock.package.provenanceSha256,
      "package provenance",
    ),
    assertDigest(
      fromRoot(rootDir, parseSafeRelativePath(lock.scorer.path)),
      lock.scorer.sha256,
      "scorer",
    ),
  ]);
  const tasksPath = fromRoot(rootDir, parseSafeRelativePath(lock.tasks.path));
  const taskBytes = await assertDigest(tasksPath, lock.tasks.sha256, "tasks");
  const taskSet = GateTaskSetSchema.parse(JSON.parse(taskBytes.toString("utf8")));
  const tasks: ArtifactDevelopmentGateTask[] = taskSet.tasks.map((task) => ({
    id: task.id,
    split: task.split,
    hardGateIds: task.hardGateIds,
  }));
  const report = buildArtifactDevelopmentGateReport({
    expected: {
      system: lock.matrix.system,
      skillId: lock.skillId,
      model: lock.model.route,
      modelFamily: lock.model.family,
      adapter: lock.adapter.id,
      adapterVersion: lock.adapter.version,
      panelConfigId: lock.matrix.panelConfigId,
      contexts: lock.matrix.contexts,
      agents: lock.matrix.agents,
      environments: lock.matrix.environments,
      taskIds: lock.matrix.taskIds,
      repetitions: lock.matrix.repetitions,
      initialGenerationRows: lock.matrix.initialGenerationRows,
      minimumSuccesses: lock.developmentGate.minimumSuccesses,
      minimumMeanScore: lock.developmentGate.minimumMeanScore,
      maximumHardGateRegressions: lock.developmentGate.maximumHardGateRegressions,
      maximumInfrastructureFailures: lock.developmentGate.maximumInfrastructureFailures,
    },
    tasks,
    rawRows: await readJsonl<RawAgentRunRow>(fromRoot(rootDir, args.raw)),
    scoredRows: await readJsonl<ScoredAgentRunRow>(fromRoot(rootDir, args.scored)),
  });
  const outPath = fromRoot(rootDir, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (import.meta.main) {
  const report = await runArtifactDevelopmentGateCli(process.argv.slice(2));
  console.log(JSON.stringify({
    out: parseArgs(process.argv.slice(2)).out,
    passed: report.gate.passed,
    counts: report.counts,
    meanScoreIncludingInfrastructure: report.meanScoreIncludingInfrastructure,
  }, null, 2));
}
