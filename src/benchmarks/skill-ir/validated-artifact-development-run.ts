import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseSafeRelativePath } from "./artifact-package";
import {
  buildValidatedArtifactDevelopmentPlan,
  type ValidatedArtifactDevelopmentPlan,
  type ValidatedArtifactDevelopmentPlanEntry,
} from "./validated-artifact-development";
import { ResourceContractSchema, runResourceProbe } from "./resource-contract";
import type { SkillIRBenchmarkTask, SkvmTaskJson } from "./real-agent";
import {
  scoreRawRunRows,
  type RawAgentRunRow,
  type ScoredAgentRunRow,
} from "./scoring";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

export type ValidatedArtifactDevelopmentPhase = "plan" | "artifact-execute";

export type ValidatedArtifactDevelopmentRunArgs = {
  phase: ValidatedArtifactDevelopmentPhase;
  rootDir: string;
  lockPath: string;
  outDir: string;
};

export type ValidatedArtifactCostRecord = {
  schemaVersion: "skill-ir-artifact-cost-accounting/v1";
  experimentId: string;
  scope: "artifact-development-direct-arm";
  compileCost: {
    status: "preexisting-frozen-package";
    durationMs: null;
  };
  profileCost: 0;
  researchDiagnosticCost: "reported-separately-not-production-input";
  modelGenerationTokens: number;
  modelRepairTokens: number;
  deterministicProcessDurationMs: number;
  validationDurationMs: number;
  packageBytes: number;
  breakEven: "not-computed-quality-gate-pending";
};

export type ValidatedArtifactDevelopmentExecution = {
  resourceProbe: Awaited<ReturnType<typeof runResourceProbe>>;
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
  cost: ValidatedArtifactCostRecord;
};

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

export function parseValidatedArtifactDevelopmentRunArgs(
  argv: string[],
): ValidatedArtifactDevelopmentRunArgs {
  const rootDir = resolve(requiredArg(argv, "root-dir", process.cwd()));
  const phase = requiredArg(argv, "phase", "plan");
  if (phase !== "plan" && phase !== "artifact-execute") {
    throw new Error(`Unsupported validated artifact development phase: ${phase}`);
  }
  return {
    phase,
    rootDir,
    lockPath: resolve(rootDir, requiredArg(
      argv,
      "lock",
      "benchmarks/skill-ir/pilots/law-to-markdown/"
        + "law-to-markdown-validated-artifact-development-lock.json",
    )),
    outDir: resolve(rootDir, requiredArg(
      argv,
      "out-dir",
      "results/skill-ir/law-to-markdown-validated-artifact-development-v1",
    )),
  };
}

function assertContained(root: string, relativePath: string): string {
  const safePath = parseSafeRelativePath(relativePath);
  const destination = resolve(root, safePath);
  const fromRoot = relative(resolve(root), destination);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Fixture escapes validated artifact workdir: ${relativePath}`);
  }
  return destination;
}

async function materializeFixtures(row: ValidatedArtifactDevelopmentPlanEntry): Promise<void> {
  await rm(row.workDir, { recursive: true, force: true });
  await mkdir(row.workDir, { recursive: true });
  const task = JSON.parse(await readFile(row.taskPath, "utf8")) as SkvmTaskJson;
  for (const [fixturePath, content] of Object.entries(task.fixtures ?? {})) {
    if (isAbsolute(fixturePath)) {
      throw new Error(`Absolute fixture path is forbidden: ${fixturePath}`);
    }
    const destination = assertContained(row.workDir, fixturePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

function runtimeExitCode(status: string): number {
  return status === "complete" ? 0 : 1;
}

export async function executeValidatedArtifactDevelopmentRows(opts: {
  rootDir: string;
  developmentPlan: ValidatedArtifactDevelopmentPlan;
  env?: Record<string, string | undefined>;
}): Promise<ValidatedArtifactDevelopmentExecution> {
  const { lock, package: packageRecord } = opts.developmentPlan;
  const resourceContract = ResourceContractSchema.parse(JSON.parse(await readFile(
    resolve(opts.rootDir, lock.frozenInputs.resourceContract.path),
    "utf8",
  )));
  const resourceProbe = await runResourceProbe(resourceContract, { env: opts.env });
  if (resourceProbe.status !== "ok") {
    throw new Error(`Validated artifact resource probe failed: ${resourceProbe.status}`);
  }

  const directRows = opts.developmentPlan.plan.filter(
    (row) => row.executionClass === "direct-deterministic",
  );
  if (directRows.length !== lock.matrix.expectedArtifactRows) {
    throw new Error("Validated artifact direct row count drift");
  }

  const rawRows: RawAgentRunRow[] = [];
  for (const row of directRows) {
    await materializeFixtures(row);
    const startedAt = performance.now();
    let runtime: Awaited<ReturnType<typeof runValidatedArtifactPlan>>;
    try {
      runtime = await runValidatedArtifactPlan({
        package: packageRecord,
        workDir: row.workDir,
        env: opts.env,
      });
    } catch {
      throw new Error(`Validated artifact runtime threw for ${row.caseId}#${row.runIndex}`);
    }
    const infrastructureFailure = runtime.status === "infrastructure-failure";
    rawRows.push({
      caseId: row.caseId,
      system: row.system,
      model: row.model,
      modelFamily: row.modelFamily,
      adapter: row.adapter,
      adapterVersion: row.adapterVersion,
      runIndex: row.runIndex,
      panelConfigId: row.panelConfigId,
      taskPath: row.taskPath,
      workDir: row.workDir,
      exitCode: runtimeExitCode(runtime.status),
      ...(infrastructureFailure ? { runStatus: "adapter-crashed" as const } : {}),
      durationMs: Math.round(performance.now() - startedAt),
      stdout: "final output: validated artifact direct execution complete",
      stderr: "",
      successSource: "execution-only",
      validatedArtifactRuntime: runtime,
    });
  }

  const registry = JSON.parse(await readFile(
    resolve(opts.rootDir, lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskRegistry;
  const taskById = new Map(registry.tasks.map((task) => [task.id, task]));
  const scoredRows = await scoreRawRunRows(rawRows, taskById);
  const cost: ValidatedArtifactCostRecord = {
    schemaVersion: "skill-ir-artifact-cost-accounting/v1",
    experimentId: lock.experimentId,
    scope: "artifact-development-direct-arm",
    compileCost: {
      status: "preexisting-frozen-package",
      durationMs: null,
    },
    profileCost: 0,
    researchDiagnosticCost: "reported-separately-not-production-input",
    modelGenerationTokens: rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.modelGenerationTokens ?? 0),
      0,
    ),
    modelRepairTokens: rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.modelRepairTokens ?? 0),
      0,
    ),
    deterministicProcessDurationMs: rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.deterministicProcessDurationMs ?? 0),
      0,
    ),
    validationDurationMs: rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.validationDurationMs ?? 0),
      0,
    ),
    packageBytes: packageRecord.packageBytes,
    breakEven: "not-computed-quality-gate-pending",
  };
  return { resourceProbe, rawRows, scoredRows, cost };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

export async function runValidatedArtifactDevelopmentPhase(
  args: ValidatedArtifactDevelopmentRunArgs,
): Promise<{
  planPath: string;
  execution?: ValidatedArtifactDevelopmentExecution;
}> {
  await mkdir(args.outDir, { recursive: true });
  const developmentPlan = await buildValidatedArtifactDevelopmentPlan({
    rootDir: args.rootDir,
    lockPath: args.lockPath,
    outDir: args.outDir,
  });
  const planPath = join(args.outDir, "plan.json");
  await writeJson(planPath, {
    schemaVersion: developmentPlan.schemaVersion,
    experimentId: developmentPlan.experimentId,
    methodEvidence: developmentPlan.methodEvidence,
    count: developmentPlan.plan.length,
    modelRows: developmentPlan.plan.filter((row) => row.executionClass === "model-agent").length,
    artifactRows: developmentPlan.plan.filter(
      (row) => row.executionClass === "direct-deterministic",
    ).length,
    plan: developmentPlan.plan,
  });
  if (args.phase === "plan") return { planPath };

  const execution = await executeValidatedArtifactDevelopmentRows({
    rootDir: args.rootDir,
    developmentPlan,
    env: process.env,
  });
  await Promise.all([
    writeJson(join(args.outDir, "resource-probe.json"), execution.resourceProbe),
    writeJsonl(join(args.outDir, "artifact-raw-runs.jsonl"), execution.rawRows),
    writeJsonl(join(args.outDir, "artifact-scored-runs.jsonl"), execution.scoredRows),
    writeJson(join(args.outDir, "artifact-cost.json"), execution.cost),
  ]);
  return { planPath, execution };
}

async function main(): Promise<void> {
  const result = await runValidatedArtifactDevelopmentPhase(
    parseValidatedArtifactDevelopmentRunArgs(process.argv.slice(2)),
  );
  console.log(JSON.stringify({
    planPath: result.planPath,
    executedArtifactRows: result.execution?.rawRows.length ?? 0,
    artifactSuccesses: result.execution?.scoredRows.filter((row) => row.success).length ?? 0,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
