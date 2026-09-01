import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { InitialWorkdirManifestReference } from "../../core/workdir-manifest";
import { MagpieReleaseAuditQualificationSchema } from "./magpie-release-audit-qualification";
import { scoreMagpieReleaseAuditOutput } from "./magpie-release-audit-checker";
import {
  MAGPIE_RELEASE_AUDIT_CASE_IDS,
  loadAndValidateMagpieReleaseAuditSlice,
  type MagpieReleaseAuditCaseId,
} from "./magpie-release-audit-step2";
import { sha256Bytes } from "./source-fixture";

const QualificationAuthority = {
  path: "results/skill-ir/magpie-release-audit-public-step2-v1/qualification.json",
  sha256: "3ea1d6361360f8108d3c70976b111619db958ae9cd8a94490a66759fedcb1a88",
} as const;

async function validateQualificationClosure(rootDir: string) {
  const bytes = await readFile(join(rootDir, QualificationAuthority.path));
  if (sha256Bytes(bytes) !== QualificationAuthority.sha256) throw new Error("Magpie qualification digest mismatch");
  const qualification = MagpieReleaseAuditQualificationSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (qualification.checker.baselinePasses !== 9 || qualification.checker.mutationFailures !== 6
    || qualification.checker.upstreamJudgePredicatesUsed !== 0 || qualification.artifact.checkerPasses !== 9
    || qualification.artifact.totalAdapterPhysicalLoc !== 287
    || qualification.checker.implementationPhysicalLoc !== 351) {
    throw new Error("Magpie qualification does not preserve the frozen checker and effort contract");
  }
  for (const reference of qualification.componentIdentity) {
    const component = await readFile(join(rootDir, reference.path));
    if (sha256Bytes(component) !== reference.sha256) throw new Error(`Magpie component digest mismatch: ${reference.path}`);
  }
  return qualification;
}

export async function checkVerifiedArtifact(options: {
  rootDir: string;
  workDir: string;
  initialWorkdirManifest: InitialWorkdirManifestReference;
}) {
  try {
    const rootDir = resolve(options.rootDir);
    const qualification = await validateQualificationClosure(rootDir);
    const manifestBytes = await readFile(options.initialWorkdirManifest.path);
    if (sha256Bytes(manifestBytes) !== options.initialWorkdirManifest.sha256) {
      return { status: "fail" as const, detail: "initial workdir manifest digest mismatch" };
    }
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as { entries?: Array<{ path?: unknown }> };
    const initialPaths = manifest.entries?.map((entry) => entry.path) ?? [];
    if (!initialPaths.includes("report.md") || !initialPaths.includes("release-audit-interface.json")
      || initialPaths.includes("release-audit-output.json") || initialPaths.includes("artifact-observations.json")) {
      return { status: "fail" as const, detail: "initial workdir manifest does not match the Magpie product ABI" };
    }
    const rawInterface = JSON.parse(await readFile(join(options.workDir, "release-audit-interface.json"), "utf8")) as {
      caseId?: unknown;
      outputPath?: unknown;
    };
    if (typeof rawInterface.caseId !== "string"
      || !MAGPIE_RELEASE_AUDIT_CASE_IDS.includes(rawInterface.caseId as MagpieReleaseAuditCaseId)
      || rawInterface.outputPath !== "release-audit-output.json") {
      return { status: "fail" as const, detail: "Magpie product interface is invalid" };
    }
    const output = await readFile(join(options.workDir, rawInterface.outputPath), "utf8");
    const slice = await loadAndValidateMagpieReleaseAuditSlice(rootDir);
    const score = await scoreMagpieReleaseAuditOutput(
      slice,
      rawInterface.caseId as MagpieReleaseAuditCaseId,
      output,
    );
    return {
      status: score.passed ? "pass" as const : "fail" as const,
      detail: score.passed
        ? `magpie fixed public case passed; caseId=${rawInterface.caseId}; qualificationSha256=${QualificationAuthority.sha256}; upstreamJudgePredicatesUsed=0`
        : `magpie fixed public case failed: ${score.failures.join("; ")}`,
    };
  } catch (error) {
    return { status: "fail" as const, detail: error instanceof Error ? error.message : String(error) };
  }
}
