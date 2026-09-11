import { test, expect } from "bun:test";
import { runHeaderRelations } from "../../scripts/skill-ir/api-response-header-relations";
test("header relations preserve bounded semantic outcomes and independently enumerated fields", () => {
  const report = runHeaderRelations();
  expect(report.baselineValid).toBe(true);
  expect(report.relations).toHaveLength(6);
  expect(report.relations.every(r => r.holds && r.sourceSha256 !== r.parentSha256)).toBe(true);
  expect(report.relations.every(r => r.result.headers.length === 3)).toBe(true);
  expect(report.realSamplesAdded).toBe(0);
  expect(report.addedSiblingResult.status).toBe("unresolved");
  expect(report.addedSiblingResult.headers).toHaveLength(1);
});
