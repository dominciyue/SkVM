import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isPidAlive, withFileLock } from "../../core/file-lock";
import type { ExecutionEnvelope } from "./execution-resilience";
import {
  claimResilientWorker,
  failResilientRun,
  initializeResilientRun,
  markResilientAttemptDispatched,
  prepareNextResilientAttempt,
  readResilientPrefix,
  readResilientRunState,
  reconcileResilientRun,
  recordResilientTerminal,
  ResilientQualificationReportSchema,
  type ResilientTerminalRecord,
  type ResilientAttempt,
  type ResilientRunState,
} from "./reviewed-aot-efficiency-resilient";
import {
  ReviewedAotEfficiencyPolicySchema,
  ReviewedAotEfficiencyRowSchema,
  buildReviewedAotBundle,
  buildReviewedAotOriginalPlan,
  executeReviewedAotRow,
  validateReviewedAotEfficiencyPolicy,
  type ReviewedAotEfficiencyRow,
} from "./reviewed-aot-efficiency-matrix";
import {
  RESILIENT_EFFICIENCY_FREEZE_PATH,
  RESILIENT_EFFICIENCY_POLICY_PATH,
  ResilientEfficiencyFreezeSchema,
  ResilientEfficiencyPolicySchema,
  validateResilientEfficiencyFreeze,
  validateResilientEfficiencyPolicy,
  writeResilientEfficiencyFreezeArtifacts,
} from "./reviewed-aot-efficiency-resilient-policy";
import { executeProspectiveDevelopmentRow } from "./prospective-development-run";
import type { ProspectiveDevelopmentLock, ProspectiveDevelopmentPlan } from "./prospective-development";
import { scoreRawRunRows, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";
import { sha256Bytes } from "./source-fixture";

type Handshake =
  | { kind: "ready"; workerPid: number }
  | { kind: "error"; message: string };

const WorkerInputSchema = z.object({
  mode: z.literal("qualification"),
  runDir: z.string().min(1),
  identityDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  rows: z.array(ReviewedAotEfficiencyRowSchema).length(2),
  startDelayMs: z.number().int().min(0).max(5_000),
}).strict();
type WorkerInput = z.infer<typeof WorkerInputSchema>;

const MatrixWorkerInputSchema = z.object({
  mode: z.literal("matrix"),
  rootDir: z.string().min(1),
  runDir: z.string().min(1),
  identityDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
type MatrixWorkerInput = z.infer<typeof MatrixWorkerInputSchema>;

type PrefixEntry = {
  row: ReviewedAotEfficiencyRow;
  raw: RawAgentRunRow;
  scored: ScoredAgentRunRow;
  originalEnvelope: ExecutionEnvelope | null;
  scorerDurationMs: number;
};

const QUALIFICATION_IDENTITY_DIGEST = "a".repeat(64);
const QUALIFICATION_PLAN_DIGEST = "b".repeat(64);
const QUALIFICATION_ROWS: ReviewedAotEfficiencyRow[] = [
  { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "original", paid: true },
  { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "reviewed-aot", paid: false },
];

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function now(): string {
  return new Date().toISOString();
}

export async function runResilientRowLoop(options: {
  runDir: string;
  identityDigest: string;
  planDigest: string;
  rows: ReviewedAotEfficiencyRow[];
  executeRow: (attempt: ResilientAttempt) => Promise<{
    usageAuthority: ResilientTerminalRecord["usageAuthority"];
    entry: unknown;
    stopAfterTerminal: boolean;
    failure?: string;
  }>;
}): Promise<ResilientRunState> {
  for (;;) {
    let state = await reconcileResilientRun({
      runDir: options.runDir, identityDigest: options.identityDigest, planDigest: options.planDigest,
      rows: options.rows, workerAlive: true, now: now(),
    });
    if (state.phase === "done") return state;
    if (state.phase === "failed") throw new Error(`resilient row loop is failed: ${state.failure ?? "unknown"}`);
    const attempt = await prepareNextResilientAttempt(
      options.runDir, options.identityDigest, options.planDigest, now(),
    );
    await markResilientAttemptDispatched(
      options.runDir, options.identityDigest, options.planDigest, attempt.attemptId, now(),
    );
    let executed: Awaited<ReturnType<typeof options.executeRow>>;
    try {
      executed = await options.executeRow(attempt);
    } catch (error) {
      return failResilientRun({
        runDir: options.runDir, identityDigest: options.identityDigest, planDigest: options.planDigest,
        failure: `executor-failed:${attempt.attemptId}:${error instanceof Error ? error.message : String(error)}`,
        now: now(),
      });
    }
    const completedAt = now();
    state = await recordResilientTerminal(options.runDir, {
      schemaVersion: "skill-ir-reviewed-aot-resilient-terminal/v1",
      identityDigest: options.identityDigest,
      planDigest: options.planDigest,
      rowIndex: attempt.rowIndex,
      attemptId: attempt.attemptId,
      row: attempt.row,
      completedAt,
      usageAuthority: executed.usageAuthority,
      entry: executed.entry,
    });
    if (executed.stopAfterTerminal) {
      return failResilientRun({
        runDir: options.runDir, identityDigest: options.identityDigest, planDigest: options.planDigest,
        failure: executed.failure ?? `terminal-blocker:${attempt.attemptId}`, now: now(),
      });
    }
  }
}

async function stateExists(runDir: string): Promise<boolean> {
  try {
    await readFile(`${runDir}/run-state.json`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function spawnDetachedWorker(
  phase: "qualification-worker" | "matrix-worker",
  input: WorkerInput | MatrixWorkerInput,
): Promise<number> {
  const scriptPath = fileURLToPath(import.meta.url);
  const encoded = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let child: ReturnType<typeof Bun.spawn>;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      callback();
    };
    try {
      child = Bun.spawn({
        cmd: [process.execPath, "run", scriptPath, `--phase=${phase}`, `--worker-input=${encoded}`],
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
        detached: true,
        ipc(message) {
          const handshake = message as Handshake;
          if (handshake.kind === "ready") {
            try { child.disconnect?.(); } catch { /* best effort */ }
            try { child.unref(); } catch { /* best effort */ }
            finish(() => resolve(handshake.workerPid));
          } else {
            finish(() => reject(new Error(handshake.message)));
          }
        },
      });
    } catch (error) {
      reject(error);
      return;
    }
    child.exited.then((code) => finish(() => reject(new Error(
      `qualification worker exited with code ${code} before ready`,
    )))).catch((error) => finish(() => reject(error)));
    timeoutHandle = setTimeout(() => {
      if (settled) return;
      try { child.kill(); } catch { /* best effort */ }
      finish(() => reject(new Error("qualification worker handshake timeout")));
    }, 60_000);
  });
}

async function startQualification(runDir: string, startDelayMs = 500) {
  const input = WorkerInputSchema.parse({
    mode: "qualification",
    runDir,
    identityDigest: QUALIFICATION_IDENTITY_DIGEST,
    planDigest: QUALIFICATION_PLAN_DIGEST,
    rows: QUALIFICATION_ROWS,
    startDelayMs,
  });
  if (await stateExists(runDir)) {
    let state = await readResilientRunState(runDir, input.identityDigest, input.planDigest);
    if (state.phase === "done" || state.phase === "failed") {
      return { status: `observed-${state.phase}`, workerPid: state.workerPid, controllerPid: process.pid };
    }
    if (isPidAlive(state.workerPid)) {
      return { status: "observed-running", workerPid: state.workerPid, controllerPid: process.pid };
    }
    state = await reconcileResilientRun({
      runDir, identityDigest: input.identityDigest, planDigest: input.planDigest,
      rows: input.rows, workerAlive: false, now: now(),
    });
    if (state.phase === "failed" || state.phase === "done") {
      return { status: `observed-${state.phase}`, workerPid: state.workerPid, controllerPid: process.pid };
    }
  }
  const workerPid = await spawnDetachedWorker("qualification-worker", input);
  return { status: "started", workerPid, controllerPid: process.pid };
}

function sendHandshake(message: Handshake): void {
  if (typeof process.send === "function") process.send(message);
}

async function runQualificationWorker(inputRaw: string): Promise<void> {
  const input = WorkerInputSchema.parse(JSON.parse(Buffer.from(inputRaw, "base64url").toString("utf8")));
  try {
    if (await stateExists(input.runDir)) {
      await claimResilientWorker({
        runDir: input.runDir, identityDigest: input.identityDigest, planDigest: input.planDigest,
        workerPid: process.pid, now: now(),
      });
    } else {
      await initializeResilientRun({
        runDir: input.runDir, identityDigest: input.identityDigest, planDigest: input.planDigest,
        rows: input.rows, workerPid: process.pid, now: now(),
      });
    }
  } catch (error) {
    sendHandshake({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
  sendHandshake({ kind: "ready", workerPid: process.pid });
  process.disconnect?.();
  try {
    // Keep a real window in which the foreground controller has exited while
    // this exact worker/attempt remains live.
    await Bun.sleep(input.startDelayMs);
    for (;;) {
      const state = await reconcileResilientRun({
        runDir: input.runDir, identityDigest: input.identityDigest, planDigest: input.planDigest,
        rows: input.rows, workerAlive: true, now: now(),
      });
      if (state.phase === "done") break;
      if (state.phase === "failed") throw new Error(state.failure ?? "qualification run failed");
      const attempt = await prepareNextResilientAttempt(
        input.runDir, input.identityDigest, input.planDigest, now(),
      );
      await markResilientAttemptDispatched(
        input.runDir, input.identityDigest, input.planDigest, attempt.attemptId, now(),
      );
      await Bun.sleep(40);
      const terminal: ResilientTerminalRecord = {
        schemaVersion: "skill-ir-reviewed-aot-resilient-terminal/v1",
        identityDigest: input.identityDigest,
        planDigest: input.planDigest,
        rowIndex: attempt.rowIndex,
        attemptId: attempt.attemptId,
        row: attempt.row,
        completedAt: now(),
        usageAuthority: {
          available: true,
          source: attempt.row.paid ? "execution-envelope" : "deterministic-zero",
        },
        entry: { row: attempt.row, qualification: true, fakeModelCalls: 0 },
      };
      await recordResilientTerminal(input.runDir, terminal);
    }
    process.exit(0);
  } catch (error) {
    await failResilientRun({
      runDir: input.runDir, identityDigest: input.identityDigest, planDigest: input.planDigest,
      failure: error instanceof Error ? error.message : String(error), now: now(),
    }).catch(() => { /* preserve the original worker failure */ });
    process.exit(1);
  }
}

async function waitForTerminalState(runDir: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await readResilientRunState(runDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST);
    if (state.phase !== "running") return state;
    await Bun.sleep(25);
  }
  throw new Error("qualification worker did not reach a terminal state");
}

async function runQualificationSuite(outPath: string): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "reviewed-aot-resilience-qualification-"));
  try {
    const controllerRunDir = join(temporary, "controller-exit");
    const scriptPath = fileURLToPath(import.meta.url);
    const controller = Bun.spawn([
      process.execPath, "run", scriptPath, "--phase=qualification-start", `--out-dir=${controllerRunDir}`,
      "--worker-delay-ms=2000", "--hold-ms=10000",
    ], { cwd: process.cwd(), stdout: "ignore", stderr: "pipe", windowsHide: true });
    const readyDeadline = Date.now() + 10_000;
    let beforeControllerExit: Awaited<ReturnType<typeof readResilientRunState>> | null = null;
    while (Date.now() < readyDeadline) {
      try {
        beforeControllerExit = await readResilientRunState(
          controllerRunDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST,
        );
        if (beforeControllerExit.phase === "running") break;
      } catch { /* controller has not completed the worker handshake */ }
      await Bun.sleep(25);
    }
    if (!beforeControllerExit || beforeControllerExit.phase !== "running"
      || beforeControllerExit.workerPid === controller.pid || !isPidAlive(controller.pid)) {
      throw new Error("qualification controller did not expose a live distinct worker");
    }
    const started = { controllerPid: controller.pid, workerPid: beforeControllerExit.workerPid };
    controller.kill();
    const [controllerExit, controllerStderr] = await Promise.all([
      controller.exited, new Response(controller.stderr).text(),
    ]);
    if (controllerExit === 0 || controllerStderr) {
      throw new Error(`qualification controller was not force-terminated cleanly: ${controllerExit}:${controllerStderr}`);
    }
    const afterControllerExit = await readResilientRunState(
      controllerRunDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST,
    );
    if (afterControllerExit.phase !== "running" || afterControllerExit.workerPid !== started.workerPid) {
      throw new Error("qualification worker did not remain live after controller exit");
    }
    const finalState = await waitForTerminalState(controllerRunDir);
    const repeated = await startQualification(controllerRunDir);
    const repeatedState = await readResilientRunState(
      controllerRunDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST,
    );

    const terminalWindowDir = join(temporary, "terminal-before-prefix");
    await initializeResilientRun({
      runDir: terminalWindowDir, identityDigest: QUALIFICATION_IDENTITY_DIGEST,
      planDigest: QUALIFICATION_PLAN_DIGEST, rows: QUALIFICATION_ROWS.slice(0, 1),
      workerPid: process.pid, now: now(),
    });
    const terminalAttempt = await prepareNextResilientAttempt(
      terminalWindowDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST, now(),
    );
    await markResilientAttemptDispatched(
      terminalWindowDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST,
      terminalAttempt.attemptId, now(),
    );
    const terminalRecord: ResilientTerminalRecord = {
      schemaVersion: "skill-ir-reviewed-aot-resilient-terminal/v1",
      identityDigest: QUALIFICATION_IDENTITY_DIGEST,
      planDigest: QUALIFICATION_PLAN_DIGEST,
      rowIndex: 0,
      attemptId: terminalAttempt.attemptId,
      row: terminalAttempt.row,
      completedAt: now(),
      usageAuthority: { available: true, source: "execution-envelope" },
      entry: { qualification: true, fakeModelCalls: 0 },
    };
    await recordResilientTerminal(terminalWindowDir, terminalRecord, { commitPrefix: false });
    const prefixBefore = (await readResilientPrefix(terminalWindowDir, QUALIFICATION_ROWS.slice(0, 1))).length;
    await reconcileResilientRun({
      runDir: terminalWindowDir, identityDigest: QUALIFICATION_IDENTITY_DIGEST,
      planDigest: QUALIFICATION_PLAN_DIGEST, rows: QUALIFICATION_ROWS.slice(0, 1),
      workerAlive: true, now: now(),
    });
    const prefixAfter = (await readResilientPrefix(terminalWindowDir, QUALIFICATION_ROWS.slice(0, 1))).length;

    const missingTerminalDir = join(temporary, "dispatched-without-terminal");
    await initializeResilientRun({
      runDir: missingTerminalDir, identityDigest: QUALIFICATION_IDENTITY_DIGEST,
      planDigest: QUALIFICATION_PLAN_DIGEST, rows: QUALIFICATION_ROWS.slice(0, 1),
      workerPid: process.pid, now: now(),
    });
    const missingAttempt = await prepareNextResilientAttempt(
      missingTerminalDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST, now(),
    );
    await markResilientAttemptDispatched(
      missingTerminalDir, QUALIFICATION_IDENTITY_DIGEST, QUALIFICATION_PLAN_DIGEST,
      missingAttempt.attemptId, now(),
    );
    const missingTerminalState = await reconcileResilientRun({
      runDir: missingTerminalDir, identityDigest: QUALIFICATION_IDENTITY_DIGEST,
      planDigest: QUALIFICATION_PLAN_DIGEST, rows: QUALIFICATION_ROWS.slice(0, 1),
      workerAlive: false, now: now(),
    });

    let identityDriftRejected = false;
    try {
      await readResilientRunState(terminalWindowDir, "c".repeat(64), QUALIFICATION_PLAN_DIGEST);
    } catch { identityDriftRejected = true; }
    let outOfOrderTerminalRejected = false;
    try {
      await recordResilientTerminal(terminalWindowDir, { ...terminalRecord, rowIndex: 1, attemptId: "row-02" });
    } catch { outOfOrderTerminalRejected = true; }

    const implementationPaths = [
      "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient.ts",
      "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-run.ts",
    ];
    const report = ResilientQualificationReportSchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-resilience-qualification/v1",
      status: "passed",
      completedAt: now(),
      implementation: await Promise.all(implementationPaths.map(async (path) => ({
        path, sha256: sha256Bytes(await readFile(join(process.cwd(), path))),
      }))),
      scenarios: {
        controllerExitSameAttempt: {
          controllerPid: started.controllerPid,
          workerPid: started.workerPid,
          controllerExitMode: "forced-termination",
          phaseAfterControllerExit: afterControllerExit.phase,
          finalPhase: finalState.phase,
          completedRows: finalState.completedRows,
          dispatchCount: finalState.dispatchCount,
          repeatedStartStatus: repeated.status,
          repeatedStartDispatchCount: repeatedState.dispatchCount,
          sameWorkerObserved: finalState.workerPid === started.workerPid,
        },
        terminalBeforePrefix: { prefixBefore, prefixAfter, recovered: prefixBefore === 0 && prefixAfter === 1 },
        dispatchedWithoutTerminal: {
          phase: missingTerminalState.phase,
          failure: missingTerminalState.failure,
          failClosed: missingTerminalState.phase === "failed",
        },
        identityAndOrder: { identityDriftRejected, outOfOrderTerminalRejected },
      },
      accounting: { fakeRows: 2, apiCalls: 0, modelCalls: 0, paidCalls: 0 },
      recoveryScope: "foreground-controller-or-desktop-parent-interruption-only",
      unsupportedRecovery: [
        "worker-crash-after-dispatch-without-terminal",
        "os-or-power-loss-after-dispatch-without-terminal",
        "provider-transcript-loss",
      ],
    });
    await writeAtomicJson(outPath, report);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function matrixPlanDigest(freezeDigest: string, rows: ReviewedAotEfficiencyRow[]): string {
  return sha256Bytes(Buffer.from(JSON.stringify({
    freezeDigest,
    experimentId: "env-manager-reviewed-aot-efficiency-v2",
    rows,
  }), "utf8"));
}

async function loadMatrixIdentity(rootDirInput: string, runDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const runDir = resolve(runDirInput);
  const policyPath = resolve(rootDir, RESILIENT_EFFICIENCY_POLICY_PATH);
  const freezePath = resolve(rootDir, RESILIENT_EFFICIENCY_FREEZE_PATH);
  const policyBytes = await readFile(policyPath);
  const freezeBytes = await readFile(freezePath);
  const policy = ResilientEfficiencyPolicySchema.parse(JSON.parse(policyBytes.toString("utf8")));
  const freeze = ResilientEfficiencyFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  await validateResilientEfficiencyPolicy(policy, rootDir);
  await validateResilientEfficiencyFreeze(freeze, rootDir, policy);
  const predecessorPolicyBytes = await readFile(resolve(rootDir, policy.predecessor.policy.path));
  const predecessorPolicy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(predecessorPolicyBytes.toString("utf8")));
  const predecessor = await validateReviewedAotEfficiencyPolicy(predecessorPolicy, rootDir);
  const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir: runDir, policy: predecessorPolicy });
  const identityDigest = sha256Bytes(freezeBytes);
  const planDigest = matrixPlanDigest(identityDigest, policy.denominator.orderedRows);
  return {
    rootDir, runDir, policy, freeze, predecessor, predecessorPolicy, originalPlan,
    identityDigest, planDigest, rows: policy.denominator.orderedRows,
  };
}

function shouldStop(classification: ExecutionEnvelope["classification"]): boolean {
  return new Set(["qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid"])
    .has(classification);
}

async function runMatrixWorker(inputRaw: string): Promise<void> {
  const input = MatrixWorkerInputSchema.parse(JSON.parse(Buffer.from(inputRaw, "base64url").toString("utf8")));
  let identity: Awaited<ReturnType<typeof loadMatrixIdentity>> | undefined;
  try {
    identity = await loadMatrixIdentity(input.rootDir, input.runDir);
    if (identity.identityDigest !== input.identityDigest || identity.planDigest !== input.planDigest) {
      throw new Error("matrix worker identity digest drift");
    }
    const activeIdentity = identity;
    const bundle = await buildReviewedAotBundle({
      rootDir: activeIdentity.rootDir,
      outDir: join(activeIdentity.runDir, "reviewed-aot-bundle"),
      policy: activeIdentity.predecessorPolicy,
      review: activeIdentity.predecessor.review,
    });
    const taskSet = JSON.parse(await readFile(
      resolve(activeIdentity.rootDir, activeIdentity.predecessorPolicy.frozenInputs.tasks.path), "utf8",
    )) as { tasks: SkillIRBenchmarkTask[] };
    const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
    if (await stateExists(activeIdentity.runDir)) {
      await claimResilientWorker({
        runDir: activeIdentity.runDir, identityDigest: activeIdentity.identityDigest, planDigest: activeIdentity.planDigest,
        workerPid: process.pid, now: now(),
      });
    } else {
      await initializeResilientRun({
        runDir: activeIdentity.runDir, identityDigest: activeIdentity.identityDigest, planDigest: activeIdentity.planDigest,
        rows: activeIdentity.rows, workerPid: process.pid, now: now(),
      });
    }
    sendHandshake({ kind: "ready", workerPid: process.pid });
    process.disconnect?.();
    const result = await runResilientRowLoop({
      runDir: activeIdentity.runDir,
      identityDigest: activeIdentity.identityDigest,
      planDigest: activeIdentity.planDigest,
      rows: activeIdentity.rows,
      executeRow: async (attempt) => {
        const rowIdentity = attempt.row;
        const originalRow = activeIdentity.originalPlan.rows.find((row) =>
          row.caseId.endsWith(`:${rowIdentity.taskId}`) && row.runIndex === rowIdentity.repetition);
        if (!originalRow) throw new Error(`missing original plan row for ${rowIdentity.taskId}/${rowIdentity.repetition}`);
        let raw: RawAgentRunRow;
        let originalEnvelope: ExecutionEnvelope | null = null;
        if (rowIdentity.system === "original") {
          const executionRow = { ...originalRow, panelConfigId: activeIdentity.policy.experimentId };
          const executionLock = {
            experimentId: activeIdentity.policy.experimentId,
            runtime: activeIdentity.predecessorPolicy.runtime,
          };
          const executed = await executeProspectiveDevelopmentRow({
            row: executionRow as unknown as ProspectiveDevelopmentPlan["plan"][number],
            lock: executionLock as unknown as ProspectiveDevelopmentLock,
            env: { ...process.env, SKVM_AUTO_PROBE: "0" },
          });
          raw = { ...executed.raw, panelConfigId: activeIdentity.policy.experimentId };
          originalEnvelope = executed.envelope;
          if (!originalEnvelope.usage.available) {
            throw new Error(`original usage unavailable for ${attempt.attemptId}`);
          }
        } else {
          const executed = await executeReviewedAotRow({
            rootDir: activeIdentity.rootDir,
            policy: activeIdentity.predecessorPolicy,
            originalRow,
            bundlePath: bundle.path,
            workDir: join(activeIdentity.runDir, "reviewed-aot-workdirs", rowIdentity.taskId, `run-${rowIdentity.repetition}`),
          });
          raw = { ...executed, panelConfigId: activeIdentity.policy.experimentId };
        }
        const scorerStarted = performance.now();
        const [scored] = await scoreRawRunRows([raw], taskById);
        const scorerDurationMs = performance.now() - scorerStarted;
        if (!scored) throw new Error(`scorer returned no row for ${attempt.attemptId}`);
        const entry: PrefixEntry = { row: rowIdentity, raw, scored, originalEnvelope, scorerDurationMs };
        const stopAfterTerminal = originalEnvelope
          ? shouldStop(originalEnvelope.classification)
          : scored.failureType === "infrastructure";
        return {
          usageAuthority: {
            available: true as const,
            source: rowIdentity.paid ? "execution-envelope" as const : "deterministic-zero" as const,
          },
          entry,
          stopAfterTerminal,
          failure: stopAfterTerminal
            ? `execution-blocker:${attempt.attemptId}:${originalEnvelope?.classification ?? scored.failureType}`
            : undefined,
        };
      },
    });
    process.exit(result.phase === "done" ? 0 : 1);
  } catch (error) {
    sendHandshake({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    if (identity) {
      await failResilientRun({
        runDir: identity.runDir, identityDigest: identity.identityDigest, planDigest: identity.planDigest,
        failure: error instanceof Error ? error.message : String(error), now: now(),
      }).catch(() => { /* state may not have been initialized */ });
    }
    process.exit(1);
  }
}

async function observeMatrix(identity: Awaited<ReturnType<typeof loadMatrixIdentity>>) {
  if (!await stateExists(identity.runDir)) {
    return { status: "not-started", completedRows: 0, dispatchCount: 0, workerPid: null };
  }
  let state = await readResilientRunState(identity.runDir, identity.identityDigest, identity.planDigest);
  if (state.phase === "running" && !isPidAlive(state.workerPid)) {
    state = await reconcileResilientRun({
      runDir: identity.runDir, identityDigest: identity.identityDigest, planDigest: identity.planDigest,
      rows: identity.rows, workerAlive: false, now: now(),
    });
  }
  return {
    status: state.phase, completedRows: state.completedRows, dispatchCount: state.dispatchCount,
    workerPid: state.workerPid, failure: state.failure,
  };
}

async function startMatrix(rootDir: string, runDir: string) {
  const identity = await loadMatrixIdentity(rootDir, runDir);
  await mkdir(identity.runDir, { recursive: true });
  return withFileLock(join(identity.runDir, "controller-start.lock"), {
    timeoutMs: 0, staleMs: 60_000,
  }, async () => {
    const observed = await observeMatrix(identity);
    if (observed.status === "done" || observed.status === "failed"
      || (observed.status === "running" && observed.workerPid && isPidAlive(observed.workerPid))) {
      return { ...observed, controllerPid: process.pid, action: "observed" };
    }
    if (!process.env[identity.predecessorPolicy.runtime.apiKeyEnv]?.trim()) {
      throw new Error(`Missing ${identity.predecessorPolicy.runtime.apiKeyEnv}`);
    }
    const workerPid = await spawnDetachedWorker("matrix-worker", MatrixWorkerInputSchema.parse({
      mode: "matrix", rootDir: identity.rootDir, runDir: identity.runDir,
      identityDigest: identity.identityDigest, planDigest: identity.planDigest,
    }));
    return {
      status: "running", completedRows: observed.completedRows, dispatchCount: observed.dispatchCount,
      workerPid, controllerPid: process.pid, action: "started",
    };
  });
}

async function collectMatrix(rootDir: string, runDir: string) {
  const identity = await loadMatrixIdentity(rootDir, runDir);
  const observed = await observeMatrix(identity);
  if (observed.status !== "done") throw new Error(`matrix is not collectable: ${observed.status}`);
  const prefix = await readResilientPrefix(identity.runDir, identity.rows);
  if (prefix.length !== 8) throw new Error(`matrix prefix incomplete: ${prefix.length}/8`);
  const entries = prefix.map((terminal) => terminal.entry as PrefixEntry);
  for (let index = 0; index < entries.length; index += 1) {
    if (!entries[index] || !isDeepStrictEqual(entries[index]!.row, identity.rows[index])) {
      throw new Error(`matrix terminal entry drift at row ${index + 1}`);
    }
  }
  await Promise.all([
    writeFile(join(identity.runDir, "raw-runs.jsonl"), `${entries.map((entry) => JSON.stringify(entry.raw)).join("\n")}\n`, "utf8"),
    writeFile(join(identity.runDir, "scored-runs.jsonl"), `${entries.map((entry) => JSON.stringify(entry.scored)).join("\n")}\n`, "utf8"),
    writeFile(join(identity.runDir, "execution-envelopes.jsonl"),
      `${entries.filter((entry) => entry.originalEnvelope).map((entry) => JSON.stringify(entry.originalEnvelope)).join("\n")}\n`, "utf8"),
  ]);
  return { status: "collected", rows: 8, paidCalls: 4, retries: 0, entries };
}

async function main(): Promise<void> {
  const phase = argument("phase");
  if (phase === "qualification-start") {
    const runDir = argument("out-dir");
    if (!runDir) throw new Error("--out-dir is required");
    const workerDelayMs = Number(argument("worker-delay-ms") ?? "500");
    const result = await startQualification(runDir, workerDelayMs);
    console.log(JSON.stringify(result));
    const holdMs = Number(argument("hold-ms") ?? "0");
    if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 60_000) throw new Error("invalid --hold-ms");
    if (holdMs > 0) await Bun.sleep(holdMs);
    return;
  }
  if (phase === "qualification-worker") {
    const input = argument("worker-input");
    if (!input) throw new Error("--worker-input is required");
    await runQualificationWorker(input);
    return;
  }
  if (phase === "matrix-worker") {
    const input = argument("worker-input");
    if (!input) throw new Error("--worker-input is required");
    await runMatrixWorker(input);
    return;
  }
  if (phase === "qualify") {
    const outPath = argument("out-path");
    if (!outPath) throw new Error("--out-path is required");
    await runQualificationSuite(outPath);
    console.log(JSON.stringify({ status: "passed", reportPath: outPath }));
    return;
  }
  if (phase === "freeze") {
    const frozenAt = argument("frozen-at");
    if (!frozenAt) throw new Error("--frozen-at is required");
    const artifacts = await writeResilientEfficiencyFreezeArtifacts({ rootDir: process.cwd(), frozenAt });
    console.log(JSON.stringify({ status: artifacts.freeze.status, rows: 8, paidCalls: 0, matrixExecuted: false }));
    return;
  }
  if (phase === "plan" || phase === "start" || phase === "status" || phase === "collect") {
    const rootDir = resolve(argument("root") ?? process.cwd());
    const runDir = resolve(argument("out-dir") ?? join(rootDir, "results/skill-ir/env-manager-reviewed-aot-efficiency-v2/run"));
    if (phase === "start") {
      console.log(JSON.stringify(await startMatrix(rootDir, runDir)));
      return;
    }
    const identity = await loadMatrixIdentity(rootDir, runDir);
    if (phase === "plan") {
      await mkdir(runDir, { recursive: true });
      await writeAtomicJson(join(runDir, "plan.json"), {
        schemaVersion: "skill-ir-reviewed-aot-efficiency-resilient-plan/v1",
        experimentId: identity.policy.experimentId,
        identityDigest: identity.identityDigest,
        planDigest: identity.planDigest,
        rows: identity.rows,
        originalPlan: identity.originalPlan.rows,
        accounting: { paidCalls: 0, matrixExecuted: false },
      });
      console.log(JSON.stringify({ status: "planned", rows: 8, paidCalls: 0, matrixExecuted: false }));
      return;
    }
    if (phase === "status") {
      console.log(JSON.stringify(await observeMatrix(identity)));
      return;
    }
    const collected = await collectMatrix(rootDir, runDir);
    console.log(JSON.stringify({ status: collected.status, rows: collected.rows, paidCalls: collected.paidCalls, retries: 0 }));
    return;
  }
  throw new Error("unsupported --phase");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
