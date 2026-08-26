import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initializeResilientRun,
  markResilientAttemptDispatched,
  prepareNextResilientAttempt,
  readResilientPrefix,
  readResilientRunState,
  reconcileResilientRun,
  recordResilientTerminal,
  type ResilientTerminalRecord,
} from "./reviewed-aot-efficiency-resilient";
import type { ReviewedAotEfficiencyRow } from "./reviewed-aot-efficiency-matrix";
import { runResilientRowLoop } from "./reviewed-aot-efficiency-resilient-run";

const roots: string[] = [];
const rows: ReviewedAotEfficiencyRow[] = [
  { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "original", paid: true },
  { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "reviewed-aot", paid: false },
];
const identityDigest = "a".repeat(64);
const planDigest = "b".repeat(64);

async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "reviewed-aot-resilient-test-"));
  roots.push(path);
  return path;
}

function terminal(rowIndex: number, attemptId: string): ResilientTerminalRecord {
  return {
    schemaVersion: "skill-ir-reviewed-aot-resilient-terminal/v1",
    identityDigest,
    planDigest,
    rowIndex,
    attemptId,
    row: rows[rowIndex]!,
    completedAt: `2026-08-26T00:00:0${rowIndex}.000Z`,
    usageAuthority: { available: true, source: rows[rowIndex]!.paid ? "execution-envelope" : "deterministic-zero" },
    entry: { row: rows[rowIndex], raw: { durationMs: 1 }, scored: { success: true } },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("reviewed-AOT interruption-resilient attempt journal", () => {
  test("commits terminal authority before a strict prefix and reconciles the crash window", async () => {
    const runDir = await temporary();
    await initializeResilientRun({ runDir, identityDigest, planDigest, rows, workerPid: 41001,
      now: "2026-08-26T00:00:00.000Z" });
    const prepared = await prepareNextResilientAttempt(runDir, identityDigest, planDigest,
      "2026-08-26T00:00:01.000Z");
    expect(prepared.attemptId).toBe("row-01");
    await markResilientAttemptDispatched(runDir, identityDigest, planDigest, prepared.attemptId,
      "2026-08-26T00:00:02.000Z");

    await recordResilientTerminal(runDir, terminal(0, prepared.attemptId), { commitPrefix: false });
    expect(await readResilientPrefix(runDir, rows)).toEqual([]);
    const reconciled = await reconcileResilientRun({ runDir, identityDigest, planDigest, rows,
      workerAlive: true, now: "2026-08-26T00:00:03.000Z" });
    expect(reconciled.completedRows).toBe(1);
    expect(reconciled.dispatchCount).toBe(1);
    expect((await readResilientPrefix(runDir, rows))).toHaveLength(1);
  });

  test("never redispatches a dispatched attempt and fails closed when terminal usage is absent", async () => {
    const runDir = await temporary();
    await initializeResilientRun({ runDir, identityDigest, planDigest, rows, workerPid: 41002,
      now: "2026-08-26T00:00:00.000Z" });
    const prepared = await prepareNextResilientAttempt(runDir, identityDigest, planDigest,
      "2026-08-26T00:00:01.000Z");
    await markResilientAttemptDispatched(runDir, identityDigest, planDigest, prepared.attemptId,
      "2026-08-26T00:00:02.000Z");
    await expect(prepareNextResilientAttempt(runDir, identityDigest, planDigest,
      "2026-08-26T00:00:03.000Z")).rejects.toThrow("already dispatched");
    const failed = await reconcileResilientRun({ runDir, identityDigest, planDigest, rows,
      workerAlive: false, now: "2026-08-26T00:00:04.000Z" });
    expect(failed.phase).toBe("failed");
    expect(failed.failure).toContain("dispatched-without-terminal");
    expect(failed.dispatchCount).toBe(1);
  });

  test("rejects identity drift, out-of-order terminal records, and prefix tampering", async () => {
    const runDir = await temporary();
    await initializeResilientRun({ runDir, identityDigest, planDigest, rows, workerPid: 41003,
      now: "2026-08-26T00:00:00.000Z" });
    await expect(readResilientRunState(runDir, "c".repeat(64), planDigest)).rejects.toThrow("identity digest mismatch");
    await expect(recordResilientTerminal(runDir, terminal(1, "row-02"))).rejects.toThrow("out of order");
    await Bun.write(join(runDir, "matrix-prefix.json"), JSON.stringify([terminal(1, "row-02")]));
    await expect(readResilientPrefix(runDir, rows)).rejects.toThrow("prefix identity mismatch");
  });

  test("keeps the journal itself value-free apart from caller-owned terminal evidence", async () => {
    const runDir = await temporary();
    await initializeResilientRun({ runDir, identityDigest, planDigest, rows, workerPid: 41004,
      now: "2026-08-26T00:00:00.000Z" });
    const stateText = await readFile(join(runDir, "run-state.json"), "utf8");
    expect(stateText).not.toContain("SKVM_XTY_API_KEY");
    expect(stateText).not.toContain("model output");
  });

  test("allows only one worker to create the initial run authority", async () => {
    const runDir = await temporary();
    const results = await Promise.allSettled([41010, 41011].map((workerPid) => initializeResilientRun({
      runDir, identityDigest, planDigest, rows, workerPid, now: "2026-08-26T00:00:00.000Z",
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect([41010, 41011]).toContain((await readResilientRunState(runDir, identityDigest, planDigest)).workerPid);
  });

  test("runs each frozen row exactly once and never retries an executor failure", async () => {
    const runDir = await temporary();
    await initializeResilientRun({ runDir, identityDigest, planDigest, rows, workerPid: process.pid,
      now: "2026-08-26T00:00:00.000Z" });
    const executed: number[] = [];
    const done = await runResilientRowLoop({
      runDir, identityDigest, planDigest, rows,
      executeRow: async (attempt) => {
        executed.push(attempt.rowIndex);
        return {
          usageAuthority: { available: true as const,
            source: attempt.row.paid ? "execution-envelope" as const : "deterministic-zero" as const },
          entry: { rowIndex: attempt.rowIndex },
          stopAfterTerminal: false,
        };
      },
    });
    expect(done.phase).toBe("done");
    expect(done.dispatchCount).toBe(2);
    expect(executed).toEqual([0, 1]);

    const failedDir = await temporary();
    await initializeResilientRun({ runDir: failedDir, identityDigest, planDigest, rows, workerPid: process.pid,
      now: "2026-08-26T00:00:00.000Z" });
    let calls = 0;
    const failed = await runResilientRowLoop({
      runDir: failedDir, identityDigest, planDigest, rows,
      executeRow: async () => { calls += 1; throw new Error("injected executor crash"); },
    });
    expect(failed.phase).toBe("failed");
    expect(failed.dispatchCount).toBe(1);
    expect(calls).toBe(1);
    await expect(runResilientRowLoop({
      runDir: failedDir, identityDigest, planDigest, rows,
      executeRow: async () => { calls += 1; throw new Error("must not run"); },
    })).rejects.toThrow("failed");
    expect(calls).toBe(1);
  });
});
