import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ProspectiveDynamicCandidatePolicySchema,
  evaluateProspectiveDynamicCandidate,
  writeProspectiveDynamicCandidateReport,
} from "./prospective-dynamic-candidate";
import { sha256Bytes } from "./source-fixture";

const projectRoot = path.resolve(import.meta.dir, "../../..");
const tempDirs: string[] = [];

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixtures() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "prospective-dynamic-candidate-"));
  tempDirs.push(rootDir);
  const closurePath = "benchmarks/skill-ir/pilots/statistical-power/source/SKILL.md";
  const closureBytes = Buffer.from("# Statistical Power\n\nUse sensitivity analysis.\n", "utf8");
  await Bun.write(path.join(rootDir, closurePath), closureBytes);
  const portfolio = JSON.parse(await readFile(
    path.join(projectRoot, "benchmarks/skill-ir/corpus/method-portfolio.json"),
    "utf8",
  ));
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
      id: "statistical-power",
      sourceId: "claude-scientific-skills",
      sourcePath: "skills/statistical-power/SKILL.md",
      status: "prospective-dynamic-candidate",
      licenseStatus: "verified",
      license: "MIT",
    }],
  };
  const assessments = portfolio.cases.map((entry: { skillId: string }) => ({
    skillId: entry.skillId,
    source: "method-portfolio",
    informationComplementarity: "medium",
    deterministicScorerFeasibility: "medium",
    infrastructureRisk: "medium",
    exclusionReason: "already studied or currently blocked on its frozen route",
  }));
  assessments.push({
    skillId: "statistical-power",
    source: "intake",
    informationComplementarity: "high",
    deterministicScorerFeasibility: "high",
    infrastructureRisk: "low",
    exclusionReason: null,
  });
  const policy = {
    schemaVersion: "skill-ir-prospective-dynamic-candidate-policy/v1",
    selectionId: "statistical-power-dynamic-candidate-2026-08-14",
    selectedAt: "2026-08-14T00:00:00.000Z",
    selectionBoundary: "before-benchmark-contract",
    selectedSkillId: "statistical-power",
    targetPhenotype: "statistical-power-report",
    source: {
      repository: "https://github.com/K-Dense-AI/claude-scientific-skills",
      commit: "fc0b9f692459ea7d9e5a5c64948a5878e1bce274",
      upstreamPath: "skills/statistical-power/SKILL.md",
      license: "MIT",
      closure: [{ path: closurePath, sha256: sha256Bytes(closureBytes) }],
    },
    assessments,
    developmentIntent: {
      systems: ["original", "ir-static"],
      taskCount: 2,
      repetitionsPerTask: 2,
      retries: 0,
      initialPaidCallBudget: 8,
      conditionalDynamicPaidCallBudget: 4,
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      dynamicEntry: "eligible-dual-source-admission-only",
    },
    prohibited: [
      "paid-execution-before-contract-lock",
      "held-out",
      "post-hoc-repair-mapping",
      "retry-selection",
      "readiness-promotion",
    ],
  };
  return { rootDir, portfolio, intake, policy };
}

describe("prospective dynamic candidate selection", () => {
  test("freezes a verified intake candidate without changing the method portfolio denominator", async () => {
    const input = await fixtures();

    const report = await evaluateProspectiveDynamicCandidate(input);

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-prospective-dynamic-candidate-report/v1",
      selectedSkillId: "statistical-power",
      candidateCount: 8,
      nextStage: "benchmark-contract",
      authorizations: { paidExecution: false, dynamicProfile: false, heldOut: false },
      readinessImpact: { changesStudiedCaseCount: false, changesContractQualifiedCount: false },
    });
    expect(report.gates).toEqual({
      beforeBenchmarkContract: true,
      selectedFromVerifiedIntake: true,
      exactSourceClosure: true,
      candidateSetComplete: true,
      noReadinessPromotion: true,
    });
  });

  test("fails closed on candidate omission, unverified licensing, source drift, and closure drift", async () => {
    const input = await fixtures();
    const omitted = structuredClone(input.policy);
    omitted.assessments.shift();
    await expect(evaluateProspectiveDynamicCandidate({ ...input, policy: omitted }))
      .rejects.toThrow("candidate set");

    const unlicensed = structuredClone(input.intake);
    unlicensed.candidates[0]!.licenseStatus = "unresolved";
    await expect(evaluateProspectiveDynamicCandidate({ ...input, intake: unlicensed }))
      .rejects.toThrow("verified MIT");

    const sourceDrift = structuredClone(input.policy);
    sourceDrift.source.commit = "0".repeat(40);
    await expect(evaluateProspectiveDynamicCandidate({ ...input, policy: sourceDrift }))
      .rejects.toThrow("upstream identity");

    const closureDrift = structuredClone(input.policy);
    closureDrift.source.closure[0]!.sha256 = "0".repeat(64);
    await expect(evaluateProspectiveDynamicCandidate({ ...input, policy: closureDrift }))
      .rejects.toThrow("source closure digest");
  });

  test("rejects post-contract selection, inconsistent budgets, duplicate candidates, and a selected exclusion", async () => {
    const { policy } = await fixtures();
    expect(() => ProspectiveDynamicCandidatePolicySchema.parse({
      ...policy,
      selectionBoundary: "after-benchmark-contract",
    })).toThrow();
    expect(() => ProspectiveDynamicCandidatePolicySchema.parse({
      ...policy,
      developmentIntent: { ...policy.developmentIntent, initialPaidCallBudget: 9 },
    })).toThrow("paid call budget");
    expect(() => ProspectiveDynamicCandidatePolicySchema.parse({
      ...policy,
      assessments: [...policy.assessments, policy.assessments[0]],
    })).toThrow("duplicate candidate assessment");
    expect(() => ProspectiveDynamicCandidatePolicySchema.parse({
      ...policy,
      assessments: policy.assessments.map((assessment: { skillId: string; exclusionReason: string | null }) => assessment.skillId === policy.selectedSkillId
        ? { ...assessment, exclusionReason: "retrospective exclusion" }
        : assessment),
    })).toThrow("selected candidate cannot have an exclusion reason");
  });

  test("writes stable compact selection evidence", async () => {
    const input = await fixtures();
    const outputPath = path.join(input.rootDir, "results/selection.json");

    const report = await writeProspectiveDynamicCandidateReport({ ...input, outputPath });

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report);
  });

  test("keeps the frozen selection verifiable after its selected intake entry reaches a terminal status", async () => {
    const input = await fixtures();
    input.intake.candidates[0]!.status = "prospective-measurement-invalid";

    const report = await evaluateProspectiveDynamicCandidate(input);

    expect(report.selectedSkillId).toBe("statistical-power");
    expect(report.authorizations.paidExecution).toBe(false);
  });

  test("validates the committed statistical-power selection against its exact upstream closure", async () => {
    const [portfolio, intake, policy] = await Promise.all([
      readFile(path.join(projectRoot, "benchmarks/skill-ir/corpus/method-portfolio.json"), "utf8").then(JSON.parse),
      readFile(path.join(projectRoot, "benchmarks/skill-ir/corpus/real-skill-intake.json"), "utf8").then(JSON.parse),
      readFile(path.join(projectRoot, "benchmarks/skill-ir/corpus/prospective-dynamic-candidate.json"), "utf8").then(JSON.parse),
    ]);

    const report = await evaluateProspectiveDynamicCandidate({ rootDir: projectRoot, portfolio, intake, policy });

    expect(report.selectedSkillId).toBe("statistical-power");
    expect(report.sourceBinding.closure).toHaveLength(6);
    expect(report.candidateCount).toBe(8);
    expect(report.authorizations.paidExecution).toBe(false);
  });
});
