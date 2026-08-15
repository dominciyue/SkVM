import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import {
  StatisticalPowerGradePayloadSchema,
  StatisticalPowerReportSchema,
  StatisticalPowerStudySchema,
  deriveStatisticalPowerOracle,
} from "../../benchmarks/skill-ir/statistical-power-contract.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

export { StatisticalPowerGradePayloadSchema } from "../../benchmarks/skill-ir/statistical-power-contract.ts"

type Payload = ReturnType<typeof StatisticalPowerGradePayloadSchema.parse>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

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
  if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
  if (!(await lstat(resolved)).isFile()) return undefined
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

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9
}

async function readSemanticState(root: string, payload: Payload) {
  const [studyBytes, reportBytes, markdownBytes] = await Promise.all([
    readSafeFile(root, payload.paths.study),
    readSafeFile(root, payload.paths.reportJson),
    readSafeFile(root, payload.paths.reportMarkdown),
  ])
  const study = StatisticalPowerStudySchema.safeParse(parseJson(studyBytes))
  const report = StatisticalPowerReportSchema.safeParse(parseJson(reportBytes))
  let markdown: string | undefined
  try {
    markdown = markdownBytes
      ? new TextDecoder("utf-8", { fatal: true }).decode(markdownBytes).trim()
      : undefined
  } catch {
    markdown = undefined
  }
  if (!study.success || !report.success) return { study, report, markdown, oracle: undefined }
  return {
    study,
    report,
    markdown,
    oracle: await deriveStatisticalPowerOracle(study.data),
  }
}

async function gradeInputIntegrity(root: string, payload: Payload): Promise<GradeResult> {
  const [study, publicInterface] = await Promise.all([
    readSafeFile(root, payload.paths.study),
    readSafeFile(root, payload.paths.interface),
  ])
  if (!study || !publicInterface) return failing("Protected input is missing")
  if (
    sha256(study) !== payload.protectedSha256.study
    || sha256(publicInterface) !== payload.protectedSha256.interface
  ) {
    return failing("Protected input digest changed")
  }
  return passing("Protected input digests match")
}

async function gradeArtifactContract(
  root: string,
  payload: Payload,
  initialWorkdirManifest: NonNullable<Parameters<typeof readInitialWorkdirManifest>[0]["reference"]>,
): Promise<GradeResult> {
  const initial = await readInitialWorkdirManifest({ workDir: root, reference: initialWorkdirManifest })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: [],
    requiredNewFiles: [payload.paths.reportJson, payload.paths.reportMarkdown],
  })
  if (delta.status !== "pass") return failing("Final workdir violates the exact output contract")
  const [report, markdown] = await Promise.all([
    readSafeFile(root, payload.paths.reportJson),
    readSafeFile(root, payload.paths.reportMarkdown),
  ])
  if (!StatisticalPowerReportSchema.safeParse(parseJson(report)).success) {
    return failing("JSON output does not satisfy the public field contract")
  }
  try {
    if (!markdown || new TextDecoder("utf-8", { fatal: true }).decode(markdown).trim().length === 0) {
      return failing("Markdown output is missing or empty")
    }
  } catch {
    return failing("Markdown output is not valid UTF-8")
  }
  return passing("Exact output set and public contracts pass")
}

async function gradeSemantic(root: string, payload: Payload): Promise<GradeResult> {
  const state = await readSemanticState(root, payload)
  if (!state.study.success || !state.report.success || !state.oracle) {
    return failing("Required public study or report is missing or invalid")
  }
  const { study, report } = { study: state.study.data, report: state.report.data }

  if (payload.check === "analysis-alignment") {
    const expectedMetric = study.design.test === "t_ind" ? "cohens-d" : "cohens-h"
    return report.studyId === study.studyId
      && report.analysis.test === study.design.test
      && report.analysis.alternative === study.alternative
      && report.analysis.effectBasis === study.effectBasis.kind
      && report.analysis.effectMetric === expectedMetric
      && close(report.analysis.targetPower, study.targetPower)
      && close(report.analysis.allocationRatio, study.allocationRatio)
      ? passing("Analysis identity and declared design inputs align")
      : failing("Analysis identity or design inputs do not align")
  }

  if (payload.check === "multiplicity") {
    return close(report.analysis.familyAlpha, study.errorControl.familyAlpha)
      && report.analysis.confirmatoryComparisons === study.errorControl.confirmatoryComparisons
      && close(report.analysis.adjustedAlpha, state.oracle.adjustedAlpha)
      ? passing("Family alpha and multiplicity adjustment align")
      : failing("Family alpha or multiplicity adjustment is inconsistent")
  }

  if (payload.check === "allocation-attrition") {
    return isDeepStrictEqual(report.sampleSize, state.oracle.planning.sampleSize)
      ? passing("Analyzed and enrolled group sizes match the public design")
      : failing("Analyzed or enrolled group sizes are inconsistent")
  }

  const sensitivityMatches = report.sensitivity.length === state.oracle.sensitivity.length
    && report.sensitivity.every((entry, index) => {
      const expected = state.oracle!.sensitivity[index]!
      return close(entry.inputEffect, expected.inputEffect)
        && close(entry.standardizedEffect, expected.standardizedEffect)
        && isDeepStrictEqual(entry.sampleSize, expected.sampleSize)
    })
  const assumptionsUnique = new Set(report.assumptions).size === report.assumptions.length
  const markdownConsistent = Boolean(
    state.markdown
    && state.markdown.includes(study.studyId)
    && state.markdown.toUpperCase().includes("SESOI")
    && state.markdown.includes(String(report.sampleSize.analyzed.total))
    && state.markdown.includes(String(report.sampleSize.enrolled.total)),
  )
  return sensitivityMatches && assumptionsUnique && markdownConsistent
    ? passing("SESOI sensitivity, reproducibility, and Markdown agreement pass")
    : failing("Sensitivity, effect basis, reproducibility, or Markdown agreement is incomplete")
}

export const statisticalPowerGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    StatisticalPowerGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const payload = StatisticalPowerGradePayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid statistical-power evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      if (payload.data.check === "input-integrity") return await gradeInputIntegrity(root, payload.data)
      if (payload.data.check === "artifact-contract") {
        if (!runResult.initialWorkdirManifest) {
          return infrastructure("Run result does not include initial workdir provenance")
        }
        return await gradeArtifactContract(root, payload.data, runResult.initialWorkdirManifest)
      }
      return await gradeSemantic(root, payload.data)
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe filesystem path in statistical-power workdir")
      }
      return infrastructure(
        `Statistical-power evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  },
}

registerCustomEvaluator("skill-ir-statistical-power", statisticalPowerGrade)
