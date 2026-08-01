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
  "heldout-regression",
  "baseline-saturation",
  "reentry-development-not-run",
  "task-contract-not-authored",
])

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
  reentryPolicyPath: SafeRelativePathSchema.optional(),
  developmentGate: z.object({
    status: z.enum(["passed", "failed", "blocked", "not-run"]),
    resultPath: SafeRelativePathSchema.optional(),
  }).strict(),
  automation: z.object({
    generatesIr: z.boolean(),
    generatesContract: z.boolean(),
    generatesValidationPlan: z.boolean(),
    generatesPackageCandidate: z.boolean(),
  }).strict(),
  adaptation: z.object({
    humanMinutes: z.number().nonnegative().nullable(),
    adapterLoc: z.number().int().nonnegative().nullable(),
    artifactKinds: z.array(ArtifactKindSchema),
    coreBranchDelta: z.number().int().nonnegative().nullable(),
    unautomatedSteps: z.array(z.string().min(1)),
  }).strict(),
  blockers: z.array(BlockerSchema),
}).strict().superRefine((entry, context) => {
  if (entry.role === "method-development" && entry.methodSequence === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-development case requires methodSequence" })
  }
  if (entry.role !== "method-development" && entry.methodSequence !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "non-method case cannot carry methodSequence" })
  }
  if (entry.role === "untouched-replication" && (
    entry.adaptation.coreBranchDelta !== 0
    || entry.adaptation.unautomatedSteps.length > 0
    || !entry.contractQualified
    || entry.developmentGate.status !== "passed"
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "untouched replication requires qualified frozen-core execution with zero core delta",
    })
  }
})

export const MethodPortfolioSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio/v1"),
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

export const MethodPortfolioReadinessReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio-readiness/v1"),
  portfolioId: z.string().min(1),
  passed: z.boolean(),
  counts: z.object({
    registeredCases: z.number().int().nonnegative(),
    studiedCases: z.number().int().nonnegative(),
    contractQualifiedMethodCases: z.number().int().nonnegative(),
    untouchedReplicationCases: z.number().int().nonnegative(),
    passedDevelopmentPhenotypes: z.number().int().nonnegative(),
  }).strict(),
  gates: z.object({
    enoughQualifiedCasesAndCoverage: z.boolean(),
    lastThreeCoreBranchDeltaZero: z.boolean(),
    automationAndAdaptationConverging: z.boolean(),
    twoPhenotypesPassedDevelopment: z.boolean(),
    noOpenMeasurementBlockers: z.boolean(),
  }).strict(),
  gaps: z.object({
    missingQualifiedCases: z.number().int().nonnegative(),
    missingPhenotypes: z.array(z.string()),
    openMeasurementBlockers: z.array(z.object({ skillId: z.string(), blocker: BlockerSchema }).strict()),
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

  const passedPhenotypes = new Set(qualified
    .filter((entry) => entry.developmentGate.status === "passed")
    .flatMap((entry) => entry.phenotypes))
  const measurementBlockers = new Set(["benchmark-contract", "gold-leak", "materialization", "scorer-authority"])
  const openMeasurementBlockers = methodCases.flatMap((entry) => entry.blockers
    .filter((blocker) => measurementBlockers.has(blocker))
    .map((blocker) => ({ skillId: entry.skillId, blocker })))
  const gates = {
    enoughQualifiedCasesAndCoverage: qualified.length >= portfolio.minimumContractQualifiedCases
      && missingPhenotypes.length === 0,
    lastThreeCoreBranchDeltaZero,
    automationAndAdaptationConverging,
    twoPhenotypesPassedDevelopment: passedPhenotypes.size >= 2,
    noOpenMeasurementBlockers: openMeasurementBlockers.length === 0,
  }
  return MethodPortfolioReadinessReportSchema.parse({
    schemaVersion: "skill-ir-method-portfolio-readiness/v1",
    portfolioId: portfolio.portfolioId,
    passed: Object.values(gates).every(Boolean),
    counts: {
      registeredCases: portfolio.cases.length,
      studiedCases: methodCases.length,
      contractQualifiedMethodCases: qualified.length,
      untouchedReplicationCases: portfolio.cases.filter((entry) => entry.role === "untouched-replication").length,
      passedDevelopmentPhenotypes: passedPhenotypes.size,
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
