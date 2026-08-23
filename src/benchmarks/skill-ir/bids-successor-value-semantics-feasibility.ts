import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  BidsDatasetManifestSchema,
  BidsTaskSetSchema,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
  type BidsAuditReport,
  type BidsDatasetManifest,
} from "./bids-contract.ts"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")
const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

const MissingSemanticIdSchema = z.enum([
  "affected-path-canonical-role",
  "evidence-path-canonical-role",
  "issue-element-identity",
  "report-path-normalization",
  "summary-count-relationship",
])
const SuccessorTreatmentSchema = z.enum([
  "generalize-to-repair-related-manifest-path",
  "replace-with-repair-related-manifest-evidence",
  "replace-with-semantic-repair-identity",
  "retain-public-obligation",
])
const CanaryRoleSchema = z.enum(["canonical", "alternative-valid", "invalid"])
const CanarySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  semanticId: MissingSemanticIdSchema,
  role: CanaryRoleSchema,
  expected: z.enum(["accepted", "rejected"]),
  observed: z.enum(["accepted", "rejected"]),
  passed: z.boolean(),
}).strict()
const AssessmentSchema = z.object({
  id: MissingSemanticIdSchema,
  v1Classification: z.enum(["measurement-obligation", "evaluator-over-specificity"]),
  successorTreatment: SuccessorTreatmentSchema,
  sourceDerivable: z.literal(true),
  generalTaskRule: z.literal(true),
  answerBearing: z.literal(false),
  canaryBacked: z.literal(true),
  publicRule: z.string().trim().min(1),
  sourceBasis: z.array(SafeRelativePathSchema).min(1),
}).strict()

export const BidsSuccessorValueSemanticsFeasibilitySchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-value-semantics-feasibility/v1"),
  auditId: z.literal("bids-successor-value-semantics-feasibility-v1"),
  status: z.literal("feasible-with-evaluator-redesign"),
  inputs: z.array(BoundFileSchema).min(1),
  assessments: z.array(AssessmentSchema).length(5),
  canaries: z.array(CanarySchema).length(15),
  counts: z.object({
    missingV1Semantics: z.literal(5),
    retainedPublicObligations: z.literal(2),
    generalizedSemantics: z.literal(1),
    replacedEvaluatorSpecificities: z.literal(2),
    canaries: z.literal(15),
    failedCanaries: z.literal(0),
  }).strict(),
  decision: z.object({
    continueBids: z.literal(true),
    preserveV1: z.literal(true),
    requiresNewMeasurementIdentity: z.literal(true),
    requiresEvaluatorRedesign: z.literal(true),
    nextStage: z.literal("freeze-successor-contract-and-scorer-before-any-paid-run"),
  }).strict(),
  historicalEvidence: z.object({
    bidsV1Preserved: z.literal(true),
    residualAuditConsumed: z.literal(true),
    valuePreflightConsumed: z.literal(true),
    modelOutputContentConsumed: z.literal(false),
    heldOutConsumed: z.literal(false),
  }).strict(),
  authorizations: z.object({
    successorIdentityFreeze: z.literal(true),
    qualification: z.literal(false),
    paidExecution: z.literal(false),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This development-only feasibility audit shows that a BIDS successor can disclose and canary-test its value semantics after removing v1 evaluator over-specificity. It authorizes only freezing a new measurement identity; it does not authorize rescoring v1, model execution, qualification, dynamic repair, held-out use, or readiness promotion.",
  ),
}).strict()

export type BidsSuccessorValueSemanticsFeasibility = z.infer<
  typeof BidsSuccessorValueSemanticsFeasibilitySchema
>

const INPUT = {
  publicInterface: "benchmarks/skill-ir/pilots/bids/public-interface.json",
  developmentTasks: "benchmarks/skill-ir/pilots/bids/development/tasks.json",
  bidsSchema: "benchmarks/skill-ir/pilots/bids/source/references/bids_schema.json",
  metadataFields: "benchmarks/skill-ir/pilots/bids/source/references/metadata_fields.md",
  contractImplementation: "src/benchmarks/skill-ir/bids-contract.ts",
  evaluator: "src/bench/evaluators/bids-grade.ts",
  valuePreflight: "results/skill-ir/bids-value-semantics-preflight-v1.json",
  residualAudit: "results/skill-ir/bids-prospective-development-v1/residual-audit.json",
  implementation: "src/benchmarks/skill-ir/bids-successor-value-semantics-feasibility.ts",
} as const

const EXPECTED_MISSING = MissingSemanticIdSchema.options

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function boundFile(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.resolve(rootDir, ...relativePath.split("/")))
  return BoundFileSchema.parse({ path: relativePath, sha256: sha256(bytes) })
}

function exactSidecar(dataPath: string): string {
  return dataPath.replace(/\.nii(?:\.gz)?$/u, ".json")
}

function repairRelatedManifestPaths(
  issue: BidsAuditReport["issues"][number],
  manifest: BidsDatasetManifest,
): Set<string> {
  const manifestPaths = new Set(manifest.files.map((file) => file.path))
  if (issue.repair.operation === "rename") {
    return new Set(manifestPaths.has(issue.repair.targetPath) ? [issue.repair.targetPath] : [])
  }
  const related = new Set<string>()
  if (manifestPaths.has(issue.repair.targetPath)) related.add(issue.repair.targetPath)
  for (const file of manifest.files) {
    if (file.kind === "data" && exactSidecar(file.path) === issue.repair.targetPath) related.add(file.path)
  }
  return related
}

function affectedPathAccepted(
  issue: BidsAuditReport["issues"][number],
  manifest: BidsDatasetManifest,
): boolean {
  return repairRelatedManifestPaths(issue, manifest).has(issue.affectedPath)
}

function evidencePathsAccepted(
  issue: BidsAuditReport["issues"][number],
  manifest: BidsDatasetManifest,
): boolean {
  const related = repairRelatedManifestPaths(issue, manifest)
  return issue.evidencePaths.length > 0
    && new Set(issue.evidencePaths).size === issue.evidencePaths.length
    && issue.evidencePaths.every((candidate) => related.has(candidate))
}

function repairIdentity(issue: BidsAuditReport["issues"][number]): string {
  return JSON.stringify({ code: issue.code, severity: issue.severity, repair: issue.repair })
}

function issueIdentitiesAccepted(issues: BidsAuditReport["issues"]): boolean {
  const identities = issues.map(repairIdentity)
  return new Set(identities).size === identities.length
}

function pathsNormalized(issue: BidsAuditReport["issues"][number]): boolean {
  return [
    issue.affectedPath,
    ...issue.evidencePaths,
    issue.repair.targetPath,
    issue.repair.destinationPath,
  ].filter((candidate): candidate is string => candidate !== null)
    .every((candidate) => SafeRelativePathSchema.safeParse(candidate).success)
}

function summaryAccepted(report: BidsAuditReport): boolean {
  return report.summary.issueCount === report.issues.length
    && report.summary.errorCount === report.issues.filter((issue) => issue.severity === "error").length
}

function canary(
  id: string,
  semanticId: z.infer<typeof MissingSemanticIdSchema>,
  role: z.infer<typeof CanaryRoleSchema>,
  accepted: boolean,
) {
  const expected = role === "invalid" ? "rejected" as const : "accepted" as const
  const observed = accepted ? "accepted" as const : "rejected" as const
  return CanarySchema.parse({ id, semanticId, role, expected, observed, passed: expected === observed })
}

function buildCanaries(input: {
  manifests: BidsDatasetManifest[]
  reports: BidsAuditReport[]
}) {
  const entityManifest = input.manifests[0]!
  const metadataManifest = input.manifests[1]!
  const entityIssue = input.reports[0]!.issues.find((issue) => issue.code === "ENTITY_ORDER")
  const mismatchIssue = input.reports[1]!.issues.find((issue) => issue.code === "TASK_NAME_MISMATCH")
  if (!entityIssue || !mismatchIssue) throw new Error("BIDS feasibility canaries require entity-order and task-name issues")
  const relatedMismatchPaths = [...repairRelatedManifestPaths(mismatchIssue, metadataManifest)]
  if (relatedMismatchPaths.length < 2) {
    throw new Error("BIDS feasibility evidence canary requires two repair-related manifest paths")
  }

  const alternativeAffected = structuredClone(mismatchIssue)
  alternativeAffected.affectedPath = relatedMismatchPaths.find((candidate) => candidate !== mismatchIssue.affectedPath)!
  const invalidAffected = structuredClone(mismatchIssue)
  invalidAffected.affectedPath = "dataset_description.json"

  const canonicalEvidence = structuredClone(mismatchIssue)
  canonicalEvidence.evidencePaths = [mismatchIssue.affectedPath]
  const alternativeEvidence = structuredClone(mismatchIssue)
  alternativeEvidence.evidencePaths = [alternativeAffected.affectedPath]
  const invalidEvidence = structuredClone(mismatchIssue)
  invalidEvidence.evidencePaths = ["dataset_description.json"]

  const alternativeIdentity = structuredClone(mismatchIssue)
  alternativeIdentity.affectedPath = alternativeAffected.affectedPath
  alternativeIdentity.evidencePaths = [alternativeAffected.affectedPath]
  const duplicateIdentity = structuredClone(alternativeIdentity)

  const unnormalized = structuredClone(entityIssue)
  unnormalized.affectedPath = `./${entityIssue.affectedPath}`

  const canonicalSummary = structuredClone(input.reports[1]!)
  const reorderedSummary = structuredClone(canonicalSummary)
  reorderedSummary.issues.reverse()
  const invalidSummary = structuredClone(canonicalSummary)
  invalidSummary.summary.issueCount += 1

  return [
    canary("affected-role-canonical", "affected-path-canonical-role", "canonical", affectedPathAccepted(mismatchIssue, metadataManifest)),
    canary("affected-role-alternative", "affected-path-canonical-role", "alternative-valid", affectedPathAccepted(alternativeAffected, metadataManifest)),
    canary("affected-role-invalid", "affected-path-canonical-role", "invalid", affectedPathAccepted(invalidAffected, metadataManifest)),
    canary("evidence-role-canonical", "evidence-path-canonical-role", "canonical", evidencePathsAccepted(canonicalEvidence, metadataManifest)),
    canary("evidence-role-alternative", "evidence-path-canonical-role", "alternative-valid", evidencePathsAccepted(alternativeEvidence, metadataManifest)),
    canary("evidence-role-invalid", "evidence-path-canonical-role", "invalid", evidencePathsAccepted(invalidEvidence, metadataManifest)),
    canary("issue-identity-canonical", "issue-element-identity", "canonical", issueIdentitiesAccepted([mismatchIssue])),
    canary("issue-identity-alternative", "issue-element-identity", "alternative-valid", repairIdentity(mismatchIssue) === repairIdentity(alternativeIdentity)),
    canary("issue-identity-invalid", "issue-element-identity", "invalid", issueIdentitiesAccepted([mismatchIssue, duplicateIdentity])),
    canary("path-normalization-canonical", "report-path-normalization", "canonical", pathsNormalized(entityIssue)),
    canary("path-normalization-alternative", "report-path-normalization", "alternative-valid", pathsNormalized(alternativeAffected)),
    canary("path-normalization-invalid", "report-path-normalization", "invalid", pathsNormalized(unnormalized)),
    canary("summary-relationship-canonical", "summary-count-relationship", "canonical", summaryAccepted(canonicalSummary)),
    canary("summary-relationship-alternative", "summary-count-relationship", "alternative-valid", summaryAccepted(reorderedSummary)),
    canary("summary-relationship-invalid", "summary-count-relationship", "invalid", summaryAccepted(invalidSummary)),
  ]
}

function assessments(): z.infer<typeof AssessmentSchema>[] {
  const contractSource = "src/benchmarks/skill-ir/bids-contract.ts"
  return [
    {
      id: "affected-path-canonical-role",
      v1Classification: "measurement-obligation",
      successorTreatment: "generalize-to-repair-related-manifest-path",
      sourceDerivable: true,
      generalTaskRule: true,
      answerBearing: false,
      canaryBacked: true,
      publicRule: "affectedPath must name a dataset-manifest entry that is the repair target or its corresponding logical data file.",
      sourceBasis: [contractSource, INPUT.bidsSchema],
    },
    {
      id: "evidence-path-canonical-role",
      v1Classification: "evaluator-over-specificity",
      successorTreatment: "replace-with-repair-related-manifest-evidence",
      sourceDerivable: true,
      generalTaskRule: true,
      answerBearing: false,
      canaryBacked: true,
      publicRule: "evidencePaths must contain unique dataset-manifest entries related to the issue repair; source-reference filenames are not semantic answers.",
      sourceBasis: [contractSource, INPUT.metadataFields],
    },
    {
      id: "issue-element-identity",
      v1Classification: "evaluator-over-specificity",
      successorTreatment: "replace-with-semantic-repair-identity",
      sourceDerivable: true,
      generalTaskRule: true,
      answerBearing: false,
      canaryBacked: true,
      publicRule: "Issue identity is code, severity, and the complete semantic repair; affected/evidence path presentation does not create another issue.",
      sourceBasis: [contractSource, INPUT.evaluator],
    },
    {
      id: "report-path-normalization",
      v1Classification: "measurement-obligation",
      successorTreatment: "retain-public-obligation",
      sourceDerivable: true,
      generalTaskRule: true,
      answerBearing: false,
      canaryBacked: true,
      publicRule: "Every report path is relative POSIX syntax with no empty, absolute, dot, or parent segments.",
      sourceBasis: [contractSource, INPUT.bidsSchema],
    },
    {
      id: "summary-count-relationship",
      v1Classification: "measurement-obligation",
      successorTreatment: "retain-public-obligation",
      sourceDerivable: true,
      generalTaskRule: true,
      answerBearing: false,
      canaryBacked: true,
      publicRule: "issueCount equals issues.length and errorCount equals the number of error-severity issues.",
      sourceBasis: [contractSource],
    },
  ].map((assessment) => AssessmentSchema.parse(assessment))
}

export async function buildBidsSuccessorValueSemanticsFeasibility(input: { rootDir: string }) {
  const rootDir = path.resolve(input.rootDir)
  const [tasksText, preflightText, residualText] = await Promise.all([
    readFile(path.join(rootDir, INPUT.developmentTasks), "utf8"),
    readFile(path.join(rootDir, INPUT.valuePreflight), "utf8"),
    readFile(path.join(rootDir, INPUT.residualAudit), "utf8"),
  ])
  const taskSet = BidsTaskSetSchema.parse(JSON.parse(tasksText))
  const preflight = z.object({
    schemaVersion: z.literal("skill-ir-bids-value-semantics-preflight/v1"),
    status: z.literal("blocked-before-paid"),
    valueSemanticsDisclosure: z.object({
      undisclosedEvaluatorSemanticIds: z.array(MissingSemanticIdSchema).length(5),
    }).passthrough(),
  }).passthrough().parse(JSON.parse(preflightText))
  z.object({
    schemaVersion: z.literal("skill-ir-bids-prospective-residual-audit/v1"),
    status: z.literal("measurement-invalid"),
  }).passthrough().parse(JSON.parse(residualText))
  if (JSON.stringify([...preflight.valueSemanticsDisclosure.undisclosedEvaluatorSemanticIds].sort())
    !== JSON.stringify([...EXPECTED_MISSING].sort())) {
    throw new Error("BIDS v1 missing value-semantics set drift")
  }
  const manifests = taskSet.tasks.map((task) =>
    BidsDatasetManifestSchema.parse(JSON.parse(task.fixtures["dataset-manifest.json"]!))
  )
  const sourceRules = await loadBidsSourceRules(rootDir)
  const reports = await Promise.all(manifests.map((manifest) => deriveBidsAuditOracle(manifest, sourceRules)))
  const canaries = buildCanaries({ manifests, reports })
  const failedCanaries = canaries.filter((item) => !item.passed).length
  if (failedCanaries > 0) throw new Error(`BIDS successor feasibility has ${failedCanaries} failed canaries`)

  return BidsSuccessorValueSemanticsFeasibilitySchema.parse({
    schemaVersion: "skill-ir-bids-successor-value-semantics-feasibility/v1",
    auditId: "bids-successor-value-semantics-feasibility-v1",
    status: "feasible-with-evaluator-redesign",
    inputs: await Promise.all(Object.values(INPUT).map((relativePath) => boundFile(rootDir, relativePath))),
    assessments: assessments(),
    canaries,
    counts: {
      missingV1Semantics: 5,
      retainedPublicObligations: 2,
      generalizedSemantics: 1,
      replacedEvaluatorSpecificities: 2,
      canaries: canaries.length,
      failedCanaries,
    },
    decision: {
      continueBids: true,
      preserveV1: true,
      requiresNewMeasurementIdentity: true,
      requiresEvaluatorRedesign: true,
      nextStage: "freeze-successor-contract-and-scorer-before-any-paid-run",
    },
    historicalEvidence: {
      bidsV1Preserved: true,
      residualAuditConsumed: true,
      valuePreflightConsumed: true,
      modelOutputContentConsumed: false,
      heldOutConsumed: false,
    },
    authorizations: {
      successorIdentityFreeze: true,
      qualification: false,
      paidExecution: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    claimBoundary:
      "This development-only feasibility audit shows that a BIDS successor can disclose and canary-test its value semantics after removing v1 evaluator over-specificity. It authorizes only freezing a new measurement identity; it does not authorize rescoring v1, model execution, qualification, dynamic repair, held-out use, or readiness promotion.",
  })
}

export async function writeBidsSuccessorValueSemanticsFeasibility(input: {
  rootDir: string
  outputPath: string
}) {
  const report = await buildBidsSuccessorValueSemanticsFeasibility({ rootDir: input.rootDir })
  await mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true })
  await writeFile(path.resolve(input.outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const rootDir = process.cwd()
  const outputPath = path.join(rootDir, "results/skill-ir/bids-successor-value-semantics-feasibility-v1.json")
  const report = await writeBidsSuccessorValueSemanticsFeasibility({ rootDir, outputPath })
  console.log(JSON.stringify({
    outputPath: path.relative(rootDir, outputPath).replaceAll("\\", "/"),
    status: report.status,
  }))
}
