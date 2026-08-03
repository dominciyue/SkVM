import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { ResolvedSkill } from "../core/skill-loader.ts"

const SafePosixPath = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/")
  return !path.posix.isAbsolute(normalized)
    && normalized.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "resource path must be a safe relative POSIX path")

const SafeRewritePath = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/")
  const segments = normalized.split("/")
  return !path.posix.isAbsolute(normalized)
    && segments.every((segment, index) => segment.length > 0 || index === segments.length - 1)
    && segments.slice(0, -1).every((segment) => segment !== "." && segment !== "..")
}, "rewrite path must be a safe relative POSIX path")

const ResourceRecordSchema = z.object({
  sourcePath: SafePosixPath,
  targetPath: SafePosixPath,
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  size: z.number().int().nonnegative(),
}).strict()

const RewriteSchema = z.object({
  sourcePath: SafeRewritePath,
  targetPath: SafeRewritePath,
  occurrences: z.number().int().positive(),
}).strict()

export const NamespacedSkillResourcePackageSchema = z.object({
  schemaVersion: z.literal("skill-ir-namespaced-resource-package/v1"),
  status: z.enum(["ready", "blocked"]),
  skillId: z.string().min(1),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  closureDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  namespaceRoot: SafePosixPath,
  resources: z.array(ResourceRecordSchema),
  rewrites: z.array(RewriteSchema),
  unresolvedReferences: z.array(SafePosixPath),
  compiledSkillContent: z.string(),
}).strict()

export type NamespacedSkillResourcePackage = z.infer<typeof NamespacedSkillResourcePackageSchema>

export const NamespacedSkillResourceManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-namespaced-resource-manifest/v1"),
  skillId: z.string().min(1),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  closureDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  namespaceRoot: SafePosixPath,
  resources: z.array(ResourceRecordSchema),
}).strict()

export type NamespacedSkillResourceManifest = z.infer<typeof NamespacedSkillResourceManifestSchema>

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function safeSkillSlug(skillId: string): string {
  const slug = skillId.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "")
  return slug || "skill"
}

function safeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/")
  SafePosixPath.parse(normalized)
  return normalized
}

function pathCharacters(character: string | undefined): boolean {
  return character !== undefined && /[a-zA-Z0-9._/-]/u.test(character)
}

interface ReplacementCandidate {
  sourcePath: string
  targetPath: string
}

function occurrenceAt(text: string, candidate: ReplacementCandidate, start: number): boolean {
  if (!text.startsWith(candidate.sourcePath, start)) return false
  const before = text[start - 1]
  const end = start + candidate.sourcePath.length
  const after = text[end]
  if (pathCharacters(before)) return false
  if (candidate.sourcePath.endsWith("/")) return true
  return !pathCharacters(after)
}

function rewriteReferences(text: string, candidates: readonly ReplacementCandidate[]): {
  content: string
  rewrites: Array<{ sourcePath: string; targetPath: string; occurrences: number }>
} {
  const sortedCandidates = [...candidates].sort((left, right) => right.sourcePath.length - left.sourcePath.length)
  const replacements: Array<{ start: number; end: number; candidate: ReplacementCandidate }> = []
  for (let cursor = 0; cursor < text.length;) {
    let selected: { start: number; candidate: ReplacementCandidate } | undefined
    for (const candidate of sortedCandidates) {
      const start = text.indexOf(candidate.sourcePath, cursor)
      if (start < 0 || !occurrenceAt(text, candidate, start)) continue
      if (!selected || start < selected.start || (start === selected.start && candidate.sourcePath.length > selected.candidate.sourcePath.length)) {
        selected = { start, candidate }
      }
    }
    if (!selected) break
    const end = selected.start + selected.candidate.sourcePath.length
    replacements.push({ start: selected.start, end, candidate: selected.candidate })
    cursor = end
  }

  const counts = new Map<string, { targetPath: string; occurrences: number }>()
  let output = ""
  let cursor = 0
  for (const replacement of replacements) {
    output += text.slice(cursor, replacement.start)
    output += replacement.candidate.targetPath
    cursor = replacement.end
    const current = counts.get(replacement.candidate.sourcePath)
    counts.set(replacement.candidate.sourcePath, {
      targetPath: replacement.candidate.targetPath,
      occurrences: (current?.occurrences ?? 0) + 1,
    })
  }
  output += text.slice(cursor)
  return {
    content: output,
    rewrites: [...counts.entries()]
      .map(([sourcePath, value]) => ({ sourcePath, ...value }))
      .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en")),
  }
}

function sourcePathTokens(text: string): string[] {
  const values = new Set<string>()
  const pattern = /(?:[a-zA-Z0-9._-]+\/)?(?:scripts|references)\/[a-zA-Z0-9._/-]+/gu
  for (const match of text.matchAll(pattern)) {
    const value = (match[0] ?? "").replace(/[.,:;\])}]+$/gu, "")
    const before = text[match.index! - 1]
    if (before === ":" || before === "/") continue
    if (value) values.add(value)
  }
  return [...values].sort((left, right) => left.localeCompare(right, "en"))
}

function stripSkillPrefix(value: string, skillId: string): string {
  const normalized = value.replaceAll("\\", "/")
  return normalized.startsWith(`${skillId}/`) ? normalized.slice(skillId.length + 1) : normalized
}

function resourceAliases(input: {
  resourcePath: string
  skillId: string
  sourceContent: string
}): string[] {
  const aliases = new Set([input.resourcePath, `${input.skillId}/${input.resourcePath}`])
  for (const token of sourcePathTokens(input.sourceContent)) {
    if (token.endsWith(`/${input.resourcePath}`)) aliases.add(token)
  }
  return [...aliases]
}

function resourceDirectories(resources: readonly string[]): string[] {
  const directories = new Set<string>()
  for (const resource of resources) {
    const segments = resource.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(`${segments.slice(0, index).join("/")}/`)
    }
  }
  return [...directories]
}

export async function compileNamespacedSkillResources(
  skill: ResolvedSkill,
  options?: { packageId?: string },
): Promise<NamespacedSkillResourcePackage> {
  const packageId = options?.packageId ?? skill.skillId
  const sourceBytes = Buffer.from(skill.skillContent, "utf8")
  const sourceDigest = sha256(sourceBytes)
  const sourceResources = [] as Array<{ sourcePath: string; bytes: Buffer; sha256: string }>
  for (const rawPath of [...skill.bundleFiles].sort((left, right) => left.localeCompare(right, "en"))) {
    const sourcePath = safeRelativePath(rawPath)
    const absolute = path.join(skill.skillDir, ...sourcePath.split("/"))
    const stat = await lstat(absolute)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`skill resource must be a regular file: ${sourcePath}`)
    const bytes = await readFile(absolute)
    sourceResources.push({ sourcePath, bytes, sha256: sha256(bytes) })
  }

  const closureDigest = sha256(Buffer.from([
    sourceDigest,
    ...sourceResources.map((entry) => `${entry.sourcePath}:${entry.sha256}:${entry.bytes.byteLength}`),
  ].join("\n"), "utf8"))
  const namespaceRoot = `.skvm/skill-resources/${safeSkillSlug(packageId)}-${closureDigest.slice(0, 12)}`
  const resourcePaths = sourceResources.map((entry) => entry.sourcePath)
  const candidates = [
    ...sourceResources.flatMap((entry) => resourceAliases({
      resourcePath: entry.sourcePath,
      skillId: packageId,
      sourceContent: skill.skillContent,
    }).map((sourcePath) => ({ sourcePath, targetPath: `${namespaceRoot}/${entry.sourcePath}` }))),
    ...resourceDirectories(resourcePaths).flatMap((directory) => [
      { sourcePath: directory, targetPath: `${namespaceRoot}/${directory}` },
      { sourcePath: `${packageId}/${directory}`, targetPath: `${namespaceRoot}/${directory}` },
    ]),
  ]
  const rewritten = rewriteReferences(skill.skillContent, candidates)
  const knownPaths = new Set([
    ...resourcePaths,
    ...resourceDirectories(resourcePaths),
    ...sourceResources.flatMap((entry) => resourceAliases({
      resourcePath: entry.sourcePath,
      skillId: packageId,
      sourceContent: skill.skillContent,
    })),
  ].map((entry) => entry.replace(/\/$/u, "")))
  const unresolvedReferences = sourcePathTokens(skill.skillContent)
    .map((value) => stripSkillPrefix(value, packageId))
    .filter((value) => !knownPaths.has(value) && !knownPaths.has(value.split("/").slice(1).join("/")))
  const uniqueUnresolved = [...new Set(unresolvedReferences)]
  const resources = sourceResources.map((entry) => ({
    sourcePath: entry.sourcePath,
    targetPath: `${namespaceRoot}/${entry.sourcePath}`,
    sha256: entry.sha256,
    size: entry.bytes.byteLength,
  }))
  return NamespacedSkillResourcePackageSchema.parse({
    schemaVersion: "skill-ir-namespaced-resource-package/v1",
    status: uniqueUnresolved.length > 0 ? "blocked" : "ready",
    skillId: packageId,
    sourceDigest,
    closureDigest,
    namespaceRoot,
    resources,
    rewrites: rewritten.rewrites,
    unresolvedReferences: uniqueUnresolved,
    compiledSkillContent: rewritten.content,
  })
}

async function safeMaterializationRoot(workDir: string): Promise<string> {
  await mkdir(path.resolve(workDir), { recursive: true })
  return await realpath(path.resolve(workDir))
}

function absoluteResourcePath(workDir: string, relativePath: string): string {
  return path.join(workDir, ...relativePath.split("/"))
}

export async function materializeNamespacedSkillResources(input: {
  package: NamespacedSkillResourcePackage
  skill: ResolvedSkill
  workDir: string
}): Promise<NamespacedSkillResourceManifest> {
  const packageCandidate = NamespacedSkillResourcePackageSchema.parse(input.package)
  if (packageCandidate.status !== "ready") {
    throw new Error(`cannot materialize blocked namespaced skill resource package: ${packageCandidate.unresolvedReferences.join(", ")}`)
  }
  const root = await safeMaterializationRoot(input.workDir)
  const namespaceDir = absoluteResourcePath(root, packageCandidate.namespaceRoot)
  await mkdir(namespaceDir, { recursive: true })
  for (const resource of packageCandidate.resources) {
    const source = path.join(input.skill.skillDir, ...resource.sourcePath.split("/"))
    const target = absoluteResourcePath(root, resource.targetPath)
    const sourceStat = await lstat(source)
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`unsafe source resource: ${resource.sourcePath}`)
    const bytes = await readFile(source)
    if (sha256(bytes) !== resource.sha256) throw new Error(`source resource digest mismatch: ${resource.sourcePath}`)
    await mkdir(path.dirname(target), { recursive: true })
    try {
      const targetStat = await lstat(target)
      if (targetStat.isSymbolicLink()) throw new Error(`namespaced resource symlink: ${resource.targetPath}`)
      if (!targetStat.isFile() || sha256(await readFile(target)) !== resource.sha256) {
        throw new Error(`namespaced resource collision: ${resource.targetPath}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      // Do not rely on platform-specific read-only permission bits. Integrity
      // verification below is the portable enforcement boundary.
      await writeFile(target, bytes)
    }
  }

  const manifest = NamespacedSkillResourceManifestSchema.parse({
    schemaVersion: "skill-ir-namespaced-resource-manifest/v1",
    skillId: packageCandidate.skillId,
    sourceDigest: packageCandidate.sourceDigest,
    closureDigest: packageCandidate.closureDigest,
    namespaceRoot: packageCandidate.namespaceRoot,
    resources: packageCandidate.resources,
  })
  const manifestPath = absoluteResourcePath(root, ".skvm/skill-resource-manifest.json")
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return manifest
}

export async function verifyNamespacedSkillResources(input: {
  workDir: string
  manifest: NamespacedSkillResourceManifest
}): Promise<void> {
  const manifest = NamespacedSkillResourceManifestSchema.parse(input.manifest)
  const root = await safeMaterializationRoot(input.workDir)
  const manifestPath = absoluteResourcePath(root, ".skvm/skill-resource-manifest.json")
  const manifestStat = await lstat(manifestPath)
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("namespaced resource manifest symlink")
  const storedManifest = NamespacedSkillResourceManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")))
  if (JSON.stringify(storedManifest) !== JSON.stringify(manifest)) throw new Error("namespaced resource manifest mismatch")
  for (const resource of manifest.resources) {
    const target = absoluteResourcePath(root, resource.targetPath)
    const stat = await lstat(target)
    if (stat.isSymbolicLink()) throw new Error(`namespaced resource symlink: ${resource.targetPath}`)
    if (!stat.isFile()) throw new Error(`namespaced resource missing: ${resource.targetPath}`)
    if (sha256(await readFile(target)) !== resource.sha256) throw new Error(`resource digest mismatch: ${resource.targetPath}`)
  }
}
