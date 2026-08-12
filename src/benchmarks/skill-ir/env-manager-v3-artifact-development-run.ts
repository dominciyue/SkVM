import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { parseSafeRelativePath } from "./artifact-package";
import {
  buildEnvManagerV3ArtifactDevelopmentGateReport,
  buildEnvManagerV3ArtifactDevelopmentPlan,
  type EnvManagerV3ArtifactDevelopmentPlan,
  type EnvManagerV3ArtifactDevelopmentPlanEntry,
} from "./env-manager-v3-artifact-development";
import { assertRequiredEnv, executePlan } from "./real-agent-run";
import type { SkillIRBenchmarkTask, SkvmTaskJson } from "./real-agent";
import { ResourceContractSchema, runResourceProbe } from "./resource-contract";
import { runCommandWithTimeout } from "./route-probe";
import { scoreRawRunRows, type RawAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

export type EnvManagerV3ArtifactDevelopmentPhase = "plan" | "qualification" | "execute";

export type EnvManagerV3ArtifactDevelopmentRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: EnvManagerV3ArtifactDevelopmentPhase;
};

const OutputPathSchema = z.enum([".env.example", ".env.schema.json", "env-report.json"]);

export const EnvManagerV3ArtifactDevelopmentQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-v3-artifact-development-qualification/v1"),
  experimentId: z.literal("env-manager-v3-validated-artifact-development-v1"),
  lockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["passed", "failed"]),
  localPi: z.object({
    status: z.enum(["passed", "failed"]), observedVersion: z.string(),
    exitCode: z.number().int().optional(), timedOut: z.boolean(),
  }).strict(),
  resourceProbe: z.object({
    status: z.enum(["ok", "failed", "unavailable"]), requiredModules: z.array(z.string()),
  }).strict(),
  route: z.object({
    caseId: z.string().min(1), exitCode: z.number().int(), runStatus: z.string(),
    outputs: z.object({
      declared: z.literal(3), present: z.number().int().min(0).max(3), missing: z.array(OutputPathSchema),
    }).strict(),
    harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
  }).strict().nullable(),
}).strict();

export type EnvManagerV3ArtifactDevelopmentQualification = z.infer<
  typeof EnvManagerV3ArtifactDevelopmentQualificationSchema
>;

function qualificationRow(plan: EnvManagerV3ArtifactDevelopmentPlan): EnvManagerV3ArtifactDevelopmentPlanEntry {
  const matches = plan.plan.filter((row) => row.executionClass === "model-agent"
    && row.system === plan.lock.qualification.system
    && row.runIndex === plan.lock.qualification.runIndex
    && row.caseId.endsWith(`:${plan.lock.qualification.taskId}`));
  if (matches.length !== 1) throw new Error(`Env Manager v3 artifact qualification requires one row, got ${matches.length}`);
  return matches[0]!;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim())
    .filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function inspectOutputs(workDir: string) {
  const declared = [".env.example", ".env.schema.json", "env-report.json"] as const;
  const missing: Array<typeof declared[number]> = [];
  for (const relativePath of declared) {
    try {
      const stat = await lstat(path.join(workDir, relativePath));
      if (!stat.isFile() || stat.isSymbolicLink()) missing.push(relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      missing.push(relativePath);
    }
  }
  return { declared: 3 as const, present: declared.length - missing.length, missing };
}

async function harnessResidue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
  const found: Array<"AGENTS.md" | ".pi-skills"> = [];
  for (const name of ["AGENTS.md", ".pi-skills"] as const) {
    try { await lstat(path.join(workDir, name)); found.push(name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return found;
}

function assertContained(root: string, relativePath: string): string {
  const safe = parseSafeRelativePath(relativePath);
  const destination = path.resolve(root, safe);
  const relative = path.relative(path.resolve(root), destination);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Env Manager v3 fixture escapes workdir: ${relativePath}`);
  }
  return destination;
}

async function materializeDirectRow(row: EnvManagerV3ArtifactDevelopmentPlanEntry): Promise<SkvmTaskJson> {
  await rm(row.workDir, { recursive: true, force: true });
  await mkdir(row.workDir, { recursive: true });
  const task = JSON.parse(await readFile(row.taskPath, "utf8")) as SkvmTaskJson;
  for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
    const destination = assertContained(row.workDir, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  return task;
}

async function executeDirectRows(
  plan: EnvManagerV3ArtifactDevelopmentPlan,
  env: Record<string, string | undefined>,
): Promise<RawAgentRunRow[]> {
  const rows: RawAgentRunRow[] = [];
  for (const row of plan.plan.filter((entry) => entry.executionClass === "direct-deterministic")) {
    await materializeDirectRow(row);
    const manifestPath = path.join(path.dirname(row.workDir), "initial-workdir-manifest.json");
    const initialWorkdirManifest = await writeInitialWorkdirManifest({ workDir: row.workDir, manifestPath });
    const startedAt = performance.now();
    const runtime = await runValidatedArtifactPlan({
      package: plan.packages[row.artifactVariantId!], workDir: row.workDir, env,
    });
    const infrastructureFailure = runtime.status === "infrastructure-failure";
    rows.push({
      caseId: row.caseId, system: row.system, model: row.model, modelFamily: row.modelFamily,
      adapter: row.adapter, adapterVersion: row.adapterVersion, runIndex: row.runIndex,
      panelConfigId: row.panelConfigId, taskPath: row.taskPath, workDir: row.workDir,
      initialWorkdirManifest, exitCode: runtime.status === "complete" ? 0 : 1,
      runStatus: infrastructureFailure ? "adapter-crashed" : "ok",
      durationMs: Math.round(performance.now() - startedAt),
      stdout: "final output: validated artifact direct execution complete",
      stderr: infrastructureFailure ? "validated artifact infrastructure failure" : "",
      successSource: "execution-only", validatedArtifactRuntime: runtime,
    });
  }
  return rows;
}

function planProjection(plan: EnvManagerV3ArtifactDevelopmentPlan) {
  return {
    schemaVersion: plan.schemaVersion, experimentId: plan.experimentId, methodEvidence: plan.methodEvidence,
    count: plan.plan.length,
    modelRows: plan.plan.filter((row) => row.executionClass === "model-agent").length,
    artifactRows: plan.plan.filter((row) => row.executionClass === "direct-deterministic").length,
    plan: plan.plan,
  };
}

async function lockDigest(lockPath: string): Promise<string> {
  return sha256Bytes(await readFile(lockPath));
}

async function qualify(
  args: EnvManagerV3ArtifactDevelopmentRunArgs,
  plan: EnvManagerV3ArtifactDevelopmentPlan,
  env: Record<string, string | undefined>,
): Promise<EnvManagerV3ArtifactDevelopmentQualification> {
  assertRequiredEnv(plan.modelRunArgs, env);
  const node = Bun.which(plan.lock.harness.nodeCommand);
  if (!node) throw new Error("Env Manager v3 qualification Node executable unavailable");
  const version = await runCommandWithTimeout([
    node, path.resolve(args.rootDir, plan.lock.harness.piCli.path), "--version",
  ], 30_000, env);
  const observedVersion = version.stdout.trim() || version.stderr.trim();
  const localPi = {
    status: version.exitCode === 0 && !version.timedOut && observedVersion === plan.lock.harness.adapterVersion
      ? "passed" as const : "failed" as const,
    observedVersion, ...(version.exitCode !== undefined ? { exitCode: version.exitCode } : {}), timedOut: version.timedOut,
  };
  const resource = ResourceContractSchema.parse(JSON.parse(await readFile(
    path.resolve(args.rootDir, plan.lock.frozenInputs.resourceContract.path), "utf8",
  )));
  const probed = await runResourceProbe(resource, { env });
  const resourceProbe = { status: probed.status, requiredModules: probed.requiredModules };
  let route: EnvManagerV3ArtifactDevelopmentQualification["route"] = null;
  if (localPi.status === "passed" && resourceProbe.status === "ok") {
    const selected = qualificationRow(plan);
    await executePlan([selected], plan.modelRunArgs, env);
    const rawRows = await readJsonl<RawAgentRunRow>(path.join(plan.modelRunArgs.outDir, "raw-runs.jsonl"));
    if (rawRows.length !== 1) throw new Error(`Env Manager v3 qualification expected one row, got ${rawRows.length}`);
    route = {
      caseId: rawRows[0]!.caseId, exitCode: rawRows[0]!.exitCode, runStatus: rawRows[0]!.runStatus ?? "ok",
      outputs: await inspectOutputs(selected.workDir), harnessResidue: await harnessResidue(selected.workDir),
    };
  }
  const passed = localPi.status === "passed" && resourceProbe.status === "ok" && route !== null
    && route.exitCode === 0 && route.runStatus === "ok" && route.outputs.present === route.outputs.declared
    && route.outputs.missing.length === 0 && route.harnessResidue.length === 0;
  return EnvManagerV3ArtifactDevelopmentQualificationSchema.parse({
    schemaVersion: "skill-ir-env-manager-v3-artifact-development-qualification/v1",
    experimentId: plan.lock.experimentId, lockSha256: await lockDigest(args.lockPath),
    status: passed ? "passed" : "failed", localPi, resourceProbe, route,
  });
}

export async function runEnvManagerV3ArtifactDevelopment(
  args: EnvManagerV3ArtifactDevelopmentRunArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  const rootDir = path.resolve(args.rootDir), outDir = path.resolve(args.outDir), lockPath = path.resolve(args.lockPath);
  await mkdir(outDir, { recursive: true });
  if (args.phase === "qualification") {
    const qualificationDir = path.join(outDir, "qualification");
    const plan = await buildEnvManagerV3ArtifactDevelopmentPlan({ rootDir, lockPath, outDir: qualificationDir });
    await mkdir(qualificationDir, { recursive: true });
    await writeJson(path.join(qualificationDir, "plan.json"), planProjection(plan));
    const report = await qualify({ ...args, rootDir, outDir, lockPath }, plan, { ...env, SKVM_AUTO_PROBE: "0" });
    await writeJson(path.join(outDir, "qualification.json"), report);
    return report;
  }
  const plan = await buildEnvManagerV3ArtifactDevelopmentPlan({ rootDir, lockPath, outDir });
  await writeJson(path.join(outDir, "plan.json"), planProjection(plan));
  if (args.phase === "plan") return planProjection(plan);
  const qualification = EnvManagerV3ArtifactDevelopmentQualificationSchema.parse(JSON.parse(await readFile(
    path.join(outDir, "qualification.json"), "utf8",
  )));
  if (qualification.status !== "passed" || qualification.lockSha256 !== await lockDigest(lockPath)) {
    throw new Error("Env Manager v3 artifact development qualification is absent, failed, or stale");
  }
  const childEnv = { ...env, SKVM_AUTO_PROBE: "0" };
  assertRequiredEnv(plan.modelRunArgs, childEnv);
  await executePlan(plan.plan.filter((row) => row.executionClass === "model-agent"), plan.modelRunArgs, childEnv);
  const modelRaw = await readJsonl<RawAgentRunRow>(path.join(plan.modelRunArgs.outDir, "raw-runs.jsonl"));
  const rawRows = [...modelRaw, ...await executeDirectRows(plan, childEnv)];
  const registry = JSON.parse(await readFile(path.resolve(rootDir, plan.lock.frozenInputs.tasks.path), "utf8")) as { tasks: SkillIRBenchmarkTask[] };
  const taskById = new Map(registry.tasks.map((task) => [task.id, task]));
  const scoredRows = await scoreRawRunRows(rawRows, taskById);
  const gate = buildEnvManagerV3ArtifactDevelopmentGateReport({
    lock: plan.lock,
    tasks: registry.tasks.map((task) => ({ id: task.id, split: task.split, hardGateIds: task.hardGateIds ?? [] })),
    rawRows, scoredRows,
  });
  await Promise.all([
    writeJsonl(path.join(outDir, "raw-runs.jsonl"), rawRows),
    writeJsonl(path.join(outDir, "scored-runs.jsonl"), scoredRows),
    writeJson(path.join(outDir, "gate-report.json"), gate),
  ]);
  return gate;
}

export function parseEnvManagerV3ArtifactDevelopmentRunArgs(argv: string[]): EnvManagerV3ArtifactDevelopmentRunArgs {
  let rootDir = process.cwd(), lockPath: string | undefined, outDir: string | undefined;
  let phase: EnvManagerV3ArtifactDevelopmentPhase | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice(11);
    else if (arg.startsWith("--lock=")) lockPath = arg.slice(7);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice(10);
    else if (arg.startsWith("--phase=")) {
      const candidate = arg.slice(8);
      if (candidate !== "plan" && candidate !== "qualification" && candidate !== "execute") {
        throw new Error(`Unsupported Env Manager v3 artifact development phase: ${candidate}`);
      }
      phase = candidate;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!lockPath || !outDir || !phase) throw new Error("--lock, --out-dir, and --phase are required");
  return {
    rootDir: path.resolve(rootDir), lockPath: path.resolve(rootDir, lockPath),
    outDir: path.resolve(rootDir, outDir), phase,
  };
}

if (import.meta.main) {
  runEnvManagerV3ArtifactDevelopment(parseEnvManagerV3ArtifactDevelopmentRunArgs(process.argv.slice(2)))
    .then((result) => {
      const status = typeof result === "object" && result !== null && "status" in result
        ? String(result.status)
        : typeof result === "object" && result !== null && "gate" in result
          ? String((result as { gate: { passed: boolean } }).gate.passed ? "passed" : "failed") : "planned";
      console.log(JSON.stringify({ status }, null, 2));
      if (status === "failed") process.exitCode = 1;
    }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
