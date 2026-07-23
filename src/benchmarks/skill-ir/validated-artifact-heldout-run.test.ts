import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  assertValidatedArtifactHeldoutPrerequisites,
  compactValidatedArtifactHeldoutRouteProbe,
  parseValidatedArtifactHeldoutRunArgs,
} from "./validated-artifact-heldout-run";
import { readAndValidateValidatedArtifactHeldoutLock } from "./validated-artifact-heldout";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/"
    + "law-to-markdown-validated-artifact-heldout-lock.json",
);

describe("validated artifact held-out runner", () => {
  test("parses only plan, route-probe, and execute", () => {
    expect(parseValidatedArtifactHeldoutRunArgs([
      `--lock=${lockPath}`,
      "--out-dir=results/skill-ir/test",
      "--phase=plan",
    ])).toMatchObject({ phase: "plan" });
    expect(() => parseValidatedArtifactHeldoutRunArgs([
      `--lock=${lockPath}`,
      "--out-dir=results/skill-ir/test",
      "--phase=development",
    ])).toThrow("phase");
  });

  test("keeps route evidence compact and bound to held-out lineage", () => {
    const route = compactValidatedArtifactHeldoutRouteProbe({
      experimentId: "law-to-markdown-validated-artifact-heldout-v1",
      heldoutLockSha256: "a".repeat(64),
      executionFreezeSha256: "b".repeat(64),
      model: "xty/gpt-5.6-sol",
      caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-regulation-heldout-001",
      execution: {
        exitCode: 0,
        timedOut: false,
        durationMs: 123,
        stdout: "private model output",
        stderr: "D:\\private\\provider.log",
      },
    });
    expect(route.status).toBe("ok");
    expect(route.heldoutLockSha256).toBe("a".repeat(64));
    expect(route.executionFreezeSha256).toBe("b".repeat(64));
    expect(JSON.stringify(route)).not.toContain("private");
  });

  test("requires API, resource, and exact held-out route evidence", async () => {
    const validated = await readAndValidateValidatedArtifactHeldoutLock({ rootDir, lockPath });
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
    const heldoutLockSha256 = "a".repeat(64);
    const executionFreezeSha256 = validated.lock.upstream.executionFreeze.sha256;
    const route = compactValidatedArtifactHeldoutRouteProbe({
      experimentId: validated.lock.experimentId,
      heldoutLockSha256,
      executionFreezeSha256,
      model: validated.lock.model.route,
      caseId: [
        validated.lock.skillId,
        validated.lock.matrix.agents[0],
        validated.lock.matrix.environments[0],
        validated.lock.matrix.contexts[0],
        validated.lock.matrix.taskIds[0],
      ].join(":"),
      execution: { exitCode: 0, timedOut: false, stdout: "", stderr: "" },
    });
    expect(() => assertValidatedArtifactHeldoutPrerequisites({
      lock: validated.lock,
      resource,
      route,
      env: {},
      heldoutLockSha256,
    })).toThrow("API key");
    expect(() => assertValidatedArtifactHeldoutPrerequisites({
      lock: validated.lock,
      resource,
      route: { ...route, heldoutLockSha256: "c".repeat(64) },
      env: { SKVM_XTY_API_KEY: "test-key" },
      heldoutLockSha256,
    })).toThrow("route probe");
    expect(() => assertValidatedArtifactHeldoutPrerequisites({
      lock: validated.lock,
      resource,
      route,
      env: { SKVM_XTY_API_KEY: "test-key" },
      heldoutLockSha256,
    })).not.toThrow();
  });
});
