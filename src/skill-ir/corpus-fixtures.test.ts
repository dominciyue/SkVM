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
    expect(taskSet.tasks).toHaveLength(4);
    expect(taskSet.tasks.map((task) => task.split)).toEqual(["development", "held-out", "held-out", "held-out"]);
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

  test("all manifest skills declare valid provenance and evidence metadata", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/manifest.json")) as {
      skills: {
        provenance?: string;
        source?: string;
        sourceUrl?: string | null;
        evidenceWeight?: string;
      }[];
    };
    const allowedProvenance = new Set([
      "synthetic-seed",
      "adapted-public",
      "real-public",
      "upstream-skvm",
      "user-provided",
    ]);
    const allowedEvidenceWeight = new Set(["calibration-low", "support-real", "main-real"]);

    for (const skill of manifest.skills) {
      expect(allowedProvenance.has(skill.provenance ?? "")).toBe(true);
      expect(allowedEvidenceWeight.has(skill.evidenceWeight ?? "")).toBe(true);
      expect(skill.source?.trim().length).toBeGreaterThan(0);
      expect(skill.sourceUrl === null || typeof skill.sourceUrl === "string").toBe(true);
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
      expect(taskSet.tasks.length).toBeGreaterThanOrEqual(4);
      expect(taskSet.tasks.filter((task) => task.split === "development")).toHaveLength(1);
      expect(taskSet.tasks.filter((task) => task.split === "held-out").length).toBeGreaterThanOrEqual(3);
      expect(taskSet.tasks.filter((task) => task.id.includes("hard")).length).toBeGreaterThanOrEqual(2);
      expect(taskSet.tasks.every((task) => task.prompt.length > 80)).toBe(true);
      expect(taskSet.tasks.every((task) => task.successCriteria.length >= 2)).toBe(true);
    }
  });

  test("real-skill intake snapshot records reproducible sources and licensed pilot artifacts", () => {
    const intake = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/real-skill-intake.json")) as {
      schemaVersion: string;
      fetchedAt: string;
      sources: {
        id: string;
        commit: string;
        artifactCount: number;
        licenseStatus: string;
      }[];
      candidates: {
        id: string;
        sourceId: string;
        sourcePath: string;
        status: string;
        licenseStatus: string;
        categories: string[];
      }[];
    };

    expect(intake.schemaVersion).toBe("skill-ir-intake/v1");
    expect(intake.fetchedAt).toBe("2026-07-15");
    expect(intake.sources).toHaveLength(4);
    expect(intake.sources.every((source) => /^[0-9a-f]{40}$/.test(source.commit))).toBe(true);
    expect(intake.sources.find((source) => source.id === "awesome-claude-skills")?.artifactCount).toBe(0);
    expect(intake.sources.find((source) => source.id === "claude-scientific-skills")?.artifactCount).toBe(149);

    const selected = intake.candidates.filter((candidate) => candidate.status === "selected-pilot");
    expect(selected.map((candidate) => candidate.id).sort()).toEqual([
      "api-tester",
      "env-manager",
      "experimental-design",
      "law-to-markdown",
      "zh-code-reviewer",
      "zh-readme",
    ]);
    expect(selected.every((candidate) => candidate.sourcePath.endsWith("SKILL.md"))).toBe(true);
    expect(selected.every((candidate) => candidate.licenseStatus === "verified")).toBe(true);

    const selectedCategories = new Set(selected.flatMap((candidate) => candidate.categories));
    for (const category of ["document-processing", "chinese-developer", "testing", "environment", "scientific-workflow"]) {
      expect(selectedCategories.has(category)).toBe(true);
    }
  });
});
