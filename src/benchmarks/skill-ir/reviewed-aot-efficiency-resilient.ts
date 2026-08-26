import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  ReviewedAotEfficiencyRowSchema,
  type ReviewedAotEfficiencyRow,
} from "./reviewed-aot-efficiency-matrix";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const IsoTimestampSchema = z.string().datetime({ offset: true });
const AttemptIdSchema = z.string().regex(/^row-[0-9]{2}$/u);

export const ResilientAttemptSchema = z.object({
  attemptId: AttemptIdSchema,
  rowIndex: z.number().int().nonnegative(),
  row: ReviewedAotEfficiencyRowSchema,
  status: z.enum(["prepared", "dispatched", "completed", "failed"]),
  preparedAt: IsoTimestampSchema,
  dispatchedAt: IsoTimestampSchema.nullable(),
  completedAt: IsoTimestampSchema.nullable(),
  terminalPath: z.string().nullable(),
  failure: z.string().nullable(),
}).strict();
export type ResilientAttempt = z.infer<typeof ResilientAttemptSchema>;

export const ResilientTerminalRecordSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-resilient-terminal/v1"),
  identityDigest: Sha256Schema,
  planDigest: Sha256Schema,
  rowIndex: z.number().int().nonnegative(),
  attemptId: AttemptIdSchema,
  row: ReviewedAotEfficiencyRowSchema,
  completedAt: IsoTimestampSchema,
  usageAuthority: z.object({
    available: z.literal(true),
    source: z.enum(["execution-envelope", "deterministic-zero"]),
  }).strict(),
  entry: z.unknown(),
}).strict().superRefine((record, context) => {
  const expectedSource = record.row.paid ? "execution-envelope" : "deterministic-zero";
  if (record.usageAuthority.source !== expectedSource) {
    context.addIssue({ code: "custom", message: "terminal usage authority does not match row payment identity" });
  }
});
export type ResilientTerminalRecord = z.infer<typeof ResilientTerminalRecordSchema>;

export const ResilientRunStateSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-resilient-run-state/v1"),
  identityDigest: Sha256Schema,
  planDigest: Sha256Schema,
  phase: z.enum(["running", "done", "failed"]),
  workerPid: z.number().int().positive(),
  startedAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema.nullable(),
  rows: z.array(ReviewedAotEfficiencyRowSchema).min(1),
  attempts: z.array(ResilientAttemptSchema),
  completedRows: z.number().int().nonnegative(),
  dispatchCount: z.number().int().nonnegative(),
  failure: z.string().nullable(),
}).strict().superRefine((state, context) => {
  if (state.completedRows > state.rows.length || state.attempts.length > state.rows.length
    || state.dispatchCount > state.attempts.length) {
    context.addIssue({ code: "custom", message: "resilient run accounting drift" });
  }
  for (let index = 0; index < state.attempts.length; index += 1) {
    const attempt = state.attempts[index]!;
    if (attempt.rowIndex !== index || attempt.attemptId !== attemptId(index)
      || !isDeepStrictEqual(attempt.row, state.rows[index])) {
      context.addIssue({ code: "custom", message: `resilient attempt identity drift at row ${index + 1}` });
    }
  }
});
export type ResilientRunState = z.infer<typeof ResilientRunStateSchema>;

export const ResilientQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-resilience-qualification/v1"),
  status: z.literal("passed"),
  completedAt: IsoTimestampSchema,
  implementation: z.array(z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }).strict()).length(2),
  scenarios: z.object({
    controllerExitSameAttempt: z.object({
      controllerPid: z.number().int().positive(),
      workerPid: z.number().int().positive(),
      controllerExitMode: z.literal("forced-termination"),
      phaseAfterControllerExit: z.literal("running"),
      finalPhase: z.literal("done"),
      completedRows: z.literal(2),
      dispatchCount: z.literal(2),
      repeatedStartStatus: z.literal("observed-done"),
      repeatedStartDispatchCount: z.literal(2),
      sameWorkerObserved: z.literal(true),
    }).strict(),
    terminalBeforePrefix: z.object({
      prefixBefore: z.literal(0),
      prefixAfter: z.literal(1),
      recovered: z.literal(true),
    }).strict(),
    dispatchedWithoutTerminal: z.object({
      phase: z.literal("failed"),
      failure: z.string().startsWith("dispatched-without-terminal:"),
      failClosed: z.literal(true),
    }).strict(),
    identityAndOrder: z.object({
      identityDriftRejected: z.literal(true),
      outOfOrderTerminalRejected: z.literal(true),
    }).strict(),
  }).strict(),
  accounting: z.object({
    fakeRows: z.literal(2),
    apiCalls: z.literal(0),
    modelCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  recoveryScope: z.literal("foreground-controller-or-desktop-parent-interruption-only"),
  unsupportedRecovery: z.tuple([
    z.literal("worker-crash-after-dispatch-without-terminal"),
    z.literal("os-or-power-loss-after-dispatch-without-terminal"),
    z.literal("provider-transcript-loss"),
  ]),
}).strict();
export type ResilientQualificationReport = z.infer<typeof ResilientQualificationReportSchema>;

function attemptId(rowIndex: number): string {
  return `row-${String(rowIndex + 1).padStart(2, "0")}`;
}

function statePath(runDir: string): string {
  return join(runDir, "run-state.json");
}

function prefixPath(runDir: string): string {
  return join(runDir, "matrix-prefix.json");
}

function terminalPath(runDir: string, rowIndex: number): string {
  return join(runDir, "attempts", attemptId(rowIndex), "terminal.json");
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertIdentity(state: ResilientRunState, identityDigest: string, planDigest: string): void {
  if (state.identityDigest !== identityDigest) throw new Error("resilient run identity digest mismatch");
  if (state.planDigest !== planDigest) throw new Error("resilient run plan digest mismatch");
}

export async function initializeResilientRun(options: {
  runDir: string;
  identityDigest: string;
  planDigest: string;
  rows: ReviewedAotEfficiencyRow[];
  workerPid: number;
  now: string;
}): Promise<ResilientRunState> {
  const state = ResilientRunStateSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-resilient-run-state/v1",
    identityDigest: options.identityDigest,
    planDigest: options.planDigest,
    phase: "running",
    workerPid: options.workerPid,
    startedAt: options.now,
    updatedAt: options.now,
    finishedAt: null,
    rows: options.rows,
    attempts: [],
    completedRows: 0,
    dispatchCount: 0,
    failure: null,
  });
  const path = statePath(options.runDir);
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("resilient run state already exists");
    }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return state;
}

export async function readResilientRunState(
  runDir: string,
  identityDigest: string,
  planDigest: string,
): Promise<ResilientRunState> {
  const state = ResilientRunStateSchema.parse(await readJson(statePath(runDir)));
  assertIdentity(state, identityDigest, planDigest);
  return state;
}

async function writeState(runDir: string, state: ResilientRunState): Promise<ResilientRunState> {
  const parsed = ResilientRunStateSchema.parse(state);
  await writeAtomicJson(statePath(runDir), parsed);
  return parsed;
}

export async function claimResilientWorker(options: {
  runDir: string;
  identityDigest: string;
  planDigest: string;
  workerPid: number;
  now: string;
}): Promise<ResilientRunState> {
  const state = await readResilientRunState(options.runDir, options.identityDigest, options.planDigest);
  if (state.phase !== "running") throw new Error(`resilient run cannot be claimed from ${state.phase}`);
  const active = state.attempts[state.completedRows];
  if (active?.status === "dispatched" && !await exists(terminalPath(options.runDir, active.rowIndex))) {
    throw new Error("resilient dispatched attempt has no terminal authority");
  }
  return writeState(options.runDir, { ...state, workerPid: options.workerPid, updatedAt: options.now });
}

export async function failResilientRun(options: {
  runDir: string;
  identityDigest: string;
  planDigest: string;
  failure: string;
  now: string;
}): Promise<ResilientRunState> {
  const state = await readResilientRunState(options.runDir, options.identityDigest, options.planDigest);
  if (state.phase === "done") throw new Error("completed resilient run cannot be failed");
  const attempts = [...state.attempts];
  const active = attempts[state.completedRows];
  if (active && active.status !== "completed") {
    attempts[state.completedRows] = ResilientAttemptSchema.parse({
      ...active, status: "failed", failure: options.failure,
    });
  }
  return writeState(options.runDir, {
    ...state, attempts, phase: "failed", failure: options.failure,
    updatedAt: options.now, finishedAt: options.now,
  });
}

export async function prepareNextResilientAttempt(
  runDir: string,
  identityDigest: string,
  planDigest: string,
  now: string,
): Promise<ResilientAttempt> {
  const state = await readResilientRunState(runDir, identityDigest, planDigest);
  if (state.phase !== "running") throw new Error(`resilient run is ${state.phase}`);
  const existing = state.attempts[state.completedRows];
  if (existing) {
    if (existing.status === "prepared") return existing;
    if (existing.status === "dispatched") throw new Error(`resilient attempt ${existing.attemptId} is already dispatched`);
    throw new Error(`resilient attempt ${existing.attemptId} cannot be prepared from ${existing.status}`);
  }
  if (state.completedRows === state.rows.length) throw new Error("resilient run has no remaining rows");
  const rowIndex = state.completedRows;
  const prepared = ResilientAttemptSchema.parse({
    attemptId: attemptId(rowIndex), rowIndex, row: state.rows[rowIndex], status: "prepared",
    preparedAt: now, dispatchedAt: null, completedAt: null, terminalPath: null, failure: null,
  });
  await writeState(runDir, { ...state, attempts: [...state.attempts, prepared], updatedAt: now });
  return prepared;
}

export async function markResilientAttemptDispatched(
  runDir: string,
  identityDigest: string,
  planDigest: string,
  id: string,
  now: string,
): Promise<ResilientAttempt> {
  const state = await readResilientRunState(runDir, identityDigest, planDigest);
  const active = state.attempts[state.completedRows];
  if (!active || active.attemptId !== id) throw new Error("resilient dispatch attempt is out of order");
  if (active.status !== "prepared") throw new Error(`resilient attempt ${id} is already ${active.status}`);
  const dispatched = ResilientAttemptSchema.parse({ ...active, status: "dispatched", dispatchedAt: now });
  const attempts = [...state.attempts];
  attempts[state.completedRows] = dispatched;
  await writeState(runDir, { ...state, attempts, dispatchCount: state.dispatchCount + 1, updatedAt: now });
  return dispatched;
}

async function readTerminal(runDir: string, rowIndex: number): Promise<ResilientTerminalRecord | null> {
  const path = terminalPath(runDir, rowIndex);
  if (!await exists(path)) return null;
  return ResilientTerminalRecordSchema.parse(await readJson(path));
}

export async function readResilientPrefix(
  runDir: string,
  rows: ReviewedAotEfficiencyRow[],
): Promise<ResilientTerminalRecord[]> {
  if (!await exists(prefixPath(runDir))) return [];
  const raw = await readJson(prefixPath(runDir));
  if (!Array.isArray(raw)) throw new Error("resilient prefix must be an array");
  const prefix = raw.map((entry) => ResilientTerminalRecordSchema.parse(entry));
  if (prefix.length > rows.length) throw new Error("resilient prefix length mismatch");
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index]!.rowIndex !== index || prefix[index]!.attemptId !== attemptId(index)
      || !isDeepStrictEqual(prefix[index]!.row, rows[index])) {
      throw new Error(`resilient prefix identity mismatch at row ${index + 1}`);
    }
  }
  return prefix;
}

export async function recordResilientTerminal(
  runDir: string,
  input: ResilientTerminalRecord,
  options: { commitPrefix?: boolean } = {},
): Promise<ResilientRunState> {
  const terminal = ResilientTerminalRecordSchema.parse(input);
  const state = await readResilientRunState(runDir, terminal.identityDigest, terminal.planDigest);
  const active = state.attempts[state.completedRows];
  if (!active || terminal.rowIndex !== state.completedRows || terminal.attemptId !== active.attemptId
    || !isDeepStrictEqual(terminal.row, active.row)) {
    throw new Error("resilient terminal record is out of order");
  }
  if (active.status !== "dispatched") {
    throw new Error(`resilient terminal requires dispatched attempt, got ${active.status}`);
  }
  await writeAtomicJson(terminalPath(runDir, terminal.rowIndex), terminal);
  if (options.commitPrefix === false) return state;
  return reconcileResilientRun({
    runDir, identityDigest: terminal.identityDigest, planDigest: terminal.planDigest,
    rows: state.rows, workerAlive: true, now: terminal.completedAt,
  });
}

export async function reconcileResilientRun(options: {
  runDir: string;
  identityDigest: string;
  planDigest: string;
  rows: ReviewedAotEfficiencyRow[];
  workerAlive: boolean;
  now: string;
}): Promise<ResilientRunState> {
  let state = await readResilientRunState(options.runDir, options.identityDigest, options.planDigest);
  if (!isDeepStrictEqual(state.rows, options.rows)) throw new Error("resilient run frozen row plan drift");
  let prefix = await readResilientPrefix(options.runDir, options.rows);
  if (prefix.length !== state.completedRows) {
    throw new Error("resilient prefix and completed-row accounting drift");
  }
  while (state.completedRows < state.rows.length) {
    const rowIndex = state.completedRows;
    const active = state.attempts[rowIndex];
    if (!active) break;
    const terminal = await readTerminal(options.runDir, rowIndex);
    if (!terminal) break;
    if (active.status !== "dispatched" || terminal.identityDigest !== state.identityDigest
      || terminal.planDigest !== state.planDigest || terminal.rowIndex !== rowIndex
      || terminal.attemptId !== active.attemptId || !isDeepStrictEqual(terminal.row, state.rows[rowIndex])) {
      throw new Error(`resilient terminal identity drift at row ${rowIndex + 1}`);
    }
    prefix = [...prefix, terminal];
    await writeAtomicJson(prefixPath(options.runDir), prefix);
    const completed = ResilientAttemptSchema.parse({
      ...active, status: "completed", completedAt: terminal.completedAt,
      terminalPath: `attempts/${active.attemptId}/terminal.json`, failure: null,
    });
    const attempts = [...state.attempts];
    attempts[rowIndex] = completed;
    const completedRows = rowIndex + 1;
    state = await writeState(options.runDir, {
      ...state, attempts, completedRows, updatedAt: options.now,
      phase: completedRows === state.rows.length ? "done" : "running",
      finishedAt: completedRows === state.rows.length ? options.now : null,
    });
  }
  if (state.phase === "running" && !options.workerAlive) {
    const active = state.attempts[state.completedRows];
    if (active?.status === "dispatched") {
      const failure = `dispatched-without-terminal:${active.attemptId}`;
      const attempts = [...state.attempts];
      attempts[state.completedRows] = ResilientAttemptSchema.parse({ ...active, status: "failed", failure });
      state = await writeState(options.runDir, {
        ...state, attempts, phase: "failed", failure, updatedAt: options.now, finishedAt: options.now,
      });
    }
  }
  return state;
}
