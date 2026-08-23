import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { PublicJsonValueSemanticDeclaration } from "./public-json-contract-disclosure.ts"
import {
  BIDS_DEVELOPMENT_TASK_IDS,
  BIDS_PUBLIC_FIELD_PATHS,
  BIDS_SOURCE_RULE_BINDINGS,
  BidsDatasetManifestSchema,
  buildBidsDevelopmentTaskSet,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
  type BidsDatasetManifest,
  type BidsSourceRules,
} from "./bids-contract.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const JsonScalarSchema = z.union([z.string(), z.number().finite(), z.null()])

const RepairSchema = z.object({
  operation: z.enum(["rename", "set-json-field"]),
  targetPath: SafeRelativePathSchema,
  destinationPath: SafeRelativePathSchema.nullable(),
  field: z.string().min(1).nullable(),
  value: JsonScalarSchema,
}).strict().superRefine((repair, context) => {
  if (repair.operation === "rename" && (
    repair.destinationPath === null || repair.field !== null || repair.value !== null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "rename repair fields are inconsistent" })
  }
  if (repair.operation === "set-json-field" && (
    repair.destinationPath !== null || repair.field === null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "metadata repair fields are inconsistent" })
  }
})

const IssueSchema = z.object({
  code: z.enum(["ENTITY_ORDER", "MISSING_REQUIRED_METADATA", "TASK_NAME_MISMATCH"]),
  severity: z.literal("error"),
  affectedPath: SafeRelativePathSchema,
  evidencePaths: z.array(SafeRelativePathSchema).min(1),
  repair: RepairSchema,
}).strict().superRefine((issue, context) => {
  if (new Set(issue.evidencePaths).size !== issue.evidencePaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidencePaths"], message: "evidence paths must be unique" })
  }
})

function semanticRepairIdentity(issue: z.infer<typeof IssueSchema>): string {
  return JSON.stringify({ code: issue.code, severity: issue.severity, repair: issue.repair })
}

export const BidsSuccessorAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-audit-report/v2"),
  datasetId: z.string().min(1),
  issues: z.array(IssueSchema),
  summary: z.object({
    issueCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((report, context) => {
  const identities = report.issues.map(semanticRepairIdentity)
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["issues"],
      message: "issues must be unique by code, severity, and complete semantic repair",
    })
  }
  if (report.summary.issueCount !== report.issues.length
    || report.summary.errorCount !== report.issues.filter((issue) => issue.severity === "error").length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["summary"], message: "summary must match issues" })
  }
})

export type BidsSuccessorAuditReport = z.infer<typeof BidsSuccessorAuditReportSchema>
export type BidsSuccessorRepair = BidsSuccessorAuditReport["issues"][number]["repair"]

const SourceBindingSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

export const BidsSuccessorGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-eval/v2"),
  check: z.enum(["input-integrity", "artifact-contract", "semantic-audit"]),
  paths: z.object({
    manifest: z.literal("dataset-manifest.json"),
    interface: z.literal("bids-audit-interface.json"),
    report: z.literal("bids-audit.json"),
  }).strict(),
  protectedSha256: z.object({ manifest: Sha256Schema, interface: Sha256Schema }).strict(),
  sourceRules: z.object({ schema: SourceBindingSchema, metadata: SourceBindingSchema }).strict(),
}).strict()

const CriterionSchema = z.object({
  method: z.literal("custom"),
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().positive().max(1),
  evaluatorId: z.literal("skill-ir-bids-successor"),
  payload: BidsSuccessorGradePayloadSchema,
}).strict()

const TaskSchema = z.object({
  id: z.enum(BIDS_DEVELOPMENT_TASK_IDS),
  split: z.literal("development"),
  prompt: z.string().min(1),
  fixtures: z.record(z.string(), z.string()),
  successCriteria: z.array(z.never()),
  eval: z.array(CriterionSchema).length(3),
  hardGateIds: z.array(z.string()).length(3),
  passThreshold: z.literal(1),
}).strict()

export const BidsSuccessorTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("bids"),
  tasks: z.array(TaskSchema).length(2),
}).strict()

export type BidsSuccessorTaskSet = z.infer<typeof BidsSuccessorTaskSetSchema>

export const BIDS_SUCCESSOR_PUBLIC_VALUE_SEMANTICS: PublicJsonValueSemanticDeclaration[] = [
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
  {
    id: "affected-path-repair-related-role",
    kind: "representation-equivalence",
    rule: "repair-target-or-logical-data-file",
    targets: [
      { role: "affected", path: "/issues/*/affectedPath" },
      { role: "repair-target", path: "/issues/*/repair/targetPath" },
    ],
    description: "The affected path may name the repair target or its corresponding logical data file from the dataset manifest.",
  },
  {
    id: "repair-related-manifest-evidence",
    kind: "representation-equivalence",
    rule: "nonempty-unique-repair-related-manifest-paths",
    targets: [
      { role: "evidence-array", path: "/issues/*/evidencePaths" },
      { role: "evidence-value", path: "/issues/*/evidencePaths/*" },
      { role: "repair-target", path: "/issues/*/repair/targetPath" },
    ],
    description: "Evidence paths are a non-empty unique set of dataset-manifest entries related to the repair; source-reference filenames are not required.",
  },
  {
    id: "issue-semantic-repair-identity",
    kind: "array-element-identity",
    rule: "code-severity-complete-repair-key",
    targets: [
      { role: "array", path: "/issues" },
      { role: "identity-code", path: "/issues/*/code" },
      { role: "identity-repair", path: "/issues/*/repair" },
      { role: "identity-severity", path: "/issues/*/severity" },
    ],
    description: "Issue identity is code, severity, and the complete semantic repair; path presentation does not create another issue.",
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
    rule: "issue-and-error-counts-match-array",
    targets: [
      { role: "array", path: "/issues" },
      { role: "error-count", path: "/summary/errorCount" },
      { role: "issue-count", path: "/summary/issueCount" },
    ],
    description: "issueCount equals the issue array length and errorCount equals the number of error-severity issues.",
  },
]

export function buildBidsSuccessorPublicInterface() {
  return {
    schemaVersion: "skill-ir-bids-public-interface/v2" as const,
    interfaceId: "bids-successor-public-interface-v2" as const,
    measurementIdentity: "bids-successor-semantic-scorer-v2" as const,
    protectedInputs: ["dataset-manifest.json", "bids-audit-interface.json"] as const,
    outputs: ["bids-audit.json"] as const,
    publicFieldPaths: [...BIDS_PUBLIC_FIELD_PATHS],
    valueSemantics: structuredClone(BIDS_SUCCESSOR_PUBLIC_VALUE_SEMANTICS),
    reportContract: {
      schemaVersion: "skill-ir-bids-audit-report/v2" as const,
      additionalProperties: false as const,
      issueCodes: ["ENTITY_ORDER", "MISSING_REQUIRED_METADATA", "TASK_NAME_MISMATCH"] as const,
      severity: ["error"] as const,
      issues: {
        order: "set-like" as const,
        duplicates: "forbid" as const,
        identity: "code-severity-complete-repair" as const,
        requiredFields: ["code", "severity", "affectedPath", "evidencePaths", "repair"] as const,
        affectedPath: { type: "repair-related-manifest-path" as const },
        evidencePaths: {
          type: "repair-related-manifest-path-array" as const,
          order: "set-like" as const,
          duplicates: "forbid" as const,
          minimumItems: 1 as const,
        },
        repair: {
          requiredFields: ["operation", "targetPath", "destinationPath", "field", "value"] as const,
          operations: ["rename", "set-json-field"] as const,
          nullableFields: ["destinationPath", "field", "value"] as const,
        },
      },
      paths: { syntax: "posix-relative-no-dot-segments" as const },
      summary: {
        requiredFields: ["issueCount", "errorCount"] as const,
        relationship: "issue-and-error-counts-match-array" as const,
      },
    },
    outputPolicy: { exactOutputSet: true as const, allowNetwork: false as const },
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function buildPayload(manifestText: string, interfaceText: string, check: z.infer<typeof BidsSuccessorGradePayloadSchema>["check"]) {
  return BidsSuccessorGradePayloadSchema.parse({
    schemaVersion: "skill-ir-bids-eval/v2",
    check,
    paths: { manifest: "dataset-manifest.json", interface: "bids-audit-interface.json", report: "bids-audit.json" },
    protectedSha256: { manifest: sha256(manifestText), interface: sha256(interfaceText) },
    sourceRules: BIDS_SOURCE_RULE_BINDINGS,
  })
}

export function buildBidsSuccessorDevelopmentTaskSet(
  publicInterface = buildBidsSuccessorPublicInterface(),
): BidsSuccessorTaskSet {
  const v1Tasks = buildBidsDevelopmentTaskSet()
  const interfaceText = json(publicInterface)
  return BidsSuccessorTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "bids",
    tasks: v1Tasks.tasks.map((task) => ({
      id: task.id,
      split: task.split,
      prompt: task.prompt,
      fixtures: {
        "dataset-manifest.json": task.fixtures["dataset-manifest.json"]!,
        "bids-audit-interface.json": interfaceText,
      },
      successCriteria: [],
      eval: task.eval.map((criterion) => ({
        method: "custom",
        id: criterion.id,
        name: criterion.name,
        weight: criterion.weight,
        evaluatorId: "skill-ir-bids-successor",
        payload: buildPayload(task.fixtures["dataset-manifest.json"]!, interfaceText, criterion.payload.check),
      })),
      hardGateIds: task.hardGateIds,
      passThreshold: task.passThreshold,
    })),
  })
}

export const loadBidsSuccessorSourceRules = loadBidsSourceRules
export type BidsSuccessorSourceRules = BidsSourceRules

export async function deriveBidsSuccessorAuditOracle(
  rawManifest: unknown,
  sourceRules: BidsSuccessorSourceRules,
): Promise<BidsSuccessorAuditReport> {
  const manifest: BidsDatasetManifest = BidsDatasetManifestSchema.parse(rawManifest)
  const v1 = await deriveBidsAuditOracle(manifest, sourceRules)
  return BidsSuccessorAuditReportSchema.parse({
    schemaVersion: "skill-ir-bids-audit-report/v2",
    datasetId: v1.datasetId,
    issues: v1.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      affectedPath: issue.affectedPath,
      evidencePaths: [issue.repair.targetPath],
      repair: issue.repair,
    })),
    summary: v1.summary,
  })
}

export async function writeBidsSuccessorContractArtifacts(input: { outputDirectory: string }) {
  const publicInterface = buildBidsSuccessorPublicInterface()
  const taskSet = buildBidsSuccessorDevelopmentTaskSet(publicInterface)
  const outputDirectory = path.resolve(input.outputDirectory)
  await mkdir(path.join(outputDirectory, "development"), { recursive: true })
  await Promise.all([
    writeFile(path.join(outputDirectory, "public-interface.json"), json(publicInterface), "utf8"),
    writeFile(path.join(outputDirectory, "development/tasks.json"), json(taskSet), "utf8"),
  ])
  return { publicInterface, taskSet }
}

if (import.meta.main) {
  const outputDirectory = path.join(process.cwd(), "benchmarks/skill-ir/pilots/bids/successor-v2")
  await writeBidsSuccessorContractArtifacts({ outputDirectory })
  console.log(JSON.stringify({ outputDirectory: path.relative(process.cwd(), outputDirectory).replaceAll("\\", "/") }))
}
