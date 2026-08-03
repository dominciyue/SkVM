import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { sha256Bytes } from "./source-fixture.ts"
import {
  readAndValidateNamespacedResourceDevelopmentLock,
  type ValidatedNamespacedResourceDevelopmentLock,
} from "../../skill-ir/resource-namespace-lock.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

export const NamespacedResourceDevelopmentQualityLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-namespaced-resource-quality-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("namespaced-resource-quality-development-v1"),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  compatibilityLock: FrozenFileSchema,
  frozenImplementations: z.object({
    planner: FrozenFileSchema,
    execution: FrozenFileSchema,
    runner: FrozenFileSchema,
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
  matrix: z.object({
    systems: z.tuple([
      z.literal("no-skill"),
      z.literal("original"),
      z.literal("ir-static"),
      z.literal("optimized"),
    ]),
    skills: z.tuple([z.literal("law-to-markdown"), z.literal("experimental-design")]),
    taskIds: z.tuple([
      z.literal("law-to-markdown-statute-dev-001"),
      z.literal("law-to-markdown-standard-dev-002"),
      z.literal("experimental-design-stratified-dev-001"),
      z.literal("experimental-design-cluster-dev-002"),
    ]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    repetitions: z.literal(1),
    expectedRows: z.literal(16),
    expectedQuartets: z.literal(4),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    retryDelayMs: z.literal(0),
    routeProbeRequired: z.literal(true),
    resourceProbeRequired: z.literal(true),
  }).strict(),
  gate: z.object({
    expectedRows: z.literal(16),
    expectedQuartets: z.literal(4),
    minimumOptimizedSuccesses: z.literal(4),
    minimumOptimizedMeanScore: z.literal(0.85),
    minimumOptimizedTaskMeanScore: z.literal(0.85),
    maximumInfrastructureFailures: z.literal(0),
    maximumPairwiseRegressions: z.literal(0),
  }).strict(),
  promotionBoundary: z.object({
    developmentOnly: z.literal(true),
    entersMainClaim: z.literal(false),
    permitsHeldOutPlanning: z.literal(false),
    permitsHeldOutExecution: z.literal(false),
    permitsPgo: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsPackageRecompile: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.systems).size !== lock.matrix.systems.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "namespaced quality systems must be unique" })
  }
  if (lock.matrix.expectedRows !== lock.matrix.taskIds.length * lock.matrix.systems.length * lock.matrix.repetitions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "namespaced quality expectedRows mismatch" })
  }
  if (lock.matrix.expectedQuartets !== lock.matrix.taskIds.length * lock.matrix.repetitions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "namespaced quality expectedQuartets mismatch" })
  }
  if (lock.promotionBoundary.permitsHeldOutExecution || lock.promotionBoundary.permitsPgo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "namespaced quality lock cannot permit held-out or PGO" })
  }
})

export type NamespacedResourceDevelopmentQualityLock = z.infer<typeof NamespacedResourceDevelopmentQualityLockSchema>

function resolveWithin(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.replaceAll("\\", "/").split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`namespaced quality lock path escapes root: ${relativePath}`)
  }
  return absolute
}

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const absolute = resolveWithin(rootDir, file.path)
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`namespaced quality frozen file is not regular: ${file.path}`)
  const actual = sha256Bytes(await readFile(absolute))
  if (actual !== file.sha256) throw new Error(`namespaced quality digest mismatch: ${file.path}`)
}

type PilotCorpus = { skills: Array<{ id: string; tasksPath?: string; status?: string }> }
type TaskSet = { skillId: string; tasks: Array<{ id: string; split: string }> }

export async function validateNamespacedResourceDevelopmentQualityLock(
  input: unknown,
  rootDir: string,
): Promise<{
  lock: NamespacedResourceDevelopmentQualityLock
  compatibility: ValidatedNamespacedResourceDevelopmentLock
}> {
  const resolvedRoot = path.resolve(rootDir)
  const lock = NamespacedResourceDevelopmentQualityLockSchema.parse(input)
  await Promise.all([
    lock.compatibilityLock,
    ...Object.values(lock.frozenImplementations),
  ].map((file) => verifyFrozenFile(resolvedRoot, file)))
  const compatibility = await readAndValidateNamespacedResourceDevelopmentLock({
    rootDir: resolvedRoot,
    lockPath: resolveWithin(resolvedRoot, lock.compatibilityLock.path),
  })
  if (compatibility.lock.experimentId !== "namespaced-resource-compatibility-v1") {
    throw new Error("namespaced quality compatibility identity drift")
  }
  const corpus = JSON.parse(await readFile(path.join(resolvedRoot, "benchmarks/skill-ir/corpus/corpora/pilot.json"), "utf8")) as PilotCorpus
  const taskIds = new Set<string>()
  for (const skillId of lock.matrix.skills) {
    const entry = corpus.skills.find((candidate) => candidate.id === skillId)
    if (!entry || entry.status !== "runnable" || !entry.tasksPath) throw new Error(`namespaced quality skill is not runnable: ${skillId}`)
    const taskSet = JSON.parse(await readFile(path.join(resolvedRoot, entry.tasksPath), "utf8")) as TaskSet
    if (taskSet.skillId !== skillId) throw new Error(`namespaced quality task identity drift: ${skillId}`)
    for (const task of taskSet.tasks) {
      if (lock.matrix.taskIds.includes(task.id as never)) {
        if (task.split !== "development") throw new Error(`namespaced quality task is not development: ${task.id}`)
        taskIds.add(task.id)
      }
    }
  }
  if (taskIds.size !== lock.matrix.taskIds.length) throw new Error("namespaced quality task set is incomplete")
  return { lock, compatibility }
}

export async function readAndValidateNamespacedResourceDevelopmentQualityLock(opts: {
  rootDir: string
  lockPath: string
}): Promise<{
  lock: NamespacedResourceDevelopmentQualityLock
  compatibility: ValidatedNamespacedResourceDevelopmentLock
}> {
  const rootDir = path.resolve(opts.rootDir)
  const lockPath = path.isAbsolute(opts.lockPath) ? opts.lockPath : resolveWithin(rootDir, opts.lockPath)
  return validateNamespacedResourceDevelopmentQualityLock(
    JSON.parse(await readFile(lockPath, "utf8")),
    rootDir,
  )
}
