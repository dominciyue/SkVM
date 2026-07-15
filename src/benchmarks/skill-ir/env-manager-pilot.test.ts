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

const taskPath = join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/env-manager/tasks.json",
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
