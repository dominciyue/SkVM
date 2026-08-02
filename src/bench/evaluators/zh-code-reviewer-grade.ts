import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { deriveZhCodeReviewOracle } from "../../benchmarks/skill-ir/zh-code-reviewer-oracle.ts"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ZhCodeReviewerGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-eval/v1"),
  check: z.enum([
    "artifact-integrity",
    "evidence-coverage",
    "severity-calibration",
    "actionability",
    "report-consistency",
  ]),
  paths: z.object({
    source: SafeRelativePathSchema,
    interface: z.literal("review-interface.json"),
    jsonReport: z.literal("code-review.json"),
    markdownReport: z.literal("code-review.md"),
  }).strict(),
  protectedSha256: z.object({ source: Sha256Schema, interface: Sha256Schema }).strict(),
}).strict()

const FindingSchema = z.object({
  category: z.enum(["correctness", "security", "performance", "maintainability"]),
  severity: z.enum(["critical", "major", "minor"]),
  path: SafeRelativePathSchema,
  line: z.number().int().positive(),
  symbol: z.string().trim().min(1),
  impact: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
}).passthrough()

const StructuredSummarySchema = z.record(z.string(), z.unknown()).refine(
  (value) => Object.keys(value).length > 0,
  "structured summary must contain at least one field",
)

const ReportSchema = z.object({
  schemaVersion: z.literal("code-review/v1"),
  reviewedFiles: z.array(SafeRelativePathSchema).min(1),
  findings: z.array(FindingSchema),
  highlights: z.array(z.string()),
  summary: z.union([z.string().trim().min(1), StructuredSummarySchema]),
}).passthrough()

type Payload = z.infer<typeof ZhCodeReviewerGradePayloadSchema>
type Report = z.infer<typeof ReportSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

interface EvaluationState {
  artifactIntegrity: boolean
  evidenceCoverage: boolean
  severityCalibration: boolean
  actionability: boolean
  reportConsistency: boolean
  failure?: string
}

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
  if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
  if (!(await lstat(resolved)).isFile()) return undefined
  return readFile(resolved)
}

function parseReport(bytes: Uint8Array | undefined): Report | undefined {
  if (!bytes) return undefined
  try {
    return ReportSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
  } catch {
    return undefined
  }
}

function isChineseMarkdown(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text)
}

function locationAppears(markdown: string, finding: Report["findings"][number]): boolean {
  const compact = `${finding.path}:${finding.line}`
  const bracketed = `[${finding.path}:${finding.line}]`
  return markdown.includes(compact) || markdown.includes(bracketed)
}

function matchFinding(
  report: Report,
  expected: { path: string; acceptedLines: number[]; symbol: string },
): Report["findings"][number] | undefined {
  return report.findings.find((entry) =>
    entry.path === expected.path
    && entry.symbol === expected.symbol
    && expected.acceptedLines.includes(entry.line))
}

async function evaluateState(
  root: string,
  payload: Payload,
  manifestReference: NonNullable<Parameters<typeof readInitialWorkdirManifest>[0]["reference"]>,
): Promise<EvaluationState> {
  const initial = await readInitialWorkdirManifest({ workDir: root, reference: manifestReference })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: [],
    requiredNewFiles: [payload.paths.jsonReport, payload.paths.markdownReport],
  })
  const [sourceBytes, interfaceBytes, reportBytes, markdownBytes] = await Promise.all([
    readSafeFile(root, payload.paths.source),
    readSafeFile(root, payload.paths.interface),
    readSafeFile(root, payload.paths.jsonReport),
    readSafeFile(root, payload.paths.markdownReport),
  ])
  const protectedInputs = Boolean(
    sourceBytes
    && interfaceBytes
    && sha256(sourceBytes) === payload.protectedSha256.source
    && sha256(interfaceBytes) === payload.protectedSha256.interface,
  )
  const report = parseReport(reportBytes)
  let markdown: string | undefined
  try {
    if (markdownBytes) markdown = new TextDecoder("utf-8", { fatal: true }).decode(markdownBytes)
  } catch {
    markdown = undefined
  }
  const artifactIntegrity = delta.status === "pass" && protectedInputs && report !== undefined && markdown !== undefined
  if (!artifactIntegrity || !sourceBytes || !report || markdown === undefined) {
    return {
      artifactIntegrity,
      evidenceCoverage: false,
      severityCalibration: false,
      actionability: false,
      reportConsistency: false,
      failure: "protected inputs, exact outputs, or report schema failed",
    }
  }

  const source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes)
  const oracle = deriveZhCodeReviewOracle(payload.paths.source, source)
  if (oracle.status !== "confirmed") {
    return {
      artifactIntegrity,
      evidenceCoverage: false,
      severityCalibration: false,
      actionability: false,
      reportConsistency: false,
      failure: "public source did not yield a confirmed review oracle",
    }
  }

  const matched = oracle.findings.map((expected) => ({ expected, actual: matchFinding(report, expected) }))
  const evidenceCoverage = matched.every((entry) =>
    entry.actual !== undefined && entry.actual.category === entry.expected.category)
  const severityCalibration = matched.every((entry) =>
    entry.actual !== undefined && entry.actual.severity === entry.expected.severity)
  const actionability = matched.every((entry) =>
    entry.actual !== undefined
    && entry.actual.impact.trim().length >= 8
    && entry.actual.recommendation.trim().length >= 8)
  const reportConsistency = report.reviewedFiles.includes(payload.paths.source)
    && isChineseMarkdown(markdown)
    && report.findings.every((entry) => locationAppears(markdown, entry))
    && report.findings.every((entry) => entry.path === payload.paths.source)

  return {
    artifactIntegrity,
    evidenceCoverage,
    severityCalibration,
    actionability,
    reportConsistency,
  }
}

export const zhCodeReviewerGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    ZhCodeReviewerGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const parsed = ZhCodeReviewerGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid zh-code-reviewer evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    if (!runResult.initialWorkdirManifest) {
      return infrastructure("Run result does not include initial workdir provenance")
    }
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      const state = await evaluateState(root, parsed.data, runResult.initialWorkdirManifest)
      if (parsed.data.check === "artifact-integrity") {
        return state.artifactIntegrity
          ? passing("Protected source, exact outputs, and public report schema pass")
          : failing(state.failure ?? "Artifact integrity failed")
      }
      if (parsed.data.check === "evidence-coverage") {
        return state.evidenceCoverage
          ? passing("All source-derived high-impact findings have grounded locations")
          : failing(state.failure ?? "Confirmed source findings are missing or misclassified")
      }
      if (parsed.data.check === "severity-calibration") {
        return state.severityCalibration
          ? passing("Finding severities follow the public impact definitions")
          : failing(state.failure ?? "One or more finding severities are weakened or inconsistent")
      }
      if (parsed.data.check === "actionability") {
        return state.actionability
          ? passing("Confirmed findings include impact and actionable recommendations")
          : failing(state.failure ?? "Finding impact or recommendation is not actionable")
      }
      return state.reportConsistency
        ? passing("Chinese Markdown and JSON reports reference the same grounded findings")
        : failing(state.failure ?? "Markdown and JSON reports are inconsistent")
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe filesystem path in zh-code-reviewer workdir")
      }
      return infrastructure(
        `zh-code-reviewer evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  },
}

registerCustomEvaluator("skill-ir-zh-code-reviewer", zhCodeReviewerGrade)
