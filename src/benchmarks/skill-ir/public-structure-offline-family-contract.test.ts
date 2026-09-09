import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FAMILY_NECESSARY_CRITERION_IDS,
  buildPublicStructureOfflineFamilyReport,
  deriveFamilyDataset,
  deriveFamilyResponsibilityAssessment,
  verifyPublicStructureOfflineFamilyArtifacts,
  verifyPublicStructureOfflineFamilyFiles,
} from "./public-structure-offline-family-contract";
import { parsePublicStructureOfflineFamilyCommand } from "./public-structure-offline-family-contract-run";

const rootDir = process.cwd();
const contractPath = "benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json";
const counterexamplesPath = "benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json";

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

function outOfFamilyResponsibility(responsibilityId: string) {
  const value = structuredClone(baseResponsibility());
  value.responsibilityId = responsibilityId;
  value.criterionAssessments[2] = {
    criterionId: "offline-deterministic-transformation",
    ...fact("unsatisfied"),
  };
  return value;
}

function mixedSkillFixture() {
  const included = baseResponsibility();
  const excludedA = outOfFamilyResponsibility("skill-a/live-service-state");
  const excludedB = outOfFamilyResponsibility("skill-a/free-form-business-policy");
  return {
    schemaVersion: "skill-ir-public-structure-offline-family-dataset/v1" as const,
    identity: "skill-ir-public-structure-offline-family-contract-development-001" as const,
    skillScopes: [{
      skillId: "skill-a",
      responsibilityIds: [included.responsibilityId, excludedA.responsibilityId, excludedB.responsibilityId],
    }],
    responsibilities: [included, excludedA, excludedB],
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

  test("preserves the complete responsibility denominator in skill aggregation", () => {
    const result = deriveFamilyDataset(mixedSkillFixture());
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      skillId: "skill-a",
      disposition: "mixed",
      totals: {
        responsibilities: 3,
        inFamily: 1,
        outOfFamily: 2,
        unknown: 0,
        verifiable: 3,
        constructible: 3,
        currentSupported: 1,
      },
    });
  });

  test("fails closed on omitted responsibilities and dependency cycles", () => {
    const omitted = mixedSkillFixture();
    omitted.skillScopes[0]!.responsibilityIds.pop();
    expect(() => deriveFamilyDataset(omitted)).toThrow(/denominator|scope/iu);

    const cyclic = mixedSkillFixture();
    cyclic.responsibilities = cyclic.responsibilities.slice(0, 2);
    cyclic.skillScopes[0]!.responsibilityIds = cyclic.responsibilities.map((entry) => entry.responsibilityId);
    cyclic.responsibilities[0]!.dependsOnResponsibilityIds = [cyclic.responsibilities[1]!.responsibilityId];
    cyclic.responsibilities[1]!.dependsOnResponsibilityIds = [cyclic.responsibilities[0]!.responsibilityId];
    expect(() => deriveFamilyDataset(cyclic)).toThrow(/cycle/iu);
  });

  test("propagates an out-of-family dependency to a downstream responsibility", () => {
    const dataset = mixedSkillFixture();
    dataset.responsibilities = dataset.responsibilities.slice(0, 2);
    dataset.skillScopes[0]!.responsibilityIds = dataset.responsibilities.map((entry) => entry.responsibilityId);
    dataset.responsibilities[0]!.dependsOnResponsibilityIds = [dataset.responsibilities[1]!.responsibilityId];
    const result = deriveFamilyDataset(dataset);
    expect(result.assessments.find((entry) => entry.responsibilityId === "skill-a/normalize-json-keys")).toMatchObject({
      familyMembership: "out-of-family",
      currentSupport: "not-applicable",
      failureAttributions: ["rule-insufficient"],
    });
    expect(result.skills[0]).toMatchObject({ disposition: "none", totals: { responsibilities: 2, outOfFamily: 2 } });
  });

  test("verifies every actual criterion and counterexample source locator", async () => {
    await expect(verifyPublicStructureOfflineFamilyFiles({
      rootDir,
      contractPath,
      counterexamplesPath,
    })).resolves.toMatchObject({
      status: "verified",
      criteria: 9,
      familyNecessaryCriteria: 7,
      counterexamples: 7,
      prospectiveResultsUsed: 0,
    });
  });

  test("rejects evidence and criterion tampering at the named layer", async () => {
    const contract = JSON.parse(await readFile(join(rootDir, contractPath), "utf8"));
    const counterexamples = JSON.parse(await readFile(join(rootDir, counterexamplesPath), "utf8"));

    const digestDrift = structuredClone(contract);
    digestDrift.evidenceFiles[0].sha256 = "0".repeat(64);
    await expect(verifyPublicStructureOfflineFamilyArtifacts({ rootDir, contract: digestDrift, counterexamples }))
      .rejects.toThrow(/digest/iu);

    const brokenMarker = structuredClone(contract);
    brokenMarker.evidenceFiles[0].markers[0] = "marker-that-is-not-in-the-bound-file";
    await expect(verifyPublicStructureOfflineFamilyArtifacts({ rootDir, contract: brokenMarker, counterexamples }))
      .rejects.toThrow(/marker|locator/iu);

    const missingCriterion = structuredClone(contract);
    missingCriterion.criteria = missingCriterion.criteria.slice(1);
    await expect(verifyPublicStructureOfflineFamilyArtifacts({ rootDir, contract: missingCriterion, counterexamples }))
      .rejects.toThrow(/criterion.*coverage|missing/iu);

    const roleDrift = structuredClone(contract);
    roleDrift.criteria.find((entry: { criterionId: string }) => entry.criterionId === "current-capability-readiness").role = "necessary-family-condition";
    await expect(verifyPublicStructureOfflineFamilyArtifacts({ rootDir, contract: roleDrift, counterexamples }))
      .rejects.toThrow(/criterion.*role|engineering/iu);

    const candidateOutcomeEvidence = structuredClone(contract);
    candidateOutcomeEvidence.evidenceFiles[0].kind = "candidate-run-result";
    await expect(verifyPublicStructureOfflineFamilyArtifacts({ rootDir, contract: candidateOutcomeEvidence, counterexamples }))
      .rejects.toThrow(/candidate-run-result|invalid enum|invalid_union/iu);
  });

  test("builds a development report from bound files without prospective evidence", async () => {
    await expect(buildPublicStructureOfflineFamilyReport({
      rootDir,
      completedAt: "2026-09-10T12:00:00.000Z",
    })).resolves.toMatchObject({
      identity: "skill-ir-public-structure-offline-family-contract-development-001",
      status: "verified-development-contract",
      verification: { criteria: 9, familyNecessaryCriteria: 7, counterexamples: 7 },
      accounting: {
        prospectiveResultsUsed: 0,
        modelCalls: 0,
        businessApiCalls: 0,
        paidCalls: 0,
        heldOutAccesses: 0,
        q1ReservedAccesses: 0,
      },
    });
  });

  test("exposes only the fixed report CLI inputs", () => {
    expect(parsePublicStructureOfflineFamilyCommand([
      "--root=repo",
      "--out=results/report.json",
      "--completed-at=2026-09-10T12:00:00.000Z",
    ])).toEqual({
      rootDir: "repo",
      outputPath: "results/report.json",
      completedAt: "2026-09-10T12:00:00.000Z",
    });
    expect(() => parsePublicStructureOfflineFamilyCommand(["--source=unseen.yaml"]))
      .toThrow(/unknown|root|required/iu);
  });
});
