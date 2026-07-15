import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillIRBenchmarkTask } from "./real-agent";
import {
  scoreRawRunRowsBySkill,
  taskIndexKey,
  type RawAgentRunRow,
} from "./scoring";
import {
  SemanticArtifactDevelopmentLockSchema,
  validateArtifactPackage,
} from "./artifact-package";

const taskPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/tasks.json",
);
const pilotManifestPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/corpus/corpora/pilot.json",
);
const verticalLockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-vertical-lock.json",
);
const staticLockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-static-lock.json",
);
const dualOverlayLockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-dual-overlay-lock.json",
);
const dualOverlayV2LockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-dual-overlay-v2-lock.json",
);
const executableArtifactPackagePath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1",
);
const executableArtifactLockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json",
);
const semanticArtifactPackagePath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2",
);
const semanticArtifactLockPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-executable-semantic-artifact-v2-lock.json",
);
const tempDirs: string[] = [];

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

async function loadNodeDevelopmentTask(): Promise<{
  skillId: string;
  task: SkillIRBenchmarkTask;
}> {
  const taskSet = JSON.parse(await readFile(taskPath, "utf8")) as TaskSet;
  const task = taskSet.tasks.find(
    (candidate) => candidate.id === "env-manager-node-audit-dev-001",
  );
  if (!task) throw new Error("Node development task fixture is missing");
  return { skillId: taskSet.skillId, task };
}

async function materializeSourceFixtures(
  task: SkillIRBenchmarkTask,
): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), "env-manager-pilot-"));
  tempDirs.push(workDir);
  for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
    const destination = join(workDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  return workDir;
}

async function writeJson(
  workDir: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await writeFile(
    join(workDir, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function writePerfectArtifacts(workDir: string): Promise<void> {
  await writeFile(
    join(workDir, ".env.example"),
    [
      "APP_PORT=3000",
      "REDIS_URL=redis://localhost:6379",
      "DB_PASSWORD=",
      "OLD_API_KEY=",
      "SENDGRID_API_KEY=",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeJson(workDir, ".env.schema.json", {
    variables: {
      APP_PORT: {
        type: "integer",
        required: true,
        minimum: 1,
        maximum: 65535,
      },
      REDIS_URL: { type: "string", required: true, format: "uri" },
      DB_PASSWORD: { type: "string", required: false, sensitive: true },
      OLD_API_KEY: { type: "string", required: false, sensitive: true },
      SENDGRID_API_KEY: { type: "string", required: true, sensitive: true },
    },
  });
  await writeJson(workDir, "env-report.json", {
    definedAndUsed: ["APP_PORT", "REDIS_URL"],
    definedUnconfirmedUnused: ["DB_PASSWORD", "OLD_API_KEY"],
    usedUndefined: ["SENDGRID_API_KEY"],
    hardcodedSecrets: ["src/auth.js:INTERNAL_TOKEN"],
    exposureRisks: [],
  });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function snapshotMaterializedFixtures(
  workDir: string,
  task: SkillIRBenchmarkTask,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.keys(task.fixtures ?? {}).sort().map(async (relativePath) => [
      relativePath,
      sha256(await readFile(join(workDir, relativePath))),
    ] as const),
  );
  return Object.fromEntries(entries);
}

function secretValues(task: SkillIRBenchmarkTask): string[] {
  const criterion = task.eval?.find(
    (candidate) => candidate.id === "env-no-secret-leak",
  );
  if (criterion?.method !== "custom") {
    throw new Error("Node development task secret-leak criterion is missing");
  }
  const payload = criterion.payload as { values?: unknown };
  if (
    !Array.isArray(payload.values) ||
    !payload.values.every((value): value is string => typeof value === "string")
  ) {
    throw new Error("Node development task secret payload is invalid");
  }
  return payload.values;
}

function containsSensitiveEvaluatorData(
  scored: unknown,
  task: SkillIRBenchmarkTask,
): boolean {
  const serialized = JSON.stringify(scored);
  return (
    serialized.includes('"payload"') ||
    secretValues(task).some((value) => serialized.includes(value))
  );
}

function expectSafeEvaluationSummaries(scored: ScoredRow): void {
  expect(scored.evaluationSummary).toHaveLength(6);
  for (const summary of scored.evaluationSummary ?? []) {
    expect(Object.keys(summary).sort()).toEqual([
      "details",
      "id",
      "method",
      "name",
      "pass",
      "score",
    ]);
    expect(["Criterion passed", "Criterion failed"]).toContain(summary.details);
    expect(summary.infraError).toBeUndefined();
  }
}

function rawRow(
  skillId: string,
  task: SkillIRBenchmarkTask,
  workDir: string,
): RawAgentRunRow {
  return {
    caseId: `${skillId}:skvm:windows:clean:${task.id}`,
    system: "original",
    taskPath,
    workDir,
    exitCode: 0,
    durationMs: 10,
    stdout: "Final output:\nEnvironment audit artifacts created.",
    stderr: "",
    successSource: "execution-only",
  };
}

type ScoredRow = Awaited<ReturnType<typeof scoreRawRunRowsBySkill>>[number];

async function scoreFreshNodeTask(
  mutate: (workDir: string, task: SkillIRBenchmarkTask) => Promise<void>,
): Promise<{ scored: ScoredRow; task: SkillIRBenchmarkTask }> {
  const { skillId, task } = await loadNodeDevelopmentTask();
  const sourceDigest = sha256(await readFile(taskPath, "utf8"));
  const fixtureDigest = sha256(JSON.stringify(task.fixtures));
  const workDir = await materializeSourceFixtures(task);
  await writePerfectArtifacts(workDir);
  await mutate(workDir, task);
  const fixturesBeforeScoring = await snapshotMaterializedFixtures(workDir, task);

  const [scored] = await scoreRawRunRowsBySkill(
    [rawRow(skillId, task, workDir)],
    new Map([[taskIndexKey(skillId, task.id), task]]),
  );
  if (!scored) throw new Error("Env-manager scorer returned no row");

  expect(sha256(await readFile(taskPath, "utf8"))).toBe(sourceDigest);
  expect(sha256(JSON.stringify(task.fixtures))).toBe(fixtureDigest);
  expect(await snapshotMaterializedFixtures(workDir, task)).toEqual(fixturesBeforeScoring);
  return { scored, task };
}

function expectSemanticFailure(
  scored: ScoredRow,
  task: SkillIRBenchmarkTask,
  failedCriteria: string[],
  evaluatorScore: number,
): void {
  expect(scored).toMatchObject({
    success: false,
    successSource: "deterministic-evaluator",
    failureStage: "evaluation",
    failedCriteria,
  });
  expect(scored.evaluatorScore).toBeCloseTo(evaluatorScore);
  expect(scored.failureType).toBeUndefined();
  expectSafeEvaluationSummaries(scored);
  expect(containsSensitiveEvaluatorData(scored, task)).toBe(false);
}

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("env-manager pilot scoring", () => {
  test("preregisters the semantic artifact v2 paid-development boundary", async () => {
    const [validated, lockText] = await Promise.all([
      validateArtifactPackage({
        packageDir: semanticArtifactPackagePath,
        expectedCatalog: "executable-semantic-artifact/v2",
      }),
      readFile(semanticArtifactLockPath, "utf8"),
    ]);
    const lock = SemanticArtifactDevelopmentLockSchema.parse(JSON.parse(lockText));

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-executable-semantic-artifact-lock/v1",
      stage: "executable-semantic-artifact-development",
      status: "preregistered",
      catalog: "executable-semantic-artifact/v2",
      codeCatalog: "semantic-error-codes/v1",
      model: { route: "xty/gpt-4.1-mini", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-semantic-artifact-v2" },
      matrix: {
        system: "ir-artifact-dev",
        repairModes: ["check-only", "one-repair"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
        repetitions: 2,
        initialGenerationRows: 8,
      },
      developmentGate: {
        minimumSuccesses: 3,
        minimumMeanScore: 0.85,
        maximumHardGateRegressions: 0,
        maximumInfrastructureFailures: 0,
      },
      attributionGate: {
        minimumRepairAttempts: 1,
        compareModes: ["check-only", "one-repair"],
        scorerAuthorityUnchanged: true,
      },
    });
    expect(lock.package.manifestSha256).toBe(
      sha256(await readFile(join(semanticArtifactPackagePath, "package-manifest.json"))),
    );
    expect(lock.package.provenanceSha256).toBe(
      sha256(await readFile(join(semanticArtifactPackagePath, "package-provenance.json"))),
    );
    expect(validated.provenance.taskContract.taskIds).toEqual(lock.matrix.taskIds);
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution before development gate",
      "changing scorer, package, code catalog, or gate after paid execution begins",
      "attributing arm differences when no repair was attempted",
    ]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("freezes a digest-bound executable artifact development experiment", async () => {
    const [validated, lockText] = await Promise.all([
      validateArtifactPackage({ packageDir: executableArtifactPackagePath }),
      readFile(executableArtifactLockPath, "utf8"),
    ]);
    const lock = JSON.parse(lockText) as {
      schemaVersion: string;
      stage: string;
      status: string;
      catalog: "executable-artifact/v1";
      corpus: string;
      skillId: string;
      package: {
        path: string;
        manifestSha256: string;
        provenanceSha256: string;
      };
      model: { route: string; family: string };
      adapter: { id: string; version: string };
      matrix: {
        system: string;
        repairModes: string[];
        contexts: string[];
        agents: string[];
        environments: string[];
        taskSplit: string;
        taskIds: string[];
        repetitions: number;
        initialGenerationRows: number;
      };
      runtime: { stateMachine: string[]; maxSemanticRepairCalls: number; apiKeyEnv: string };
      scoring: { authority: string; runtimeValidatorIsScorer: boolean; repairCostReportedSeparately: boolean };
      developmentGate: {
        minimumSuccesses: number;
        minimumMeanScore: number;
        maximumHardGateRegressions: number;
        maximumInfrastructureFailures: number;
      };
      prohibited: string[];
    };
    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-executable-artifact-lock/v1",
      stage: "executable-artifact-development",
      status: "preregistered",
      catalog: "executable-artifact/v1",
      corpus: "pilot",
      skillId: "env-manager",
      model: { route: "xty/gpt-4.1-mini", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-executable-artifact-v1" },
      matrix: {
        system: "ir-artifact-dev",
        repairModes: ["check-only", "one-repair"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
        repetitions: 2,
        initialGenerationRows: 8,
      },
      runtime: {
        stateMachine: ["preflight", "generation", "validate", "optional-one-repair", "revalidate", "stop"],
        maxSemanticRepairCalls: 1,
        apiKeyEnv: "SKVM_XTY_API_KEY",
      },
      scoring: {
        authority: "existing-deterministic-env-manager-scorer",
        runtimeValidatorIsScorer: false,
        repairCostReportedSeparately: true,
      },
      developmentGate: {
        minimumSuccesses: 3,
        minimumMeanScore: 0.85,
        maximumHardGateRegressions: 0,
        maximumInfrastructureFailures: 0,
      },
    });
    expect(lock.package.manifestSha256).toBe(
      sha256(await readFile(join(executableArtifactPackagePath, "package-manifest.json"))),
    );
    expect(lock.package.provenanceSha256).toBe(
      sha256(await readFile(join(executableArtifactPackagePath, "package-provenance.json"))),
    );
    expect(validated.manifest.catalog).toBe(lock.catalog);
    expect(validated.provenance.taskContract.taskIds).toEqual(lock.matrix.taskIds);
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution before development gate",
      "scorer tuning from artifact replay outputs",
      "overwriting dual-overlay v1/v2 locks",
      "more than one semantic repair call",
    ]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("preregisters a secret-free development-only engineering calibration lock", async () => {
    const [taskSet, manifest, lockText] = await Promise.all([
      readFile(taskPath, "utf8").then((text) => JSON.parse(text) as TaskSet),
      readFile(pilotManifestPath, "utf8").then((text) => JSON.parse(text) as {
        skills: Array<{
          id: string;
          status: string;
          irPath?: string;
          sourcePath?: string;
          sourceFiles?: Array<{ path: string; sha256: string }>;
        }>;
      }),
      readFile(verticalLockPath, "utf8"),
    ]);
    const lock = JSON.parse(lockText) as {
      schemaVersion: string;
      stage: string;
      corpus: string;
      skillId: string;
      panelConfigId: string;
      model: { route: string; family: string };
      adapter: { id: string; version: string };
      matrix: {
        systems: string[];
        contexts: string[];
        agents: string[];
        environments: string[];
        taskSplit: string;
        taskIds: string[];
        repetitions: number;
      };
      runtime: { apiKeyEnv: string };
      promotionBoundary: { corpusStatusRemains: string; createsBaseIr: boolean };
      prohibited: string[];
    };
    const manifestSkill = manifest.skills.find((skill) => skill.id === lock.skillId);
    const splitByTask = new Map(taskSet.tasks.map((task) => [task.id, task.split]));

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-vertical-lock/v1",
      stage: "engineering-calibration",
      corpus: "pilot",
      skillId: "env-manager",
      panelConfigId: "env-manager-calibration-v1",
      model: { route: "xty/gpt-4.1-mini", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-calibration-v1" },
      matrix: {
        systems: ["no-skill", "original"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
        repetitions: 2,
      },
      runtime: { apiKeyEnv: "SKVM_XTY_API_KEY" },
    });
    expect(lock.promotionBoundary).toEqual(expect.objectContaining({
      corpusStatusRemains: "tasks-authored",
      createsBaseIr: false,
    }));
    expect(manifestSkill).toMatchObject({
      status: "runnable",
      irPath: "benchmarks/skill-ir/pilots/env-manager/base-ir.json",
    });
    expect(lock.matrix.taskIds.every((taskId) => splitByTask.get(taskId) === "development")).toBe(true);
    expect(lock.prohibited).toEqual(expect.arrayContaining(["held-out execution", "IR materialization", "PGO compilation"]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("preregisters a digest-bound three-system static calibration lock", async () => {
    const [taskSet, lockText, baseIrBytes] = await Promise.all([
      readFile(taskPath, "utf8").then((text) => JSON.parse(text) as TaskSet),
      readFile(staticLockPath, "utf8"),
      readFile(join(import.meta.dir, "../../../benchmarks/skill-ir/pilots/env-manager/base-ir.json")),
    ]);
    const lock = JSON.parse(lockText) as {
      schemaVersion: string;
      stage: string;
      status: string;
      corpus: string;
      skillId: string;
      panelConfigId: string;
      source: { path: string; sha256: string };
      baseIr: { path: string; sha256: string; profileAnnotations: number };
      model: { route: string; family: string };
      adapter: { id: string; version: string };
      matrix: {
        systems: string[];
        contexts: string[];
        agents: string[];
        environments: string[];
        taskSplit: string;
        taskIds: string[];
        repetitions: number;
        matrixCellLimit: number;
      };
      runtime: { apiKeyEnv: string };
      prohibited: string[];
    };
    const splitByTask = new Map(taskSet.tasks.map((task) => [task.id, task.split]));

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-static-lock/v1",
      stage: "static-ir-calibration",
      status: "preregistered",
      corpus: "pilot",
      skillId: "env-manager",
      panelConfigId: "env-manager-static-v1",
      source: {
        path: "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md",
        sha256: "1da53ec17fadccd3f72644cb4e0b8db1cc250ce01c414aa125ed6cd6e76dad6c",
      },
      baseIr: {
        path: "benchmarks/skill-ir/pilots/env-manager/base-ir.json",
        profileAnnotations: 0,
      },
      model: { route: "xty/gpt-4.1-mini", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-static-v1" },
      matrix: {
        systems: ["no-skill", "original", "ir-static"],
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
        repetitions: 2,
        matrixCellLimit: 6,
      },
      runtime: { apiKeyEnv: "SKVM_XTY_API_KEY" },
    });
    expect(lock.baseIr.sha256).toBe(sha256(baseIrBytes));
    expect(lock.matrix.taskIds.every((taskId) => splitByTask.get(taskId) === "development")).toBe(true);
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution",
      "profile or PGO compilation",
      "scorer tuning from static calibration outputs",
      "base IR edits after execution begins",
    ]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("freezes a gold-isolated dual-source development replay", async () => {
    const resultsPath = join(
      import.meta.dir,
      "../../../results/skill-ir/env-manager-static-v1-2026-07-15/scored-results.jsonl",
    );
    const [taskSet, lockText, sourceBytes, baseIrBytes, resultsBytes] = await Promise.all([
      readFile(taskPath, "utf8").then((text) => JSON.parse(text) as TaskSet),
      readFile(dualOverlayLockPath, "utf8"),
      readFile(join(import.meta.dir, "../../../benchmarks/skill-ir/pilots/env-manager/source/SKILL.md")),
      readFile(join(import.meta.dir, "../../../benchmarks/skill-ir/pilots/env-manager/base-ir.json")),
      readFile(resultsPath),
    ]);
    const lock = JSON.parse(lockText) as {
      schemaVersion: string;
      stage: string;
      status: string;
      corpus: string;
      skillId: string;
      evidencePolicy: string;
      lineageCatalog: string;
      repairCatalog: string;
      minDistinctTasks: number;
      source: { sha256: string };
      baseIr: { sha256: string };
      construction: { sourceSystems: string[]; taskIds: string[]; results: { sha256: string } };
      replay: { system: string; taskSplit: string; taskIds: string[]; contexts: string[]; repetitions: number };
      prohibited: string[];
    };
    const splitByTask = new Map(taskSet.tasks.map((task) => [task.id, task.split]));

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-dual-overlay-lock/v1",
      stage: "dual-source-overlay-development",
      status: "preregistered",
      corpus: "pilot",
      skillId: "env-manager",
      evidencePolicy: "dual-source-residual/v1",
      lineageCatalog: "env-manager/v1",
      repairCatalog: "typed-output-repair/v1",
      minDistinctTasks: 2,
      construction: {
        sourceSystems: ["original", "ir-static"],
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
      },
      replay: {
        system: "ir-pgo-dev",
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
        contexts: ["clean"],
        repetitions: 2,
      },
    });
    expect(lock.source.sha256).toBe(sha256(sourceBytes));
    expect(lock.baseIr.sha256).toBe(sha256(baseIrBytes));
    expect(lock.construction.results.sha256).toBe(sha256(resultsBytes));
    expect(lock.replay.taskIds.every((taskId) => splitByTask.get(taskId) === "development")).toBe(true);
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "held-out execution",
      "scorer expected or fixture-gold compiler input",
      "scorer changes after construction begins",
      "base IR edits after construction begins",
    ]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("freezes the contract-aware v2 amendment without overwriting v1", async () => {
    const [lockText, passBytes, v1ReplayBytes] = await Promise.all([
      readFile(dualOverlayV2LockPath, "utf8"),
      readFile(join(import.meta.dir, "../../skill-ir/passes/typed-output-repair.ts")),
      readFile(join(
        import.meta.dir,
        "../../../results/skill-ir/env-manager-dual-overlay-v1-2026-07-16-dev-replay/scored-results.jsonl",
      )),
    ]);
    const lock = JSON.parse(lockText) as {
      schemaVersion: string;
      repairCatalog: string;
      pass: { sha256: string };
      predecessor: { repairCatalog: string; replayResults: { sha256: string }; outcome: string };
      replay: { system: string; taskSplit: string; repetitions: number };
      prohibited: string[];
    };

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-env-manager-dual-overlay-lock/v2",
      repairCatalog: "typed-output-repair/v2",
      predecessor: {
        repairCatalog: "typed-output-repair/v1",
        outcome: "no-development-improvement",
      },
      replay: { system: "ir-pgo-dev", taskSplit: "development", repetitions: 2 },
    });
    expect(lock.pass.sha256).toBe(sha256(passBytes));
    expect(lock.predecessor.replayResults.sha256).toBe(sha256(v1ReplayBytes));
    expect(lock.prohibited).toEqual(expect.arrayContaining([
      "overwrite v1 artifacts",
      "held-out execution before the v2 development gate passes",
      "scorer changes",
    ]));
    expect(lockText).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("scores a perfect Node development audit with six safe deterministic summaries", async () => {
    const { skillId, task } = await loadNodeDevelopmentTask();
    const sourceDigest = sha256(await readFile(taskPath, "utf8"));
    const workDir = await materializeSourceFixtures(task);
    await writePerfectArtifacts(workDir);
    const fixturesBeforeScoring = await snapshotMaterializedFixtures(workDir, task);
    const [scored] = await scoreRawRunRowsBySkill(
      [rawRow(skillId, task, workDir)],
      new Map([[taskIndexKey(skillId, task.id), task]]),
    );

    expect(scored).toMatchObject({
      success: true,
      successSource: "deterministic-evaluator",
      evaluatorScore: 1,
    });
    if (!scored) throw new Error("Env-manager scorer returned no row");
    expectSafeEvaluationSummaries(scored);
    expect(scored.evaluationSummary?.every((summary) => summary.details === "Criterion passed")).toBe(true);
    expect(containsSensitiveEvaluatorData(scored, task)).toBe(false);
    expect(await snapshotMaterializedFixtures(workDir, task)).toEqual(fixturesBeforeScoring);
    expect(sha256(await readFile(taskPath, "utf8"))).toBe(sourceDigest);
  });

  test("fails semantically when the protected .env changes", async () => {
    const { scored, task } = await scoreFreshNodeTask(async (workDir) => {
      await writeFile(join(workDir, ".env"), "APP_PORT=3001\n", "utf8");
    });

    expectSemanticFailure(scored, task, ["env-protected-files"], 0.8);
  });

  test("fails both leak checks when a synthetic secret reaches .env.example", async () => {
    const { scored, task } = await scoreFreshNodeTask(
      async (workDir, nodeTask) => {
        const [value] = secretValues(nodeTask);
        if (!value) throw new Error("Node development task has no secret value");
        await writeFile(
          join(workDir, ".env.example"),
          [
            "APP_PORT=3000",
            "REDIS_URL=redis://localhost:6379",
            `DB_PASSWORD=${value}`,
            "OLD_API_KEY=",
            "SENDGRID_API_KEY=",
            "",
          ].join("\n"),
          "utf8",
        );
      },
    );

    expectSemanticFailure(
      scored,
      task,
      ["env-no-secret-leak", "env-example-safety"],
      0.65,
    );
  });

  test("fails required artifacts semantically for malformed schema JSON", async () => {
    const { scored, task } = await scoreFreshNodeTask(async (workDir) => {
      await writeFile(join(workDir, ".env.schema.json"), "{not-json", "utf8");
    });

    expectSemanticFailure(
      scored,
      task,
      ["env-required-artifacts", "env-schema-rules"],
      0.75,
    );
  });

  test("fails classification semantically for the wrong used-undefined set", async () => {
    const { scored, task } = await scoreFreshNodeTask(async (workDir) => {
      await writeJson(workDir, "env-report.json", {
        definedAndUsed: ["APP_PORT", "REDIS_URL"],
        definedUnconfirmedUnused: ["DB_PASSWORD", "OLD_API_KEY"],
        usedUndefined: ["MAIL_PROVIDER_KEY"],
        hardcodedSecrets: ["src/auth.js:INTERNAL_TOKEN"],
        exposureRisks: [],
      });
    });

    expectSemanticFailure(scored, task, ["env-classification"], 0.8);
  });
});
