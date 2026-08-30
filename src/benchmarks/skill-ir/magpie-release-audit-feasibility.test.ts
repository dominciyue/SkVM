import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MagpieReleaseAuditFeasibilitySchema,
  buildMagpieReleaseAuditFeasibility,
} from "./magpie-release-audit-feasibility";

describe("Magpie release-audit zero-execution feasibility", () => {
  test("requires a reproducible prompt identity without claiming upstream token telemetry", () => {
    const report = buildMagpieReleaseAuditFeasibility();
    const persisted = JSON.parse(readFileSync(resolve(
      import.meta.dir,
      "../../../results/skill-ir/magpie-release-audit-feasibility-v1/report.json",
    ), "utf8"));

    expect(report.status).toBe("go-to-step-2-after-user-confirmation");
    expect(persisted).toEqual(report);
    expect(report.originalBaseline).toMatchObject({
      status: "feasible-with-new-project-measurement-identity",
      promptIdentityReproducible: true,
      upstreamHarnessCapturesModelTokens: false,
      projectRuntimeCapturesModelTokens: true,
      existingBaselineRows: 0,
    });
    expect(report.solidification).toMatchObject({
      status: "feasible-with-bounded-domain-patch",
      broadCrossFieldCountsImplemented: false,
    });
    expect(report.machineChecker.upstreamJudgePredicatesReusableAsMachineAuthority).toBe(false);
    expect(report.accounting).toEqual({
      cloneOperations: 0,
      importedFiles: 0,
      externalExecutions: 0,
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
      baselineRows: 0,
      heldOutAccesses: 0,
    });
    expect(report.decision).toMatchObject({
      candidate: "apache-magpie-release-audit-report",
      switchCandidate: false,
      step1Complete: true,
      step2Started: false,
      requiresUserConfirmation: true,
    });
    expect(() => MagpieReleaseAuditFeasibilitySchema.parse({
      ...report,
      originalBaseline: {
        ...report.originalBaseline,
        upstreamHarnessCapturesModelTokens: true,
      },
    })).toThrow();
  });
});
