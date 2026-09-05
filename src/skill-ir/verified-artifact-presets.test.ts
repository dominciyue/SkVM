import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveArtifactBunExecutable,
  resolveArtifactNodeExecutable,
  runArtifactPreset,
} from "./verified-artifact-presets";

describe("artifact Node executable resolution", () => {
  test("uses an explicit SKVM_NODE before PATH discovery", () => {
    let discoveryCalls = 0;
    const executable = resolveArtifactNodeExecutable({
      env: { SKVM_NODE: "C:\\runtime\\node.exe" },
      which: () => {
        discoveryCalls += 1;
        return "C:\\path\\node.exe";
      },
    });
    expect(executable).toBe("C:\\runtime\\node.exe");
    expect(discoveryCalls).toBe(0);
  });

  test("discovers Node on PATH instead of using the compiled companion executable", () => {
    expect(resolveArtifactNodeExecutable({
      env: {},
      which: (name) => name === "node" ? "C:\\path\\node.exe" : null,
    })).toBe("C:\\path\\node.exe");
  });

  test("fails closed when no Node executable is available", () => {
    expect(() => resolveArtifactNodeExecutable({ env: {}, which: () => null }))
      .toThrow("requires Node.js");
  });

  test("resolves the Bun source runner explicitly and fails closed when unavailable", () => {
    expect(resolveArtifactBunExecutable({
      env: { SKVM_BUN_BIN: "C:\\runtime\\bun.exe" },
      which: () => null,
    })).toBe("C:\\runtime\\bun.exe");
    expect(() => resolveArtifactBunExecutable({ env: {}, which: () => null }))
      .toThrow("requires Bun");
  });
});

describe("verified artifact presets", () => {
  test("runs the frozen API Tester JSON artifact without model or API calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-artifact-preset-"));
    try {
      const result = await runArtifactPreset({
        preset: "api-tester",
        variant: "openapi-json",
        rootDir: process.cwd(),
        workDir: join(root, "workdir"),
        outDir: join(root, "output"),
        completedAt: "2026-09-04T00:00:00.000Z",
      });
      expect(result.status).toBe("passed");
      expect(result.accounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 });
      expect(result.coreBranchDelta).toBe(0);
      expect(result.stageOrder).toEqual([
        "compile",
        "review-or-accept",
        "package",
        "run",
        "cost",
      ]);
      expect(result.quality.result).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runs the frozen API Tester YAML artifact without model or API calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-artifact-preset-yaml-"));
    try {
      const result = await runArtifactPreset({
        preset: "api-tester",
        variant: "openapi-yaml",
        rootDir: process.cwd(),
        workDir: join(root, "workdir"),
        outDir: join(root, "output"),
        completedAt: "2026-09-04T00:00:00.000Z",
      });
      expect(result.status).toBe("passed");
      expect(result.variant).toBe("openapi-yaml");
      expect(result.accounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 });
      expect(result.coreBranchDelta).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("runs the Env Manager machine-checked artifact on fresh directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-env-artifact-preset-"));
    try {
      const result = await runArtifactPreset({
        preset: "env-manager",
        rootDir: process.cwd(),
        workDir: join(root, "workdir"),
        outDir: join(root, "output"),
        completedAt: "2026-09-04T00:00:00.000Z",
      });
      expect(result.status).toBe("passed");
      expect(result.accounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 });
      expect(result.coreBranchDelta).toBe(0);
      expect(result.quality.result).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
