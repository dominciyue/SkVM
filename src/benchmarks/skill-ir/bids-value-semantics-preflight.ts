import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  BidsTaskSetSchema,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
  type BidsAuditReport,
} from "./bids-contract.ts"
import {
  auditPublicJsonValueSemanticsDisclosure,
  type PublicJsonValueSemanticCanary,
  type PublicJsonValueSemanticDeclaration,
} from "./public-json-contract-disclosure.ts"
import { bidsReportsMatch } from "../../bench/evaluators/bids-grade.ts"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})
const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const PointerDisclosureSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-json-contract-disclosure-audit/v1"),
  outputPath: z.literal("bids-audit.json"),
  status: z.literal("passed"),
  counts: z.object({
    publicFieldPaths: z.literal(17),
    evaluatorFieldPaths: z.literal(17),
    undisclosedEvaluatorFieldPaths: z.literal(0),
  }).strict(),
  undisclosedEvaluatorFieldPaths: z.array(z.never()),
}).strict()
const OldContractAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-contract-audit-report/v1"),
  status: z.literal("passed"),
  disclosure: PointerDisclosureSchema,
}).passthrough()
const ResidualAuditSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-prospective-residual-audit/v1"),
  status: z.literal("measurement-invalid"),
  defect: z.object({
    id: z.literal("underspecified-issue-path-value-semantics"),
  }).passthrough(),
}).passthrough()
const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-public-interface/v1"),
  publicFieldPaths: z.array(z.string()),
  reportContract: z.object({
    issues: z.object({
      order: z.literal("set-like"),
      evidencePaths: z.object({ order: z.literal("set-like") }).passthrough(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

const PUBLIC_SEMANTICS: PublicJsonValueSemanticDeclaration[] = [
  {
    id: "issues-order-equivalence",
    kind: "representation-equivalence",
    rule: "set-like-permutation",
    targets: [{ role: "array", path: "/issues" }],
    description: "Issue array order does not affect report meaning.",
  },
  {
    id: "evidence-paths-order-equivalence",
    kind: "representation-equivalence",
    rule: "set-like-permutation",
    targets: [{ role: "array", path: "/issues/*/evidencePaths" }],
    description: "Evidence path array order does not affect issue meaning.",
  },
]

const EVALUATOR_SEMANTICS: PublicJsonValueSemanticDeclaration[] = [
  ...PUBLIC_SEMANTICS,
  {
    id: "affected-path-canonical-role",
    kind: "canonical-value",
    rule: "logical-data-file-path",
    targets: [{ role: "value", path: "/issues/*/affectedPath" }],
    description: "The affected path is the logical data file that exhibits the issue.",
  },
  {
    id: "evidence-path-canonical-role",
    kind: "canonical-value",
    rule: "source-reference-path",
    targets: [{ role: "value", path: "/issues/*/evidencePaths/*" }],
    description: "Each evidence path identifies the source reference that establishes the issue.",
  },
  {
    id: "issue-element-identity",
    kind: "array-element-identity",
    rule: "code-path-field-composite-key",
    targets: [
      { role: "array", path: "/issues" },
      { role: "identity-code", path: "/issues/*/code" },
      { role: "identity-field", path: "/issues/*/repair/field" },
      { role: "identity-path", path: "/issues/*/affectedPath" },
    ],
    description: "Issue identity is the code, affected path, and repair field composite.",
  },
  {
    id: "report-path-normalization",
    kind: "normalization",
    rule: "posix-relative-no-dot-segments",
    targets: [
      { role: "affected", path: "/issues/*/affectedPath" },
      { role: "destination", path: "/issues/*/repair/destinationPath" },
      { role: "evidence", path: "/issues/*/evidencePaths/*" },
      { role: "target", path: "/issues/*/repair/targetPath" },
    ],
    description: "Report paths use POSIX separators and contain no absolute or dot segments.",
  },
  {
    id: "summary-count-relationship",
    kind: "cross-field-relationship",
    rule: "count-equals-array-length",
    targets: [
      { role: "array", path: "/issues" },
      { role: "error-count", path: "/summary/errorCount" },
      { role: "issue-count", path: "/summary/issueCount" },
    ],
    description: "Both summary counts equal the number of error issues.",
  },
]

const INPUT = {
  publicInterface: "benchmarks/skill-ir/pilots/bids/public-interface.json",
  developmentTasks: "benchmarks/skill-ir/pilots/bids/development/tasks.json",
  bidsSchema: "benchmarks/skill-ir/pilots/bids/source/references/bids_schema.json",
  metadataFields: "benchmarks/skill-ir/pilots/bids/source/references/metadata_fields.md",
  evaluator: "src/bench/evaluators/bids-grade.ts",
  valueSemanticsAudit: "src/benchmarks/skill-ir/public-json-contract-disclosure.ts",
  bidsPreflight: "src/benchmarks/skill-ir/bids-value-semantics-preflight.ts",
  oldContractAudit: "results/skill-ir/bids-contract-audit-v1/report.json",
  residualAudit: "results/skill-ir/bids-prospective-development-v1/residual-audit.json",
} as const
const INPUT_PATHS = Object.values(INPUT)

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function boundFile(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.resolve(rootDir, ...relativePath.split("/")))
  return BoundFileSchema.parse({ path: relativePath, sha256: sha256(bytes) })
}

function clone(report: BidsAuditReport): BidsAuditReport {
  return structuredClone(report)
}

function observation(
  id: string,
  semanticId: string,
  role: PublicJsonValueSemanticCanary["role"],
  accepted: boolean,
): PublicJsonValueSemanticCanary {
  return { id, semanticId, role, observed: accepted ? "accepted" : "rejected" }
}

function requireIssue(report: BidsAuditReport) {
  const issue = report.issues[0]
  if (!issue) throw new Error("BIDS value-semantics canary requires at least one issue")
  return issue
}

function buildCanaries(canonical: BidsAuditReport[]): PublicJsonValueSemanticCanary[] {
  const first = canonical[0]!
  const second = canonical[1]!
  const firstIssue = requireIssue(first)
  const evidenceReport = canonical.find((report) =>
    report.issues.some((issue) => issue.evidencePaths.length > 1)
  ) ?? second
  const evidenceIssueIndex = evidenceReport.issues.findIndex((issue) => issue.evidencePaths.length > 1)
  if (evidenceIssueIndex < 0) throw new Error("BIDS evidence-order canary requires multiple evidence paths")

  const reversedIssues = clone(first)
  reversedIssues.issues.reverse()
  const missingIssue = clone(first)
  missingIssue.issues.shift()

  const reversedEvidence = clone(evidenceReport)
  reversedEvidence.issues[evidenceIssueIndex]!.evidencePaths.reverse()
  const wrongEvidence = clone(evidenceReport)
  wrongEvidence.issues[evidenceIssueIndex]!.evidencePaths[0] = "references/other.md"

  const duplicatedIssue = clone(first)
  duplicatedIssue.issues.push(structuredClone(firstIssue))
  duplicatedIssue.summary.issueCount += 1
  duplicatedIssue.summary.errorCount += 1

  const wrongAffectedPath = clone(first)
  requireIssue(wrongAffectedPath).affectedPath = "different/logical-file.nii.gz"
  const unnormalizedPath = clone(first)
  requireIssue(unnormalizedPath).affectedPath = `./${firstIssue.affectedPath}`
  const wrongSummary = clone(first)
  wrongSummary.summary.issueCount += 1

  return [
    observation("issues-order-canonical", "issues-order-equivalence", "canonical", bidsReportsMatch(first, first)),
    observation("issues-order-alternative", "issues-order-equivalence", "alternative-valid", bidsReportsMatch(reversedIssues, first)),
    observation("issues-order-invalid", "issues-order-equivalence", "invalid", bidsReportsMatch(missingIssue, first)),
    observation("evidence-order-canonical", "evidence-paths-order-equivalence", "canonical", bidsReportsMatch(evidenceReport, evidenceReport)),
    observation("evidence-order-alternative", "evidence-paths-order-equivalence", "alternative-valid", bidsReportsMatch(reversedEvidence, evidenceReport)),
    observation("evidence-order-invalid", "evidence-paths-order-equivalence", "invalid", bidsReportsMatch(wrongEvidence, evidenceReport)),
    observation("affected-path-canonical", "affected-path-canonical-role", "canonical", bidsReportsMatch(first, first)),
    observation("affected-path-invalid", "affected-path-canonical-role", "invalid", bidsReportsMatch(wrongAffectedPath, first)),
    observation("evidence-path-canonical", "evidence-path-canonical-role", "canonical", bidsReportsMatch(evidenceReport, evidenceReport)),
    observation("evidence-path-invalid", "evidence-path-canonical-role", "invalid", bidsReportsMatch(wrongEvidence, evidenceReport)),
    observation("issue-identity-canonical", "issue-element-identity", "canonical", bidsReportsMatch(first, first)),
    observation("issue-identity-alternative", "issue-element-identity", "alternative-valid", bidsReportsMatch(reversedIssues, first)),
    observation("issue-identity-invalid", "issue-element-identity", "invalid", bidsReportsMatch(duplicatedIssue, first)),
    observation("path-normalization-canonical", "report-path-normalization", "canonical", bidsReportsMatch(first, first)),
    observation("path-normalization-invalid", "report-path-normalization", "invalid", bidsReportsMatch(unnormalizedPath, first)),
    observation("summary-relationship-canonical", "summary-count-relationship", "canonical", bidsReportsMatch(first, first)),
    observation("summary-relationship-invalid", "summary-count-relationship", "invalid", bidsReportsMatch(wrongSummary, first)),
  ]
}

export async function buildBidsValueSemanticsPreflight(input: { rootDir: string }) {
  const [publicText, tasksText, oldAuditText, residualText] = await Promise.all([
    readFile(path.resolve(input.rootDir, INPUT.publicInterface), "utf8"),
    readFile(path.resolve(input.rootDir, INPUT.developmentTasks), "utf8"),
    readFile(path.resolve(input.rootDir, INPUT.oldContractAudit), "utf8"),
    readFile(path.resolve(input.rootDir, INPUT.residualAudit), "utf8"),
  ])
  const publicInterface = PublicInterfaceSchema.parse(JSON.parse(publicText))
  const taskSet = BidsTaskSetSchema.parse(JSON.parse(tasksText))
  const oldAudit = OldContractAuditSchema.parse(JSON.parse(oldAuditText))
  const residual = ResidualAuditSchema.parse(JSON.parse(residualText))
  if (publicInterface.reportContract.issues.order !== "set-like"
    || publicInterface.reportContract.issues.evidencePaths.order !== "set-like") {
    throw new Error("BIDS v1 public set-like semantics drift")
  }
  const sourceRules = await loadBidsSourceRules(input.rootDir)
  const canonical = await Promise.all(taskSet.tasks.map((task) =>
    deriveBidsAuditOracle(JSON.parse(task.fixtures["dataset-manifest.json"]!), sourceRules)
  ))
  const valueSemanticsDisclosure = auditPublicJsonValueSemanticsDisclosure({
    outputPath: "bids-audit.json",
    publicSemantics: PUBLIC_SEMANTICS,
    evaluatorSemantics: EVALUATOR_SEMANTICS,
    canaries: buildCanaries(canonical),
  })
  const inputs = await Promise.all(INPUT_PATHS.map((relativePath) => boundFile(input.rootDir, relativePath)))
  return {
    schemaVersion: "skill-ir-bids-value-semantics-preflight/v1" as const,
    auditId: "bids-v1-value-semantics-preflight" as const,
    status: "blocked-before-paid" as const,
    inputs,
    pointerDisclosure: oldAudit.disclosure,
    valueSemanticsDisclosure,
    historicalEvidence: {
      pointerAuditPreserved: oldAudit.status === "passed",
      residualInvalidityPreserved: residual.status === "measurement-invalid",
      residualAuditConsumed: true as const,
      modelOutputContentConsumed: false as const,
      heldOutConsumed: false as const,
    },
    authorizations: {
      qualification: false as const,
      paidExecution: false as const,
      dynamic: false as const,
      heldOut: false as const,
      readinessPromotion: false as const,
    },
    claimBoundary: "This development-only preflight proves that BIDS v1 pointer closure did not disclose every evaluator value semantic. It preserves all frozen v1 evidence and blocks qualification, paid execution, rescoring, dynamic, held-out, and readiness promotion.",
  }
}

export async function writeBidsValueSemanticsPreflight(input: {
  rootDir: string
  outputPath: string
}) {
  const report = await buildBidsValueSemanticsPreflight({ rootDir: input.rootDir })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const rootDir = process.cwd()
  const outputPath = path.join(rootDir, "results/skill-ir/bids-value-semantics-preflight-v1.json")
  const report = await writeBidsValueSemanticsPreflight({ rootDir, outputPath })
  console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath).replaceAll("\\", "/"), status: report.status }))
}
