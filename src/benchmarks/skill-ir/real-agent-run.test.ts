import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import {
  assertRequiredEnv,
  buildPlan,
  parseRealAgentRunArgs,
  type RealAgentRunArgs,
} from "./real-agent-run";
import { buildFinalIRProvenance } from "./final-ir-provenance";
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

describe("real-agent-run manifest loading", () => {
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
    await writeJson(resultsPath, { taskSplit: "development", system: "original" });
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
