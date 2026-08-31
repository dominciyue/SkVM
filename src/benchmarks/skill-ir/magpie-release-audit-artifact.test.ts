import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Bytes } from "./source-fixture";
import { scoreMagpieReleaseAuditOutput } from "./magpie-release-audit-checker";
import {
  MAGPIE_RELEASE_AUDIT_CASE_IDS,
  loadAndValidateMagpieReleaseAuditSlice,
  readMagpieReleaseAuditPublicFile,
} from "./magpie-release-audit-step2";
import {
  compileMagpieReleaseAuditArtifact,
  runMagpieReleaseAuditArtifact,
} from "./magpie-release-audit-artifact";

const rootDir = resolve(import.meta.dir, "../../..");
const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Magpie release-audit reviewed deterministic artifact", () => {
  test("executes all nine public cases in real workdirs and passes the independent checker", async () => {
    const slice = await loadAndValidateMagpieReleaseAuditSlice(rootDir);
    const compiled = await compileMagpieReleaseAuditArtifact({ rootDir, slice });
    expect(compiled.plan.audit.skillSpecificBranches).toBe(0);
    expect(compiled.accounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0, retries: 0, heldOutAccesses: 0 });
    expect(compiled.claimBoundary.legacyPlanAuditPaidCallsLiteral).toBe(1);
    expect(compiled.claimBoundary.observedConstructionPaidCalls).toBe(0);
    expect(compiled.inputFiles.every((file) => file.role === "public-input")).toBe(true);
    expect(compiled.inputFiles.some((file) => file.localPath.includes("checker-oracle"))).toBe(false);

    for (const caseId of MAGPIE_RELEASE_AUDIT_CASE_IDS) {
      const workDir = await mkdtemp(join(tmpdir(), "magpie-release-audit-artifact-"));
      temporary.push(workDir);
      const report = await readMagpieReleaseAuditPublicFile(slice, `/public/${caseId}/report.md`);
      await copyFile(resolve(rootDir, report.file.localPath), join(workDir, "report.md"));
      const before = await readFile(join(workDir, "report.md"));
      const run = await runMagpieReleaseAuditArtifact({ compiled, workDir });
      const after = await readFile(join(workDir, "report.md"));
      expect(after.equals(before), `${caseId} changed protected report.md`).toBe(true);
      expect(run.workdirExecuted).toBe(true);
      expect(run.outputPath).toBe("release-audit-output.json");
      expect(run.protectedInputSha256).toBe(sha256Bytes(before));
      const output = await readFile(join(workDir, run.outputPath), "utf8");
      const score = await scoreMagpieReleaseAuditOutput(slice, caseId, output);
      expect(score.passed, `${caseId}: ${score.failures.join("; ")}`).toBe(true);
    }
  });

  test("keeps the artifact implementation independent from checker/oracle code", async () => {
    const sources = await Promise.all([
      "src/benchmarks/skill-ir/magpie-release-audit-artifact.ts",
      "src/benchmarks/skill-ir/magpie-release-audit-artifact-patch.ts",
    ].map((path) => readFile(resolve(rootDir, path), "utf8")));
    const closure = sources.join("\n");
    expect(closure).not.toContain("magpie-release-audit-checker");
    expect(closure).not.toContain("checker-oracle");
    expect(closure).not.toContain("expected.json");
    expect(closure).not.toContain("assertions.json");
  });
});
