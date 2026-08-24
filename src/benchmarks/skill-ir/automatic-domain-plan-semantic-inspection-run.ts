import { resolve } from "node:path";
import { inspectRestrictedDomainPlanSemantics } from "./automatic-domain-plan-semantic-inspection";

const rootDir = resolve(process.cwd());
const report = await inspectRestrictedDomainPlanSemantics({
  rootDir,
  attributionFreezePath: "results/skill-ir/automatic-domain-plan-attribution-v1/pre-model-freeze.json",
  attributionReportPath: "results/skill-ir/automatic-domain-plan-attribution-v1/report.json",
  generatedPlanPath: "results/skill-ir/automatic-domain-plan-attribution-v1/generated-plan.json",
  publicContractFixturePath: "env-audit-interface.json",
  outputPath: resolve(rootDir, "results/skill-ir/automatic-domain-plan-semantic-inspection-v1/report.json"),
});

console.log(JSON.stringify({
  path: "results/skill-ir/automatic-domain-plan-semantic-inspection-v1/report.json",
  tasks: report.tasks.map((task) => ({
    taskId: task.taskId,
    runtimeStatus: task.runtimeStatus,
    failureClass: task.failureClass,
    protectedInputsPreserved: task.protectedInputsPreserved,
    declaredOutputsPresent: task.declaredOutputsPresent,
    uncoveredImportMetaEnvReferences: task.uncoveredImportMetaEnvReferences,
  })),
  findings: report.findings,
  semanticParity: report.semanticParity,
  eligibilityChanged: report.eligibilityChanged,
  summary: report.summary,
}, null, 2));
