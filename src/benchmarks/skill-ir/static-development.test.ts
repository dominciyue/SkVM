import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildStaticDevelopmentPlan,
  readAndValidateStaticDevelopmentLock,
  validateStaticDevelopmentLock,
} from "./static-development";
import {
  parseStaticDevelopmentRunArgs,
  runStaticDevelopmentPlan,
} from "./static-development-run";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json",
);

async function rawLock(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
}

describe("static development lock", () => {
  test("validates the committed law-to-markdown three-system identity", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-static-development-lock/v1",
      experimentId: "law-to-markdown-static-development-v1",
      methodEvidence: true,
      corpus: "pilot",
      skillId: "law-to-markdown",
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-law-static-v1" },
      matrix: {
        systems: ["no-skill", "original", "ir-static"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["law-to-markdown-statute-dev-001", "law-to-markdown-standard-dev-002"],
        repetitions: 2,
        expectedRows: 12,
        expectedTriplets: 4,
      },
      gate: {
        minimumIrStaticSuccesses: 3,
        minimumIrStaticMeanScore: 0.85,
        maximumInfrastructureFailures: 0,
        maximumHardGateRegressions: 0,
        minimumImprovedPairs: 1,
      },
    });
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution",
      "profile or PGO compilation",
      "artifact promotion",
      "scorer retuning from static development output",
    ]));
    expect(await readFile(lockPath, "utf8")).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("compiles exactly four complete no-skill/original/ir-static triplets", async () => {
    const result = await buildStaticDevelopmentPlan({
      rootDir,
      lockPath,
      outDir: "results/skill-ir/law-to-markdown-static-development-dry-run",
    });
    expect(result.plan).toHaveLength(12);
    expect(result.runArgs.execute).toBe(false);
    expect(new Set(result.plan.map((row) => row.system))).toEqual(new Set([
      "no-skill",
      "original",
      "ir-static",
    ]));
    expect(result.plan.every((row) => row.caseId.includes(":windows:clean:"))).toBe(true);
    const groups = new Map<string, Set<string>>();
    for (const row of result.plan) {
      const key = `${row.caseId}:${row.runIndex}`;
      const systems = groups.get(key) ?? new Set<string>();
      systems.add(row.system);
      groups.set(key, systems);
    }
    expect(groups).toHaveLength(4);
    expect([...groups.values()].every((systems) => systems.size === 3)).toBe(true);
  });

  test("rejects digest drift, held-out tasks, and non-static systems", async () => {
    const digestDrift = await rawLock();
    (digestDrift.frozenInputs as { baseIr: { sha256: string } }).baseIr.sha256 = "0".repeat(64);
    await expect(validateStaticDevelopmentLock(digestDrift, rootDir)).rejects.toThrow("digest mismatch");

    const heldOut = await rawLock();
    (heldOut.matrix as { taskIds: string[] }).taskIds = [
      "law-to-markdown-statute-dev-001",
      "law-to-markdown-regulation-heldout-001",
    ];
    await expect(validateStaticDevelopmentLock(heldOut, rootDir)).rejects.toThrow("non-development");

    const pgo = await rawLock();
    (pgo.matrix as { systems: string[] }).systems = ["no-skill", "original", "ir-pgo"];
    await expect(validateStaticDevelopmentLock(pgo, rootDir)).rejects.toThrow();
  });

  test("rejects a corpus without runnable audited IR identity", async () => {
    const lock = await rawLock();
    const manifest = JSON.parse(await readFile(
      path.join(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
      "utf8",
    )) as { skills: Array<Record<string, unknown>> };
    const skill = manifest.skills.find((entry) => entry.id === "law-to-markdown")!;
    skill.status = "tasks-authored";
    delete skill.sourceAuditPath;
    await expect(validateStaticDevelopmentLock(lock, rootDir, { manifest })).rejects.toThrow("runnable audited IR");
  });

  test("persists a plan-only dry-run and rejects premature execution phases", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "law-static-plan-"));
    try {
      expect(() => parseStaticDevelopmentRunArgs([
        `--lock=${lockPath}`,
        `--out-dir=${outDir}`,
        "--phase=execute",
      ])).toThrow("phase");
      const result = await runStaticDevelopmentPlan({ rootDir, lockPath, outDir, phase: "plan" });
      expect(result).toMatchObject({ phase: "plan", rows: 12 });
      const persisted = JSON.parse(await readFile(path.join(outDir, "plan.json"), "utf8")) as {
        plan: unknown[];
        runArgs: { systems: string[] };
      };
      expect(persisted.plan).toHaveLength(12);
      expect(persisted.runArgs.systems).toEqual(["no-skill", "original", "ir-static"]);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
