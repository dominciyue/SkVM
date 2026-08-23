import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  BidsDatasetManifestSchema,
  BIDS_SOURCE_RULE_BINDINGS,
} from "./bids-contract.ts"
import {
  BidsSuccessorAuditReportSchema,
  BidsSuccessorTaskSetSchema,
  buildBidsSuccessorDevelopmentTaskSet,
  buildBidsSuccessorPublicInterface,
  deriveBidsSuccessorAuditOracle,
  loadBidsSuccessorSourceRules,
  type BidsSuccessorAuditReport,
} from "./bids-successor-contract.ts"
import {
  auditPublicJsonContractDisclosure,
  auditPublicJsonValueSemanticsDisclosure,
  type PublicJsonValueSemanticCanary,
} from "./public-json-contract-disclosure.ts"
import {
  BIDS_SUCCESSOR_EVALUATOR_FIELD_PATHS,
  BIDS_SUCCESSOR_EVALUATOR_VALUE_SEMANTICS,
  bidsSuccessorReportsMatch,
  repairRelatedManifestPaths,
} from "../../bench/evaluators/bids-successor-grade.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const PointerDisclosureSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-json-contract-disclosure-audit/v1"),
  outputPath: z.literal("bids-audit.json"),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    publicFieldPaths: z.number().int().nonnegative(),
    evaluatorFieldPaths: z.number().int().nonnegative(),
    undisclosedEvaluatorFieldPaths: z.number().int().nonnegative(),
  }).strict(),
  undisclosedEvaluatorFieldPaths: z.array(z.string()),
}).strict()
const ValueDisclosureSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-json-value-semantics-disclosure-audit/v1"),
  outputPath: z.literal("bids-audit.json"),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    publicSemantics: z.number().int().nonnegative(),
    evaluatorSemantics: z.number().int().nonnegative(),
    undisclosedEvaluatorSemantics: z.number().int().nonnegative(),
    mismatchedEvaluatorSemantics: z.number().int().nonnegative(),
    canaries: z.number().int().nonnegative(),
    missingCanaryRoles: z.number().int().nonnegative(),
    failedCanaries: z.number().int().nonnegative(),
  }).strict(),
  undisclosedEvaluatorSemanticIds: z.array(z.string()),
  mismatchedEvaluatorSemanticIds: z.array(z.string()),
  missingCanaryRoles: z.array(z.object({
    semanticId: z.string(),
    roles: z.array(z.enum(["canonical", "alternative-valid", "invalid"])),
  }).strict()),
  failedCanaryIds: z.array(z.string()),
}).strict()
const CanarySchema = z.object({
  id: z.string().min(1),
  semanticId: z.string().min(1),
  role: z.enum(["canonical", "alternative-valid", "invalid"]),
  observed: z.enum(["accepted", "rejected"]),
}).strict()

export const BidsSuccessorContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-contract-audit/v1"),
  auditId: z.literal("bids-successor-contract-and-scorer-freeze-v1"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  status: z.enum(["passed", "failed"]),
  identityClosure: z.object({
    publicInterface: BoundFileSchema,
    developmentTasks: BoundFileSchema,
    scorer: BoundFileSchema,
    contractImplementation: BoundFileSchema,
    auditImplementation: BoundFileSchema,
    sourceRules: z.array(BoundFileSchema).length(2),
    implementationDependencies: z.array(BoundFileSchema).min(1),
    predecessorEvidence: z.array(BoundFileSchema).min(1),
  }).strict(),
  pointerDisclosure: PointerDisclosureSchema,
  valueSemanticsDisclosure: ValueDisclosureSchema,
  canaries: z.array(CanarySchema).length(21),
  roles: z.object({
    canonicalReportsAccepted: z.boolean(),
    dataSidecarRepresentationsAccepted: z.boolean(),
    unrelatedManifestPathRejected: z.boolean(),
    duplicateSemanticRepairRejected: z.boolean(),
    nonNormalizedPathRejected: z.boolean(),
    wrongSummaryRejected: z.boolean(),
    semanticOmissionRejected: z.boolean(),
  }).strict(),
  semanticDelta: z.object({
    retained: z.tuple([z.literal("report-path-normalization"), z.literal("summary-count-relationship")]),
    generalized: z.tuple([z.literal("affected-path-repair-related-role")]),
    replaced: z.tuple([
      z.literal("repair-related-manifest-evidence"),
      z.literal("issue-semantic-repair-identity"),
    ]),
  }).strict(),
  compatibility: z.object({
    bidsV1Preserved: z.literal(true),
    bidsV1Rescored: z.literal(false),
    taskProblemSemanticsReused: z.literal(true),
    agentVisibleContractCompatible: z.literal(false),
    historicalClaimsChanged: z.literal(false),
  }).strict(),
  historicalEvidence: z.object({
    feasibilityAuditConsumed: z.literal(true),
    modelOutputContentConsumed: z.literal(false),
    heldOutConsumed: z.literal(false),
  }).strict(),
  authorizations: z.object({
    successorIdentityFrozen: z.boolean(),
    qualification: z.literal(false),
    paidExecution: z.literal(false),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This deterministic freeze proves pointer closure, public value-semantics disclosure, and semantic scorer canaries for a new BIDS measurement identity. It preserves BIDS v1 and does not authorize rescoring, qualification, paid execution, model-quality claims, dynamic repair, held-out use, or readiness promotion.",
  ),
}).strict()

export type BidsSuccessorContractAuditReport = z.infer<typeof BidsSuccessorContractAuditReportSchema>

const FILES = {
  publicInterface: "benchmarks/skill-ir/pilots/bids/successor-v2/public-interface.json",
  developmentTasks: "benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json",
  scorer: "src/bench/evaluators/bids-successor-grade.ts",
  contractImplementation: "src/benchmarks/skill-ir/bids-successor-contract.ts",
  auditImplementation: "src/benchmarks/skill-ir/bids-successor-contract-audit.ts",
  disclosureImplementation: "src/benchmarks/skill-ir/public-json-contract-disclosure.ts",
  v1ContractImplementation: "src/benchmarks/skill-ir/bids-contract.ts",
  workdirManifestImplementation: "src/core/workdir-manifest.ts",
  evaluatorTypesImplementation: "src/framework/types.ts",
  v1PublicInterface: "benchmarks/skill-ir/pilots/bids/public-interface.json",
  v1DevelopmentTasks: "benchmarks/skill-ir/pilots/bids/development/tasks.json",
  v1Scorer: "src/bench/evaluators/bids-grade.ts",
  feasibility: "results/skill-ir/bids-successor-value-semantics-feasibility-v1.json",
} as const

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function boundFile(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.resolve(rootDir, ...relativePath.split("/")))
  return BoundFileSchema.parse({ path: relativePath, sha256: sha256(bytes) })
}

function observed(
  id: string,
  semanticId: string,
  role: PublicJsonValueSemanticCanary["role"],
  accepted: boolean,
): PublicJsonValueSemanticCanary {
  return { id, semanticId, role, observed: accepted ? "accepted" : "rejected" }
}

function requireMetadataFixture(
  manifests: ReturnType<typeof BidsDatasetManifestSchema.parse>[],
  reports: BidsSuccessorAuditReport[],
) {
  const manifest = manifests[1]!
  const report = reports[1]!
  const issueIndex = report.issues.findIndex((issue) => issue.code === "TASK_NAME_MISMATCH")
  if (issueIndex < 0) throw new Error("BIDS successor audit requires TASK_NAME_MISMATCH")
  const issue = report.issues[issueIndex]!
  const related = [...repairRelatedManifestPaths(issue.repair, manifest)]
  if (related.length < 2) throw new Error("BIDS successor audit requires data/sidecar alternatives")
  const alternativePath = related.find((candidate) => candidate !== issue.affectedPath)
  if (!alternativePath) throw new Error("BIDS successor audit could not select an alternative repair path")
  return { manifest, report, issueIndex, issue, related, alternativePath }
}

function buildCanaries(
  manifests: ReturnType<typeof BidsDatasetManifestSchema.parse>[],
  reports: BidsSuccessorAuditReport[],
): PublicJsonValueSemanticCanary[] {
  const { manifest, report, issueIndex, issue, related, alternativePath } = requireMetadataFixture(manifests, reports)

  const reorderedIssues = structuredClone(report)
  reorderedIssues.issues.reverse()
  const omitted = structuredClone(report)
  omitted.issues.pop()
  omitted.summary.issueCount -= 1
  omitted.summary.errorCount -= 1

  const reorderedEvidence = structuredClone(report)
  reorderedEvidence.issues[issueIndex]!.evidencePaths = [...related].reverse()
  const unrelatedEvidence = structuredClone(report)
  unrelatedEvidence.issues[issueIndex]!.evidencePaths = ["dataset_description.json"]

  const alternativeAffected = structuredClone(report)
  alternativeAffected.issues[issueIndex]!.affectedPath = alternativePath
  const unrelatedAffected = structuredClone(report)
  unrelatedAffected.issues[issueIndex]!.affectedPath = "dataset_description.json"

  const alternativeEvidence = structuredClone(report)
  alternativeEvidence.issues[issueIndex]!.evidencePaths = [alternativePath]

  const alternativeIdentity = structuredClone(report)
  alternativeIdentity.issues[issueIndex]!.affectedPath = alternativePath
  alternativeIdentity.issues[issueIndex]!.evidencePaths = [alternativePath]
  const duplicateIdentity = structuredClone(report)
  const duplicate = structuredClone(issue)
  duplicate.affectedPath = alternativePath
  duplicate.evidencePaths = [alternativePath]
  duplicateIdentity.issues.push(duplicate)
  duplicateIdentity.summary.issueCount += 1
  duplicateIdentity.summary.errorCount += 1

  const nonNormalized = structuredClone(report)
  nonNormalized.issues[issueIndex]!.affectedPath = `./${issue.affectedPath}`
  const wrongSummary = structuredClone(report)
  wrongSummary.summary.issueCount += 1

  const match = (candidate: unknown) => bidsSuccessorReportsMatch(candidate, report, manifest)
  return [
    observed("issues-order-canonical", "issues-order-equivalence", "canonical", match(report)),
    observed("issues-order-alternative", "issues-order-equivalence", "alternative-valid", match(reorderedIssues)),
    observed("issues-order-invalid", "issues-order-equivalence", "invalid", match(omitted)),
    observed("evidence-order-canonical", "evidence-paths-order-equivalence", "canonical", match(report)),
    observed("evidence-order-alternative", "evidence-paths-order-equivalence", "alternative-valid", match(reorderedEvidence)),
    observed("evidence-order-invalid", "evidence-paths-order-equivalence", "invalid", match(unrelatedEvidence)),
    observed("affected-role-canonical", "affected-path-repair-related-role", "canonical", match(report)),
    observed("affected-role-alternative", "affected-path-repair-related-role", "alternative-valid", match(alternativeAffected)),
    observed("affected-role-invalid", "affected-path-repair-related-role", "invalid", match(unrelatedAffected)),
    observed("manifest-evidence-canonical", "repair-related-manifest-evidence", "canonical", match(report)),
    observed("manifest-evidence-alternative", "repair-related-manifest-evidence", "alternative-valid", match(alternativeEvidence)),
    observed("manifest-evidence-invalid", "repair-related-manifest-evidence", "invalid", match(unrelatedEvidence)),
    observed("semantic-identity-canonical", "issue-semantic-repair-identity", "canonical", match(report)),
    observed("semantic-identity-alternative", "issue-semantic-repair-identity", "alternative-valid", match(alternativeIdentity)),
    observed("semantic-identity-invalid", "issue-semantic-repair-identity", "invalid", match(duplicateIdentity)),
    observed("path-normalization-canonical", "report-path-normalization", "canonical", match(report)),
    observed("path-normalization-alternative", "report-path-normalization", "alternative-valid", match(alternativeAffected)),
    observed("path-normalization-invalid", "report-path-normalization", "invalid", match(nonNormalized)),
    observed("summary-relationship-canonical", "summary-count-relationship", "canonical", match(report)),
    observed("summary-relationship-alternative", "summary-count-relationship", "alternative-valid", match(reorderedIssues)),
    observed("summary-relationship-invalid", "summary-count-relationship", "invalid", match(wrongSummary)),
  ]
}

export async function buildBidsSuccessorContractAudit(input: { rootDir: string }): Promise<BidsSuccessorContractAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const [publicText, tasksText, feasibilityText] = await Promise.all([
    readFile(path.join(rootDir, FILES.publicInterface), "utf8"),
    readFile(path.join(rootDir, FILES.developmentTasks), "utf8"),
    readFile(path.join(rootDir, FILES.feasibility), "utf8"),
  ])
  const publicInterface = JSON.parse(publicText) as ReturnType<typeof buildBidsSuccessorPublicInterface>
  const taskSet = BidsSuccessorTaskSetSchema.parse(JSON.parse(tasksText))
  const feasibility = z.object({
    schemaVersion: z.literal("skill-ir-bids-successor-value-semantics-feasibility/v1"),
    status: z.literal("feasible-with-evaluator-redesign"),
    authorizations: z.object({ successorIdentityFreeze: z.literal(true) }).passthrough(),
  }).passthrough().parse(JSON.parse(feasibilityText))
  const identityArtifactsMatch = isDeepStrictEqual(publicInterface, buildBidsSuccessorPublicInterface())
    && isDeepStrictEqual(taskSet, buildBidsSuccessorDevelopmentTaskSet(publicInterface))

  const pointerDisclosure = auditPublicJsonContractDisclosure({
    outputPath: "bids-audit.json",
    publicFieldPaths: publicInterface.publicFieldPaths,
    evaluatorFieldPaths: [...BIDS_SUCCESSOR_EVALUATOR_FIELD_PATHS],
  })
  const manifests = taskSet.tasks.map((task) =>
    BidsDatasetManifestSchema.parse(JSON.parse(task.fixtures["dataset-manifest.json"]!))
  )
  const sourceRules = await loadBidsSuccessorSourceRules(rootDir)
  const reports = await Promise.all(manifests.map((manifest) => deriveBidsSuccessorAuditOracle(manifest, sourceRules)))
  const canaries = buildCanaries(manifests, reports)
  const valueSemanticsDisclosure = auditPublicJsonValueSemanticsDisclosure({
    outputPath: "bids-audit.json",
    publicSemantics: publicInterface.valueSemantics,
    evaluatorSemantics: BIDS_SUCCESSOR_EVALUATOR_VALUE_SEMANTICS,
    canaries,
  })

  const canary = (id: string) => canaries.find((item) => item.id === id)?.observed
  const roles = {
    canonicalReportsAccepted: reports.every((report, index) =>
      bidsSuccessorReportsMatch(report, report, manifests[index])
    ),
    dataSidecarRepresentationsAccepted: canary("affected-role-alternative") === "accepted"
      && canary("manifest-evidence-alternative") === "accepted",
    unrelatedManifestPathRejected: canary("affected-role-invalid") === "rejected"
      && canary("manifest-evidence-invalid") === "rejected",
    duplicateSemanticRepairRejected: canary("semantic-identity-invalid") === "rejected",
    nonNormalizedPathRejected: canary("path-normalization-invalid") === "rejected",
    wrongSummaryRejected: canary("summary-relationship-invalid") === "rejected",
    semanticOmissionRejected: canary("issues-order-invalid") === "rejected",
  }
  const status = identityArtifactsMatch
    && feasibility.status === "feasible-with-evaluator-redesign"
    && pointerDisclosure.status === "passed"
    && valueSemanticsDisclosure.status === "passed"
    && Object.values(roles).every(Boolean)
    ? "passed" as const
    : "failed" as const

  return BidsSuccessorContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-bids-successor-contract-audit/v1",
    auditId: "bids-successor-contract-and-scorer-freeze-v1",
    measurementIdentity: "bids-successor-semantic-scorer-v2",
    status,
    identityClosure: {
      publicInterface: await boundFile(rootDir, FILES.publicInterface),
      developmentTasks: await boundFile(rootDir, FILES.developmentTasks),
      scorer: await boundFile(rootDir, FILES.scorer),
      contractImplementation: await boundFile(rootDir, FILES.contractImplementation),
      auditImplementation: await boundFile(rootDir, FILES.auditImplementation),
      sourceRules: await Promise.all([
        boundFile(rootDir, BIDS_SOURCE_RULE_BINDINGS.schema.path),
        boundFile(rootDir, BIDS_SOURCE_RULE_BINDINGS.metadata.path),
      ]),
      implementationDependencies: await Promise.all([
        FILES.disclosureImplementation,
        FILES.v1ContractImplementation,
        FILES.workdirManifestImplementation,
        FILES.evaluatorTypesImplementation,
      ].map((relativePath) => boundFile(rootDir, relativePath))),
      predecessorEvidence: await Promise.all([
        FILES.v1PublicInterface,
        FILES.v1DevelopmentTasks,
        FILES.v1Scorer,
        FILES.feasibility,
      ].map((relativePath) => boundFile(rootDir, relativePath))),
    },
    pointerDisclosure,
    valueSemanticsDisclosure,
    canaries,
    roles,
    semanticDelta: {
      retained: ["report-path-normalization", "summary-count-relationship"],
      generalized: ["affected-path-repair-related-role"],
      replaced: ["repair-related-manifest-evidence", "issue-semantic-repair-identity"],
    },
    compatibility: {
      bidsV1Preserved: true,
      bidsV1Rescored: false,
      taskProblemSemanticsReused: true,
      agentVisibleContractCompatible: false,
      historicalClaimsChanged: false,
    },
    historicalEvidence: {
      feasibilityAuditConsumed: true,
      modelOutputContentConsumed: false,
      heldOutConsumed: false,
    },
    authorizations: {
      successorIdentityFrozen: status === "passed",
      qualification: false,
      paidExecution: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    claimBoundary:
      "This deterministic freeze proves pointer closure, public value-semantics disclosure, and semantic scorer canaries for a new BIDS measurement identity. It preserves BIDS v1 and does not authorize rescoring, qualification, paid execution, model-quality claims, dynamic repair, held-out use, or readiness promotion.",
  })
}

export async function writeBidsSuccessorContractAudit(input: { rootDir: string; outputPath: string }) {
  const report = await buildBidsSuccessorContractAudit({ rootDir: input.rootDir })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const rootDir = process.cwd()
  const outputPath = path.join(rootDir, "results/skill-ir/bids-successor-contract-audit-v1.json")
  const report = await writeBidsSuccessorContractAudit({ rootDir, outputPath })
  console.log(JSON.stringify({
    outputPath: path.relative(rootDir, outputPath).replaceAll("\\", "/"),
    status: report.status,
  }))
}
