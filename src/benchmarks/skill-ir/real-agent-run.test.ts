import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import {
  assertRequiredEnv,
  buildPlan,
  executePlan,
  extractRunStatus,
  parseRealAgentRunArgs,
  resetPersistentWorkDir,
  type RealAgentRunArgs,
} from "./real-agent-run";
import { buildFinalIRProvenance } from "./final-ir-provenance";
import type { RealAgentRunPlanEntry } from "./real-agent";
import { sha256Bytes } from "./source-fixture";

const tempDirs: string[] = [];

const defaultRunIdentityArgs = {
  modelFamily: "test",
  adapterVersion: "workspace",
  repetitions: 1,
  panelConfigId: "single-run",
};

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function irFixture(id: string, name: string, sourceText: string): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id,
    name,
    category: ["workflow"],
    intent: `Execute ${name} consistently.`,
    source: { kind: "inline", text: sourceText },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [
      {
        id: "step-main",
        title: "Main step",
        description: "Perform the main benchmark action.",
        kind: "execute",
        required: true,
        dependsOn: [],
        toolRefs: [],
        produces: ["result"],
        successCheckRefs: [],
        failureModes: [],
      },
    ],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createMultiSkillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-run-"));
  tempDirs.push(root);

  await writeJson(join(root, "benchmarks/skill-ir/contexts/standard-contexts.json"), {
    schemaVersion: "skill-ir-contexts/v1",
    contexts: [{ id: "clean", description: "Clean context." }],
  });
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/review.json"),
    irFixture("skill-review", "Review Skill", "Review source text."),
  );
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/diagnostic.json"),
    irFixture("skill-diagnostic", "Diagnostic Skill", "Diagnostic source text."),
  );
  await writeJson(join(root, "benchmarks/skill-ir/tasks/review.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-review",
    tasks: [{ id: "review-task", split: "development", prompt: "Review task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/tasks/diagnostic.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-diagnostic",
    tasks: [{ id: "diagnostic-task", split: "development", prompt: "Diagnostic task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/manifest.json"), {
    schemaVersion: "skill-ir-corpus-registry/v1",
    corpora: {
      calibration: {
        manifestPath: "benchmarks/skill-ir/corpus/corpora/calibration.json",
        role: "test",
      },
      pilot: {
        manifestPath: "benchmarks/skill-ir/corpus/corpora/pilot.json",
        role: "test",
      },
    },
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/corpora/calibration.json"), {
    schemaVersion: "skill-ir-corpus/v2",
    corpusId: "calibration",
    categories: ["workflow"],
    skills: [
      {
        id: "skill-review",
        name: "Review Skill",
        category: ["workflow"],
        depth: "calibration",
        status: "runnable",
        provenance: "real-public",
        source: "public/review",
        sourceUrl: "https://example.com/review",
        evidenceWeight: "main-real",
        irPath: "benchmarks/skill-ir/ir/review.json",
        tasksPath: "benchmarks/skill-ir/tasks/review.json",
      },
      {
        id: "skill-diagnostic",
        name: "Diagnostic Skill",
        category: ["workflow"],
        depth: "calibration",
        status: "runnable",
        provenance: "adapted-public",
        source: "public/diagnostic",
        sourceUrl: "https://example.com/diagnostic",
        evidenceWeight: "support-real",
        irPath: "benchmarks/skill-ir/ir/diagnostic.json",
        tasksPath: "benchmarks/skill-ir/tasks/diagnostic.json",
      },
    ],
  });

  return root;
}

async function createTasksAuthoredPilotRoot(): Promise<string> {
  const root = await createMultiSkillRoot();
  const sourcePath = "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md";
  const sourceText = "# Environment Variable Manager\n\nAudit environment variables without leaking secrets.\n";
  await mkdir(dirname(join(root, sourcePath)), { recursive: true });
  await writeFile(join(root, sourcePath), sourceText, "utf8");
  await writeJson(join(root, "benchmarks/skill-ir/tasks/env-manager.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "env-manager",
    tasks: [
      { id: "env-dev-1", split: "development", prompt: "Audit fixture one.", successCriteria: [] },
      { id: "env-dev-2", split: "development", prompt: "Audit fixture two.", successCriteria: [] },
      { id: "env-heldout-1", split: "held-out", prompt: "Audit held-out fixture.", successCriteria: [] },
    ],
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/corpora/pilot.json"), {
    schemaVersion: "skill-ir-corpus/v2",
    corpusId: "pilot",
    skills: [
      {
        id: "env-manager",
        name: "Environment Variable Manager",
        category: ["tool-use", "constraint-heavy", "environment-sensitive"],
        status: "tasks-authored",
        provenance: "real-public",
        evidenceWeight: "main-real",
        sourcePath,
        tasksPath: "benchmarks/skill-ir/tasks/env-manager.json",
        sourceFiles: [{ path: sourcePath, sha256: sha256Bytes(Buffer.from(sourceText, "utf8")) }],
      },
    ],
  });
  return root;
}

describe("real-agent-run manifest loading", () => {
  test("resetPersistentWorkDir recreates only the supplied materialized workdir", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-reset-"));
    tempDirs.push(rootDir);
    const runDir = join(rootDir, "case", "original", "run-1");
    const workDir = join(runDir, "workdir");
    const staleOutput = join(workDir, "nested", "stale-output.txt");
    const taskSentinel = join(runDir, "task", "task.json");
    const skillSentinel = join(runDir, "skill", "SKILL.md");
    await Promise.all([
      mkdir(join(workDir, "nested"), { recursive: true }),
      mkdir(dirname(taskSentinel), { recursive: true }),
      mkdir(dirname(skillSentinel), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(staleOutput, "stale\n", "utf8"),
      writeFile(taskSentinel, "task\n", "utf8"),
      writeFile(skillSentinel, "skill\n", "utf8"),
    ]);
    await resetPersistentWorkDir(workDir);

    expect((await stat(workDir)).isDirectory()).toBe(true);
    expect(await Bun.file(staleOutput).exists()).toBe(false);
    expect(await Bun.file(taskSentinel).text()).toBe("task\n");
    expect(await Bun.file(skillSentinel).text()).toBe("skill\n");
  });

  test("resetPersistentWorkDir rejects a target outside the materialized workdir shape", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-reset-"));
    tempDirs.push(rootDir);
    const runDir = join(rootDir, "case", "original", "run-1");
    const sentinel = join(runDir, "task", "task.json");
    await mkdir(dirname(sentinel), { recursive: true });
    await writeFile(sentinel, "task\n", "utf8");

    expect(resetPersistentWorkDir(runDir)).rejects.toThrow("Refusing to reset non-materialized workdir");
    expect(await Bun.file(sentinel).text()).toBe("task\n");
  });

  test("executePlan writes the persistent workDir into each raw row", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-execute-"));
    tempDirs.push(rootDir);
    const outDir = join(rootDir, "out");
    const workDir = join(rootDir, "case", "original", "run-1", "workdir");
    await mkdir(outDir, { recursive: true });
    const plan: RealAgentRunPlanEntry[] = [{
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath: join(rootDir, "task.json"),
      workDir,
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "workspace",
      runIndex: 1,
      panelConfigId: "single-run",
      command: [process.execPath, "-e", "console.log('Final output:\\nok')"],
    }];

    await executePlan(plan, {
      corpus: "calibration",
      model: "test/model",
      adapter: "bare-agent",
      outDir,
      limit: 1,
      execute: true,
      retries: 0,
      retryDelayMs: 0,
      rootDir,
    });

    const rawRow = JSON.parse((await Bun.file(join(outDir, "raw-runs.jsonl")).text()).trim());
    expect(rawRow.workDir).toBe(workDir);
    expect(rawRow.runStatus).toBe("ok");
  });

  test("extractRunStatus reads a colored non-ok status without trusting final output text", () => {
    expect(extractRunStatus("\u001b[33mwarning runStatus: timeout\u001b[0m\nFinal output:\nok")).toBe("timeout");
    expect(extractRunStatus("Run complete\nFinal output:\nreported runStatus: adapter-crashed")).toBe("ok");
  });

  test("executePlan persists non-ok adapter status when the wrapper exits zero", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-status-"));
    tempDirs.push(rootDir);
    const outDir = join(rootDir, "out");
    const workDir = join(rootDir, "case", "original", "run-1", "workdir");
    await mkdir(outDir, { recursive: true });

    await executePlan([{
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath: join(rootDir, "task.json"),
      workDir,
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "workspace",
      runIndex: 1,
      panelConfigId: "single-run",
      command: [process.execPath, "-e", "console.log('warning runStatus: adapter-crashed\\nFinal output:\\nresidual')"],
    }], {
      corpus: "calibration",
      model: "test/model",
      adapter: "bare-agent",
      outDir,
      limit: 1,
      execute: true,
      retries: 0,
      retryDelayMs: 0,
      rootDir,
    });

    const rawRow = JSON.parse((await Bun.file(join(outDir, "raw-runs.jsonl")).text()).trim());
    expect(rawRow).toMatchObject({ exitCode: 0, runStatus: "adapter-crashed" });
  });

  test("parseRealAgentRunArgs requires an explicit corpus", () => {
    expect(() => parseRealAgentRunArgs([])).toThrow("--corpus is required");
  });

  test("parseRealAgentRunArgs parses explicit run identity and repetitions", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=calibration",
      "--model=xty/gpt-4.1-mini",
      "--model-family=gpt",
      "--adapter=bare-agent",
      "--adapter-version=workspace-2026-07-15",
      "--panel-config-id=env-manager-calibration-v1",
      "--repetitions=3",
    ]);

    expect(parsed).toMatchObject({
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "env-manager-calibration-v1",
      repetitions: 3,
    });
  });

  test("parseRealAgentRunArgs recognizes the explicit tasks-authored calibration selector", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=pilot",
      "--allow-tasks-authored",
      "--skills=env-manager",
      "--systems=no-skill,original",
      "--contexts=clean",
      "--tasks=env-dev-1,env-dev-2",
    ]);

    expect(parsed.allowTasksAuthored).toBe(true);
    expect(parsed.skills).toEqual(new Set(["env-manager"]));
  });

  test("parseRealAgentRunArgs recognizes the explicit development replay selector", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=pilot",
      "--allow-development-replay",
      "--skills=env-manager",
      "--systems=ir-pgo-dev",
      "--contexts=clean",
      "--tasks=env-dev-1,env-dev-2",
      "--ir-override-dir=results/final-ir",
    ]);

    expect(parsed.allowDevelopmentReplay).toBe(true);
    expect(parsed.systems).toEqual(new Set(["ir-pgo-dev"]));
  });

  test("parseRealAgentRunArgs infers model family and applies identity defaults", () => {
    const parsed = parseRealAgentRunArgs(["--corpus=calibration", "--model=xty/gemini-2.5-flash"]);

    expect(parsed).toMatchObject({
      modelFamily: "gemini",
      adapterVersion: "workspace",
      panelConfigId: "single-run",
      repetitions: 1,
    });
  });

  test("parseRealAgentRunArgs rejects invalid repetition counts", () => {
    for (const repetitions of ["0", "-1", "1.5", "abc"]) {
      expect(() => parseRealAgentRunArgs(["--corpus=calibration", `--repetitions=${repetitions}`])).toThrow(
        "--repetitions must be a positive integer",
      );
    }
  });

  for (const flag of ["--model", "--model-family", "--adapter", "--adapter-version", "--panel-config-id"]) {
    for (const [label, value] of [
      ["empty", ""],
      ["whitespace", "   "],
    ] as const) {
      test(`parseRealAgentRunArgs rejects ${label} ${flag} values`, () => {
        expect(() => parseRealAgentRunArgs(["--corpus=calibration", `${flag}=${value}`])).toThrow(
          `${flag} must be a non-empty value`,
        );
      });
    }
  }

  test("parseRealAgentRunArgs rejects an empty model in execute mode", () => {
    expect(() => parseRealAgentRunArgs(["--corpus=calibration", "--execute", "--model="])).toThrow(
      "--model must be a non-empty value",
    );
  });

  test("buildPlan materializes each skill with its own IR and task file", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 10,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original"]),
      contexts: new Set(["clean"]),
    };

    const plan = await buildPlan(args);

    expect(plan.map((entry) => entry.caseId)).toContain("skill-review:skvm:linux:clean:review-task");
    expect(plan.map((entry) => entry.caseId)).toContain("skill-diagnostic:skvm:linux:clean:diagnostic-task");
    expect(plan.every((entry) => !entry.caseId.includes("skill-review:skvm:linux:clean:diagnostic-task"))).toBe(true);
    expect(plan.every((entry) => !entry.caseId.includes("skill-diagnostic:skvm:linux:clean:review-task"))).toBe(true);
    expect(plan.find((entry) => entry.caseId.startsWith("skill-review:"))).toMatchObject({
      skillProvenance: "real-public",
      evidenceWeight: "main-real",
    });
    expect(plan.find((entry) => entry.caseId.startsWith("skill-diagnostic:"))).toMatchObject({
      skillProvenance: "adapted-public",
      evidenceWeight: "support-real",
    });

    const skillTexts = await Promise.all(plan.map((entry) => Bun.file(entry.skillPath!).text()));
    expect(skillTexts.some((text) => text.includes("Review source text."))).toBe(true);
    expect(skillTexts.some((text) => text.includes("Diagnostic source text."))).toBe(true);
  });

  test("buildPlan materializes a paired development calibration from a runtime source envelope", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-dev-1", "env-dev-2"]),
    };

    const plan = await buildPlan(args);

    expect(plan).toHaveLength(4);
    expect(plan.map((entry) => entry.system)).toEqual(["no-skill", "original", "no-skill", "original"]);
    expect(plan.filter((entry) => entry.system === "no-skill").every((entry) => entry.skillPath === undefined)).toBe(true);
    const originalRows = plan.filter((entry) => entry.system === "original");
    expect(originalRows).toHaveLength(2);
    expect(await Bun.file(originalRows[0]!.skillPath!).text()).toBe(
      "# Environment Variable Manager\n\nAudit environment variables without leaking secrets.\n",
    );
  });

  test("buildPlan rejects every path that would turn pre-IR calibration into a general status bypass", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    const valid: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-dev-1", "env-dev-2"]),
    };
    const invalidCases: [string, RealAgentRunArgs][] = [
      ["--corpus=pilot", { ...valid, corpus: "calibration" }],
      ["exactly one explicit --skills", { ...valid, skills: undefined }],
      ["exactly one explicit --skills", { ...valid, skills: new Set(["env-manager", "other"]) }],
      ["exactly no-skill,original", { ...valid, systems: new Set(["original"]) }],
      ["exactly no-skill,original", { ...valid, systems: new Set(["no-skill", "original", "ir-static"]) }],
      ["--contexts=clean", { ...valid, contexts: new Set(["noisy"]) }],
      ["explicit development --tasks", { ...valid, tasks: undefined }],
      ["development tasks", { ...valid, tasks: new Set(["env-dev-1", "env-heldout-1"]) }],
      ["does not accept --ir-override-dir", { ...valid, irOverrideDir: "profiled" }],
      ["complete no-skill/original pairs", { ...valid, limit: 1 }],
    ];

    for (const [message, args] of invalidCases) {
      expect(buildPlan(args)).rejects.toThrow(message);
    }
  });

  test("buildPlan rejects tasks-authored source metadata that does not match the source file", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    await writeFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
      "# Tampered after intake\n",
      "utf8",
    );

    expect(buildPlan({
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["env-dev-1"]),
    })).rejects.toThrow("Skill source digest mismatch");
  });

  test("buildPlan repeats limited matrix rows with complete identity and distinct artifact paths", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      repetitions: 3,
      panelConfigId: "env-manager-calibration-v1",
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original"]),
      contexts: new Set(["clean"]),
    };

    const plan = await buildPlan(args);

    expect(plan).toHaveLength(3);
    expect(plan.map((entry) => entry.caseId)).toEqual([
      "skill-review:skvm:linux:clean:review-task",
      "skill-review:skvm:linux:clean:review-task",
      "skill-review:skvm:linux:clean:review-task",
    ]);
    expect(plan.map((entry) => entry.runIndex)).toEqual([1, 2, 3]);
    expect(
      plan.map(({ model, modelFamily, adapter, adapterVersion, panelConfigId }) => ({
        model,
        modelFamily,
        adapter,
        adapterVersion,
        panelConfigId,
      })),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-2026-07-15",
        panelConfigId: "env-manager-calibration-v1",
      })),
    );
    expect(new Set(plan.map((entry) => entry.taskPath)).size).toBe(3);
    expect(plan.map((entry) => entry.taskPath)).toEqual([
      expect.stringContaining(join("original", "run-1", "task", "task.json")),
      expect.stringContaining(join("original", "run-2", "task", "task.json")),
      expect.stringContaining(join("original", "run-3", "task", "task.json")),
    ]);
    expect(plan.every((entry) => entry.skillPath !== undefined)).toBe(true);
    expect(new Set(plan.map((entry) => entry.skillPath)).size).toBe(3);
    expect(plan.map((entry) => entry.skillPath)).toEqual([
      expect.stringContaining(join("original", "run-1", "skill", "SKILL.md")),
      expect.stringContaining(join("original", "run-2", "skill", "SKILL.md")),
      expect.stringContaining(join("original", "run-3", "skill", "SKILL.md")),
    ]);
    expect(new Set(plan.map((entry) => entry.workDir)).size).toBe(3);
    expect(plan.map((entry) => entry.workDir)).toEqual([
      expect.stringContaining(join("original", "run-1", "workdir")),
      expect.stringContaining(join("original", "run-2", "workdir")),
      expect.stringContaining(join("original", "run-3", "workdir")),
    ]);
    expect((await Promise.all(plan.map(async (entry) => (await stat(entry.workDir)).isDirectory()))).every(Boolean)).toBe(
      true,
    );
    expect(plan.every((entry) => entry.command.includes(`--workdir=${entry.workDir}`))).toBe(true);
  });

  test("buildPlan can narrow runs by agent, environment, and task id", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 10,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original", "ir-profile"]),
      contexts: new Set(["clean"]),
      agents: new Set(["codex"]),
      environments: new Set(["windows"]),
      tasks: new Set(["diagnostic-task"]),
    };

    const plan = await buildPlan(args);

    expect(plan.map((entry) => entry.caseId)).toEqual([
      "skill-diagnostic:codex:windows:clean:diagnostic-task",
      "skill-diagnostic:codex:windows:clean:diagnostic-task",
    ]);
    expect(plan.map((entry) => entry.system)).toEqual(["original", "ir-profile"]);
  });

  test("buildPlan rejects a final IR directory without provenance", async () => {
    const rootDir = await createMultiSkillRoot();
    await writeJson(join(rootDir, "benchmarks/skill-ir/tasks/review.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-review",
      tasks: [{ id: "review-task", split: "held-out", prompt: "Review task prompt.", successCriteria: [] }],
    });
    const overrideDir = join(rootDir, "profiled-ir");
    await writeJson(
      join(overrideDir, "skill-review.json"),
      irFixture("skill-review", "Profiled Review Skill", "Profiled review source text."),
    );
    await writeJson(
      join(overrideDir, "skill-diagnostic.json"),
      irFixture("skill-diagnostic", "Profiled Diagnostic Skill", "Profiled diagnostic source text."),
    );

    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      irOverrideDir: overrideDir,
      systems: new Set(["ir-pgo"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["review-task"]),
    };

    expect(buildPlan(args)).rejects.toThrow("provenance.json");
  });

  test("buildPlan accepts untampered development-derived Final IR only on held-out tasks", async () => {
    const rootDir = await createMultiSkillRoot();
    await writeJson(join(rootDir, "benchmarks/skill-ir/tasks/review.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-review",
      tasks: [{ id: "review-task", split: "held-out", prompt: "Review task prompt.", successCriteria: [] }],
    });

    const artifactRoot = join(rootDir, "profiled-ir");
    const finalIRDir = join(artifactRoot, "final-ir");
    const finalReview = irFixture("skill-review", "Profiled Review Skill", "Profiled review source text.");
    await writeJson(join(artifactRoot, "overlay/skill-review.json"), { annotations: [] });
    await writeJson(join(finalIRDir, "skill-review.json"), finalReview);
    await writeJson(
      join(finalIRDir, "skill-diagnostic.json"),
      irFixture("skill-diagnostic", "Profiled Diagnostic Skill", "Profiled diagnostic source text."),
    );
    const resultsPath = join(rootDir, "results/development.jsonl");
    await mkdir(dirname(resultsPath), { recursive: true });
    await writeFile(
      resultsPath,
      `${JSON.stringify({ taskSplit: "development", system: "original" })}\n`,
      "utf8",
    );
    const baseIRPath = join(rootDir, "benchmarks/skill-ir/ir/review.json");
    const manifestPath = join(rootDir, "benchmarks/skill-ir/corpus/corpora/calibration.json");
    const provenance = await buildFinalIRProvenance({
      rootDir,
      artifactRoot,
      corpus: "calibration",
      manifestPath,
      resultsPath,
      skills: [
        {
          skillId: "skill-review",
          sourceSha256: sha256Bytes(Buffer.from("Review source text.", "utf8")),
          baseIRPath,
          annotationCount: 1,
        },
      ],
    });
    await writeJson(join(artifactRoot, "provenance.json"), provenance);

    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 3,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      irOverrideDir: finalIRDir,
      systems: new Set(["original", "ir-static", "ir-pgo"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["review-task"]),
    };

    const plan = await buildPlan(args);
    expect(plan).toHaveLength(3);
    const textBySystem = new Map(
      await Promise.all(plan.map(async (entry) => [entry.system, await Bun.file(entry.skillPath!).text()] as const)),
    );
    expect(textBySystem.get("original")).toBe("Review source text.");
    expect(textBySystem.get("ir-static")).toContain("# Review Skill");
    expect(textBySystem.get("ir-static")).not.toContain("Profiled Review Skill");
    expect(textBySystem.get("ir-pgo")).toContain("Profiled Review Skill");

    await writeJson(join(finalIRDir, "skill-review.json"), {
      ...finalReview,
      intent: "Tampered after validation.",
    });
    expect(buildPlan(args)).rejects.toThrow("final IR digest mismatch");
  });

  test("buildPlan rejects ir-pgo when no development-derived IR override is provided", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["ir-pgo"]),
      contexts: new Set(["clean"]),
    };

    expect(buildPlan(args)).rejects.toThrow("ir-pgo requires --ir-override-dir");
  });

  test("assertRequiredEnv fails before execution when a required env var is blank", () => {
    expect(() =>
      assertRequiredEnv(
        {
          model: "test/model",
          adapter: "bare-agent",
          ...defaultRunIdentityArgs,
          outDir: "out",
          limit: 1,
          execute: true,
          retries: 0,
          retryDelayMs: 1000,
          rootDir: ".",
          corpus: "calibration",
          requireEnv: new Set(["SKVM_XTY_API_KEY", "SKVM_CACHE"]),
        },
        { SKVM_XTY_API_KEY: "", SKVM_CACHE: "cache" },
      ),
    ).toThrow("Missing required environment variable(s): SKVM_XTY_API_KEY");
  });
});
