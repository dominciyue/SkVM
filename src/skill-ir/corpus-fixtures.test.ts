import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import { EnvManagerGradePayloadSchema } from "../bench/evaluators/env-manager-grade";
import { SkillIRSchema } from "./schema";
import { validateSkillIR } from "./validate";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isSafeFixturePath(path: string): boolean {
  if (path.length === 0 || path.includes("\0") || posix.isAbsolute(path) || win32.isAbsolute(path)) {
    return false;
  }
  return path.split(/[\\/]/).every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
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

  test("pilot corpus records method-development and untouched-replication scope", () => {
    const pilot = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      corpusId: string;
      scopeCounts: Record<string, number>;
      skills: { id: string; wave?: string; portfolioRole?: string; status: string; benchmarkVersionOf?: string }[];
    };
    expect(pilot.corpusId).toBe("pilot");
    expect(pilot.scopeCounts).toEqual({
      methodDevelopmentStartMinimum: 6,
      untouchedReplicationMinimum: 1,
      untouchedReplicationTarget: 2,
    });
    expect(pilot.skills.filter(
      (skill) => skill.wave === "A" && skill.benchmarkVersionOf === undefined,
    )).toHaveLength(3);
    expect(pilot.skills.find((skill) => skill.id === "zh-readme")?.portfolioRole).toBe("method-development");
    expect(pilot.skills.filter((skill) => skill.portfolioRole === "untouched-replication")).toHaveLength(0);
    expect(pilot.skills.find((skill) => skill.id === "env-manager")?.status).toBe("runnable");
    expect(pilot.skills.find((skill) => skill.id === "law-to-markdown")?.status).toBe("runnable");
    expect(pilot.skills.find((skill) => skill.id === "experimental-design")?.status).toBe("runnable");
    expect(pilot.skills.find((skill) => skill.id === "api-tester")?.status).toBe("runnable");
    expect(pilot.skills.find((skill) => skill.id === "zh-readme")?.status).toBe("tasks-authored");
  });

  test("env-manager pilot has four deterministic fixtures and a source-audited runnable base IR", () => {
    type CustomCriterion = {
      method: string;
      id: string;
      weight: number;
      evaluatorId?: string;
      payload?: unknown;
    };
    type PilotTask = {
      id: string;
      split: string;
      prompt: string;
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
      status: "runnable",
      tasksPath: "benchmarks/skill-ir/pilots/env-manager/tasks.json",
      irPath: "benchmarks/skill-ir/pilots/env-manager/base-ir.json",
    });
    expect(pilot.skills.filter((skill) => skill.status === "runnable").length).toBeGreaterThanOrEqual(3);

    const irText = readFileSync(join(process.cwd(), envManager!.irPath!), "utf8");
    const ir = SkillIRSchema.parse(JSON.parse(irText));
    const sourceText = readFileSync(join(process.cwd(), ir.source.kind === "file" ? ir.source.path : ""));
    expect(ir.id).toBe("env-manager");
    expect(ir.source).toEqual({
      kind: "file",
      path: "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md",
      sha256: createHash("sha256").update(sourceText).digest("hex"),
    });
    expect(ir.profile).toEqual([]);
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] });
    expect(ir.outputs.filter((output) => output.required).map((output) => output.id)).toEqual([
      "env-example",
      "env-schema",
      "audit-report",
    ]);
    expect(irText).not.toContain("TEST_ONLY_");
    expect(irText).not.toMatch(/env-manager-(node|vite|python|nextjs)-audit-/);
    expect(irText).not.toMatch(/env-(protected-files|no-secret-leak|required-artifacts|classification|example-safety|schema-rules)/);

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
      const fixtures = task.fixtures ?? {};
      const fixturePaths = Object.keys(fixtures);
      expect(fixturePaths.length).toBeGreaterThanOrEqual(4);
      expect(fixturePaths.every(isSafeFixturePath)).toBe(true);
      expect(task.successCriteria).toEqual([]);
      expect(task.passThreshold).toBe(0.85);
      expect(task.hardGateIds).toEqual(hardGateIds);
      const parsedPayloads = (task.eval ?? []).map((criterion) => EnvManagerGradePayloadSchema.parse(criterion.payload));
      expect(task.eval?.map((criterion, index) => [criterion.id, criterion.weight, parsedPayloads[index]?.check])).toEqual(
        expectedCriteria,
      );
      expect(task.eval?.every((criterion) => criterion.method === "custom")).toBe(true);
      expect(task.eval?.every((criterion) => criterion.evaluatorId === "skill-ir-env-manager")).toBe(true);
      expect(task.eval?.some((criterion) => criterion.method === "llm-judge")).toBe(false);

      const protectedPayload = parsedPayloads.find((payload) => payload.check === "protected-files");
      expect(protectedPayload?.files).toEqual(fixtures);

      const noSecretPayload = parsedPayloads.find((payload) => payload.check === "no-secret-leak");
      expect(noSecretPayload).toBeDefined();
      if (!noSecretPayload || noSecretPayload.check !== "no-secret-leak") throw new Error("missing no-secret payload");
      const fixtureSecretValues = [...new Set(Object.values(fixtures).flatMap((content) => content.match(/TEST_ONLY_[A-Z0-9_]+/g) ?? []))].sort();
      expect(fixtureSecretValues.length).toBeGreaterThanOrEqual(2);
      expect([...noSecretPayload.values].sort()).toEqual(fixtureSecretValues);
      expect(noSecretPayload.allowedPaths.every((path) => Object.hasOwn(fixtures, path))).toBe(true);
      for (const [path, content] of Object.entries(fixtures)) {
        if (fixtureSecretValues.some((value) => content.includes(value))) {
          expect(noSecretPayload.allowedPaths).toContain(path);
        }
      }

      const reportPayload = parsedPayloads.find((payload) => payload.check === "report-classification");
      const schemaPayload = parsedPayloads.find((payload) => payload.check === "schema-rules");
      if (!reportPayload || reportPayload.check !== "report-classification") throw new Error("missing report payload");
      if (!schemaPayload || schemaPayload.check !== "schema-rules") throw new Error("missing schema payload");
      const hiddenExpectedIdentifiers = [
        ...Object.values(reportPayload.expected).flat(),
        ...Object.keys(schemaPayload.expected),
        ...noSecretPayload.values,
      ];
      for (const identifier of new Set(hiddenExpectedIdentifiers)) {
        expect(task.prompt).not.toContain(identifier);
      }
    }

    const viteTask = taskSet.tasks.find((task) => task.id === "env-manager-vite-audit-dev-002")!;
    const nextTask = taskSet.tasks.find((task) => task.id === "env-manager-nextjs-audit-heldout-002")!;
    expect(viteTask.prompt).not.toContain("VITE_");
    expect(nextTask.prompt).not.toContain("NEXT_PUBLIC_");

    const pythonTask = taskSet.tasks.find((task) => task.id === "env-manager-python-audit-heldout-001")!;
    const pythonReport = EnvManagerGradePayloadSchema.parse(
      pythonTask.eval!.find((criterion) => criterion.id === "env-classification")!.payload,
    );
    if (pythonReport.check !== "report-classification") throw new Error("invalid Python report payload");
    expect(pythonReport.expected.definedUnconfirmedUnused.length).toBeGreaterThanOrEqual(2);
    expect(pythonReport.expected.usedUndefined.length).toBeGreaterThanOrEqual(2);
    expect(pythonReport.expected.hardcodedSecrets).toEqual([]);

    const nextReport = EnvManagerGradePayloadSchema.parse(
      nextTask.eval!.find((criterion) => criterion.id === "env-classification")!.payload,
    );
    if (nextReport.check !== "report-classification") throw new Error("invalid Next.js report payload");
    expect(nextReport.expected.exposureRisks.length).toBeGreaterThanOrEqual(1);
    expect(nextReport.expected.hardcodedSecrets.length).toBeGreaterThanOrEqual(1);
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

  test("zh-code-reviewer is runnable with a profile-empty source-audited base IR", async () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      skills: Array<{
        id: string;
        status: string;
        sourcePath?: string;
        tasksPath?: string;
        irPath?: string;
        sourceAuditPath?: string;
        resourceContractPath?: string;
      }>;
    };
    const reviewer = manifest.skills.find((candidate) => candidate.id === "zh-code-reviewer");
    expect(reviewer).toMatchObject({
      status: "runnable",
      sourcePath: "benchmarks/skill-ir/pilots/zh-code-reviewer/source/SKILL.md",
      tasksPath: "benchmarks/skill-ir/pilots/zh-code-reviewer/development/tasks.json",
      irPath: "benchmarks/skill-ir/pilots/zh-code-reviewer/base-ir.json",
      sourceAuditPath: "benchmarks/skill-ir/pilots/zh-code-reviewer/base-ir-source-audit.json",
      resourceContractPath: "benchmarks/skill-ir/pilots/zh-code-reviewer/resource-contract.json",
    });

    const { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } = await import("./source-audit");
    const ir = SkillIRSchema.parse(readJson(join(process.cwd(), reviewer!.irPath!)));
    const audit = SkillIRSourceAuditSchema.parse(readJson(join(process.cwd(), reviewer!.sourceAuditPath!)));
    expect(ir.id).toBe("zh-code-reviewer");
    expect(ir.profile).toEqual([]);
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] });
    expect(await verifySkillIRSourceAudit(ir, audit, process.cwd())).toEqual({ errors: [], warnings: [] });

    const staticInputs = JSON.stringify({ ir, audit });
    for (const forbidden of [
      "zh-code-reviewer-cache-heldout-001",
      "zh-code-reviewer-batch-heldout-002",
      "review-evidence-coverage",
      "evaluatorId",
      "oracle",
      '"NUL"',
    ]) {
      expect(staticInputs).not.toContain(forbidden);
    }
    expect(audit.excludedEvidenceClasses).toEqual([
      "evaluator-payload",
      "held-out",
      "runtime-output",
      "profile-feedback",
    ]);
  });

  test("zh-readme is a benchmark-audited tasks-authored method case without a base IR", () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      skills: Array<{
        id: string;
        portfolioRole?: string;
        status: string;
        sourcePath?: string;
        tasksPath?: string;
        irPath?: string;
        resourceContractPath?: string;
        benchmarkContractAuditPath?: string;
      }>;
    };
    const readme = manifest.skills.find((candidate) => candidate.id === "zh-readme");
    expect(readme).toMatchObject({
      portfolioRole: "method-development",
      status: "tasks-authored",
      sourcePath: "benchmarks/skill-ir/pilots/zh-readme/source/SKILL.md",
      tasksPath: "benchmarks/skill-ir/pilots/zh-readme/development/tasks.json",
      resourceContractPath: "benchmarks/skill-ir/pilots/zh-readme/resource-contract.json",
      benchmarkContractAuditPath: "results/skill-ir/benchmark-contract-audit/zh-readme-v2.json",
    });
    expect(readme?.irPath).toBeUndefined();

    const audit = readJson(join(process.cwd(), readme!.benchmarkContractAuditPath!)) as {
      status: string;
      counts: { tasks: number; cases: number; matched: number };
    };
    expect(audit).toMatchObject({ status: "passed", counts: { tasks: 2, cases: 24, matched: 24 } });
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
      "env-manager",
      "experimental-design",
      "law-to-markdown",
      "zh-code-reviewer",
    ]);
    expect(intake.candidates.find((candidate) => candidate.id === "api-tester")?.status)
      .toBe("prospective-method-development");
    expect(intake.candidates.find((candidate) => candidate.id === "zh-readme")?.status)
      .toBe("method-development-v2-calibration-invalid");
    expect(selected.every((candidate) => candidate.sourcePath.endsWith("SKILL.md"))).toBe(true);
    expect(selected.every((candidate) => candidate.licenseStatus === "verified")).toBe(true);

    const activeCandidates = intake.candidates.filter((candidate) =>
      candidate.status === "selected-pilot"
      || candidate.status === "prospective-method-development"
      || candidate.status === "method-development-benchmark-audited");
    const selectedCategories = new Set(activeCandidates.flatMap((candidate) => candidate.categories));
    for (const category of ["document-processing", "chinese-developer", "testing", "environment", "scientific-workflow"]) {
      expect(selectedCategories.has(category)).toBe(true);
    }
  });

  test("law-to-markdown is runnable with a source-audited base IR and frozen 2+2 contract", async () => {
    const manifest = readJson(join(process.cwd(), "benchmarks/skill-ir/corpus/corpora/pilot.json")) as {
      skills: {
        id: string;
        status: string;
        tasksPath?: string;
        irPath?: string;
        sourceAuditPath?: string;
        resourceContractPath?: string;
      }[];
    };
    const skill = manifest.skills.find((candidate) => candidate.id === "law-to-markdown");

    expect(skill).toMatchObject({
      status: "runnable",
      tasksPath: "benchmarks/skill-ir/pilots/law-to-markdown/tasks.json",
      irPath: "benchmarks/skill-ir/pilots/law-to-markdown/base-ir.json",
      sourceAuditPath: "benchmarks/skill-ir/pilots/law-to-markdown/base-ir-source-audit.json",
      resourceContractPath: "benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json",
    });

    const { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } = await import("./source-audit");
    const ir = SkillIRSchema.parse(readJson(join(process.cwd(), skill!.irPath!)));
    const audit = SkillIRSourceAuditSchema.parse(readJson(join(process.cwd(), skill!.sourceAuditPath!)));
    expect(ir.id).toBe("law-to-markdown");
    expect(ir.profile).toEqual([]);
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] });
    expect(await verifySkillIRSourceAudit(ir, audit, process.cwd())).toEqual({ errors: [], warnings: [] });

    const serializedStaticInputs = JSON.stringify({ ir, audit });
    expect(serializedStaticInputs).not.toContain("law-to-markdown-regulation-heldout-001");
    expect(serializedStaticInputs).not.toContain("law-to-markdown-manual-heldout-002");
    expect(serializedStaticInputs).not.toContain("law-document-policy");
    expect(serializedStaticInputs).not.toContain("law-review-outcome");
    expect(serializedStaticInputs).not.toContain("passThreshold");
    expect(serializedStaticInputs).not.toContain("expectedHeadings");

    const taskSet = readJson(join(process.cwd(), skill!.tasksPath!)) as {
      schemaVersion: string;
      skillId: string;
      tasks: {
        id: string;
        split: string;
        prompt: string;
        fixtures?: Record<string, string>;
        eval?: { method: string; evaluatorId?: string }[];
        hardGateIds?: string[];
        passThreshold?: number;
      }[];
    };
    expect(taskSet.schemaVersion).toBe("skill-ir-tasks/v1");
    expect(taskSet.skillId).toBe("law-to-markdown");
    expect(taskSet.tasks).toHaveLength(4);
    expect(taskSet.tasks.filter((task) => task.split === "development")).toHaveLength(2);
    expect(taskSet.tasks.filter((task) => task.split === "held-out")).toHaveLength(2);
    expect(taskSet.tasks.every((task) => Object.keys(task.fixtures ?? {}).every((path) => path.endsWith(".txt")))).toBe(true);
    expect(taskSet.tasks.every((task) => task.eval?.every((criterion) =>
      criterion.method === "custom" && criterion.evaluatorId === "skill-ir-law-to-markdown"
    ))).toBe(true);
    expect(taskSet.tasks.every((task) => (task.hardGateIds?.length ?? 0) >= 2)).toBe(true);
    expect(taskSet.tasks.every((task) => task.passThreshold === 0.85)).toBe(true);

    const serializedPrompts = taskSet.tasks.map((task) => task.prompt).join("\n");
    expect(serializedPrompts).not.toContain("evaluator");
    expect(serializedPrompts).not.toContain("expectedHeadings");

    const resource = readJson(join(process.cwd(), skill!.resourceContractPath!)) as {
      schemaVersion: string;
      inputFormats: string[];
      network: string;
      packageInstall: string;
      interpreter: { env: string; fallbackCommand: string; minimumVersion: string };
      probe: { args: string[]; requiredModules: string[]; successMarker: string };
      missingDependencyDisposition: string;
    };
    expect(resource).toEqual({
      schemaVersion: "skill-ir-resource-contract/v1",
      inputFormats: ["txt"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: {
        env: "SKVM_PYTHON",
        fallbackCommand: "python",
        minimumVersion: "3.10",
      },
      probe: {
        args: ["-c", "import docx, pdfplumber; print('law-to-markdown-resource-ok')"],
        requiredModules: ["docx", "pdfplumber"],
        successMarker: "law-to-markdown-resource-ok",
      },
      missingDependencyDisposition: "preflight-infrastructure",
    });
  });
});
