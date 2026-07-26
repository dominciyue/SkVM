import { createHash } from "node:crypto";
import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RunResult } from "../../core/types.ts";
import { customEvaluators } from "../../framework/types.ts";
import "./index.ts";
import {
  ExperimentalDesignGradeV2PayloadSchema,
  experimentalDesignGradeV2,
} from "./experimental-design-grade-v2.ts";

const schemaVersion = "skill-ir-experimental-design-eval/v2";
const temporaryDirectories = new Set<string>();

const study = {
  studyId: "site-stratified-recovery-v2-dev",
  question: "Does the intervention reduce recovery time across sites?",
  assignmentLevel: "individual",
  assignmentUnit: "participant",
  analysisUnit: "participant",
  response: "recovery_days",
  arms: ["control", "intervention"],
  seed: 37,
  nuisanceFactors: ["site"],
  sequentialEnrollment: false,
  units: [
    { id: "A-01", stratum: "site-a" },
    { id: "B-01", stratum: "site-b" },
    { id: "A-02", stratum: "site-a" },
    { id: "B-02", stratum: "site-b" },
  ],
} as const;

const contract = {
  schemaVersion: "skill-ir-experimental-design-public-contract/v2",
  contractId: "experimental-design-public-contract-v2",
};

const allocationRows = [
  "order,unit_id,stratum,arm",
  "4,B-02,site-b,intervention",
  "1,A-01,site-a,control",
  "3,A-02,site-a,intervention",
  "2,B-01,site-b,control",
  "",
].join("\n");

const designProperties = {
  preservesAssignmentUnits: true,
  balancesGlobally: true,
  balancesWithinStrata: true,
  supportsSequentialEnrollment: false,
};

const limitationFlags = [
  "randomness-not-statistically-audited",
  "stratified-assignment",
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reportEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    studyId: study.studyId,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    seed: study.seed,
    allocationPath: "design/allocation.csv",
    allocationRows: study.units.length,
    armCounts: { intervention: 2, control: 2 },
    designProperties,
    limitationFlags,
    ...overrides,
  };
}

function markdownReport(evidence: Record<string, unknown> = reportEvidence()): string {
  return [
    "# 设计说明",
    "本报告可以使用任意自然语言，不参与逐字评分。",
    "```json design-evidence",
    JSON.stringify(evidence, null, 2),
    "```",
    "",
  ].join("\n");
}

async function makeWorkDir(prefix = "experimental-design-v2-grade-"): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

function runResult(workDir: string): RunResult {
  return {
    text: "Design complete.",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    runStatus: "ok",
  };
}

function payload(check: string, studyBytes: string, contractBytes: string): unknown {
  return {
    schemaVersion,
    check,
    paths: {
      study: "study.json",
      contract: "design-contract.json",
      plan: "design/design-plan.json",
      allocation: "design/allocation.csv",
      report: "design/design-report.md",
    },
    protectedSha256: {
      study: sha256(studyBytes),
      contract: sha256(contractBytes),
    },
  };
}

async function grade(check: string, workDir: string, studyBytes: string, contractBytes: string) {
  return experimentalDesignGradeV2.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-experimental-design-v2",
      payload: payload(check, studyBytes, contractBytes),
    },
    runResult: runResult(workDir),
  });
}

async function writeValidFixture(overrides: {
  study?: unknown;
  plan?: Record<string, unknown>;
  allocation?: string;
  report?: string;
} = {}): Promise<{ workDir: string; studyBytes: string; contractBytes: string }> {
  const workDir = await makeWorkDir();
  const studyBytes = json(overrides.study ?? study);
  const contractBytes = json(contract);
  const plan = {
    studyId: study.studyId,
    method: "自定义分层平衡程序",
    assignmentLevel: study.assignmentLevel,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    arms: study.arms,
    seed: study.seed,
    allocationPath: "design/allocation.csv",
    designProperties,
    implementationNote: "Extra public field is allowed.",
    ...overrides.plan,
  };
  await mkdir(path.join(workDir, "design"), { recursive: true });
  await writeFile(path.join(workDir, "study.json"), studyBytes, "utf8");
  await writeFile(path.join(workDir, "design-contract.json"), contractBytes, "utf8");
  await writeFile(path.join(workDir, "design/design-plan.json"), json(plan), "utf8");
  await writeFile(
    path.join(workDir, "design/allocation.csv"),
    overrides.allocation ?? allocationRows,
    "utf8",
  );
  await writeFile(
    path.join(workDir, "design/design-report.md"),
    overrides.report ?? markdownReport(),
    "utf8",
  );
  return { workDir, studyBytes, contractBytes };
}

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  temporaryDirectories.clear();
});

describe("experimental-design v2 evaluator registration and boundary", () => {
  test("registers the independent v2 evaluator and validates the closed payload", () => {
    expect(customEvaluators.get("skill-ir-experimental-design-v2")).toBe(
      experimentalDesignGradeV2,
    );
    expect(() =>
      ExperimentalDesignGradeV2PayloadSchema.parse({
        ...(payload("input-integrity", "{}", "{}") as object),
        expected: "private-gold",
      }),
    ).toThrow();
  });

  test("classifies invalid payloads, unsafe paths, symlinks, and unavailable workdirs as infrastructure", async () => {
    const fixture = await writeValidFixture();
    const badPayload = {
      ...(payload("input-integrity", fixture.studyBytes, fixture.contractBytes) as any),
      paths: {
        ...(payload("input-integrity", fixture.studyBytes, fixture.contractBytes) as any).paths,
        study: "../study.json",
      },
    };
    const invalid = await experimentalDesignGradeV2.run({
      criterion: {
        method: "custom",
        evaluatorId: "skill-ir-experimental-design-v2",
        payload: badPayload,
      },
      runResult: runResult(fixture.workDir),
    });
    expect(invalid).toMatchObject({ pass: false, score: 0 });
    expect(invalid.infraError).toBeDefined();

    const unavailable = await grade(
      "input-integrity",
      path.join(fixture.workDir, "missing"),
      fixture.studyBytes,
      fixture.contractBytes,
    );
    expect(unavailable.infraError).toBeDefined();

    const outside = await makeWorkDir("experimental-design-v2-outside-");
    const outsideFile = path.join(outside, "study.json");
    await writeFile(outsideFile, fixture.studyBytes, "utf8");
    await rm(path.join(fixture.workDir, "study.json"));
    try {
      await symlink(outsideFile, path.join(fixture.workDir, "study.json"), "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        return;
      }
      throw error;
    }
    const linked = await grade(
      "input-integrity",
      fixture.workDir,
      fixture.studyBytes,
      fixture.contractBytes,
    );
    expect(linked.infraError).toBeDefined();
  });
});

describe("experimental-design v2 semantic checks", () => {
  test("accepts free method text, reordered CSV rows, Chinese prose, and extra JSON fields", async () => {
    const fixture = await writeValidFixture();
    for (const check of [
      "input-integrity",
      "artifact-contract",
      "design-semantics",
      "allocation-safety",
      "report-consistency",
    ]) {
      expect(
        await grade(check, fixture.workDir, fixture.studyBytes, fixture.contractBytes),
      ).toMatchObject({ pass: true, score: 1 });
    }
  });

  test("fails protected input drift and missing or extra design artifacts without infrastructure", async () => {
    const fixture = await writeValidFixture();
    await writeFile(path.join(fixture.workDir, "study.json"), "{}\n", "utf8");
    const integrity = await grade(
      "input-integrity",
      fixture.workDir,
      fixture.studyBytes,
      fixture.contractBytes,
    );
    expect(integrity).toMatchObject({ pass: false, score: 0 });
    expect(integrity.infraError).toBeUndefined();

    await rm(path.join(fixture.workDir, "design/design-plan.json"));
    const missing = await grade(
      "artifact-contract",
      fixture.workDir,
      fixture.studyBytes,
      fixture.contractBytes,
    );
    expect(missing).toMatchObject({ pass: false, score: 0 });
    expect(missing.infraError).toBeUndefined();

    const extraFixture = await writeValidFixture();
    await writeFile(path.join(extraFixture.workDir, "design/extra.txt"), "extra\n", "utf8");
    const extra = await grade(
      "artifact-contract",
      extraFixture.workDir,
      extraFixture.studyBytes,
      extraFixture.contractBytes,
    );
    expect(extra).toMatchObject({ pass: false, score: 0 });

    const duplicateFixture = await writeValidFixture();
    await writeFile(
      path.join(duplicateFixture.workDir, "design/design-plan.json"),
      '{"studyId":"a","studyId":"b"}\n',
      "utf8",
    );
    const duplicate = await grade(
      "artifact-contract",
      duplicateFixture.workDir,
      duplicateFixture.studyBytes,
      duplicateFixture.contractBytes,
    );
    expect(duplicate).toMatchObject({ pass: false, score: 0 });
  });

  test("fails missing or drifted public designProperties", async () => {
    for (const plan of [
      { designProperties: undefined },
      { designProperties: { ...designProperties, balancesGlobally: false } },
    ]) {
      const fixture = await writeValidFixture({ plan });
      const result = await grade(
        "design-semantics",
        fixture.workDir,
        fixture.studyBytes,
        fixture.contractBytes,
      );
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.infraError).toBeUndefined();
    }
  });

  test("fails unit coverage, invalid arms, stratum imbalance, and sequential block imbalance", async () => {
    const invalidAllocations = [
      allocationRows.replace("4,B-02,site-b,intervention\n", ""),
      allocationRows.replace("intervention", "unknown-arm"),
      allocationRows.replace("4,B-02,site-b,intervention", "4,B-02,site-b,control"),
    ];
    for (const allocation of invalidAllocations) {
      const fixture = await writeValidFixture({ allocation });
      const result = await grade(
        "allocation-safety",
        fixture.workDir,
        fixture.studyBytes,
        fixture.contractBytes,
      );
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.infraError).toBeUndefined();
    }

    const sequentialStudy = {
      ...study,
      studyId: "sequential-v2",
      sequentialEnrollment: true,
      nuisanceFactors: [],
      units: [
        { id: "U-1" },
        { id: "U-2" },
        { id: "U-3" },
        { id: "U-4" },
      ],
    };
    const fixture = await writeValidFixture({
      study: sequentialStudy,
      allocation: [
        "order,unit_id,stratum,arm",
        "1,U-1,,control",
        "2,U-2,,control",
        "3,U-3,,intervention",
        "4,U-4,,intervention",
        "",
      ].join("\n"),
    });
    const result = await grade(
      "allocation-safety",
      fixture.workDir,
      fixture.studyBytes,
      fixture.contractBytes,
    );
    expect(result).toMatchObject({ pass: false, score: 0 });
  });
});

describe("experimental-design v2 report evidence", () => {
  test("returns pass=true score=0 for missing, multiple, malformed, or duplicate-key blocks", async () => {
    const reports = [
      "No structured block.\n",
      `${markdownReport()}${markdownReport()}\n`,
      "```json design-evidence\n{ trailing: true }\n```\n",
      '```json design-evidence\n{"studyId":"a","studyId":"b"}\n```\n',
    ];
    for (const report of reports) {
      const fixture = await writeValidFixture({ report });
      const result = await grade(
        "report-consistency",
        fixture.workDir,
        fixture.studyBytes,
        fixture.contractBytes,
      );
      expect(result).toMatchObject({ pass: true, score: 0 });
      expect(result.infraError).toBeUndefined();
    }
  });

  test("scores the four report atoms at quarter increments without requiring prose", async () => {
    const expectedScores = [0.75, 0.5, 0.25];
    const omittedGroups = [
      ["limitationFlags"],
      ["limitationFlags", "allocationRows"],
      ["limitationFlags", "allocationRows", "studyId"],
    ];
    for (let index = 0; index < omittedGroups.length; index += 1) {
      const evidence = reportEvidence();
      for (const key of omittedGroups[index]!) delete evidence[key];
      const fixture = await writeValidFixture({ report: markdownReport(evidence) });
      const result = await grade(
        "report-consistency",
        fixture.workDir,
        fixture.studyBytes,
        fixture.contractBytes,
      );
      expect(result.pass).toBe(true);
      expect(result.score).toBe(expectedScores[index]!);
    }
  });

  test("marks observable report contradictions as hard failures", async () => {
    for (const overrides of [
      { seed: 999 },
      { allocationRows: 999 },
      { designProperties: { ...designProperties, balancesWithinStrata: false } },
      { limitationFlags: ["randomness-not-statistically-audited"] },
    ]) {
      const fixture = await writeValidFixture({
        report: markdownReport(reportEvidence(overrides)),
      });
      const result = await grade(
        "report-consistency",
        fixture.workDir,
        fixture.studyBytes,
        fixture.contractBytes,
      );
      expect(result.pass).toBe(false);
      expect(result.infraError).toBeUndefined();
    }
  });
});
