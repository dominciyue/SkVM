import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildValidatedArtifactDevelopmentPlan } from "./validated-artifact-development";
import {
  assertValidatedArtifactExecutionPrerequisites,
  compactValidatedArtifactRouteProbe,
  parseValidatedArtifactExecutionRunArgs,
  partitionValidatedArtifactExecutionRows,
  toValidatedArtifactGateTasks,
} from "./validated-artifact-development-execution-run";
import {
  readAndValidateValidatedArtifactExecutionFreeze,
} from "./validated-artifact-development-execution-freeze";

const rootDir = path.resolve(import.meta.dir, "../../..");
const freezePath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/"
    + "law-to-markdown-validated-artifact-execution-freeze.json",
);

describe("validated artifact development execution runner", () => {
  test("parses only route-probe and execute phases", () => {
    expect(parseValidatedArtifactExecutionRunArgs([
      `--freeze=${freezePath}`,
      "--out-dir=results/skill-ir/test",
      "--phase=route-probe",
    ])).toMatchObject({ phase: "route-probe" });
    expect(() => parseValidatedArtifactExecutionRunArgs([
      `--freeze=${freezePath}`,
      "--out-dir=results/skill-ir/test",
      "--phase=held-out",
    ])).toThrow("phase");
  });

  test("keeps route probe compact and binds both frozen digests", () => {
    const route = compactValidatedArtifactRouteProbe({
      experimentId: "law-to-markdown-validated-artifact-development-v1",
      parentLockSha256: "a".repeat(64),
      executionFreezeSha256: "b".repeat(64),
      model: "xty/gpt-5.6-sol",
      caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-statute-dev-001",
      execution: {
        exitCode: 0,
        timedOut: false,
        durationMs: 321,
        stdout: "private model output",
        stderr: "D:\\private\\provider.log",
      },
    });

    expect(route.status).toBe("ok");
    expect(route.parentLockSha256).toBe("a".repeat(64));
    expect(route.executionFreezeSha256).toBe("b".repeat(64));
    expect(JSON.stringify(route)).not.toContain("private");
    expect(JSON.stringify(route)).not.toContain("provider.log");
  });

  test("partitions the frozen plan into exactly 12 model and 4 direct rows", async () => {
    const validated = await readAndValidateValidatedArtifactExecutionFreeze({
      rootDir,
      freezePath,
    });
    const outDir = await mkdtemp(path.join(tmpdir(), "validated-artifact-execution-plan-"));
    try {
      const plan = await buildValidatedArtifactDevelopmentPlan({
        rootDir,
        lockPath: path.resolve(rootDir, validated.freeze.parentLock.path),
        outDir,
      });
      const partition = partitionValidatedArtifactExecutionRows(plan, validated.freeze);

      expect(partition.modelRows).toHaveLength(12);
      expect(partition.artifactRows).toHaveLength(4);
      expect(partition.modelRows.every((row) => row.executionClass === "model-agent")).toBe(true);
      expect(partition.artifactRows.every(
        (row) => row.executionClass === "direct-deterministic",
      )).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("requires API, resource, and a route probe bound to both digests", async () => {
    const validated = await readAndValidateValidatedArtifactExecutionFreeze({
      rootDir,
      freezePath,
    });
    const resource = {
      schemaVersion: "skill-ir-resource-probe-result/v1" as const,
      methodEvidence: false as const,
      status: "ok" as const,
      executableSource: "env" as const,
      requiredModules: ["docx", "pdfplumber"],
      exitCode: 0,
      stderrClass: "none" as const,
      durationMs: 1,
    };
    const parentLockSha256 = validated.freeze.parentLock.sha256;
    const executionFreezeSha256 = "b".repeat(64);
    const route = compactValidatedArtifactRouteProbe({
      experimentId: validated.parent.lock.experimentId,
      parentLockSha256,
      executionFreezeSha256,
      model: validated.parent.lock.model.route,
      caseId: [
        validated.parent.lock.skillId,
        validated.parent.lock.matrix.agents[0],
        validated.parent.lock.matrix.environments[0],
        validated.parent.lock.matrix.contexts[0],
        validated.parent.lock.matrix.taskIds[0],
      ].join(":"),
      execution: { exitCode: 0, timedOut: false, stdout: "", stderr: "" },
    });

    expect(() => assertValidatedArtifactExecutionPrerequisites({
      freeze: validated.freeze,
      parentLock: validated.parent.lock,
      resource,
      route,
      env: {},
      parentLockSha256,
      executionFreezeSha256,
    })).toThrow("API key");
    expect(() => assertValidatedArtifactExecutionPrerequisites({
      freeze: validated.freeze,
      parentLock: validated.parent.lock,
      resource: { ...resource, status: "failed" },
      route,
      env: { SKVM_XTY_API_KEY: "test-key" },
      parentLockSha256,
      executionFreezeSha256,
    })).toThrow("resource probe");
    expect(() => assertValidatedArtifactExecutionPrerequisites({
      freeze: validated.freeze,
      parentLock: validated.parent.lock,
      resource,
      route: { ...route, executionFreezeSha256: "c".repeat(64) },
      env: { SKVM_XTY_API_KEY: "test-key" },
      parentLockSha256,
      executionFreezeSha256,
    })).toThrow("route probe");
    expect(() => assertValidatedArtifactExecutionPrerequisites({
      freeze: validated.freeze,
      parentLock: validated.parent.lock,
      resource,
      route,
      env: { SKVM_XTY_API_KEY: "test-key" },
      parentLockSha256,
      executionFreezeSha256,
    })).not.toThrow();
  });

  test("fails closed when a frozen task omits hard-gate metadata", () => {
    expect(() => toValidatedArtifactGateTasks([{
      id: "law-to-markdown-statute-dev-001",
      split: "development",
      prompt: "test",
      successCriteria: [],
    }])).toThrow("hardGateIds");
  });
});
