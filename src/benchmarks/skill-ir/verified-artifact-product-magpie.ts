import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import {
  VerifiedArtifactWorkflowConfigSchema,
  validateVerifiedArtifactProduct,
} from "../../skill-ir/verified-artifact-product";
import { MagpieReleaseAuditQualificationSchema } from "./magpie-release-audit-qualification";
import {
  MAGPIE_RELEASE_AUDIT_CASE_IDS,
  loadAndValidateMagpieReleaseAuditSlice,
  readMagpieReleaseAuditPublicFile,
} from "./magpie-release-audit-step2";
import { sha256Bytes } from "./source-fixture";

export const MAGPIE_PRODUCT_CONFIG_PATH =
  "benchmarks/skill-ir/pilots/magpie-release-audit/verified-artifact-product-machine-checked.json";
const QUALIFICATION_PATH = "results/skill-ir/magpie-release-audit-public-step2-v1/qualification.json";
const QUALIFICATION_SHA256 = "3ea1d6361360f8108d3c70976b111619db958ae9cd8a94490a66759fedcb1a88";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const EvidenceRefSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const CaseIdSchema = z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS);
const HistoricalRecordSchema = z.object({
  caseId: CaseIdSchema,
  repetition: z.union([z.literal(1), z.literal(2)]),
  system: z.enum(["original", "reviewed-artifact"]),
  passed: z.boolean(),
  outputSha256: Sha256Schema,
}).strict();

const HistoricalResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-public-efficiency-result/v1"),
  experimentId: z.literal("magpie-release-audit-public-efficiency-executable-bound-003"),
  status: z.literal("completed"),
  policy: EvidenceRefSchema,
  denominator: z.object({
    expectedRows: z.literal(36),
    observedRows: z.literal(36),
    pairs: z.literal(18),
    paidOriginalRows: z.literal(18),
    deterministicArtifactRows: z.literal(18),
    retries: z.literal(0),
  }).strict(),
  quality: z.object({
    originalPasses: z.literal(6),
    artifactPasses: z.literal(18),
    completePairs: z.literal(18),
    infrastructureFailures: z.literal(0),
    pairwiseRegressions: z.literal(0),
    machineCheckedEquivalent: z.literal(true),
  }).strict(),
  runtimeCost: z.object({
    original: z.object({
      samples: z.literal(18),
      aggregateInputTokens: z.literal(73537),
      aggregateOutputTokens: z.literal(14038),
      aggregateCacheReadTokens: z.literal(40960),
      aggregateCacheWriteTokens: z.literal(0),
      meanInputPlusOutputTokens: z.literal(4865.277777777777),
    }).strict(),
    artifact: z.object({ samples: z.literal(18), aggregateModelTokens: z.literal(0) }).strict(),
    meanModelTokensSavedPerRun: z.literal(4865.277777777777),
    explicitProductionApiModelTokens: z.literal(0),
    conditionalExplicitApiTokenBreakEven: z.object({
      status: z.literal("computed"),
      calls: z.literal(0),
      firstRecurringRunNetPositive: z.literal(true),
    }).strict(),
  }).strict(),
  researchEligibility: z.object({
    allAttemptCostComplete: z.literal(false),
    efficiencyPositiveEligible: z.literal(false),
    classification: z.literal("not-eligible-unobservable-development-agent-cost"),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(18),
    apiCalls: z.literal(18),
    paidCalls: z.literal(18),
    artifactExecutions: z.literal(18),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
  evidence: z.object({
    prefixSha256: Sha256Schema,
    records: z.array(HistoricalRecordSchema).length(36),
  }).strict(),
  authorizations: z.object({
    portfolioPromotion: z.literal(false),
    readinessPromotion: z.literal(false),
    heldOut: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

const ProductCaseSchema = z.object({
  caseId: CaseIdSchema,
  productDirectory: z.string().min(1),
  manifest: EvidenceRefSchema,
  qualityEvidence: EvidenceRefSchema,
  costReport: EvidenceRefSchema,
  artifactClosureSha256: Sha256Schema,
  outputSha256: Sha256Schema,
  protectedInputsPreserved: z.literal(true),
  checkerPassed: z.literal(true),
  breakEvenCalls: z.literal(0),
}).strict();

export const MagpieMachineCheckedProductReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-machine-checked-product-demonstration/v1"),
  status: z.literal("passed"),
  workflowId: z.literal("magpie-release-audit-product"),
  completedAt: z.string().datetime(),
  productExecution: z.object({
    entrypoint: z.literal("runVerifiedArtifactCli"),
    config: EvidenceRefSchema,
    stageOrder: z.tuple([
      z.literal("compile"),
      z.literal("review-or-accept"),
      z.literal("package"),
      z.literal("run"),
      z.literal("cost"),
    ]),
    publicCases: z.literal(9),
    productsValidated: z.literal(9),
    coreBranchDelta: z.literal(0),
  }).strict(),
  historicalEvidence: z.object({
    denominator003: EvidenceRefSchema,
    qualification: EvidenceRefSchema,
    originalRowsRerun: z.literal(0),
  }).strict(),
  quality: z.object({
    evidence: z.literal("machine-checked-fixed-public-slice-non-regression"),
    productCheckerPasses: z.literal(9),
    historicalOriginalPasses: z.literal(6),
    historicalArtifactPasses: z.literal(18),
    historicalCompletePairs: z.literal(18),
    historicalPairwiseRegressions: z.literal(0),
    historicalOriginalPassingCases: z.tuple([
      z.literal("step-0-preflight/case-1-clean-pass"),
      z.literal("step-1-gather-record/case-2-partial-data"),
      z.literal("step-2-assemble-record/case-4-all-required-missing"),
    ]),
    upstreamJudgeSemanticEquivalence: z.literal("not-established"),
    originalPassRateDisposition: z.literal("not-an-upstream-skill-score"),
  }).strict(),
  tokenEconomics: z.object({
    scope: z.literal("explicit-production-api-input-plus-output-tokens-only"),
    originalSamples: z.literal(18),
    originalAggregateInputTokens: z.literal(73537),
    originalAggregateOutputTokens: z.literal(14038),
    originalAggregateCacheReadTokensDisclosedSeparately: z.literal(40960),
    originalAggregateCacheWriteTokensDisclosedSeparately: z.literal(0),
    originalMeanInputPlusOutputTokensPerRun: z.literal(4865.277777777777),
    artifactModelTokensPerRun: z.literal(0),
    oneTimeExplicitProductionApiModelTokens: z.literal(0),
    conditionalBreakEvenCalls: z.literal(0),
    firstRecurringRunNetPositive: z.literal(true),
  }).strict(),
  adaptationCost: z.object({
    adapterPhysicalLoc: z.literal(287),
    checkerPhysicalLoc: z.literal(351),
    humanMinutes: z.null(),
    taskDeclarationAuthoringHumanMinutes: z.literal(3),
    developmentAgentTokens: z.literal("not-observable"),
    totalCost: z.literal("not-computable"),
  }).strict(),
  currentStageAccounting: z.object({
    apiCalls: z.literal(0),
    modelCalls: z.literal(0),
    paidCalls: z.literal(0),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    historicalOriginalRowsRerun: z.literal(0),
    historicalOriginalRowsDigestBound: z.literal(18),
  }).strict(),
  researchEligibility: z.literal("not-eligible"),
  products: z.array(ProductCaseSchema).length(9),
  authorizations: z.object({
    portfolioMutation: z.literal(false),
    readinessMutation: z.literal(false),
    heldOut: z.literal(false),
    liveSource: z.literal(false),
    p2Started: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export type MagpieMachineCheckedProductReport = z.infer<typeof MagpieMachineCheckedProductReportSchema>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.next`;
  await writeFile(temporary, jsonText(value), "utf8");
  await rename(temporary, path);
}

async function digestRef(baseDir: string, relativePath: string) {
  const bytes = await readFile(join(baseDir, relativePath));
  return { path: relativePath.replaceAll("\\", "/"), sha256: sha256Bytes(bytes) };
}

async function readPinnedJson<T>(rootDir: string, reference: { path: string; sha256: string }, schema: z.ZodType<T>) {
  const bytes = await readFile(join(rootDir, reference.path));
  if (sha256Bytes(bytes) !== reference.sha256) throw new Error(`digest mismatch for ${reference.path}`);
  return schema.parse(JSON.parse(bytes.toString("utf8")));
}

async function validateHistoricalDenominator(rootDir: string, reference: { path: string; sha256: string }) {
  const historical = await readPinnedJson(rootDir, reference, HistoricalResultSchema);
  const policyBytes = await readFile(join(rootDir, historical.policy.path));
  if (sha256Bytes(policyBytes) !== historical.policy.sha256) throw new Error("Magpie 003 policy digest mismatch");
  const pairs = new Map<string, { original?: boolean; artifact?: boolean }>();
  for (const record of historical.evidence.records) {
    const key = `${record.caseId}#${record.repetition}`;
    const pair = pairs.get(key) ?? {};
    if (record.system === "original") {
      if (pair.original !== undefined) throw new Error(`duplicate Magpie 003 original row: ${key}`);
      pair.original = record.passed;
    } else {
      if (pair.artifact !== undefined) throw new Error(`duplicate Magpie 003 artifact row: ${key}`);
      pair.artifact = record.passed;
    }
    pairs.set(key, pair);
  }
  if (pairs.size !== 18 || [...pairs.values()].some((pair) => pair.original === undefined || pair.artifact === undefined)) {
    throw new Error("Magpie 003 records do not form 18 complete pairs");
  }
  const originalPasses = [...pairs.values()].filter((pair) => pair.original).length;
  const artifactPasses = [...pairs.values()].filter((pair) => pair.artifact).length;
  const regressions = [...pairs.values()].filter((pair) => pair.original && !pair.artifact).length;
  const passingCases = [...new Set(historical.evidence.records
    .filter((record) => record.system === "original" && record.passed)
    .map((record) => record.caseId))];
  if (originalPasses !== 6 || artifactPasses !== 18 || regressions !== 0
    || JSON.stringify(passingCases) !== JSON.stringify([
      "step-0-preflight/case-1-clean-pass",
      "step-1-gather-record/case-2-partial-data",
      "step-2-assemble-record/case-4-all-required-missing",
    ])) {
    throw new Error("Magpie 003 record-level quality accounting drift");
  }
  const explicitTokens = historical.runtimeCost.original.aggregateInputTokens
    + historical.runtimeCost.original.aggregateOutputTokens;
  if (explicitTokens !== 87575 || explicitTokens / 18 !== historical.runtimeCost.original.meanInputPlusOutputTokens) {
    throw new Error("Magpie 003 explicit token accounting drift");
  }
  return historical;
}

export async function runMagpieVerifiedArtifactProduct(options: {
  rootDir: string;
  runRoot: string;
  completedAt: string;
}) {
  const rootDir = resolve(options.rootDir);
  const runRoot = resolve(options.runRoot);
  const completedAt = z.string().datetime().parse(options.completedAt);
  await mkdir(runRoot, { recursive: true });
  if ((await readdir(runRoot)).length > 0) throw new Error(`Magpie product run root must be empty: ${runRoot}`);

  const configReference = await digestRef(rootDir, MAGPIE_PRODUCT_CONFIG_PATH);
  const config = VerifiedArtifactWorkflowConfigSchema.parse(
    JSON.parse(await readFile(join(rootDir, MAGPIE_PRODUCT_CONFIG_PATH), "utf8")),
  );
  if (config.workflowId !== "magpie-release-audit-product"
    || config.quality.mode !== "machine-checked"
    || config.quality.researchDisposition !== "not-eligible"
    || config.production.oneTimeModelTokens.status !== "measured"
    || config.production.oneTimeModelTokens.value !== 0
    || config.production.originalRuntime.status !== "measured"
    || config.production.originalRuntime.aggregateDurationMs !== null
    || config.review.humanMinutes !== null
    || config.review.packaging !== "digest-bound-bundle") {
    throw new Error("Magpie product config does not preserve the P1 quality/cost boundary");
  }
  const historical = await validateHistoricalDenominator(rootDir, config.production.originalRuntime.evidence);
  const qualificationReference = { path: QUALIFICATION_PATH, sha256: QUALIFICATION_SHA256 };
  const qualification = await readPinnedJson(
    rootDir,
    qualificationReference,
    MagpieReleaseAuditQualificationSchema,
  );
  if (qualification.artifact.totalAdapterPhysicalLoc !== 287
    || qualification.checker.implementationPhysicalLoc !== 351
    || qualification.effort.humanReview.humanMinutes !== null
    || qualification.artifact.checkerPasses !== 9) {
    throw new Error("Magpie qualification effort or checker closure drift");
  }
  const slice = await loadAndValidateMagpieReleaseAuditSlice(rootDir);
  const products = [];
  const runtimeProducts = [];
  for (const caseId of MAGPIE_RELEASE_AUDIT_CASE_IDS) {
    const caseDirectory = caseId.replaceAll("/", "__");
    const workDir = join(runRoot, "workdirs", caseDirectory);
    const productDirectory = `products/${caseDirectory}`;
    const productDir = join(runRoot, productDirectory);
    await mkdir(workDir, { recursive: true });
    const publicReport = await readMagpieReleaseAuditPublicFile(slice, `/public/${caseId}/report.md`);
    await copyFile(join(rootDir, publicReport.file.localPath), join(workDir, "report.md"));
    await writeFile(join(workDir, "release-audit-interface.json"), jsonText({
      schemaVersion: "skill-ir-magpie-release-audit-product-interface/v1",
      caseId,
      observationsPath: "artifact-observations.json",
      outputPath: "release-audit-output.json",
    }), "utf8");

    const product = await runVerifiedArtifactCli([
      `--root=${rootDir}`,
      `--config=${MAGPIE_PRODUCT_CONFIG_PATH}`,
      `--workdir=${workDir}`,
      `--out=${productDir}`,
    ], rootDir);
    const validated = await validateVerifiedArtifactProduct(productDir);
    if (validated.qualityEvidence.qualityEvidence !== "machine-checked"
      || validated.qualityEvidence.researchDisposition !== "not-eligible"
      || validated.runEvidence.modelTokens !== 0
      || !validated.runEvidence.protectedInputsPreserved
      || !validated.runEvidence.previewOutputsReproduced
      || validated.cost.researchEligibility !== "not-eligible"
      || validated.cost.breakEven.status !== "computed"
      || validated.cost.breakEven.calls !== 0
      || validated.cost.production.oneTime.totalHumanMinutes !== null) {
      throw new Error(`Magpie product boundary failed for ${caseId}`);
    }
    const output = validated.runEvidence.outputs.find((entry) => entry.path === "release-audit-output.json");
    const qualified = qualification.artifact.cases.find((entry) => entry.caseId === caseId);
    if (!output || !qualified || output.sha256 !== qualified.outputSha256) {
      throw new Error(`Magpie product output differs from the frozen qualified artifact: ${caseId}`);
    }
    products.push(ProductCaseSchema.parse({
      caseId,
      productDirectory,
      manifest: await digestRef(runRoot, `${productDirectory}/product-manifest.json`),
      qualityEvidence: await digestRef(runRoot, `${productDirectory}/quality-evidence.json`),
      costReport: await digestRef(runRoot, `${productDirectory}/cost-report.json`),
      artifactClosureSha256: validated.manifest.artifact.closureSha256,
      outputSha256: output.sha256,
      protectedInputsPreserved: true,
      checkerPassed: true,
      breakEvenCalls: 0,
    }));
    runtimeProducts.push(product);
  }

  const report = MagpieMachineCheckedProductReportSchema.parse({
    schemaVersion: "skill-ir-magpie-machine-checked-product-demonstration/v1",
    status: "passed",
    workflowId: config.workflowId,
    completedAt,
    productExecution: {
      entrypoint: "runVerifiedArtifactCli",
      config: configReference,
      stageOrder: ["compile", "review-or-accept", "package", "run", "cost"],
      publicCases: 9,
      productsValidated: products.length,
      coreBranchDelta: 0,
    },
    historicalEvidence: {
      denominator003: config.production.originalRuntime.evidence,
      qualification: qualificationReference,
      originalRowsRerun: 0,
    },
    quality: {
      evidence: "machine-checked-fixed-public-slice-non-regression",
      productCheckerPasses: products.length,
      historicalOriginalPasses: historical.quality.originalPasses,
      historicalArtifactPasses: historical.quality.artifactPasses,
      historicalCompletePairs: historical.quality.completePairs,
      historicalPairwiseRegressions: historical.quality.pairwiseRegressions,
      historicalOriginalPassingCases: [
        "step-0-preflight/case-1-clean-pass",
        "step-1-gather-record/case-2-partial-data",
        "step-2-assemble-record/case-4-all-required-missing",
      ],
      upstreamJudgeSemanticEquivalence: "not-established",
      originalPassRateDisposition: "not-an-upstream-skill-score",
    },
    tokenEconomics: {
      scope: "explicit-production-api-input-plus-output-tokens-only",
      originalSamples: historical.runtimeCost.original.samples,
      originalAggregateInputTokens: historical.runtimeCost.original.aggregateInputTokens,
      originalAggregateOutputTokens: historical.runtimeCost.original.aggregateOutputTokens,
      originalAggregateCacheReadTokensDisclosedSeparately: historical.runtimeCost.original.aggregateCacheReadTokens,
      originalAggregateCacheWriteTokensDisclosedSeparately: historical.runtimeCost.original.aggregateCacheWriteTokens,
      originalMeanInputPlusOutputTokensPerRun: historical.runtimeCost.original.meanInputPlusOutputTokens,
      artifactModelTokensPerRun: historical.runtimeCost.artifact.aggregateModelTokens,
      oneTimeExplicitProductionApiModelTokens: historical.runtimeCost.explicitProductionApiModelTokens,
      conditionalBreakEvenCalls: historical.runtimeCost.conditionalExplicitApiTokenBreakEven.calls,
      firstRecurringRunNetPositive: historical.runtimeCost.conditionalExplicitApiTokenBreakEven.firstRecurringRunNetPositive,
    },
    adaptationCost: {
      adapterPhysicalLoc: qualification.artifact.totalAdapterPhysicalLoc,
      checkerPhysicalLoc: qualification.checker.implementationPhysicalLoc,
      humanMinutes: qualification.effort.humanReview.humanMinutes,
      taskDeclarationAuthoringHumanMinutes: config.taskDescription.authoring.humanMinutes,
      developmentAgentTokens: "not-observable",
      totalCost: "not-computable",
    },
    currentStageAccounting: {
      apiCalls: 0,
      modelCalls: 0,
      paidCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
      historicalOriginalRowsRerun: 0,
      historicalOriginalRowsDigestBound: historical.denominator.paidOriginalRows,
    },
    researchEligibility: "not-eligible",
    products,
    authorizations: {
      portfolioMutation: false,
      readinessMutation: false,
      heldOut: false,
      liveSource: false,
      p2Started: false,
    },
    claimBoundary: "The conditional 0-call break-even counts explicitly metered production API input+output tokens only; 40960 cache-read tokens are disclosed separately and excluded conservatively. Machine-checked means non-regression against the independent fixed public checker, not semantic equivalence to the upstream LLM judge and not an original-skill 33% score. Development-agent tokens and historical human review are unobservable, so this product is not research efficiency-positive and cannot promote portfolio/readiness, held-out, live-source, or cross-project claims.",
  });
  await writeJsonAtomic(join(runRoot, "report.json"), report);
  return { report, products: runtimeProducts };
}

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rootDir = resolve(flag(args, "root") ?? process.cwd());
  const runRoot = flag(args, "out");
  const completedAt = flag(args, "completed-at");
  if (!runRoot || !completedAt) throw new Error("Magpie product recipe requires --out and --completed-at");
  const result = await runMagpieVerifiedArtifactProduct({
    rootDir,
    runRoot: resolve(rootDir, runRoot),
    completedAt,
  });
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}
