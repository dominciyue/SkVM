import { describe, expect, test } from "bun:test";
import {
  API_TASK_CONTRACT_JSON_SCHEMA,
  adaptApiSkillMappingV1,
  parseApiTaskContract,
} from "./api-task-contract";

function task() {
  return {
    schemaVersion: "skvm-api-task/v1" as const,
    taskId: "request-smoke",
    profile: "oas30-offline-test/v1" as const,
    input: { path: "inputs/api.yaml", format: "yaml" as const, dialect: "oas3.0" as const },
    dependencyManifest: null,
    operationKeys: ["GET /items/{id}"],
    requirements: [{
      id: "minimal-request",
      kind: "valid-minimal" as const,
      required: true,
      scope: "each-selected-operation" as const,
      sourceLocator: "user-declared:task.json/requirements/0",
    }],
    output: "request-json" as const,
    observations: null,
    execution: { mode: "offline-validation" as const },
    mapping: { origin: "user-declared" as const, sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

describe("API TaskContract", () => {
  test("strictly validates paths, unique requirements, and unresolved bindings", () => {
    expect(parseApiTaskContract(task())).toEqual(task());
    expect(() => parseApiTaskContract({ ...task(), unexpected: true })).toThrow(/Unrecognized key/u);
    expect(() => parseApiTaskContract({ ...task(), input: { ...task().input, path: "D:\\secret.yaml" } })).toThrow(/relative path/u);
    expect(() => parseApiTaskContract({
      ...task(),
      mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: ["not-declared"] },
    })).toThrow(/unresolved requirement.*not-declared/u);
  });

  test("publishes a closed JSON schema for both supported output contracts", () => {
    expect(API_TASK_CONTRACT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(API_TASK_CONTRACT_JSON_SCHEMA.properties.output).toEqual({ enum: ["request-json", "pytest"] });
    expect(API_TASK_CONTRACT_JSON_SCHEMA.required).toContain("requirements");
  });

  test("adapts api-skill-mapping/v1 without dropping source or residual duties", () => {
    const legacy = {
      schemaVersion: "api-skill-mapping/v1",
      mappingId: "mapped-api-task",
      analysisPath: "analysis.json",
      skillId: "owner/repo:SKILL.md",
      responsibilityId: "api-tests",
      obligations: ["duty-valid", "duty-negative"],
      profile: "api-request-specimens/v1",
      requestedOutputFormat: "json",
      extraction: "agent-reviewed-declaration",
      tasks: [{ taskId: "fixture", inputPath: "api.yaml", format: "yaml", sha256: "a".repeat(64) }],
    };
    const adapted = adaptApiSkillMappingV1({
      mapping: legacy,
      parentScope: "complete responsibility api-tests",
      declarations: [
        { requirementId: "valid", kind: "valid-minimal", sourceLocator: "SKILL.md:10", obligationIds: ["duty-valid"] },
        { requirementId: "negative", kind: "constraint-negative", sourceLocator: "SKILL.md:17", obligationIds: ["duty-negative"] },
      ],
      residualDuties: [{ obligationId: "duty-live-api", sourceLocator: "SKILL.md:24", reason: "live behavior oracle absent" }],
    });
    expect(adapted.source.obligationIds).toEqual(["duty-valid", "duty-negative"]);
    expect(adapted.requirements.flatMap((row) => row.obligationIds)).toEqual(["duty-valid", "duty-negative"]);
    expect(adapted.parentScope).toBe("complete responsibility api-tests");
    expect(adapted.residualDuties).toEqual([{ obligationId: "duty-live-api", sourceLocator: "SKILL.md:24", reason: "live behavior oracle absent" }]);
    expect(legacy).toEqual({ ...legacy });

    expect(() => adaptApiSkillMappingV1({
      mapping: legacy,
      parentScope: "complete responsibility api-tests",
      declarations: [{ requirementId: "valid", kind: "valid-minimal", sourceLocator: "SKILL.md:10", obligationIds: ["duty-valid"] }],
      residualDuties: [],
    })).toThrow(/must preserve every mapped obligation/u);
  });
});
