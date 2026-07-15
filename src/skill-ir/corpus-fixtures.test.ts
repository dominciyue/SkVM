import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillIRSchema } from "./schema";
import { validateSkillIR } from "./validate";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("skill-ir corpus fixtures", () => {
  test("registry separates calibration and real pilot corpora", () => {
    const registry = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/manifest.json")) as {
      schemaVersion: string;
      corpora: Record<string, { manifestPath: string }>;
    };

    expect(registry.schemaVersion).toBe("skill-ir-corpus-registry/v1");
    expect(Object.keys(registry.corpora).sort()).toEqual(["calibration", "pilot"]);

    const calibration = readJson(join(process.cwd(), registry.corpora.calibration!.manifestPath)) as {
      corpusId: string;
      historicalAspirations: Record<string, number>;
      skills: { depth: string; status: string }[];
    };
    expect(calibration.corpusId).toBe("calibration");
    expect(calibration.skills).toHaveLength(6);
    expect(calibration.skills.every((skill) => skill.depth === "calibration" && skill.status === "runnable")).toBe(
      true,
    );
    expect(calibration.historicalAspirations).toEqual({
      taxonomySkills: 60,
      fullIRSkills: 24,
      deepBenchmarkSkills: 16,
    });
  });

  test("pilot corpus records mandatory Wave A and Wave B scope", () => {
    const pilot = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      corpusId: string;
      scopeCounts: Record<string, number>;
      skills: { id: string; wave: string; status: string }[];
    };
    expect(pilot.corpusId).toBe("pilot");
    expect(pilot.scopeCounts).toEqual({ waveADeepPilots: 3, waveBReplicationPilots: 3 });
    expect(pilot.skills.filter((skill) => skill.wave === "A")).toHaveLength(3);
    expect(pilot.skills.filter((skill) => skill.wave === "B")).toHaveLength(3);
    expect(pilot.skills.find((skill) => skill.id === "env-manager")?.status).toBe("tasks-authored");
    expect(
      pilot.skills
        .filter((skill) => skill.wave === "A" && skill.id !== "env-manager")
        .every((skill) => skill.status === "source-imported"),
    ).toBe(true);
    expect(pilot.skills.filter((skill) => skill.wave === "B").every((skill) => skill.status === "selected")).toBe(true);
  });

  test("env-manager pilot has four deterministic task-authored fixtures but remains non-runnable", () => {
    type CustomCriterion = {
      method: string;
      id: string;
      weight: number;
      evaluatorId?: string;
      payload?: {
        schemaVersion?: string;
        check?: string;
        values?: string[];
      };
    };
    type PilotTask = {
      id: string;
      split: string;
      fixtures?: Record<string, string>;
      successCriteria: string[];
      eval?: CustomCriterion[];
      hardGateIds?: string[];
      passThreshold?: number;
    };

    const pilot = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      skills: { id: string; status: string; tasksPath?: string; irPath?: string }[];
    };
    const envManager = pilot.skills.find((skill) => skill.id === "env-manager");

    expect(envManager).toMatchObject({
      status: "tasks-authored",
      tasksPath: "benchmarks/skill-ir/pilots/env-manager/tasks.json",
    });
    expect(envManager?.irPath).toBeUndefined();
    expect(pilot.skills.filter((skill) => skill.status === "runnable")).toHaveLength(0);

    const taskSet = readJson(join(process.cwd(), envManager!.tasksPath!)) as {
      schemaVersion: string;
      skillId: string;
      tasks: PilotTask[];
    };
    expect(taskSet.schemaVersion).toBe("skill-ir-tasks/v1");
    expect(taskSet.skillId).toBe("env-manager");
    expect(taskSet.tasks.map((task) => task.id)).toEqual([
      "env-manager-node-audit-dev-001",
      "env-manager-vite-audit-dev-002",
      "env-manager-python-audit-heldout-001",
      "env-manager-nextjs-audit-heldout-002",
    ]);
    expect(taskSet.tasks.map((task) => task.split)).toEqual([
      "development",
      "development",
      "held-out",
      "held-out",
    ]);

    const expectedCriteria = [
      ["env-protected-files", 0.2, "protected-files"],
      ["env-no-secret-leak", 0.2, "no-secret-leak"],
      ["env-required-artifacts", 0.15, "required-artifacts"],
      ["env-classification", 0.2, "report-classification"],
      ["env-example-safety", 0.15, "env-example"],
      ["env-schema-rules", 0.1, "schema-rules"],
    ];
    const hardGateIds = ["env-protected-files", "env-no-secret-leak", "env-required-artifacts"];

    for (const task of taskSet.tasks) {
      expect(Object.keys(task.fixtures ?? {}).length).toBeGreaterThanOrEqual(4);
      expect(task.successCriteria).toEqual([]);
      expect(task.passThreshold).toBe(0.85);
      expect(task.hardGateIds).toEqual(hardGateIds);
      expect(task.eval?.map((criterion) => [criterion.id, criterion.weight, criterion.payload?.check])).toEqual(
        expectedCriteria,
      );
      expect(task.eval?.every((criterion) => criterion.method === "custom")).toBe(true);
      expect(task.eval?.every((criterion) => criterion.evaluatorId === "skill-ir-env-manager")).toBe(true);
      expect(task.eval?.every((criterion) => criterion.payload?.schemaVersion === "skill-ir-env-manager-eval/v1")).toBe(
        true,
      );
      expect(task.eval?.some((criterion) => criterion.method === "llm-judge")).toBe(false);

      const secretValues = task.eval?.find((criterion) => criterion.id === "env-no-secret-leak")?.payload?.values ?? [];
      expect(secretValues.length).toBeGreaterThanOrEqual(2);
      expect(secretValues.every((value) => value.startsWith("TEST_ONLY_"))).toBe(true);
    }
  });

  test("every imported Wave A source file is present and digest-pinned", () => {
    const pilot = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      skills: { id: string; wave: string; sourceFiles?: { path: string; sha256: string }[] }[];
    };
    for (const skill of pilot.skills.filter((candidate) => candidate.wave === "A")) {
      expect(skill.sourceFiles?.length ?? 0).toBeGreaterThan(0);
      for (const sourceFile of skill.sourceFiles ?? []) {
        const bytes = readFileSync(join(process.cwd(), sourceFile.path));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(sourceFile.sha256);
      }
    }
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

  test("calibration corpus covers all Skill IR categories", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/calibration.json")) as {
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
    expect(manifest.skills.every((skill) => skill.depth === "calibration")).toBe(true);

    const coveredCategories = new Set(manifest.skills.flatMap((skill) => skill.category));
    for (const category of ["workflow", "diagnostic", "generative", "tool-use", "constraint-heavy", "environment-sensitive"]) {
      expect(coveredCategories.has(category)).toBe(true);
    }
  });

  test("all manifest skills declare valid provenance and evidence metadata", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/calibration.json")) as {
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
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/calibration.json")) as {
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
