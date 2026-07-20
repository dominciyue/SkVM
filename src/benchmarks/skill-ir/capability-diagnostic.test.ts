import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CapabilityDiagnosticLockSchema,
  readAndValidateCapabilityDiagnosticLock,
  validateCapabilityDiagnosticLock,
} from "./capability-diagnostic";

const rootDir = resolve(import.meta.dir, "../../..");
const lockPath = join(
  rootDir,
  "benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json",
);

async function readLockObject(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
}

describe("env-manager GPT-4.1 capability diagnostic lock", () => {
  test("binds one stronger model to the frozen 12+4+4 development matrix", async () => {
    const lock = await readAndValidateCapabilityDiagnosticLock({ rootDir, lockPath });

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-capability-diagnostic-lock/v1",
      diagnosticId: "env-manager-v2-gpt41-capability-diagnostic-v1",
      purpose: "model-capability-attribution",
      corpus: "pilot",
      skillId: "env-manager",
      model: {
        historicalRoute: "xty/gpt-4.1-mini",
        diagnosticRoute: "xty/gpt-4.1",
        family: "gpt",
      },
      matrix: {
        systems: ["no-skill", "original", "ir-static", "check-only", "one-repair"],
        taskSplit: "development",
        taskIds: [
          "env-manager-node-audit-dev-001",
          "env-manager-vite-audit-dev-002",
        ],
        repetitions: 2,
        baselineRows: 12,
        checkOnlyRows: 4,
        oneRepairRows: 4,
        totalRows: 20,
      },
      developmentGate: {
        minimumSuccesses: 3,
        minimumMeanScore: 0.85,
        maximumHardGateRegressions: 0,
        maximumInfrastructureFailures: 0,
      },
    });
    expect(lock.criteria).toHaveLength(6);
  });

  test("rejects model, held-out, row-count, and gate drift", async () => {
    const original = await readLockObject();
    const mutations = [
      { ...original, model: { historicalRoute: "xty/gpt-4.1-mini", diagnosticRoute: "xty/gpt-4.1-mini", family: "gpt" } },
      { ...original, matrix: { ...(original.matrix as object), taskSplit: "held-out" } },
      { ...original, matrix: { ...(original.matrix as object), totalRows: 19 } },
      { ...original, developmentGate: { ...(original.developmentGate as object), minimumMeanScore: 0.8 } },
    ];

    for (const mutation of mutations) {
      expect(() => CapabilityDiagnosticLockSchema.parse(mutation)).toThrow();
    }
  });

  test("rejects frozen input or runner-lock digest drift", async () => {
    const original = await readLockObject();
    const frozenInputs = original.frozenInputs as Record<string, unknown>;
    const source = frozenInputs.source as Record<string, unknown>;
    const runnerLock = original.runnerArtifactLock as Record<string, unknown>;
    const mutations = [
      {
        ...original,
        frozenInputs: {
          ...frozenInputs,
          source: { ...source, sha256: "0".repeat(64) },
        },
      },
      {
        ...original,
        runnerArtifactLock: { ...runnerLock, sha256: "0".repeat(64) },
      },
    ];

    for (const mutation of mutations) {
      await expect(validateCapabilityDiagnosticLock(mutation, rootDir)).rejects.toThrow(/digest/i);
    }
  });
});
