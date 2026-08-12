import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const BoundFileSchema = z.object({ path: SafeRelativePathSchema, sha256: DigestSchema }).strict()
const BoundTasksSchema = BoundFileSchema.extend({
  split: z.enum(["development", "held-out"]),
  taskIds: z.array(z.string().min(1)).length(2),
}).strict()

export const MethodCaseTaskSplitFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-case-task-split-freeze/v1"),
  benchmarkId: z.string().min(1),
  taskCommit: z.string().regex(/^[a-f0-9]{40}$/),
  publicContract: BoundFileSchema,
  publicContractSourceAudit: BoundFileSchema,
  developmentTasks: BoundTasksSchema,
  heldoutTasks: BoundTasksSchema,
  sourceClosure: z.array(BoundFileSchema).min(1),
  frozenHistorical: z.array(BoundFileSchema).optional(),
}).strict().superRefine((freeze, context) => {
  const paths = [
    freeze.publicContract.path,
    freeze.publicContractSourceAudit.path,
    freeze.developmentTasks.path,
    freeze.heldoutTasks.path,
    ...freeze.sourceClosure.map((entry) => entry.path),
    ...(freeze.frozenHistorical ?? []).map((entry) => entry.path),
  ]
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "frozen paths must be unique" })
  }
  const taskIds = [...freeze.developmentTasks.taskIds, ...freeze.heldoutTasks.taskIds]
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "development and held-out task IDs must not overlap" })
  }
})

export type MethodCaseTaskSplitFreeze = z.infer<typeof MethodCaseTaskSplitFreezeSchema>

export const MethodCaseDevelopmentFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-case-development-freeze/v1"),
  benchmarkId: z.string().min(1),
  taskCommit: z.string().regex(/^[a-f0-9]{40}$/),
  publicContract: BoundFileSchema,
  publicContractSourceAudit: BoundFileSchema,
  developmentTasks: BoundTasksSchema.extend({ split: z.literal("development") }).strict(),
  heldoutBoundary: z.object({
    status: z.literal("not-authored"),
    permitsExecution: z.literal(false),
    futureTasksRequireFreshIsolation: z.literal(true),
  }).strict(),
  sourceClosure: z.array(BoundFileSchema).min(1),
  frozenHistorical: z.array(BoundFileSchema).optional(),
}).strict().superRefine((freeze, context) => {
  const paths = [
    freeze.publicContract.path,
    freeze.publicContractSourceAudit.path,
    freeze.developmentTasks.path,
    ...freeze.sourceClosure.map((entry) => entry.path),
    ...(freeze.frozenHistorical ?? []).map((entry) => entry.path),
  ]
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "frozen paths must be unique" })
  }
})

export type MethodCaseDevelopmentFreeze = z.infer<typeof MethodCaseDevelopmentFreezeSchema>
export type AnyMethodCaseTaskFreeze = MethodCaseTaskSplitFreeze | MethodCaseDevelopmentFreeze

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function readGitBlob(rootDir: string, commit: string, relativePath: string): Buffer {
  return execFileSync("git", [
    "-c",
    `safe.directory=${path.resolve(rootDir).replaceAll("\\", "/")}`,
    "show",
    `${commit}:${relativePath}`,
  ], {
    cwd: rootDir,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
}

async function readSafeDiskFile(rootDir: string, relativePath: string): Promise<Buffer> {
  const root = await realpath(path.resolve(rootDir))
  const candidate = path.resolve(root, ...relativePath.split("/"))
  const stat = await lstat(candidate)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`frozen path is not a regular file: ${relativePath}`)
  const resolved = await realpath(candidate)
  const relative = path.relative(root, resolved)
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`frozen path escapes repository root: ${relativePath}`)
  }
  return readFile(resolved)
}

function normalizedRepositoryBytes(bytes: Uint8Array): Buffer {
  return Buffer.from(Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n"), "utf8")
}

function sameRepositoryBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right))
    || normalizedRepositoryBytes(left).equals(normalizedRepositoryBytes(right))
}

function containsForbiddenEvidence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenEvidence)
  if (!value || typeof value !== "object") return false
  return Object.entries(value).some(([key, nested]) =>
    /^(?:expected|expectedAnswer|gold|evaluatorPayload|heldoutFeedback|modelOutput|historicalResult|secretValue)$/iu.test(key)
    || containsForbiddenEvidence(nested)
  )
}

async function verifyBoundFile(
  rootDir: string,
  commit: string,
  file: { path: string; sha256: string },
): Promise<Buffer> {
  const committed = readGitBlob(rootDir, commit, file.path)
  if (sha256(committed) !== file.sha256) throw new Error(`committed digest mismatch: ${file.path}`)
  const disk = await readSafeDiskFile(rootDir, file.path)
  if (!sameRepositoryBytes(disk, committed)) throw new Error(`working tree digest drift: ${file.path}`)
  return committed
}

function verifyTaskSet(
  bytes: Uint8Array,
  benchmarkId: string,
  split: "development" | "held-out",
  taskIds: readonly string[],
): void {
  const value = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
    skillId?: unknown
    tasks?: Array<{ id?: unknown; split?: unknown }>
  }
  if (containsForbiddenEvidence(value)) throw new Error("task set contains forbidden evaluator evidence")
  if (value.skillId !== benchmarkId || !Array.isArray(value.tasks) || value.tasks.length !== 2) {
    throw new Error(`task set identity mismatch: ${benchmarkId}`)
  }
  const actualIds = value.tasks.map((task) => task.id)
  if (
    JSON.stringify(actualIds) !== JSON.stringify(taskIds)
    || value.tasks.some((task) => task.split !== split)
  ) {
    throw new Error(`task split mismatch: ${benchmarkId}/${split}`)
  }
}

export async function verifyMethodCaseTaskSplitFreeze(
  rootDir: string,
  rawFreeze: unknown,
): Promise<AnyMethodCaseTaskFreeze> {
  const freeze = z.union([MethodCaseTaskSplitFreezeSchema, MethodCaseDevelopmentFreezeSchema]).parse(rawFreeze)
  const files = [
    freeze.publicContract,
    freeze.publicContractSourceAudit,
    freeze.developmentTasks,
    ...(freeze.schemaVersion === "skill-ir-method-case-task-split-freeze/v1" ? [freeze.heldoutTasks] : []),
    ...freeze.sourceClosure,
    ...(freeze.frozenHistorical ?? []),
  ]
  const committed = await Promise.all(
    files.map((file) => verifyBoundFile(rootDir, freeze.taskCommit, file)),
  )
  const bytesByPath = new Map(files.map((file, index) => [file.path, committed[index]!] as const))
  verifyTaskSet(
    bytesByPath.get(freeze.developmentTasks.path)!,
    freeze.benchmarkId,
    "development",
    freeze.developmentTasks.taskIds,
  )
  if (freeze.schemaVersion === "skill-ir-method-case-task-split-freeze/v1") {
    verifyTaskSet(
      bytesByPath.get(freeze.heldoutTasks.path)!,
      freeze.benchmarkId,
      "held-out",
      freeze.heldoutTasks.taskIds,
    )
  }
  return freeze
}
