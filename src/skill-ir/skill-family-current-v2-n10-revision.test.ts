import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildN10RevisionDecision,
  verifyN10RevisionDecision,
} from "./skill-family-current-v2-n10-revision";

const repositoryRoot = resolve(import.meta.dir, "../..");
const developmentDirectory = resolve(
  repositoryRoot,
  "results/skill-ir/skill-family-current-v2-source-repair-001/development",
);

test("N10 revision preserves the first-run denominator and refuses unsafe form support expansion", async () => {
  const report = await buildN10RevisionDecision({
    repositoryRoot,
    developmentDirectory,
    revisionCodeCommit: "a".repeat(40),
    evaluatedAt: "2099-01-01T00:00:00.000Z",
  });

  expect(report.decision).toBe("no-safe-shared-revision");
  expect(report.implementationChanges).toEqual([]);
  expect(report.firstRunMethodGate.decision).toBe("method-not-ready");
  expect(report.denominator).toMatchObject({
    uniqueInputs: 6,
    providers: 3,
    operationDenominator: 47,
    taskContracts: 9,
    requiredObligationDenominator: 18,
  });
  expect(report.mismatchTasks.map((row) => row.taskId)).toEqual([
    "n10-visier-auth-event4u",
    "n10-visier-auth-lambda-rich",
  ]);
  expect(report.rootCauses.map((row) => row.requirementKind).sort()).toEqual([
    "constraint-negative",
    "constraint-negative",
    "valid-minimal",
  ]);
  expect(report.rootCauses.every((row) => row.classification === "declared-support-contract-boundary")).toBe(true);
  expect(report.rootCauses.find((row) => row.requirementKind === "valid-minimal")?.observedReason)
    .toBe("Error: form field count unsupported");
  expect(report.rootCauses.filter((row) => row.requirementKind === "constraint-negative")
    .every((row) => row.encodedSourceNegativeCount === 0)).toBe(true);

  expect((await verifyN10RevisionDecision({ repositoryRoot, developmentDirectory, report })).status).toBe("pass");

  const tampered = structuredClone(report);
  tampered.denominator.taskContracts -= 1;
  expect((await verifyN10RevisionDecision({ repositoryRoot, developmentDirectory, report: tampered })).errors)
    .toContain("REVISION_DENOMINATOR_MISMATCH");

  const invented = structuredClone(report);
  invented.rootCauses[0]!.classification = "implementation-fixed" as never;
  expect((await verifyN10RevisionDecision({ repositoryRoot, developmentDirectory, report: invented })).errors)
    .toContain("REVISION_ROOT_CAUSE_MISMATCH");
});
