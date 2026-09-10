import { test, expect } from "bun:test";
import { compareSkillBodies } from "./skill-family-source-relatedness";

test("body relatedness detects exact/normalized copies and directional containment without declaring independence", () => {
  const text = Array.from({ length: 180 }, (_, i) => `word${i}`).join(" ");
  const report = compareSkillBodies([
    { id: "a", repository: "r/a", text }, { id: "b", repository: "r/b", text },
    { id: "c", repository: "r/c", text: text.toUpperCase().replaceAll(" ", ",\n") },
    { id: "d", repository: "r/d", text: text + " " + Array.from({ length: 400 }, (_, i) => `extra${i}`).join(" ") },
    { id: "e", repository: "r/e", text: Array.from({ length: 180 }, (_, i) => `different${i}`).join(" ") },
  ]);
  const pair = (b: string) => report.pairs.find((p) => p.left === "a" && p.right === b)!;
  expect(report.pairs).toHaveLength(10);
  expect(pair("b").rawEqual).toBe(true);
  expect(pair("c").normalizedEqual).toBe(true);
  expect(pair("c").rawEqual).toBe(false);
  expect(pair("d").leftContainment).toBe(1);
  expect(pair("d").reviewFlag).toBe(true);
  expect(pair("e").reviewFlag).toBe(false);
  expect(report.genealogicalIndependenceEstablished).toBe(false);
});
