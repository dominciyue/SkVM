import path from "node:path"
import { copyFile, lstat, mkdir, readFile, readdir } from "node:fs/promises"
import { z } from "zod"
import { ProposalMetaSchema } from "../proposals/storage.ts"
import { selectOptimizationImplementations } from "./implementations.ts"
import type { ImplementationSelection } from "./implementations.ts"
import { OptimizeSubmissionSchema } from "./types.ts"

export const OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION = "skvm-optimized-skill-package/v1" as const
export const OPTIMIZED_SKILL_PACKAGE_MANIFEST = "optimization-manifest.json" as const

const FileRefSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const ImplementationSelectionSchema = z.object({
  actionId: z.string(),
  kind: z.enum(["reuse-script", "domain-backend", "generate-script", "restructure-docs"]),
  status: z.enum(["selected", "not-applicable", "failed"]),
  entry: z.string().optional(),
  runtime: z.enum(["python", "node", "shell", "powershell", "unknown"]).optional(),
  backendId: z.string().optional(),
  reason: z.string().optional(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  preconditions: z.array(z.string()),
  residualDuties: z.array(z.string()),
  verification: z.array(z.string()),
})

export const OptimizedSkillPackageManifestSchema = z.object({
  schemaVersion: z.literal(OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION),
  identity: z.string().min(1),
  exposure: z.literal("development"),
  proposal: z.object({
    dirName: z.string().min(1),
    bestRound: z.number().int().nonnegative(),
    meta: FileRefSchema,
    submission: FileRefSchema.optional(),
  }),
  snapshots: z.object({
    originalClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    selectedClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  actualDiff: z.object({
    added: z.array(z.string()),
    modified: z.array(z.string()),
    deleted: z.array(z.string()),
    moved: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  files: z.array(FileRefSchema),
  implementations: z.array(ImplementationSelectionSchema),
  runtime: z.object({
    runtimes: z.array(z.enum(["python", "node", "shell", "powershell", "unknown"])),
    dependencyFiles: z.array(z.string()),
  }),
  validation: z.object({
    status: z.literal("passed"),
    scope: z.literal("package-file-closure"),
    behaviorStatus: z.literal("not-run"),
  }),
  claimBoundary: z.string().min(1),
})

export type OptimizedSkillPackageManifest = z.infer<typeof OptimizedSkillPackageManifestSchema>

export interface BuildOptimizedSkillPackageOptions {
  proposalDir: string
  packageDir: string
}

export interface BuildOptimizedSkillPackageResult {
  status: "exported" | "no-change"
  packageDir?: string
  sourceProposalDir: string
  validation: "not-run" | "passed" | "failed"
}

export interface VerifiedOptimizedSkillPackage {
  packageDir: string
  manifest: OptimizedSkillPackageManifest
}

interface SourceFile {
  path: string
  absolute: string
  bytes: number
  sha256: string
}

function sha256(bytes: Uint8Array | string): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function portable(relativePath: string): string {
  return relativePath.split(path.sep).join("/")
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function resolveContained(root: string, relativePath: string): string {
  const absoluteRoot = path.resolve(root)
  const absolute = path.resolve(absoluteRoot, relativePath)
  if (!isWithin(absoluteRoot, absolute) || absolute === absoluteRoot) {
    throw new Error(`Package path escapes its root: ${relativePath}`)
  }
  return absolute
}

async function listSourceFiles(root: string): Promise<SourceFile[]> {
  const absoluteRoot = path.resolve(root)
  const rootStat = await lstat(absoluteRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Skill snapshot must be a non-symlink directory: ${absoluteRoot}`)
  }
  const files: SourceFile[] = []
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (prefix === "" && entry.name === ".git") continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = resolveContained(absoluteRoot, relative)
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not portable package inputs: ${relative}`)
      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported package entry type: ${relative}`)
      const bytes = new Uint8Array(await Bun.file(absolute).arrayBuffer())
      files.push({ path: portable(relative), absolute, bytes: bytes.byteLength, sha256: sha256(bytes) })
    }
  }
  await walk(absoluteRoot, "")
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function closureSha256(files: readonly SourceFile[]): string {
  return sha256(JSON.stringify(files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))))
}

function computeDiff(original: readonly SourceFile[], selected: readonly SourceFile[]): OptimizedSkillPackageManifest["actualDiff"] {
  const before = new Map(original.map((file) => [file.path, file]))
  const after = new Map(selected.map((file) => [file.path, file]))
  const modified = [...before.keys()].filter((name) => after.has(name) && before.get(name)!.sha256 !== after.get(name)!.sha256)
  const removed = [...before.keys()].filter((name) => !after.has(name))
  const added = [...after.keys()].filter((name) => !before.has(name))
  const removedByDigest = new Map<string, string[]>()
  const addedByDigest = new Map<string, string[]>()
  for (const name of removed) removedByDigest.set(before.get(name)!.sha256, [...(removedByDigest.get(before.get(name)!.sha256) ?? []), name])
  for (const name of added) addedByDigest.set(after.get(name)!.sha256, [...(addedByDigest.get(after.get(name)!.sha256) ?? []), name])
  const moved: Array<{ from: string; to: string }> = []
  const movedFrom = new Set<string>()
  const movedTo = new Set<string>()
  for (const [digest, from] of removedByDigest) {
    const to = addedByDigest.get(digest) ?? []
    if (from.length !== 1 || to.length !== 1) continue
    moved.push({ from: from[0]!, to: to[0]! })
    movedFrom.add(from[0]!)
    movedTo.add(to[0]!)
  }
  return {
    added: added.filter((name) => !movedTo.has(name)).sort(),
    modified: modified.sort(),
    deleted: removed.filter((name) => !movedFrom.has(name)).sort(),
    moved: moved.sort((left, right) => left.from.localeCompare(right.from)),
  }
}

function hasChanges(diff: OptimizedSkillPackageManifest["actualDiff"]): boolean {
  return diff.added.length + diff.modified.length + diff.deleted.length + diff.moved.length > 0
}

async function prepareOutput(packageDir: string): Promise<void> {
  try {
    const outputStat = await lstat(packageDir)
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw new Error("Package output must be a non-symlink directory")
    if ((await readdir(packageDir)).length > 0) throw new Error("Package output directory must be empty")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await mkdir(packageDir, { recursive: true })
  }
}

async function readImplementations(proposalDir: string, bestRound: number, selectedDir: string): Promise<{
  submission?: { path: string; bytes: number; sha256: string }
  implementations: ImplementationSelection[]
}> {
  if (bestRound === 0) return { implementations: [] }
  const relative = `round-${bestRound}-optimizer/submission.json`
  const absolute = resolveContained(proposalDir, relative)
  try {
    const bytes = await readFile(absolute)
    const submission = OptimizeSubmissionSchema.parse(JSON.parse(bytes.toString("utf8")))
    const implementations = await selectOptimizationImplementations({ skillDir: selectedDir, actions: submission.actions ?? [] })
    return {
      submission: { path: portable(relative), bytes: bytes.byteLength, sha256: sha256(bytes) },
      implementations,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { implementations: [] }
    throw error
  }
}

const DEPENDENCY_FILES = new Set([
  "requirements.txt", "pyproject.toml", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
])

/** Export the selected proposal snapshot as an independent generic skill package. */
export async function buildOptimizedSkillPackage(options: BuildOptimizedSkillPackageOptions): Promise<BuildOptimizedSkillPackageResult> {
  const proposalDir = path.resolve(options.proposalDir)
  const packageDir = path.resolve(options.packageDir)
  if (isWithin(proposalDir, packageDir) || isWithin(packageDir, proposalDir)) {
    throw new Error("Proposal and package directories must not overlap")
  }
  const metaBytes = await readFile(path.join(proposalDir, "meta.json"))
  const meta = ProposalMetaSchema.parse(JSON.parse(metaBytes.toString("utf8")))
  if (meta.status === "infra-blocked") throw new Error("Infra-blocked proposals cannot be exported as optimized packages")
  const originalDir = path.join(proposalDir, "original")
  const selectedDir = path.join(proposalDir, `round-${meta.bestRound}`)
  const [original, selected] = await Promise.all([listSourceFiles(originalDir), listSourceFiles(selectedDir)])
  if (!selected.some((file) => file.path === "SKILL.md")) throw new Error("Selected proposal snapshot has no SKILL.md")
  if (selected.some((file) => file.path === OPTIMIZED_SKILL_PACKAGE_MANIFEST)) {
    throw new Error(`Selected snapshot already contains reserved package metadata: ${OPTIMIZED_SKILL_PACKAGE_MANIFEST}`)
  }
  const actualDiff = computeDiff(original, selected)
  if (!hasChanges(actualDiff)) return { status: "no-change", sourceProposalDir: proposalDir, validation: "not-run" }
  const selectedImplementations = await readImplementations(proposalDir, meta.bestRound, selectedDir)
  await prepareOutput(packageDir)
  for (const file of selected) {
    const target = resolveContained(packageDir, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(file.absolute, target)
  }
  const files = selected.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
  const runtimes = [...new Set(selectedImplementations.implementations
    .filter((item) => item.status === "selected" && item.runtime)
    .map((item) => item.runtime!))].sort()
  const dependencyFiles = files.map((file) => file.path)
    .filter((name) => DEPENDENCY_FILES.has(path.posix.basename(name))).sort()
  const manifest = OptimizedSkillPackageManifestSchema.parse({
    schemaVersion: OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION,
    identity: `${meta.skillName}:${path.basename(proposalDir)}:round-${meta.bestRound}`,
    exposure: "development",
    proposal: {
      dirName: path.basename(proposalDir),
      bestRound: meta.bestRound,
      meta: { path: "meta.json", bytes: metaBytes.byteLength, sha256: sha256(metaBytes) },
      ...(selectedImplementations.submission ? { submission: selectedImplementations.submission } : {}),
    },
    snapshots: { originalClosureSha256: closureSha256(original), selectedClosureSha256: closureSha256(selected) },
    actualDiff,
    files,
    implementations: selectedImplementations.implementations,
    runtime: { runtimes, dependencyFiles },
    validation: { status: "passed", scope: "package-file-closure", behaviorStatus: "not-run" },
    claimBoundary: "Development package export. Actual snapshot differences and file closure passed; task quality, agent consumption and optimization effect require separate evidence.",
  })
  await Bun.write(path.join(packageDir, OPTIMIZED_SKILL_PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  await verifyOptimizedSkillPackage(packageDir)
  return { status: "exported", packageDir, sourceProposalDir: proposalDir, validation: "passed" }
}

/** Recompute every packaged source-file digest and reject missing or extra files. */
export async function verifyOptimizedSkillPackage(packageDir: string): Promise<VerifiedOptimizedSkillPackage> {
  const root = path.resolve(packageDir)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Optimized skill package must be a non-symlink directory")
  const manifest = OptimizedSkillPackageManifestSchema.parse(
    JSON.parse(await readFile(path.join(root, OPTIMIZED_SKILL_PACKAGE_MANIFEST), "utf8")),
  )
  const actual = await listSourceFiles(root)
  const sourceFiles = actual.filter((file) => file.path !== OPTIMIZED_SKILL_PACKAGE_MANIFEST)
  const expectedPaths = manifest.files.map((file) => file.path).sort()
  const actualPaths = sourceFiles.map((file) => file.path).sort()
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`Package file closure mismatch: expected ${JSON.stringify(expectedPaths)}, received ${JSON.stringify(actualPaths)}`)
  }
  const actualByPath = new Map(sourceFiles.map((file) => [file.path, file]))
  for (const expected of manifest.files) {
    const found = actualByPath.get(expected.path)
    if (!found || found.bytes !== expected.bytes || found.sha256 !== expected.sha256) {
      throw new Error(`Package file digest mismatch: ${expected.path}`)
    }
  }
  if (!actualByPath.has("SKILL.md")) throw new Error("Optimized skill package has no SKILL.md")
  return { packageDir: root, manifest }
}
