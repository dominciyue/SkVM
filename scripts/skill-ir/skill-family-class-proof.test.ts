import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASS_PROOF_IDENTITY, CLASS_PROOF_RESULT_RELATIVE, runStatus } from "./skill-family-class-proof";

describe("skill-family class-proof status", () => {
  test("returns and persists a planned status without external work", async () => {
    const root = await mkdtemp(join(tmpdir(), "class-proof-status-"));
    try {
      const status = await runStatus(root);
      expect(status.identity).toBe(CLASS_PROOF_IDENTITY);
      expect(status.planRevision).toBe(1);
      expect(status.currentStep).toBe("planned");
      expect(status.lastCompletedStep).toBeNull();
      expect(status.externalAccounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 });
      expect(status.protectedReads).toEqual({ heldOut: 0, q1Reserved: 0, historicalResultsChanged: false });
      expect(JSON.parse(await readFile(join(root, CLASS_PROOF_RESULT_RELATIVE, "execution-status.json"), "utf8"))).toEqual(status);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
