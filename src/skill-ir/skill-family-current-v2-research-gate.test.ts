import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildCurrentV2ResearchNotExecutedReport,
  verifyCurrentV2ResearchNotExecutedReport,
} from "./skill-family-current-v2-research-gate";

test("research gate records N9, N11, and N12 as not executed without fabricating candidate artifacts", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const process = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const codeCommit = (await new Response(process.stdout).text()).trim();
  expect(await process.exited).toBe(0);
  const report = await buildCurrentV2ResearchNotExecutedReport({
    repositoryRoot,
    codeCommit,
    evaluatedAt: "2099-01-01T00:00:00.000Z",
  });

  expect(report.decision).toBe("research-not-executed");
  expect(report.tasks).toEqual([
    { taskId: "N9", status: "not-executed", reason: "n10-method-gate-not-ready" },
    { taskId: "N11", status: "not-executed", reason: "candidate-freeze-not-executed" },
    { taskId: "N12", status: "not-executed", reason: "protocol-and-predictions-not-locked" },
  ]);
  expect(report.forbiddenArtifacts.every((row) => row.existsAtCodeCommit === false)).toBe(true);
  expect(report.protectedState).toEqual({ heldOutReads: 0, q1ReservedReads: 0, prospectiveRuns: 0 });
  expect((await verifyCurrentV2ResearchNotExecutedReport({ repositoryRoot, report })).status).toBe("pass");

  const tampered = structuredClone(report);
  tampered.tasks[2]!.status = "completed" as never;
  expect((await verifyCurrentV2ResearchNotExecutedReport({ repositoryRoot, report: tampered })).errors)
    .toContain("RESEARCH_GATE_DECISION_MISMATCH");
});
