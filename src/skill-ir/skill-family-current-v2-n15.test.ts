import { expect, test } from "bun:test";
import {
  buildCurrentV2N15FinalReport,
  CURRENT_V2_N15_EVIDENCE_PATHS,
  CURRENT_V2_N15_VERIFICATION_PATH,
} from "./skill-family-current-v2-n15";

const CODE = "a".repeat(40);
const EVIDENCE = "b".repeat(40);

function fixture() {
  const binding = (path: string) => ({
    path,
    sha256: "c".repeat(64),
    bytes: 1,
  });
  const evidence = Object.fromEntries(Object.entries(CURRENT_V2_N15_EVIDENCE_PATHS)
    .map(([name, path]) => [name, binding(path)]));
  return {
    deliveryCodeCommit: CODE,
    evidenceCommit: EVIDENCE,
    generatedAt: "2026-09-12T16:00:00.000Z",
    evidence,
    deliveryVerification: binding(CURRENT_V2_N15_VERIFICATION_PATH),
    verification: {
      schemaVersion: "skill-family-current-v2-n15-delivery-verification/v1",
      identity: "skill-family-current-v2-source-repair-001",
      deliveryCodeCommit: CODE,
      evidenceCommit: EVIDENCE,
      decision: "passed",
      summary: { focusedPassed: 40, focusedFailed: 0, assertions: 120, typecheckExitCode: 0,
        docLinkUnitExitCode: 0, docLinkFullExitCode: 0, brokenDocReferences: 0,
        legacyDocReferences: 0, retiredDocReferences: 6, diffCheckExitCode: 0,
        trackedClean: true, headMatchesOrigin: true },
    },
    reports: {
      sourceLedger: { summary: { bodies: 12, repositoryOrigins: 6, directResources: 42 } },
      dutyMatrix: { summary: { members: 12, duties: 498, constructible: 38, unsupported: 79,
        outsideClass: 46, unmappedOrUnresolved: 335, mappingCandidates: 4 } },
      gapMatrix: { relations: { requirementChangeChangesPlan: true, outputChangeChangesPlan: true,
        memberAndRepositoryRenamePreservesSemantics: true } },
      sourceClosure: { decision: "passed", realSummary: { tasks: 3, passed: 3, partial: 0, blocked: 0 } },
      consumer: { decision: "passed", faultInjection: { summary: { injected: 8, correctlyDetected: 8, missed: 0,
        notApplicable: 0 } }, fixtures: [
        { junit: { tests: 4, executed: 2, passed: 2, failed: 0, errors: 0, skipped: 2 } },
        { junit: { tests: 5, executed: 2, passed: 2, failed: 0, errors: 0, skipped: 3 } },
      ] },
      engine: { decision: "passed", command: "bun ./bin/skvm.js artifact task --task=task.json --out=out",
        bindingCommand: "bun ./bin/skvm.js artifact task --binding=run-binding.json", cases: [{}, {}, {}, {}] },
      inputLock: { summary: { uniqueInputs: 6, providers: 3, operationDenominator: 47, taskContracts: 9,
        mappingRepositories: 4 } },
      firstRun: { summary: { uniqueInputs: 6, providers: 3, operationDenominator: 47, taskContracts: 9,
        taskComplete: 4, completeProviders: 3, packageChecksPassed: 9, requiredObligationDenominator: 18,
        checkedExportedRequiredObligations: 8, unresolvedRequiredObligations: 10, comparisons: 2,
        comparisonsPassed: 1 }, methodGate: { decision: "method-not-ready" }, tasks: [
        { taskId: "complete-a", taskComplete: true }, { taskId: "complete-b", taskComplete: true },
        { taskId: "complete-c", taskComplete: true }, { taskId: "complete-d", taskComplete: true },
        ...Array.from({ length: 5 }, (_, index) => ({ taskId: `partial-${index}`, taskComplete: false })),
      ] },
      revision: { decision: "no-safe-shared-revision", implementationChanges: [] },
      readiness: { decision: "engineering-ready-research-not-ready", dimensions: {
        method: { status: "ready" }, capability: { status: "not-ready" }, protocol: { status: "not-ready" },
        prospective: { status: "not-ready" }, transfer: { status: "not-assessed" },
        reproducible: { status: "ready" }, protectedIsolation: { status: "ready" },
      } },
      research: { decision: "research-not-executed", tasks: [
        { taskId: "N9", status: "not-executed", reason: "n10-method-gate-not-ready" },
        { taskId: "N11", status: "not-executed", reason: "candidate-freeze-not-executed" },
        { taskId: "N12", status: "not-executed", reason: "protocol-and-predictions-not-locked" },
      ], protectedState: { heldOutReads: 0, q1ReservedReads: 0, prospectiveRuns: 0 } },
      comparison: { decision: "completed-with-limitation", summary: { baselineRuns: 2, baselinePassed: 0,
        baselineRequests: 3, faultInjections: 3, correctlyDetectedFaults: 0, missedFaults: 0,
        notApplicableFaults: 3, actualLoopbackHttpCalls: 9 } },
      meilisearch: { resolution: { decision: "source-blocked-unresolved", affectedOperation: "GET /tasks" } },
      bangumi: { summary: { historicalReferenceIssues: 32, parsedReferenceIssues: 32,
        unresolvedReferenceIssues: 0, affectedOperations: 19 }, resolution: {
        decision: "resolved-new-development-source", liveApiValidityEstablished: false } },
      archiveSearch: { result: { decision: "not-recovered-within-search-scope", recoveredExact: false,
        historicalGapRemains: true } },
      cleanReplay: { decision: "passed", attempt: 2, researchCandidate: null, replay: {
        n8: { status: "pass", cases: 4, bundleReplay: true },
        n10: { status: "pass", tasks: 9, packageChecksPassed: 9, taskComplete: 4, required: 18,
          checkedExported: 8, unresolved: 10, failureSemanticsEqual: true },
        native: { status: "pass", attempted: 9, executed: 4, passed: 4, failed: 0, errors: 0,
          skipped: 5, loopbackHttpCalls: 4, directPackageExecution: true },
      } },
      statusSnapshot: { currentStage: "N15", tasks: { N14: { status: "completed" }, N15: { status: "pending" } },
        accounting: { sourceApiCalls: 2, businessApiCalls: 0, modelCalls: 0, paidCalls: 0,
          nativeLoopbackHttpCalls: 17, developmentAgentCost: "not-measured" },
        protectedState: { historicalDocumentResult: "0/6-unchanged", heldOutReads: 0, q1ReservedReads: 0,
          prospectiveRuns: 0 }, unresolvedIssues: ["historical-clean-002-archive-missing"] },
    },
  } as any;
}

test("N15 separates a usable engineering shortfall from an unexecuted research outcome", () => {
  const report = buildCurrentV2N15FinalReport(fixture());
  expect(report.decision).toBe("completed-with-engineering-shortfall");
  expect(report.engineeringDelivery.status).toBe("usable-with-shortfall");
  expect(report.engineeringDelivery.panel).toMatchObject({ uniqueInputs: 6, providers: 3, operations: 47,
    tasks: 9, taskComplete: 4, packageChecksPassed: 9, required: 18, checkedExported: 8, unresolved: 10 });
  expect(report.researchOutcome).toMatchObject({ status: "not-executed", candidate: null,
    prospectiveRuns: 0, transfer: "not-assessed" });
  expect(report.protectedBoundary.historicalDocumentResult).toBe("0/6-unchanged");
});

test("N15 rejects denominator drift between the fixed panel and replay", () => {
  const input = fixture();
  input.reports.cleanReplay.replay.n10.tasks = 8;
  expect(() => buildCurrentV2N15FinalReport(input)).toThrow("denominator mismatch");
});

test("N15 cannot turn any research task into an executed result", () => {
  const input = fixture();
  input.reports.research.tasks[0].status = "completed";
  expect(() => buildCurrentV2N15FinalReport(input)).toThrow("research chain");
});
