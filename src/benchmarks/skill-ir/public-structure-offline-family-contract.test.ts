import { describe, expect, test } from "bun:test";
import {
  FAMILY_NECESSARY_CRITERION_IDS,
  deriveFamilyResponsibilityAssessment,
} from "./public-structure-offline-family-contract";

function fact(status: "satisfied" | "unsatisfied" | "unknown" = "satisfied") {
  return status === "unknown"
    ? { status, evidenceIds: [], missingEvidence: ["No public evidence is currently available."] }
    : { status, evidenceIds: ["evidence-public-contract"], missingEvidence: [] };
}

function basis(status: "sufficient" | "insufficient" | "unknown" = "sufficient") {
  return status === "unknown"
    ? { status, evidenceIds: [], missingEvidence: ["No public evidence is currently available."] }
    : { status, evidenceIds: ["evidence-public-contract"], missingEvidence: [] };
}

function baseResponsibility() {
  return {
    responsibilityId: "skill-a/normalize-json-keys",
    skillId: "skill-a",
    description: "Normalize public JSON object keys.",
    completeScope: true as const,
    dependsOnResponsibilityIds: [] as string[],
    criterionAssessments: FAMILY_NECESSARY_CRITERION_IDS.map((criterionId) => ({
      criterionId,
      ...fact(),
    })),
    verificationBasis: basis(),
    constructionBasis: basis(),
    dependencyClosure: { status: "closed" as const, evidenceIds: ["evidence-public-contract"], missingEvidence: [] },
    sourceValidity: { status: "valid" as const, evidenceIds: ["evidence-public-contract"], missingEvidence: [] },
    remainingSemanticChoices: { status: "none" as const, evidenceIds: ["evidence-public-contract"], missingEvidence: [] },
    executionLimit: { status: "none" as const, evidenceIds: ["evidence-public-contract"], missingEvidence: [] },
    requiredCapabilities: [{
      capabilityId: "sort-and-deduplicate-strings",
      implementation: "implemented" as const,
      validation: "current-tested" as const,
      supportsNewInputs: true,
      evidenceIds: ["evidence-current-capability"],
    }],
  };
}

function verifiableOnlyFixture() {
  return {
    ...baseResponsibility(),
    responsibilityId: "skill-a/map-user-language-to-field",
    description: "Map a natural-language value to a PDF field.",
    remainingSemanticChoices: {
      status: "unbound" as const,
      evidenceIds: ["evidence-semantic-choice"],
      missingEvidence: [],
    },
  };
}

function capabilityMissingFixture() {
  return {
    ...baseResponsibility(),
    responsibilityId: "skill-a/render-changelog",
    description: "Render a changelog from a public commit snapshot.",
    requiredCapabilities: [{
      capabilityId: "snapshot-to-changelog-composition",
      implementation: "missing" as const,
      validation: "untested" as const,
      supportsNewInputs: false,
      evidenceIds: ["evidence-current-capability"],
    }],
  };
}

function sourceBlockedFixture() {
  return {
    ...baseResponsibility(),
    responsibilityId: "skill-a/construct-operation-with-missing-ref",
    description: "Construct an operation whose source reference is missing.",
    sourceValidity: {
      status: "blocked" as const,
      evidenceIds: ["evidence-source-defect"],
      missingEvidence: [],
    },
  };
}

describe("public-structure offline responsibility family", () => {
  test("keeps family, evidence, source validity, and current support orthogonal", () => {
    expect(deriveFamilyResponsibilityAssessment(verifiableOnlyFixture())).toMatchObject({
      familyMembership: "in-family",
      verifiability: "verifiable",
      constructibility: "not-constructible",
      sourceValidity: "valid",
      currentSupport: "not-assessable",
      failureAttributions: ["external-semantic-decision"],
    });
    expect(deriveFamilyResponsibilityAssessment(capabilityMissingFixture())).toMatchObject({
      familyMembership: "in-family",
      verifiability: "verifiable",
      constructibility: "constructible",
      currentSupport: "missing",
      failureAttributions: ["capability-missing"],
    });
    expect(deriveFamilyResponsibilityAssessment(sourceBlockedFixture())).toMatchObject({
      familyMembership: "in-family",
      verifiability: "verifiable",
      constructibility: "constructible",
      sourceValidity: "blocked",
      currentSupport: "not-assessable",
      failureAttributions: ["source-defect"],
    });
  });

  test("does not allow an observed candidate result to define the family", () => {
    expect(() => deriveFamilyResponsibilityAssessment({
      ...baseResponsibility(),
      candidatePassed: true,
    })).toThrow(/unrecognized|candidate/iu);
  });

  test("requires evidence for determinate facts and a named gap for unknown facts", () => {
    const missingEvidence = baseResponsibility();
    missingEvidence.criterionAssessments[0]!.evidenceIds = [];
    expect(() => deriveFamilyResponsibilityAssessment(missingEvidence)).toThrow(/evidence/iu);

    const unnamedUnknown = baseResponsibility();
    unnamedUnknown.verificationBasis = { status: "unknown", evidenceIds: [], missingEvidence: [] };
    expect(() => deriveFamilyResponsibilityAssessment(unnamedUnknown)).toThrow(/missing evidence|unknown/iu);
  });
});
