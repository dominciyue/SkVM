import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCrossSkillDomainPlanParityReport,
  CrossSkillDomainPlanParityCatalogSchema,
  CrossSkillDomainPlanParityReportSchema,
} from "./automatic-domain-plan-cross-skill-parity";
import { sha256Bytes } from "./source-fixture";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function ref(path: string) {
  return { path, sha256: sha256Bytes(await readFile(path)) };
}

describe("cross-skill Domain Plan semantic parity", () => {
  test("fails with explicit blockers when one case fails parity and the second has no safe plan", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "skill-ir-cross-domain-parity-"));
    temporaryDirectories.push(outputDir);
    const catalog = CrossSkillDomainPlanParityCatalogSchema.parse({
      schemaVersion: "skill-ir-domain-plan-cross-skill-parity-catalog/v1",
      catalogId: "domain-plan-cross-skill-parity-v1",
      cases: [
        {
          caseId: "env-manager",
          parityReport: await ref("results/skill-ir/automatic-domain-plan-manual-parity-v1/env-manager.json"),
          generationFailureReport: null,
        },
        {
          caseId: "law-to-markdown",
          parityReport: null,
          generationFailureReport: await ref("results/skill-ir/automatic-domain-plan-single-generation-v1/report.json"),
        },
      ],
      coreBranchDelta: 0,
    });
    const report = await buildCrossSkillDomainPlanParityReport({
      rootDir: process.cwd(),
      catalog,
      outputPath: join(outputDir, "report.json"),
      measurementCompletedAt: "2026-08-24T16:40:00.000Z",
    });
    expect(report.semanticParity).toEqual({
      status: "failed",
      blockers: ["insufficient-distinct-skills", "case-parity-failed", "plan-unavailable"],
      selectedSkillCount: 2,
      evaluatedSkillCount: 1,
      fullyPassingSkillCount: 0,
      coreBranchDelta: 0,
    });
    expect(report.cases.map((entry) => [entry.caseId, entry.status])).toEqual([
      ["env-manager", "evaluated-failed"],
      ["law-to-markdown", "plan-unavailable"],
    ]);
    expect(report.summary).toMatchObject({ paidCalls: 1, retries: 0, heldOutAccesses: 0 });
    expect(report.implementation.map((entry) => entry.path)).toEqual([
      "src/benchmarks/skill-ir/automatic-domain-plan-cross-skill-parity.ts",
      "src/benchmarks/skill-ir/automatic-domain-plan-cross-skill-parity-run.ts",
      "src/benchmarks/skill-ir/automatic-domain-plan-manual-parity.ts",
      "src/benchmarks/skill-ir/automatic-domain-plan-single-generation.ts",
      "src/benchmarks/skill-ir/source-fixture.ts",
    ]);
    expect(() => CrossSkillDomainPlanParityReportSchema.parse({
      ...report,
      semanticParity: {
        ...report.semanticParity,
        blockers: ["case-parity-failed"],
      },
    })).toThrow("blockers do not conserve case evidence");
    expect(() => CrossSkillDomainPlanParityReportSchema.parse({
      ...report,
      cases: report.cases.map((entry) => ({ ...entry, caseId: "env-manager" })),
    })).toThrow("two distinct case ids");

    const branchDriftReport = await buildCrossSkillDomainPlanParityReport({
      rootDir: process.cwd(),
      catalog: CrossSkillDomainPlanParityCatalogSchema.parse({
        ...catalog,
        catalogId: "domain-plan-cross-skill-parity-core-drift",
        coreBranchDelta: 1,
      }),
      outputPath: join(outputDir, "core-drift-report.json"),
      measurementCompletedAt: "2026-08-24T16:41:00.000Z",
    });
    expect(branchDriftReport.semanticParity).toMatchObject({
      status: "failed",
      blockers: ["insufficient-distinct-skills", "case-parity-failed", "plan-unavailable", "core-branch-delta"],
      coreBranchDelta: 1,
    });
  });
});
