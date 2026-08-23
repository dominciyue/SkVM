import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)

export const BIDS_DEVELOPMENT_TASK_IDS = [
  "bids-entity-order-dev-001",
  "bids-metadata-inheritance-dev-002",
] as const

export const BIDS_PUBLIC_FIELD_PATHS = [
  "/schemaVersion",
  "/datasetId",
  "/issues",
  "/issues/*/code",
  "/issues/*/severity",
  "/issues/*/affectedPath",
  "/issues/*/evidencePaths",
  "/issues/*/evidencePaths/*",
  "/issues/*/repair",
  "/issues/*/repair/operation",
  "/issues/*/repair/targetPath",
  "/issues/*/repair/destinationPath",
  "/issues/*/repair/field",
  "/issues/*/repair/value",
  "/summary",
  "/summary/issueCount",
  "/summary/errorCount",
] as const

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

export const BidsAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-audit-report/v1"),
  datasetId: z.string().min(1),
  issues: z.array(IssueSchema),
  summary: z.object({
    issueCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((report, context) => {
  const identities = report.issues.map((issue) =>
    `${issue.code}:${issue.affectedPath}:${issue.repair.field ?? ""}`
  )
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["issues"], message: "issues must be unique" })
  }
  if (report.summary.issueCount !== report.issues.length
    || report.summary.errorCount !== report.issues.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["summary"], message: "summary must match issues" })
  }
})

export type BidsAuditReport = z.infer<typeof BidsAuditReportSchema>

const DatasetFileSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum(["data", "json-sidecar", "dataset-metadata"]),
  json: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((file, context) => {
  if (file.kind === "data" && file.json !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["json"], message: "data files cannot inline JSON" })
  }
  if (file.kind !== "data" && file.json === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["json"], message: "JSON entries require contents" })
  }
})

export const BidsDatasetManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-dataset-manifest/v1"),
  datasetId: z.string().min(1),
  files: z.array(DatasetFileSchema).min(1),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((file) => file.path)
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "dataset paths must be unique" })
  }
})

export type BidsDatasetManifest = z.infer<typeof BidsDatasetManifestSchema>

const SourceBindingSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

export const BidsGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-eval/v1"),
  check: z.enum(["input-integrity", "artifact-contract", "semantic-audit"]),
  paths: z.object({
    manifest: z.literal("dataset-manifest.json"),
    interface: z.literal("bids-audit-interface.json"),
    report: z.literal("bids-audit.json"),
  }).strict(),
  protectedSha256: z.object({ manifest: Sha256Schema, interface: Sha256Schema }).strict(),
  sourceRules: z.object({
    schema: SourceBindingSchema,
    metadata: SourceBindingSchema,
  }).strict(),
}).strict()

const CriterionSchema = z.object({
  method: z.literal("custom"),
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().positive().max(1),
  evaluatorId: z.literal("skill-ir-bids"),
  payload: BidsGradePayloadSchema,
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

export const BidsTaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("bids"),
  tasks: z.array(TaskSchema).length(2),
}).strict()

export type BidsTaskSet = z.infer<typeof BidsTaskSetSchema>

export type BidsSourceRules = {
  entityOrderKeys: string[]
  requiredBoldMetadata: string[]
  requiredMultiEchoMetadata: string[]
}

const BIDS_SCHEMA_SOURCE = "benchmarks/skill-ir/pilots/bids/source/references/bids_schema.json"
const BIDS_METADATA_SOURCE = "benchmarks/skill-ir/pilots/bids/source/references/metadata_fields.md"
const BIDS_SCHEMA_SHA256 = "6d72e394c87a94da5a2ce57e00f9e390ea5eeefb4cc39aa607d54d074aa6408b"
const BIDS_METADATA_SHA256 = "33407c21a2b36cf69f7f616d011ade487498cdb197eb215b9f2847aff5bac68a"

export const BIDS_SOURCE_RULE_BINDINGS = {
  schema: { path: BIDS_SCHEMA_SOURCE, sha256: BIDS_SCHEMA_SHA256 },
  metadata: { path: BIDS_METADATA_SOURCE, sha256: BIDS_METADATA_SHA256 },
} as const

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function requiredFields(markdown: string, heading: string, nextHeading: string): string[] {
  const start = markdown.indexOf(heading)
  const end = markdown.indexOf(nextHeading, start + heading.length)
  if (start < 0 || end < 0) throw new Error(`BIDS metadata section is missing: ${heading}`)
  return [...markdown.slice(start, end).matchAll(/^\| `([^`]+)` \| R \|/gmu)].map((match) => match[1]!)
}

export async function loadBidsSourceRules(rootDir: string): Promise<BidsSourceRules> {
  const [schemaText, metadataText] = await Promise.all([
    readFile(path.resolve(rootDir, BIDS_SCHEMA_SOURCE), "utf8"),
    readFile(path.resolve(rootDir, BIDS_METADATA_SOURCE), "utf8"),
  ])
  if (sha256(schemaText) !== BIDS_SCHEMA_SHA256 || sha256(metadataText) !== BIDS_METADATA_SHA256) {
    throw new Error("BIDS source rule digest mismatch")
  }
  const parsed = z.object({
    objects: z.object({
      entities: z.record(z.string(), z.object({ name: z.string().min(1) }).passthrough()),
    }).passthrough(),
    rules: z.object({ entities: z.array(z.string().min(1)) }).passthrough(),
  }).passthrough().parse(JSON.parse(schemaText))
  return {
    entityOrderKeys: parsed.rules.entities.map((entity) => {
      const key = parsed.objects.entities[entity]?.name
      if (!key) throw new Error(`BIDS entity is missing a filename key: ${entity}`)
      return key
    }),
    requiredBoldMetadata: requiredFields(metadataText, "### BOLD", "### Multi-echo BOLD"),
    requiredMultiEchoMetadata: requiredFields(metadataText, "### Multi-echo BOLD", "### BOLD Timing Details"),
  }
}

export function buildBidsPublicInterface() {
  return {
    schemaVersion: "skill-ir-bids-public-interface/v1" as const,
    interfaceId: "bids-public-interface-v1" as const,
    protectedInputs: ["dataset-manifest.json", "bids-audit-interface.json"] as const,
    outputs: ["bids-audit.json"] as const,
    publicFieldPaths: [...BIDS_PUBLIC_FIELD_PATHS],
    reportContract: {
      schemaVersion: "skill-ir-bids-audit-report/v1" as const,
      additionalProperties: false as const,
      issueCodes: ["ENTITY_ORDER", "MISSING_REQUIRED_METADATA", "TASK_NAME_MISMATCH"] as const,
      severity: ["error"] as const,
      issues: {
        order: "set-like" as const,
        duplicates: "forbid" as const,
        requiredFields: ["code", "severity", "affectedPath", "evidencePaths", "repair"] as const,
        evidencePaths: { type: "relative-path-array" as const, order: "set-like" as const, duplicates: "forbid" as const },
        repair: {
          requiredFields: ["operation", "targetPath", "destinationPath", "field", "value"] as const,
          operations: ["rename", "set-json-field"] as const,
          nullableFields: ["destinationPath", "field", "value"] as const,
        },
      },
      summary: { requiredFields: ["issueCount", "errorCount"] as const, type: "nonnegative-integer-counts" as const },
    },
    outputPolicy: { exactOutputSet: true as const, allowNetwork: false as const },
  }
}

const entityOrderManifest: BidsDatasetManifest = {
  schemaVersion: "skill-ir-bids-dataset-manifest/v1",
  datasetId: "bids-entity-order-dev",
  files: [
    { path: "dataset_description.json", kind: "dataset-metadata", json: { Name: "Entity ordering study", BIDSVersion: "1.10.0" } },
    { path: "sub-01/ses-pre/func/sub-01_task-nback_ses-pre_run-01_echo-1_bold.nii.gz", kind: "data" },
    {
      path: "sub-01/ses-pre/func/sub-01_task-nback_ses-pre_run-01_echo-1_bold.json",
      kind: "json-sidecar",
      json: { RepetitionTime: 1.2, TaskName: "nback", EchoTime: 0.015 },
    },
  ],
}

const metadataManifest: BidsDatasetManifest = {
  schemaVersion: "skill-ir-bids-dataset-manifest/v1",
  datasetId: "bids-metadata-inheritance-dev",
  files: [
    { path: "dataset_description.json", kind: "dataset-metadata", json: { Name: "Metadata inheritance study", BIDSVersion: "1.10.0" } },
    { path: "task-rest_bold.json", kind: "json-sidecar", json: { RepetitionTime: 2, TaskName: "rest" } },
    { path: "sub-02/sub-02_task-rest_bold.json", kind: "json-sidecar", json: { RepetitionTime: 1.5 } },
    { path: "sub-02/func/sub-02_task-rest_run-01_bold.nii.gz", kind: "data" },
    { path: "sub-02/func/sub-02_task-rest_run-01_bold.json", kind: "json-sidecar", json: { EchoTime: 0.03 } },
    { path: "sub-02/func/sub-02_task-rest_run-02_bold.nii.gz", kind: "data" },
    { path: "sub-02/func/sub-02_task-rest_run-02_bold.json", kind: "json-sidecar", json: { TaskName: "oddball", EchoTime: 0.03 } },
    { path: "sub-02/func/sub-02_task-memory_run-01_bold.nii.gz", kind: "data" },
    { path: "sub-02/func/sub-02_task-memory_run-01_bold.json", kind: "json-sidecar", json: { EchoTime: 0.03 } },
  ],
}

function buildPayload(manifestText: string, interfaceText: string, check: z.infer<typeof BidsGradePayloadSchema>["check"]) {
  return BidsGradePayloadSchema.parse({
    schemaVersion: "skill-ir-bids-eval/v1",
    check,
    paths: { manifest: "dataset-manifest.json", interface: "bids-audit-interface.json", report: "bids-audit.json" },
    protectedSha256: { manifest: sha256(manifestText), interface: sha256(interfaceText) },
    sourceRules: BIDS_SOURCE_RULE_BINDINGS,
  })
}

export function buildBidsDevelopmentTaskSet(
  publicInterface = buildBidsPublicInterface(),
): BidsTaskSet {
  const interfaceText = json(publicInterface)
  const prompt = "Read dataset-manifest.json and bids-audit-interface.json without modifying either protected input. Independently assess whether the supplied logical dataset is suitable for BIDS submission. Produce exactly bids-audit.json under the complete public contract, create no other output, and do not use the network."
  const definitions = [
    { id: BIDS_DEVELOPMENT_TASK_IDS[0], manifest: entityOrderManifest },
    { id: BIDS_DEVELOPMENT_TASK_IDS[1], manifest: metadataManifest },
  ] as const
  return BidsTaskSetSchema.parse({
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "bids",
    tasks: definitions.map(({ id, manifest }) => {
      const manifestText = json(BidsDatasetManifestSchema.parse(manifest))
      const criteria = [
        { id: `${id}-input-integrity`, name: "Protected inputs remain unchanged", weight: 0.1, check: "input-integrity" },
        { id: `${id}-artifact-contract`, name: "The exact public output contract is satisfied", weight: 0.1, check: "artifact-contract" },
        { id: `${id}-semantic-audit`, name: "The BIDS audit matches the source-derived rules", weight: 0.8, check: "semantic-audit" },
      ] as const
      return {
        id,
        split: "development",
        prompt,
        fixtures: { "dataset-manifest.json": manifestText, "bids-audit-interface.json": interfaceText },
        successCriteria: [],
        eval: criteria.map((criterion) => ({
          method: "custom",
          id: criterion.id,
          name: criterion.name,
          weight: criterion.weight,
          evaluatorId: "skill-ir-bids",
          payload: buildPayload(manifestText, interfaceText, criterion.check),
        })),
        hardGateIds: criteria.map((criterion) => criterion.id),
        passThreshold: 1,
      }
    }),
  })
}

export async function writeBidsContractArtifacts(input: { outputDirectory: string }) {
  const publicInterface = buildBidsPublicInterface()
  const taskSet = buildBidsDevelopmentTaskSet(publicInterface)
  const outputDirectory = path.resolve(input.outputDirectory)
  await mkdir(path.join(outputDirectory, "development"), { recursive: true })
  await Promise.all([
    writeFile(path.join(outputDirectory, "public-interface.json"), json(publicInterface), "utf8"),
    writeFile(path.join(outputDirectory, "development/tasks.json"), json(taskSet), "utf8"),
  ])
  return { publicInterface, taskSet }
}

type ParsedBidsName = {
  directory: string
  extension: string
  suffix: string
  entities: Array<{ key: string; value: string }>
}

function parseBidsName(filePath: string): ParsedBidsName | undefined {
  const directory = path.posix.dirname(filePath)
  const basename = path.posix.basename(filePath)
  const extension = basename.endsWith(".nii.gz") ? ".nii.gz" : path.posix.extname(basename)
  if (!extension) return undefined
  const stem = basename.slice(0, -extension.length)
  const parts = stem.split("_")
  if (parts.length < 2) return undefined
  const suffix = parts.pop()!
  const entities: Array<{ key: string; value: string }> = []
  for (const part of parts) {
    const separator = part.indexOf("-")
    if (separator <= 0 || separator === part.length - 1) return undefined
    entities.push({ key: part.slice(0, separator), value: part.slice(separator + 1) })
  }
  return { directory: directory === "." ? "" : directory, extension, suffix, entities }
}

function entityMap(parsed: ParsedBidsName): Map<string, string> {
  return new Map(parsed.entities.map((entity) => [entity.key, entity.value]))
}

function metadataCandidates(
  dataPath: string,
  parsedData: ParsedBidsName,
  sidecars: BidsDatasetManifest["files"],
) {
  const dataDirectory = path.posix.dirname(dataPath)
  const dataEntities = entityMap(parsedData)
  return sidecars.flatMap((sidecar) => {
    const parsed = parseBidsName(sidecar.path)
    if (!parsed || parsed.suffix !== parsedData.suffix || !sidecar.json) return []
    const sidecarDirectory = path.posix.dirname(sidecar.path)
    if (sidecarDirectory !== "."
      && sidecarDirectory !== dataDirectory
      && !dataDirectory.startsWith(`${sidecarDirectory}/`)) return []
    if (parsed.entities.some((entity) => dataEntities.get(entity.key) !== entity.value)) return []
    return [{
      path: sidecar.path,
      json: sidecar.json,
      specificity: parsed.entities.length * 100 + (sidecarDirectory === "." ? 0 : sidecarDirectory.split("/").length),
    }]
  }).sort((left, right) => left.specificity - right.specificity || left.path.localeCompare(right.path))
}

function canonicalIssueOrder(left: BidsAuditReport["issues"][number], right: BidsAuditReport["issues"][number]): number {
  return left.affectedPath.localeCompare(right.affectedPath)
    || left.code.localeCompare(right.code)
    || (left.repair.field ?? "").localeCompare(right.repair.field ?? "")
}

export async function deriveBidsAuditOracle(
  rawManifest: unknown,
  sourceRules: BidsSourceRules,
): Promise<BidsAuditReport> {
  const manifest = BidsDatasetManifestSchema.parse(rawManifest)
  const issues: BidsAuditReport["issues"] = []
  const keyOrder = new Map(sourceRules.entityOrderKeys.map((key, index) => [key, index]))

  for (const file of manifest.files) {
    const parsed = parseBidsName(file.path)
    if (!parsed || parsed.entities.some((entity) => !keyOrder.has(entity.key))) continue
    const sortedEntities = [...parsed.entities].sort((left, right) => keyOrder.get(left.key)! - keyOrder.get(right.key)!)
    if (sortedEntities.some((entity, index) => entity.key !== parsed.entities[index]?.key)) {
      const stem = `${sortedEntities.map((entity) => `${entity.key}-${entity.value}`).join("_")}_${parsed.suffix}${parsed.extension}`
      const destinationPath = parsed.directory ? `${parsed.directory}/${stem}` : stem
      issues.push({
        code: "ENTITY_ORDER",
        severity: "error",
        affectedPath: file.path,
        evidencePaths: ["references/bids_schema.json"],
        repair: { operation: "rename", targetPath: file.path, destinationPath, field: null, value: null },
      })
    }
  }

  const sidecars = manifest.files.filter((file) => file.kind === "json-sidecar")
  for (const data of manifest.files.filter((file) => file.kind === "data")) {
    const parsed = parseBidsName(data.path)
    if (!parsed || parsed.suffix !== "bold" || !data.path.includes("/func/")) continue
    const candidates = metadataCandidates(data.path, parsed, sidecars)
    const effective: Record<string, unknown> = {}
    const sources = new Map<string, string>()
    for (const candidate of candidates) {
      for (const [field, value] of Object.entries(candidate.json)) {
        effective[field] = value
        sources.set(field, candidate.path)
      }
    }
    const exactSidecar = data.path.replace(/\.nii(?:\.gz)?$/u, ".json")
    const required = [
      ...sourceRules.requiredBoldMetadata,
      ...(entityMap(parsed).has("echo") ? sourceRules.requiredMultiEchoMetadata : []),
    ]
    for (const field of required) {
      if (effective[field] !== undefined) continue
      issues.push({
        code: "MISSING_REQUIRED_METADATA",
        severity: "error",
        affectedPath: data.path,
        evidencePaths: ["references/bids_specification.md", "references/metadata_fields.md"],
        repair: {
          operation: "set-json-field",
          targetPath: exactSidecar,
          destinationPath: null,
          field,
          value: field === "TaskName" ? entityMap(parsed).get("task") ?? null : null,
        },
      })
    }
    const task = entityMap(parsed).get("task")
    if (task && typeof effective.TaskName === "string" && effective.TaskName !== task) {
      issues.push({
        code: "TASK_NAME_MISMATCH",
        severity: "error",
        affectedPath: data.path,
        evidencePaths: ["references/bids_specification.md", "references/metadata_fields.md"],
        repair: {
          operation: "set-json-field",
          targetPath: sources.get("TaskName") ?? exactSidecar,
          destinationPath: null,
          field: "TaskName",
          value: task,
        },
      })
    }
  }

  issues.sort(canonicalIssueOrder)
  return BidsAuditReportSchema.parse({
    schemaVersion: "skill-ir-bids-audit-report/v1",
    datasetId: manifest.datasetId,
    issues,
    summary: { issueCount: issues.length, errorCount: issues.length },
  })
}
