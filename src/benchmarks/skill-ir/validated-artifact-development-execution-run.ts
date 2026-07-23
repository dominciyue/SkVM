import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildValidatedArtifactDevelopmentPlan,
  type ValidatedArtifactDevelopmentLock,
  type ValidatedArtifactDevelopmentPlan,
  type ValidatedArtifactDevelopmentPlanEntry,
} from "./validated-artifact-development";
import {
  executeValidatedArtifactDevelopmentRows,
} from "./validated-artifact-development-run";
import {
  buildValidatedArtifactDevelopmentGateReport,
  type ValidatedArtifactDevelopmentGateReport,
} from "./validated-artifact-development-gate";
import {
  readAndValidateValidatedArtifactExecutionFreeze,
  type ValidatedArtifactExecutionFreeze,
} from "./validated-artifact-development-execution-freeze";
import { executePlan } from "./real-agent-run";
import {
  classifyProbeExecution,
  runCommandWithTimeout,
  type ProbeExecution,
} from "./route-probe";
import { ResourceContractSchema, runResourceProbe, type ResourceProbeResult } from "./resource-contract";
import {
  scoreRawRunRows,
  type RawAgentRunRow,
  type ScoredAgentRunRow,
} from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";
import { sha256Bytes } from "./source-fixture";
import { Sha256Schema } from "./artifact-package";

export type ValidatedArtifactExecutionPhase = "route-probe" | "execute";

export type ValidatedArtifactExecutionRunArgs = {
  rootDir: string;
  freezePath: string;
  outDir: string;
  phase: ValidatedArtifactExecutionPhase;
};

export const ValidatedArtifactRouteProbeResultSchema = z.object({
  schemaVersion: z.literal(
    "skill-ir-validated-artifact-development-route-probe-result/v1",
  ),
  experimentId: z.literal("law-to-markdown-validated-artifact-development-v1"),
  methodEvidence: z.literal(false),
  parentLockSha256: Sha256Schema,
  executionFreezeSha256: Sha256Schema,
  model: z.literal("xty/gpt-5.6-sol"),
  caseId: z.string().min(1),
  system: z.literal("original"),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict();

export type ValidatedArtifactRouteProbeResult = z.infer<
  typeof ValidatedArtifactRouteProbeResultSchema
>;

type TaskRegistry = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

function requiredArg(argv: string[], name: string, fallback?: string): string {
  const prefix = `--${name}=`;
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

export function parseValidatedArtifactExecutionRunArgs(
  argv: string[],
): ValidatedArtifactExecutionRunArgs {
  const known = new Set(["root-dir", "freeze", "out-dir", "phase"]);
  for (const arg of argv) {
    const name = arg.startsWith("--") ? (arg.slice(2).split("=", 1)[0] ?? "") : "";
    if (!known.has(name)) throw new Error(`Unknown argument: ${arg}`);
  }
  const rootDir = path.resolve(requiredArg(argv, "root-dir", process.cwd()));
  const phase = requiredArg(argv, "phase");
  if (phase !== "route-probe" && phase !== "execute") {
    throw new Error("--phase must be route-probe or execute");
  }
  return {
    rootDir,
    freezePath: path.resolve(rootDir, requiredArg(
      argv,
      "freeze",
      "benchmarks/skill-ir/pilots/law-to-markdown/"
        + "law-to-markdown-validated-artifact-execution-freeze.json",
    )),
    outDir: path.resolve(rootDir, requiredArg(argv, "out-dir")),
    phase,
  };
}

function expectedProbeCaseId(lock: ValidatedArtifactDevelopmentLock): string {
  return [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":");
}

export function compactValidatedArtifactRouteProbe(input: {
  experimentId: string;
  parentLockSha256: string;
  executionFreezeSha256: string;
  model: string;
  caseId: string;
  execution: ProbeExecution;
}): ValidatedArtifactRouteProbeResult {
  return ValidatedArtifactRouteProbeResultSchema.parse({
    schemaVersion: "skill-ir-validated-artifact-development-route-probe-result/v1",
    experimentId: input.experimentId,
    methodEvidence: false,
    parentLockSha256: input.parentLockSha256,
    executionFreezeSha256: input.executionFreezeSha256,
    model: input.model,
    caseId: input.caseId,
    system: "original",
    status: classifyProbeExecution(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  });
}

export function assertValidatedArtifactExecutionPrerequisites(opts: {
  freeze: ValidatedArtifactExecutionFreeze;
  parentLock: ValidatedArtifactDevelopmentLock;
  resource: ResourceProbeResult;
  route: ValidatedArtifactRouteProbeResult;
  env: Record<string, string | undefined>;
  parentLockSha256: string;
  executionFreezeSha256: string;
}): void {
  if (!opts.env[opts.parentLock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Validated artifact execution API key env ${opts.parentLock.runtime.apiKeyEnv} is missing`);
  }
  if (opts.resource.methodEvidence !== false || opts.resource.status !== "ok") {
    throw new Error("Validated artifact execution resource probe did not pass");
  }
  if (
    opts.route.methodEvidence !== false
    || opts.route.status !== "ok"
    || opts.route.experimentId !== opts.freeze.experimentId
    || opts.route.parentLockSha256 !== opts.parentLockSha256
    || opts.route.executionFreezeSha256 !== opts.executionFreezeSha256
    || opts.route.model !== opts.parentLock.model.route
    || opts.route.system !== "original"
    || opts.route.caseId !== expectedProbeCaseId(opts.parentLock)
  ) {
    throw new Error("Validated artifact execution route probe identity or status mismatch");
  }
}

export function partitionValidatedArtifactExecutionRows(
  plan: ValidatedArtifactDevelopmentPlan,
  freeze: ValidatedArtifactExecutionFreeze,
): {
  modelRows: ValidatedArtifactDevelopmentPlanEntry[];
  artifactRows: ValidatedArtifactDevelopmentPlanEntry[];
} {
  const modelRows = plan.plan.filter((row) => row.executionClass === "model-agent");
  const artifactRows = plan.plan.filter(
    (row) => row.executionClass === "direct-deterministic",
  );
  if (
    plan.plan.length !== freeze.matrix.expectedRows
    || modelRows.length !== freeze.matrix.expectedModelRows
    || artifactRows.length !== freeze.matrix.expectedArtifactRows
  ) {
    throw new Error("Validated artifact execution row partition drift");
  }
  return { modelRows, artifactRows };
}

export function toValidatedArtifactGateTasks(
  tasks: SkillIRBenchmarkTask[],
): Array<{ id: string; split: string; hardGateIds: string[] }> {
  return tasks.map((task) => {
    if (!Array.isArray(task.hardGateIds)) {
      throw new Error(`Validated artifact execution task ${task.id} omits hardGateIds`);
    }
    return {
      id: task.id,
      split: task.split,
      hardGateIds: task.hardGateIds,
    };
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function runResourcePreflight(
  rootDir: string,
  lock: ValidatedArtifactDevelopmentLock,
): Promise<ResourceProbeResult> {
  const contract = ResourceContractSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.frozenInputs.resourceContract.path),
    "utf8",
  )));
  return runResourceProbe(contract, { env: process.env });
}

function serializablePlan(plan: ValidatedArtifactDevelopmentPlan): Record<string, unknown> {
  return {
    schemaVersion: plan.schemaVersion,
    experimentId: plan.experimentId,
    methodEvidence: plan.methodEvidence,
    count: plan.plan.length,
    modelRows: plan.plan.filter((row) => row.executionClass === "model-agent").length,
    artifactRows: plan.plan.filter(
      (row) => row.executionClass === "direct-deterministic",
    ).length,
    plan: plan.plan,
  };
}

function compactSummary(
  report: ValidatedArtifactDevelopmentGateReport,
): Record<string, unknown> {
  return {
    schemaVersion: "skill-ir-validated-artifact-development-summary/v1",
    experimentId: report.experimentId,
    counts: report.counts,
    systems: report.systems,
    artifactTaskMeanScores: report.artifactTaskMeanScores,
    cost: report.cost,
    gate: report.gate,
    heldOutPermitted: false,
  };
}

export async function runValidatedArtifactDevelopmentExecutionPhase(
  args: ValidatedArtifactExecutionRunArgs,
): Promise<Record<string, unknown>> {
  await mkdir(args.outDir, { recursive: true });
  const freezeBytes = await readFile(args.freezePath);
  const executionFreezeSha256 = sha256Bytes(freezeBytes);
  const validated = await readAndValidateValidatedArtifactExecutionFreeze({
    rootDir: args.rootDir,
    freezePath: args.freezePath,
  });
  const { freeze, parent } = validated;
  const parentLockPath = path.resolve(args.rootDir, freeze.parentLock.path);
  const parentLockSha256 = sha256Bytes(await readFile(parentLockPath));
  const developmentPlan = await buildValidatedArtifactDevelopmentPlan({
    rootDir: args.rootDir,
    lockPath: parentLockPath,
    outDir: path.join(args.outDir, "run"),
  });
  const partition = partitionValidatedArtifactExecutionRows(developmentPlan, freeze);
  const planPath = path.join(args.outDir, "plan.json");
  await writeJson(planPath, serializablePlan(developmentPlan));

  const resource = await runResourcePreflight(args.rootDir, parent.lock);
  const resourcePath = path.join(args.outDir, "resource-probe.json");
  await writeJson(resourcePath, resource);
  if (!process.env[parent.lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(
      `Validated artifact execution API key env ${parent.lock.runtime.apiKeyEnv} is missing`,
    );
  }
  if (resource.status !== "ok") {
    throw new Error("Validated artifact execution resource probe did not pass");
  }

  if (args.phase === "route-probe") {
    const probeRow = partition.modelRows.find((row) =>
      row.system === "original"
      && row.caseId === expectedProbeCaseId(parent.lock)
      && row.runIndex === 1);
    if (!probeRow) throw new Error("Validated artifact execution route probe row is missing");
    const execution = await runCommandWithTimeout(
      probeRow.command,
      freeze.runtime.routeProbeTimeoutMs,
    );
    const route = compactValidatedArtifactRouteProbe({
      experimentId: freeze.experimentId,
      parentLockSha256,
      executionFreezeSha256,
      model: parent.lock.model.route,
      caseId: probeRow.caseId,
      execution,
    });
    const routePath = path.join(args.outDir, "route-probe.json");
    await writeJson(routePath, route);
    if (route.status !== "ok") {
      throw new Error(`Validated artifact execution route probe failed: ${route.status}`);
    }
    return {
      experimentId: freeze.experimentId,
      phase: args.phase,
      resource,
      route,
      routePath,
      planPath,
    };
  }

  const route = ValidatedArtifactRouteProbeResultSchema.parse(JSON.parse(
    await readFile(path.join(args.outDir, "route-probe.json"), "utf8"),
  ));
  assertValidatedArtifactExecutionPrerequisites({
    freeze,
    parentLock: parent.lock,
    resource,
    route,
    env: process.env,
    parentLockSha256,
    executionFreezeSha256,
  });

  await executePlan(partition.modelRows, {
    ...developmentPlan.modelRunArgs,
    execute: true,
    outDir: path.join(args.outDir, "run"),
  });
  const modelRawRows = await readJsonl<RawAgentRunRow>(
    path.join(args.outDir, "run", "raw-runs.jsonl"),
  );
  if (modelRawRows.length !== freeze.matrix.expectedModelRows) {
    throw new Error("Validated artifact execution model raw row count drift");
  }
  const direct = await executeValidatedArtifactDevelopmentRows({
    rootDir: args.rootDir,
    developmentPlan,
    env: process.env,
  });
  const registry = JSON.parse(await readFile(
    path.resolve(args.rootDir, parent.lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskRegistry;
  if (registry.skillId !== parent.lock.skillId) {
    throw new Error("Validated artifact execution task registry skill drift");
  }
  const taskById = new Map(registry.tasks.map((task) => [task.id, task]));
  const modelScoredRows = await scoreRawRunRows(modelRawRows, taskById);
  const rawRows = [...modelRawRows, ...direct.rawRows];
  const scoredRows: ScoredAgentRunRow[] = [...modelScoredRows, ...direct.scoredRows];
  if (
    rawRows.length !== freeze.matrix.expectedRows
    || scoredRows.length !== freeze.matrix.expectedRows
  ) {
    throw new Error("Validated artifact execution combined row count drift");
  }
  const gate = buildValidatedArtifactDevelopmentGateReport({
    lock: parent.lock,
    tasks: toValidatedArtifactGateTasks(registry.tasks),
    rawRows,
    scoredRows,
  });
  const summary = compactSummary(gate);
  await Promise.all([
    writeJsonl(path.join(args.outDir, "raw-runs.jsonl"), rawRows),
    writeJsonl(path.join(args.outDir, "scored-results.jsonl"), scoredRows),
    writeJson(path.join(args.outDir, "artifact-cost.json"), direct.cost),
    writeJson(path.join(args.outDir, "gate-report.json"), gate),
    writeJson(path.join(args.outDir, "summary.json"), summary),
  ]);
  return {
    experimentId: freeze.experimentId,
    phase: args.phase,
    rows: rawRows.length,
    gatePassed: gate.gate.passed,
    gatePath: path.join(args.outDir, "gate-report.json"),
    summaryPath: path.join(args.outDir, "summary.json"),
  };
}

if (import.meta.main) {
  runValidatedArtifactDevelopmentExecutionPhase(
    parseValidatedArtifactExecutionRunArgs(process.argv.slice(2)),
  ).then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
