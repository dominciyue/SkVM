import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MAGPIE_RELEASE_AUDIT_CASE_IDS } from "./magpie-release-audit-step2";
import {
  initializeStageMSerialRun,
  readStageMSerialRun,
  runStageMSerialRun,
  type StageMPlannedRow,
} from "./stage-m-frozen-magpie-panel-run";

const digest = "a".repeat(64);

function rows(): StageMPlannedRow[] {
  return MAGPIE_RELEASE_AUDIT_CASE_IDS.slice(0, 3).map((caseId, index) => ({
    kind: "model" as const,
    phase: "qualification" as const,
    ordinal: index + 1,
    family: "gpt" as const,
    route: "xty/gpt-5.6-sol",
    caseId,
    repetition: 1 as const,
    paid: true as const,
    retries: 0 as const,
  }));
}

describe("Stage M serial owner", () => {
  test("keeps a terminal failed row in the denominator and continues later rows", async () => {
    const activeDir = await mkdtemp(path.join(os.tmpdir(), "stage-m-serial-"));
    try {
      const planned = rows();
      await initializeStageMSerialRun({ activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned, preparedFiles: [] });
      const calls: number[] = [];
      const state = await runStageMSerialRun({
        activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned,
        executeRow: async (row, index) => {
          calls.push(index);
          return {
            kind: "model" as const,
            phase: "qualification" as const,
            attemptId: `qualification-row-${index + 1}`,
            row: row as Extract<typeof row, { kind: "model" }>,
            result: {
              family: "gpt" as const, route: "xty/gpt-5.6-sol", caseId: row.caseId,
              status: index === 1 ? "failed" as const : "complete" as const,
              classification: index === 1 ? "runtime-crash" as const : "semantic-complete" as const,
              usage: { available: index !== 1, input: index === 1 ? 0 : 1, output: index === 1 ? 0 : 1, cacheRead: 0, cacheWrite: 0 },
              durationMs: 1, passed: index !== 1, failures: index === 1 ? ["runtime crash"] : [],
              outputSha256: digest, ...(index === 1 ? { detail: "runtime crash" } : {}),
            },
          };
        },
      });
      expect(state.phase).toBe("done");
      expect(calls).toEqual([0, 1, 2]);
      const observed = await readStageMSerialRun({ activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned });
      expect(observed.prefix).toHaveLength(3);
      expect(observed.prefix[1]?.result.status).toBe("failed");
    } finally {
      await rm(activeDir, { recursive: true, force: true });
    }
  });

  test("never redispatches an attempt that failed before a terminal record", async () => {
    const activeDir = await mkdtemp(path.join(os.tmpdir(), "stage-m-no-retry-"));
    try {
      const planned = rows();
      await initializeStageMSerialRun({ activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned, preparedFiles: [] });
      const first = await runStageMSerialRun({
        activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned,
        executeRow: async () => { throw new Error("controller lost terminal"); },
      });
      expect(first.phase).toBe("failed");
      expect(first.dispatchCount).toBe(1);
      let redispatched = 0;
      const second = await runStageMSerialRun({
        activeDir, experimentId: "stage-m", lockSha256: digest, rows: planned,
        executeRow: async () => { redispatched += 1; throw new Error("must not run"); },
      });
      expect(second.phase).toBe("failed");
      expect(redispatched).toBe(0);
    } finally {
      await rm(activeDir, { recursive: true, force: true });
    }
  });
});
