import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildCapabilityDiagnosticPlans,
  parseCapabilityDiagnosticRunArgs,
  writeCapabilityDiagnosticPlan,
} from "./capability-diagnostic-run";

const rootDir = resolve(import.meta.dir, "../../..");
const lockPath = join(
  rootDir,
  "benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json",
);

describe("GPT-4.1 capability diagnostic dry-run compiler", () => {
  test("builds exactly 12 baseline, 4 check-only, and 4 one-repair rows", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-gpt41-plan-"));
    try {
      const result = await buildCapabilityDiagnosticPlans({ rootDir, lockPath, outDir });

      expect(result.totalRows).toBe(20);
      expect(result.groups.map((group) => [group.label, group.plan.length])).toEqual([
        ["baseline", 12],
        ["check-only", 4],
        ["one-repair", 4],
      ]);
      const rows = result.groups.flatMap((group) => group.plan);
      expect(rows.every((row) => row.model === "xty/gpt-4.1")).toBe(true);
      expect(rows.every((row) => row.caseId.includes(":windows:clean:"))).toBe(true);
      expect(rows.every((row) => !row.caseId.includes("heldout"))).toBe(true);
      expect(result.groups[1]?.args.artifactLockPath).toContain("gpt41-lock.json");
      expect(result.groups[2]?.args.artifactLockPath).toContain("gpt41-lock.json");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("writes a reproducible non-executing plan and rejects execute flags", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-gpt41-plan-"));
    try {
      const result = await writeCapabilityDiagnosticPlan({ rootDir, lockPath, outDir });
      const written = JSON.parse(await readFile(result.planPath, "utf8")) as {
        execute: boolean;
        totalRows: number;
      };

      expect(written).toMatchObject({ execute: false, totalRows: 20 });
      expect(() => parseCapabilityDiagnosticRunArgs([
        `--lock=${lockPath}`,
        `--out-dir=${outDir}`,
        "--execute",
      ])).toThrow(/execute|unknown/i);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
