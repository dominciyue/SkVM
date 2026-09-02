import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { importExternalSkill, verifyExternalSkillImportBundle, ExternalSkillImportRecipeSchema } from "../../skill-ir/external-skill-import";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import { validateVerifiedArtifactProduct } from "../../skill-ir/verified-artifact-product";
import { sha256Bytes } from "./source-fixture";

export const MAGPIE_SHADOW_CASE = "step-0-preflight/case-1-clean-pass" as const;
export const MAGPIE_SHADOW_OUTPUT_SHA256 = "3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e" as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const MagpieExternalImportShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-external-skill-import-magpie-shadow-report/v1"),
  status: z.literal("passed"),
  importId: z.literal("magpie-release-audit-external-shadow-v1"),
  workflowId: z.literal("magpie-release-audit-product"),
  caseId: z.literal(MAGPIE_SHADOW_CASE),
  bundle: z.object({
    manifest: z.object({ path: z.literal("import-manifest.json"), sha256: DigestSchema }).strict(),
    workflowConfig: z.object({ path: z.literal("workflow-config.json"), sha256: DigestSchema }).strict(),
    closureSha256: DigestSchema,
    fileCount: z.number().int().positive(),
    runtime: z.literal("existing-skvm-product-cli-required"),
  }).strict(),
  productExecution: z.object({
    entrypoint: z.literal("runVerifiedArtifactCli"),
    stageOrder: z.tuple([z.literal("compile"), z.literal("review-or-accept"), z.literal("package"), z.literal("run"), z.literal("cost")]),
    productValidated: z.literal(true),
    outputSha256: z.literal(MAGPIE_SHADOW_OUTPUT_SHA256),
  }).strict(),
  historicalEvidence: z.object({
    denominator003: z.object({ path: z.literal("recipe/evidence/003-report.json"), sha256: DigestSchema }).strict(),
    originalRowsRerun: z.literal(0),
  }).strict(),
  accounting: z.object({ networkAccesses: z.literal(0), modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0) }).strict(),
  researchEligibility: z.literal("not-eligible"),
  claimBoundary: z.string().min(1),
}).strict();

export async function runMagpieExternalImportShadow(options: { rootDir: string; recipePath: string; sourceRoot: string; assetRoot: string; workDir: string; outDir: string; bundleDir: string; reportPath?: string }) {
  const rootDir = resolve(options.rootDir);
  const recipe = ExternalSkillImportRecipeSchema.parse(JSON.parse(await readFile(resolve(options.recipePath), "utf8")));
  const imported = await importExternalSkill({ recipe, sourceRoot: options.sourceRoot, assetRoot: options.assetRoot, out: options.bundleDir });
  await verifyExternalSkillImportBundle(imported.bundleDir);
  await mkdir(options.workDir, { recursive: true });
  const report = await readFile(join(options.sourceRoot, "step-0-preflight/case-1-clean-pass/report.md"));
  await writeFile(join(options.workDir, "report.md"), report);
  await writeFile(join(options.workDir, "release-audit-interface.json"), JSON.stringify({ schemaVersion: "skill-ir-magpie-release-audit-product-interface/v1", caseId: MAGPIE_SHADOW_CASE, observationsPath: "artifact-observations.json", outputPath: "release-audit-output.json" }, null, 2) + "\n", "utf8");
  const product = await runVerifiedArtifactCli(["--root=" + imported.bundleDir, "--config=workflow-config.json", "--workdir=" + options.workDir, "--out=" + options.outDir], rootDir);
  const validated = await validateVerifiedArtifactProduct(options.outDir);
  const output = validated.runEvidence.outputs.find((entry) => entry.path === "release-audit-output.json");
  if (!output || output.sha256 !== MAGPIE_SHADOW_OUTPUT_SHA256) throw new Error("Magpie shadow output digest does not match P1");
  if (validated.cost.researchEligibility !== "not-eligible") throw new Error("Magpie shadow must remain research-ineligible");
  const evidence = imported.manifest.files.find((file) => file.id === "evidence");
  if (!evidence || evidence.path !== "recipe/evidence/003-report.json") throw new Error("Magpie shadow evidence closure drift");
  const reportValue = MagpieExternalImportShadowReportSchema.parse({
    schemaVersion: "skill-ir-external-skill-import-magpie-shadow-report/v1",
    status: "passed",
    importId: imported.manifest.importId,
    workflowId: imported.manifest.workflowId,
    caseId: MAGPIE_SHADOW_CASE,
    bundle: {
      manifest: { path: "import-manifest.json", sha256: sha256Bytes(await readFile(join(imported.bundleDir, "import-manifest.json"))) },
      workflowConfig: { path: imported.manifest.workflowConfig.path, sha256: imported.manifest.workflowConfig.sha256 },
      closureSha256: imported.manifest.closureSha256,
      fileCount: imported.manifest.files.length,
      runtime: imported.manifest.runtime,
    },
    productExecution: { entrypoint: "runVerifiedArtifactCli", stageOrder: product.stageOrder, productValidated: true, outputSha256: output.sha256 },
    historicalEvidence: { denominator003: { path: evidence.path, sha256: evidence.sha256 }, originalRowsRerun: 0 },
    accounting: imported.manifest.accounting,
    researchEligibility: "not-eligible",
    claimBoundary: "This zero-paid shadow proves portable staging and fixed-case non-regression for one public Magpie case. It does not establish an independent runtime, upstream-judge equivalence, live-source generalization, automatic dependency discovery, research efficiency eligibility, portfolio/readiness promotion, or held-out evidence.",
  });
  if (options.reportPath) {
    await mkdir(dirname(resolve(options.reportPath)), { recursive: true });
    await writeFile(resolve(options.reportPath), JSON.stringify(reportValue, null, 2) + "\n", "utf8");
  }
  return { report: reportValue, product };
}
