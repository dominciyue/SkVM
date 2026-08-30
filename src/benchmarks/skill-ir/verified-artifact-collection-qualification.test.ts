import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  VerifiedArtifactCollectionQualificationSchema,
  runVerifiedArtifactCollectionQualification,
} from "./verified-artifact-collection-qualification";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified artifact collection qualification", () => {
  test("executes both generic collection primitives in two real workdirs", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const runRoot = await mkdtemp(join(tmpdir(), "skvm-collection-qualification-"));
    temporaryDirectories.push(runRoot);

    const report = await runVerifiedArtifactCollectionQualification({ rootDir, runRoot });
    const persisted = JSON.parse(await readFile(join(
      rootDir,
      "results/skill-ir/verified-artifact-collection-qualification-v1/report.json",
    ), "utf8"));

    expect(report.status).toBe("passed");
    expect(persisted).toEqual(report);
    expect(report.operations).toEqual([
      "enumerate-json-object-keys",
      "sort-and-deduplicate-strings",
    ]);
    expect(report.cases.map((entry) => entry.caseId)).toEqual([
      "package-inventory",
      "api-tester",
    ]);
    expect(report.cases.every((entry) => entry.workdirExecuted && entry.protectedInputsPreserved)).toBe(true);
    expect(report.reuse).toEqual({
      caseCount: 2,
      sharedImplementation: true,
      coreBranchDelta: 0,
      status: "passed",
    });
    expect(report.accounting).toEqual({
      paidModelCalls: 0,
      apiCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      scorerAccesses: 0,
    });
    expect(report.effort).toMatchObject({
      historical: { planPhysicalLoc: 53, patchPhysicalLoc: 58, combinedPhysicalLoc: 111 },
      current: { planPhysicalLoc: 75, patchPhysicalLoc: 44, combinedPhysicalLoc: 119 },
      delta: { patchPhysicalLoc: -14, combinedPhysicalLoc: 8 },
      totalAdapterEffortReduced: false,
    });
    expect(report.claimBoundary).toMatchObject({
      crossFieldCounts: "not-implemented",
      semanticParity: "not-established",
      automaticEligibility: "not-established",
      readinessChanged: false,
    });
    expect(() => VerifiedArtifactCollectionQualificationSchema.parse({
      ...report,
      accounting: { ...report.accounting, paidModelCalls: 1 },
    })).toThrow();
  });
});
