import { describe, expect, test } from "bun:test";
import { MAGPIE_RELEASE_AUDIT_CASE_IDS } from "./magpie-release-audit-step2";
import { StageMFrozenMagpiePanelLockSchema } from "./stage-m-frozen-magpie-panel";
import {
  buildStageMMatrixPlannedRows,
  buildStageMQualificationPlannedRows,
} from "./stage-m-frozen-magpie-panel-plan";

const routes = [
  { family: "gpt" as const, route: "xty/gpt-5.6-sol" },
  { family: "claude" as const, route: "xty/claude-opus-4-8" },
  { family: "deepseek" as const, route: "xty/deepseek-v4-pro" },
];

function lock() {
  return StageMFrozenMagpiePanelLockSchema.parse({
    schemaVersion: "skill-ir-stage-m-frozen-magpie-cross-model-panel-lock/v1",
    status: "preregistered",
    experimentId: "skill-ir-stage-m-frozen-magpie-cross-model-panel-001",
    artifact: {
      productConfig: { path: "config.json", sha256: "a".repeat(64) },
      productReport: { path: "report.json", sha256: "b".repeat(64) },
      checker: { path: "checker.ts", sha256: "c".repeat(64) },
      closureSha256: "d".repeat(64),
      checkerAuthority: "p2-gold-digest-output-regression",
    },
    inputs: {
      measurementTasks: { path: "tasks.json", sha256: "d".repeat(64) },
      upstreamCommit: "453dd9f20bdebe9d4458d84682bd707be1414f80",
      split: "public-development",
    },
    models: routes,
    cases: MAGPIE_RELEASE_AUDIT_CASE_IDS.map((caseId) => ({ caseId, split: "public-development" as const })),
    harness: {
      adapter: "pi", adapterVersion: "0.67.68", adapterConfig: "managed",
      environment: "windows", context: "clean", absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000, retries: 0,
    },
    matrix: {
      modelSystems: ["original"], artifactSystem: "frozen-artifact", repetitions: 1,
      expectedCases: 9, expectedModelRows: 27, expectedArtifactRows: 9,
      expectedLogicalRows: 36, order: "family-then-case",
    },
    qualification: { expectedRowsPerFamily: 9, requiredUsage: true, matrixRequiresAllFamilies: true },
    claims: {
      heldOutAllowed: false, promotionAllowed: false, readinessMutationAllowed: false,
      crossModelGeneralization: "not-established",
    },
    prohibited: ["artifact-or-package-mutation", "retry-or-replacement", "held-out", "model-family-deletion"],
  });
}

describe("Stage M frozen Magpie panel plan", () => {
  test("orders qualification as exactly three complete family denominators", () => {
    const rows = buildStageMQualificationPlannedRows(lock());
    expect(rows).toHaveLength(27);
    const modelRows = rows.filter((row): row is Extract<typeof row, { kind: "model" }> => row.kind === "model");
    expect(modelRows.slice(0, 9).map((row) => row.family)).toEqual(Array(9).fill("gpt"));
    expect(modelRows.slice(9, 18).map((row) => row.family)).toEqual(Array(9).fill("claude"));
    expect(modelRows.slice(18).map((row) => row.family)).toEqual(Array(9).fill("deepseek"));
    expect(rows.filter((row) => row.paid)).toHaveLength(27);
    expect(modelRows.map((row) => row.caseId)).toEqual([
      ...MAGPIE_RELEASE_AUDIT_CASE_IDS,
      ...MAGPIE_RELEASE_AUDIT_CASE_IDS,
      ...MAGPIE_RELEASE_AUDIT_CASE_IDS,
    ]);
  });

  test("builds one unique 27-model plus 9-shared-artifact matrix with no reserve", () => {
    const outputDigests = Object.fromEntries(MAGPIE_RELEASE_AUDIT_CASE_IDS.map((caseId, index) => [caseId, String(index).repeat(64)]));
    const rows = buildStageMMatrixPlannedRows(lock(), outputDigests);
    expect(rows).toHaveLength(36);
    expect(rows.filter((row) => row.kind === "model")).toHaveLength(27);
    const artifacts = rows.filter((row) => row.kind === "artifact");
    expect(artifacts).toHaveLength(9);
    expect(new Set(artifacts.map((row) => row.caseId)).size).toBe(9);
    expect(rows.every((row) => row.repetition === 1 && row.retries === 0)).toBe(true);
  });
});
