import { test, expect } from "bun:test";
import { runBodyMetamorphisms } from "./api-request-body-metamorphic";

test("body-negative source representation metamorphisms preserve semantic requests and coverage", () => {
  const report = runBodyMetamorphisms();
  expect(report.parent.check.status).toBe("pass");
  expect(report.rows).toHaveLength(6);
  for (const row of report.rows) {
    expect(row.sha256).not.toBe(row.parentSha256);
    expect(row.check.status).toBe("pass");
    expect(row.sameSemantics).toBe(true);
    expect(row.additionalRecorded).toBe(true);
  }
});
