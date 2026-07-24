import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { customEvaluators, registerCustomEvaluator } from "../../framework/types";
import {
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "../../bench/evaluators";
import {
  hashAuditFixtureDirectory,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit";
import {
  parseBenchmarkContractAuditArgs,
  runBenchmarkContractAudit,
} from "./benchmark-contract-audit-run";
import { sha256Bytes } from "./source-fixture";

const roots: string[] = [];
const evaluatorId = "skill-ir-contract-audit-test";

async function fixture(): Promise<{
  root: string;
  manifest: BenchmarkContractAuditManifest;
}> {
  const root = await mkdtemp(join(tmpdir(), "skvm-contract-audit-run-"));
  roots.push(root);
  await mkdir(join(root, "pilot", "source"), { recursive: true });
  await mkdir(join(root, "pilot", "audit-fixtures", "alternative"), { recursive: true });
  const taskPath = "pilot/tasks.json";
  const scorerPath = "pilot/scorer.ts";
  const sourcePath = "pilot/source/SKILL.md";
  const taskBytes = Buffer.from(JSON.stringify({
    skillId: "demo",
    tasks: [{
      id: "demo-dev",
      split: "development",
      prompt: "Create output.json with a public name field.",
      fixtures: {},
      eval: [{
        method: "custom",
        id: "demo-output",
        evaluatorId,
        payload: { check: "name" },
      }],
      hardGateIds: ["demo-output"],
    }],
  }));
  const scorerBytes = Buffer.from("const requiredField = 'name';\n");
  const sourceBytes = Buffer.from("Any non-empty name is valid.\n");
  await writeFile(join(root, taskPath), taskBytes);
  await writeFile(join(root, scorerPath), scorerBytes);
  await writeFile(join(root, sourcePath), sourceBytes);
  await writeFile(
    join(root, "pilot", "audit-fixtures", "alternative", "output.json"),
    "{\"name\":\"different-but-valid\"}\n",
  );
  const fixtureSha256 = await hashAuditFixtureDirectory(
    join(root, "pilot", "audit-fixtures", "alternative"),
  );
  return {
    root,
    manifest: {
      schemaVersion: "skill-ir-benchmark-contract-audit/v1",
      auditId: "demo-v1",
      skillId: "demo",
      tasks: { path: taskPath, sha256: sha256Bytes(taskBytes) },
      scorer: {
        path: scorerPath,
        sha256: sha256Bytes(scorerBytes),
        evaluatorId,
      },
      sources: [{ path: sourcePath, sha256: sha256Bytes(sourceBytes) }],
      scope: { split: "development", taskIds: ["demo-dev"] },
      criteria: [{
        id: "demo-output",
        hardGate: true,
        taskIds: ["demo-dev"],
        requirementIds: ["name-contract"],
      }],
      requirements: [{
        id: "name-contract",
        class: "semantic-invariant",
        equivalence: "semantic-equivalence",
        criterionIds: ["demo-output"],
        contractTokens: ["name"],
        scorerAnchors: [{ quote: "requiredField = 'name'" }],
        publicEvidence: [{
          kind: "task-prompt",
          taskIds: ["demo-dev"],
          quote: "public name field",
        }],
        canaryIds: ["alternative-name"],
      }],
      canaries: [{
        id: "alternative-name",
        taskId: "demo-dev",
        criterionId: "demo-output",
        role: "alternative-valid",
        fixturePath: "pilot/audit-fixtures/alternative",
        fixtureSha256,
        expectedPass: true,
      }],
    },
  };
}

afterEach(async () => {
  customEvaluators.delete(evaluatorId);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("benchmark contract audit runner", () => {
  test("parses explicit manifest and output paths", () => {
    expect(parseBenchmarkContractAuditArgs([
      "--manifest=pilot/audit.json",
      "--out=results/audit.json",
    ])).toEqual({
      manifest: "pilot/audit.json",
      out: "results/audit.json",
    });
    expect(() => parseBenchmarkContractAuditArgs(["--unknown=x"])).toThrow(
      "Unknown argument",
    );
  });

  test("executes an alternative-valid canary with the registered evaluator", async () => {
    const { root, manifest } = await fixture();
    registerCustomEvaluator(evaluatorId, {
      async run({ runResult }) {
        const output = JSON.parse(
          await readFile(join(runResult.workDir, "output.json"), "utf8"),
        ) as { name?: string };
        return {
          pass: typeof output.name === "string" && output.name.length > 0,
          score: 1,
          details: "test detail must not be serialized",
        };
      },
    });

    const evaluator = customEvaluators.get(evaluatorId)!;
    const report = await runBenchmarkContractAudit(manifest, root, {
      evaluatorSourcePaths: new Map([[evaluatorId, manifest.scorer.path]]),
      evaluatorSourceDigests: new Map([[evaluatorId, manifest.scorer.sha256]]),
      evaluatorImplementations: new Map([[evaluatorId, evaluator]]),
    });

    expect(report.status).toBe("passed");
    expect(report.staticStatus).toBe("passed");
    expect(report.provenance.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.canaries).toEqual([{
      id: "alternative-name",
      role: "alternative-valid",
      expectedPass: true,
      actualPass: true,
      status: "matched",
    }]);
    expect(JSON.stringify(report)).not.toContain("test detail");
    expect(JSON.stringify(report)).not.toContain("different-but-valid");
  });

  test("fails when a scorer rejects a publicly valid alternative", async () => {
    const { root, manifest } = await fixture();
    registerCustomEvaluator(evaluatorId, {
      async run() {
        return { pass: false, score: 0, details: "private exact implementation only" };
      },
    });

    const evaluator = customEvaluators.get(evaluatorId)!;
    const report = await runBenchmarkContractAudit(manifest, root, {
      evaluatorSourcePaths: new Map([[evaluatorId, manifest.scorer.path]]),
      evaluatorSourceDigests: new Map([[evaluatorId, manifest.scorer.sha256]]),
      evaluatorImplementations: new Map([[evaluatorId, evaluator]]),
    });

    expect(report.status).toBe("failed");
    expect(report.canaries[0]).toMatchObject({
      status: "mismatched",
      actualPass: false,
    });
    expect(report.issues).toContainEqual({
      code: "CANARY_OUTCOME_MISMATCH",
      subjectId: "alternative-name",
    });
  });

  test("fails closed when the evaluator is unavailable", async () => {
    const { root, manifest } = await fixture();

    const report = await runBenchmarkContractAudit(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.canaries[0]).toMatchObject({ status: "infrastructure" });
    expect(report.issues).toContainEqual({
      code: "CANARY_INFRASTRUCTURE",
      subjectId: "alternative-name",
    });
  });

  test("returns a failed report when the bound task snapshot is unavailable", async () => {
    const { root, manifest } = await fixture();
    await rm(join(root, manifest.tasks.path), { force: true });

    const report = await runBenchmarkContractAudit(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.canaries[0]).toMatchObject({ status: "infrastructure" });
  });

  test("keeps production evaluator source digest declarations current", async () => {
    for (const [id, path] of customEvaluatorSourcePaths) {
      expect(customEvaluatorSourceDigests.get(id)).toBe(
        sha256Bytes(await readFile(path)),
      );
    }
  });

  test("fails closed when registry implementation and scorer source identity diverge", async () => {
    const { root, manifest } = await fixture();
    registerCustomEvaluator(evaluatorId, {
      async run() {
        return { pass: true, score: 1, details: "unbound implementation" };
      },
    });
    const evaluator = customEvaluators.get(evaluatorId)!;

    const wrongSource = await runBenchmarkContractAudit(manifest, root, {
      evaluatorSourcePaths: new Map([[evaluatorId, "another/scorer.ts"]]),
      evaluatorSourceDigests: new Map([[evaluatorId, manifest.scorer.sha256]]),
      evaluatorImplementations: new Map([[evaluatorId, evaluator]]),
    });
    const wrongImplementation = await runBenchmarkContractAudit(manifest, root, {
      evaluatorSourcePaths: new Map([[evaluatorId, manifest.scorer.path]]),
      evaluatorSourceDigests: new Map([[evaluatorId, manifest.scorer.sha256]]),
      evaluatorImplementations: new Map(),
    });
    const wrongDigest = await runBenchmarkContractAudit(manifest, root, {
      evaluatorSourcePaths: new Map([[evaluatorId, manifest.scorer.path]]),
      evaluatorSourceDigests: new Map([[evaluatorId, "0".repeat(64)]]),
      evaluatorImplementations: new Map([[evaluatorId, evaluator]]),
    });

    expect(wrongSource.issues).toContainEqual({
      code: "CANARY_INFRASTRUCTURE",
      subjectId: "alternative-name",
    });
    expect(wrongImplementation.issues).toContainEqual({
      code: "CANARY_INFRASTRUCTURE",
      subjectId: "alternative-name",
    });
    expect(wrongDigest.issues).toContainEqual({
      code: "CANARY_INFRASTRUCTURE",
      subjectId: "alternative-name",
    });
  });
});
