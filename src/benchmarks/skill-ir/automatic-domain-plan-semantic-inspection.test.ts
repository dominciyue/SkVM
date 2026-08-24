import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectRestrictedDomainPlanSemantics,
  RestrictedDomainPlanSemanticInspectionReportSchema,
} from "./automatic-domain-plan-semantic-inspection";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("restricted Domain Plan semantic inspection", () => {
  test("executes the attributed plan on both real development workdirs and records semantic gaps without claiming parity", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-semantic-inspection-"));
    temporaryDirectories.push(outputDir);

    const report = await inspectRestrictedDomainPlanSemantics({
      rootDir: process.cwd(),
      attributionFreezePath: "results/skill-ir/automatic-domain-plan-attribution-v1/pre-model-freeze.json",
      attributionReportPath: "results/skill-ir/automatic-domain-plan-attribution-v1/report.json",
      generatedPlanPath: "results/skill-ir/automatic-domain-plan-attribution-v1/generated-plan.json",
      publicContractFixturePath: "env-audit-interface.json",
      outputPath: join(outputDir, "report.json"),
      measurementCompletedAt: "2026-08-24T15:30:00.000Z",
    });

    expect(report.tasks.map((task) => ({
      taskId: task.taskId,
      runtimeStatus: task.runtimeStatus,
      failureClass: task.failureClass,
      protectedInputsPreserved: task.protectedInputsPreserved,
      declaredOutputsPresent: task.declaredOutputsPresent,
      uncoveredImportMetaEnvReferences: task.uncoveredImportMetaEnvReferences,
    }))).toEqual([
      {
        taskId: "env-manager-scorer-authority-node-dev-001",
        runtimeStatus: "failed",
        failureClass: "template-binding-type",
        protectedInputsPreserved: true,
        declaredOutputsPresent: ["env-report.json"],
        uncoveredImportMetaEnvReferences: 0,
      },
      {
        taskId: "env-manager-scorer-authority-vite-dev-002",
        runtimeStatus: "failed",
        failureClass: "template-binding-type",
        protectedInputsPreserved: true,
        declaredOutputsPresent: ["env-report.json"],
        uncoveredImportMetaEnvReferences: 2,
      },
    ]);
    expect(report.findings.map((finding) => finding.id)).toEqual([
      "text-template-non-string-binding",
      "interface-derived-values-unused",
      "vite-reference-form-uncovered",
    ]);
    expect(report.summary).toEqual({
      tasksExecuted: 2,
      runtimeComplete: 0,
      runtimeFailed: 2,
      paidCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    });
    expect(report.semanticParity).toBe("not-established");
    expect(report.eligibilityChanged).toBe(false);
    expect(RestrictedDomainPlanSemanticInspectionReportSchema.parse(report)).toEqual(report);
    expect(JSON.parse(await readFile(join(outputDir, "report.json"), "utf8"))).toEqual(report);
  });
});
