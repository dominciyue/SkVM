import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair";
import { ReviewRequiredReportSchema } from "./review-required";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(260).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

export const ReviewedAotConstructionCostPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-construction-cost-policy/v1"),
  auditId: IdentifierSchema,
  caseId: IdentifierSchema,
  reviewReport: DigestRefSchema,
  productionAllocation: z.object({
    compileIncludes: z.tuple([
      z.literal("automatic-domain-plan-synthesis"),
      z.literal("deterministic-review-bundle-compile"),
    ]),
    humanReviewDisposition: z.literal("separate-non-token-adaptation-cost"),
    profileDisposition: z.literal("not-applicable-profile-empty"),
    packageDisposition: z.literal("deterministic-assembly"),
  }).strict(),
  authorization: z.object({
    maximumPaidCalls: z.literal(0),
    nextStep: z.literal("freeze-eight-row-policy-only"),
  }).strict(),
}).strict();

export type ReviewedAotConstructionCostPolicy = z.infer<typeof ReviewedAotConstructionCostPolicySchema>;

const StageSchema = z.object({
  modelCalls: z.number().int().nonnegative(),
  modelTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict();

export const ReviewedAotConstructionCostReadinessReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-construction-cost-readiness/v1"),
  auditId: IdentifierSchema,
  caseId: IdentifierSchema,
  status: z.enum(["ready-to-freeze-efficiency-identity", "construction-cost-source-incomplete"]),
  policySha256: Sha256Schema,
  evidence: z.object({
    reviewReport: DigestRefSchema,
    verifiedTransitiveRefs: z.array(DigestRefSchema).min(1),
    allDigestsVerified: z.boolean(),
  }).strict(),
  qualityEvidence: z.object({
    equivalent: z.boolean(),
    reviewedPassedCriteria: z.number().int().nonnegative(),
    criterionCount: z.number().int().positive(),
    fullParityTasks: z.number().int().nonnegative(),
    protectedInputsPreserved: z.boolean(),
    exactOutputDelta: z.boolean(),
    infrastructureFailures: z.number().int().nonnegative(),
  }).strict(),
  productionOneTime: z.object({
    components: z.object({
      synthesis: StageSchema.extend({ evidence: DigestRefSchema }),
      reviewPatch: StageSchema.extend({
        humanMinutes: z.number().nonnegative(),
        physicalLoc: z.number().int().positive(),
        disposition: z.literal("separate-non-token-adaptation-cost"),
      }),
      compile: StageSchema,
      profile: StageSchema.extend({ disposition: z.literal("not-applicable-profile-empty") }),
      package: StageSchema.extend({ bytes: z.number().int().positive(), disposition: z.literal("deterministic-assembly") }),
    }).strict(),
    builderMapping: z.object({
      compileModelTokens: z.number().int().nonnegative(),
      profileModelTokens: z.number().int().nonnegative(),
      packageModelTokens: z.number().int().nonnegative(),
    }).strict(),
    missing: z.array(z.string().min(1)),
    complete: z.boolean(),
  }).strict(),
  adaptation: z.object({
    humanMinutes: z.number().nonnegative(),
    adapterLoc: z.number().int().positive(),
    coreBranchDelta: z.number().int().nonnegative(),
    humanTimeIncludedInBreakEvenTokens: z.literal(false),
  }).strict(),
  futureMeasurementRequired: z.tuple([
    z.literal("eight-row recurring original-versus-reviewed-aot runtime"),
    z.literal("research all-attempt cost ledger"),
  ]),
  authorization: z.object({
    freezeEightRowPolicy: z.boolean(),
    paidMatrixExecution: z.literal(false),
    efficiencyClaim: z.literal(false),
    paidCallsUsed: z.literal(0),
  }).strict(),
  claimBoundary: z.literal("Break-even may use production AOT model tokens only; human review and research all-attempt cost remain separate disclosed ledgers."),
}).strict().superRefine((report, context) => {
  const ready = report.qualityEvidence.equivalent
    && report.productionOneTime.complete
    && report.productionOneTime.missing.length === 0;
  if ((report.status === "ready-to-freeze-efficiency-identity") !== ready
    || report.authorization.freezeEightRowPolicy !== ready) {
    context.addIssue({ code: "custom", message: "construction-cost readiness authorization is not derivable" });
  }
});

export type ReviewedAotConstructionCostReadinessReport = z.infer<
  typeof ReviewedAotConstructionCostReadinessReportSchema
>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const path = containedPath(rootDir, ref.path);
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`evidence must be a regular non-symlink file: ${ref.path}`);
  const bytes = await readFile(path);
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function uniqueRefs(refs: Array<z.infer<typeof DigestRefSchema>>): Array<z.infer<typeof DigestRefSchema>> {
  const byPath = new Map<string, z.infer<typeof DigestRefSchema>>();
  for (const ref of refs) {
    const existing = byPath.get(ref.path);
    if (existing && existing.sha256 !== ref.sha256) throw new Error(`conflicting digest claims for ${ref.path}`);
    byPath.set(ref.path, ref);
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export async function auditReviewedAotConstructionCost(options: {
  rootDir: string;
  policy: ReviewedAotConstructionCostPolicy;
  outputPath?: string;
}): Promise<ReviewedAotConstructionCostReadinessReport> {
  const rootDir = resolve(options.rootDir);
  const policy = ReviewedAotConstructionCostPolicySchema.parse(options.policy);
  const reviewBytes = await readPinned(rootDir, policy.reviewReport);
  const review = ReviewRequiredReportSchema.parse(JSON.parse(reviewBytes.toString("utf8")));
  if (review.caseId !== policy.caseId) throw new Error("review evidence case identity drift");

  const transitiveRefs = uniqueRefs([
    ...Object.values(review.inputs),
    ...review.implementation,
    { path: review.patch.path, sha256: review.patch.sha256 },
    review.construction.synthesis.evidence,
  ]);
  const transitiveBytes = new Map<string, Buffer>();
  for (const ref of transitiveRefs) transitiveBytes.set(ref.path, await readPinned(rootDir, ref));

  const synthesisBytes = transitiveBytes.get(review.construction.synthesis.evidence.path);
  if (!synthesisBytes) throw new Error("synthesis evidence was not verified");
  const synthesis = GenericDomainPlanRepairReportSchema.parse(JSON.parse(synthesisBytes.toString("utf8")));
  const synthesisTokens = synthesis.tokens ? synthesis.tokens.input + synthesis.tokens.output : null;
  if (synthesis.summary.paidCalls !== review.construction.synthesis.modelCalls
    || synthesisTokens !== review.construction.synthesis.modelTokens
    || synthesis.durationMs !== review.construction.synthesis.durationMs) {
    throw new Error("review synthesis cost does not rederive from automatic evidence");
  }

  const patchText = transitiveBytes.get(review.patch.path)?.toString("utf8");
  if (!patchText) throw new Error("review patch source was not verified");
  const physicalLoc = patchText.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
  if (physicalLoc !== review.patch.physicalLoc
    || review.construction.reviewPatch.physicalLoc !== review.patch.physicalLoc
    || review.construction.reviewPatch.humanMinutes !== review.patch.humanMinutes) {
    throw new Error("review adaptation accounting does not rederive from source and report");
  }

  const reviewedPassedCriteria = review.tasks.reduce((sum, task) =>
    sum + task.reviewed.criteria.filter((criterion) => criterion.status === "pass").length, 0);
  const criterionCount = review.tasks.reduce((sum, task) => sum + task.reviewed.criteria.length, 0);
  const fullParityTasks = review.tasks.filter((task) => task.fullReviewedParity).length;
  const protectedInputsPreserved = review.tasks.every((task) =>
    task.protectedInputsPreservedAfterAutomatic && task.protectedInputsPreservedAfterReview);
  const exactOutputDelta = review.tasks.every((task) =>
    task.automaticPlan.exactOutputDelta && task.reviewPatch.exactOutputDelta);
  const infrastructureFailures = review.tasks.reduce((sum, task) => sum
    + task.reviewed.criteria.filter((criterion) => criterion.status === "infrastructure-failure").length, 0);
  const qualityEquivalent = reviewedPassedCriteria === criterionCount
    && fullParityTasks === review.tasks.length
    && protectedInputsPreserved
    && exactOutputDelta
    && infrastructureFailures === 0;

  const components = {
    synthesis: review.construction.synthesis,
    reviewPatch: {
      modelCalls: review.construction.reviewPatch.modelCalls,
      modelTokens: review.construction.reviewPatch.modelTokens,
      durationMs: review.construction.reviewPatch.durationMs,
      humanMinutes: review.construction.reviewPatch.humanMinutes,
      physicalLoc: review.construction.reviewPatch.physicalLoc,
      disposition: policy.productionAllocation.humanReviewDisposition,
    },
    compile: review.construction.compile,
    profile: review.construction.profile,
    package: {
      modelCalls: review.construction.package.modelCalls,
      modelTokens: review.construction.package.modelTokens,
      durationMs: review.construction.package.durationMs,
      bytes: review.construction.package.bytes,
      disposition: policy.productionAllocation.packageDisposition,
    },
  };
  const builderMapping = {
    compileModelTokens: components.synthesis.modelTokens
      + components.reviewPatch.modelTokens + components.compile.modelTokens,
    profileModelTokens: components.profile.modelTokens,
    packageModelTokens: components.package.modelTokens,
  };
  const missing: string[] = [];
  if (review.authorization.paidCalls !== 0 || review.authorization.retries !== 0) {
    missing.push("zero-paid construction authorization");
  }
  if (review.patch.sourceAudit !== "passed") missing.push("review patch source audit");
  const complete = missing.length === 0;
  const ready = qualityEquivalent && complete;
  const report = ReviewedAotConstructionCostReadinessReportSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-construction-cost-readiness/v1",
    auditId: policy.auditId,
    caseId: policy.caseId,
    status: ready ? "ready-to-freeze-efficiency-identity" : "construction-cost-source-incomplete",
    policySha256: sha256Bytes(Buffer.from(jsonText(policy), "utf8")),
    evidence: {
      reviewReport: policy.reviewReport,
      verifiedTransitiveRefs: transitiveRefs,
      allDigestsVerified: true,
    },
    qualityEvidence: {
      equivalent: qualityEquivalent,
      reviewedPassedCriteria,
      criterionCount,
      fullParityTasks,
      protectedInputsPreserved,
      exactOutputDelta,
      infrastructureFailures,
    },
    productionOneTime: { components, builderMapping, missing, complete },
    adaptation: {
      humanMinutes: review.patch.humanMinutes,
      adapterLoc: review.patch.physicalLoc,
      coreBranchDelta: review.patch.coreBranchDelta,
      humanTimeIncludedInBreakEvenTokens: false,
    },
    futureMeasurementRequired: [
      "eight-row recurring original-versus-reviewed-aot runtime",
      "research all-attempt cost ledger",
    ],
    authorization: {
      freezeEightRowPolicy: ready,
      paidMatrixExecution: false,
      efficiencyClaim: false,
      paidCallsUsed: 0,
    },
    claimBoundary: "Break-even may use production AOT model tokens only; human review and research all-attempt cost remain separate disclosed ledgers.",
  });
  if (options.outputPath) await atomicWrite(options.outputPath, jsonText(report));
  return report;
}
