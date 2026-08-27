import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectReadonlySerialSnapshot,
  readReadonlySerialStatus,
  snapshotReadonlyTree,
  type ReadonlySerialAuthority,
} from "./reviewed-aot-efficiency-readonly-control";
import {
  ReviewedAotEfficiencyPolicySchema,
  buildReviewedAotOriginalPlan,
} from "./reviewed-aot-efficiency-matrix";
import { ResilientEfficiencyPolicySchema } from "./reviewed-aot-efficiency-resilient-policy";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { sha256Bytes } from "./source-fixture";
import { runForegroundSerialRows } from "./reviewed-aot-efficiency-readonly-serial";
import {
  collectReadonlySerialProductionSnapshot,
  readReadonlySerialProductionStatus,
} from "./reviewed-aot-efficiency-readonly-control-run";
import {
  READONLY_SERIAL_EFFICIENCY_FREEZE_PATH,
  READONLY_SERIAL_EFFICIENCY_POLICY_PATH,
  ReadonlySerialEfficiencyPolicySchema,
} from "./reviewed-aot-efficiency-readonly-contract";
import {
  auditReadonlyControlDependencies,
  prepareReadonlySerialRun,
} from "./reviewed-aot-efficiency-readonly-serial-run";

const roots: string[] = [];

async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "reviewed-aot-readonly-test-"));
  roots.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("reviewed-AOT read-only control plane", () => {
  test("has no builder, materializer, or filesystem-mutation dependency", async () => {
    const sources = await Promise.all([
      "reviewed-aot-efficiency-readonly-control.ts",
      "reviewed-aot-efficiency-readonly-contract.ts",
      "reviewed-aot-efficiency-readonly-control-run.ts",
    ].map((path) => readFile(join(import.meta.dir, path), "utf8")));
    const control = sources[0]!;
    const contract = sources[1]!;
    const cli = sources[2]!;
    const closure = `${control}\n${contract}\n${cli}`;
    expect(closure).not.toMatch(/\b(?:buildPlan|buildReviewedAotOriginalPlan|materializeCaseArtifacts)\b/u);
    expect(closure).not.toMatch(/\b(?:writeFile|appendFile|rename|rm|mkdir|copyFile)\b/u);
    expect(control).not.toMatch(/from\s+["']\.\//u);
    expect(contract.match(/from\s+["']\.\//gu)).toHaveLength(1);
    expect(cli.match(/from\s+["']\.\//gu)).toHaveLength(2);
  });

  test("does not misclassify an equal-count import outside the read-only closure", () => {
    const audit = auditReadonlyControlDependencies([
      { path: "reviewed-aot-efficiency-readonly-control.ts", source: "import { x } from './outside-control';" },
      { path: "reviewed-aot-efficiency-readonly-contract.ts", source: "import { x } from './reviewed-aot-efficiency-readonly-control';" },
      { path: "reviewed-aot-efficiency-readonly-control-run.ts", source: [
        "import { x } from './reviewed-aot-efficiency-readonly-contract';",
        "import { y } from './reviewed-aot-efficiency-readonly-control';",
      ].join("\n") },
    ]);
    expect(audit.localImports).toEqual({ total: 4, withinReadonlyClosure: 3, outsideReadonlyClosure: 1 });
    expect(audit.outsideSpecifiers).toEqual(["./outside-control"]);
  });

  test("repeated concurrent status and collect leave a real materialized active tree byte-identical", async () => {
    const rootDir = process.cwd();
    const temporaryRoot = await temporary();
    const activeDir = join(temporaryRoot, "active");
    const v1Policy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-v1.json"), "utf8",
    )));
    const v2Policy = ResilientEfficiencyPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-resilient-v1.json"), "utf8",
    )));
    const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir: activeDir, policy: v1Policy });
    for (const row of originalPlan.rows) {
      if (!row.initialWorkdirManifestPath) throw new Error("qualification original plan has no manifest path");
      await writeInitialWorkdirManifest({ workDir: row.workDir, manifestPath: row.initialWorkdirManifestPath });
    }

    const frozenPath = join(temporaryRoot, "frozen-authority.txt");
    await writeFile(frozenPath, "qualification-authority\n", "utf8");
    const identityDigest = "a".repeat(64);
    const plan = {
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
      experimentId: "readonly-control-qualification",
      identityDigest,
      rows: v2Policy.denominator.orderedRows,
      originalPlan: originalPlan.rows,
      accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
    };
    const planPath = join(activeDir, "plan.json");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const planSha256 = sha256Bytes(await readFile(planPath));
    await writeFile(join(activeDir, "serial-state.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
      experimentId: plan.experimentId,
      identityDigest,
      planSha256,
      phase: "prepared",
      completedRows: 0,
      dispatchCount: 0,
      inFlightRowIndex: null,
      failure: null,
    }, null, 2)}\n`, "utf8");
    await writeFile(join(activeDir, "matrix-prefix.json"), "[]\n", "utf8");

    const authority: ReadonlySerialAuthority = {
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
      experimentId: plan.experimentId,
      identityDigest,
      planSha256,
      rows: v2Policy.denominator.orderedRows,
      frozenFiles: [{ path: "frozen-authority.txt", sha256: sha256Bytes(await readFile(frozenPath)) }],
    };
    const heldSkillPath = originalPlan.rows[0]!.skillPath;
    const heldManifestPath = originalPlan.rows[0]!.initialWorkdirManifestPath;
    if (!heldSkillPath || !heldManifestPath) throw new Error("qualification original plan has no skill or manifest path");
    const heldPaths = [
      originalPlan.rows[0]!.taskPath,
      heldSkillPath,
      heldManifestPath,
    ];
    const holderScript = [
      "const fs = require('node:fs');",
      "const handles = process.argv.slice(1).map((path) => fs.openSync(path, 'r'));",
      "process.stdout.write('ready\\n');",
      "setTimeout(() => { for (const handle of handles) fs.closeSync(handle); }, 30000);",
    ].join("");
    const holder = Bun.spawn([process.execPath, "-e", holderScript, ...heldPaths], {
      cwd: rootDir, stdout: "pipe", stderr: "pipe", windowsHide: true,
    });
    const reader = holder.stdout.getReader();
    const ready = await reader.read();
    expect(new TextDecoder().decode(ready.value)).toContain("ready");

    try {
      const before = await snapshotReadonlyTree(activeDir);
      const observations = await Promise.all(Array.from({ length: 24 }, (_, index) => index % 2 === 0
        ? readReadonlySerialStatus({ rootDir: temporaryRoot, activeDir, authority })
        : collectReadonlySerialSnapshot({ rootDir: temporaryRoot, activeDir, authority })));
      expect(observations).toHaveLength(24);
      expect(observations.every((entry) => entry.completedRows === 0 && entry.dispatchCount === 0)).toBe(true);
      const after = await snapshotReadonlyTree(activeDir);
      expect(after).toEqual(before);
    } finally {
      holder.kill();
      await holder.exited;
    }
  }, 30_000);

  test("fails closed on frozen-byte, plan, and prefix identity drift without repairing files", async () => {
    const rootDir = await temporary();
    const activeDir = join(rootDir, "active");
    await Bun.write(join(rootDir, "frozen.txt"), "original\n");
    const rows = [{
      taskId: "env-manager-scorer-authority-node-dev-001" as const,
      repetition: 1 as const,
      system: "original" as const,
      paid: true,
    }];
    const identityDigest = "b".repeat(64);
    await Bun.write(join(activeDir, "plan.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
      experimentId: "readonly-control-qualification", identityDigest, rows, originalPlan: [],
      accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
    })}\n`);
    const planSha256 = sha256Bytes(await readFile(join(activeDir, "plan.json")));
    await Bun.write(join(activeDir, "serial-state.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
      experimentId: "readonly-control-qualification", identityDigest, planSha256,
      phase: "prepared", completedRows: 0, dispatchCount: 0, inFlightRowIndex: null, failure: null,
    })}\n`);
    await Bun.write(join(activeDir, "matrix-prefix.json"), "[]\n");
    const authority: ReadonlySerialAuthority = {
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
      experimentId: "readonly-control-qualification", identityDigest, planSha256, rows,
      frozenFiles: [{ path: "frozen.txt", sha256: sha256Bytes(await readFile(join(rootDir, "frozen.txt"))) }],
    };
    await Bun.write(join(rootDir, "frozen.txt"), "mutated\n");
    await expect(readReadonlySerialStatus({ rootDir, activeDir, authority })).rejects.toThrow("frozen byte digest mismatch");
    expect(await Bun.file(join(rootDir, "frozen.txt")).text()).toBe("mutated\n");

    await Bun.write(join(rootDir, "frozen.txt"), "original\n");
    const originalPlanBytes = await readFile(join(activeDir, "plan.json"));
    await Bun.write(join(activeDir, "plan.json"), `${originalPlanBytes.toString("utf8")} `);
    await expect(readReadonlySerialStatus({ rootDir, activeDir, authority })).rejects.toThrow("plan digest mismatch");
    expect(await Bun.file(join(activeDir, "plan.json")).text()).toEndWith(" ");

    await Bun.write(join(activeDir, "plan.json"), originalPlanBytes);
    await Bun.write(join(activeDir, "matrix-prefix.json"), `${JSON.stringify([{
      row: { ...rows[0], repetition: 2 }, raw: {}, scored: {}, originalEnvelope: null, scorerDurationMs: 0,
    }])}\n`);
    await Bun.write(join(activeDir, "serial-state.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
      experimentId: "readonly-control-qualification", identityDigest, planSha256,
      phase: "running", completedRows: 0, dispatchCount: 1, inFlightRowIndex: 0, failure: null,
    })}\n`);
    await expect(readReadonlySerialStatus({ rootDir, activeDir, authority })).rejects.toThrow("prefix identity drift");
    expect(JSON.parse(await Bun.file(join(activeDir, "matrix-prefix.json")).text())).toHaveLength(1);
  });

  test("production status and collect validate the frozen transitive closure without changing a prepared tree", async () => {
    const rootDir = process.cwd();
    const activeDir = await temporary();
    const freezeBytes = await readFile(join(rootDir, READONLY_SERIAL_EFFICIENCY_FREEZE_PATH));
    const policy = ReadonlySerialEfficiencyPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH), "utf8",
    )));
    const identityDigest = sha256Bytes(freezeBytes);
    const planPath = join(activeDir, "plan.json");
    await Bun.write(planPath, `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
      experimentId: policy.experimentId,
      identityDigest,
      rows: policy.denominator.orderedRows,
      originalPlan: [],
      accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
    })}\n`);
    const planSha256 = sha256Bytes(await readFile(planPath));
    await Bun.write(join(activeDir, "serial-state.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
      experimentId: policy.experimentId, identityDigest, planSha256,
      phase: "prepared", completedRows: 0, dispatchCount: 0, inFlightRowIndex: null, failure: null,
    })}\n`);
    await Bun.write(join(activeDir, "matrix-prefix.json"), "[]\n");
    const before = await snapshotReadonlyTree(activeDir);
    const [status, collected] = await Promise.all([
      readReadonlySerialProductionStatus({ rootDir, activeDir }),
      collectReadonlySerialProductionSnapshot({ rootDir, activeDir }),
    ]);
    const after = await snapshotReadonlyTree(activeDir);
    expect(status).toMatchObject({ phase: "prepared", completedRows: 0, dispatchCount: 0 });
    expect(collected.entries).toEqual([]);
    expect(after).toEqual(before);
  });

  test("prepares the exact production plan and bundle with zero model calls before any credential check", async () => {
    const rootDir = process.cwd();
    const activeDir = join(await temporary(), "prepared-active");
    const result = await prepareReadonlySerialRun(rootDir, activeDir);
    expect(result).toMatchObject({ status: "prepared", rows: 8, paidCalls: 0, matrixExecuted: false, retries: 0 });
    const plan = JSON.parse(await readFile(join(activeDir, "plan.json"), "utf8")) as {
      originalPlan: unknown[];
      preparedBundle?: { relativePath: string; sha256: string };
    };
    expect(plan.originalPlan).toHaveLength(4);
    expect(plan.preparedBundle?.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const status = await readReadonlySerialProductionStatus({ rootDir, activeDir });
    expect(status).toMatchObject({ phase: "prepared", completedRows: 0, dispatchCount: 0 });
  }, 30_000);
});

describe("reviewed-AOT minimal foreground serial executor", () => {
  async function serialFixture() {
    const rootDir = await temporary();
    const activeDir = join(rootDir, "active");
    const frozenPath = join(rootDir, "frozen.txt");
    await Bun.write(frozenPath, "frozen\n");
    const rows = [
      { taskId: "env-manager-scorer-authority-node-dev-001" as const, repetition: 1 as const,
        system: "original" as const, paid: true },
      { taskId: "env-manager-scorer-authority-node-dev-001" as const, repetition: 1 as const,
        system: "reviewed-aot" as const, paid: false },
    ];
    const identityDigest = "c".repeat(64);
    const planPath = join(activeDir, "plan.json");
    await Bun.write(planPath, `${JSON.stringify({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
      experimentId: "serial-executor-qualification", identityDigest, rows, originalPlan: [],
      accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
    })}\n`);
    const planSha256 = sha256Bytes(await readFile(planPath));
    const authority: ReadonlySerialAuthority = {
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
      experimentId: "serial-executor-qualification", identityDigest, planSha256, rows,
      frozenFiles: [{ path: "frozen.txt", sha256: sha256Bytes(await readFile(frozenPath)) }],
    };
    const freshState = {
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
      experimentId: authority.experimentId, identityDigest, planSha256,
      phase: "prepared", completedRows: 0, dispatchCount: 0, inFlightRowIndex: null, failure: null,
    };
    await Bun.write(join(activeDir, "serial-state.json"), `${JSON.stringify(freshState)}\n`);
    await Bun.write(join(activeDir, "matrix-prefix.json"), "[]\n");
    return { rootDir, activeDir, authority, rows, freshState };
  }

  const entryFor = (row: ReadonlySerialAuthority["rows"][number]) => ({
    row, raw: { durationMs: 1 }, scored: { success: true, evaluatorScore: 1 },
    originalEnvelope: row.paid ? { usage: { available: true, input: 10, output: 2, cacheRead: 3, cacheWrite: 0 } } : null,
    scorerDurationMs: 1,
  });

  test("dispatches each row once, commits one atomic prefix, and finishes without an observer", async () => {
    const fixture = await serialFixture();
    const executed: number[] = [];
    const state = await runForegroundSerialRows({
      rootDir: fixture.rootDir, activeDir: fixture.activeDir, authority: fixture.authority,
      executeRow: async (row, rowIndex) => { executed.push(rowIndex); return { entry: entryFor(row), stopAfterCommit: false }; },
    });
    expect(state).toMatchObject({ phase: "done", completedRows: 2, dispatchCount: 2, inFlightRowIndex: null });
    expect(executed).toEqual([0, 1]);
    const collected = await collectReadonlySerialSnapshot(fixture);
    expect(collected.entries).toHaveLength(2);
  });

  test("reconciles only a terminal already present in the prefix, then runs the next row", async () => {
    const fixture = await serialFixture();
    await Bun.write(join(fixture.activeDir, "serial-state.json"), `${JSON.stringify({
      ...fixture.freshState, phase: "running", dispatchCount: 1, inFlightRowIndex: 0,
    })}\n`);
    await Bun.write(join(fixture.activeDir, "matrix-prefix.json"), `${JSON.stringify([entryFor(fixture.rows[0]!)])}\n`);
    const executed: number[] = [];
    const state = await runForegroundSerialRows({
      rootDir: fixture.rootDir, activeDir: fixture.activeDir, authority: fixture.authority,
      executeRow: async (row, rowIndex) => { executed.push(rowIndex); return { entry: entryFor(row), stopAfterCommit: false }; },
    });
    expect(state).toMatchObject({ phase: "done", completedRows: 2, dispatchCount: 2 });
    expect(executed).toEqual([1]);
  });

  test("fails closed without redispatch when a row was dispatched but no terminal prefix exists", async () => {
    const fixture = await serialFixture();
    await Bun.write(join(fixture.activeDir, "serial-state.json"), `${JSON.stringify({
      ...fixture.freshState, phase: "running", dispatchCount: 1, inFlightRowIndex: 0,
    })}\n`);
    let calls = 0;
    const state = await runForegroundSerialRows({
      rootDir: fixture.rootDir, activeDir: fixture.activeDir, authority: fixture.authority,
      executeRow: async (row) => { calls += 1; return { entry: entryFor(row), stopAfterCommit: false }; },
    });
    expect(state.phase).toBe("failed");
    expect(state.failure).toContain("dispatched-without-terminal");
    expect(state.dispatchCount).toBe(1);
    expect(calls).toBe(0);
  });
});
