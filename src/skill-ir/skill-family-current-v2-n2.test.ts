import { describe, expect, test } from "bun:test";
import { buildN2GapMatrixFromRepository } from "./skill-family-current-v2-n2";

describe("current-v2 N2 evidence", () => {
  test("binds three source-grounded tasks to one real exposed API before construction", async () => {
    const report = await buildN2GapMatrixFromRepository(process.cwd());
    expect(report.inputSnapshot).toMatchObject({ skillBodies: 12, repositoryOrigins: 6, apiDocuments: 12, apiProviders: 6 });
    expect(report.mappingReview.sourceSkills).toBeGreaterThanOrEqual(3);
    expect(report.mappingReview.rows.every((row) => row.parentScope && row.residualDutyCount >= 0)).toBe(true);
    expect(report.demonstrations).toHaveLength(3);
    expect(new Set(report.demonstrations.map((row) => row.task.mapping.sourceSkill)).size).toBe(3);
    expect(new Set(report.demonstrations.map((row) => row.plan.semanticPlanSha256)).size).toBe(3);
    expect(report.demonstrations.every((row) => row.verification.status === "pass" && row.plan.constructionStatus === "not-run" && row.plan.taskComplete === false)).toBe(true);
    expect(report.relations.requirementChangeChangesPlan).toBe(true);
    expect(report.relations.outputChangeChangesPlan).toBe(true);
    expect(report.relations.memberAndRepositoryRenamePreservesSemantics).toBe(true);
    expect(report.gaps.summary["implemented-not-connected"]).toBeGreaterThan(0);
    expect(report.gaps.summary["external-oracle-missing"]).toBeGreaterThan(0);
    expect(report.protectedReads).toEqual({ heldOut: 0, q1Reserved: 0, prospective: 0 });
  });
});
