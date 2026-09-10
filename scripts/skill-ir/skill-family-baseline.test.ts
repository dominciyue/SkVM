import { expect, test } from "bun:test";
import { createBaselineMapping } from "./skill-family-baseline";

test("baseline mapping preserves the selected full responsibility and separates acquisition failures", () => {
  const analysis = { skills: [{ skillId: "owner/skill:SKILL.md", responsibilities: [
    { id: "cases", obligations: ["valid-request", "live-state"] }, { id: "report", obligations: ["coverage"] },
  ] }] };
  const inputs = { inputs: [
    { inputId: "a", status: "acquired", localPath: "sources/a.yaml", format: "yaml", sha256: "a".repeat(64) },
    { inputId: "b", status: "failed", error: "permission" },
  ] };
  const result = createBaselineMapping({ analysis, inputs, member: { mappingId: "member", skillId: "owner/skill:SKILL.md", responsibilityId: "cases", requestedOutputFormat: "pytest" }, analysisPath: "data/analysis.json", inputRoot: "data/api" });
  expect(result.mapping.obligations).toEqual(["valid-request", "live-state"]);
  expect(result.mapping.tasks[0]!.inputPath).toBe("data/api/sources/a.yaml");
  expect(result.unavailableInputs).toEqual([{ inputId: "b", status: "failed", error: "permission" }]);
  const recursive = createBaselineMapping({ analysis, inputs, profile: "api-request-cases/v2", member: { mappingId: "member", skillId: "owner/skill:SKILL.md", responsibilityId: "cases", requestedOutputFormat: "pytest" }, analysisPath: "data/analysis.json", inputRoot: "data/api" });
  expect(recursive.mapping.profile).toBe("api-request-cases/v2");
  expect(() => createBaselineMapping({ analysis, inputs, member: { mappingId: "member", skillId: "unknown", responsibilityId: "cases", requestedOutputFormat: "pytest" }, analysisPath: "data/analysis.json", inputRoot: "data/api" })).toThrow("unique source member");
});
