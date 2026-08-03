import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { loadSkill } from "../core/skill-loader.ts"
import { SafeRelativePathSchema, Sha256Schema } from "../benchmarks/skill-ir/artifact-package.ts"
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture.ts"
import { compileNamespacedSkillResources, type NamespacedSkillResourcePackage } from "./resource-namespace.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const ResourceCaseSchema = z.object({
  skillId: z.string().min(1),
  packageId: z.string().min(1),
  source: FrozenFileSchema,
  expected: z.object({
    sourceDigest: Sha256Schema,
    closureDigest: Sha256Schema,
    namespaceRoot: SafeRelativePathSchema,
    resourceFiles: z.number().int().positive(),
    rewriteCount: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export const NamespacedResourceDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-namespaced-resource-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  phase: z.literal("compatibility-canary"),
  cases: z.array(ResourceCaseSchema).min(2).max(8),
  canaryReport: FrozenFileSchema,
  frozenImplementations: z.array(FrozenFileSchema).min(3).max(8),
  runtime: z.object({
    pythonCommand: z.string().min(1),
    syntaxOnly: z.literal(true),
    networkAllowed: z.literal(false),
    writesAllowed: z.literal(false),
  }).strict(),
  promotionBoundary: z.object({
    optimizedOnly: z.literal(true),
    exactOriginalUnchanged: z.literal(true),
    entersMainClaim: z.literal(false),
    permitsPaidExecution: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsPgo: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsPackageRecompile: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, context) => {
  const skillIds = lock.cases.map((entry) => entry.skillId)
  const packageIds = lock.cases.map((entry) => entry.packageId)
  if (new Set(skillIds).size !== skillIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "resource lock skill ids must be unique" })
  }
  if (new Set(packageIds).size !== packageIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "resource lock package ids must be unique" })
  }
  if (lock.frozenImplementations.some((file) => file.path === lock.canaryReport.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "canary report cannot be an implementation input" })
  }
})

export type NamespacedResourceDevelopmentLock = z.infer<typeof NamespacedResourceDevelopmentLockSchema>

type CanaryCase = {
  skillId: string
  status: string
  packageStatus: string
  sourceDigest: string
  closureDigest: string
  namespaceRoot: string
  resourceFiles: number
  rewriteCount: number
  unresolvedReferences: string[]
  rootResourcePathsPresent: string[]
  integrity: string
}

type CanaryReport = {
  schemaVersion: string
  status: string
  cases: CanaryCase[]
  claimBoundary?: string
}

function resolveFrozenPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`resource development lock path escapes repository root: ${relativePath}`)
  }
  return absolute
}

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const absolute = resolveFrozenPath(rootDir, file.path)
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`resource development lock file must be a regular file: ${file.path}`)
  }
  const actual = sha256Bytes(await readFile(absolute))
  if (actual !== file.sha256) {
    throw new Error(`resource development lock digest mismatch: ${file.path}`)
  }
}

function assertCanaryCase(report: CanaryReport, expected: NamespacedResourceDevelopmentLock["cases"][number]): void {
  if (report.status !== "passed") throw new Error("resource namespace canary report is not passed")
  const actual = report.cases.find((entry) => entry.skillId === expected.skillId)
  if (!actual) throw new Error(`resource namespace canary case missing: ${expected.skillId}`)
  if (
    actual.status !== "passed"
    || actual.packageStatus !== "ready"
    || actual.sourceDigest !== expected.expected.sourceDigest
    || actual.closureDigest !== expected.expected.closureDigest
    || actual.namespaceRoot !== expected.expected.namespaceRoot
    || actual.resourceFiles !== expected.expected.resourceFiles
    || actual.rewriteCount !== expected.expected.rewriteCount
    || actual.unresolvedReferences.length !== 0
    || actual.rootResourcePathsPresent.length !== 0
    || actual.integrity !== "passed"
  ) {
    throw new Error(`resource namespace canary case mismatch: ${expected.skillId}`)
  }
}

export type ValidatedNamespacedResourceDevelopmentLock = {
  lock: NamespacedResourceDevelopmentLock
  report: CanaryReport
  packages: NamespacedSkillResourcePackage[]
}

export async function validateNamespacedResourceDevelopmentLock(
  input: unknown,
  rootDir: string,
): Promise<ValidatedNamespacedResourceDevelopmentLock> {
  const lock = NamespacedResourceDevelopmentLockSchema.parse(input)
  const frozenFiles = [lock.canaryReport, ...lock.frozenImplementations]
  await Promise.all(frozenFiles.map((file) => verifyFrozenFile(rootDir, file)))

  const report = JSON.parse(await readFile(resolveFrozenPath(rootDir, lock.canaryReport.path), "utf8")) as CanaryReport
  if (report.schemaVersion !== "skill-ir-namespaced-resource-canary/v1") {
    throw new Error("resource namespace canary report schema mismatch")
  }

  const packages: NamespacedSkillResourcePackage[] = []
  for (const expected of lock.cases) {
    assertCanaryCase(report, expected)
    const skill = await loadSkill(resolveFrozenPath(rootDir, expected.source.path))
    const sourceDigest = sha256Bytes(Buffer.from(skill.skillContent, "utf8"))
    if (sourceDigest !== expected.source.sha256 || sourceDigest !== expected.expected.sourceDigest) {
      throw new Error(`resource development source digest mismatch: ${expected.skillId}`)
    }
    const compiled = await compileNamespacedSkillResources(skill, { packageId: expected.packageId })
    if (
      compiled.status !== "ready"
      || compiled.sourceDigest !== expected.expected.sourceDigest
      || compiled.closureDigest !== expected.expected.closureDigest
      || compiled.namespaceRoot !== expected.expected.namespaceRoot
      || compiled.resources.length !== expected.expected.resourceFiles
      || compiled.rewrites.reduce((sum, rewrite) => sum + rewrite.occurrences, 0) !== expected.expected.rewriteCount
      || compiled.unresolvedReferences.length !== 0
    ) {
      throw new Error(`resource development package identity mismatch: ${expected.skillId}`)
    }
    packages.push(compiled)
  }

  if (report.cases.length !== lock.cases.length) {
    throw new Error("resource namespace canary report contains an unexpected case")
  }
  return { lock, report, packages }
}

export async function readAndValidateNamespacedResourceDevelopmentLock(opts: {
  rootDir: string
  lockPath: string
}): Promise<ValidatedNamespacedResourceDevelopmentLock> {
  const absoluteLockPath = resolveFrozenPath(opts.rootDir, path.relative(opts.rootDir, path.resolve(opts.lockPath)).replaceAll(path.sep, "/"))
  return validateNamespacedResourceDevelopmentLock(
    JSON.parse(await readFile(absoluteLockPath, "utf8")),
    opts.rootDir,
  )
}
