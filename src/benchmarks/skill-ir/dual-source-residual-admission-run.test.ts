import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDualSourceResidualAdmission } from "./dual-source-residual-admission-run";
import { sha256Bytes } from "./source-fixture";
import { ExecutionEnvelopeSchema } from "./execution-resilience";
import { StaticDevelopmentV2LockSchema } from "./static-development-v2";
import { buildStaticDevelopmentV2GateReport } from "./static-development-gate-v2";
import type { ScoredAgentRunRow } from "./scoring";

const rootDir = join(import.meta.dir, "../../..");
const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("dual-source residual admission runner", () => {
  test("recomputes the frozen Env Manager v3 gate and records a digest-bound no-residual stop", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "env-v3-residual-admission-"));
    tempDirs.push(outDir);
    const outPath = join(outDir, "residual-admission.json");
    const report = await runDualSourceResidualAdmission({
      rootDir,
      lockPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
      gatePath: "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json",
      envelopesPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
      scoredPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
      mappingCatalogPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/dual-source-repair-mapping.json",
      outPath,
    });

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-repair-evidence/v2",
      policyVersion: "dual-source-residual/v2",
      skillId: "env-manager-v3",
      experimentId: "env-manager-v3-static-fidelity-v1",
      catalogScope: "analysis-only",
      admission: { status: "no-reproducible-residual" },
      records: [],
      repairs: [],
    });
    expect(report.bindings.staticGate.sha256).toBe(sha256Bytes(await readFile(join(
      rootDir, "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json",
    ))));
    expect(JSON.parse(await readFile(outPath, "utf8"))).toEqual(report);
  });

  test("fails closed when the recorded static gate is not the recomputed gate", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "env-v3-residual-admission-tamper-"));
    tempDirs.push(outDir);
    const tamperedGate = join(outDir, "gate.json");
    const gate = JSON.parse(await readFile(
      join(rootDir, "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json"), "utf8",
    ));
    gate.passed = false;
    await Bun.write(tamperedGate, `${JSON.stringify(gate, null, 2)}\n`);

    await expect(runDualSourceResidualAdmission({
      rootDir,
      lockPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
      gatePath: tamperedGate,
      envelopesPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
      scoredPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
      mappingCatalogPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/dual-source-repair-mapping.json",
      outPath: join(outDir, "out.json"),
    })).rejects.toThrow("does not match recomputed gate");
  });

  test("accepts a semantically identical gate regardless of JSON object key order", async () => {
    const outDir = await mkdtemp(join(rootDir, ".tmp-env-v3-residual-admission-order-"));
    tempDirs.push(outDir);
    const reorderedGatePath = join(outDir, "gate.json");
    const gate = JSON.parse(await readFile(
      join(rootDir, "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json"), "utf8",
    )) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(gate).reverse());
    await Bun.write(reorderedGatePath, `${JSON.stringify(reordered, null, 2)}\n`);

    const report = await runDualSourceResidualAdmission({
      rootDir,
      lockPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
      gatePath: reorderedGatePath,
      envelopesPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
      scoredPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
      mappingCatalogPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/dual-source-repair-mapping.json",
      outPath: join(outDir, "out.json"),
    });

    expect(report.admission.status).toBe("no-reproducible-residual");
  });

  test("audits only gate-selected blocks when the result files also contain a scored reserve block", async () => {
    const outDir = await mkdtemp(join(rootDir, ".tmp-env-v3-residual-admission-reserve-"));
    tempDirs.push(outDir);
    const lock = StaticDevelopmentV2LockSchema.parse(JSON.parse(await readFile(join(
      rootDir, "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
    ), "utf8")));
    const envelopeSource = (await readFile(join(
      rootDir, "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
    ), "utf8")).trim().split(/\r?\n/).map((line) => ExecutionEnvelopeSchema.parse(JSON.parse(line)));
    const scoredSource = (await readFile(join(
      rootDir, "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
    ), "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line) as ScoredAgentRunRow);
    const reserveEnvelopes = envelopeSource.filter((row) =>
      row.taskId === lock.matrix.taskIds[0] && row.candidateBlock === 2).map((row) => ({
      ...row,
      candidateBlock: 3,
      attemptId: `${row.taskId}:block-3:${row.system}`,
    }));
    const reserveRows = scoredSource.filter((row) =>
      row.task === lock.matrix.taskIds[0] && row.runIndex === 2).map((row) => ({ ...row, runIndex: 3 }));
    const envelopes = [...envelopeSource, ...reserveEnvelopes];
    const scoredRows = [...scoredSource, ...reserveRows];
    const tasks = JSON.parse(await readFile(join(rootDir, lock.frozenInputs.tasks.path), "utf8")) as {
      tasks: Array<{ id: string; split: string; hardGateIds?: string[] }>;
    };
    const gate = buildStaticDevelopmentV2GateReport({
      lock,
      tasks: tasks.tasks.map((task) => ({
        id: task.id,
        split: task.split,
        hardGateIds: task.hardGateIds ?? [],
      })),
      envelopes,
      scoredRows,
    });
    const envelopesPath = join(outDir, "execution-envelopes.jsonl");
    const scoredPath = join(outDir, "scored-runs.jsonl");
    const gatePath = join(outDir, "gate.json");
    await Promise.all([
      writeFile(envelopesPath, `${envelopes.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8"),
      writeFile(scoredPath, `${scoredRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8"),
      writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8"),
    ]);

    const report = await runDualSourceResidualAdmission({
      rootDir,
      lockPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
      gatePath,
      envelopesPath,
      scoredPath,
      mappingCatalogPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/dual-source-repair-mapping.json",
      outPath: join(outDir, "out.json"),
    });

    expect(gate.selection.selectedTriplets).toBe(4);
    expect(gate.selection.attemptedRows).toBe(15);
    expect(report.admission.status).toBe("no-reproducible-residual");
  });

  test("keeps prospective catalogs on full current-HEAD lock validation", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "env-v3-residual-admission-prospective-"));
    tempDirs.push(outDir);
    const catalogPath = join(outDir, "mapping.json");
    const catalog = JSON.parse(await readFile(join(
      rootDir, "benchmarks/skill-ir/pilots/env-manager/successor-v3/dual-source-repair-mapping.json",
    ), "utf8"));
    catalog.scope = "prospective-development";
    await Bun.write(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

    await expect(runDualSourceResidualAdmission({
      rootDir,
      lockPath: "benchmarks/skill-ir/pilots/env-manager/successor-v3/static-development-lock-v1.json",
      gatePath: "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json",
      envelopesPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
      scoredPath: "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
      mappingCatalogPath: catalogPath,
      outPath: join(outDir, "out.json"),
    })).rejects.toThrow("Static development v2 digest mismatch");
  });
});
