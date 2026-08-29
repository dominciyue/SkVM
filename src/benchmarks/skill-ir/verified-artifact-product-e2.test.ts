import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateVerifiedArtifactProduct } from "../../skill-ir/verified-artifact-product";
import { runPackageInventoryE2Probe } from "./verified-artifact-product-e2";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified artifact product E2 controlled probe", () => {
  test("builds a previously unsupported skill twice and reports the real adaptation gap", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const runRoot = await mkdtemp(join(tmpdir(), "skvm-verified-artifact-e2-"));
    temporaryDirectories.push(runRoot);
    const report = await runPackageInventoryE2Probe({
      rootDir,
      runRoot,
      acceptedAt: "2026-08-29T07:19:00.000Z",
      acceptanceHumanMinutesPerArtifact: 1,
      acceptanceNote: "Conditionally accepted the exact public-fixture output closure for this controlled probe.",
    });

    expect(report.accounting).toMatchObject({
      actualPaidModelCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      taskSetAccesses: 0,
      scorerAccesses: 0,
      coreBranchDelta: 0,
    });
    expect(report.determinism).toEqual({
      fullChainRuns: 2,
      artifactClosureEqual: true,
      outputClosureEqual: true,
      protectedInputsPreserved: true,
    });
    expect(report.minimumInputs).toEqual([
      "public-skill-source",
      "thin-task-description",
      "public-workdir",
      "reviewed-plan",
      "review-patch",
    ]);
    expect(report.semanticAccounting.automatic).toMatchObject({
      packageCandidate: "non-executable",
      semanticParity: "not-established",
    });
    expect(report.semanticAccounting.declaration.thinness).toBe("within-limit");
    expect(report.authoring.prospectiveTotal).toMatchObject({
      status: "complete",
      measurementStartedAt: "2026-08-29T07:13:44.1826364Z",
      measurementCompletedAt: "2026-08-29T07:22:37.9221526Z",
      humanMinutes: 9,
      measurementMethod: "prospective-wall-clock",
    });
    expect(report.semanticAccounting.humanReview.requiredCapabilities).toEqual([
      "enumerate-json-object-keys",
      "sort-and-deduplicate-strings",
      "derive-cross-field-counts",
    ]);
    expect(report.semanticAccounting.unresolved).toContain(
      "legacy restricted-plan audit ABI cannot represent an actually zero-paid manually authored plan",
    );
    expect(report.productCost).toMatchObject({
      qualityEvidence: "user-accepted",
      claim: "token-economics-not-computable",
      researchEligibility: "not-eligible",
      breakEven: { status: "not-computable" },
      totalCostBreakEven: { status: "not-computable" },
    });

    for (const run of report.runs) {
      expect(await validateVerifiedArtifactProduct(join(runRoot, run.productPath))).toMatchObject({
        qualityEvidence: { qualityEvidence: "user-accepted" },
      });
    }
    expect(JSON.parse(await readFile(join(runRoot, report.runs[0]!.outputPath), "utf8"))).toEqual({
      packageName: "controlled-package-inventory",
      productionDependencies: ["alpha-lib", "zeta-lib"],
      developmentDependencies: ["alpha-lib", "beta-tool"],
      allDependencies: ["alpha-lib", "beta-tool", "zeta-lib"],
      counts: { production: 2, development: 2, unique: 3 },
    });
  });
});
