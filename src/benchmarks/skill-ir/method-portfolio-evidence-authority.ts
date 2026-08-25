import { z } from "zod"
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { SafeRelativePathSchema } from "./artifact-package.ts"
import {
  OptimizationCostAccountingReportSchema,
  buildOptimizationCostAccountingReport,
} from "./optimization-cost-accounting.ts"
import {
  MethodPortfolioReadinessReportSchema,
  MethodPortfolioSchema,
  evaluateMethodPortfolioReadiness,
} from "./method-portfolio.ts"
import { readAndEvaluatePartialBenefitReentry } from "./partial-benefit-reentry.ts"
import { sha256Bytes } from "./source-fixture.ts"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

export const MethodPortfolioOptimizationEvidenceReferenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not-established") }).strict(),
  z.object({
    status: z.literal("evidence-ref"),
    evidencePath: SafeRelativePathSchema,
    evidenceSha256: Sha256Schema,
  }).strict(),
])

const MethodPortfolioAuthorityCaseEnvelopeSchema = z.object({
  skillId: z.string().min(1),
  optimizationEvidence: MethodPortfolioOptimizationEvidenceReferenceSchema,
}).strict()

export const MethodPortfolioAuthorityRegistrySchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio/v4"),
  portfolioId: z.string().min(1),
  basePortfolio: z.object({
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  }).strict(),
  cases: z.array(MethodPortfolioAuthorityCaseEnvelopeSchema).min(1),
}).strict()

const GateSystemNameSchema = z.enum(["no-skill", "original", "ir-static", "validated-artifact"])
type GateSystemName = z.infer<typeof GateSystemNameSchema>

const GateSystemSummarySchema = z.object({
  expectedRows: z.number().int().nonnegative(),
  observedRows: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  meanScoreIncludingMissing: z.number().min(0).max(1),
  aggregateTokens: z.number().nonnegative(),
}).strict()

const GateRecordSchema = z.object({
  taskId: z.string().min(1),
  runIndex: z.number().int().positive(),
  system: GateSystemNameSchema,
  status: z.enum(["complete", "missing-raw", "missing-scored"]),
  score: z.number().min(0).max(1),
  success: z.boolean(),
  hardGateFailure: z.boolean(),
  infrastructureFailure: z.boolean(),
}).strict()

const ValidatedArtifactGateEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-validated-artifact-development-gate-report/v1"),
  experimentId: z.string().min(1),
  denominator: z.literal("preregistered-logical-row"),
  counts: z.object({
    expectedRows: z.number().int().positive(),
    observedRawRows: z.number().int().nonnegative(),
    observedScoredRows: z.number().int().nonnegative(),
    expectedQuartets: z.number().int().positive(),
    completeQuartets: z.number().int().nonnegative(),
    artifactSuccesses: z.number().int().nonnegative(),
    artifactHardGateFailures: z.number().int().nonnegative(),
    pairwiseRegressions: z.number().int().nonnegative(),
    infrastructureFailures: z.number().int().nonnegative(),
  }).strict(),
  systems: z.object({
    "no-skill": GateSystemSummarySchema,
    original: GateSystemSummarySchema,
    "ir-static": GateSystemSummarySchema,
    "validated-artifact": GateSystemSummarySchema,
  }).strict(),
  artifactTaskMeanScores: z.record(z.string().min(1), z.number().min(0).max(1)),
  records: z.array(GateRecordSchema).min(1),
  cost: z.unknown(),
  gate: z.object({
    completeRows: z.boolean(),
    completeQuartets: z.boolean(),
    minimumArtifactSuccesses: z.boolean(),
    minimumArtifactMeanScore: z.boolean(),
    minimumArtifactTaskMeanScore: z.boolean(),
    maximumInfrastructureFailures: z.boolean(),
    maximumArtifactHardGateFailures: z.boolean(),
    maximumPairwiseRegressions: z.boolean(),
    passed: z.boolean(),
  }).strict(),
}).strict()

export type DerivedOptimizationEvidence = {
  evidenceSchemaVersion: string
  classification: "not-established" | "quality-positive" | "fidelity-preserving" | "efficiency-positive"
  qualityComparisonComplete: boolean
  productionCostComplete: boolean
  allAttemptCostComplete: boolean
  breakEvenComplete: boolean
  qualityEquivalent: boolean
  strictQualityImprovement: boolean
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

function gateRecordKey(record: z.infer<typeof GateRecordSchema>): string {
  return `${record.taskId}\0${record.runIndex}\0${record.system}`
}

function gateQuartetKey(record: z.infer<typeof GateRecordSchema>): string {
  return `${record.taskId}\0${record.runIndex}`
}

export function deriveValidatedArtifactGateAuthority(raw: unknown): DerivedOptimizationEvidence {
  const report = ValidatedArtifactGateEvidenceSchema.parse(raw)
  const systems = GateSystemNameSchema.options
  if (report.counts.expectedRows !== report.counts.expectedQuartets * systems.length) {
    throw new Error("validated artifact gate denominator is internally inconsistent")
  }

  const recordsByKey = new Map<string, z.infer<typeof GateRecordSchema>>()
  const quartets = new Map<string, z.infer<typeof GateRecordSchema>[]>()
  for (const record of report.records) {
    const key = gateRecordKey(record)
    if (recordsByKey.has(key)) throw new Error(`duplicate validated artifact gate record: ${key}`)
    recordsByKey.set(key, record)
    const quartetKey = gateQuartetKey(record)
    const quartet = quartets.get(quartetKey) ?? []
    quartet.push(record)
    quartets.set(quartetKey, quartet)
  }
  if (recordsByKey.size !== report.counts.expectedRows
    || quartets.size !== report.counts.expectedQuartets
    || [...quartets.values()].some((quartet) =>
      quartet.length !== systems.length
      || systems.some((system) => !quartet.some((record) => record.system === system)))) {
    throw new Error("validated artifact gate records do not realize the declared fixed denominator")
  }

  const observedRawRows = report.records.filter((record) => record.status !== "missing-raw").length
  const observedScoredRows = report.records.filter((record) => record.status === "complete").length
  const completeQuartets = [...quartets.values()].filter(
    (quartet) => quartet.every((record) => record.status === "complete"),
  ).length
  const artifactRecords = report.records.filter((record) => record.system === "validated-artifact")
  const artifactSuccesses = artifactRecords.filter((record) => record.success).length
  const artifactHardGateFailures = artifactRecords.filter((record) => record.hardGateFailure).length
  const infrastructureFailures = report.records.filter((record) => record.infrastructureFailure).length
  let pairwiseRegressions = 0
  let originalRegressions = 0
  let strictQualityImprovement = false
  for (const quartet of quartets.values()) {
    const bySystem = new Map(quartet.map((record) => [record.system, record]))
    const artifact = bySystem.get("validated-artifact")!
    const original = bySystem.get("original")!
    const staticRecord = bySystem.get("ir-static")!
    if (artifact.status !== "complete"
      || original.status !== "complete"
      || staticRecord.status !== "complete"
      || artifact.score < Math.max(original.score, staticRecord.score)
      || ((original.success || staticRecord.success) && !artifact.success)) {
      pairwiseRegressions += 1
    }
    if (artifact.score < original.score || (original.success && !artifact.success)) originalRegressions += 1
    if (artifact.score > original.score || (artifact.success && !original.success)) strictQualityImprovement = true
  }
  const derivedCounts = {
    observedRawRows,
    observedScoredRows,
    completeQuartets,
    artifactSuccesses,
    artifactHardGateFailures,
    pairwiseRegressions,
    infrastructureFailures,
  }
  for (const [name, value] of Object.entries(derivedCounts)) {
    if (report.counts[name as keyof typeof report.counts] !== value) {
      throw new Error(`validated artifact gate counts summary disagrees with records: ${name}`)
    }
  }

  const expectedRowsPerSystem = report.counts.expectedQuartets
  for (const system of systems) {
    const records = report.records.filter((record) => record.system === system)
    const summary = {
      expectedRows: expectedRowsPerSystem,
      observedRows: records.filter((record) => record.status === "complete").length,
      successes: records.filter((record) => record.success).length,
      meanScoreIncludingMissing: round4(records.reduce((sum, record) => sum + record.score, 0) / expectedRowsPerSystem),
    }
    for (const [name, value] of Object.entries(summary)) {
      if (report.systems[system][name as keyof typeof summary] !== value) {
        throw new Error(`validated artifact gate systems summary disagrees with records: ${system}.${name}`)
      }
    }
  }

  const taskMeans = Object.fromEntries([...new Set(artifactRecords.map((record) => record.taskId))]
    .sort()
    .map((taskId) => {
      const records = artifactRecords.filter((record) => record.taskId === taskId)
      return [taskId, round4(records.reduce((sum, record) => sum + record.score, 0) / records.length)]
    }))
  if (JSON.stringify(taskMeans) !== JSON.stringify(Object.fromEntries(Object.entries(report.artifactTaskMeanScores).sort()))) {
    throw new Error("validated artifact gate task mean summary disagrees with records")
  }

  const gateComponents = Object.entries(report.gate).filter(([name]) => name !== "passed")
  if (report.gate.passed !== gateComponents.every(([, value]) => value)) {
    throw new Error("validated artifact gate passed summary disagrees with component gates")
  }
  const qualityComparisonComplete = observedRawRows === report.counts.expectedRows
    && observedScoredRows === report.counts.expectedRows
    && completeQuartets === report.counts.expectedQuartets
    && report.gate.completeRows
    && report.gate.completeQuartets
  const qualityEquivalent = qualityComparisonComplete
    && report.gate.passed
    && infrastructureFailures === 0
    && artifactHardGateFailures === 0
    && pairwiseRegressions === 0
    && originalRegressions === 0
  const classification = qualityEquivalent
    ? strictQualityImprovement ? "quality-positive" as const : "fidelity-preserving" as const
    : "not-established" as const
  return {
    evidenceSchemaVersion: report.schemaVersion,
    classification,
    qualityComparisonComplete,
    productionCostComplete: false,
    allAttemptCostComplete: false,
    breakEvenComplete: false,
    qualityEquivalent,
    strictQualityImprovement: qualityEquivalent && strictQualityImprovement,
  }
}

export function deriveOptimizationCostReportAuthority(
  raw: unknown,
  qualityAuthority: DerivedOptimizationEvidence,
): DerivedOptimizationEvidence {
  const report = OptimizationCostAccountingReportSchema.parse(raw)
  if (!qualityAuthority.qualityComparisonComplete
    || report.quality.equivalent !== qualityAuthority.qualityEquivalent) {
    throw new Error("optimization cost report quality conclusion disagrees with authoritative quality evidence")
  }

  const rebuilt = buildOptimizationCostAccountingReport({
    skillId: report.skillId,
    experimentId: report.experimentId,
    quality: report.quality,
    adaptation: report.adaptation,
    production: {
      oneTime: report.production.oneTime,
      runtime: {
        original: {
          samples: report.production.runtime.original.samples,
          aggregateModelTokens: report.production.runtime.original.aggregateModelTokens,
          aggregateDurationMs: report.production.runtime.original.aggregateDurationMs,
        },
        optimized: {
          samples: report.production.runtime.optimized.samples,
          aggregateModelTokens: report.production.runtime.optimized.aggregateModelTokens,
          aggregateDurationMs: report.production.runtime.optimized.aggregateDurationMs,
        },
        repairModelTokensPerRun: report.production.runtime.optimized.repairModelTokensPerRun,
      },
    },
    research: {
      attempts: report.research.attempts,
      scorer: report.research.scorer,
      repair: report.research.repair,
    },
    evidence: report.evidence,
  })
  const reportedDerived = {
    production: report.production,
    research: report.research,
    amortization: report.amortization,
    breakEven: report.breakEven,
    completeness: report.completeness,
    eligibility: report.eligibility,
    claimBoundary: report.claimBoundary,
  }
  const rebuiltDerived = {
    production: rebuilt.production,
    research: rebuilt.research,
    amortization: rebuilt.amortization,
    breakEven: rebuilt.breakEven,
    completeness: rebuilt.completeness,
    eligibility: rebuilt.eligibility,
    claimBoundary: rebuilt.claimBoundary,
  }
  if (JSON.stringify(reportedDerived) !== JSON.stringify(rebuiltDerived)) {
    throw new Error("optimization cost report derived fields disagree with public cost builder recomputation")
  }

  const classification = rebuilt.eligibility.efficiencyPositiveEligible
    ? "efficiency-positive" as const
    : qualityAuthority.strictQualityImprovement
      ? "quality-positive" as const
      : qualityAuthority.qualityEquivalent
        ? "fidelity-preserving" as const
        : "not-established" as const
  return {
    evidenceSchemaVersion: report.schemaVersion,
    classification,
    qualityComparisonComplete: qualityAuthority.qualityComparisonComplete,
    productionCostComplete: rebuilt.completeness.productionCostComplete,
    allAttemptCostComplete: rebuilt.completeness.allAttemptCostComplete,
    breakEvenComplete: rebuilt.completeness.breakEvenComplete,
    qualityEquivalent: qualityAuthority.qualityEquivalent,
    strictQualityImprovement: qualityAuthority.strictQualityImprovement,
  }
}

type OptimizationEvidenceReference = Extract<
  z.infer<typeof MethodPortfolioOptimizationEvidenceReferenceSchema>,
  { status: "evidence-ref" }
>

const EvidenceAuthorityCaseSchema = z.object({
  skillId: z.string().min(1),
  evidencePath: SafeRelativePathSchema,
  evidenceSha256: Sha256Schema,
  evidenceSchemaVersion: z.string().min(1),
  classification: z.enum(["quality-positive", "fidelity-preserving", "efficiency-positive"]),
  qualityComparisonComplete: z.literal(true),
  productionCostComplete: z.boolean(),
  allAttemptCostComplete: z.boolean(),
  breakEvenComplete: z.boolean(),
  qualityEquivalent: z.literal(true),
  strictQualityImprovement: z.boolean(),
}).strict()

export const MethodPortfolioEvidenceAuthorityReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-portfolio-evidence-authority/v1"),
  authorityRegistry: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict(),
  basePortfolio: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict(),
  cases: z.array(EvidenceAuthorityCaseSchema),
}).strict()

export const AuthoritativeMethodPortfolioReadinessReportSchema = MethodPortfolioReadinessReportSchema
  .omit({ schemaVersion: true })
  .extend({
    schemaVersion: z.literal("skill-ir-method-portfolio-readiness/v5"),
    evidenceAuthority: MethodPortfolioEvidenceAuthorityReportSchema,
  }).strict()

export type AuthoritativeMethodPortfolioReadinessReport = z.infer<
  typeof AuthoritativeMethodPortfolioReadinessReportSchema
>

function containedPath(rootDir: string, relativePath: string, label: string): string {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes repository root: ${relativePath}`)
  }
  return absolute
}

async function readRegularFile(
  rootDir: string,
  relativePath: string,
  label: string,
): Promise<Buffer> {
  const absolute = containedPath(rootDir, relativePath, label)
  try {
    const stat = await lstat(absolute)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${label} is not a regular file: ${relativePath}`)
    }
    return await readFile(absolute)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label} is not a regular file:`)) throw error
    throw new Error(`${label} is unavailable: ${relativePath}`)
  }
}

async function readDigestBoundBytes(
  rootDir: string,
  reference: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const bytes = await readRegularFile(rootDir, reference.path, label)
  const actual = sha256Bytes(bytes)
  if (actual !== reference.sha256) {
    throw new Error(`${label} digest mismatch for ${reference.path}: expected ${reference.sha256}, got ${actual}`)
  }
  return bytes
}

function parseJsonEvidence(bytes: Buffer, relativePath: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error(`optimization evidence is not valid JSON: ${relativePath}`)
  }
}

async function readOptimizationEvidenceAuthorityInternal(input: {
  rootDir: string
  evidence: OptimizationEvidenceReference
  qualityChain: Set<string>
}): Promise<DerivedOptimizationEvidence> {
  const key = `${input.evidence.evidencePath}\0${input.evidence.evidenceSha256}`
  if (input.qualityChain.has(key)) throw new Error(`optimization evidence quality cycle: ${input.evidence.evidencePath}`)
  const bytes = await readDigestBoundBytes(input.rootDir, {
    path: input.evidence.evidencePath,
    sha256: input.evidence.evidenceSha256,
  }, "optimization evidence")
  const document = parseJsonEvidence(bytes, input.evidence.evidencePath)
  const schemaVersion = z.object({ schemaVersion: z.string() }).passthrough().safeParse(document)
  if (!schemaVersion.success) {
    throw new Error(`unsupported optimization evidence schema: ${input.evidence.evidencePath}`)
  }
  if (schemaVersion.data.schemaVersion === "skill-ir-validated-artifact-development-gate-report/v1") {
    return deriveValidatedArtifactGateAuthority(document)
  }
  if (schemaVersion.data.schemaVersion === "skill-ir-optimization-cost-accounting/v1") {
    const report = OptimizationCostAccountingReportSchema.parse(document)
    const nextChain = new Set(input.qualityChain).add(key)
    const qualityAuthority = await readOptimizationEvidenceAuthorityInternal({
      rootDir: input.rootDir,
      evidence: {
        status: "evidence-ref",
        evidencePath: report.quality.evidence.path,
        evidenceSha256: report.quality.evidence.sha256,
      },
      qualityChain: nextChain,
    })
    if (qualityAuthority.evidenceSchemaVersion
      !== "skill-ir-validated-artifact-development-gate-report/v1") {
      throw new Error("optimization cost quality evidence must be a validated artifact development gate")
    }
    for (const reference of report.evidence) {
      await readDigestBoundBytes(input.rootDir, reference, "optimization cost transitive evidence")
    }
    return deriveOptimizationCostReportAuthority(report, qualityAuthority)
  }
  throw new Error(`unsupported optimization evidence schema: ${schemaVersion.data.schemaVersion}`)
}

export async function readOptimizationEvidenceAuthority(input: {
  rootDir: string
  evidence: z.infer<typeof MethodPortfolioOptimizationEvidenceReferenceSchema>
}): Promise<DerivedOptimizationEvidence> {
  const evidence = MethodPortfolioOptimizationEvidenceReferenceSchema.parse(input.evidence)
  if (evidence.status !== "evidence-ref") {
    throw new Error("not-established optimization evidence has no authority file")
  }
  return readOptimizationEvidenceAuthorityInternal({
    rootDir: path.resolve(input.rootDir),
    evidence,
    qualityChain: new Set(),
  })
}

async function validateReentryPolicies(rootDir: string, portfolio: z.infer<typeof MethodPortfolioSchema>) {
  for (const entry of portfolio.cases) {
    if (!entry.reentryPolicyPath) continue
    const policyPath = containedPath(rootDir, entry.reentryPolicyPath, "portfolio re-entry policy")
    const stat = await lstat(policyPath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`portfolio re-entry policy is not a regular file: ${entry.skillId}`)
    }
    const report = await readAndEvaluatePartialBenefitReentry({ rootDir, policyPath })
    if (!report.admitted || report.skillId !== entry.skillId || entry.role !== "method-development") {
      throw new Error(`portfolio re-entry policy did not admit method development: ${entry.skillId}`)
    }
  }
}

export async function readAndEvaluateAuthoritativeMethodPortfolio(input: {
  rootDir: string
  portfolioPath: string
}): Promise<AuthoritativeMethodPortfolioReadinessReport> {
  const rootDir = path.resolve(input.rootDir)
  const absoluteRegistryPath = path.resolve(input.portfolioPath)
  const relativeRegistryPath = path.relative(rootDir, absoluteRegistryPath).replaceAll("\\", "/")
  const normalizedRegistryPath = SafeRelativePathSchema.parse(relativeRegistryPath)
  const registryBytes = await readRegularFile(rootDir, normalizedRegistryPath, "portfolio authority registry")
  const registry = MethodPortfolioAuthorityRegistrySchema.parse(
    JSON.parse(registryBytes.toString("utf8")),
  )
  const baseBytes = await readDigestBoundBytes(rootDir, registry.basePortfolio, "base method portfolio")
  const basePortfolio = MethodPortfolioSchema.parse(JSON.parse(baseBytes.toString("utf8")))
  if (registry.portfolioId !== basePortfolio.portfolioId) {
    throw new Error("portfolio authority registry and base portfolio identity disagree")
  }
  const authorityBySkill = new Map<string, typeof registry.cases[number]>()
  for (const entry of registry.cases) {
    if (authorityBySkill.has(entry.skillId)) throw new Error(`duplicate portfolio authority case: ${entry.skillId}`)
    authorityBySkill.set(entry.skillId, entry)
  }
  if (authorityBySkill.size !== basePortfolio.cases.length
    || basePortfolio.cases.some((entry) => !authorityBySkill.has(entry.skillId))) {
    throw new Error("portfolio authority registry requires exactly one entry for every base case")
  }

  const evidenceCases: z.infer<typeof EvidenceAuthorityCaseSchema>[] = []
  const resolvedCases = []
  for (const entry of basePortfolio.cases) {
    const authority = authorityBySkill.get(entry.skillId)!
    if (authority.optimizationEvidence.status === "not-established") {
      resolvedCases.push({
        ...entry,
        optimizationEvidence: {
          classification: "not-established",
          qualityComparisonComplete: false,
          allAttemptCostComplete: false,
          breakEvenComplete: false,
        },
      })
      continue
    }
    if (entry.lifecycle.optimizedDevelopment.status !== "passed"
      || entry.lifecycle.optimizedDevelopment.evidencePath !== authority.optimizationEvidence.evidencePath) {
      throw new Error(`portfolio optimized lifecycle and authority evidence disagree: ${entry.skillId}`)
    }
    const derived = await readOptimizationEvidenceAuthority({
      rootDir,
      evidence: authority.optimizationEvidence,
    })
    if (derived.classification === "not-established"
      || !derived.qualityComparisonComplete
      || !derived.qualityEquivalent) {
      throw new Error(`optimization evidence does not support a classified result: ${entry.skillId}`)
    }
    evidenceCases.push(EvidenceAuthorityCaseSchema.parse({
      skillId: entry.skillId,
      evidencePath: authority.optimizationEvidence.evidencePath,
      evidenceSha256: authority.optimizationEvidence.evidenceSha256,
      ...derived,
    }))
    resolvedCases.push({
      ...entry,
      optimizationEvidence: {
        classification: derived.classification,
        evidencePath: authority.optimizationEvidence.evidencePath,
        qualityComparisonComplete: derived.qualityComparisonComplete,
        allAttemptCostComplete: derived.allAttemptCostComplete,
        breakEvenComplete: derived.breakEvenComplete,
      },
    })
  }
  const resolvedPortfolio = MethodPortfolioSchema.parse({
    ...basePortfolio,
    cases: resolvedCases,
  })
  await validateReentryPolicies(rootDir, resolvedPortfolio)
  const legacyReport = evaluateMethodPortfolioReadiness(resolvedPortfolio)
  const { schemaVersion: _legacySchemaVersion, ...legacyBody } = legacyReport
  return AuthoritativeMethodPortfolioReadinessReportSchema.parse({
    ...legacyBody,
    schemaVersion: "skill-ir-method-portfolio-readiness/v5",
    evidenceAuthority: {
      schemaVersion: "skill-ir-method-portfolio-evidence-authority/v1",
      authorityRegistry: {
        path: normalizedRegistryPath,
        sha256: sha256Bytes(registryBytes),
      },
      basePortfolio: registry.basePortfolio,
      cases: evidenceCases,
    },
  })
}

export async function writeAuthoritativeMethodPortfolioReadinessReport(input: {
  rootDir: string
  portfolioPath: string
  outputPath: string
}): Promise<AuthoritativeMethodPortfolioReadinessReport> {
  const report = await readAndEvaluateAuthoritativeMethodPortfolio(input)
  const outputPath = path.resolve(input.outputPath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}
