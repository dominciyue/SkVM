import { rename, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import {
  ReadonlySerialPrefixEntrySchema,
  ReadonlySerialStateSchema,
  collectReadonlySerialSnapshot,
  type ReadonlyReviewedAotRow,
  type ReadonlySerialAuthority,
  type ReadonlySerialPrefixEntry,
  type ReadonlySerialState,
} from "./reviewed-aot-efficiency-readonly-control";

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function writeState(activeDir: string, state: ReadonlySerialState): Promise<ReadonlySerialState> {
  const parsed = ReadonlySerialStateSchema.parse(state);
  await writeAtomicJson(resolve(activeDir, "serial-state.json"), parsed);
  return parsed;
}

function rowAttemptId(rowIndex: number): string {
  return `row-${String(rowIndex + 1).padStart(2, "0")}`;
}

export async function runForegroundSerialRows(options: {
  rootDir: string;
  activeDir: string;
  authority: ReadonlySerialAuthority;
  executeRow: (
    row: ReadonlyReviewedAotRow,
    rowIndex: number,
  ) => Promise<{
    entry: ReadonlySerialPrefixEntry;
    stopAfterCommit: boolean;
    failure?: string;
  }>;
}): Promise<ReadonlySerialState> {
  let observed = await collectReadonlySerialSnapshot(options);
  let state = ReadonlySerialStateSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
    experimentId: observed.experimentId,
    identityDigest: options.authority.identityDigest,
    planSha256: options.authority.planSha256,
    phase: observed.phase,
    completedRows: observed.completedRows,
    dispatchCount: observed.dispatchCount,
    inFlightRowIndex: observed.inFlightRowIndex,
    failure: observed.failure,
  });
  if (state.phase === "done" || state.phase === "failed") return state;

  if (state.inFlightRowIndex !== null) {
    if (!observed.terminalPendingCommit) {
      return writeState(options.activeDir, {
        ...state,
        phase: "failed",
        failure: `dispatched-without-terminal:${rowAttemptId(state.inFlightRowIndex)}`,
      });
    }
    const completedRows = state.completedRows + 1;
    state = await writeState(options.activeDir, {
      ...state,
      phase: completedRows === options.authority.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: null,
    });
    if (state.phase === "done") return state;
  }

  while (state.completedRows < options.authority.rows.length) {
    observed = await collectReadonlySerialSnapshot(options);
    state = ReadonlySerialStateSchema.parse({
      ...state,
      phase: observed.phase,
      completedRows: observed.completedRows,
      dispatchCount: observed.dispatchCount,
      inFlightRowIndex: observed.inFlightRowIndex,
      failure: observed.failure,
    });
    if (state.phase === "done" || state.phase === "failed") return state;
    if (state.inFlightRowIndex !== null || observed.terminalPendingCommit) {
      throw new Error("serial executor observed an unexpected in-flight transition");
    }
    const rowIndex = state.completedRows;
    const row = options.authority.rows[rowIndex]!;
    state = await writeState(options.activeDir, {
      ...state,
      phase: "running",
      dispatchCount: state.dispatchCount + 1,
      inFlightRowIndex: rowIndex,
      failure: null,
    });

    let executed: Awaited<ReturnType<typeof options.executeRow>>;
    try {
      executed = await options.executeRow(row, rowIndex);
    } catch (error) {
      return writeState(options.activeDir, {
        ...state,
        phase: "failed",
        failure: `executor-failed:${rowAttemptId(rowIndex)}:${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const entry = ReadonlySerialPrefixEntrySchema.parse(executed.entry);
    if (!isDeepStrictEqual(entry.row, row)) {
      return writeState(options.activeDir, {
        ...state,
        phase: "failed",
        failure: `terminal-row-identity-drift:${rowAttemptId(rowIndex)}`,
      });
    }
    await writeAtomicJson(resolve(options.activeDir, "matrix-prefix.json"), [...observed.entries, entry]);
    const completedRows = rowIndex + 1;
    state = await writeState(options.activeDir, {
      ...state,
      phase: executed.stopAfterCommit
        ? "failed"
        : completedRows === options.authority.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: executed.stopAfterCommit
        ? executed.failure ?? `terminal-blocker:${rowAttemptId(rowIndex)}`
        : null,
    });
    if (state.phase === "failed" || state.phase === "done") return state;
  }
  return state;
}
