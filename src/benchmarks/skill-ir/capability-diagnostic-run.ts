import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  readAndValidateCapabilityDiagnosticLock,
  type CapabilityDiagnosticLock,
} from "./capability-diagnostic";
import {
  buildPlan,
  type RealAgentRunArgs,
} from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import type { ExperimentSystem } from "./matrix";

export type CapabilityDiagnosticRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
};

export type CapabilityDiagnosticPlanGroup = {
  label: "baseline" | "check-only" | "one-repair";
  expectedRows: number;
  args: RealAgentRunArgs;
  plan: RealAgentRunPlanEntry[];
};

export type CapabilityDiagnosticPlan = {
  schemaVersion: "skill-ir-capability-diagnostic-plan/v1";
  diagnosticId: string;
  execute: false;
  totalRows: number;
  groups: CapabilityDiagnosticPlanGroup[];
};

function commonArgs(
  lock: CapabilityDiagnosticLock,
  rootDir: string,
  outDir: string,
): Omit<RealAgentRunArgs, "adapterVersion" | "limit" | "outDir"> {
  return {
    corpus: lock.corpus,
    model: lock.model.diagnosticRoute,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    repetitions: lock.matrix.repetitions,
    execute: false,
    retries: 1,
    retryDelayMs: 1000,
    rootDir,
    skills: new Set([lock.skillId]),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
}

function buildGroupArgs(
  lock: CapabilityDiagnosticLock,
  rootDir: string,
  outDir: string,
): Array<{
  label: CapabilityDiagnosticPlanGroup["label"];
  expectedRows: number;
  args: RealAgentRunArgs;
}> {
  const common = commonArgs(lock, rootDir, outDir);
  const packageDir = resolve(rootDir, lock.frozenInputs.package.path);
  const runnerLockPath = resolve(rootDir, lock.runnerArtifactLock.path);
  return [
    {
      label: "baseline",
      expectedRows: lock.matrix.baselineRows,
      args: {
        ...common,
        adapterVersion: lock.adapter.baselineVersion,
        panelConfigId: `${lock.diagnosticId}-baseline`,
        outDir: join(outDir, "baseline"),
        limit: lock.matrix.baselineRows,
        systems: new Set(["no-skill", "original", "ir-static"]),
      },
    },
    ...(["check-only", "one-repair"] as const).map((mode) => ({
      label: mode,
      expectedRows: mode === "check-only" ? lock.matrix.checkOnlyRows : lock.matrix.oneRepairRows,
      args: {
        ...common,
        adapterVersion: lock.adapter.artifactVersion,
        panelConfigId: `${lock.diagnosticId}-${mode}`,
        outDir: join(outDir, mode),
        limit: mode === "check-only" ? lock.matrix.checkOnlyRows : lock.matrix.oneRepairRows,
        systems: new Set<ExperimentSystem>(["ir-artifact-dev"]),
        allowArtifactDevelopmentReplay: true,
        artifactPackageDir: packageDir,
        artifactLockPath: runnerLockPath,
        artifactRepairMode: mode,
      },
    })),
  ];
}

export async function buildCapabilityDiagnosticPlans(
  opts: CapabilityDiagnosticRunArgs,
): Promise<CapabilityDiagnosticPlan> {
  const rootDir = resolve(opts.rootDir);
  const outDir = isAbsolute(opts.outDir) ? resolve(opts.outDir) : resolve(rootDir, opts.outDir);
  const lockPath = isAbsolute(opts.lockPath) ? resolve(opts.lockPath) : resolve(rootDir, opts.lockPath);
  const lock = await readAndValidateCapabilityDiagnosticLock({ rootDir, lockPath });
  const groups: CapabilityDiagnosticPlanGroup[] = [];
  for (const group of buildGroupArgs(lock, rootDir, outDir)) {
    const plan = await buildPlan(group.args);
    if (plan.length !== group.expectedRows) {
      throw new Error(
        `Capability diagnostic ${group.label} row mismatch: expected ${group.expectedRows}, got ${plan.length}`,
      );
    }
    if (plan.some((row) => row.model !== lock.model.diagnosticRoute)) {
      throw new Error(`Capability diagnostic ${group.label} model drift`);
    }
    groups.push({ ...group, plan });
  }
  const totalRows = groups.reduce((sum, group) => sum + group.plan.length, 0);
  if (totalRows !== lock.matrix.totalRows) {
    throw new Error(`Capability diagnostic total row mismatch: expected ${lock.matrix.totalRows}, got ${totalRows}`);
  }
  return {
    schemaVersion: "skill-ir-capability-diagnostic-plan/v1",
    diagnosticId: lock.diagnosticId,
    execute: false,
    totalRows,
    groups,
  };
}

function jsonArgs(args: RealAgentRunArgs): Record<string, unknown> {
  return {
    ...args,
    skills: args.skills ? [...args.skills] : undefined,
    systems: args.systems ? [...args.systems] : undefined,
    contexts: args.contexts ? [...args.contexts] : undefined,
    agents: args.agents ? [...args.agents] : undefined,
    environments: args.environments ? [...args.environments] : undefined,
    tasks: args.tasks ? [...args.tasks] : undefined,
    requireEnv: args.requireEnv ? [...args.requireEnv] : undefined,
  };
}

export async function writeCapabilityDiagnosticPlan(
  opts: CapabilityDiagnosticRunArgs,
): Promise<CapabilityDiagnosticPlan & { planPath: string }> {
  const result = await buildCapabilityDiagnosticPlans(opts);
  const outDir = isAbsolute(opts.outDir) ? resolve(opts.outDir) : resolve(opts.rootDir, opts.outDir);
  await mkdir(outDir, { recursive: true });
  const planPath = join(outDir, "diagnostic-plan.json");
  await writeFile(
    planPath,
    `${JSON.stringify({
      ...result,
      groups: result.groups.map((group) => ({
        ...group,
        args: jsonArgs(group.args),
      })),
    }, null, 2)}\n`,
    "utf8",
  );
  return { ...result, planPath };
}

export function parseCapabilityDiagnosticRunArgs(argv: string[]): CapabilityDiagnosticRunArgs {
  let rootDir = process.cwd();
  let lockPath: string | undefined;
  let outDir: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length);
    else throw new Error(`Unknown argument; execute is intentionally unsupported: ${arg}`);
  }
  if (!lockPath) throw new Error("--lock is required");
  if (!outDir) throw new Error("--out-dir is required");
  return { rootDir, lockPath, outDir };
}

if (import.meta.main) {
  writeCapabilityDiagnosticPlan(parseCapabilityDiagnosticRunArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        diagnosticId: result.diagnosticId,
        totalRows: result.totalRows,
        planPath: result.planPath,
        executed: false,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
