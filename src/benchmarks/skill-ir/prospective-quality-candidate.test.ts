import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ProspectiveQualityCandidatePolicySchema,
  evaluateProspectiveQualityCandidate,
  writeProspectiveQualityCandidateReport,
} from "./prospective-quality-candidate";
import { sha256Bytes } from "./source-fixture";

const projectRoot = path.resolve(import.meta.dir, "../../..");
const tempDirs: string[] = [];
const skillPath = "benchmarks/skill-ir/pilots/bids/source/SKILL.md";
const licensePath = "benchmarks/skill-ir/pilots/bids/source/LICENSE.repository.md";
const skillBytes = Buffer.from("---\nname: bids\nlicense: https://creativecommons.org/licenses/by/4.0/\n---\n", "utf8");
const licenseBytes = Buffer.from("MIT License\n", "utf8");

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "prospective-quality-candidate-"));
  tempDirs.push(rootDir);
  await Bun.write(path.join(rootDir, skillPath), skillBytes);
  await Bun.write(path.join(rootDir, licensePath), licenseBytes);
  const intake = {
    schemaVersion: "skill-ir-intake/v1",
    sources: [{
      id: "claude-scientific-skills",
      repositoryUrl: "https://github.com/K-Dense-AI/claude-scientific-skills",
      commit: "fc0b9f692459ea7d9e5a5c64948a5878e1bce274",
      licenseStatus: "verified",
      license: "MIT",
    }],
    candidates: [{
      id: "bids",
      sourceId: "claude-scientific-skills",
      sourcePath: "skills/bids/SKILL.md",
      status: "prospective-quality-candidate",
      licenseStatus: "verified",
      license: "CC-BY-4.0",
    }],
  };
  const policy = {
    schemaVersion: "skill-ir-prospective-quality-candidate-policy/v1",
    selectionId: "bids-quality-candidate-2026-08-23",
    selectedAt: "2026-08-23T00:00:00.000Z",
    selectionBoundary: "before-benchmark-contract",
    selectedSkillId: "bids",
    targetPhenotype: "bids-dataset-repair",
    source: {
      repository: "https://github.com/K-Dense-AI/claude-scientific-skills",
      commit: "fc0b9f692459ea7d9e5a5c64948a5878e1bce274",
      upstreamPath: "skills/bids/SKILL.md",
      importedSkillPath: skillPath,
      repositoryLicensePath: licensePath,
      declaredLicense: "CC-BY-4.0",
      repositoryLicense: "MIT",
      attributionRequired: true,
      closure: [
        { path: skillPath, sha256: sha256Bytes(skillBytes) },
        { path: licensePath, sha256: sha256Bytes(licenseBytes) },
      ],
    },
    selectionRationale: {
      informationComplementarity: "high",
      deterministicScorerFeasibility: "high",
      infrastructureRisk: "low",
      expectedArtifactRoute: "direct-deterministic-artifact",
      dynamicIsResidualDriven: true,
    },
    developmentIntent: {
      taskCount: 2,
      repetitionsPerTask: 2,
      retries: 0,
      modelSystems: ["no-skill", "original", "ir-static"],
      deterministicSystems: ["validated-artifact"],
      rowReuse: "same-lock-forward-only",
      maximumPaidCallsBeforeDynamic: 12,
      conditionalDynamicPaidCalls: 4,
    },
    requiredBeforePaidExecution: [
      "public-json-contract-audit",
      "evaluator-pointer-closure",
      "contribution-identifiability-audit",
      "deterministic-scorer-canary",
      "prospective-construction-cost-identity",
      "qualification-lock",
    ],
    prohibited: [
      "paid-execution-before-preflight",
      "held-out",
      "post-hoc-contract-repair",
      "retry-selection",
      "readiness-promotion",
    ],
  };
  return { rootDir, intake, policy };
}

describe("prospective quality candidate selection", () => {
  test("freezes a licensed candidate and a single forward-only paid denominator", async () => {
    const input = await fixture();

    const report = await evaluateProspectiveQualityCandidate(input);

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-prospective-quality-candidate-report/v1",
      selectedSkillId: "bids",
      nextStage: "public-contract-and-disclosure",
      authorizations: { paidExecution: false, heldOut: false, readinessPromotion: false },
      paidCallCeiling: { beforeDynamic: 12, conditionalDynamic: 4 },
    });
    expect(report.gates).toEqual({
      selectedFromVerifiedIntake: true,
      exactSourceClosure: true,
      dualLicenseBinding: true,
      selectedBeforeBenchmarkContract: true,
      prePaidRequirementsFrozen: true,
      forwardOnlyRowReuse: true,
      prospectiveCostCaptureRequired: true,
    });
  });

  test("fails closed on status, license, upstream identity, or closure drift", async () => {
    const input = await fixture();
    const badStatus = structuredClone(input.intake);
    badStatus.candidates[0]!.status = "deferred";
    await expect(evaluateProspectiveQualityCandidate({ ...input, intake: badStatus }))
      .rejects.toThrow("prospective-quality-candidate");

    const badLicense = structuredClone(input.intake);
    badLicense.candidates[0]!.license = "MIT";
    await expect(evaluateProspectiveQualityCandidate({ ...input, intake: badLicense }))
      .rejects.toThrow("declared license");

    const badSource = structuredClone(input.policy);
    badSource.source.commit = "0".repeat(40);
    await expect(evaluateProspectiveQualityCandidate({ ...input, policy: badSource }))
      .rejects.toThrow("upstream identity");

    const badClosure = structuredClone(input.policy);
    badClosure.source.closure[0]!.sha256 = "0".repeat(64);
    await expect(evaluateProspectiveQualityCandidate({ ...input, policy: badClosure }))
      .rejects.toThrow("source closure digest");

    const missingDirectReference = await fixture();
    const referencedSkill = Buffer.from(`${skillBytes.toString("utf8")}\nSee references/missing.json.\n`, "utf8");
    await Bun.write(path.join(missingDirectReference.rootDir, skillPath), referencedSkill);
    missingDirectReference.policy.source.closure[0]!.sha256 = sha256Bytes(referencedSkill);
    await expect(evaluateProspectiveQualityCandidate(missingDirectReference))
      .rejects.toThrow("every direct local skill reference");
  });

  test("rejects budget inflation, repeated-model rows, and missing paid preconditions", async () => {
    const { policy } = await fixture();
    expect(() => ProspectiveQualityCandidatePolicySchema.parse({
      ...policy,
      developmentIntent: { ...policy.developmentIntent, maximumPaidCallsBeforeDynamic: 16 },
    })).toThrow("paid call ceiling");
    expect(() => ProspectiveQualityCandidatePolicySchema.parse({
      ...policy,
      developmentIntent: { ...policy.developmentIntent, rowReuse: "repeat-each-stage" },
    })).toThrow();
    expect(() => ProspectiveQualityCandidatePolicySchema.parse({
      ...policy,
      requiredBeforePaidExecution: policy.requiredBeforePaidExecution.slice(1),
    })).toThrow("paid precondition");
  });

  test("writes stable compact selection evidence", async () => {
    const input = await fixture();
    const outputPath = path.join(input.rootDir, "results/selection.json");

    const report = await writeProspectiveQualityCandidateReport({ ...input, outputPath });

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report);
  });

  test("validates the committed BIDS selection against its exact source closure", async () => {
    const [intake, policy] = await Promise.all([
      readFile(path.join(projectRoot, "benchmarks/skill-ir/corpus/real-skill-intake.json"), "utf8").then(JSON.parse),
      readFile(path.join(projectRoot, "benchmarks/skill-ir/corpus/prospective-quality-candidate.json"), "utf8").then(JSON.parse),
    ]);

    const report = await evaluateProspectiveQualityCandidate({ rootDir: projectRoot, intake, policy });

    expect(report.selectedSkillId).toBe("bids");
    expect(report.sourceBinding.closure).toHaveLength(8);
    expect(report.authorizations.paidExecution).toBe(false);
  });
});
