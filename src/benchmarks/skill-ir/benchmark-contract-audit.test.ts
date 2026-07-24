import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BenchmarkContractAuditManifestSchema,
  auditBenchmarkContract,
  hashAuditFixtureDirectory,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit";
import { sha256Bytes } from "./source-fixture";

const roots: string[] = [];

async function fixture(): Promise<{
  root: string;
  manifest: BenchmarkContractAuditManifest;
}> {
  const root = await mkdtemp(join(tmpdir(), "skvm-contract-audit-"));
  roots.push(root);
  await mkdir(join(root, "pilot", "source"), { recursive: true });
  await mkdir(join(root, "pilot", "audit-fixtures", "alternative"), { recursive: true });

  const taskPath = "pilot/tasks.json";
  const scorerPath = "pilot/scorer.ts";
  const sourcePath = "pilot/source/SKILL.md";
  const taskBytes = Buffer.from(JSON.stringify({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "demo",
    tasks: [{
      id: "demo-dev-001",
      split: "development",
      prompt: "Create output.json with a public name field.",
      fixtures: { "input.txt": "public input" },
      eval: [{
        method: "custom",
        id: "demo-output",
        name: "Output follows the public contract",
        weight: 1,
        evaluatorId: "demo-evaluator",
        payload: { hidden: "never-public-evidence" },
      }],
      hardGateIds: ["demo-output"],
      passThreshold: 1,
    }, {
      id: "demo-heldout-001",
      split: "held-out",
      prompt: "held-out canary",
      fixtures: {},
      eval: [],
      hardGateIds: [],
      passThreshold: 1,
    }],
  }, null, 2));
  const scorerBytes = Buffer.from("const requiredField = 'name';\n");
  const sourceBytes = Buffer.from("The output may choose any string value for the public name field.\n");
  await writeFile(join(root, taskPath), taskBytes);
  await writeFile(join(root, scorerPath), scorerBytes);
  await writeFile(join(root, sourcePath), sourceBytes);
  await writeFile(
    join(root, "pilot", "audit-fixtures", "alternative", "output.json"),
    "{\"name\":\"alternative\"}\n",
  );
  const fixtureSha256 = await hashAuditFixtureDirectory(
    join(root, "pilot", "audit-fixtures", "alternative"),
  );

  return {
    root,
    manifest: {
      schemaVersion: "skill-ir-benchmark-contract-audit/v1",
      auditId: "demo-contract-v1",
      skillId: "demo",
      tasks: { path: taskPath, sha256: sha256Bytes(taskBytes) },
      scorer: {
        path: scorerPath,
        sha256: sha256Bytes(scorerBytes),
        evaluatorId: "demo-evaluator",
      },
      sources: [{ path: sourcePath, sha256: sha256Bytes(sourceBytes) }],
      scope: { split: "development", taskIds: ["demo-dev-001"] },
      criteria: [{
        id: "demo-output",
        hardGate: true,
        taskIds: ["demo-dev-001"],
        requirementIds: ["demo-name-field"],
      }],
      requirements: [{
        id: "demo-name-field",
        class: "semantic-invariant",
        equivalence: "semantic-equivalence",
        criterionIds: ["demo-output"],
        contractTokens: ["name"],
        scorerAnchors: [{ quote: "requiredField = 'name'" }],
        publicEvidence: [{
          kind: "task-prompt",
          taskIds: ["demo-dev-001"],
          quote: "public name field",
        }],
        canaryIds: ["demo-alternative"],
      }],
      canaries: [{
        id: "demo-alternative",
        taskId: "demo-dev-001",
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
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("benchmark contract audit", () => {
  test("accepts a complete development-only dual-evidence contract", async () => {
    const { root, manifest } = await fixture();
    const report = await auditBenchmarkContract(manifest, root);

    expect(report.status).toBe("passed");
    expect(report.issues).toEqual([]);
    expect(report.counts).toEqual({
      tasks: 1,
      criteria: 1,
      requirements: 1,
      canaries: 1,
    });
  });

  test("fails closed on criterion and hard-gate drift", async () => {
    const { root, manifest } = await fixture();
    manifest.criteria[0]!.hardGate = false;
    manifest.criteria[0]!.id = "invented-criterion";

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.code)).toContain("CRITERION_REGISTRY_DRIFT");
    expect(report.issues.map((issue) => issue.code)).toContain("HARD_GATE_DRIFT");
  });

  test("checks criterion and hard-gate identity on every development task", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as { tasks: Array<{ id: string; split: string }> };
    taskSet.tasks[1]!.split = "development";
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.scope.taskIds.push("demo-heldout-001");
    manifest.criteria[0]!.taskIds.push("demo-heldout-001");

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "CRITERION_REGISTRY_DRIFT",
      subjectId: "demo-heldout-001",
    });
    expect(report.issues).toContainEqual({
      code: "HARD_GATE_DRIFT",
      subjectId: "demo-heldout-001",
    });
  });

  test("rejects scorer identity drift and held-out public evidence", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as {
      tasks: Array<{
        id: string;
        eval: Array<{ evaluatorId: string }>;
      }>;
    };
    taskSet.tasks[0]!.eval[0]!.evaluatorId = "another-evaluator";
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.requirements[0]!.publicEvidence = [{
      kind: "task-prompt",
      taskIds: ["demo-heldout-001"],
      quote: "held-out canary",
    }];

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues.map((issue) => issue.code)).toContain("SCORER_IDENTITY_DRIFT");
    expect(report.issues.map((issue) => issue.code)).toContain("PUBLIC_EVIDENCE_MISSING");
  });

  test("rejects evaluator, IR, package, result, held-out, and model-output evidence kinds", () => {
    for (const kind of [
      "evaluator-payload",
      "base-ir",
      "artifact-package",
      "result",
      "held-out",
      "model-output",
    ]) {
      const parsed = BenchmarkContractAuditManifestSchema.safeParse({
        schemaVersion: "skill-ir-benchmark-contract-audit/v1",
        auditId: "invalid",
        skillId: "demo",
        tasks: { path: "tasks.json", sha256: "a".repeat(64) },
        scorer: {
          path: "scorer.ts",
          sha256: "b".repeat(64),
          evaluatorId: "demo",
        },
        sources: [],
        scope: { split: "development", taskIds: ["demo-dev"] },
        criteria: [{
          id: "demo",
          hardGate: false,
          taskIds: ["demo-dev"],
          requirementIds: ["req"],
        }],
        requirements: [{
          id: "req",
          class: "presence",
          equivalence: "exact-public-contract",
          criterionIds: ["demo"],
          contractTokens: ["x"],
          scorerAnchors: [{ quote: "x" }],
          publicEvidence: [{ kind, quote: "x" }],
          canaryIds: [],
        }],
        canaries: [],
      });
      expect(parsed.success).toBe(false);
    }
  });

  test("fails when an exact scorer token is absent from public evidence", async () => {
    const { root, manifest } = await fixture();
    manifest.requirements[0] = {
      ...manifest.requirements[0]!,
      class: "closed-enum",
      equivalence: "exact-public-contract",
      contractTokens: ["private-enum-value"],
      canaryIds: [],
    };
    manifest.canaries = [];

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.code)).toContain("EXACT_CONTRACT_NOT_PUBLIC");
  });

  test("checks exact public contracts on every criterion task branch", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as {
      tasks: Array<{
        id: string;
        split: string;
        prompt: string;
        fixtures: Record<string, string>;
        eval: unknown[];
        hardGateIds: string[];
      }>;
    };
    taskSet.tasks[1] = {
      ...taskSet.tasks[0]!,
      id: "demo-dev-002",
      split: "development",
      prompt: "Create output.json without declaring the private token.",
    };
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.scope.taskIds.push("demo-dev-002");
    manifest.criteria[0]!.taskIds.push("demo-dev-002");
    manifest.requirements[0] = {
      ...manifest.requirements[0]!,
      equivalence: "exact-public-contract",
      contractTokens: ["public name field"],
      publicEvidence: [{
        kind: "task-prompt",
        taskIds: ["demo-dev-001"],
        quote: "public name field",
      }],
      canaryIds: [],
    };
    manifest.canaries = [];

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "EXACT_CONTRACT_NOT_PUBLIC",
      subjectId: "demo-name-field@demo-dev-002",
    });
  });

  test("allows a requirement to declare a narrower criterion task scope", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as {
      tasks: Array<{
        id: string;
        split: string;
        prompt: string;
        fixtures: Record<string, string>;
        eval: unknown[];
        hardGateIds: string[];
      }>;
    };
    taskSet.tasks[1] = {
      ...taskSet.tasks[0]!,
      id: "demo-dev-002",
      split: "development",
      prompt: "Create output.json without the first task's extra contract.",
    };
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.scope.taskIds.push("demo-dev-002");
    manifest.criteria[0]!.taskIds.push("demo-dev-002");
    manifest.requirements[0] = {
      ...manifest.requirements[0]!,
      equivalence: "exact-public-contract",
      taskIds: ["demo-dev-001"],
      contractTokens: ["public name field"],
      canaryIds: [],
    };
    manifest.canaries = [];

    const parsed = BenchmarkContractAuditManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const report = await auditBenchmarkContract(parsed.data, root);

    expect(report.issues).not.toContainEqual({
      code: "EXACT_CONTRACT_NOT_PUBLIC",
      subjectId: "demo-name-field@demo-dev-002",
    });
  });

  test("requires an alternative-valid canary for semantic equivalence", async () => {
    const { root, manifest } = await fixture();
    manifest.requirements[0]!.canaryIds = [];
    manifest.canaries = [];

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "MISSING_EQUIVALENCE_CANARY",
    );
  });

  test("requires semantic canary coverage for every criterion task branch", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as {
      tasks: Array<{
        id: string;
        split: string;
        prompt: string;
        fixtures: Record<string, string>;
        eval: unknown[];
        hardGateIds: string[];
      }>;
    };
    taskSet.tasks[1] = {
      ...taskSet.tasks[0]!,
      id: "demo-dev-002",
      split: "development",
    };
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.scope.taskIds.push("demo-dev-002");
    manifest.criteria[0]!.taskIds.push("demo-dev-002");

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "MISSING_EQUIVALENCE_CANARY",
      subjectId: "demo-name-field@demo-dev-002",
    });
  });

  test("requires safety controls on every criterion task branch", async () => {
    const { root, manifest } = await fixture();
    const taskSet = JSON.parse(
      await readFile(join(root, manifest.tasks.path), "utf8"),
    ) as {
      tasks: Array<{
        id: string;
        split: string;
        prompt: string;
        fixtures: Record<string, string>;
        eval: unknown[];
        hardGateIds: string[];
      }>;
    };
    taskSet.tasks[1] = {
      ...taskSet.tasks[0]!,
      id: "demo-dev-002",
      split: "development",
    };
    const taskBytes = Buffer.from(JSON.stringify(taskSet, null, 2));
    await writeFile(join(root, manifest.tasks.path), taskBytes);
    manifest.tasks.sha256 = sha256Bytes(taskBytes);
    manifest.scope.taskIds.push("demo-dev-002");
    manifest.criteria[0]!.taskIds.push("demo-dev-002");
    manifest.requirements[0]!.equivalence = "safety-invariant";
    manifest.requirements[0]!.canaryIds = ["demo-canonical", "demo-invalid"];
    manifest.canaries = [{
      ...manifest.canaries[0]!,
      id: "demo-canonical",
      role: "canonical-valid",
      expectedPass: true,
    }, {
      ...manifest.canaries[0]!,
      id: "demo-invalid",
      role: "invalid-control",
      expectedPass: false,
    }];

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "MISSING_EQUIVALENCE_CANARY",
      subjectId: "demo-name-field@demo-dev-002",
    });
  });

  test("rejects duplicate identities and role/expectation contradictions", async () => {
    const { manifest } = await fixture();
    manifest.criteria.push({ ...manifest.criteria[0]! });
    manifest.requirements.push({ ...manifest.requirements[0]! });
    manifest.canaries[0]!.expectedPass = false;

    const parsed = BenchmarkContractAuditManifestSchema.safeParse(manifest);

    expect(parsed.success).toBe(false);
  });

  test("requires at least one contract token", async () => {
    const { manifest } = await fixture();
    manifest.requirements[0]!.contractTokens = [];

    expect(BenchmarkContractAuditManifestSchema.safeParse(manifest).success).toBe(false);
  });

  test("rejects a requirement canary attached to another criterion", async () => {
    const { root, manifest } = await fixture();
    manifest.criteria.push({
      id: "demo-other",
      hardGate: false,
      taskIds: ["demo-dev-001"],
      requirementIds: ["demo-other-requirement"],
    });
    manifest.requirements.push({
      id: "demo-other-requirement",
      class: "presence",
      equivalence: "exact-public-contract",
      criterionIds: ["demo-other"],
      contractTokens: ["name"],
      scorerAnchors: [{ quote: "requiredField = 'name'" }],
      publicEvidence: [{
        kind: "task-prompt",
        taskIds: ["demo-dev-001"],
        quote: "public name field",
      }],
      canaryIds: [],
    });
    manifest.requirements[0]!.canaryIds = ["wrong-criterion-canary"];
    manifest.canaries[0] = {
      ...manifest.canaries[0]!,
      id: "wrong-criterion-canary",
      criterionId: "demo-other",
    };

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.status).toBe("failed");
    expect(report.issues).toContainEqual({
      code: "CANARY_REFERENCE_INVALID",
      subjectId: "demo-name-field",
    });
  });

  test("rejects a canary fixture containing a nested filesystem link", async () => {
    const { root, manifest } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "skvm-contract-audit-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "secret.txt"), "outside\n");
    await symlink(
      outside,
      join(root, "pilot", "audit-fixtures", "alternative", "escape"),
      "junction",
    );

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "CANARY_REFERENCE_INVALID",
      subjectId: "demo-alternative",
    });
  });

  test("rejects a canary fixture reached through an escaping parent junction", async () => {
    const { root, manifest } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "skvm-contract-audit-fixture-outside-"));
    roots.push(outside);
    await mkdir(join(outside, "alternative"), { recursive: true });
    await writeFile(
      join(outside, "alternative", "output.json"),
      "{\"name\":\"outside\"}\n",
    );
    await rm(
      join(root, "pilot", "audit-fixtures"),
      { recursive: true, force: true },
    );
    await symlink(
      outside,
      join(root, "pilot", "audit-fixtures"),
      "junction",
    );
    manifest.canaries[0]!.fixtureSha256 = await hashAuditFixtureDirectory(
      join(outside, "alternative"),
    );

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "CANARY_REFERENCE_INVALID",
      subjectId: "demo-alternative",
    });
  });

  test("rejects canary fixture content drift", async () => {
    const { root, manifest } = await fixture();
    await writeFile(
      join(root, "pilot", "audit-fixtures", "alternative", "output.json"),
      "{\"name\":\"drifted\"}\n",
    );

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "CANARY_REFERENCE_INVALID",
      subjectId: "demo-alternative",
    });
  });

  test("rejects a bound file reached through an escaping parent junction", async () => {
    const { root, manifest } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "skvm-contract-audit-bound-outside-"));
    roots.push(outside);
    await writeFile(
      join(outside, "SKILL.md"),
      "The output may choose any string value for the public name field.\n",
    );
    await rm(join(root, "pilot", "source"), { recursive: true, force: true });
    await symlink(outside, join(root, "pilot", "source"), "junction");

    const report = await auditBenchmarkContract(manifest, root);

    expect(report.issues).toContainEqual({
      code: "FILE_DIGEST_MISMATCH",
      subjectId: "pilot/source/SKILL.md",
    });
  });

  test("does not serialize public quotes, scorer source, evaluator gold, or held-out content", async () => {
    const { root, manifest } = await fixture();
    const report = await auditBenchmarkContract(manifest, root);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("public name field");
    expect(serialized).not.toContain("requiredField");
    expect(serialized).not.toContain("never-public-evidence");
    expect(serialized).not.toContain("held-out canary");
  });

  test("rejects report-visible identifiers that could carry free-form content", async () => {
    const { manifest } = await fixture();
    manifest.requirements[0]!.id = "secret value copied from model output";

    expect(BenchmarkContractAuditManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
