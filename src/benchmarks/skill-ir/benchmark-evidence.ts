import { z } from "zod"
import { isAbsolute, relative, resolve, sep } from "node:path"

const CanarySchema = z.object({
  id: z.string(),
  role: z.string(),
  expectedPass: z.boolean(),
  actualPass: z.boolean(),
  status: z.string(),
}).passthrough()

const ContractAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-benchmark-contract-audit-run-report/v1"),
  auditId: z.string(),
  skillId: z.string(),
  staticStatus: z.enum(["passed", "failed"]),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    criteria: z.number().int().nonnegative(),
    requirements: z.number().int().nonnegative(),
    canaries: z.number().int().nonnegative(),
  }).passthrough(),
  canaries: z.array(CanarySchema),
  issues: z.array(z.object({ code: z.string(), subjectId: z.string() }).passthrough()),
  claimBoundary: z.string(),
}).passthrough()

const MaterializationAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-materialization-audit-report/v1"),
  auditId: z.string(),
  contractRevision: z.string(),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    arms: z.number().int().nonnegative(),
    checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  }).strict(),
  arms: z.array(z.unknown()),
  issues: z.array(z.unknown()),
  claimBoundary: z.string(),
}).strict()

export type MeasurementContractSummary = {
  status: "passed" | "failed"
  canariesMatched: number
  canariesTotal: number
  canaryMatchRate: number
  alternativeValidRejected: number
  privateContractIssues: number
  materializationChecksPassed: number
  materializationChecksTotal: number
}

export type MeasurementComparison = {
  schemaVersion: "skill-ir-benchmark-measurement-comparison/v1"
  conclusion: "v2-measurement-contract-dominates"
  v1: MeasurementContractSummary
  v2: MeasurementContractSummary
  proof: {
    noRegressions: true
    strictImprovements: string[]
  }
  claimBoundary: {
    measurementContractBetterSupported: true
    realDiscriminationProven: false
    skillOptimizationProven: false
    tokenReductionProven: false
  }
}

function summarizeContractAudit(value: unknown): MeasurementContractSummary {
  const audit = ContractAuditSchema.parse(value)
  const matched = audit.canaries.filter((canary) => canary.status === "matched").length
  const total = audit.canaries.length
  return {
    status: audit.status,
    canariesMatched: matched,
    canariesTotal: total,
    canaryMatchRate: total > 0 ? matched / total : 0,
    alternativeValidRejected: audit.canaries.filter((canary) =>
      canary.role === "alternative-valid" && canary.expectedPass && !canary.actualPass).length,
    privateContractIssues: audit.issues.filter((issue) =>
      issue.code === "EXACT_CONTRACT_NOT_PUBLIC").length,
    materializationChecksPassed: 0,
    materializationChecksTotal: 0,
  }
}

export function compareMeasurementContracts(
  v1Value: unknown,
  v2Value: unknown,
  materializationValue: unknown,
): MeasurementComparison {
  const v1 = summarizeContractAudit(v1Value)
  const v2 = summarizeContractAudit(v2Value)
  const materialization = MaterializationAuditSchema.parse(materializationValue)
  v2.materializationChecksPassed = materialization.counts.passed
  v2.materializationChecksTotal = materialization.counts.checks

  const noRegressions = v2.canaryMatchRate >= v1.canaryMatchRate
    && v2.canariesTotal >= v1.canariesTotal
    && v2.alternativeValidRejected <= v1.alternativeValidRejected
    && v2.privateContractIssues <= v1.privateContractIssues
    && v2.status === "passed"
    && materialization.status === "passed"
    && materialization.counts.checks > 0
    && materialization.counts.passed === materialization.counts.checks
  if (!noRegressions) {
    throw new Error("Benchmark v2 measurement regression or incomplete evidence")
  }

  const strictImprovements = [
    ...(v2.canaryMatchRate > v1.canaryMatchRate ? ["canary-match-rate"] : []),
    ...(v2.canariesTotal > v1.canariesTotal ? ["canary-coverage"] : []),
    ...(v2.alternativeValidRejected < v1.alternativeValidRejected
      ? ["alternative-valid-false-rejection"] : []),
    ...(v2.privateContractIssues < v1.privateContractIssues
      ? ["private-contract-issues"] : []),
    ...(v2.materializationChecksPassed > v1.materializationChecksPassed
      ? ["workspace-materialization-protection"] : []),
  ]
  if (strictImprovements.length === 0) {
    throw new Error("Benchmark v2 has no strict measurement improvement")
  }

  return {
    schemaVersion: "skill-ir-benchmark-measurement-comparison/v1",
    conclusion: "v2-measurement-contract-dominates",
    v1,
    v2,
    proof: { noRegressions: true, strictImprovements },
    claimBoundary: {
      measurementContractBetterSupported: true,
      realDiscriminationProven: false,
      skillOptimizationProven: false,
      tokenReductionProven: false,
    },
  }
}

export type RunnerPlanProjection = {
  frozenRunnerPaths: string[]
  adapter: string
  commands: string[][]
  initialWorkdirManifestRows: number
  nodeHttpHelperBound: boolean
}

export type RawRuntimeProjection = {
  rows: number
  bunInternalAssertions: number
  nonzeroExits: number
  durationMs?: { minimum: number; median: number; maximum: number }
}

export type EvidenceRef = { path: string; sha256: string }

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(await Bun.file(path).arrayBuffer())
  return hasher.digest("hex")
}

function containedEvidencePath(root: string, path: string): string {
  const rootPath = resolve(root)
  const candidate = resolve(path)
  const rel = relative(rootPath, candidate)
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return candidate
  }
  throw new Error(`Evidence path escapes root: ${path}`)
}

export async function evidenceRef(root: string, path: string): Promise<EvidenceRef> {
  const candidate = containedEvidencePath(root, path)
  const rel = relative(resolve(root), candidate).replaceAll("\\", "/")
  return { path: rel, sha256: await sha256File(candidate) }
}

export async function verifyEvidenceRefs(root: string, refs: EvidenceRef[]): Promise<void> {
  for (const ref of refs) {
    const path = containedEvidencePath(root, resolve(root, ref.path))
    const actual = await sha256File(path)
    if (actual !== ref.sha256) {
      throw new Error(`Evidence digest mismatch: ${ref.path}`)
    }
  }
}

const RawProjectionRowSchema = z.object({
  exitCode: z.number().int(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
}).passthrough()

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function projectRawRuntimeEvidence(raw: string): RawRuntimeProjection {
  const rows = raw.trim().split(/\r?\n/).filter(Boolean).map((line) =>
    RawProjectionRowSchema.parse(JSON.parse(line)))
  const durations = rows.map((row) => row.durationMs)
  return {
    rows: rows.length,
    bunInternalAssertions: rows.filter((row) => {
      const text = row.stderr.toLowerCase()
      return text.includes("panic(main thread): internal assertion failure")
        || text.includes("bun has crashed")
    }).length,
    nonzeroExits: rows.filter((row) => row.exitCode !== 0).length,
    durationMs: {
      minimum: durations.length > 0 ? Math.min(...durations) : 0,
      median: median(durations),
      maximum: durations.length > 0 ? Math.max(...durations) : 0,
    },
  }
}

export function summarizeRunnerBoundary(input: {
  v1Plan: RunnerPlanProjection
  v2Plan: RunnerPlanProjection
  v1Raw: RawRuntimeProjection
  v2Raw: RawRuntimeProjection
}) {
  const sharedMatrixRunner = input.v1Plan.frozenRunnerPaths.some((path) =>
    input.v2Plan.frozenRunnerPaths.includes(path))
  const sharedAdapter = input.v1Plan.adapter === input.v2Plan.adapter
  const v1CommandEntry = input.v1Plan.commands[0]?.slice(0, 4).join(" ") ?? ""
  const v2CommandEntry = input.v2Plan.commands[0]?.slice(0, 4).join(" ") ?? ""
  const differences = [
    ...(v1CommandEntry !== v2CommandEntry ? ["command-entry"] : []),
    ...(input.v1Plan.initialWorkdirManifestRows !== input.v2Plan.initialWorkdirManifestRows
      ? ["initial-workdir-manifest"] : []),
    ...(input.v1Plan.nodeHttpHelperBound !== input.v2Plan.nodeHttpHelperBound
      ? ["node-http-helper"] : []),
  ]
  return {
    schemaVersion: "skill-ir-source-runner-boundary-summary/v1" as const,
    sharedMatrixRunner,
    sharedAdapter,
    differences,
    runtime: { v1: input.v1Raw, v2: input.v2Raw },
    conclusion: "runner-only-cause-not-established" as const,
    paidRerunAllowed: false as const,
  }
}

export type SkillOptimizationInput = {
  envManager: {
    pairedGenerations: number
    preMeanScore: number
    postMeanScore: number
    infrastructureFailures: number
    developmentGatePassed: boolean
    heldOutExecuted: boolean
  }
  lawToMarkdown: {
    developmentGatePassed: boolean
    developmentArtifactMean: number
    developmentStaticMean: number
    heldOutGatePassed: boolean
    heldOutArtifactMean: number
    heldOutStaticMean: number
    heldOutRegressions: number
    breakEvenAvailable: boolean
  }
  experimentalDesign: {
    measurementContractPassed: boolean
    baselineGatePassed: boolean
    infrastructureFailures: number
    comparablePairs: number
    baseIrAuditAllowed: boolean
    heldOutExecuted: boolean
  }
}

export function summarizeSkillOptimization(input: SkillOptimizationInput) {
  return {
    schemaVersion: "skill-ir-current-optimization-ledger/v1" as const,
    projectStatus: "partial-mechanism-evidence" as const,
    skills: [
      {
        skillId: "env-manager",
        status: "development-mechanism-positive-gate-failed" as const,
        evidence: input.envManager,
        fullClaimAllowed: input.envManager.developmentGatePassed,
      },
      {
        skillId: "law-to-markdown",
        status: "development-positive-heldout-regressed" as const,
        evidence: input.lawToMarkdown,
        fullClaimAllowed: input.lawToMarkdown.heldOutGatePassed,
      },
      {
        skillId: "experimental-design",
        status: "measurement-valid-baseline-blocked" as const,
        evidence: input.experimentalDesign,
        fullClaimAllowed: false,
      },
    ],
    claims: {
      deterministicMechanismCanImproveObservedOutputs:
        input.envManager.pairedGenerations > 0
        && input.envManager.postMeanScore > input.envManager.preMeanScore,
      oneSkillDevelopmentArtifactGatePassed: input.lawToMarkdown.developmentGatePassed,
      heldOutArtifactNonRegression: input.lawToMarkdown.heldOutGatePassed,
      crossSkillStabilityImproved: false as const,
      crossModelStabilityImproved: false as const,
      crossContextStabilityImproved: false as const,
      tokenBreakEvenProven: false as const,
    },
  }
}

export function buildBenchmarkEvidenceReport(input: {
  measurement: { conclusion: string; proof: { noRegressions: boolean; strictImprovements: string[] } }
  operational: { v1: unknown; v2: unknown }
  runnerBoundary: { conclusion: string; paidRerunAllowed: boolean }
  optimization: { projectStatus: string }
}) {
  return {
    schemaVersion: "skill-ir-benchmark-and-optimization-evidence/v1" as const,
    ...input,
    claimBoundary: {
      v2MeasurementContractBetterSupported:
        input.measurement.conclusion === "v2-measurement-contract-dominates",
      v2RealDiscriminationProven: false as const,
      fullSkillOptimizationClaimProven: false as const,
      heldOutGeneralizationProven: false as const,
      tokenReductionProven: false as const,
      paidRerunAllowed: input.runnerBoundary.paidRerunAllowed,
    },
  }
}
