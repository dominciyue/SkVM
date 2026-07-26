import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  BenchmarkContractAuditManifestSchema,
  auditBenchmarkContract,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit.ts";
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts";
import { ExperimentalDesignV2TaskSplitFreezeSchema } from "./experimental-design-v2-task-freeze.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");
const v2Root = "benchmarks/skill-ir/pilots/experimental-design/v2";
const manifestPath = `${v2Root}/benchmark-contract-audit.json`;
const reportPath = "results/skill-ir/benchmark-contract-audit/experimental-design-v2.json";
const developmentTaskIds = [
  "experimental-design-v2-stratified-dev-001",
  "experimental-design-v2-cluster-sequential-dev-002",
];
const heldoutTaskIds = [
  "experimental-design-v2-stratified-sequential-heldout-001",
  "experimental-design-v2-cluster-stratified-heldout-002",
];

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function loadManifest(): Promise<BenchmarkContractAuditManifest> {
  return BenchmarkContractAuditManifestSchema.parse(await loadJson(manifestPath));
}

describe("experimental-design v2 development-only benchmark audit", () => {
  test("binds only the frozen development split and the independent v2 scorer", async () => {
    const [manifest, freeze] = await Promise.all([
      loadManifest(),
      loadJson(`${v2Root}/task-split-freeze.json`).then((value) =>
        ExperimentalDesignV2TaskSplitFreezeSchema.parse(value),
      ),
    ]);
    expect(manifest.scope).toEqual({
      split: "development",
      taskIds: developmentTaskIds,
    });
    expect(manifest.tasks).toEqual({
      path: freeze.developmentTasks.path,
      sha256: freeze.developmentTasks.sha256,
    });
    expect(manifest.scorer).toMatchObject({
      path: "src/bench/evaluators/experimental-design-grade-v2.ts",
      evaluatorId: "skill-ir-experimental-design-v2",
    });
    expect(manifest.criteria.map((criterion) => criterion.id)).toEqual([
      "design-input-integrity",
      "design-artifact-contract",
      "design-semantics",
      "design-allocation-safety",
      "design-report-consistency",
    ]);
    expect(
      manifest.criteria.every(
        (criterion) =>
          criterion.hardGate &&
          JSON.stringify(criterion.taskIds) === JSON.stringify(developmentTaskIds),
      ),
    ).toBe(true);

    const serialized = JSON.stringify(manifest);
    for (const heldoutTaskId of heldoutTaskIds) {
      expect(serialized).not.toContain(heldoutTaskId);
    }
    expect(serialized).not.toContain(freeze.heldoutSentinel);
    expect(serialized).not.toContain("evaluator-payload");
    expect(serialized).not.toContain("model-output");
    expect(serialized).not.toContain("artifact-package");
  });

  test("covers all eight public combinations, both task branches, and report partial scores", async () => {
    const manifest = await loadManifest();
    const fixturePaths = manifest.canaries.map((canary) => canary.fixturePath);
    for (const name of [
      "alt-individual-plain",
      "alt-individual-strata",
      "alt-individual-sequential",
      "alt-individual-strata-sequential",
      "alt-cluster-plain",
      "alt-cluster-strata",
      "alt-cluster-sequential",
      "alt-cluster-strata-sequential",
    ]) {
      expect(fixturePaths.some((fixturePath) => fixturePath.endsWith(`/${name}`))).toBe(true);
    }

    for (const criterion of manifest.criteria) {
      const canaries = manifest.canaries.filter(
        (canary) => canary.criterionId === criterion.id,
      );
      for (const taskId of developmentTaskIds) {
        const branch = canaries.filter((canary) => canary.taskId === taskId);
        expect(branch.some((canary) => canary.role === "canonical-valid")).toBe(true);
        expect(branch.some((canary) => canary.role === "alternative-valid")).toBe(true);
        expect(branch.some((canary) => canary.role === "invalid-control")).toBe(true);
      }
    }

    const partialScores = manifest.canaries
      .filter((canary) => canary.role === "partial-control")
      .map((canary) => canary.expectedScore)
      .sort();
    expect(partialScores).toEqual([0, 0, 0, 0, 0.25, 0.5, 0.75]);
  });

  test("passes static traceability and every local differential canary", async () => {
    const manifest = await loadManifest();
    const [actual, persisted] = await Promise.all([
      runBenchmarkContractAudit(manifest, rootDir),
      loadJson(reportPath),
    ]);
    expect(persisted).toEqual(actual);
    expect(actual.staticStatus).toBe("passed");
    expect(actual.status).toBe("passed");
    expect(actual.issues).toEqual([]);
    expect(actual.canaries.every((canary) => canary.status === "matched")).toBe(true);

    const serialized = JSON.stringify(actual);
    for (const heldoutTaskId of heldoutTaskIds) {
      expect(serialized).not.toContain(heldoutTaskId);
    }
    const freeze = ExperimentalDesignV2TaskSplitFreezeSchema.parse(
      await loadJson(`${v2Root}/task-split-freeze.json`),
    );
    expect(serialized).not.toContain(freeze.heldoutSentinel);
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("workdir");
    expect(serialized).not.toContain("model-output");
  });

  test("fails closed when public evidence or a source anchor is removed", async () => {
    const manifest = await loadManifest();
    const missingEvidence = structuredClone(manifest);
    missingEvidence.requirements[0]!.publicEvidence[0] = {
      kind: "skill-source",
      path: `${v2Root}/public-contract.json`,
      quote: "TEST_ONLY_MISSING_PUBLIC_EVIDENCE",
    };
    const missingAnchor = structuredClone(manifest);
    missingAnchor.requirements[0]!.scorerAnchors[0] = {
      quote: "TEST_ONLY_MISSING_SCORER_ANCHOR",
    };

    const evidenceReport = await auditBenchmarkContract(missingEvidence, rootDir);
    const anchorReport = await auditBenchmarkContract(missingAnchor, rootDir);
    expect(evidenceReport.status).toBe("failed");
    expect(evidenceReport.issues.map((issue) => issue.code)).toContain(
      "PUBLIC_EVIDENCE_MISSING",
    );
    expect(anchorReport.status).toBe("failed");
    expect(anchorReport.issues.map((issue) => issue.code)).toContain(
      "SCORER_ANCHOR_MISSING",
    );
  });

  test("keeps the scorer dependency boundary free of held-out and construction inputs", async () => {
    const source = await readFile(
      path.join(rootDir, "src/bench/evaluators/experimental-design-grade-v2.ts"),
      "utf8",
    );
    const importSpecifiers = [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map(
      (match) => match[1]!,
    );
    expect(importSpecifiers).toEqual([
      "node:crypto",
      "node:fs/promises",
      "node:path",
      "node:util",
      "yaml",
      "zod",
      "../../benchmarks/skill-ir/experimental-design-v2-contract.ts",
      "../../framework/types.ts",
      "../../framework/types.ts",
    ]);
    expect(source).not.toMatch(
      /(?:corpus|task-registry|heldout|compiler|artifact-package|results\/skill-ir)/iu,
    );
  });
});
