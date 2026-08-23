import { isDeepStrictEqual } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { BidsAuditReportSchema, BidsTaskSetSchema, deriveBidsAuditOracle, loadBidsSourceRules } from "./bids-contract"
import { bidsReportsMatch } from "../../bench/evaluators/bids-grade"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package"
import { sha256Bytes } from "./source-fixture"
import type { RawAgentRunRow } from "./scoring"

const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

export const BidsProspectiveResidualAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-prospective-residual-audit/v1"),
  experimentId: z.literal("bids-prospective-development-2026-08-23"),
  status: z.literal("measurement-invalid"),
  inputs: z.array(BoundFileSchema).min(1),
  contract: z.object({
    publicFieldPathsDisclosed: z.literal(true),
    affectedPathValueSemanticsDisclosed: z.literal(false),
    evidencePathValueSemanticsDisclosed: z.literal(false),
  }).strict(),
  counts: z.object({
    modelRows: z.literal(12),
    exactMatches: z.number().int().min(0).max(12),
    repairSemanticMatches: z.number().int().min(0).max(12),
    presentationOnlyMismatches: z.number().int().min(1).max(12),
  }).strict(),
  defect: z.object({
    id: z.literal("underspecified-issue-path-value-semantics"),
    scope: z.tuple([z.literal("affectedPath"), z.literal("evidencePaths")]),
    effect: z.literal(
      "The deterministic scorer requires one oracle choice among multiple plausible affected/evidence path representations that the public contract does not distinguish.",
    ),
  }).strict(),
  interpretation: z.object({
    infrastructureEvidenceRetained: z.literal(true),
    qualityScoresEligible: z.literal(false),
    pairedImprovementDecisionsRetained: z.literal(false),
    validatedArtifactMechanismEvidenceRetained: z.literal(true),
    requiresSuccessorContractBeforePaidRerun: z.literal(true),
  }).strict(),
  authorizations: z.object({ dynamic: z.literal(false), heldOut: z.literal(false), readinessPromotion: z.literal(false) }).strict(),
  claimBoundary: z.literal(
    "This residual audit invalidates BIDS v1 quality scores and paired improvement decisions, while retaining infrastructure completeness and hand-authored artifact mechanism evidence. It does not authorize rescoring, contract repair in place, paid rerun, dynamic repair, held-out, or readiness promotion.",
  ),
}).strict()

type BidsReport = z.infer<typeof BidsAuditReportSchema>

function repairProjection(report: BidsReport) {
  return {
    schemaVersion: report.schemaVersion,
    datasetId: report.datasetId,
    issues: report.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      repair: issue.repair,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en")),
    summary: report.summary,
  }
}

export function bidsRepairSemanticsMatch(actual: unknown, expected: unknown): boolean {
  const parsedActual = BidsAuditReportSchema.safeParse(actual)
  const parsedExpected = BidsAuditReportSchema.safeParse(expected)
  return parsedActual.success && parsedExpected.success
    && isDeepStrictEqual(repairProjection(parsedActual.data), repairProjection(parsedExpected.data))
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function bound(rootDir: string, relativePath: string) {
  return { path: relativePath, sha256: sha256Bytes(await readFile(path.resolve(rootDir, ...relativePath.split("/")))) }
}

export async function buildBidsProspectiveResidualAudit(rawRootDir: string) {
  const rootDir = path.resolve(rawRootDir)
  const tasksPath = "benchmarks/skill-ir/pilots/bids/development/tasks.json"
  const publicPath = "benchmarks/skill-ir/pilots/bids/public-interface.json"
  const rawPath = "results/skill-ir/bids-prospective-development-v1/run/raw-runs.jsonl"
  const resultPath = "results/skill-ir/bids-prospective-development-v1/result.json"
  const policyPath = "benchmarks/skill-ir/pilots/bids/prospective-development-analysis-policy.json"
  const tasks = BidsTaskSetSchema.parse(JSON.parse(await readFile(path.join(rootDir, tasksPath), "utf8")))
  const taskMap = new Map<string, (typeof tasks.tasks)[number]>(
    tasks.tasks.map((task) => [task.id, task]),
  )
  const publicContract = JSON.parse(await readFile(path.join(rootDir, publicPath), "utf8")) as {
    publicFieldPaths?: unknown
    reportContract?: { issues?: { evidencePaths?: Record<string, unknown> } }
  }
  const rows = await readJsonl<RawAgentRunRow>(path.join(rootDir, rawPath))
  if (rows.length !== 12) throw new Error(`BIDS residual audit requires 12 model rows, got ${rows.length}`)
  const sourceRules = await loadBidsSourceRules(rootDir)
  let exactMatches = 0
  let repairSemanticMatches = 0
  for (const row of rows) {
    const taskId = row.caseId.split(":").at(-1)
    const task = taskId ? taskMap.get(taskId) : undefined
    if (!task || !row.workDir) throw new Error(`BIDS residual audit row identity missing: ${row.caseId}`)
    const actual = BidsAuditReportSchema.parse(JSON.parse(await readFile(path.join(row.workDir, "bids-audit.json"), "utf8")))
    const expected = await deriveBidsAuditOracle(JSON.parse(task.fixtures["dataset-manifest.json"]!), sourceRules)
    if (bidsReportsMatch(actual, expected)) exactMatches += 1
    if (bidsRepairSemanticsMatch(actual, expected)) repairSemanticMatches += 1
  }
  const publicFieldPathsDisclosed = Array.isArray(publicContract.publicFieldPaths)
    && publicContract.publicFieldPaths.includes("/issues/*/affectedPath")
    && publicContract.publicFieldPaths.includes("/issues/*/evidencePaths/*")
  const evidenceContract = publicContract.reportContract?.issues?.evidencePaths ?? {}
  const affectedPathValueSemanticsDisclosed = false
  const evidencePathValueSemanticsDisclosed = "meaning" in evidenceContract || "allowedValues" in evidenceContract
  const presentationOnlyMismatches = repairSemanticMatches - exactMatches
  if (!publicFieldPathsDisclosed || affectedPathValueSemanticsDisclosed
    || evidencePathValueSemanticsDisclosed || presentationOnlyMismatches < 1) {
    throw new Error("BIDS residual audit did not reproduce the frozen public-value-semantics defect")
  }
  return BidsProspectiveResidualAuditSchema.parse({
    schemaVersion: "skill-ir-bids-prospective-residual-audit/v1",
    experimentId: "bids-prospective-development-2026-08-23",
    status: "measurement-invalid",
    inputs: await Promise.all([tasksPath, publicPath, rawPath, resultPath, policyPath]
      .map((relativePath) => bound(rootDir, relativePath))),
    contract: {
      publicFieldPathsDisclosed: true,
      affectedPathValueSemanticsDisclosed: false,
      evidencePathValueSemanticsDisclosed: false,
    },
    counts: { modelRows: 12, exactMatches, repairSemanticMatches, presentationOnlyMismatches },
    defect: {
      id: "underspecified-issue-path-value-semantics",
      scope: ["affectedPath", "evidencePaths"],
      effect:
        "The deterministic scorer requires one oracle choice among multiple plausible affected/evidence path representations that the public contract does not distinguish.",
    },
    interpretation: {
      infrastructureEvidenceRetained: true,
      qualityScoresEligible: false,
      pairedImprovementDecisionsRetained: false,
      validatedArtifactMechanismEvidenceRetained: true,
      requiresSuccessorContractBeforePaidRerun: true,
    },
    authorizations: { dynamic: false, heldOut: false, readinessPromotion: false },
    claimBoundary:
      "This residual audit invalidates BIDS v1 quality scores and paired improvement decisions, while retaining infrastructure completeness and hand-authored artifact mechanism evidence. It does not authorize rescoring, contract repair in place, paid rerun, dynamic repair, held-out, or readiness promotion.",
  })
}

if (import.meta.main) {
  const rootDir = path.resolve(process.cwd())
  const report = await buildBidsProspectiveResidualAudit(rootDir)
  const outputPath = path.join(rootDir, "results/skill-ir/bids-prospective-development-v1/residual-audit.json")
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(report, null, 2))
}
