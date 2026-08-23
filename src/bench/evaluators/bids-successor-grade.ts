import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import type { PublicJsonValueSemanticDeclaration } from "../../benchmarks/skill-ir/public-json-contract-disclosure.ts"
import {
  BIDS_SOURCE_RULE_BINDINGS,
  BidsDatasetManifestSchema,
  type BidsDatasetManifest,
} from "../../benchmarks/skill-ir/bids-contract.ts"
import {
  BidsSuccessorAuditReportSchema,
  BidsSuccessorGradePayloadSchema,
  deriveBidsSuccessorAuditOracle,
  loadBidsSuccessorSourceRules,
  type BidsSuccessorAuditReport,
  type BidsSuccessorRepair,
} from "../../benchmarks/skill-ir/bids-successor-contract.ts"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

export { BidsSuccessorGradePayloadSchema } from "../../benchmarks/skill-ir/bids-successor-contract.ts"

type Payload = ReturnType<typeof BidsSuccessorGradePayloadSchema.parse>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

export const BIDS_SUCCESSOR_EVALUATOR_FIELD_PATHS = [
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

export const BIDS_SUCCESSOR_EVALUATOR_VALUE_SEMANTICS: PublicJsonValueSemanticDeclaration[] = [
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

class UnsafeFilesystemPathError extends Error {}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<Buffer | undefined> {
  let current = root
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment)
    if (!isContained(root, current)) throw new UnsafeFilesystemPathError()
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) throw new UnsafeFilesystemPathError()
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) throw error
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }
  const resolved = await realpath(current)
  if (!isContained(root, resolved) || !(await lstat(resolved)).isFile()) throw new UnsafeFilesystemPathError()
  return readFile(resolved)
}

function parseJson(bytes: Uint8Array | undefined): unknown | undefined {
  if (!bytes) return undefined
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

function exactSidecar(dataPath: string): string {
  return dataPath.replace(/\.nii(?:\.gz)?$/u, ".json")
}

export function repairRelatedManifestPaths(
  repair: BidsSuccessorRepair,
  rawManifest: unknown,
): Set<string> {
  const manifest = BidsDatasetManifestSchema.parse(rawManifest)
  const manifestPaths = new Set(manifest.files.map((file) => file.path))
  const related = new Set<string>()
  if (manifestPaths.has(repair.targetPath)) related.add(repair.targetPath)
  if (repair.operation === "set-json-field") {
    for (const file of manifest.files) {
      if (file.kind === "data" && exactSidecar(file.path) === repair.targetPath) related.add(file.path)
    }
  }
  return related
}

function repairIdentity(issue: BidsSuccessorAuditReport["issues"][number]): string {
  return JSON.stringify({ code: issue.code, severity: issue.severity, repair: issue.repair })
}

function pathsHavePublicRoles(report: BidsSuccessorAuditReport, manifest: BidsDatasetManifest): boolean {
  return report.issues.every((issue) => {
    const related = repairRelatedManifestPaths(issue.repair, manifest)
    return related.has(issue.affectedPath)
      && issue.evidencePaths.length > 0
      && new Set(issue.evidencePaths).size === issue.evidencePaths.length
      && issue.evidencePaths.every((candidate) => related.has(candidate))
  })
}

export function bidsSuccessorReportsMatch(actualInput: unknown, expectedInput: unknown, manifestInput: unknown): boolean {
  const actual = BidsSuccessorAuditReportSchema.safeParse(actualInput)
  const expected = BidsSuccessorAuditReportSchema.safeParse(expectedInput)
  const manifest = BidsDatasetManifestSchema.safeParse(manifestInput)
  if (!actual.success || !expected.success || !manifest.success) return false
  if (actual.data.datasetId !== expected.data.datasetId || actual.data.issues.length !== expected.data.issues.length) return false
  if (!pathsHavePublicRoles(actual.data, manifest.data) || !pathsHavePublicRoles(expected.data, manifest.data)) return false
  const expectedByIdentity = new Map(expected.data.issues.map((issue) => [repairIdentity(issue), issue]))
  return actual.data.issues.every((issue) => expectedByIdentity.has(repairIdentity(issue)))
}

function sourceBindingsMatch(payload: Payload): boolean {
  return isDeepStrictEqual(payload.sourceRules, BIDS_SOURCE_RULE_BINDINGS)
}

async function gradeInputIntegrity(root: string, payload: Payload): Promise<GradeResult> {
  const [manifest, publicInterface] = await Promise.all([
    readSafeFile(root, payload.paths.manifest),
    readSafeFile(root, payload.paths.interface),
  ])
  if (!manifest || !publicInterface) return failing("Protected input is missing")
  return sha256(manifest) === payload.protectedSha256.manifest
    && sha256(publicInterface) === payload.protectedSha256.interface
    ? passing("Protected BIDS successor inputs match their frozen digests")
    : failing("Protected BIDS successor input digest changed")
}

async function gradeArtifactContract(
  root: string,
  payload: Payload,
  reference: NonNullable<Parameters<typeof readInitialWorkdirManifest>[0]["reference"]>,
): Promise<GradeResult> {
  const initial = await readInitialWorkdirManifest({ workDir: root, reference })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: [],
    requiredNewFiles: [payload.paths.report],
  })
  if (delta.status !== "pass") return failing("Final workdir violates the exact BIDS successor output contract")
  const report = BidsSuccessorAuditReportSchema.safeParse(parseJson(await readSafeFile(root, payload.paths.report)))
  return report.success
    ? passing("Exact output set and complete public BIDS successor report contract pass")
    : failing("BIDS successor report does not satisfy the complete public contract")
}

async function gradeSemanticAudit(root: string, payload: Payload): Promise<GradeResult> {
  if (!sourceBindingsMatch(payload)) return infrastructure("BIDS successor source rule binding drift")
  const [manifestBytes, reportBytes] = await Promise.all([
    readSafeFile(root, payload.paths.manifest),
    readSafeFile(root, payload.paths.report),
  ])
  const manifest = BidsDatasetManifestSchema.safeParse(parseJson(manifestBytes))
  const report = BidsSuccessorAuditReportSchema.safeParse(parseJson(reportBytes))
  if (!manifest.success || !report.success) return failing("Required BIDS successor manifest or report is missing or invalid")
  const expected = await deriveBidsSuccessorAuditOracle(manifest.data, await loadBidsSuccessorSourceRules(process.cwd()))
  return bidsSuccessorReportsMatch(report.data, expected, manifest.data)
    ? passing("BIDS semantic repair set and public path roles match")
    : failing("BIDS semantic repair set or public path roles are incomplete")
}

export const bidsSuccessorGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    BidsSuccessorGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const payload = BidsSuccessorGradePayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid BIDS successor evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      if (payload.data.check === "input-integrity") return gradeInputIntegrity(root, payload.data)
      if (payload.data.check === "artifact-contract") {
        if (!runResult.initialWorkdirManifest) return infrastructure("Run result does not include initial workdir provenance")
        return gradeArtifactContract(root, payload.data, runResult.initialWorkdirManifest)
      }
      return gradeSemanticAudit(root, payload.data)
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe filesystem path in BIDS successor workdir")
      return infrastructure(`BIDS successor evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}

registerCustomEvaluator("skill-ir-bids-successor", bidsSuccessorGrade)
