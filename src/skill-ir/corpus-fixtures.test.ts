import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillIRSchema } from "./schema";
import { validateSkillIR } from "./validate";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("skill-ir corpus fixtures", () => {
  test("manifest declares the planned corpus scale and categories", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/manifest.json")) as {
      schemaVersion: string;
      categories: string[];
      targetCounts: Record<string, number>;
      skills: unknown[];
    };

    expect(manifest.schemaVersion).toBe("skill-ir-corpus/v1");
    expect(manifest.categories).toContain("workflow");
    expect(manifest.categories).toContain("environment-sensitive");
    expect(manifest.targetCounts).toEqual({
      taxonomySkills: 60,
      fullIRSkills: 24,
      deepBenchmarkSkills: 16,
    });
  });

  test("standard context perturbations cover clean, noisy, long, and compressed settings", () => {
    const contexts = readJson(join(process.cwd(), "benchmarks/skill-ir/contexts/standard-contexts.json")) as {
      schemaVersion: string;
      contexts: { id: string; description: string }[];
    };

    expect(contexts.schemaVersion).toBe("skill-ir-contexts/v1");
    expect(contexts.contexts.map((context) => context.id)).toEqual(["clean", "noisy", "long", "compressed"]);
    expect(contexts.contexts.every((context) => context.description.length > 0)).toBe(true);
  });

  test("review skill IR parses and validates cleanly", () => {
    const candidate = readJson(join(process.cwd(), "benchmarks/skill-ir/ir/review-skill.json"));
    const ir = SkillIRSchema.parse(candidate);
    const report = validateSkillIR(ir);

    expect(ir.id).toBe("skill-review");
    expect(report).toEqual({ errors: [], warnings: [] });
  });

  test("review skill tasks target the review skill and include success criteria", () => {
    const taskSet = readJson(join(process.cwd(), "benchmarks/skill-ir/tasks/review-skill-tasks.json")) as {
      schemaVersion: string;
      skillId: string;
      tasks: { id: string; split: string; prompt: string; successCriteria: string[] }[];
    };

    expect(taskSet.schemaVersion).toBe("skill-ir-tasks/v1");
    expect(taskSet.skillId).toBe("skill-review");
    expect(taskSet.tasks).toHaveLength(3);
    expect(taskSet.tasks.map((task) => task.split)).toEqual(["development", "held-out", "held-out"]);
    expect(taskSet.tasks.every((task) => task.successCriteria.length >= 3)).toBe(true);
  });

  test("review skill tasks are self-contained for real-agent execution", () => {
    const taskSet = readJson(join(process.cwd(), "benchmarks/skill-ir/tasks/review-skill-tasks.json")) as {
      tasks: { id: string; prompt: string }[];
    };

    for (const task of taskSet.tasks) {
      expect(task.prompt).toContain("```diff");
      expect(task.prompt).toContain("Review the following patch");
    }
  });

  test("expanded seed corpus covers all Skill IR categories with deep benchmark fixtures", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/manifest.json")) as {
      categories: string[];
      skills: {
        id: string;
        category: string[];
        depth: string;
        irPath: string;
        tasksPath: string;
      }[];
    };

    expect(manifest.skills).toHaveLength(6);
    expect(manifest.skills.every((skill) => skill.depth === "deep-benchmark")).toBe(true);

    const coveredCategories = new Set(manifest.skills.flatMap((skill) => skill.category));
    for (const category of manifest.categories) {
      expect(coveredCategories.has(category)).toBe(true);
    }
  });

  test("all manifest skill IR and task fixtures parse, validate, and stay skill-scoped", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/manifest.json")) as {
      skills: {
        id: string;
        irPath: string;
        tasksPath: string;
      }[];
    };

    for (const skill of manifest.skills) {
      const ir = SkillIRSchema.parse(readJson(join(process.cwd(), skill.irPath)));
      const report = validateSkillIR(ir);
      expect(ir.id).toBe(skill.id);
      expect(report.errors).toEqual([]);

      const taskSet = readJson(join(process.cwd(), skill.tasksPath)) as {
        schemaVersion: string;
        skillId: string;
        tasks: { id: string; split: string; prompt: string; successCriteria: string[] }[];
      };
      expect(taskSet.schemaVersion).toBe("skill-ir-tasks/v1");
      expect(taskSet.skillId).toBe(skill.id);
      expect(taskSet.tasks.length).toBeGreaterThanOrEqual(3);
      expect(taskSet.tasks.filter((task) => task.split === "development")).toHaveLength(1);
      expect(taskSet.tasks.filter((task) => task.split === "held-out").length).toBeGreaterThanOrEqual(2);
      expect(taskSet.tasks.some((task) => task.id.includes("hard"))).toBe(true);
      expect(taskSet.tasks.every((task) => task.prompt.length > 80)).toBe(true);
      expect(taskSet.tasks.every((task) => task.successCriteria.length >= 2)).toBe(true);
    }
  });
});
