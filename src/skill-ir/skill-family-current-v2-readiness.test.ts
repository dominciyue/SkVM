import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildCurrentV2ReadinessReport,
  deriveCurrentV2Readiness,
  verifyCurrentV2ReadinessReport,
  type CurrentV2ReadinessInput,
} from "./skill-family-current-v2-readiness";

function baseInput(): CurrentV2ReadinessInput {
  return {
    methodChecks: {
      taskContract: true,
      completePlan: true,
      mappingUncertainty: true,
      sourceClosure: true,
      independentChecker: true,
      assignedFaultDetection: true,
      ordinaryEntry: true,
    },
    methodGatePassed: false,
    tasks: [
      { taskId: "ready", sourceBlocking: 0, sourceAssessed: true, packageCheck: "pass", runStatus: "completed", taskComplete: true },
      { taskId: "blocked", sourceBlocking: 1, sourceAssessed: true, packageCheck: "pass", runStatus: "completed", taskComplete: false },
    ],
    protocol: { codeCandidateLocked: true, selectionRulesLocked: true, evaluationPolicyLocked: true, failurePolicyLocked: true },
    prospective: {
      authorized: true,
      selectedSourcesSufficient: true,
      postAcquisitionPredictionsLocked: true,
      authorizedUnseenReads: 0,
      protectedReadViolations: 0,
      prospectiveRuns: 0,
    },
    transferResult: null,
    reproduction: { ordinaryEntryReplay: true, bundleReplay: true, nativeFixtureReplay: true },
  };
}

test("readiness is non-circular across protocol, acquisition, task failures, and transfer", () => {
  const unread = deriveCurrentV2Readiness(baseInput());
  expect(unread.dimensions.protocol.status).toBe("ready");
  expect(unread.dimensions.prospective.status).toBe("ready");
  expect(unread.dimensions.transfer.status).toBe("not-assessed");

  const afterAuthorizedReads = baseInput();
  afterAuthorizedReads.prospective.authorizedUnseenReads = 2;
  expect(deriveCurrentV2Readiness(afterAuthorizedReads).dimensions.prospective.status).toBe("ready");
  expect(deriveCurrentV2Readiness(afterAuthorizedReads).dimensions.transfer.status).toBe("not-assessed");

  const tasks = deriveCurrentV2Readiness(baseInput()).tasks;
  expect(tasks.find((row) => row.taskId === "ready")?.capability.status).toBe("ready");
  expect(tasks.find((row) => row.taskId === "blocked")?.capability.status).toBe("not-ready");
  expect(tasks.find((row) => row.taskId === "ready")?.source.status).toBe("ready");
  expect(tasks.find((row) => row.taskId === "blocked")?.source.status).toBe("not-ready");
});

test("current N7 report keeps method, capability, protocol, transfer, and replay evidence separate", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const archived = await Bun.file(resolve(
    repositoryRoot,
    "results/skill-ir/skill-family-current-v2-source-repair-001/readiness/report.json",
  )).json();
  const codeCommit = archived.codeCommit as string;
  const report = await buildCurrentV2ReadinessReport({
    repositoryRoot,
    codeCommit,
    evaluatedAt: "2099-01-01T00:00:00.000Z",
  });

  expect(report.dimensions.method.status).toBe("ready");
  expect(report.dimensions.capability.status).toBe("not-ready");
  expect(report.dimensions.protocol.status).toBe("not-ready");
  expect(report.dimensions.prospective.status).toBe("not-ready");
  expect(report.dimensions.transfer.status).toBe("not-assessed");
  expect(report.dimensions.reproducible.status).toBe("ready");
  expect(report.tasks.filter((row) => row.capability.status === "ready")).toHaveLength(4);
  expect(report.tasks.every((row) => row.source.status === "ready")).toBe(true);
  expect((await verifyCurrentV2ReadinessReport({ repositoryRoot, report })).status).toBe("pass");

  const tampered = structuredClone(report);
  tampered.dimensions.capability.status = "ready";
  expect((await verifyCurrentV2ReadinessReport({ repositoryRoot, report: tampered })).errors)
    .toContain("READINESS_DERIVATION_MISMATCH");
});
