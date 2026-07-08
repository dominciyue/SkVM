import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
    expect(taskJson.prompt).toContain("Findings appear before summary.");
    expect(taskJson.eval).toEqual([
      {
        method: "llm-judge",
        id: "success-criteria",
        name: "Success Criteria",
        rubric:
          "Score whether the final answer satisfies all success criteria for skill-review / review-finding-order-001.",
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
    expect(compressedTask.prompt).toContain("Context perturbation: compressed");
    expect(compressedTask.prompt).toContain("lossy summary");
  });

  test("renderSkillMarkdown renders no-skill as null and static IR as checkable skill text", () => {
    expect(renderSkillMarkdown(baseIr(), "no-skill")).toBeNull();

    const rendered = renderSkillMarkdown(baseIr(), "ir-static");

    expect(rendered).toContain("# Code Review");
    expect(rendered).toContain("## Runtime Checks");
    expect(rendered).toContain("check-rule-findings-first");
    expect(rendered).toContain("The review response begins with findings before summary.");
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
    });

    expect(materialized.taskPath.endsWith("task.json")).toBe(true);
    expect(materialized.skillPath?.endsWith("SKILL.md")).toBe(true);

    const taskFile = await Bun.file(materialized.taskPath).json();
    const skillText = await Bun.file(materialized.skillPath!).text();

    expect(taskFile.id).toBe("review-finding-order-001-clean");
    expect(skillText).toContain("check-rule-findings-first");
  });

  test("buildRunPlanEntry attaches a runnable skvm command to materialized artifacts", () => {
    const entry = buildRunPlanEntry(
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        taskPath: "tmp/task.json",
        skillPath: "tmp/skill/SKILL.md",
      },
      {
        model: "openrouter/test/model",
        adapter: "bare-agent",
      },
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
    ]);
  });
});
