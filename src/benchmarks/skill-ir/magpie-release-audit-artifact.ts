import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { RestrictedDomainPlanSchema, executeRestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";
import { applyMagpieReleaseAuditArtifactPatch } from "./magpie-release-audit-artifact-patch";
import type { MagpieSlice } from "./magpie-release-audit-step2";

const PLAN_PATH = "benchmarks/skill-ir/pilots/magpie-release-audit/reviewed-plan.json";

function containedWorkdirPath(workDir: string, path: string): string {
  const root = resolve(workDir);
  const target = resolve(root, path);
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`artifact path escapes workdir: ${path}`);
  return target;
}

export async function compileMagpieReleaseAuditArtifact(options: { rootDir: string; slice: MagpieSlice }) {
  const planBytes = await readFile(resolve(options.rootDir, PLAN_PATH));
  const plan = RestrictedDomainPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  const inputFiles = options.slice.files.filter((file) => file.role === "public-input");
  if (inputFiles.length !== 19 || inputFiles.some((file) => file.role !== "public-input")) {
    throw new Error("Magpie artifact compiler input is not the frozen public-only closure");
  }
  return {
    schemaVersion: "skill-ir-magpie-release-audit-reviewed-artifact/v1" as const,
    plan,
    planPath: PLAN_PATH,
    planSha256: sha256Bytes(planBytes),
    inputFiles,
    implementationPaths: [
      "src/benchmarks/skill-ir/magpie-release-audit-artifact.ts",
      "src/benchmarks/skill-ir/magpie-release-audit-artifact-patch.ts",
      "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
    ],
    accounting: { modelCalls: 0 as const, apiCalls: 0 as const, paidCalls: 0 as const, retries: 0 as const, heldOutAccesses: 0 as const },
    claimBoundary: {
      legacyPlanAuditPaidCallsLiteral: plan.audit.paidCalls,
      observedConstructionPaidCalls: 0 as const,
      statement: "Restricted Domain Plan v1 hard-codes audit.paidCalls=1 and cannot literally represent this hand-authored zero-paid plan; observed construction accounting remains zero and is authoritative for this artifact.",
    },
  };
}

export async function runMagpieReleaseAuditArtifact(options: {
  compiled: Awaited<ReturnType<typeof compileMagpieReleaseAuditArtifact>>;
  workDir: string;
}) {
  const reportPath = containedWorkdirPath(options.workDir, "report.md");
  const stat = await lstat(reportPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("artifact report.md must be a regular protected input");
  const before = await readFile(reportPath);
  const protectedInputSha256 = sha256Bytes(before);
  const execution = await executeRestrictedDomainPlan({
    workDir: options.workDir,
    plan: options.compiled.plan,
    readablePaths: ["report.md"],
    writablePaths: ["artifact-observations.json"],
  });
  const patched = await applyMagpieReleaseAuditArtifactPatch({
    workDir: options.workDir,
    observationsPath: "artifact-observations.json",
    outputPath: "release-audit-output.json",
  });
  const after = await readFile(reportPath);
  if (!after.equals(before)) throw new Error("Magpie artifact changed protected report.md");
  return {
    workdirExecuted: true as const,
    outputPath: patched.outputPath,
    protectedInputSha256,
    executedPlanSteps: execution.executedSteps,
    modelCalls: 0 as const,
    paidCalls: 0 as const,
  };
}
