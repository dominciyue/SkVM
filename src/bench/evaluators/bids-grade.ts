import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import {
  BIDS_SOURCE_RULE_BINDINGS,
  BidsAuditReportSchema,
  BidsDatasetManifestSchema,
  BidsGradePayloadSchema,
  deriveBidsAuditOracle,
  loadBidsSourceRules,
  type BidsAuditReport,
} from "../../benchmarks/skill-ir/bids-contract.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

export { BidsGradePayloadSchema } from "../../benchmarks/skill-ir/bids-contract.ts"

type Payload = ReturnType<typeof BidsGradePayloadSchema.parse>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

export const BIDS_EVALUATOR_FIELD_PATHS = [
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
  return relative === "" || (
    !path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
  )
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
  if (!isContained(root, resolved) || !(await lstat(resolved)).isFile()) {
    throw new UnsafeFilesystemPathError()
  }
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

function normalizedReport(report: BidsAuditReport): BidsAuditReport {
  return {
    ...report,
    issues: report.issues.map((issue) => ({
      ...issue,
      evidencePaths: [...issue.evidencePaths].sort((left, right) => left.localeCompare(right)),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  }
}

export function bidsReportsMatch(actual: BidsAuditReport, expected: BidsAuditReport): boolean {
  return isDeepStrictEqual(normalizedReport(actual), normalizedReport(expected))
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
    ? passing("Protected BIDS inputs match their frozen digests")
    : failing("Protected BIDS input digest changed")
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
  if (delta.status !== "pass") return failing("Final workdir violates the exact BIDS output contract")
  const report = BidsAuditReportSchema.safeParse(parseJson(await readSafeFile(root, payload.paths.report)))
  return report.success
    ? passing("Exact output set and complete public BIDS report contract pass")
    : failing("BIDS report does not satisfy the complete public contract")
}

async function gradeSemanticAudit(root: string, payload: Payload): Promise<GradeResult> {
  if (!sourceBindingsMatch(payload)) return infrastructure("BIDS source rule binding drift")
  const [manifestBytes, reportBytes] = await Promise.all([
    readSafeFile(root, payload.paths.manifest),
    readSafeFile(root, payload.paths.report),
  ])
  const manifest = BidsDatasetManifestSchema.safeParse(parseJson(manifestBytes))
  const report = BidsAuditReportSchema.safeParse(parseJson(reportBytes))
  if (!manifest.success || !report.success) return failing("Required BIDS manifest or report is missing or invalid")
  const expected = await deriveBidsAuditOracle(manifest.data, await loadBidsSourceRules(process.cwd()))
  return bidsReportsMatch(report.data, expected)
    ? passing("BIDS issue set and source-derived repairs match")
    : failing("BIDS issue set or source-derived repairs are incomplete")
}

export const bidsGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    BidsGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const payload = BidsGradePayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid BIDS evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      if (payload.data.check === "input-integrity") return gradeInputIntegrity(root, payload.data)
      if (payload.data.check === "artifact-contract") {
        if (!runResult.initialWorkdirManifest) {
          return infrastructure("Run result does not include initial workdir provenance")
        }
        return gradeArtifactContract(root, payload.data, runResult.initialWorkdirManifest)
      }
      return gradeSemanticAudit(root, payload.data)
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe filesystem path in BIDS workdir")
      }
      return infrastructure(`BIDS evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}

registerCustomEvaluator("skill-ir-bids", bidsGrade)
