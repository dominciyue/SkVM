import { describe, expect, test } from "bun:test";
import {
  ApiTesterOperationDeliveryFreezeReportSchema,
  buildApiTesterOperationDeliveryFreezeReport,
  compareApiTesterOperationDeliveryReproduction,
} from "./api-tester-operation-delivery-report";
import { parseApiTesterOperationDeliveryReportArgs } from "./api-tester-operation-delivery-report-run";

describe("API Tester operation delivery final report", () => {
  test("compares portable semantics, totals, retained issues, and gates", () => {
    const evidence = {
      portableSemanticSha256: "a".repeat(64),
      totals: { documents: 6, operations: 562, accepted: 112, rejected: 449, unresolved: 1, checked: 112, obligations: { total: 575, covered: 575 } },
      retainedIssues: { meilisearchMissingTotalReference: true, bangumiExternalResponseAdvisoryOperations: 19 },
      gates: { sixSourceComparison: "pass", strictOutputs: "pass", implementationCorrectness: "pass", sourceCorrectness: "blocked" },
    } as const;
    expect(compareApiTesterOperationDeliveryReproduction(evidence, structuredClone(evidence))).toBe(true);
    expect(compareApiTesterOperationDeliveryReproduction(evidence, {
      ...structuredClone(evidence),
      totals: { ...evidence.totals, checked: 111 },
    })).toBe(false);
  });

  test("builds the final freeze report from archived evidence without selecting prospective rows", async () => {
    const report = await buildApiTesterOperationDeliveryFreezeReport({
      rootDir: process.cwd(),
      gitExecutable: "git",
      nodeExecutable: "C:/Program Files/nodejs/node.exe",
      bunVersion: Bun.version,
      nodeVersion: "v23.8.0",
      completedAt: "2026-09-09T14:00:00.000Z",
    });
    expect(ApiTesterOperationDeliveryFreezeReportSchema.parse(report)).toMatchObject({
      status: "frozen-with-source-blocker-and-historical-archive-gap",
      candidate: { commit: "3ebe60613bab0375047fcb51337d35b3c1830430" },
      historicalMissingArchive: { status: "missing-unarchived-original", replacedOrOverwritten: false },
      validation: { semanticReproductionEqual: true },
      gates: { implementationCorrectness: "pass", sourceCorrectness: "blocked", historicalArchiveCompleteness: "fail" },
      prospective: { inputSelection: "not-started", predictions: "not-authored", prospectiveRuns: 0, rows: [], rowPredictions: [] },
    });
  }, 30_000);

  test("CLI keeps creation and strict verification separate", () => {
    expect(parseApiTesterOperationDeliveryReportArgs([
      "--mode=create", "--root=repo", "--node=node", "--git=git", "--completed-at=2026-09-09T14:00:00.000Z",
    ])).toEqual({ mode: "create", rootDir: "repo", nodeExecutable: "node", gitExecutable: "git", completedAt: "2026-09-09T14:00:00.000Z" });
    expect(parseApiTesterOperationDeliveryReportArgs([
      "--mode=verify", "--root=repo", "--node=node", "--git=git",
    ])).toEqual({ mode: "verify", rootDir: "repo", nodeExecutable: "node", gitExecutable: "git" });
  });
});
