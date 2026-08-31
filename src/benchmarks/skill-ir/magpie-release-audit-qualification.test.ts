import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MagpieReleaseAuditQualificationSchema,
  runMagpieReleaseAuditQualification,
} from "./magpie-release-audit-qualification";

const rootDir = resolve(import.meta.dir, "../../..");
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Magpie release-audit Step 2 zero-paid qualification", () => {
  test("persists nine-case public workdir, checker, and effort evidence", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "magpie-release-audit-qualification-"));
    temporary.push(runRoot);
    const reportPath = join(runRoot, "qualification.json");
    const report = await runMagpieReleaseAuditQualification({ rootDir, runRoot: join(runRoot, "workdirs"), reportPath });
    const persisted = MagpieReleaseAuditQualificationSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));

    expect(persisted).toEqual(report);
    expect(report.status).toBe("passed");
    expect(report.sourceAuthority).toMatchObject({ importedFiles: 31, publicInputFiles: 19, checkerOnlyFiles: 12, publicCases: 9 });
    expect(report.promptClosure.cases).toHaveLength(9);
    expect(report.checker).toMatchObject({ baselinePasses: 9, mutationFailures: 6, upstreamJudgePredicatesUsed: 0 });
    expect(report.artifact).toMatchObject({ workdirExecutions: 9, protectedInputsPreserved: 9, checkerPasses: 9, coreBranchDelta: 0 });
    expect(report.artifact.domainPatchPhysicalLoc).toBeLessThanOrEqual(360);
    expect(report.checker.implementationPhysicalLoc).toBeGreaterThanOrEqual(260);
    expect(report.checker.implementationPhysicalLoc).toBeLessThanOrEqual(420);
    expect(report.effort.humanReview).toEqual({
      status: "not-measured-no-human-review",
      humanMinutes: null,
      prospectiveEstimateMinutes: { minimum: 240, maximum: 480 },
    });
    expect(report.accounting).toEqual({
      cloneAttempts: 2,
      successfulClones: 1,
      networkCloneFailures: 1,
      localArchiveExtractions: 1,
      artifactExecutions: 9,
      checkerExecutions: 15,
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
    });
    expect(report.claimBoundary.machineCheckedFixedPublicSlice).toBe(true);
    expect(report.claimBoundary.originalBaselineRows).toBe(0);
    expect(report.claimBoundary.readinessChanged).toBe(false);
  });
});
