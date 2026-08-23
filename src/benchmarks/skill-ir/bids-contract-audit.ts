import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  BIDS_SOURCE_RULE_BINDINGS,
  BidsAuditReportSchema,
  buildBidsDevelopmentTaskSet,
  buildBidsPublicInterface,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
} from "./bids-contract.ts"
import { auditPublicJsonContractDisclosure } from "./public-json-contract-disclosure.ts"
import {
  BIDS_EVALUATOR_FIELD_PATHS,
  bidsReportsMatch,
} from "../../bench/evaluators/bids-grade.ts"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const DisclosureSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-json-contract-disclosure-audit/v1"),
  outputPath: SafeRelativePathSchema,
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    publicFieldPaths: z.number().int().nonnegative(),
    evaluatorFieldPaths: z.number().int().nonnegative(),
    undisclosedEvaluatorFieldPaths: z.number().int().nonnegative(),
  }).strict(),
  undisclosedEvaluatorFieldPaths: z.array(z.string()),
}).strict()

export const BidsContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-contract-audit-report/v1"),
  auditId: z.literal("bids-contract-audit-v1"),
  status: z.enum(["passed", "failed"]),
  inputs: z.array(BoundFileSchema).min(1),
  disclosure: DisclosureSchema,
  roles: z.object({
    canonicalValid: z.boolean(),
    alternativeValid: z.boolean(),
    promptOnlyOmission: z.boolean(),
    reverseEvidence: z.boolean(),
    forbiddenSink: z.boolean(),
    typeNegative: z.boolean(),
  }).strict(),
  counts: z.object({
    tasks: z.literal(2),
    canonicalReports: z.literal(2),
    matchedCanonicalReports: z.number().int().min(0).max(2),
  }).strict(),
  authorizations: z.object({
    paidExecution: z.literal(false),
    heldOut: z.literal(false),
    qualification: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This preflight proves public scorer disclosure and deterministic canary behavior. It is not model-performance, optimization, qualification, or held-out evidence.",
  ),
}).strict()

export type BidsContractAuditReport = z.infer<typeof BidsContractAuditReportSchema>

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function boundFile(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.resolve(rootDir, ...relativePath.split("/")))
  return { path: relativePath, sha256: sha256(bytes) }
}

function alternativeReport<T extends ReturnType<typeof BidsAuditReportSchema.parse>>(report: T): T {
  const alternative = structuredClone(report)
  alternative.issues.reverse()
  alternative.issues.forEach((issue) => issue.evidencePaths.reverse())
  return BidsAuditReportSchema.parse(alternative) as T
}

export function hasForbiddenBidsEvidenceSink(value: unknown): boolean {
  return /TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs|model-output|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/iu
    .test(JSON.stringify(value))
}

export async function buildBidsContractAudit(input: {
  rootDir: string
  evaluatorFieldPaths?: string[]
}): Promise<BidsContractAuditReport> {
  const publicInterface = buildBidsPublicInterface()
  const taskSet = buildBidsDevelopmentTaskSet(publicInterface)
  const sourceRules = await loadBidsSourceRules(input.rootDir)
  const evaluatorFieldPaths = input.evaluatorFieldPaths ?? [...BIDS_EVALUATOR_FIELD_PATHS]
  const disclosure = auditPublicJsonContractDisclosure({
    outputPath: "bids-audit.json",
    publicFieldPaths: publicInterface.publicFieldPaths,
    evaluatorFieldPaths,
  })
  const canonical = await Promise.all(taskSet.tasks.map((task) =>
    deriveBidsAuditOracle(JSON.parse(task.fixtures["dataset-manifest.json"]!), sourceRules)
  ))
  const matchedCanonicalReports = canonical.filter((report) => bidsReportsMatch(report, report)).length
  const alternativeValid = canonical.every((report) => bidsReportsMatch(alternativeReport(report), report))
  const promptOnlyOmission = canonical.every((report) => !bidsReportsMatch(BidsAuditReportSchema.parse({
    schemaVersion: "skill-ir-bids-audit-report/v1",
    datasetId: report.datasetId,
    issues: [],
    summary: { issueCount: 0, errorCount: 0 },
  }), report))

  const withoutEntityRules = await deriveBidsAuditOracle(
    JSON.parse(taskSet.tasks[0]!.fixtures["dataset-manifest.json"]!),
    { ...sourceRules, entityOrderKeys: [] },
  )
  const withoutRequiredMetadata = await deriveBidsAuditOracle(
    JSON.parse(taskSet.tasks[1]!.fixtures["dataset-manifest.json"]!),
    { ...sourceRules, requiredBoldMetadata: [], requiredMultiEchoMetadata: [] },
  )
  const reverseEvidence = withoutEntityRules.issues.every((issue) => issue.code !== "ENTITY_ORDER")
    && withoutRequiredMetadata.issues.every((issue) => issue.code !== "MISSING_REQUIRED_METADATA")
    && withoutEntityRules.issues.length < canonical[0]!.issues.length
    && withoutRequiredMetadata.issues.length < canonical[1]!.issues.length

  const invalidType = structuredClone(canonical[0]!) as unknown as Record<string, unknown>
  const invalidIssues = invalidType.issues as Array<Record<string, unknown>>
  const invalidRepair = invalidIssues[0]!.repair as Record<string, unknown>
  invalidRepair.value = { hidden: "answer" }
  const roles = {
    canonicalValid: matchedCanonicalReports === canonical.length,
    alternativeValid,
    promptOnlyOmission,
    reverseEvidence,
    forbiddenSink: !hasForbiddenBidsEvidenceSink({ publicInterface, taskSet }),
    typeNegative: !BidsAuditReportSchema.safeParse(invalidType).success,
  }
  const inputPaths = [
    "benchmarks/skill-ir/pilots/bids/public-interface.json",
    "benchmarks/skill-ir/pilots/bids/development/tasks.json",
    BIDS_SOURCE_RULE_BINDINGS.schema.path,
    BIDS_SOURCE_RULE_BINDINGS.metadata.path,
    "src/bench/evaluators/bids-grade.ts",
  ]
  const inputs = await Promise.all(inputPaths.map((relativePath) => boundFile(input.rootDir, relativePath)))
  const status = disclosure.status === "passed" && Object.values(roles).every(Boolean)
    ? "passed"
    : "failed"
  return BidsContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-bids-contract-audit-report/v1",
    auditId: "bids-contract-audit-v1",
    status,
    inputs,
    disclosure,
    roles,
    counts: { tasks: 2, canonicalReports: 2, matchedCanonicalReports },
    authorizations: { paidExecution: false, heldOut: false, qualification: false },
    claimBoundary:
      "This preflight proves public scorer disclosure and deterministic canary behavior. It is not model-performance, optimization, qualification, or held-out evidence.",
  })
}

export async function writeBidsContractAudit(input: {
  rootDir: string
  outputPath: string
}): Promise<BidsContractAuditReport> {
  const report = await buildBidsContractAudit({ rootDir: input.rootDir })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}
