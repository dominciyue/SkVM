import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { RunResult } from "../../core/types.ts";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts";
import { experimentalDesignGradeV2 } from "./experimental-design-grade-v2.ts";

const directories: string[] = [];
const properties = {
  preservesAssignmentUnits: true,
  balancesGlobally: true,
  balancesWithinStrata: false,
  supportsSequentialEnrollment: false,
};

const study = {
  studyId: "oracle-independent-v2",
  question: "Does either public arm improve the response?",
  assignmentLevel: "individual",
  assignmentUnit: "participant",
  analysisUnit: "participant",
  response: "score",
  arms: ["left", "right"],
  seed: 17,
  nuisanceFactors: [],
  sequentialEnrollment: false,
  units: [{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }],
} as const;

const contract = {
  schemaVersion: "skill-ir-experimental-design-public-contract/v2",
  contractId: "experimental-design-public-contract-v2",
  contractRevision: "materialized-delta/v1",
  protectedInputs: ["study.json", "design-contract.json"],
  outputs: [
    "design/design-plan.json",
    "design/allocation.csv",
    "design/design-report.md",
  ],
};

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function writeOracleFixture(allocation: string): Promise<{
  runResult: RunResult;
  studyBytes: string;
  contractBytes: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "experimental-design-v2-oracle-"));
  directories.push(root);
  const workDir = path.join(root, "workdir");
  await mkdir(workDir);
  const studyBytes = json(study);
  const contractBytes = json(contract);
  await Promise.all([
    writeFile(path.join(workDir, "study.json"), studyBytes, "utf8"),
    writeFile(path.join(workDir, "design-contract.json"), contractBytes, "utf8"),
  ]);
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: path.join(root, "initial-workdir-manifest.json"),
  });
  const plan = {
    studyId: study.studyId,
    method: "任何公开等价方法描述",
    assignmentLevel: study.assignmentLevel,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    arms: study.arms,
    seed: study.seed,
    allocationPath: "design/allocation.csv",
    designProperties: properties,
  };
  const report = [
    "# Independent oracle report",
    "```json design-evidence",
    JSON.stringify({
      studyId: study.studyId,
      assignmentUnit: study.assignmentUnit,
      analysisUnit: study.analysisUnit,
      response: study.response,
      seed: study.seed,
      allocationPath: "design/allocation.csv",
      allocationRows: 4,
      armCounts: { left: 2, right: 2 },
      designProperties: properties,
      limitationFlags: ["randomness-not-statistically-audited"],
    }, null, 2),
    "```",
    "",
  ].join("\n");
  await mkdir(path.join(workDir, "design"));
  await Promise.all([
    writeFile(path.join(workDir, "design/design-plan.json"), json(plan), "utf8"),
    writeFile(path.join(workDir, "design/allocation.csv"), allocation, "utf8"),
    writeFile(path.join(workDir, "design/design-report.md"), report, "utf8"),
  ]);
  return {
    runResult: {
      text: "done",
      steps: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cost: 0,
      durationMs: 0,
      llmDurationMs: 0,
      workDir,
      runStatus: "ok",
      initialWorkdirManifest,
    },
    studyBytes,
    contractBytes,
  };
}

async function grade(
  check: string,
  fixture: Awaited<ReturnType<typeof writeOracleFixture>>,
) {
  return experimentalDesignGradeV2.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-experimental-design-v2",
      payload: {
        schemaVersion: "skill-ir-experimental-design-eval/v2",
        contractRevision: "materialized-delta/v1",
        check,
        paths: {
          study: "study.json",
          contract: "design-contract.json",
          plan: "design/design-plan.json",
          allocation: "design/allocation.csv",
          report: "design/design-report.md",
        },
        protectedSha256: {
          study: sha256(fixture.studyBytes),
          contract: sha256(fixture.contractBytes),
        },
      },
    },
    runResult: fixture.runResult,
  });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("experimental-design v2 independent public oracle", () => {
  test("accepts a hard-coded legal allocation and its physical row permutation", async () => {
    for (const allocation of [
      "order,unit_id,stratum,arm\n1,u1,,left\n2,u2,,right\n3,u3,,left\n4,u4,,right\n",
      "order,unit_id,stratum,arm\n4,u4,,right\n2,u2,,right\n1,u1,,left\n3,u3,,left\n",
    ]) {
      const fixture = await writeOracleFixture(allocation);
      for (const check of [
        "input-integrity",
        "artifact-contract",
        "design-semantics",
        "allocation-safety",
        "report-consistency",
      ]) {
        expect(await grade(check, fixture)).toMatchObject({ pass: true, score: 1 });
      }
    }
  });

  test("rejects hard-coded duplicate-unit and imbalanced allocations", async () => {
    for (const allocation of [
      "order,unit_id,stratum,arm\n1,u1,,left\n2,u1,,right\n3,u3,,left\n4,u4,,right\n",
      "order,unit_id,stratum,arm\n1,u1,,left\n2,u2,,left\n3,u3,,left\n4,u4,,right\n",
    ]) {
      const fixture = await writeOracleFixture(allocation);
      expect(await grade("allocation-safety", fixture)).toMatchObject({
        pass: false,
        score: 0,
      });
    }
  });
});
