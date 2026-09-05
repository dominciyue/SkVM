import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArtifactPresetResultSchema } from "../../skill-ir/verified-artifact-presets";
import { sha256Bytes } from "./source-fixture";

const Root = resolve(import.meta.dir, "../../..");
const ResultDirectory = join(Root, "results/skill-ir/clean-source-gold-path-reproduction-2026-09-06");

const ReproductionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-clean-source-gold-path-reproduction/v1"),
  identity: z.literal("skill-ir-clean-source-gold-path-reproduction-2026-09-06"),
  status: z.literal("passed"),
  completedAt: z.string().datetime(),
  source: z.object({
    commit: z.string().regex(/^[0-9a-f]{40}$/u),
    checkout: z.literal("fresh-detached-git-worktree"),
    initialTrackedState: z.literal("clean"),
    platform: z.literal("windows-x64"),
    bunVersion: z.literal("1.3.14"),
    nodeVersion: z.literal("23.8.0"),
    dependencyInstall: z.object({
      command: z.literal("bun install --ignore-scripts --frozen-lockfile"),
      lockPath: z.literal("bun.lock"),
      installedPackages: z.literal(236),
      postinstallRan: z.literal(false),
    }).strict(),
  }).strict(),
  checkoutByteBindings: z.array(z.object({
    path: z.string().min(1),
    eol: z.enum(["lf", "crlf"]),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict()).length(2),
  repairEvidence: z.array(z.object({
    commit: z.string().regex(/^[0-9a-f]{40}$/u),
    status: z.enum(["failed", "passed"]),
    detail: z.string().min(1),
  }).strict()).length(3),
  reports: z.array(z.object({
    preset: z.enum(["api-tester", "env-manager"]),
    variant: z.literal("openapi-json").optional(),
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict()).length(2),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  scope: z.object({
    heldOutRead: z.literal(false),
    independentExternalOperatorObserved: z.literal(false),
    cleanInstallTested: z.literal(false),
    crossPlatformTested: z.literal(false),
    arbitraryNewSkillTested: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

describe("clean source gold-path reproduction evidence", () => {
  test("binds both zero-model CLI reports to the clean checkout identity", async () => {
    const report = ReproductionReportSchema.parse(JSON.parse(
      await readFile(join(ResultDirectory, "report.json"), "utf8"),
    ));
    expect(report.source.commit).toBe("3bd76188736a019e65e2a1f945a0d4bc307ca955");
    expect(report.reports.map(({ preset }) => preset).sort()).toEqual(["api-tester", "env-manager"]);

    for (const reference of report.reports) {
      const bytes = await readFile(join(ResultDirectory, reference.path));
      expect(sha256Bytes(bytes)).toBe(reference.sha256);
      const cliReport = ArtifactPresetResultSchema.parse(JSON.parse(bytes.toString("utf8")));
      expect(cliReport).toMatchObject({
        status: "passed",
        preset: reference.preset,
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
        coreBranchDelta: 0,
      });
      expect(cliReport.variant).toBe(reference.variant);
    }
  });

  test("keeps both frozen checkout byte bindings explicit", async () => {
    const report = ReproductionReportSchema.parse(JSON.parse(
      await readFile(join(ResultDirectory, "report.json"), "utf8"),
    ));
    const attributes = await readFile(join(Root, ".gitattributes"), "utf8");
    for (const binding of report.checkoutByteBindings) {
      expect(attributes).toContain(`/${binding.path} text eol=${binding.eol}`);
      expect(sha256Bytes(await readFile(join(Root, binding.path)))).toBe(binding.sha256);
    }
  });
});
