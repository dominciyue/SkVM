import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const SourceClosureEntrySchema = z.object({
  path: SafeRelativePathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

const CandidateSourceSchema = z.object({
  repository: z.string().url(),
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
  upstreamPath: SafeRelativePathSchema,
  importedSkillPath: SafeRelativePathSchema,
  repositoryLicensePath: SafeRelativePathSchema,
  declaredLicense: z.string().min(1),
  repositoryLicense: z.string().min(1),
  attributionRequired: z.boolean(),
  closure: z.array(SourceClosureEntrySchema).min(1),
}).strict().superRefine((source, context) => {
  const paths = source.closure.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["closure"], message: "source closure paths must be unique" });
  }
});

const REQUIRED_PRE_PAID = [
  "public-json-contract-audit",
  "evaluator-pointer-closure",
  "contribution-identifiability-audit",
  "deterministic-scorer-canary",
  "prospective-construction-cost-identity",
  "qualification-lock",
] as const;

const RequiredPrePaidSchema = z.enum(REQUIRED_PRE_PAID);

const REQUIRED_PROHIBITIONS = [
  "paid-execution-before-preflight",
  "held-out",
  "post-hoc-contract-repair",
  "retry-selection",
  "readiness-promotion",
] as const;

const ProhibitionSchema = z.enum(REQUIRED_PROHIBITIONS);

const DevelopmentIntentSchema = z.object({
  taskCount: z.literal(2),
  repetitionsPerTask: z.literal(2),
  retries: z.literal(0),
  modelSystems: z.tuple([
    z.literal("no-skill"),
    z.literal("original"),
    z.literal("ir-static"),
  ]),
  deterministicSystems: z.tuple([z.literal("validated-artifact")]),
  rowReuse: z.literal("same-lock-forward-only"),
  maximumPaidCallsBeforeDynamic: z.number().int().positive(),
  conditionalDynamicPaidCalls: z.number().int().positive(),
}).strict().superRefine((intent, context) => {
  const expectedPaid = intent.taskCount * intent.repetitionsPerTask * intent.modelSystems.length;
  if (intent.maximumPaidCallsBeforeDynamic !== expectedPaid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximumPaidCallsBeforeDynamic"],
      message: "paid call ceiling must equal one forward-only row per task, repetition, and model system",
    });
  }
  const expectedDynamic = intent.taskCount * intent.repetitionsPerTask;
  if (intent.conditionalDynamicPaidCalls !== expectedDynamic) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["conditionalDynamicPaidCalls"],
      message: "conditional dynamic paid call ceiling must equal one dynamic arm",
    });
  }
});

const SelectionRationaleSchema = z.object({
  informationComplementarity: z.literal("high"),
  deterministicScorerFeasibility: z.literal("high"),
  infrastructureRisk: z.enum(["low", "medium"]),
  expectedArtifactRoute: z.literal("direct-deterministic-artifact"),
  dynamicIsResidualDriven: z.literal(true),
}).strict();

function requireExactSet(
  values: readonly string[],
  expected: readonly string[],
  context: z.RefinementCtx,
  pathName: string,
): void {
  const observed = new Set(values);
  if (observed.size !== values.length
    || observed.size !== expected.length
    || expected.some((entry) => !observed.has(entry))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [pathName],
      message: `${pathName} must freeze every required paid precondition or prohibition exactly once`,
    });
  }
}

export const ProspectiveQualityCandidatePolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-quality-candidate-policy/v1"),
  selectionId: z.string().regex(/^[a-z0-9][a-z0-9-]+$/u),
  selectedAt: z.string().datetime(),
  selectionBoundary: z.literal("before-benchmark-contract"),
  selectedSkillId: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  targetPhenotype: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  source: CandidateSourceSchema,
  selectionRationale: SelectionRationaleSchema,
  developmentIntent: DevelopmentIntentSchema,
  requiredBeforePaidExecution: z.array(RequiredPrePaidSchema),
  prohibited: z.array(ProhibitionSchema),
}).strict().superRefine((policy, context) => {
  requireExactSet(policy.requiredBeforePaidExecution, REQUIRED_PRE_PAID, context, "requiredBeforePaidExecution");
  requireExactSet(policy.prohibited, REQUIRED_PROHIBITIONS, context, "prohibited");
});

const IntakeSchema = z.object({
  schemaVersion: z.literal("skill-ir-intake/v1"),
  sources: z.array(z.object({
    id: z.string().min(1),
    repositoryUrl: z.string().url(),
    commit: z.string().regex(/^[a-f0-9]{40}$/u),
    licenseStatus: z.string().min(1),
    license: z.string().nullable(),
  }).passthrough()),
  candidates: z.array(z.object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    sourcePath: SafeRelativePathSchema,
    status: z.string().min(1),
    licenseStatus: z.string().min(1),
    license: z.string().nullable(),
  }).passthrough()),
}).passthrough();

export const ProspectiveQualityCandidateReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-quality-candidate-report/v1"),
  selectionId: z.string().min(1),
  selectedAt: z.string().datetime(),
  selectionBoundary: z.literal("before-benchmark-contract"),
  selectedSkillId: z.string().min(1),
  targetPhenotype: z.string().min(1),
  sourceBinding: CandidateSourceSchema,
  selectionRationale: SelectionRationaleSchema,
  developmentIntent: DevelopmentIntentSchema,
  requiredBeforePaidExecution: z.array(RequiredPrePaidSchema),
  gates: z.object({
    selectedFromVerifiedIntake: z.literal(true),
    exactSourceClosure: z.literal(true),
    dualLicenseBinding: z.literal(true),
    selectedBeforeBenchmarkContract: z.literal(true),
    prePaidRequirementsFrozen: z.literal(true),
    forwardOnlyRowReuse: z.literal(true),
    prospectiveCostCaptureRequired: z.literal(true),
  }).strict(),
  authorizations: z.object({
    paidExecution: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  paidCallCeiling: z.object({
    beforeDynamic: z.number().int().positive(),
    conditionalDynamic: z.number().int().positive(),
  }).strict(),
  readinessImpact: z.object({
    changesStudiedCaseCount: z.literal(false),
    changesContractQualifiedCount: z.literal(false),
  }).strict(),
  nextStage: z.literal("public-contract-and-disclosure"),
}).strict();

export type ProspectiveQualityCandidatePolicy = z.infer<typeof ProspectiveQualityCandidatePolicySchema>;
export type ProspectiveQualityCandidateReport = z.infer<typeof ProspectiveQualityCandidateReportSchema>;

type EvaluationInput = {
  rootDir: string;
  intake: unknown;
  policy: unknown;
};

function containedPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`source closure path escapes root: ${relativePath}`);
  }
  return target;
}

export async function evaluateProspectiveQualityCandidate(
  input: EvaluationInput,
): Promise<ProspectiveQualityCandidateReport> {
  const intake = IntakeSchema.parse(input.intake);
  const policy = ProspectiveQualityCandidatePolicySchema.parse(input.policy);
  const candidate = intake.candidates.find((entry) => entry.id === policy.selectedSkillId);
  if (!candidate || candidate.status !== "prospective-quality-candidate") {
    throw new Error("selected intake entry must have prospective-quality-candidate status");
  }
  if (candidate.licenseStatus !== "verified" || candidate.license !== policy.source.declaredLicense) {
    throw new Error("selected candidate declared license is not verified against policy");
  }
  const source = intake.sources.find((entry) => entry.id === candidate.sourceId);
  if (!source || source.licenseStatus !== "verified" || source.license !== policy.source.repositoryLicense) {
    throw new Error("selected candidate repository license is not verified against policy");
  }
  if (policy.source.repository !== source.repositoryUrl
    || policy.source.commit !== source.commit
    || policy.source.upstreamPath !== candidate.sourcePath) {
    throw new Error("selected quality candidate upstream identity does not match intake");
  }

  for (const closure of policy.source.closure) {
    const absolutePath = containedPath(input.rootDir, closure.path);
    const stat = await lstat(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`source closure member must be a regular non-symlink file: ${closure.path}`);
    }
    if (sha256Bytes(await readFile(absolutePath)) !== closure.sha256) {
      throw new Error(`source closure digest mismatch: ${closure.path}`);
    }
  }

  const closurePaths = new Set(policy.source.closure.map((entry) => entry.path));
  if (!closurePaths.has(policy.source.importedSkillPath)
    || !closurePaths.has(policy.source.repositoryLicensePath)) {
    throw new Error("source closure must bind the imported skill and repository license");
  }
  const skillText = await readFile(containedPath(input.rootDir, policy.source.importedSkillPath), "utf8");
  const localReferences = new Set(skillText.match(/\b(?:references|scripts)\/[A-Za-z0-9._/-]+/gu) ?? []);
  const importedSourceRoot = path.posix.dirname(policy.source.importedSkillPath);
  const requiredClosure = new Set([
    policy.source.importedSkillPath,
    policy.source.repositoryLicensePath,
    ...[...localReferences].map((entry) => path.posix.join(importedSourceRoot, entry)),
  ]);
  if (closurePaths.size !== requiredClosure.size
    || [...requiredClosure].some((entry) => !closurePaths.has(entry))) {
    throw new Error("source closure must contain exactly every direct local skill reference");
  }

  return ProspectiveQualityCandidateReportSchema.parse({
    schemaVersion: "skill-ir-prospective-quality-candidate-report/v1",
    selectionId: policy.selectionId,
    selectedAt: policy.selectedAt,
    selectionBoundary: policy.selectionBoundary,
    selectedSkillId: policy.selectedSkillId,
    targetPhenotype: policy.targetPhenotype,
    sourceBinding: policy.source,
    selectionRationale: policy.selectionRationale,
    developmentIntent: policy.developmentIntent,
    requiredBeforePaidExecution: policy.requiredBeforePaidExecution,
    gates: {
      selectedFromVerifiedIntake: true,
      exactSourceClosure: true,
      dualLicenseBinding: true,
      selectedBeforeBenchmarkContract: true,
      prePaidRequirementsFrozen: true,
      forwardOnlyRowReuse: true,
      prospectiveCostCaptureRequired: true,
    },
    authorizations: { paidExecution: false, heldOut: false, readinessPromotion: false },
    paidCallCeiling: {
      beforeDynamic: policy.developmentIntent.maximumPaidCallsBeforeDynamic,
      conditionalDynamic: policy.developmentIntent.conditionalDynamicPaidCalls,
    },
    readinessImpact: { changesStudiedCaseCount: false, changesContractQualifiedCount: false },
    nextStage: "public-contract-and-disclosure",
  });
}

export async function writeProspectiveQualityCandidateReport(
  input: EvaluationInput & { outputPath: string },
): Promise<ProspectiveQualityCandidateReport> {
  const report = await evaluateProspectiveQualityCandidate(input);
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true });
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
