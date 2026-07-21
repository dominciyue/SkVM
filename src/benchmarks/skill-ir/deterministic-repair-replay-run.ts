import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { verifyArtifactSnapshot } from "./artifact-snapshot";
import {
  PublicContractArtifactDevelopmentLockSchema,
  readAndValidatePublicContractArtifactDevelopmentLock,
  validateArtifactPackage,
} from "./artifact-package";
import { repairEnvManagerArtifactsDeterministically } from "./deterministic-artifact-repairer";
import { buildEnvManagerExecutableRepairContract } from "./executable-repair-contract";
import { PublicRuntimeContractSchema } from "./public-contract";
import {
  validatePublicContractOutputs,
  type PublicOutputContract,
} from "./public-contract-checker";
import type { SkillIRBenchmarkTask } from "./real-agent";
import {
  scoreRawRunRows,
  parseCaseId,
  type RawAgentRunRow,
  type ScoredAgentRunRow,
} from "./scoring";
import { sha256Bytes } from "./source-fixture";

type Args = {
  raw: string;
  tasks: string;
  outputContract: string;
  lock: string;
  sourceEvidence: string;
  methodFreeze: string;
  replayDir: string;
  out: string;
};

type TaskSet = { skillId: string; tasks: SkillIRBenchmarkTask[] };

type ScoreProjection = {
  success: boolean;
  score?: number;
  failedCriteria: string[];
  failureType?: string;
  failureStage?: string;
};

type ReplayRow = {
  caseId: string;
  generationIdentity: string;
  snapshotSha256: string;
  initialRuntimeStatus: "pass" | "fail";
  initialRuntimeCodes: string[];
  finalRuntimeStatus: "pass" | "fail";
  finalRuntimeCodes: string[];
  repairStatus: "changed" | "no-change";
  repairOperations: string[];
  protectedDigestStable: boolean;
  before: ScoreProjection;
  after: ScoreProjection;
};

export function parseDeterministicReplayArgs(argv: string[]): Args {
  const args: Args = {
    raw: "results/skill-ir/env-manager-public-contract-v3-development-run-2026-07-21/raw-runs.jsonl",
    tasks: "benchmarks/skill-ir/pilots/env-manager/tasks.json",
    outputContract: "benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3/artifacts/contracts/output-contract.json",
    lock: "benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json",
    sourceEvidence: "results/skill-ir/env-manager-public-contract-v3-development-evidence-2026-07-21/summary.json",
    methodFreeze: "benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json",
    replayDir: "results/skill-ir/env-manager-v4-deterministic-replay-run-2026-07-22",
    out: "results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/summary.json",
  };
  for (const arg of argv) {
    const [name, ...valueParts] = arg.split("=");
    const value = valueParts.join("=");
    if (!value) throw new Error(`Argument requires a value: ${arg}`);
    if (name === "--raw") args.raw = value;
    else if (name === "--tasks") args.tasks = value;
    else if (name === "--output-contract") args.outputContract = value;
    else if (name === "--lock") args.lock = value;
    else if (name === "--source-evidence") args.sourceEvidence = value;
    else if (name === "--method-freeze") args.methodFreeze = value;
    else if (name === "--replay-dir") args.replayDir = value;
    else if (name === "--out") args.out = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const FrozenFileSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const DeterministicReplayFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-v4-deterministic-replay-freeze/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  evidenceClass: z.literal("offline-development-replay"),
  sourceCatalog: z.literal("executable-public-contract-artifact/v3"),
  taskIds: z.array(z.string().min(1)).min(1),
  criterionIds: z.array(z.string().min(1)).min(1),
  inputs: z.object({
    tasks: FrozenFileSchema,
    scorer: FrozenFileSchema,
    raw: FrozenFileSchema,
    lock: FrozenFileSchema,
    sourceEvidence: FrozenFileSchema,
    outputContract: FrozenFileSchema,
  }).strict(),
  developmentLearnedRules: z.tuple([
    z.object({
      ruleId: z.literal("server-dsn-sensitive/v1"),
      sourceCriterion: z.literal("env-schema-rules"),
      status: z.literal("candidate"),
    }).strict(),
    z.object({
      ruleId: z.literal("signing-key-minimum-length/v1"),
      sourceCriterion: z.literal("env-schema-rules"),
      status: z.literal("candidate"),
    }).strict(),
  ]),
  claimBoundary: z.string().min(1),
}).strict();

export async function assertFrozenReplayFile(
  label: string,
  suppliedPath: string,
  frozen: z.infer<typeof FrozenFileSchema>,
): Promise<void> {
  if (
    resolve(suppliedPath) !== resolve(frozen.path)
    || await fileDigest(suppliedPath) !== frozen.sha256
  ) {
    throw new Error(`Replay method freeze ${label} input drift`);
  }
}

export type FrozenReplayIdentity = {
  skillId: string;
  system: RawAgentRunRow["system"];
  contexts: string[];
  agents: string[];
  environments: string[];
  taskIds: string[];
  repetitions: number;
  initialGenerationRows: number;
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  panelConfigId: string;
};

export function assertFrozenDevelopmentReplay(options: {
  rows: RawAgentRunRow[];
  tasks: Map<string, SkillIRBenchmarkTask>;
  identity: FrozenReplayIdentity;
}): void {
  const { rows, tasks, identity } = options;
  const lockedTasks = identity.taskIds.map((taskId) => tasks.get(taskId));
  if (lockedTasks.some((task) => !task || task.split !== "development")) {
    throw new Error("Replay tasks must be the frozen development task set");
  }
  if (rows.length !== identity.initialGenerationRows) {
    throw new Error("Replay raw row count does not match the frozen lock");
  }
  const rowIdentities = new Set<string>();
  const snapshotIdentities = new Set<string>();
  for (const row of rows) {
    const parsed = parseCaseId(row.caseId);
    const rowIdentity = `${parsed.task}:${row.runIndex}`;
    if (rowIdentities.has(rowIdentity)) {
      throw new Error(`Duplicate replay row identity: ${rowIdentity}`);
    }
    rowIdentities.add(rowIdentity);
    if (
      parsed.skill !== identity.skillId
      || !identity.agents.includes(parsed.agent)
      || !identity.environments.includes(parsed.environment)
      || !identity.contexts.includes(parsed.context)
      || !identity.taskIds.includes(parsed.task)
      || row.system !== identity.system
      || row.model !== identity.model
      || row.modelFamily !== identity.modelFamily
      || row.adapter !== identity.adapter
      || row.adapterVersion !== identity.adapterVersion
      || row.panelConfigId !== identity.panelConfigId
      || !row.runIndex
      || row.runIndex < 1
      || row.runIndex > identity.repetitions
    ) {
      throw new Error(`Replay raw row identity drift: ${row.caseId}`);
    }
    const snapshotIdentity = row.artifactRuntime?.preRepairSnapshot?.generationIdentity;
    if (snapshotIdentity) {
      if (snapshotIdentities.has(snapshotIdentity)) {
        throw new Error(`Duplicate replay snapshot identity: ${snapshotIdentity}`);
      }
      snapshotIdentities.add(snapshotIdentity);
    } else if ((row.runStatus ?? "ok") === "ok" && row.exitCode === 0) {
      throw new Error(`Successful replay source row is missing its snapshot: ${row.caseId}`);
    }
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function fileDigest(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

async function scoreWorkdir(
  source: RawAgentRunRow,
  workDir: string,
  tasks: Map<string, SkillIRBenchmarkTask>,
): Promise<ScoredAgentRunRow> {
  const row: RawAgentRunRow = {
    caseId: source.caseId,
    system: source.system,
    model: source.model,
    modelFamily: source.modelFamily,
    adapter: source.adapter,
    adapterVersion: source.adapterVersion,
    runIndex: source.runIndex,
    panelConfigId: source.panelConfigId,
    skillProvenance: source.skillProvenance,
    evidenceWeight: source.evidenceWeight,
    taskPath: source.taskPath,
    skillPath: source.skillPath,
    workDir,
    exitCode: 0,
    runStatus: "ok",
    durationMs: 0,
    stdout: "",
    stderr: "",
    successSource: "execution-only",
  };
  const [scored] = await scoreRawRunRows([row], tasks);
  if (!scored) throw new Error(`Scorer returned no row for ${source.caseId}`);
  return scored;
}

function scoreProjection(row: ScoredAgentRunRow): ScoreProjection {
  return {
    success: row.success,
    ...(row.evaluatorScore !== undefined ? { score: round4(row.evaluatorScore) } : {}),
    failedCriteria: row.failedCriteria,
    ...(row.failureType !== undefined ? { failureType: row.failureType } : {}),
    ...(row.failureStage !== undefined ? { failureStage: row.failureStage } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseDeterministicReplayArgs(process.argv.slice(2));
  const replayDir = resolve(args.replayDir);
  if (await lstat(replayDir).catch(() => undefined)) {
    throw new Error(`Replay directory already exists: ${replayDir}`);
  }

  const rawRows = await readJsonl<RawAgentRunRow>(args.raw);
  const taskSet = JSON.parse(await readFile(args.tasks, "utf8")) as TaskSet;
  const tasks = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const methodFreeze = DeterministicReplayFreezeSchema.parse(JSON.parse(
    await readFile(args.methodFreeze, "utf8"),
  ));
  const suppliedPaths = {
    tasks: args.tasks,
    raw: args.raw,
    lock: args.lock,
    sourceEvidence: args.sourceEvidence,
    outputContract: args.outputContract,
  };
  for (const [name, supplied] of Object.entries(suppliedPaths)) {
    const frozen = methodFreeze.inputs[name as keyof typeof suppliedPaths];
    await assertFrozenReplayFile(name, supplied, frozen);
  }
  await assertFrozenReplayFile("scorer", methodFreeze.inputs.scorer.path, methodFreeze.inputs.scorer);
  const actualCriterionIds = [...new Set(taskSet.tasks
    .filter((task) => methodFreeze.taskIds.includes(task.id))
    .flatMap((task) => (task.eval ?? []).map((criterion) => criterion.id).filter(
      (id): id is string => Boolean(id),
    )))].sort();
  if (
    JSON.stringify([...methodFreeze.taskIds].sort())
      !== JSON.stringify([...tasks.keys()].filter((id) => methodFreeze.taskIds.includes(id)).sort())
    || JSON.stringify(actualCriterionIds) !== JSON.stringify([...methodFreeze.criterionIds].sort())
  ) {
    throw new Error("Replay method freeze task or criterion registry drift");
  }
  const frozenLock = PublicContractArtifactDevelopmentLockSchema.parse(JSON.parse(
    await readFile(args.lock, "utf8"),
  ));
  const packageDir = resolve(frozenLock.package.path);
  await validateArtifactPackage({
    packageDir,
    expectedCatalog: "executable-public-contract-artifact/v3",
  });
  await readAndValidatePublicContractArtifactDevelopmentLock({
    rootDir: process.cwd(),
    lockPath: args.lock,
    packageDir,
    expected: {
      corpus: frozenLock.corpus,
      skillId: frozenLock.skillId,
      model: frozenLock.model.route,
      modelFamily: frozenLock.model.family,
      adapter: frozenLock.adapter.id,
      adapterVersion: frozenLock.adapter.version,
      repairMode: "one-repair",
      repetitions: frozenLock.matrix.repetitions,
      contexts: frozenLock.matrix.contexts,
      agents: frozenLock.matrix.agents,
      environments: frozenLock.matrix.environments,
      tasks: frozenLock.matrix.taskIds,
    },
  });
  const expectedOutputContractPath = resolve(
    packageDir,
    "artifacts/contracts/output-contract.json",
  );
  if (resolve(args.outputContract) !== expectedOutputContractPath) {
    throw new Error("Replay output contract is outside the frozen V3 package");
  }
  const sourceEvidence = JSON.parse(await readFile(args.sourceEvidence, "utf8")) as {
    catalog?: string;
    identity?: { panelConfigId?: string; tasks?: string[]; initialGenerationRows?: number };
    provenance?: { localRawSha256?: string; lockSha256?: string };
  };
  const rawSha256 = await fileDigest(args.raw);
  if (
    sourceEvidence.catalog !== frozenLock.catalog
    || sourceEvidence.provenance?.localRawSha256 !== rawSha256
    || sourceEvidence.provenance?.lockSha256 !== await fileDigest(args.lock)
  ) {
    throw new Error("Replay source evidence does not bind the frozen raw rows and lock");
  }
  if (
    JSON.stringify([...(sourceEvidence.identity?.tasks ?? [])].sort())
      !== JSON.stringify([...frozenLock.matrix.taskIds].sort())
    || sourceEvidence.identity?.initialGenerationRows !== frozenLock.matrix.initialGenerationRows
  ) {
    throw new Error("Replay source evidence matrix drift");
  }
  if (taskSet.skillId !== frozenLock.skillId) {
    throw new Error("Replay task set skill drift");
  }
  if (!sourceEvidence.identity?.panelConfigId) {
    throw new Error("Replay source evidence is missing panel identity");
  }
  assertFrozenDevelopmentReplay({
    rows: rawRows,
    tasks,
    identity: {
      skillId: frozenLock.skillId,
      system: frozenLock.matrix.system,
      contexts: frozenLock.matrix.contexts,
      agents: frozenLock.matrix.agents,
      environments: frozenLock.matrix.environments,
      taskIds: frozenLock.matrix.taskIds,
      repetitions: frozenLock.matrix.repetitions,
      initialGenerationRows: frozenLock.matrix.initialGenerationRows,
      model: frozenLock.model.route,
      modelFamily: frozenLock.model.family,
      adapter: frozenLock.adapter.id,
      adapterVersion: frozenLock.adapter.version,
      panelConfigId: sourceEvidence.identity.panelConfigId,
    },
  });
  const outputContract = JSON.parse(
    await readFile(args.outputContract, "utf8"),
  ) as PublicOutputContract;
  const completeRows = rawRows.filter((row) => row.artifactRuntime?.preRepairSnapshot);
  const infrastructureRows = rawRows.length - completeRows.length;
  const replays: ReplayRow[] = [];
  if (completeRows.length === 0) {
    throw new Error("Replay source contains no complete pre-repair snapshots");
  }

  await mkdir(replayDir, { recursive: true });
  for (const source of completeRows) {
    const snapshot = source.artifactRuntime!.preRepairSnapshot!;
    await verifyArtifactSnapshot(snapshot);
    const target = join(replayDir, snapshot.generationIdentity);
    await cp(snapshot.path, target, { recursive: true, errorOnExist: true, force: false });

    const runtimeContract = PublicRuntimeContractSchema.parse(JSON.parse(
      await readFile(join(target, ".skvm-artifact", "public-runtime-contract.json"), "utf8"),
    ));
    const runtimeContractSha256 = await fileDigest(
      join(target, ".skvm-artifact", "public-runtime-contract.json"),
    );
    const repairContract = buildEnvManagerExecutableRepairContract({
      taskContractDigest: runtimeContract.taskContractDigest,
      runtimeContractSha256,
      developmentEvidenceSha256: await fileDigest(args.sourceEvidence),
    });
    const learnedRuleIds = repairContract.schemaRulePolicy.learnedRules.map((rule) => rule.ruleId);
    if (JSON.stringify(learnedRuleIds) !== JSON.stringify(
      methodFreeze.developmentLearnedRules.map((rule) => rule.ruleId),
    )) {
      throw new Error("Replay method freeze learned rule registry drift");
    }
    const initialRuntime = await validatePublicContractOutputs({
      workDir: target,
      contract: runtimeContract,
      outputContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    const before = await scoreWorkdir(source, target, tasks);
    const repair = await repairEnvManagerArtifactsDeterministically({
      workDir: target,
      repairContract,
    });
    const finalRuntime = await validatePublicContractOutputs({
      workDir: target,
      contract: runtimeContract,
      outputContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    const after = await scoreWorkdir(source, target, tasks);

    replays.push({
      caseId: source.caseId,
      generationIdentity: snapshot.generationIdentity,
      snapshotSha256: snapshot.sha256,
      initialRuntimeStatus: initialRuntime.status,
      initialRuntimeCodes: [...new Set(initialRuntime.errors.map((error) => error.code))].sort(),
      finalRuntimeStatus: finalRuntime.status,
      finalRuntimeCodes: [...new Set(finalRuntime.errors.map((error) => error.code))].sort(),
      repairStatus: repair.status,
      repairOperations: repair.operations.map((operation) => operation.operation),
      protectedDigestStable: repair.protectedDigestBefore === repair.protectedDigestAfter,
      before: scoreProjection(before),
      after: scoreProjection(after),
    });
  }

  const sourceInfrastructure = rawRows
    .filter((row) => !row.artifactRuntime?.preRepairSnapshot)
    .map((row) => ({
      caseId: row.caseId,
      runIndex: row.runIndex,
      runStatus: row.runStatus ?? "ok",
      exitCode: row.exitCode,
      failureStage: row.artifactRuntime?.failureStage ?? "generation",
    }));
  const replayMeanBefore = round4(
    replays.reduce((sum, row) => sum + (row.before.score ?? 0), 0) / replays.length,
  );
  const replayMeanAfter = round4(
    replays.reduce((sum, row) => sum + (row.after.score ?? 0), 0) / replays.length,
  );
  const summary = {
    schemaVersion: "skill-ir-deterministic-repair-replay-summary/v1",
    catalog: "executable-contract-repair-artifact/v4",
    evidenceClass: "offline-development-replay",
    sourceCatalog: "executable-public-contract-artifact/v3",
    sourceRows: rawRows.length,
    replayedSnapshots: replays.length,
    infrastructureRows,
    replayOnly: {
      runtimePassAfterRepair: replays.filter((row) => row.finalRuntimeStatus === "pass").length,
      scorerSuccessBefore: replays.filter((row) => row.before.success).length,
      scorerSuccessAfter: replays.filter((row) => row.after.success).length,
      meanScoreBefore: replayMeanBefore,
      meanScoreAfter: replayMeanAfter,
    },
    sourceGenerationAccounting: {
      denominator: rawRows.length,
      postRepairSuccesses: replays.filter((row) => row.after.success).length,
      successRate: round4(replays.filter((row) => row.after.success).length / rawRows.length),
      gateCompatibleMeanIncludingInfrastructure: round4(
        replays.reduce((sum, row) => sum + (row.after.score ?? 0), 0) / rawRows.length,
      ),
      developmentGateEligible: infrastructureRows <= frozenLock.developmentGate.maximumInfrastructureFailures,
      infrastructure: sourceInfrastructure,
    },
    failedCriteriaAfter: [...new Set(replays.flatMap((row) => row.after.failedCriteria))].sort(),
    allProtectedDigestsStable: replays.every((row) => row.protectedDigestStable),
    claimBoundary: "Offline development replay only; no model run, package freeze, or optimization-success claim.",
    provenance: {
      rawPath: args.raw,
      rawSha256,
      tasksPath: args.tasks,
      tasksSha256: await fileDigest(args.tasks),
      outputContractPath: args.outputContract,
      outputContractSha256: await fileDigest(args.outputContract),
      lockPath: args.lock,
      lockSha256: await fileDigest(args.lock),
      sourceEvidencePath: args.sourceEvidence,
      sourceEvidenceSha256: await fileDigest(args.sourceEvidence),
      methodFreezePath: args.methodFreeze,
      methodFreezeSha256: await fileDigest(args.methodFreeze),
      implementation: await Promise.all([
        "src/benchmarks/skill-ir/executable-repair-contract.ts",
        "src/benchmarks/skill-ir/deterministic-artifact-repairer.ts",
        "src/benchmarks/skill-ir/deterministic-repair-replay-run.ts",
      ].map(async (path) => ({ path, sha256: await fileDigest(path) }))),
    },
    replays,
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    replayedSnapshots: summary.replayedSnapshots,
    runtimePassAfterRepair: summary.replayOnly.runtimePassAfterRepair,
    scorerSuccessAfter: summary.replayOnly.scorerSuccessAfter,
    infrastructureRows,
    out: args.out,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
