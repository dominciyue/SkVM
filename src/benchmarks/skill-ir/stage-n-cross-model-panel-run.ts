import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types";
import { buildPlan, executeGenericPlanRow, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import {
  assertStageNMatrixDenied,
  buildStageNSmokeQualification,
  StageNSmokeRowSchema,
  type StageNCrossModelPanelLock,
  type StageNSmokeQualification,
  type StageNSmokeRow,
} from "./stage-n-cross-model-panel";
import { buildStageNPlanProjection, loadAndValidateStageNPlan, type StageNPlanProjection } from "./stage-n-cross-model-panel-plan";
import { sha256Bytes } from "./source-fixture";

export type StageNPhase = "plan" | "smoke" | "matrix";
export type StageNCrossModelPanelRunArgs = { rootDir: string; lockPath: string; outDir: string; phase: StageNPhase };

export function parseStageNCrossModelPanelRunArgs(argv: string[]): StageNCrossModelPanelRunArgs {
  let rootDir = process.cwd();
  let lockPath: string | undefined;
  let outDir: string | undefined;
  let phase: StageNPhase | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const candidate = arg.slice("--phase=".length);
      if (candidate !== "plan" && candidate !== "smoke" && candidate !== "matrix") throw new Error(`unsupported Stage N phase: ${candidate}`);
      phase = candidate;
    } else throw new Error(`unknown Stage N argument: ${arg}`);
  }
  if (!lockPath || !outDir || !phase) throw new Error("Stage N requires --lock, --out-dir, and --phase");
  return { rootDir: path.resolve(rootDir), lockPath: path.resolve(rootDir, lockPath), outDir: path.resolve(rootDir, outDir), phase };
}

export function assertStageNMatrixExecutionNotAuthorized(): never {
  return assertStageNMatrixDenied();
}

function managedRow(row: RealAgentRunPlanEntry, rootDir: string, lock: StageNCrossModelPanelLock): RealAgentRunPlanEntry {
  const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json");
  return {
    ...row,
    command: [
      process.execPath, "run", path.resolve(rootDir, "src/index.ts"), "run",
      ...row.command.slice(4).filter((arg) => !arg.startsWith("--adapter-config=") && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--idle-timeout-ms=") && !arg.startsWith("--max-steps=") && !arg.startsWith("--execution-observation=")),
      "--adapter-config=managed", `--timeout-ms=${lock.harness.absoluteTimeoutMs}`,
      `--idle-timeout-ms=${lock.harness.idleTimeoutMs}`, `--max-steps=${lock.harness.maxSteps}`,
      `--execution-observation=${observationPath}`,
    ],
  };
}

function smokeArgs(rootDir: string, outDir: string, lock: StageNCrossModelPanelLock, model: StageNCrossModelPanelLock["models"][number], skill: StageNCrossModelPanelLock["skills"][number]): RealAgentRunArgs {
  return {
    corpus: "pilot", model: model.route, modelFamily: model.family, adapter: lock.harness.adapter,
    adapterVersion: lock.harness.adapterVersion, repetitions: 1, panelConfigId: lock.experimentId,
    outDir: path.join(outDir, "smoke", model.family, skill.skillId), limit: 1, execute: false,
    retries: 0, retryDelayMs: 0, outerWatchdogMs: lock.harness.outerWatchdogMs, rootDir,
    allowTasksAuthored: false, allowDevelopmentReplay: false, allowArtifactDevelopmentReplay: false,
    skills: new Set([skill.skillId]), systems: new Set(["original"]), contexts: new Set([lock.harness.context]),
    agents: new Set(["skvm"]), environments: new Set([lock.harness.environment]), tasks: new Set([skill.taskIds[0]]),
    requireEnv: new Set(["SKVM_XTY_API_KEY"]),
  };
}

function classify(raw: Awaited<ReturnType<typeof executeGenericPlanRow>>, observation?: RunExecutionObservation): StageNSmokeRow["classification"] {
  if (raw.runStatus === "ok" && observation?.usage.available) return "semantic-complete";
  if (raw.runStatus === "timeout") return "active-absolute-timeout";
  if (raw.runStatus === "parse-failed") return "parser-incompatible";
  if (raw.exitCode !== 0) return "runtime-crash";
  return "qualification-failure";
}

async function executeSmokePlanRow(row: RealAgentRunPlanEntry, lock: StageNCrossModelPanelLock): Promise<StageNSmokeRow> {
  const raw = await executeGenericPlanRow(row, { outerWatchdogMs: lock.harness.outerWatchdogMs, exposeOuterTimedOut: true }, process.env);
  const observationArg = row.command.find((arg) => arg.startsWith("--execution-observation="));
  let observation: RunExecutionObservation | undefined;
  if (observationArg) {
    try { observation = RunExecutionObservationSchema.parse(JSON.parse(await readFile(observationArg.slice("--execution-observation=".length), "utf8"))); } catch { observation = undefined; }
  }
  const parts = row.caseId.split(":");
  const skillId = parts[0] as StageNSmokeRow["skillId"];
  const taskId = parts.at(-1)!;
  const classification = classify(raw, observation);
  return {
    family: row.modelFamily as StageNSmokeRow["family"], skillId, route: row.model, taskId,
    mode: "execute", status: classification === "semantic-complete" ? "complete" : "failed",
    usageAvailable: observation?.usage.available ?? false, classification, detail: raw.runStatus,
  };
}

export async function runStageNSmokeQualification(input: {
  rows: StageNSmokeRow[];
  executeRow?: (row: StageNSmokeRow) => Promise<StageNSmokeRow>;
}): Promise<Pick<StageNSmokeQualification, "expectedRows" | "observedRows" | "rows" | "eligibleFamilies" | "excludedFamilies" | "status">> {
  const rows = input.rows.map((row) => StageNSmokeRowSchema.parse(row));
  const executed: StageNSmokeRow[] = [];
  for (const row of rows) executed.push(row.mode === "execute" && input.executeRow ? await input.executeRow(row) : row);
  const families = ["gpt", "claude", "deepseek"] as const;
  const eligibleFamilies = families.filter((family) => executed.filter((row) => row.family === family).length === 2
    && executed.filter((row) => row.family === family).every((row) => row.status === "complete" && row.usageAvailable));
  return {
    expectedRows: 6, observedRows: executed.length, rows: executed,
    eligibleFamilies, excludedFamilies: families.filter((family) => !eligibleFamilies.includes(family)),
    status: executed.length === 6 && eligibleFamilies.length === 3 ? "passed" : "failed",
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildSmokeRows(rootDir: string, outDir: string, lock: StageNCrossModelPanelLock, projection: StageNPlanProjection): Promise<StageNSmokeRow[]> {
  const rows: StageNSmokeRow[] = [];
  for (const planned of projection.smokeRows) {
    if (planned.mode === "digest-bind") {
      rows.push({ ...planned, status: "complete", usageAvailable: true, classification: "semantic-complete", detail: "bound to existing C1/C2 original evidence; no GPT rerun" });
      continue;
    }
    const model = lock.models.find((item) => item.family === planned.family)!;
    const skill = lock.skills.find((item) => item.skillId === planned.skillId)!;
    const args = smokeArgs(rootDir, outDir, lock, model, skill);
    const plan = await buildPlan(args);
    if (plan.length !== 1) throw new Error(`Stage N smoke plan row mismatch: ${planned.family}/${planned.skillId}`);
    rows.push(await executeSmokePlanRow(managedRow(plan[0]!, rootDir, lock), lock));
  }
  return rows;
}

export async function runStageNCrossModelPanel(args: StageNCrossModelPanelRunArgs, env: Record<string, string | undefined> = process.env): Promise<unknown> {
  await mkdir(args.outDir, { recursive: true });
  const { lock, projection } = await loadAndValidateStageNPlan({ rootDir: args.rootDir, lockPath: args.lockPath, outDir: args.outDir });
  await writeJson(path.join(args.outDir, "plan.json"), projection);
  if (args.phase === "plan") return projection;
  if (args.phase === "matrix") return assertStageNMatrixExecutionNotAuthorized();
  const previousEnv = process.env;
  Object.assign(process.env, env);
  try {
    const rows = await buildSmokeRows(args.rootDir, args.outDir, lock, projection);
    const qualification = buildStageNSmokeQualification({ lock, lockSha256: projection.lockSha256, rows });
    await writeJson(path.join(args.outDir, "smoke-qualification.json"), qualification);
    return qualification;
  } finally {
    for (const key of Object.keys(env)) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

if (import.meta.main) {
  runStageNCrossModelPanel(parseStageNCrossModelPanelRunArgs(process.argv.slice(2)))
    .then((result) => {
      const status = typeof result === "object" && result !== null && "status" in result ? String(result.status) : "planned";
      console.log(JSON.stringify({ status }));
      if (status === "failed" || status === "blocked") process.exitCode = 1;
    })
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
