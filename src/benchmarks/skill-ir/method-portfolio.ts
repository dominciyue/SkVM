import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema } from "./artifact-package.ts"
import { readAndEvaluatePartialBenefitReentry } from "./partial-benefit-reentry.ts"

const ArtifactKindSchema = z.enum(["checks", "schemas", "scripts", "templates", "tool-plans"])
const BlockerSchema = z.enum([
  "benchmark-contract",
  "gold-leak",
  "materialization",
  "scorer-authority",
  "execution-observability",
  "heldout-regression",
  "baseline-saturation",
  "reentry-development-not-run",
  "distinguishability-not-run",
  "task-contract-not-authored",
  "baseline-regression",
  "quality-regression",
])

const LifecycleStatusSchema = z.enum(["passed", "failed", "blocked", "not-run", "invalidated"])
const LifecycleStageNameSchema = z.enum([
  "benchmarkContract",
  "baselineAdmission",
  "staticFidelity",
  "optimizedDevelopment",
  "heldOutPromotion",
])

const LifecycleStageSchema = z.object({
  status: LifecycleStatusSchema,
  evidencePath: SafeRelativePathSchema.optional(),
  blocker: BlockerSchema.optional(),
}).strict().superRefine((stage, context) => {
  if (["passed", "failed", "invalidated"].includes(stage.status) && !stage.evidencePath) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${stage.status} lifecycle stage requires evidencePath` })
  }
  if (["blocked", "invalidated"].includes(stage.status) && !stage.blocker) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${stage.status} lifecycle stage requires blocker` })
  }
})

const AdaptationEvidenceSchema = z.object({
  measurementStatus: z.enum(["historical-unavailable", "prospective-in-progress", "prospective-measured"]),
  measurementStartedAt: z.string().datetime().nullable(),
  measurementCompletedAt: z.string().datetime().nullable(),
  humanMinutes: z.number().nonnegative().nullable(),
  adapterLoc: z.number().int().nonnegative().nullable(),
  artifactKinds: z.array(ArtifactKindSchema),
  reusedArtifactKinds: z.array(ArtifactKindSchema),
  coreBranchDelta: z.number().int().nonnegative().nullable(),
  unautomatedSteps: z.array(z.string().min(1)),
}).strict().superRefine((adaptation, context) => {
  for (const artifactKind of adaptation.reusedArtifactKinds) {
    if (!adaptation.artifactKinds.includes(artifactKind)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `reused artifact kind is not declared by the case: ${artifactKind}`,
      })
    }
  }
  if (adaptation.measurementStatus === "prospective-in-progress"
    && adaptation.measurementStartedAt === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "prospective adaptation evidence requires a start timestamp" })
  }
  if (adaptation.measurementStatus === "prospective-measured" && (
    adaptation.measurementStartedAt === null
    || adaptation.measurementCompletedAt === null
    || adaptation.humanMinutes === null
    || adaptation.adapterLoc === null
    || adaptation.coreBranchDelta === null
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "prospective adaptation evidence requires timestamps and complete cost metrics",
    })
  }
})

const OptimizationEvidenceSchema = z.object({
  classification: z.enum([
    "not-established",
    "quality-positive",
    "fidelity-preserving",
    "efficiency-positive",
  ]),
  evidencePath: SafeRelativePathSchema.optional(),
  qualityComparisonComplete: z.boolean(),
  allAttemptCostComplete: z.boolean(),
  breakEvenComplete: z.boolean(),
}).strict()

const OptimizationPathSchema = z.object({
  route: z.enum([
    "dynamic-profile",
    "direct-deterministic-artifact",
    "static-sufficient",
    "stopped-before-dynamic",
  ]),
  reason: z.enum([
    "public-reproducible-residual",
    "source-contract-direct-compilation",
    "no-reproducible-residual",
    "baseline-regression",
    "baseline-saturation",
    "measurement-invalid",
    "static-quality-regression",
    "optimized-development-failed",
  ]),
}).strict().superRefine((entry, context) => {
  const allowedReasons = {
    "dynamic-profile": ["public-reproducible-residual"],
    "direct-deterministic-artifact": ["source-contract-direct-compilation"],
    "static-sufficient": ["no-reproducible-residual"],
    "stopped-before-dynamic": [
      "baseline-regression",
      "baseline-saturation",
      "measurement-invalid",
      "static-quality-regression",
      "optimized-development-failed",
    ],
  } as const
  if (!(allowedReasons[entry.route] as readonly string[]).includes(entry.reason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "optimization route and reason mismatch" })
  }
})

const PortfolioCaseSchema = z.object({
  skillId: z.string().min(1),
  upstreamIdentity: z.object({
    repository: z.string().url(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    path: SafeRelativePathSchema,
  }).strict(),
  phenotypes: z.array(z.string().min(1)).min(1),
  role: z.enum(["method-development", "untouched-candidate", "untouched-replication"]),
  methodSequence: z.number().int().positive().optional(),
  contractQualified: z.boolean(),
  benchmarkVersions: z.array(z.string().min(1)).min(1),
  optimizationEvidence: OptimizationEvidenceSchema,
  optimizationPath: OptimizationPathSchema,
  reentryPolicyPath: SafeRelativePathSchema.optional(),
  lifecycle: z.object({
    benchmarkContract: LifecycleStageSchema,
    baselineAdmission: LifecycleStageSchema,
    staticFidelity: LifecycleStageSchema,
    optimizedDevelopment: LifecycleStageSchema,
    heldOutPromotion: LifecycleStageSchema,
  }).strict(),
  legacyDevelopmentEvidence: z.object({
    status: z.enum(["passed", "failed", "blocked", "not-run"]),
    resultPath: SafeRelativePathSchema.optional(),
  }).strict().optional(),
  automation: z.object({
    generatesIr: z.boolean(),
    generatesContract: z.boolean(),
    generatesValidationPlan: z.boolean(),
    generatesPackageCandidate: z.boolean(),
  }).strict(),
  adaptation: AdaptationEvidenceSchema,
}).strict().superRefine((entry, context) => {
  if (entry.role === "method-development" && entry.methodSequence === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-development case requires methodSequence" })
  }
  if (entry.role !== "method-development" && entry.methodSequence !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "non-method case cannot carry methodSequence" })
  }
  if (entry.contractQualified !== (entry.lifecycle.benchmarkContract.status === "passed")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "contractQualified summary drift" })
  }
  const optimization = entry.optimizationEvidence
  if (optimization.classification === "not-established") {
    if (optimization.evidencePath
      || optimization.qualityComparisonComplete
      || optimization.allAttemptCostComplete
      || optimization.breakEvenComplete) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "not-established optimization evidence cannot claim completed evidence" })
    }
    if (entry.lifecycle.optimizedDevelopment.status === "passed") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "passed optimized development requires classified optimization evidence" })
    }
  } else {
    if (entry.lifecycle.optimizedDevelopment.status !== "passed" || !optimization.evidencePath) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "classified optimization evidence requires passed development evidence" })
    }
    if (!optimization.qualityComparisonComplete) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "classified optimization evidence requires a complete quality comparison" })
    }
    if (optimization.classification === "efficiency-positive"
      && (!optimization.allAttemptCostComplete || !optimization.breakEvenComplete)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "efficiency-positive requires all-attempt cost and break-even evidence" })
    }
  }
  if (entry.role === "untouched-replication" && (
    entry.adaptation.coreBranchDelta !== 0
    || entry.adaptation.unautomatedSteps.length > 0
    || !entry.contractQualified
    || entry.lifecycle.optimizedDevelopment.status !== "passed"
    || entry.lifecycle.heldOutPromotion.status !== "passed"
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "untouched replication requires qualified frozen-core execution with zero core delta",
    })
  }
})

export const MethodPortfolioSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio/v3"),
  portfolioId: z.string().min(1),
  minimumContractQualifiedCases: z.number().int().min(6),
  requiredPhenotypes: z.array(z.string().min(1)).min(1),
  cases: z.array(PortfolioCaseSchema).min(1),
}).strict().superRefine((portfolio, context) => {
  const skillIds = new Set<string>()
  const upstream = new Set<string>()
  const sequences = new Set<number>()
  for (const [index, entry] of portfolio.cases.entries()) {
    if (skillIds.has(entry.skillId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["cases", index], message: "duplicate skillId" })
    }
    skillIds.add(entry.skillId)
    const identity = `${entry.upstreamIdentity.repository}@${entry.upstreamIdentity.commit}:${entry.upstreamIdentity.path}`
    if (upstream.has(identity)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["cases", index], message: "duplicate upstream skill" })
    }
    upstream.add(identity)
    if (entry.methodSequence !== undefined) {
      if (sequences.has(entry.methodSequence)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["cases", index], message: "duplicate methodSequence" })
      }
      sequences.add(entry.methodSequence)
    }
  }
})

export type MethodPortfolio = z.infer<typeof MethodPortfolioSchema>

export const MethodSuccessorSelectionPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-method-successor-selection-policy/v1"),
  selectionId: z.string().min(1),
  selectedSkillId: z.string().min(1),
  targetPhenotype: z.string().min(1),
  selectionBoundary: z.literal("before-successor-contract"),
  assessments: z.array(z.object({
    skillId: z.string().min(1),
    artifactMechanism: z.enum(["deterministic-repair-package", "validated-artifact-package", "static-only", "none"]),
    informationComplementarity: z.enum(["high", "medium", "low"]),
    nextRequiredStage: LifecycleStageNameSchema,
    exclusionReason: z.string().min(1).nullable(),
  }).strict()).min(1),
}).strict().superRefine((policy, context) => {
  const selected = policy.assessments.filter((assessment) => assessment.skillId === policy.selectedSkillId)
  if (selected.length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selection policy requires exactly one selected assessment" })
  } else if (selected[0]!.exclusionReason !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "selected candidate cannot have an exclusion reason" })
  }
  const seen = new Set<string>()
  for (const [index, assessment] of policy.assessments.entries()) {
    if (seen.has(assessment.skillId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["assessments", index], message: "duplicate candidate assessment" })
    }
    seen.add(assessment.skillId)
    if (assessment.skillId !== policy.selectedSkillId && assessment.exclusionReason === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["assessments", index], message: "non-selected candidate requires an exclusion reason" })
    }
  }
})

export const MethodSuccessorSelectionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-successor-selection-report/v1"),
  selectionId: z.string().min(1),
  portfolioId: z.string().min(1),
  selectedSkillId: z.string().min(1),
  targetPhenotype: z.string().min(1),
  selectionBoundary: z.literal("before-successor-contract"),
  candidates: z.array(z.object({
    skillId: z.string().min(1),
    phenotypeCoverage: z.array(z.string().min(1)).min(1),
    benchmarkContractStatus: LifecycleStatusSchema,
    baselineAdmissionStatus: LifecycleStatusSchema,
    artifactMechanism: z.enum(["deterministic-repair-package", "validated-artifact-package", "static-only", "none"]),
    informationComplementarity: z.enum(["high", "medium", "low"]),
    nextRequiredStage: LifecycleStageNameSchema,
    exclusionReason: z.string().min(1).nullable(),
  }).strict()).min(1),
}).strict()

export type MethodSuccessorSelectionPolicy = z.infer<typeof MethodSuccessorSelectionPolicySchema>
export type MethodSuccessorSelectionReport = z.infer<typeof MethodSuccessorSelectionReportSchema>

export function evaluateMethodSuccessorSelection(
  portfolioInput: unknown,
  policyInput: unknown,
): MethodSuccessorSelectionReport {
  const portfolio = MethodPortfolioSchema.parse(portfolioInput)
  const policy = MethodSuccessorSelectionPolicySchema.parse(policyInput)
  const methodCases = portfolio.cases
    .filter((entry) => entry.role === "method-development")
    .sort((a, b) => a.methodSequence! - b.methodSequence!)
  const assessmentBySkill = new Map(policy.assessments.map((assessment) => [assessment.skillId, assessment]))
  if (methodCases.length !== policy.assessments.length
    || methodCases.some((entry) => !assessmentBySkill.has(entry.skillId))) {
    throw new Error("selection policy requires exactly one assessment for every method-development case")
  }
  const selected = methodCases.find((entry) => entry.skillId === policy.selectedSkillId)
  if (!selected) throw new Error("selected successor is not a method-development case")
  if (!selected.phenotypes.includes(policy.targetPhenotype)) {
    throw new Error("selected successor does not cover target phenotype")
  }

  return MethodSuccessorSelectionReportSchema.parse({
    schemaVersion: "skill-ir-method-successor-selection-report/v1",
    selectionId: policy.selectionId,
    portfolioId: portfolio.portfolioId,
    selectedSkillId: policy.selectedSkillId,
    targetPhenotype: policy.targetPhenotype,
    selectionBoundary: policy.selectionBoundary,
    candidates: methodCases.map((entry) => {
      const assessment = assessmentBySkill.get(entry.skillId)!
      return {
        skillId: entry.skillId,
        phenotypeCoverage: entry.phenotypes,
        benchmarkContractStatus: entry.lifecycle.benchmarkContract.status,
        baselineAdmissionStatus: entry.lifecycle.baselineAdmission.status,
        artifactMechanism: assessment.artifactMechanism,
        informationComplementarity: assessment.informationComplementarity,
        nextRequiredStage: assessment.nextRequiredStage,
        exclusionReason: assessment.exclusionReason,
      }
    }),
  })
}

export const MethodPortfolioReadinessReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio-readiness/v3"),
  portfolioId: z.string().min(1),
  passed: z.boolean(),
  counts: z.object({
    registeredCases: z.number().int().nonnegative(),
    studiedCases: z.number().int().nonnegative(),
    contractQualifiedMethodCases: z.number().int().nonnegative(),
    untouchedReplicationCases: z.number().int().nonnegative(),
    passedStaticFidelityCases: z.number().int().nonnegative(),
    readinessEligibleDevelopmentPhenotypes: z.number().int().nonnegative(),
    qualityPositiveDevelopmentPhenotypes: z.number().int().nonnegative(),
    efficiencyPositiveDevelopmentPhenotypes: z.number().int().nonnegative(),
    fidelityPreservingDevelopmentPhenotypes: z.number().int().nonnegative(),
    dynamicProfileCases: z.number().int().nonnegative(),
    directDeterministicArtifactCases: z.number().int().nonnegative(),
    staticSufficientCases: z.number().int().nonnegative(),
    stoppedBeforeDynamicCases: z.number().int().nonnegative(),
  }).strict(),
  gates: z.object({
    enoughQualifiedCasesAndCoverage: z.boolean(),
    lastThreeCoreBranchDeltaZero: z.boolean(),
    automationAndAdaptationConverging: z.boolean(),
    twoEvidenceQualifiedPhenotypes: z.boolean(),
    noOpenMeasurementBlockers: z.boolean(),
  }).strict(),
  gaps: z.object({
    missingQualifiedCases: z.number().int().nonnegative(),
    missingPhenotypes: z.array(z.string()),
    openMeasurementBlockers: z.array(z.object({
      skillId: z.string(),
      stage: LifecycleStageNameSchema,
      blocker: BlockerSchema,
    }).strict()),
    automationIncompleteSkills: z.array(z.string()),
  }).strict(),
}).strict()

export type MethodPortfolioReadinessReport = z.infer<typeof MethodPortfolioReadinessReportSchema>

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function evaluateMethodPortfolioReadiness(input: unknown): MethodPortfolioReadinessReport {
  const portfolio = MethodPortfolioSchema.parse(input)
  const methodCases = portfolio.cases
    .filter((entry) => entry.role === "method-development")
    .sort((a, b) => a.methodSequence! - b.methodSequence!)
  const qualified = methodCases.filter((entry) => entry.contractQualified)
  const qualifiedPhenotypes = new Set(qualified.flatMap((entry) => entry.phenotypes))
  const missingPhenotypes = portfolio.requiredPhenotypes.filter((entry) => !qualifiedPhenotypes.has(entry))
  const lastThree = qualified.slice(-3)
  const lastThreeCoreBranchDeltaZero = lastThree.length === 3
    && lastThree.every((entry) => entry.adaptation.coreBranchDelta === 0)

  const automationIncompleteSkills = qualified.filter((entry) =>
    !Object.values(entry.automation).every(Boolean)
    || entry.adaptation.humanMinutes === null
    || entry.adaptation.adapterLoc === null
  ).map((entry) => entry.skillId)
  const firstThree = qualified.slice(0, 3)
  const metricsReady = qualified.length >= 6 && automationIncompleteSkills.length === 0
  const automationAndAdaptationConverging = metricsReady
    && mean(lastThree.map((entry) => entry.adaptation.humanMinutes!))
      <= mean(firstThree.map((entry) => entry.adaptation.humanMinutes!))
    && mean(lastThree.map((entry) => entry.adaptation.adapterLoc!))
      <= mean(firstThree.map((entry) => entry.adaptation.adapterLoc!))

  const developmentEvidenceCases = qualified
    .filter((entry) => entry.lifecycle.baselineAdmission.status === "passed"
      && entry.lifecycle.optimizedDevelopment.status === "passed")
  const evidencePhenotypes = (classification: "quality-positive" | "efficiency-positive" | "fidelity-preserving") =>
    new Set(developmentEvidenceCases
      .filter((entry) => entry.optimizationEvidence.classification === classification)
      .flatMap((entry) => entry.phenotypes))
  const qualityPositivePhenotypes = evidencePhenotypes("quality-positive")
  const efficiencyPositivePhenotypes = evidencePhenotypes("efficiency-positive")
  const fidelityPreservingPhenotypes = evidencePhenotypes("fidelity-preserving")
  const readinessEligiblePhenotypes = new Set(developmentEvidenceCases
    .filter((entry) => entry.optimizationEvidence.classification === "quality-positive"
      || entry.optimizationEvidence.classification === "efficiency-positive")
    .flatMap((entry) => entry.phenotypes))
  const measurementBlockers = new Set([
    "benchmark-contract",
    "gold-leak",
    "materialization",
    "scorer-authority",
    "execution-observability",
  ])
  const lifecycleStages = [
    "benchmarkContract",
    "baselineAdmission",
    "staticFidelity",
    "optimizedDevelopment",
    "heldOutPromotion",
  ] as const
  const openMeasurementBlockers = methodCases.flatMap((entry) => {
    const stage = lifecycleStages.find((candidate) => entry.lifecycle[candidate].status !== "passed")
    if (!stage) return []
    const blocker = entry.lifecycle[stage].blocker
    return blocker && measurementBlockers.has(blocker) ? [{ skillId: entry.skillId, stage, blocker }] : []
  })
  const gates = {
    enoughQualifiedCasesAndCoverage: qualified.length >= portfolio.minimumContractQualifiedCases
      && missingPhenotypes.length === 0,
    lastThreeCoreBranchDeltaZero,
    automationAndAdaptationConverging,
    twoEvidenceQualifiedPhenotypes: readinessEligiblePhenotypes.size >= 2,
    noOpenMeasurementBlockers: openMeasurementBlockers.length === 0,
  }
  return MethodPortfolioReadinessReportSchema.parse({
    schemaVersion: "skill-ir-method-portfolio-readiness/v3",
    portfolioId: portfolio.portfolioId,
    passed: Object.values(gates).every(Boolean),
    counts: {
      registeredCases: portfolio.cases.length,
      studiedCases: methodCases.length,
      contractQualifiedMethodCases: qualified.length,
      untouchedReplicationCases: portfolio.cases.filter((entry) => entry.role === "untouched-replication").length,
      passedStaticFidelityCases: qualified.filter((entry) => entry.lifecycle.staticFidelity.status === "passed").length,
      readinessEligibleDevelopmentPhenotypes: readinessEligiblePhenotypes.size,
      qualityPositiveDevelopmentPhenotypes: qualityPositivePhenotypes.size,
      efficiencyPositiveDevelopmentPhenotypes: efficiencyPositivePhenotypes.size,
      fidelityPreservingDevelopmentPhenotypes: fidelityPreservingPhenotypes.size,
      dynamicProfileCases: methodCases.filter((entry) => entry.optimizationPath.route === "dynamic-profile").length,
      directDeterministicArtifactCases: methodCases.filter((entry) => entry.optimizationPath.route === "direct-deterministic-artifact").length,
      staticSufficientCases: methodCases.filter((entry) => entry.optimizationPath.route === "static-sufficient").length,
      stoppedBeforeDynamicCases: methodCases.filter((entry) => entry.optimizationPath.route === "stopped-before-dynamic").length,
    },
    gates,
    gaps: {
      missingQualifiedCases: Math.max(0, portfolio.minimumContractQualifiedCases - qualified.length),
      missingPhenotypes,
      openMeasurementBlockers,
      automationIncompleteSkills,
    },
  })
}

export async function readMethodPortfolio(input: {
  rootDir: string
  portfolioPath: string
}): Promise<MethodPortfolio> {
  const portfolio = MethodPortfolioSchema.parse(JSON.parse(await readFile(path.resolve(input.portfolioPath), "utf8")))
  const root = path.resolve(input.rootDir)
  for (const entry of portfolio.cases) {
    if (!entry.reentryPolicyPath) continue
    const absolute = path.resolve(root, ...entry.reentryPolicyPath.split("/"))
    const relative = path.relative(root, absolute)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`portfolio re-entry policy escapes root: ${entry.skillId}`)
    }
    const stat = await lstat(absolute)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`portfolio re-entry policy is not a regular file: ${entry.skillId}`)
    const report = await readAndEvaluatePartialBenefitReentry({ rootDir: root, policyPath: absolute })
    if (!report.admitted || report.skillId !== entry.skillId || entry.role !== "method-development") {
      throw new Error(`portfolio re-entry policy did not admit method development: ${entry.skillId}`)
    }
  }
  return portfolio
}

export async function writeMethodPortfolioReadinessReport(input: {
  rootDir: string
  portfolioPath: string
  outputPath: string
}): Promise<MethodPortfolioReadinessReport> {
  const portfolio = await readMethodPortfolio(input)
  const report = evaluateMethodPortfolioReadiness(portfolio)
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

export async function writeMethodSuccessorSelectionReport(input: {
  rootDir: string
  portfolioPath: string
  policyPath: string
  outputPath: string
}): Promise<MethodSuccessorSelectionReport> {
  const portfolio = await readMethodPortfolio(input)
  const policy = MethodSuccessorSelectionPolicySchema.parse(
    JSON.parse(await readFile(path.resolve(input.policyPath), "utf8")),
  )
  const report = evaluateMethodSuccessorSelection(portfolio, policy)
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}
