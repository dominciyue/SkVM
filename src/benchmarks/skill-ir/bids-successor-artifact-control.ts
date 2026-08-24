import { isDeepStrictEqual } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  compileBidsSuccessorValidatedArtifact,
  loadBidsSuccessorArtifactCompilerInput,
} from "./bids-successor-artifact-compiler.ts"
import { BidsProspectiveConstructionReportSchema } from "./bids-prospective-construction.ts"
import { BidsSuccessorTaskSetSchema } from "./bids-successor-contract.ts"
import { loadBidsSuccessorDevelopmentScorer } from "./bids-successor-development.ts"
import {
  BIDS_SUCCESSOR_MATRIX_FREEZE_PATH,
  BIDS_SUCCESSOR_MATRIX_POLICY_PATH,
  validateBidsSuccessorMatrixFreeze,
  validateBidsSuccessorMatrixPolicy,
} from "./bids-successor-matrix.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"
import { sha256Bytes } from "./source-fixture.ts"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog.ts"
import { runValidatedArtifactPlan } from "./validated-artifact-runtime.ts"

const LOCK_PATH = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"
const QUALIFICATION_PATH = "results/skill-ir/bids-successor-development-v1/qualification.json"
const TASKS_PATH = "benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json"
const PUBLIC_PATH = "benchmarks/skill-ir/pilots/bids/successor-v2/public-interface.json"
const SCORER_PATH = "src/bench/evaluators/bids-successor-grade.ts"
const CONSTRUCTION_PATH = "results/skill-ir/bids-prospective-construction-v1/report.json"
export const BIDS_SUCCESSOR_ARTIFACT_CONTROL_FREEZE_PATH =
  "results/skill-ir/bids-successor-artifact-control-freeze-v1.json"

const PINNED_UPSTREAM_PATHS = [
  "src/benchmarks/skill-ir/bids-artifact-compiler.ts",
  "src/benchmarks/skill-ir/bids-artifact-runtime.ts",
  "src/benchmarks/skill-ir/bids-contract.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
] as const

const IMPLEMENTATION_PATHS = [
  "benchmarks/skill-ir/pilots/bids/successor-v2/artifact-adapter.json",
  "src/benchmarks/skill-ir/bids-successor-artifact-runtime.ts",
  "src/benchmarks/skill-ir/bids-successor-artifact-compiler.ts",
  "src/benchmarks/skill-ir/bids-successor-artifact-control.ts",
  "src/benchmarks/skill-ir/bids-successor-artifact-control-run.ts",
  "src/benchmarks/skill-ir/bids-successor-development-result-run.ts",
] as const

const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

export const BidsSuccessorArtifactControlFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-artifact-control-freeze/v1"),
  freezeId: z.literal("bids-successor-pre-model-artifact-control-identity-v1"),
  status: z.literal("passed"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  identityClosure: z.object({
    policy: FrozenFileSchema,
    matrixFreeze: FrozenFileSchema,
    lock: FrozenFileSchema,
    qualification: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    constructionReport: FrozenFileSchema,
    pinnedUpstream: z.array(FrozenFileSchema).length(PINNED_UPSTREAM_PATHS.length),
    implementation: z.array(FrozenFileSchema).length(IMPLEMENTATION_PATHS.length),
  }).strict(),
  artifact: z.object({
    packageManifest: FrozenFileSchema,
    packageBytes: z.number().int().positive(),
  }).strict(),
  evidence: z.object({ rawRuns: FrozenFileSchema, scoredRuns: FrozenFileSchema }).strict(),
  controls: z.object({
    rows: z.literal(4),
    scoredRows: z.literal(4),
    successfulRows: z.literal(4),
    modelCalls: z.literal(0),
    modelTokens: z.literal(0),
  }).strict(),
  accounting: z.object({
    priorQualificationPaidCalls: z.literal(1),
    currentStagePaidCalls: z.literal(0),
    modelMatrixPaidCalls: z.literal(0),
    retries: z.literal(0),
  }).strict(),
  authorizations: z.object({
    modelMatrix: z.literal(true),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  sensitiveData: z.object({
    apiCredentialContentConsumed: z.literal(false),
    modelOutputContentConsumed: z.literal(false),
    heldOutConsumed: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This pre-model freeze proves that the successor-specific deterministic artifact satisfies all four development controls under the frozen v2 public contract and lock-local scorer. It does not make the hand-authored compiler automatic, consume model or held-out output, or authorize dynamic, held-out, readiness, or main claims.",
  ),
}).strict()

export type BidsSuccessorArtifactControlFreeze = z.infer<
  typeof BidsSuccessorArtifactControlFreezeSchema
>

export type BidsSuccessorArtifactControlRun = {
  rows: 4
  scoredRowCount: 4
  successfulRows: 4
  modelCalls: 0
  modelTokens: 0
  rawRows: RawAgentRunRow[]
  scoredRows: ScoredAgentRunRow[]
  packageManifestPath: string
  packageBytes: number
  rawPath: string
  scoredPath: string
}

async function readJson(rootDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(rootDir, ...relativePath.split("/")), "utf8"))
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim())
    .filter(Boolean).map((line) => JSON.parse(line) as T)
}

async function frozen(rootDir: string, relativePath: string) {
  return FrozenFileSchema.parse({
    path: relativePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, ...relativePath.split("/")))),
  })
}

async function relativeFrozen(rootDir: string, absolutePath: string) {
  const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/")
  return frozen(rootDir, SafeRelativePathSchema.parse(relativePath))
}

function constructionPinnedDigests(construction: z.infer<typeof BidsProspectiveConstructionReportSchema>) {
  const entries = [
    construction.cost.identity.evidence.compilerImplementation,
    ...construction.cost.identity.evidence.catalogRuntime,
  ]
  return new Map(entries.map((entry) => [entry.relativePath, entry.sha256]))
}

function assertPinnedUpstream(
  construction: z.infer<typeof BidsProspectiveConstructionReportSchema>,
  refs: Array<{ path: string; sha256: string }>,
): void {
  const expected = constructionPinnedDigests(construction)
  if (!isDeepStrictEqual(refs.map((item) => item.path), [...PINNED_UPSTREAM_PATHS])) {
    throw new Error("BIDS successor artifact pinned upstream path drift")
  }
  for (const ref of refs) {
    if (expected.get(ref.path) !== ref.sha256) {
      throw new Error(`BIDS successor artifact construction pin mismatch for ${ref.path}`)
    }
  }
}

export async function runBidsSuccessorArtifactControls(input: {
  rootDir: string
  outDir: string
}): Promise<BidsSuccessorArtifactControlRun> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(input.outDir)
  const relativeOutput = path.relative(path.resolve(rootDir, "results/skill-ir"), outDir)
  if (!relativeOutput || relativeOutput === ".." || relativeOutput.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeOutput)) {
    throw new Error("BIDS successor artifact control output must be a child of results/skill-ir")
  }
  const policy = await validateBidsSuccessorMatrixPolicy(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_POLICY_PATH), rootDir,
  )
  await validateBidsSuccessorMatrixFreeze(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_FREEZE_PATH), rootDir, policy.policy,
  )
  if (!policy.policy.authorizations.deterministicControl
    || policy.policy.denominator.deterministicControlRows !== 4) {
    throw new Error("BIDS successor artifact controls are not authorized by the frozen policy")
  }
  const packageDir = path.join(outDir, "package")
  await mkdir(outDir, { recursive: true })
  await compileBidsSuccessorValidatedArtifact(
    await loadBidsSuccessorArtifactCompilerInput(rootDir), packageDir,
  )
  const artifactPackage = await validateValidatedArtifactPackage(packageDir)
  const tasksPath = path.resolve(rootDir, ...TASKS_PATH.split("/"))
  const tasks = BidsSuccessorTaskSetSchema.parse(JSON.parse(await readFile(tasksPath, "utf8")))
  await loadBidsSuccessorDevelopmentScorer(rootDir, policy.lock, policy.lock.frozenInputs.scorer.path)
  const rawRows: RawAgentRunRow[] = []
  for (const task of tasks.tasks) {
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      const workDir = path.join(outDir, "workdirs", task.id, `run-${runIndex}`)
      await mkdir(workDir, { recursive: true })
      for (const [relativePath, contents] of Object.entries(task.fixtures)) {
        const target = path.resolve(workDir, ...relativePath.split("/"))
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, contents, "utf8")
      }
      const manifestPath = path.join(path.dirname(workDir), `initial-workdir-manifest-${runIndex}.json`)
      const initialWorkdirManifest = await writeInitialWorkdirManifest({ workDir, manifestPath })
      const startedAt = performance.now()
      const runtime = await runValidatedArtifactPlan({ package: artifactPackage, workDir })
      const complete = runtime.status === "complete" && runtime.validation?.status === "pass"
      rawRows.push({
        caseId: `bids:skvm:windows:clean:${task.id}`,
        system: "validated-artifact",
        model: "deterministic/bids-successor-artifact",
        modelFamily: "deterministic",
        adapter: "validated-artifact",
        adapterVersion: artifactPackage.manifest.schemaVersion,
        runIndex,
        panelConfigId: policy.policy.analysisId,
        taskPath: tasksPath,
        workDir,
        initialWorkdirManifest,
        exitCode: complete ? 0 : 1,
        runStatus: complete ? "ok" : "adapter-crashed",
        durationMs: Math.round(performance.now() - startedAt),
        stdout: complete ? "validated BIDS successor artifact complete" : "",
        stderr: complete ? "" : "validated BIDS successor artifact failed",
        successSource: "execution-only",
        validatedArtifactRuntime: runtime,
      })
    }
  }
  const rawPath = path.join(outDir, "raw-runs.jsonl")
  await writeFile(rawPath, `${rawRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  const scoredPath = path.join(outDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({ raw: rawPath, tasks: tasksPath, rootDir, out: scoredPath })
  const scoredRows = await readJsonl<ScoredAgentRunRow>(scoredPath)
  const successfulRows = scoredRows.filter((row) => row.success && row.evaluatorScore === 1
    && row.successSource === "deterministic-evaluator").length
  if (rawRows.length !== 4 || scoredRows.length !== 4 || successfulRows !== 4) {
    throw new Error(`BIDS successor artifact control failed: ${rawRows.length}/${scoredRows.length}/${successfulRows}`)
  }
  return {
    rows: 4,
    scoredRowCount: 4,
    successfulRows: 4,
    modelCalls: 0,
    modelTokens: 0,
    rawRows,
    scoredRows,
    packageManifestPath: path.join(packageDir, "package-manifest.json"),
    packageBytes: artifactPackage.packageBytes,
    rawPath,
    scoredPath,
  }
}

export async function buildBidsSuccessorArtifactControlFreeze(input: {
  rootDir: string
  control: BidsSuccessorArtifactControlRun
}): Promise<BidsSuccessorArtifactControlFreeze> {
  const rootDir = path.resolve(input.rootDir)
  const policy = await validateBidsSuccessorMatrixPolicy(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_POLICY_PATH), rootDir,
  )
  await validateBidsSuccessorMatrixFreeze(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_FREEZE_PATH), rootDir, policy.policy,
  )
  const construction = BidsProspectiveConstructionReportSchema.parse(
    await readJson(rootDir, CONSTRUCTION_PATH),
  )
  const pinnedUpstream = await Promise.all(PINNED_UPSTREAM_PATHS.map((item) => frozen(rootDir, item)))
  assertPinnedUpstream(construction, pinnedUpstream)
  const freeze = BidsSuccessorArtifactControlFreezeSchema.parse({
    schemaVersion: "skill-ir-bids-successor-artifact-control-freeze/v1",
    freezeId: "bids-successor-pre-model-artifact-control-identity-v1",
    status: "passed",
    measurementIdentity: policy.lock.measurementIdentity,
    identityClosure: {
      policy: await frozen(rootDir, BIDS_SUCCESSOR_MATRIX_POLICY_PATH),
      matrixFreeze: await frozen(rootDir, BIDS_SUCCESSOR_MATRIX_FREEZE_PATH),
      lock: await frozen(rootDir, LOCK_PATH),
      qualification: await frozen(rootDir, QUALIFICATION_PATH),
      tasks: await frozen(rootDir, TASKS_PATH),
      publicContract: await frozen(rootDir, PUBLIC_PATH),
      scorer: await frozen(rootDir, SCORER_PATH),
      constructionReport: await frozen(rootDir, CONSTRUCTION_PATH),
      pinnedUpstream,
      implementation: await Promise.all(IMPLEMENTATION_PATHS.map((item) => frozen(rootDir, item))),
    },
    artifact: {
      packageManifest: await relativeFrozen(rootDir, input.control.packageManifestPath),
      packageBytes: input.control.packageBytes,
    },
    evidence: {
      rawRuns: await relativeFrozen(rootDir, input.control.rawPath),
      scoredRuns: await relativeFrozen(rootDir, input.control.scoredPath),
    },
    controls: {
      rows: input.control.rows,
      scoredRows: input.control.scoredRowCount,
      successfulRows: input.control.successfulRows,
      modelCalls: input.control.modelCalls,
      modelTokens: input.control.modelTokens,
    },
    accounting: {
      priorQualificationPaidCalls: 1,
      currentStagePaidCalls: 0,
      modelMatrixPaidCalls: 0,
      retries: 0,
    },
    authorizations: {
      modelMatrix: true,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    sensitiveData: {
      apiCredentialContentConsumed: false,
      modelOutputContentConsumed: false,
      heldOutConsumed: false,
    },
    claimBoundary:
      "This pre-model freeze proves that the successor-specific deterministic artifact satisfies all four development controls under the frozen v2 public contract and lock-local scorer. It does not make the hand-authored compiler automatic, consume model or held-out output, or authorize dynamic, held-out, readiness, or main claims.",
  })
  return validateBidsSuccessorArtifactControlFreeze(freeze, rootDir)
}

export async function validateBidsSuccessorArtifactControlFreeze(
  input: unknown,
  rawRootDir: string,
): Promise<BidsSuccessorArtifactControlFreeze> {
  const freeze = BidsSuccessorArtifactControlFreezeSchema.parse(input)
  const rootDir = path.resolve(rawRootDir)
  const expectedNamed = {
    policy: BIDS_SUCCESSOR_MATRIX_POLICY_PATH,
    matrixFreeze: BIDS_SUCCESSOR_MATRIX_FREEZE_PATH,
    lock: LOCK_PATH,
    qualification: QUALIFICATION_PATH,
    tasks: TASKS_PATH,
    publicContract: PUBLIC_PATH,
    scorer: SCORER_PATH,
    constructionReport: CONSTRUCTION_PATH,
  }
  for (const [name, expectedPath] of Object.entries(expectedNamed)) {
    const ref = freeze.identityClosure[name as keyof typeof expectedNamed]
    if (ref.path !== expectedPath) throw new Error(`BIDS successor artifact ${name} path drift`)
  }
  if (!isDeepStrictEqual(freeze.identityClosure.pinnedUpstream.map((item) => item.path),
    [...PINNED_UPSTREAM_PATHS])
    || !isDeepStrictEqual(freeze.identityClosure.implementation.map((item) => item.path),
      [...IMPLEMENTATION_PATHS])) {
    throw new Error("BIDS successor artifact implementation or pin path drift")
  }
  const allFiles = [
    ...Object.values(freeze.identityClosure).filter((value): value is { path: string; sha256: string } =>
      !Array.isArray(value)),
    ...freeze.identityClosure.pinnedUpstream,
    ...freeze.identityClosure.implementation,
    freeze.artifact.packageManifest,
    freeze.evidence.rawRuns,
    freeze.evidence.scoredRuns,
  ]
  for (const file of allFiles) {
    const actual = sha256Bytes(await readFile(path.resolve(rootDir, ...file.path.split("/"))))
    if (actual !== file.sha256) {
      throw new Error(`BIDS successor artifact control digest mismatch for ${file.path}`)
    }
  }
  const policy = await validateBidsSuccessorMatrixPolicy(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_POLICY_PATH), rootDir,
  )
  await validateBidsSuccessorMatrixFreeze(
    await readJson(rootDir, BIDS_SUCCESSOR_MATRIX_FREEZE_PATH), rootDir, policy.policy,
  )
  if (!isDeepStrictEqual(freeze.identityClosure.lock, policy.policy.lock)
    || !isDeepStrictEqual(freeze.identityClosure.qualification, policy.policy.qualification)
    || !isDeepStrictEqual(freeze.identityClosure.tasks, policy.policy.tasks)
    || !isDeepStrictEqual(freeze.identityClosure.scorer, policy.policy.scorer)) {
    throw new Error("BIDS successor artifact control parent identity drift")
  }
  const construction = BidsProspectiveConstructionReportSchema.parse(
    await readJson(rootDir, CONSTRUCTION_PATH),
  )
  assertPinnedUpstream(construction, freeze.identityClosure.pinnedUpstream)
  const packageDir = path.dirname(path.resolve(
    rootDir, ...freeze.artifact.packageManifest.path.split("/"),
  ))
  const artifactPackage = await validateValidatedArtifactPackage(packageDir)
  if (artifactPackage.packageBytes !== freeze.artifact.packageBytes) {
    throw new Error("BIDS successor artifact package byte count drift")
  }
  const rawRows = await readJsonl<RawAgentRunRow>(path.resolve(
    rootDir, ...freeze.evidence.rawRuns.path.split("/"),
  ))
  const scoredRows = await readJsonl<ScoredAgentRunRow>(path.resolve(
    rootDir, ...freeze.evidence.scoredRuns.path.split("/"),
  ))
  const successfulRows = scoredRows.filter((row) => row.success && row.evaluatorScore === 1
    && row.successSource === "deterministic-evaluator").length
  if (rawRows.length !== 4 || scoredRows.length !== 4 || successfulRows !== 4
    || rawRows.some((row) => row.system !== "validated-artifact"
      || row.taskPath !== path.resolve(rootDir, ...TASKS_PATH.split("/")))) {
    throw new Error("BIDS successor artifact deterministic control evidence drift")
  }
  return freeze
}
