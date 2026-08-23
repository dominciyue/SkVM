import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "./artifact-package.ts";
import { MethodPortfolioSchema } from "./method-portfolio.ts";
import { sha256Bytes } from "./source-fixture.ts";

const CandidateAssessmentSchema = z.object({
  skillId: z.string().min(1),
  source: z.enum(["method-portfolio", "intake"]),
  informationComplementarity: z.enum(["high", "medium", "low"]),
  deterministicScorerFeasibility: z.enum(["high", "medium", "low"]),
  infrastructureRisk: z.enum(["high", "medium", "low"]),
  exclusionReason: z.string().min(1).nullable(),
}).strict();

const DevelopmentIntentSchema = z.object({
  systems: z.tuple([z.literal("original"), z.literal("ir-static")]),
  taskCount: z.literal(2),
  repetitionsPerTask: z.literal(2),
  retries: z.literal(0),
  initialPaidCallBudget: z.number().int().positive(),
  conditionalDynamicPaidCallBudget: z.number().int().positive(),
  stability: z.object({
    minDistinctTasks: z.literal(2),
    minRepetitionsPerTask: z.literal(2),
  }).strict(),
  dynamicEntry: z.literal("eligible-dual-source-admission-only"),
}).strict().superRefine((intent, context) => {
  const initialBudget = intent.systems.length * intent.taskCount * intent.repetitionsPerTask;
  if (intent.initialPaidCallBudget !== initialBudget) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "initial paid call budget does not match the frozen denominator" });
  }
  const dynamicBudget = intent.taskCount * intent.repetitionsPerTask;
  if (intent.conditionalDynamicPaidCallBudget !== dynamicBudget) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "conditional paid call budget does not match one dynamic arm" });
  }
});

const ProhibitedActionSchema = z.enum([
  "paid-execution-before-contract-lock",
  "held-out",
  "post-hoc-repair-mapping",
  "retry-selection",
  "readiness-promotion",
]);

const REQUIRED_PROHIBITIONS = ProhibitedActionSchema.options;

const CandidateSourceSchema = z.object({
  repository: z.string().url(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  upstreamPath: SafeRelativePathSchema,
  license: z.literal("MIT"),
  closure: z.array(z.object({
    path: SafeRelativePathSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1),
}).strict();

export const ProspectiveDynamicCandidatePolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-dynamic-candidate-policy/v1"),
  selectionId: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  selectedAt: z.string().datetime(),
  selectionBoundary: z.literal("before-benchmark-contract"),
  selectedSkillId: z.string().min(1),
  targetPhenotype: z.string().min(1),
  source: CandidateSourceSchema,
  assessments: z.array(CandidateAssessmentSchema).min(1),
  developmentIntent: DevelopmentIntentSchema,
  prohibited: z.array(ProhibitedActionSchema),
}).strict().superRefine((policy, context) => {
  const assessments = new Set<string>();
  for (const [index, assessment] of policy.assessments.entries()) {
    if (assessments.has(assessment.skillId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate candidate assessment: ${assessment.skillId}`,
        path: ["assessments", index],
      });
    }
    assessments.add(assessment.skillId);
    if (assessment.skillId !== policy.selectedSkillId && assessment.exclusionReason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "non-selected candidate requires an exclusion reason",
        path: ["assessments", index, "exclusionReason"],
      });
    }
  }
  const selected = policy.assessments.filter((assessment) => assessment.skillId === policy.selectedSkillId);
  if (selected.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selection requires exactly one selected candidate assessment" });
  } else if (selected[0]!.exclusionReason !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selected candidate cannot have an exclusion reason" });
  }
  const closurePaths = policy.source.closure.map((entry) => entry.path);
  if (new Set(closurePaths).size !== closurePaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "source closure contains duplicate paths" });
  }
  const prohibitions = new Set(policy.prohibited);
  if (prohibitions.size !== policy.prohibited.length
    || REQUIRED_PROHIBITIONS.some((entry) => !prohibitions.has(entry))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selection policy must freeze every required prohibition exactly once" });
  }
});

const IntakeSchema = z.object({
  schemaVersion: z.literal("skill-ir-intake/v1"),
  sources: z.array(z.object({
    id: z.string().min(1),
    repositoryUrl: z.string().url(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
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

export const ProspectiveDynamicCandidateReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-dynamic-candidate-report/v1"),
  selectionId: z.string().min(1),
  selectedAt: z.string().datetime(),
  selectionBoundary: z.literal("before-benchmark-contract"),
  selectedSkillId: z.string().min(1),
  targetPhenotype: z.string().min(1),
  candidateCount: z.number().int().positive(),
  candidates: z.array(CandidateAssessmentSchema).min(1),
  sourceBinding: CandidateSourceSchema,
  developmentIntent: DevelopmentIntentSchema,
  gates: z.object({
    beforeBenchmarkContract: z.literal(true),
    selectedFromVerifiedIntake: z.literal(true),
    exactSourceClosure: z.literal(true),
    candidateSetComplete: z.literal(true),
    noReadinessPromotion: z.literal(true),
  }).strict(),
  authorizations: z.object({
    paidExecution: z.literal(false),
    dynamicProfile: z.literal(false),
    heldOut: z.literal(false),
  }).strict(),
  readinessImpact: z.object({
    changesStudiedCaseCount: z.literal(false),
    changesContractQualifiedCount: z.literal(false),
  }).strict(),
  nextStage: z.literal("benchmark-contract"),
}).strict();

export type ProspectiveDynamicCandidatePolicy = z.infer<typeof ProspectiveDynamicCandidatePolicySchema>;
export type ProspectiveDynamicCandidateReport = z.infer<typeof ProspectiveDynamicCandidateReportSchema>;

type EvaluationInput = {
  rootDir: string;
  portfolio: unknown;
  intake: unknown;
  policy: unknown;
};

function containedPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`source closure path escapes root: ${relativePath}`);
  }
  return absolute;
}

export async function evaluateProspectiveDynamicCandidate(
  input: EvaluationInput,
): Promise<ProspectiveDynamicCandidateReport> {
  const portfolio = MethodPortfolioSchema.parse(input.portfolio);
  const intake = IntakeSchema.parse(input.intake);
  const policy = ProspectiveDynamicCandidatePolicySchema.parse(input.policy);
  const methodCases = portfolio.cases.filter((entry) => entry.role === "method-development");
  const prospective = intake.candidates.filter((entry) => (
    entry.status === "prospective-dynamic-candidate"
    || (entry.id === policy.selectedSkillId && entry.status === "prospective-measurement-invalid")
  ));
  const expectedCandidates = new Map<string, "method-portfolio" | "intake">();
  for (const entry of methodCases) expectedCandidates.set(entry.skillId, "method-portfolio");
  for (const entry of prospective) {
    if (expectedCandidates.has(entry.id)) {
      throw new Error(`prospective candidate already changes the method portfolio denominator: ${entry.id}`);
    }
    expectedCandidates.set(entry.id, "intake");
  }
  const assessed = new Map(policy.assessments.map((entry) => [entry.skillId, entry.source]));
  if (assessed.size !== expectedCandidates.size
    || [...expectedCandidates].some(([skillId, source]) => assessed.get(skillId) !== source)) {
    throw new Error("selection candidate set must exactly cover method-development cases and prospective intake candidates");
  }

  const candidate = prospective.find((entry) => entry.id === policy.selectedSkillId);
  if (!candidate || candidate.licenseStatus !== "verified" || candidate.license !== "MIT") {
    throw new Error("selected prospective candidate requires a verified MIT intake license");
  }
  const source = intake.sources.find((entry) => entry.id === candidate.sourceId);
  if (!source || source.licenseStatus !== "verified" || source.license !== "MIT") {
    throw new Error("selected prospective candidate requires a verified MIT source license");
  }
  if (policy.source.repository !== source.repositoryUrl
    || policy.source.commit !== source.commit
    || policy.source.upstreamPath !== candidate.sourcePath) {
    throw new Error("selected prospective candidate upstream identity does not match intake");
  }

  for (const closure of policy.source.closure) {
    const absolute = containedPath(input.rootDir, closure.path);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`source closure member must be a regular non-symlink file: ${closure.path}`);
    }
    if (sha256Bytes(await readFile(absolute)) !== closure.sha256) {
      throw new Error(`source closure digest mismatch: ${closure.path}`);
    }
  }

  return ProspectiveDynamicCandidateReportSchema.parse({
    schemaVersion: "skill-ir-prospective-dynamic-candidate-report/v1",
    selectionId: policy.selectionId,
    selectedAt: policy.selectedAt,
    selectionBoundary: policy.selectionBoundary,
    selectedSkillId: policy.selectedSkillId,
    targetPhenotype: policy.targetPhenotype,
    candidateCount: policy.assessments.length,
    candidates: policy.assessments,
    sourceBinding: policy.source,
    developmentIntent: policy.developmentIntent,
    gates: {
      beforeBenchmarkContract: true,
      selectedFromVerifiedIntake: true,
      exactSourceClosure: true,
      candidateSetComplete: true,
      noReadinessPromotion: true,
    },
    authorizations: { paidExecution: false, dynamicProfile: false, heldOut: false },
    readinessImpact: { changesStudiedCaseCount: false, changesContractQualifiedCount: false },
    nextStage: "benchmark-contract",
  });
}

export async function writeProspectiveDynamicCandidateReport(
  input: EvaluationInput & { outputPath: string },
): Promise<ProspectiveDynamicCandidateReport> {
  const report = await evaluateProspectiveDynamicCandidate(input);
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true });
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
