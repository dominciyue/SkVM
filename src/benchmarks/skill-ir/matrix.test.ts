import { describe, expect, test } from "bun:test";
import {
  buildCorpusMatrixInput,
  buildExperimentMatrix,
  COLD_START_EXPERIMENT_SYSTEMS,
} from "./matrix";

describe("buildExperimentMatrix", () => {
  test("creates paired Cartesian product cases with stable case ids", () => {
    const matrix = buildExperimentMatrix({
      skills: [
        {
          id: "skill-review",
          packaging: "focused",
          provenance: "real-public",
          evidenceWeight: "main-real",
        },
      ],
      agents: ["skvm", "codex"],
      environments: ["linux"],
      contexts: ["clean", "noisy"],
      tasks: ["task-1", "task-2"],
      systems: ["no-skill", "original", "ir-static"],
    });

    expect(matrix).toHaveLength(24);
    expect(matrix[0]).toEqual({
      caseId: "skill-review:skvm:linux:clean:task-1",
      skill: "skill-review",
      skillPackaging: "focused",
      skillProvenance: "real-public",
      evidenceWeight: "main-real",
      agent: "skvm",
      environment: "linux",
      context: "clean",
      task: "task-1",
      system: "no-skill",
      baselineSystem: "original",
    });

    const pairedCases = matrix.filter((item) => item.caseId === "skill-review:skvm:linux:clean:task-1");
    expect(pairedCases.map((item) => item.system)).toEqual(["no-skill", "original", "ir-static"]);
  });

  test("uses cold-start systems by default and allows overriding the baseline", () => {
    expect(COLD_START_EXPERIMENT_SYSTEMS).toEqual(["no-skill", "original", "ir-static"]);

    const [firstCase] = buildExperimentMatrix({
      skills: ["skill-review"],
      agents: ["skvm"],
      environments: ["linux"],
      contexts: ["clean"],
      tasks: ["task-1"],
      systems: ["no-skill", "original"],
      baselineSystem: "no-skill",
    });

    expect(firstCase?.baselineSystem).toBe("no-skill");
    expect(firstCase?.skillPackaging).toBe("unknown");
    expect(firstCase?.skillProvenance).toBe("unknown");
    expect(firstCase?.evidenceWeight).toBe("unknown");
  });

  test("keeps non-default systems available for explicit ablation and compatibility runs", () => {
    const matrix = buildExperimentMatrix({
      skills: ["skill-review"],
      agents: ["skvm"],
      environments: ["windows"],
      contexts: ["clean"],
      tasks: ["task-1"],
      systems: ["skvm-aot", "ir-only", "ir-profile"],
    });

    expect(matrix.map((item) => item.system)).toEqual(["skvm-aot", "ir-only", "ir-profile"]);
  });

  test("keeps ir-pgo-dev available only as an explicit diagnostic system", () => {
    const matrix = buildExperimentMatrix({
      skills: ["skill-review"],
      agents: ["skvm"],
      environments: ["windows"],
      contexts: ["clean"],
      tasks: ["task-1"],
      systems: ["ir-pgo-dev"],
    });

    expect(matrix.every((item) => item.system === "ir-pgo-dev")).toBe(true);
    expect(COLD_START_EXPERIMENT_SYSTEMS).not.toContain("ir-pgo-dev");
  });

  test("keeps ir-artifact-dev available only as an explicit package diagnostic system", () => {
    const matrix = buildExperimentMatrix({
      skills: ["env-manager"],
      agents: ["skvm"],
      environments: ["windows"],
      contexts: ["clean"],
      tasks: ["env-dev-1"],
      systems: ["ir-artifact-dev"],
    });

    expect(matrix.map((item) => item.system)).toEqual(["ir-artifact-dev"]);
    expect(COLD_START_EXPERIMENT_SYSTEMS).not.toContain("ir-artifact-dev");
  });

  test("keeps the V4 contract-repair system out of default matrices", () => {
    const matrix = buildExperimentMatrix({
      skills: ["env-manager"],
      agents: ["skvm"],
      environments: ["windows"],
      contexts: ["clean"],
      tasks: ["env-dev-1"],
      systems: ["ir-contract-artifact-dev"],
    });

    expect(matrix.map((item) => item.system)).toEqual(["ir-contract-artifact-dev"]);
    expect(COLD_START_EXPERIMENT_SYSTEMS).not.toContain("ir-contract-artifact-dev");
  });

  test("keeps benchmark tasks bound to their owning skill", () => {
    const matrix = buildExperimentMatrix({
      skills: ["skill-review", "skill-diagnostic"],
      agents: ["skvm"],
      environments: ["linux"],
      contexts: ["clean"],
      tasks: ["review-task", "diagnostic-task"],
      tasksBySkill: {
        "skill-review": ["review-task"],
        "skill-diagnostic": ["diagnostic-task"],
      },
      systems: ["original"],
    });

    expect(matrix.map((item) => `${item.skill}/${item.task}`)).toEqual([
      "skill-review/review-task",
      "skill-diagnostic/diagnostic-task",
    ]);
  });
});

describe("buildCorpusMatrixInput", () => {
  test("loads the explicit calibration corpus with cold-start systems", () => {
    const input = buildCorpusMatrixInput("calibration");

    expect(input.skills).toContainEqual({
      id: "skill-review",
      packaging: "focused",
      provenance: "synthetic-seed",
      evidenceWeight: "calibration-low",
    });
    expect(input.skills).toHaveLength(6);
    expect(input.contexts).toEqual(["clean", "noisy", "long", "compressed"]);
    expect(input.tasks).toHaveLength(24);
    expect(input.tasks).toContain("review-finding-order-001");
    expect(input.tasks).toContain("review-security-hard-001");
    expect(input.tasks).toContain("review-data-loss-hard-002");
    expect(input.tasks).toContain("ci-node-version-001");
    expect(input.tasks).toContain("ci-cache-warning-hard-001");
    expect(input.tasks).toContain("ci-engine-warning-hard-002");
    expect(input.tasks).toContain("report-lab-update-001");
    expect(input.tasks).toContain("report-overclaim-hard-001");
    expect(input.tasks).toContain("report-conflicting-notes-hard-002");
    expect(input.tasksBySkill?.["skill-review"]).toEqual([
      "review-finding-order-001",
      "review-missing-test-001",
      "review-security-hard-001",
      "review-data-loss-hard-002",
    ]);
    expect(input.tasksBySkill?.["skill-ci-diagnostic"]).toEqual([
      "ci-node-version-001",
      "ci-missing-env-001",
      "ci-cache-warning-hard-001",
      "ci-engine-warning-hard-002",
    ]);
    expect(Object.values(input.tasksBySkill ?? {}).every((tasks) => tasks.length === 4)).toBe(true);
    expect(input.systems).toEqual(COLD_START_EXPERIMENT_SYSTEMS);
    expect(input.skills.every((skill) => typeof skill !== "string" && skill.packaging === "focused")).toBe(true);
  });

  test("schedules every runnable real pilot with cold-start systems", () => {
    const input = buildCorpusMatrixInput("pilot");

    expect(input.skills).toEqual([
      {
        id: "law-to-markdown",
        packaging: "focused",
        provenance: "real-public",
        evidenceWeight: "support-real",
      },
      {
        id: "env-manager",
        packaging: "focused",
        provenance: "real-public",
        evidenceWeight: "support-real",
      },
      {
        id: "experimental-design",
        packaging: "focused",
        provenance: "real-public",
        evidenceWeight: "support-real",
      },
    ]);
    expect(input.tasksBySkill).toEqual({
      "law-to-markdown": [
        "law-to-markdown-statute-dev-001",
        "law-to-markdown-standard-dev-002",
        "law-to-markdown-regulation-heldout-001",
        "law-to-markdown-manual-heldout-002",
      ],
      "env-manager": [
        "env-manager-node-audit-dev-001",
        "env-manager-vite-audit-dev-002",
        "env-manager-python-audit-heldout-001",
        "env-manager-nextjs-audit-heldout-002",
      ],
      "experimental-design": [
        "experimental-design-stratified-dev-001",
        "experimental-design-cluster-dev-002",
        "experimental-design-sequential-heldout-001",
        "experimental-design-simple-heldout-002",
      ],
    });
    expect(input.systems).toEqual(COLD_START_EXPERIMENT_SYSTEMS);
  });

  test("pre-IR mode exposes only the active experimental-design v2 calibration entry", () => {
    const input = buildCorpusMatrixInput("pilot", process.cwd(), {
      mode: "tasks-authored-calibration",
    });

    expect(input.skills).toEqual([{
      id: "experimental-design-v2",
      packaging: "focused",
      provenance: "real-public",
      evidenceWeight: "support-real",
    }]);
    expect(input.tasksBySkill).toEqual({
      "experimental-design-v2": [
        "experimental-design-v2-stratified-dev-001",
        "experimental-design-v2-cluster-sequential-dev-002",
      ],
    });
    expect(input.systems).toEqual(["no-skill", "original"]);
  });
});
