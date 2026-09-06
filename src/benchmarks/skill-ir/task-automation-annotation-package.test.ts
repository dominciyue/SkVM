import { describe, expect, test } from "bun:test";
import {
  AnnotationBatchV2Schema,
  AnnotationSubmissionV2Schema,
  BlankAnnotationFormV2Schema,
  CapabilityProfileSchema,
  DevelopmentAnnotationPackageV2Schema,
  Q1SourceListSchema,
  RemoteSourceVerificationReportV2Schema,
  deriveRequirementStates,
  summarizePreAdjudicationAgreementV2,
  validateAnnotationBatchV2,
  validateAnnotationSubmissionV2,
  validateBlankAnnotationFormV2,
  validateDevelopmentAnnotationPackageV2,
  verifyBlankAnnotationFormV2,
  verifyDevelopmentAnnotationPackageV2,
} from "./task-automation-classification";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "../../..");

const packageSha256 = "a".repeat(64);

function capabilityProfile() {
  return CapabilityProfileSchema.parse({
    schemaVersion: "skill-ir-task-automation-capability-profile/v1",
    profileId: "test-capabilities",
    frozenAt: "2026-09-06T00:00:00.000Z",
    family: "public-structure-offline-transformation",
    capabilities: [{
      id: "operation-supported",
      kind: "operation",
      implementation: "implemented",
      validation: "current-tested",
      supportsNewInputs: true,
      sourceRefs: [{ path: "src/example.ts", symbol: "supported" }],
      boundary: "A test-only supported operation.",
    }],
    profiles: [{
      id: "test-profile",
      status: "existing-slice-only",
      supportedSlice: "Only a frozen test slice.",
      excluded: ["Unseen inputs"],
      requiredCapabilityIds: ["operation-supported"],
      minimalConstructionPath: [{ order: 1, capabilityId: "operation-supported", action: "Run it." }],
      blockers: ["No production binding."],
    }],
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0, coreBranchDelta: 0 },
  });
}

function annotationPackage() {
  return DevelopmentAnnotationPackageV2Schema.parse({
    schemaVersion: "skill-ir-task-automation-development-annotation-package/v2",
    packageId: "q1-development-annotation-package-test-v2",
    frozenAt: "2026-09-06T00:00:00.000Z",
    family: "public-structure-offline-transformation",
    bindings: {
      handbook: {
        methodId: "skill-ir-task-automation-classification/v2",
        path: "docs/skill-ir/classification-handbook-v2.md",
        sha256: "b".repeat(64),
      },
      sourceList: {
        listId: "q1-development-sources-001",
        path: "benchmarks/skill-ir/classification/q1-development-sources-v1.json",
        sha256: "c".repeat(64),
      },
      capabilityProfile: {
        profileId: "test-capabilities",
        path: "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json",
        sha256: "d".repeat(64),
      },
      remoteVerification: null,
    },
    denominator: {
      unitizationPolicy: "one-unit-per-selected-responsibility",
      sourceCount: 1,
      unitCount: 2,
    },
    sourceViews: [{
      slotId: "d01",
      sourcePackageId: "source-a",
      sliceId: "slice-a",
      includedResponsibilityIds: ["responsibility-a", "responsibility-b"],
      excludedResponsibilityIds: ["out-of-scope"],
      access: {
        kind: "workspace-bound-files",
        files: [{
          sourcePath: "SKILL.md",
          workspacePath: "benchmarks/source-a/SKILL.md",
          sha256: "e".repeat(64),
          bytes: 10,
        }],
      },
    }],
    units: [
      {
        unitId: "source-a-responsibility-a",
        sourcePackageId: "source-a",
        sliceId: "slice-a",
        responsibilityId: "responsibility-a",
        unitKind: "workflow-step",
        description: "Read the declared public input.",
        sourceLocators: [{ locator: "SKILL.md#input", purpose: "Defines the input step." }],
        dependsOnUnitIds: [],
      },
      {
        unitId: "source-a-responsibility-b",
        sourcePackageId: "source-a",
        sliceId: "slice-a",
        responsibilityId: "responsibility-b",
        unitKind: "workflow-step",
        description: "Write the deterministic report.",
        sourceLocators: [{ locator: "SKILL.md#report", purpose: "Defines the report step." }],
        dependsOnUnitIds: ["source-a-responsibility-a"],
      },
    ],
    audit: {
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      resultEvidenceAccesses: 0,
      prospectiveSourcesSelected: 0,
    },
  });
}

function supportedLabel(unitId: string, locator: string) {
  return {
    sourcePackageId: "source-a",
    unitId,
    verificationBasis: {
      status: "sufficient",
      evidenceRefs: [{ sourcePackageId: "source-a", locator, kind: "specification-clause" }],
      gaps: [],
    },
    constructionBasis: {
      status: "rules-sufficient",
      evidenceRefs: [{ sourcePackageId: "source-a", locator, kind: "transformation-rule" }],
      requiredCapabilityIds: ["operation-supported"],
      gaps: [],
    },
    executionConditions: {
      status: "satisfied",
      conditions: ["The declared local input is readable."],
      requiredCapabilityIds: [],
      gaps: [],
    },
    remainingSemanticChoices: [],
    prediction: "rules-sufficient-capability-supported",
  };
}

function submission(slot: "A" | "B") {
  return AnnotationSubmissionV2Schema.parse({
    schemaVersion: "skill-ir-task-automation-annotation-submission/v2",
    submissionId: `q1-test-${slot.toLowerCase()}`,
    annotationPackage: {
      packageId: "q1-development-annotation-package-test-v2",
      path: "benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json",
      sha256: packageSha256,
    },
    slot,
    annotatorId: `annotator-${slot.toLowerCase()}`,
    independenceAttested: true,
    sawPeerLabelsBeforeSubmission: false,
    resultEvidenceVisibleBeforeSubmission: false,
    submittedAt: "2026-09-06T01:00:00.000Z",
    labels: [
      supportedLabel("source-a-responsibility-a", "SKILL.md#input"),
      supportedLabel("source-a-responsibility-b", "SKILL.md#report"),
    ],
  });
}

function batch() {
  return AnnotationBatchV2Schema.parse({
    schemaVersion: "skill-ir-task-automation-annotation-batch/v2",
    batchId: "q1-development-round-test-v2",
    annotationPackage: {
      packageId: "q1-development-annotation-package-test-v2",
      path: "benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json",
      sha256: packageSha256,
    },
    status: "independent-complete",
    submissions: [submission("A"), submission("B")],
    adjudications: [],
    audit: { postResultRelabelingAllowed: false },
  });
}

describe("task automation annotation package v2", () => {
  test("rejects dangling semantic impacts and impacts without a dependency path", () => {
    const profile = capabilityProfile();
    const reference = { sourcePackageId: "source-a", locator: "SKILL.md#policy", kind: "transformation-rule" };
    const supported = {
      requirementId: "render",
      unitKind: "workflow-step",
      description: "Render under the selected policy.",
      dependsOn: [],
      verificationBasis: { status: "sufficient", evidenceRefs: [reference], gaps: [] },
      constructionBasis: { status: "rules-sufficient", evidenceRefs: [reference], requiredCapabilityIds: ["operation-supported"], gaps: [] },
      executionConditions: { status: "satisfied", conditions: ["Input is readable."], requiredCapabilityIds: [], gaps: [] },
      remainingSemanticChoices: [],
      prediction: "rules-sufficient-capability-supported",
    };
    const choose = {
      ...supported,
      requirementId: "choose",
      constructionBasis: { ...supported.constructionBasis, status: "semantic-choice-required" },
      remainingSemanticChoices: [{
        choiceId: "policy",
        provider: "user",
        timing: "before-construction",
        affectsRequirementIds: ["render"],
        description: "Select the policy used by render.",
      }],
      prediction: "partial-semantic-choice-required",
    };

    expect(() => deriveRequirementStates([choose, supported], profile)).toThrow(/semantic impact.*dependency path/u);
    expect(() => deriveRequirementStates([{
      ...choose,
      remainingSemanticChoices: [{ ...choose.remainingSemanticChoices[0], affectsRequirementIds: ["not-a-unit"] }],
    }], profile)).toThrow(/unknown semantic impact target/u);
    expect(deriveRequirementStates([
      choose,
      { ...supported, dependsOn: ["choose"], prediction: "partial-semantic-choice-required" },
    ], profile).render).toBe("partial-semantic-choice-required");
  });

  test("rejects common omissions, fabricated units, and package version drift", () => {
    const pkg = annotationPackage();
    const profile = capabilityProfile();
    const valid = submission("A");
    expect(validateAnnotationSubmissionV2(valid, pkg, profile, packageSha256)).toEqual({
      sourceCount: 1,
      unitCount: 2,
      predictionsValidated: 2,
    });

    const jointlyOmitted = batch();
    jointlyOmitted.submissions[0].labels.pop();
    jointlyOmitted.submissions[1].labels.pop();
    expect(() => validateAnnotationBatchV2(jointlyOmitted, pkg, profile, packageSha256)).toThrow(/complete frozen denominator/u);

    const fabricated = submission("A");
    fabricated.labels[0]!.sourcePackageId = "fabricated-source";
    fabricated.labels[0]!.unitId = "fabricated-unit";
    expect(() => validateAnnotationSubmissionV2(fabricated, pkg, profile, packageSha256)).toThrow(/unknown annotation unit/u);

    const drifted = submission("A");
    drifted.annotationPackage.sha256 = "f".repeat(64);
    expect(() => validateAnnotationSubmissionV2(drifted, pkg, profile, packageSha256)).toThrow(/package digest mismatch/u);
  });

  test("validates blank forms against the exact package denominator", () => {
    const pkg = annotationPackage();
    const form = BlankAnnotationFormV2Schema.parse({
      schemaVersion: "skill-ir-task-automation-annotation-form/v2",
      formId: "q1-development-form-a-test-v2",
      annotationPackage: {
        packageId: pkg.packageId,
        path: "benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json",
        sha256: packageSha256,
      },
      slot: "A",
      annotatorId: null,
      independenceAttested: null,
      sawPeerLabelsBeforeSubmission: null,
      resultEvidenceVisibleBeforeSubmission: null,
      submittedAt: null,
      labels: pkg.units.map((unit) => ({
        sourcePackageId: unit.sourcePackageId,
        unitId: unit.unitId,
        verificationBasis: null,
        constructionBasis: null,
        executionConditions: null,
        remainingSemanticChoices: null,
        prediction: null,
      })),
    });
    expect(validateBlankAnnotationFormV2(form, pkg, packageSha256)).toEqual({ sourceCount: 1, unitCount: 2 });
    form.labels.pop();
    expect(() => validateBlankAnnotationFormV2(form, pkg, packageSha256)).toThrow(/complete frozen denominator/u);
  });

  test("reports overall, per-source, state-confusion, and evidence-dimension disagreement", () => {
    const pkg = annotationPackage();
    const profile = capabilityProfile();
    const raw = batch();
    raw.submissions[1].labels[1] = {
      ...raw.submissions[1].labels[1]!,
      constructionBasis: {
        status: "semantic-choice-required",
        evidenceRefs: [{ sourcePackageId: "source-a", locator: "SKILL.md#report", kind: "transformation-rule" }],
        requiredCapabilityIds: [],
        gaps: [],
      },
      remainingSemanticChoices: [{
        choiceId: "report-policy",
        provider: "reviewer",
        timing: "before-construction",
        affectsRequirementIds: ["source-a-responsibility-b"],
        description: "Choose the report grouping policy.",
      }],
      prediction: "partial-semantic-choice-required",
    };

    const summary = summarizePreAdjudicationAgreementV2(raw, pkg, profile, packageSha256);
    expect(summary.overall).toEqual({ compared: 2, agreed: 1, rate: 0.5 });
    expect(summary.bySource).toEqual([{ sourcePackageId: "source-a", compared: 2, agreed: 1, rate: 0.5 }]);
    expect(summary.confusionMatrix["rules-sufficient-capability-supported"]["partial-semantic-choice-required"]).toBe(1);
    expect(summary.evidenceDimensionDisagreements).toEqual({
      verificationBasis: 0,
      constructionBasis: 1,
      executionConditions: 0,
      remainingSemanticChoices: 1,
    });
  });

  test("verifies the distributable 12-source and 24-unit development package", async () => {
    const handbookAttributes = execFileSync("git", [
      "-c",
      `safe.directory=${rootDir.replaceAll("\\", "/")}`,
      "check-attr",
      "eol",
      "--",
      "docs/skill-ir/classification-handbook-v2.md",
    ], { cwd: rootDir, encoding: "utf8" });
    expect(handbookAttributes.trim()).toEndWith("eol: lf");
    const packagePath = join(rootDir, "benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json");
    const [packageBytes, sourceListBytes, profileBytes, remoteReportBytes, formABytes, formBBytes] = await Promise.all([
      readFile(packagePath),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q1-development-sources-v1.json")),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json")),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q1-development-remote-source-verification-v2.json")),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q1-development-annotation-form-a-v2.json")),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q1-development-annotation-form-b-v2.json")),
    ]);
    const pkg = DevelopmentAnnotationPackageV2Schema.parse(JSON.parse(packageBytes.toString("utf8")));
    const sourceList = Q1SourceListSchema.parse(JSON.parse(sourceListBytes.toString("utf8")));
    const profile = CapabilityProfileSchema.parse(JSON.parse(profileBytes.toString("utf8")));
    const remoteReportRaw = JSON.parse(remoteReportBytes.toString("utf8"));
    expect(RemoteSourceVerificationReportV2Schema.parse(remoteReportRaw).sources).toHaveLength(4);
    const falseMatchedReport = structuredClone(remoteReportRaw);
    falseMatchedReport.sources[0].files[0].observedBytes += 1;
    expect(() => RemoteSourceVerificationReportV2Schema.parse(falseMatchedReport)).toThrow(/observation.*expectation/u);
    expect(validateDevelopmentAnnotationPackageV2(pkg, sourceList, profile)).toEqual({
      sourceCount: 12,
      unitCount: 24,
      localSourceViews: 8,
      remoteSourceViews: 4,
    });
    expect(await verifyDevelopmentAnnotationPackageV2(rootDir, pkg)).toEqual({
      sourceCount: 12,
      unitCount: 24,
      localFilesVerified: 34,
      remoteFilesVerifiedAtFreeze: 23,
      frozenDocumentDigestsVerified: 4,
    });
    const incompleteLocalView = structuredClone(pkg);
    const envView = incompleteLocalView.sourceViews.find((entry) => entry.sourcePackageId === "env-manager")!;
    if (envView.access.kind !== "workspace-bound-files") throw new Error("test fixture expected local Env source view");
    envView.access.files.shift();
    await expect(verifyDevelopmentAnnotationPackageV2(rootDir, incompleteLocalView)).rejects.toThrow(/complete registry manifest/u);
    const actualPackageSha256 = createHash("sha256").update(packageBytes).digest("hex");
    const formA = BlankAnnotationFormV2Schema.parse(JSON.parse(formABytes.toString("utf8")));
    const formB = BlankAnnotationFormV2Schema.parse(JSON.parse(formBBytes.toString("utf8")));
    expect(validateBlankAnnotationFormV2(formA, pkg, actualPackageSha256)).toEqual({ sourceCount: 12, unitCount: 24 });
    expect(validateBlankAnnotationFormV2(formB, pkg, actualPackageSha256)).toEqual({ sourceCount: 12, unitCount: 24 });
    expect(await verifyBlankAnnotationFormV2(rootDir, formA)).toEqual({ sourceCount: 12, unitCount: 24 });
    expect(await verifyBlankAnnotationFormV2(rootDir, formB)).toEqual({ sourceCount: 12, unitCount: 24 });
    expect(formA.slot).toBe("A");
    expect(formB.slot).toBe("B");
    expect(formA.labels).toEqual(formB.labels);
  });
});
