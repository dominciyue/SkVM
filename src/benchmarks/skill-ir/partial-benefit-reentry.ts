import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FORBIDDEN_KEYS = new Set([
  "expected",
  "expectedAnswer",
  "gold",
  "goldAnswer",
  "sourceQuote",
  "rawModelContent",
  "secret",
  "absolutePath",
  "heldoutPrompt",
  "heldoutFixture",
  "evaluatorPayload",
])

function findForbiddenKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findForbiddenKey(entry)
      if (found) return found
    }
    return undefined
  }
  if (!value || typeof value !== "object") return undefined
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return key
    const found = findForbiddenKey(nested)
    if (found) return found
  }
  return undefined
}

export const PartialBenefitReentryPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-partial-benefit-reentry/v1"),
  policyId: z.string().min(1),
  status: z.literal("preregistered"),
  skillId: z.string().min(1),
  sourceExperiment: z.object({
    gateReport: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict(),
    oldGatePassed: z.literal(false),
    oldRole: z.string().min(1),
  }).strict(),
  admission: z.object({
    requireCompleteRows: z.literal(true),
    requireCompletePairs: z.literal(true),
    maximumInfrastructureFailures: z.literal(0),
    minimumDifferingPairs: z.literal(1),
    minimumOriginalPositivePairs: z.literal(1),
    requireOriginalMeanAboveNoSkill: z.literal(true),
  }).strict(),
  residual: z.object({
    criterionId: z.string().min(1),
    publicEvidenceKinds: z.array(z.string().min(1)).min(1),
    intendedArtifactKinds: z.array(z.enum(["checks", "schemas", "scripts", "templates", "tool-plans"])).min(1),
    sourceAttributable: z.literal(true),
  }).strict(),
  newIdentity: z.object({
    portfolioRole: z.literal("method-development"),
    requiresNewTaskContract: z.literal(true),
    requiresNewLock: z.literal(true),
    requiresNewResultIdentity: z.literal(true),
  }).strict(),
  claimBoundary: z.object({
    methodDevelopmentOnly: z.literal(true),
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    untouchedReplication: z.literal(false),
    rewritesOldGate: z.literal(false),
  }).strict(),
}).strict().superRefine((value, context) => {
  const forbidden = findForbiddenKey(value)
  if (forbidden) context.addIssue({ code: z.ZodIssueCode.custom, message: `forbidden re-entry field: ${forbidden}` })
})

export type PartialBenefitReentryPolicy = z.infer<typeof PartialBenefitReentryPolicySchema>

const CalibrationGateSchema = z.object({
  passed: z.boolean(),
  counts: z.object({
    expectedRows: z.number().int().nonnegative(),
    observedRows: z.number().int().nonnegative(),
    expectedPairs: z.number().int().nonnegative(),
    completePairs: z.number().int().nonnegative(),
    infrastructureFailures: z.number().int().nonnegative(),
    differingPairs: z.number().int().nonnegative(),
  }).passthrough(),
  systems: z.object({
    "no-skill": z.object({ meanScore: z.number() }).passthrough(),
    original: z.object({ meanScore: z.number() }).passthrough(),
  }).passthrough(),
  pairs: z.array(z.object({ scoreDelta: z.number(), comparable: z.boolean() }).passthrough()),
}).passthrough()

export const PartialBenefitReentryReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-partial-benefit-reentry-report/v1"),
  policyId: z.string().min(1),
  skillId: z.string().min(1),
  sourceGateReport: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict(),
  admitted: z.boolean(),
  oldGatePassed: z.boolean(),
  counts: z.object({
    originalPositivePairs: z.number().int().nonnegative(),
    differingPairs: z.number().int().nonnegative(),
    infrastructureFailures: z.number().int().nonnegative(),
  }).strict(),
  gates: z.object({
    completeRows: z.boolean(),
    completePairs: z.boolean(),
    zeroInfrastructure: z.boolean(),
    distinguishable: z.boolean(),
    originalPositivePair: z.boolean(),
    originalMeanAboveNoSkill: z.boolean(),
    sourceAttributableResidual: z.boolean(),
    oldGateStillFailed: z.boolean(),
  }).strict(),
  residual: z.object({
    criterionId: z.string().min(1),
    publicEvidenceKinds: z.array(z.string().min(1)),
    intendedArtifactKinds: z.array(z.string().min(1)),
  }).strict(),
  claimBoundary: z.object({
    methodDevelopmentOnly: z.literal(true),
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    untouchedReplication: z.literal(false),
    rewritesOldGate: z.literal(false),
  }).strict(),
}).strict()

export type PartialBenefitReentryReport = z.infer<typeof PartialBenefitReentryReportSchema>

export function evaluatePartialBenefitReentry(
  policyInput: unknown,
  gateInput: unknown,
): PartialBenefitReentryReport {
  const policy = PartialBenefitReentryPolicySchema.parse(policyInput)
  const gate = CalibrationGateSchema.parse(gateInput)
  const comparable = gate.pairs.filter((entry) => entry.comparable)
  const positivePairs = comparable.filter((entry) => entry.scoreDelta > 0).length
  const gates = {
    completeRows: gate.counts.observedRows === gate.counts.expectedRows,
    completePairs: gate.counts.completePairs === gate.counts.expectedPairs,
    zeroInfrastructure: gate.counts.infrastructureFailures <= policy.admission.maximumInfrastructureFailures,
    distinguishable: gate.counts.differingPairs >= policy.admission.minimumDifferingPairs,
    originalPositivePair: positivePairs >= policy.admission.minimumOriginalPositivePairs,
    originalMeanAboveNoSkill: gate.systems.original.meanScore > gate.systems["no-skill"].meanScore,
    sourceAttributableResidual: policy.residual.sourceAttributable,
    oldGateStillFailed: gate.passed === policy.sourceExperiment.oldGatePassed && gate.passed === false,
  }
  return PartialBenefitReentryReportSchema.parse({
    schemaVersion: "skill-ir-partial-benefit-reentry-report/v1",
    policyId: policy.policyId,
    skillId: policy.skillId,
    sourceGateReport: policy.sourceExperiment.gateReport,
    admitted: Object.values(gates).every(Boolean),
    oldGatePassed: gate.passed,
    counts: {
      originalPositivePairs: positivePairs,
      differingPairs: gate.counts.differingPairs,
      infrastructureFailures: gate.counts.infrastructureFailures,
    },
    gates,
    residual: {
      criterionId: policy.residual.criterionId,
      publicEvidenceKinds: policy.residual.publicEvidenceKinds,
      intendedArtifactKinds: policy.residual.intendedArtifactKinds,
    },
    claimBoundary: policy.claimBoundary,
  })
}

async function readBoundFile(rootDir: string, relativePath: string): Promise<Buffer> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("partial-benefit re-entry source escapes repository root")
  }
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("partial-benefit re-entry source must be a regular file")
  return readFile(absolute)
}

export async function readAndEvaluatePartialBenefitReentry(input: {
  rootDir: string
  policyPath: string
  sourceDigestOverride?: string
}): Promise<PartialBenefitReentryReport> {
  const policy = PartialBenefitReentryPolicySchema.parse(JSON.parse(await readFile(path.resolve(input.policyPath), "utf8")))
  const bytes = await readBoundFile(input.rootDir, policy.sourceExperiment.gateReport.path)
  const expected = input.sourceDigestOverride ?? policy.sourceExperiment.gateReport.sha256
  if (sha256Bytes(bytes) !== expected) throw new Error("partial-benefit re-entry source digest mismatch")
  return evaluatePartialBenefitReentry(policy, JSON.parse(bytes.toString("utf8")))
}
