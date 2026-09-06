import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AnnotationBatchSchema,
  CapabilityProfileSchema,
  ClassificationRequirementSchema,
  Q1SourceListSchema,
  deriveRequirementStates,
  summarizePreAdjudicationAgreement,
  validateCapabilityProfile,
  validateQ1SourceList,
  verifyCapabilitySourceRefs,
  verifyQ1SourceAuthorities,
} from "./task-automation-classification";

const rootDir = join(import.meta.dir, "../../..");

function capabilityProfile() {
  return CapabilityProfileSchema.parse({
    schemaVersion: "skill-ir-task-automation-capability-profile/v1",
    profileId: "test-capabilities",
    frozenAt: "2026-09-06T00:00:00.000Z",
    family: "public-structure-offline-transformation",
    capabilities: [
      {
        id: "operation-supported",
        kind: "operation",
        implementation: "implemented",
        validation: "current-tested",
        supportsNewInputs: true,
        sourceRefs: [{ path: "src/example.ts", symbol: "supported" }],
        boundary: "A test-only supported operation.",
      },
      {
        id: "operation-existing-only",
        kind: "operation",
        implementation: "implemented",
        validation: "component-tested",
        supportsNewInputs: false,
        sourceRefs: [{ path: "src/example.ts", symbol: "existingOnly" }],
        boundary: "The operation exists but its new-input composition is not validated.",
      },
    ],
    profiles: [
      {
        id: "test-profile",
        status: "existing-slice-only",
        supportedSlice: "Only the frozen test slice.",
        excluded: ["Unseen inputs"],
        requiredCapabilityIds: ["operation-existing-only"],
        minimalConstructionPath: [
          { order: 1, capabilityId: "operation-existing-only", action: "Run the bounded operation." },
        ],
        blockers: ["No validated new-input binding."],
      },
    ],
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0, coreBranchDelta: 0 },
  });
}

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    requirementId: "req-a",
    unitKind: "hard-requirement",
    description: "Produce a deterministic public report.",
    dependsOn: [],
    verificationBasis: {
      status: "sufficient",
      evidenceRefs: [{ sourcePackageId: "source-a", locator: "SKILL.md#report", kind: "specification-clause" }],
      gaps: [],
    },
    constructionBasis: {
      status: "rules-sufficient",
      evidenceRefs: [{ sourcePackageId: "source-a", locator: "SKILL.md#report", kind: "transformation-rule" }],
      requiredCapabilityIds: ["operation-supported"],
      gaps: [],
    },
    executionConditions: {
      status: "satisfied",
      conditions: ["local files are readable"],
      requiredCapabilityIds: [],
      gaps: [],
    },
    remainingSemanticChoices: [],
    prediction: "rules-sufficient-capability-supported",
    ...overrides,
  };
}

describe("task automation classification v1", () => {
  test("derives all four states without accepting post-result observations", () => {
    const profile = capabilityProfile();
    const records = [
      requirement(),
      requirement({
        requirementId: "req-b",
        constructionBasis: {
          ...requirement().constructionBasis,
          requiredCapabilityIds: ["operation-existing-only"],
        },
        prediction: "rules-sufficient-capability-missing",
      }),
      requirement({
        requirementId: "req-c",
        constructionBasis: {
          status: "semantic-choice-required",
          evidenceRefs: [{ sourcePackageId: "source-a", locator: "SKILL.md#policy", kind: "specification-clause" }],
          requiredCapabilityIds: [],
          gaps: [],
        },
        remainingSemanticChoices: [{
          choiceId: "choose-policy",
          provider: "reviewer",
          timing: "before-construction",
          affectsRequirementIds: ["req-c"],
          description: "Choose the public grouping policy.",
        }],
        prediction: "partial-semantic-choice-required",
      }),
      requirement({
        requirementId: "req-d",
        verificationBasis: {
          status: "insufficient",
          evidenceRefs: [],
          gaps: ["No public acceptance rule."],
        },
        prediction: "insufficient-information",
      }),
    ].map((entry) => ClassificationRequirementSchema.parse(entry));

    expect(deriveRequirementStates(records, profile)).toEqual({
      "req-a": "rules-sufficient-capability-supported",
      "req-b": "rules-sufficient-capability-missing",
      "req-c": "partial-semantic-choice-required",
      "req-d": "insufficient-information",
    });
    expect(() => ClassificationRequirementSchema.parse({
      ...requirement(),
      observedResult: "passed",
    })).toThrow();
  });

  test("propagates an upstream semantic choice and rejects a prediction rewritten after the fact", () => {
    const profile = capabilityProfile();
    const records = [
      ClassificationRequirementSchema.parse(requirement({
        requirementId: "choose",
        constructionBasis: {
          status: "semantic-choice-required",
          evidenceRefs: [{ sourcePackageId: "source-a", locator: "SKILL.md#choice", kind: "specification-clause" }],
          requiredCapabilityIds: [],
          gaps: [],
        },
        remainingSemanticChoices: [{
          choiceId: "policy",
          provider: "user",
          timing: "before-construction",
          affectsRequirementIds: ["choose", "render"],
          description: "Select the release policy.",
        }],
        prediction: "partial-semantic-choice-required",
      })),
      ClassificationRequirementSchema.parse(requirement({
        requirementId: "render",
        dependsOn: ["choose"],
        prediction: "partial-semantic-choice-required",
      })),
    ];
    expect(deriveRequirementStates(records, profile).render).toBe("partial-semantic-choice-required");
    expect(() => deriveRequirementStates([
      records[0]!,
      ClassificationRequirementSchema.parse({ ...records[1], prediction: "rules-sufficient-capability-supported" }),
    ], profile)).toThrow(/prediction mismatch/u);
  });

  test("requires genuinely independent annotations and reports pre-adjudication agreement", () => {
    const raw = {
      schemaVersion: "skill-ir-task-automation-annotation-batch/v1",
      batchId: "q1-development-round-1",
      handbookVersion: "skill-ir-task-automation-classification/v1",
      sourceListId: "q1-development-sources-001",
      status: "independent-complete",
      annotators: [
        {
          slot: "A",
          annotatorId: "annotator-a",
          independenceAttested: true,
          sawPeerLabelsBeforeSubmission: false,
          submittedAt: "2026-09-06T01:00:00.000Z",
          labels: [
            { sourcePackageId: "source-a", requirementId: "req-a", prediction: "rules-sufficient-capability-supported" },
            { sourcePackageId: "source-a", requirementId: "req-b", prediction: "insufficient-information" },
          ],
        },
        {
          slot: "B",
          annotatorId: "annotator-b",
          independenceAttested: true,
          sawPeerLabelsBeforeSubmission: false,
          submittedAt: "2026-09-06T01:01:00.000Z",
          labels: [
            { sourcePackageId: "source-a", requirementId: "req-a", prediction: "rules-sufficient-capability-supported" },
            { sourcePackageId: "source-a", requirementId: "req-b", prediction: "partial-semantic-choice-required" },
          ],
        },
      ],
      adjudications: [],
      audit: { resultEvidenceVisibleToAnnotators: false, postResultRelabelingAllowed: false },
    };
    const batch = AnnotationBatchSchema.parse(raw);
    expect(summarizePreAdjudicationAgreement(batch)).toEqual({ compared: 2, agreed: 1, rate: 0.5 });
    expect(() => AnnotationBatchSchema.parse({
      ...raw,
      status: "adjudicated",
      adjudications: [],
    })).toThrow(/disagreement/u);
    expect(AnnotationBatchSchema.parse({
      ...raw,
      status: "adjudicated",
      adjudications: [{
        sourcePackageId: "source-a",
        requirementId: "req-b",
        finalPrediction: "insufficient-information",
        rationale: "The public acceptance evidence is incomplete.",
        adjudicatorId: "adjudicator",
        adjudicatedAt: "2026-09-06T01:02:00.000Z",
      }],
    }).adjudications).toHaveLength(1);
    expect(() => AnnotationBatchSchema.parse({
      ...raw,
      status: "adjudicated",
      adjudications: [{
        sourcePackageId: "source-a",
        requirementId: "req-a",
        finalPrediction: "rules-sufficient-capability-supported",
        rationale: "This item already agreed.",
        adjudicatorId: "adjudicator",
        adjudicatedAt: "2026-09-06T01:02:00.000Z",
      }],
    })).toThrow(/disagreement/u);
    expect(() => AnnotationBatchSchema.parse({
      ...raw,
      annotators: raw.annotators.map((entry) => ({ ...entry, annotatorId: "same-person" })),
    })).toThrow();
    expect(() => AnnotationBatchSchema.parse({
      ...raw,
      annotators: [raw.annotators[0], { ...raw.annotators[1], sawPeerLabelsBeforeSubmission: true }],
    })).toThrow();
  });

  test("validates the frozen development source list and current capability map", async () => {
    const [sourceRaw, capabilityRaw] = await Promise.all([
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q1-development-sources-v1.json"), "utf8"),
      readFile(join(rootDir, "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json"), "utf8"),
    ]);
    const sourceList = Q1SourceListSchema.parse(JSON.parse(sourceRaw));
    const current = CapabilityProfileSchema.parse(JSON.parse(capabilityRaw));
    expect(validateQ1SourceList(sourceList)).toEqual({
      developmentSources: 12,
      prospectiveSelectedSources: 0,
      reservedProspectiveSources: 12,
      independentRepositories: 5,
      duplicatePackageIdentities: 0,
      duplicateLineages: 0,
    });
    expect(validateCapabilityProfile(current)).toEqual({
      capabilities: 21,
      profiles: 3,
      newInputReadyProfiles: 0,
      invalidCapabilityReferences: 0,
    });
    expect(await verifyCapabilitySourceRefs(rootDir, current)).toEqual({
      sourceFiles: 6,
      sourceRefs: 21,
      missingSymbols: 0,
    });
    expect(await verifyQ1SourceAuthorities(rootDir, sourceList)).toEqual({
      localRegistrySources: 8,
      remoteTreeSources: 4,
      localFilesVerified: 34,
      remoteManifestFilesBound: 23,
      remoteLicenseDigestsRecorded: 4,
    });
  });

  test("fails closed when a capability source locator drifts", async () => {
    const raw = JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json"),
      "utf8",
    ));
    raw.capabilities[0].sourceRefs[0].symbol = "DefinitelyMissingCapabilitySymbol";
    await expect(verifyCapabilitySourceRefs(rootDir, raw)).rejects.toThrow(/missing capability source symbols/u);
  });

  test("fails closed on duplicate source lineage and unsupported new-input claims", () => {
    const minimalSource = {
      slotId: "d01",
      sourcePackageId: "source-a",
      lineageId: "lineage-a",
      visibility: "development-read-before-freeze",
      identity: {
        repository: "https://github.com/example/repo-a",
        commit: "a".repeat(40),
        packageRoot: "skills/a",
      },
      license: { id: "MIT", authorityPath: "LICENSE", sha256: "b".repeat(64) },
      authority: {
        kind: "remote-git-tree-manifest",
        treeManifestSha256: "c".repeat(64),
        files: [{ path: "SKILL.md", gitBlob: "d".repeat(40), bytes: 1 }],
      },
      structure: { executableResources: false, explicitSpecification: "explicit", stateDependency: "local-only" },
      responsibilities: [{ id: "r1", summary: "Do one thing." }],
      selectedSlices: [{ id: "slice", summary: "The selected thing.", responsibilityIds: ["r1"], excludedResponsibilityIds: [] }],
      q2Role: "boundary",
    };
    const rawList = {
      schemaVersion: "skill-ir-task-automation-source-list/v1",
      listId: "bad-list",
      handbookVersion: "skill-ir-task-automation-classification/v1",
      sampling: {
        totalTarget: 24,
        developmentTarget: 12,
        prospectiveTarget: 12,
        minimumIndependentRepositories: 4,
        developmentVisibility: "read-before-freeze",
        prospectiveVisibility: "unselected-unseen",
        stratificationAxes: ["executable-resources", "explicit-specification", "state-dependency"],
        lineageDeduplication: "forks, translations, and copies share one lineage and cannot count independently",
      },
      developmentSources: Array.from({ length: 12 }, (_, index) => ({
        ...minimalSource,
        slotId: `d${String(index + 1).padStart(2, "0")}`,
        sourcePackageId: `source-${index}`,
        identity: {
          ...minimalSource.identity,
          repository: `https://github.com/example/repo-${index % 4}`,
          packageRoot: `skills/${index}`,
        },
      })),
      prospective: { status: "reserved-unselected", selectedCount: 0, entries: [] },
      excludedCandidates: [],
      audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0, resultEvidenceAccesses: 0 },
    };
    expect(() => Q1SourceListSchema.parse(rawList)).toThrow(/lineage/u);

    const profile = capabilityProfile();
    expect(() => validateCapabilityProfile({
      ...profile,
      profiles: [{
        ...profile.profiles[0],
        status: "new-input-ready",
      }],
    })).toThrow(/new-input-ready/u);
  });
});
