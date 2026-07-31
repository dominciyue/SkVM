import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  assessExperimentalDesignSkillUniqueAnalysis,
  deriveExperimentalDesignSkillUniqueOracle,
  ExperimentalDesignSkillUniqueAnalysisPlanSchema,
  ExperimentalDesignSkillUniqueReplicationPlanSchema,
} from "../../benchmarks/skill-ir/experimental-design-skill-unique-oracle.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    return false
  }
  return value.split("/").every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  )
}, "path must be a safe POSIX relative path")

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ExperimentalDesignSkillUniqueGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-eval/v1"),
  check: z.enum([
    "input-integrity",
    "artifact-contract",
    "independent-replication",
    "pseudoreplication-guard",
    "analysis-alignment",
  ]),
  paths: z.object({
    studyGraph: SafeRelativePathSchema,
    interface: SafeRelativePathSchema,
    replicationPlan: SafeRelativePathSchema,
    analysisPlan: SafeRelativePathSchema,
  }).strict(),
  protectedSha256: z.object({
    studyGraph: Sha256Schema,
    interface: Sha256Schema,
  }).strict(),
}).strict()

type Payload = z.infer<typeof ExperimentalDesignSkillUniqueGradePayloadSchema>
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
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  )
}

async function readSafeFile(
  root: string,
  relativePath: string,
): Promise<Buffer | undefined> {
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
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

async function readSemanticInputs(root: string, payload: Payload) {
  const graphBytes = await readSafeFile(root, payload.paths.studyGraph)
  const replicationBytes = await readSafeFile(root, payload.paths.replicationPlan)
  const analysisBytes = await readSafeFile(root, payload.paths.analysisPlan)
  const graph = parseJson(graphBytes)
  const replication = ExperimentalDesignSkillUniqueReplicationPlanSchema.safeParse(
    parseJson(replicationBytes),
  )
  const analysis = ExperimentalDesignSkillUniqueAnalysisPlanSchema.safeParse(
    parseJson(analysisBytes),
  )
  const oracle = deriveExperimentalDesignSkillUniqueOracle(graph)
  return { graphBytes, replication, analysis, oracle }
}

async function gradeInputIntegrity(root: string, payload: Payload): Promise<GradeResult> {
  const [graph, publicInterface] = await Promise.all([
    readSafeFile(root, payload.paths.studyGraph),
    readSafeFile(root, payload.paths.interface),
  ])
  if (!graph || !publicInterface) return failing("Protected input is missing")
  if (
    sha256(graph) !== payload.protectedSha256.studyGraph ||
    sha256(publicInterface) !== payload.protectedSha256.interface
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
  const initial = await readInitialWorkdirManifest({
    workDir: root,
    reference: initialWorkdirManifest,
  })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: ["design"],
    requiredNewFiles: [payload.paths.replicationPlan, payload.paths.analysisPlan],
  })
  if (delta.status !== "pass") return failing("Final workdir violates the exact output contract")

  const [replication, analysis] = await Promise.all([
    readSafeFile(root, payload.paths.replicationPlan),
    readSafeFile(root, payload.paths.analysisPlan),
  ])
  if (
    !ExperimentalDesignSkillUniqueReplicationPlanSchema.safeParse(parseJson(replication)).success ||
    !ExperimentalDesignSkillUniqueAnalysisPlanSchema.safeParse(parseJson(analysis)).success
  ) {
    return failing("Output JSON does not satisfy the public field contract")
  }
  return passing("Exact output set and public JSON contracts pass")
}

async function gradeSemantic(root: string, payload: Payload): Promise<GradeResult> {
  const state = await readSemanticInputs(root, payload)
  if (state.oracle.status !== "confirmed") {
    return failing("Public study graph does not support a confirmed semantic oracle")
  }
  if (!state.replication.success || !state.analysis.success) {
    return failing("Required semantic output is missing or invalid")
  }

  if (payload.check === "independent-replication") {
    const plan = state.replication.data
    return plan.studyId === state.oracle.studyId &&
      plan.independentReplicateUnit === state.oracle.independentReplicateUnit &&
      plan.independentReplicateCount === state.oracle.independentReplicateCount
      ? passing("Independent replicate identity and count match observable study structure")
      : failing("Independent replicate identity or count is inconsistent")
  }

  if (payload.check === "pseudoreplication-guard") {
    const plan = state.replication.data
    return plan.studyId === state.oracle.studyId &&
      plan.measurementUnit === state.oracle.measurementUnit &&
      plan.pseudoreplicationRisk === state.oracle.pseudoreplicationRisk
      ? passing("Measurement level and pseudoreplication risk match observable study structure")
      : failing("Measurement level or pseudoreplication risk is inconsistent")
  }

  const assessment = assessExperimentalDesignSkillUniqueAnalysis(
    state.oracle,
    state.analysis.data,
  )
  return assessment.valid
    ? passing("Analysis unit and grouping factors respect the observable hierarchy")
    : failing(`Analysis hierarchy is inconsistent: ${assessment.reason}`)
}

export const experimentalDesignSkillUniqueGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    ExperimentalDesignSkillUniqueGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const parsed = ExperimentalDesignSkillUniqueGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid skill-unique evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")

    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      if (parsed.data.check === "input-integrity") {
        return await gradeInputIntegrity(root, parsed.data)
      }
      if (parsed.data.check === "artifact-contract") {
        if (!runResult.initialWorkdirManifest) {
          return infrastructure("Run result does not include initial workdir provenance")
        }
        return await gradeArtifactContract(root, parsed.data, runResult.initialWorkdirManifest)
      }
      return await gradeSemantic(root, parsed.data)
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe filesystem path in skill-unique workdir")
      }
      return infrastructure(
        `Skill-unique evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  },
}

registerCustomEvaluator(
  "skill-ir-experimental-design-skill-unique",
  experimentalDesignSkillUniqueGrade,
)
