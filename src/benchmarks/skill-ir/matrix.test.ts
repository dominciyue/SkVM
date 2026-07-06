import { describe, expect, test } from "bun:test";
import { buildDefaultMatrixInput, buildExperimentMatrix, DEFAULT_EXPERIMENT_SYSTEMS } from "./matrix";

describe("buildExperimentMatrix", () => {
  test("creates paired Cartesian product cases with stable case ids", () => {
    const matrix = buildExperimentMatrix({
      skills: [{ id: "skill-review", packaging: "focused" }],
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

  test("uses the original system as baseline by default and allows overriding it", () => {
    expect(DEFAULT_EXPERIMENT_SYSTEMS).toContain("no-skill");
    expect(DEFAULT_EXPERIMENT_SYSTEMS).toContain("ir-profile");

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
  });
});

describe("buildDefaultMatrixInput", () => {
  test("loads skills, contexts, and tasks from benchmark fixtures", () => {
    const input = buildDefaultMatrixInput();

    expect(input.skills).toContainEqual({ id: "skill-review", packaging: "focused" });
    expect(input.contexts).toEqual(["clean", "noisy", "long", "compressed"]);
    expect(input.tasks).toEqual(["review-finding-order-001", "review-missing-test-001"]);
    expect(input.systems).toEqual(DEFAULT_EXPERIMENT_SYSTEMS);
  });
});
