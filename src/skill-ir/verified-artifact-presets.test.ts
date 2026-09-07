import { describe, expect, test } from "bun:test";
import { access, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  test("runs ordinary API Tester production bindings through an independent checker", async () => {
    for (const name of ["books", "orders"] as const) {
      const root = await mkdtemp(join(tmpdir(), `skvm-api-production-preset-${name}-`));
      try {
        const fixture = join(process.cwd(), "src", "skill-ir", "fixtures", "api-tester-production", name);
        const workDir = join(root, "workdir");
        await cp(fixture, workDir, { recursive: true });
        const result = await runArtifactPreset({
          preset: "api-tester",
          bindingPath: join(fixture, "binding.json"),
          rootDir: process.cwd(),
          workDir,
          outDir: join(root, "output"),
          completedAt: "2026-09-07T00:00:00.000Z",
        });
        expect(result).toMatchObject({
          schemaVersion: "skill-ir-artifact-cli-result/v2",
          status: "passed",
          preset: "api-tester",
          binding: {
            schemaVersion: "skill-ir-api-tester-production-binding/v1",
            supportContractId: "api-tester-openapi-subset-v1",
            mode: "production",
            bindingId: `${name}-api`,
            inputFormat: name === "books" ? "json" : "yaml",
          },
          quality: { mode: "machine-checked", result: "pass" },
          accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
          coreBranchDelta: 0,
        });
        expect(result.variant).toBeUndefined();
        expect(result.binding?.generatorSha256).not.toBe(result.binding?.checkerSha256);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("dispatches a v2 production binding through the v2 runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-api-production-preset-v2-"));
    try {
      const fixture = join(
        process.cwd(),
        "src",
        "skill-ir",
        "fixtures",
        "api-tester-production-v2",
        "local-ref-arrays",
      );
      const workDir = join(root, "workdir");
      await cp(fixture, workDir, { recursive: true });
      const result = await runArtifactPreset({
        preset: "api-tester",
        bindingPath: join(fixture, "binding.json"),
        rootDir: process.cwd(),
        workDir,
        outDir: join(root, "output"),
        completedAt: "2026-09-07T00:00:00.000Z",
      });
      expect(result).toMatchObject({
        schemaVersion: "skill-ir-artifact-cli-result/v2",
        status: "passed",
        preset: "api-tester",
        binding: {
          schemaVersion: "skill-ir-api-tester-production-binding/v2",
          supportContractId: "api-tester-openapi-subset-v2",
          mode: "production",
          bindingId: "local-ref-arrays-api",
          inputFormat: "yaml",
        },
        quality: { mode: "machine-checked", result: "pass" },
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
        coreBranchDelta: 0,
      });
      expect(result.variant).toBeUndefined();
      expect(result.binding?.generatorSha256).not.toBe(result.binding?.checkerSha256);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing, non-string, and unknown production binding versions before creating output", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-api-production-preset-unknown-version-"));
    const bindingPath = join(root, "binding.json");
    const outDir = join(root, "output");
    try {
      const base = {
        bindingId: "unknown-version-api",
        input: { path: "openapi.yaml", format: "yaml" },
        outputs: { plan: "generated/plan.json", report: "generated/report.md" },
      };
      for (const value of [
        base,
        { ...base, schemaVersion: 2 },
        { ...base, schemaVersion: "skill-ir-api-tester-production-binding/v999" },
      ]) {
        await writeFile(bindingPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        await expect(runArtifactPreset({
          preset: "api-tester",
          bindingPath,
          rootDir: root,
          workDir: join(root, "workdir"),
          outDir,
          completedAt: "2026-09-07T00:00:00.000Z",
        })).rejects.toThrow(/API Tester production binding schemaVersion/u);
        await expect(access(outDir)).rejects.toThrow();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
