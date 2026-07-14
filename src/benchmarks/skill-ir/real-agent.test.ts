import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SkillIR } from "../../skill-ir/schema";
import {
  buildSkvmRunCommand,
  buildRunPlanEntry,
  buildSkvmTaskJson,
  materializeCaseArtifacts,
  renderSkillMarkdown,
  type SkillIRBenchmarkTask,
} from "./real-agent";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function baseIr(): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-review",
    name: "Code Review",
    category: ["workflow", "constraint-heavy"],
    intent: "Review code changes and report actionable findings before summaries.",
    source: {
      kind: "inline",
      text: "Review code changes. Findings should lead the response.",
    },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [
      {
        id: "step-read-diff",
        title: "Read diff",
        description: "Inspect changed files before making claims.",
        kind: "read",
        required: true,
        dependsOn: [],
        toolRefs: [],
        produces: ["diff-understanding"],
        successCheckRefs: ["check-diff-read"],
        failureModes: ["missing-diff"],
      },
    ],
    rules: [
      {
        id: "rule-findings-first",
        sourceText: "Findings should lead the response.",
        level: "must",
        scope: "output",
        checkability: "runtime",
        severity: "high",
        normalizedForm: "The review response begins with findings before summary.",
      },
    ],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

const task: SkillIRBenchmarkTask = {
  id: "review-finding-order-001",
  split: "development",
  prompt: "Review a small change with one behavioral bug.",
  successCriteria: ["Findings appear before summary.", "Behavioral bug is mentioned."],
};

describe("real-agent Task 11A helpers", () => {
  test("buildSkvmTaskJson converts a Skill IR task into a SkVM run task", () => {
    const taskJson = buildSkvmTaskJson(task, {
      context: "noisy",
      skillId: "skill-review",
    });

    expect(taskJson.id).toBe("review-finding-order-001-noisy");
    expect(taskJson.category).toBe("skill-ir");
    expect(taskJson.gradingType).toBe("llm_judge");
    expect(taskJson.prompt).toContain("Context condition: noisy");
    expect(taskJson.prompt).toContain("Review a small change with one behavioral bug.");
    expect(taskJson.prompt).not.toContain("Findings appear before summary.");
    expect(taskJson.eval).toEqual([
      {
        method: "llm-judge",
        id: "success-criteria",
        name: "Success Criteria",
        rubric: [
          "Score whether the final answer satisfies all success criteria for skill-review / review-finding-order-001.",
          "Success criteria:",
          "- Findings appear before summary.",
          "- Behavioral bug is mentioned.",
        ].join("\n"),
        maxScore: 1,
      },
    ]);
  });

  test("buildSkvmTaskJson injects noisy context perturbations into the prompt", () => {
    const noisyTask = buildSkvmTaskJson(task, {
      context: "noisy",
      skillId: "skill-review",
    });
    const cleanTask = buildSkvmTaskJson(task, {
      context: "clean",
      skillId: "skill-review",
    });

    expect(noisyTask.prompt).toContain("Context perturbation: noisy");
    expect(noisyTask.prompt).toContain("Distracting prior note");
    expect(noisyTask.prompt).toContain("The current task below is authoritative");
    expect(cleanTask.prompt).not.toContain("Distracting prior note");
  });

  test("buildSkvmTaskJson preserves fixtures without exposing fixtures or evaluator expectations in the prompt", () => {
    const fixtureTask: SkillIRBenchmarkTask = {
      ...task,
      fixtures: {
        "input.txt": "fixture-only-sentinel\n",
      },
      successCriteria: ["evaluator-only-sentinel"],
    };

    const taskJson = buildSkvmTaskJson(fixtureTask, {
      context: "clean",
      skillId: "skill-review",
    });

    expect(taskJson.fixtures).toEqual({ "input.txt": "fixture-only-sentinel\n" });
    expect(taskJson.prompt).not.toContain("fixture-only-sentinel");
    expect(taskJson.prompt).not.toContain("evaluator-only-sentinel");
  });

  test("buildSkvmTaskJson rejects fixture paths that can escape the workdir", () => {
    for (const fixturePath of ["", "../task/task.json", "/tmp/fixture.txt", "C:\\temp\\fixture.txt"]) {
      expect(() =>
        buildSkvmTaskJson(
          {
            ...task,
            fixtures: { [fixturePath]: "unsafe\n" },
          },
          {
            context: "clean",
            skillId: "skill-review",
          },
        ),
      ).toThrow(`Unsafe fixture path: ${fixturePath}`);
    }
  });

  test("buildSkvmTaskJson allows safe nested fixture paths", () => {
    const taskJson = buildSkvmTaskJson(
      {
        ...task,
        fixtures: { "fixtures/nested/input.txt": "safe\n" },
      },
      {
        context: "clean",
        skillId: "skill-review",
      },
    );

    expect(taskJson.fixtures).toEqual({ "fixtures/nested/input.txt": "safe\n" });
  });

  test("buildSkvmTaskJson injects long and compressed context perturbations", () => {
    const longTask = buildSkvmTaskJson(task, {
      context: "long",
      skillId: "skill-review",
    });
    const compressedTask = buildSkvmTaskJson(task, {
      context: "compressed",
      skillId: "skill-review",
    });
    const cleanTask = buildSkvmTaskJson(task, {
      context: "clean",
      skillId: "skill-review",
    });

    expect(longTask.prompt).toContain("Context perturbation: long");
    expect(longTask.prompt).toContain("Long surrounding context");
    expect(longTask.prompt.length).toBeGreaterThan(cleanTask.prompt.length + 400);
    expect(longTask.prompt.toLowerCase()).not.toContain("success criteria");
    expect(compressedTask.prompt).toContain("Context perturbation: compressed");
    expect(compressedTask.prompt).toContain("lossy summary");
    expect(compressedTask.prompt.toLowerCase()).not.toContain("success criteria");
  });

  test("renderSkillMarkdown renders no-skill as null and static IR as checkable skill text", () => {
    expect(renderSkillMarkdown(baseIr(), "no-skill")).toBeNull();

    const rendered = renderSkillMarkdown(baseIr(), "ir-static");

    expect(rendered).toContain("# Code Review");
    expect(rendered).toContain("## Runtime Checks");
    expect(rendered).toContain("check-rule-findings-first");
    expect(rendered).toContain("The review response begins with findings before summary.");
  });

  test("renderSkillMarkdown preserves inline original text without generated wrappers", () => {
    const ir = baseIr();

    expect(renderSkillMarkdown(ir, "original")).toBe(ir.source.kind === "inline" ? ir.source.text : "");
  });

  test("renderSkillMarkdown renders ir-pgo as profile-guided materialization", () => {
    const ir = baseIr();
    ir.profile = [
      {
        id: "profile-rule-findings-first",
        sourceTrace: "trace-1",
        targetRef: "rule-findings-first",
        observation: "frequent-failure",
        evidenceCount: 1,
        suggestedPass: "profile-guided-repair",
      },
    ];

    const rendered = renderSkillMarkdown(ir, "ir-pgo");

    expect(rendered).toContain("Materialized system: ir-pgo.");
    expect(rendered).toContain("check-rule-findings-first-profile");
    expect(rendered).toContain("Profile feedback observed repeated failures.");
  });

  test("buildSkvmRunCommand includes skill flags only when a skill path exists", () => {
    expect(
      buildSkvmRunCommand({
        taskPath: "tmp/task.json",
        model: "openrouter/test/model",
        adapter: "bare-agent",
      }),
    ).toEqual([
      "bun",
      "run",
      "skvm",
      "run",
      "--task=tmp/task.json",
      "--model=openrouter/test/model",
      "--adapter=bare-agent",
    ]);

    expect(
      buildSkvmRunCommand({
        taskPath: "tmp/task.json",
        skillPath: "tmp/skill/SKILL.md",
        model: "openrouter/test/model",
        adapter: "bare-agent",
      }),
    ).toContain("--skill=tmp/skill/SKILL.md");
  });

  test("materializeCaseArtifacts writes task and skill files for one case", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-"));
    tempDirs.push(tempDir);

    const materialized = await materializeCaseArtifacts({
      outDir: tempDir,
      ir: baseIr(),
      task,
      context: "clean",
      system: "ir-static",
      caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
      runIndex: 2,
    });

    expect(materialized.taskPath.endsWith("task.json")).toBe(true);
    expect(materialized.skillPath?.endsWith("SKILL.md")).toBe(true);
    expect(materialized.workDir).toContain(join("ir-static", "run-2", "workdir"));
    expect((await stat(materialized.workDir)).isDirectory()).toBe(true);

    const taskFile = await Bun.file(materialized.taskPath).json();
    const skillText = await Bun.file(materialized.skillPath!).text();

    expect(taskFile.id).toBe("review-finding-order-001-clean");
    expect(skillText).toContain("check-rule-findings-first");
  });

  test("materializeCaseArtifacts verifies and copies an exact file-backed original source closure", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    const sourceText = "# Exact upstream skill\n\nUse scripts/check.py.\n";
    await mkdir(join(sourceDir, "scripts"), { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(sourceDir, "scripts", "check.py"), "print('ok')\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: createHash("sha256").update(sourceText).digest("hex"),
    };

    const materialized = await materializeCaseArtifacts({
      outDir: join(tempDir, "out"),
      rootDir: tempDir,
      ir,
      task,
      context: "clean",
      system: "original",
      caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
      runIndex: 1,
    });

    expect(await Bun.file(materialized.skillPath!).text()).toBe(sourceText);
    expect(await Bun.file(join(materialized.skillPath!, "..", "scripts", "check.py")).text()).toBe("print('ok')\n");
  });

  test("materializeCaseArtifacts preserves file-backed resources while replacing generated SKILL.md", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    const sourceText = "# Exact upstream skill\n\nUse scripts/check.py.\n";
    await mkdir(join(sourceDir, "scripts"), { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(sourceDir, "scripts", "check.py"), "print('ok')\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: createHash("sha256").update(sourceText).digest("hex"),
    };

    const materialized = await materializeCaseArtifacts({
      outDir: join(tempDir, "out"),
      rootDir: tempDir,
      ir,
      task,
      context: "clean",
      system: "ir-static",
      caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
      runIndex: 1,
    });

    expect(await Bun.file(materialized.skillPath!).text()).toContain("Materialized system: ir-static.");
    expect(await Bun.file(materialized.skillPath!).text()).not.toBe(sourceText);
    expect(await Bun.file(join(materialized.skillPath!, "..", "scripts", "check.py")).text()).toBe("print('ok')\n");
  });

  test("materializeCaseArtifacts removes stale run artifacts before rematerializing the same row", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    const sourceText = "# Exact upstream skill\n\nUse scripts/check.py.\n";
    await mkdir(join(sourceDir, "scripts"), { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(sourceDir, "scripts", "check.py"), "print('current')\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: createHash("sha256").update(sourceText).digest("hex"),
    };
    const options = {
      outDir: join(tempDir, "out"),
      rootDir: tempDir,
      ir,
      task,
      context: "clean",
      system: "ir-static" as const,
      caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
      runIndex: 1,
    };

    const first = await materializeCaseArtifacts(options);
    const staleWorkOutput = join(first.workDir, "nested", "stale-output.txt");
    const staleSkillResource = join(first.skillPath!, "..", "obsolete-resource.txt");
    await mkdir(join(first.workDir, "nested"), { recursive: true });
    await writeFile(staleWorkOutput, "stale\n", "utf8");
    await writeFile(staleSkillResource, "stale\n", "utf8");

    const rematerialized = await materializeCaseArtifacts(options);

    expect(await Bun.file(staleWorkOutput).exists()).toBe(false);
    expect(await Bun.file(staleSkillResource).exists()).toBe(false);
    expect(await Bun.file(join(rematerialized.skillPath!, "..", "scripts", "check.py")).text()).toBe(
      "print('current')\n",
    );
    expect(await Bun.file(rematerialized.skillPath!).text()).toContain("Materialized system: ir-static.");
    expect((await stat(rematerialized.workDir)).isDirectory()).toBe(true);
  });

  test("materializeCaseArtifacts rejects generated IR when its file-backed source digest is stale", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), "changed\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: "0".repeat(64),
    };

    expect(
      materializeCaseArtifacts({
        outDir: join(tempDir, "out"),
        rootDir: tempDir,
        ir,
        task,
        context: "clean",
        system: "ir-static",
        caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
        runIndex: 1,
      }),
    ).rejects.toThrow("source digest mismatch");
  });

  test("materializeCaseArtifacts gives no-skill no skill path or source closure", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    const sourceText = "# Exact upstream skill\n";
    await mkdir(join(sourceDir, "scripts"), { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(sourceDir, "scripts", "check.py"), "print('ok')\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: createHash("sha256").update(sourceText).digest("hex"),
    };

    const materialized = await materializeCaseArtifacts({
      outDir: join(tempDir, "out"),
      rootDir: tempDir,
      ir,
      task,
      context: "clean",
      system: "no-skill",
      caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
      runIndex: 1,
    });

    expect(materialized.skillPath).toBeUndefined();
    expect(await Bun.file(join(materialized.workDir, "..", "skill", "SKILL.md")).exists()).toBe(false);
    expect(await Bun.file(join(materialized.workDir, "..", "skill", "scripts", "check.py")).exists()).toBe(false);
  });

  test("materializeCaseArtifacts rejects a file-backed source with a stale digest", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const sourceDir = join(tempDir, "corpus", "skill-a", "source");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "SKILL.md"), "changed\n", "utf8");
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "corpus/skill-a/source/SKILL.md",
      sha256: "0".repeat(64),
    };

    expect(
      materializeCaseArtifacts({
        outDir: join(tempDir, "out"),
        rootDir: tempDir,
        ir,
        task,
        context: "clean",
        system: "original",
        caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
        runIndex: 1,
      }),
    ).rejects.toThrow("source digest mismatch");
  });

  test("materializeCaseArtifacts rejects a file-backed source outside the repository root", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-source-"));
    tempDirs.push(tempDir);
    const ir = baseIr();
    ir.source = {
      kind: "file",
      path: "../outside/SKILL.md",
      sha256: "0".repeat(64),
    };

    expect(
      materializeCaseArtifacts({
        outDir: join(tempDir, "out"),
        rootDir: tempDir,
        ir,
        task,
        context: "clean",
        system: "original",
        caseId: "skill-review:skvm:windows:clean:review-finding-order-001",
        runIndex: 1,
      }),
    ).rejects.toThrow("escapes repository root");
  });

  test("buildRunPlanEntry attaches a runnable skvm command to materialized artifacts", () => {
    const commandOptions = {
      model: "openrouter/test/model",
      adapter: "bare-agent",
      workdir: "tmp/different-workdir",
    };
    const entry = buildRunPlanEntry(
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        taskPath: "tmp/task.json",
        skillPath: "tmp/skill/SKILL.md",
        workDir: "tmp/workdir",
      },
      commandOptions,
    );

    expect(entry.command).toEqual([
      "bun",
      "run",
      "skvm",
      "run",
      "--task=tmp/task.json",
      "--model=openrouter/test/model",
      "--adapter=bare-agent",
      "--skill=tmp/skill/SKILL.md",
      "--skill-mode=inject",
      "--workdir=tmp/workdir",
    ]);
    expect(entry.workDir).toBe("tmp/workdir");
  });
});
