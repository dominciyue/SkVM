import { test, expect } from "bun:test";
import { selectNewSkillCandidates, boundDiscoveryQueries } from "./skill-family-new-discovery";
test("new member discovery preserves returned order, repository exclusions and first-path rule", () => {
  const items = [
    { repository: { full_name: "old/repo" }, path: "SKILL.md" },
    { repository: { full_name: "new/one" }, path: "first/SKILL.md" },
    { repository: { full_name: "new/one" }, path: "second/SKILL.md" },
    { repository: { full_name: "new/two" }, path: "SKILL.md" },
  ];
  expect(selectNewSkillCandidates(items, ["OLD/REPO"])).toEqual([
    { repository: "new/one", maximumSkills: 1, paths: ["first/SKILL.md"] },
    { repository: "new/two", maximumSkills: 1, paths: ["SKILL.md"] },
  ]);
});
test("revised query comes from method binding, not post-outcome hidden selection", () => {
  expect(boundDiscoveryQueries({ discoveryQueries: ["OpenAPI exact"] })).toEqual(["OpenAPI exact"]);
  expect(() => boundDiscoveryQueries({ discoveryQueries: [] })).toThrow();
});
