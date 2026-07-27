import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    return false
  }
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

export const WorkdirManifestEntrySchema = z.discriminatedUnion("type", [
  z.object({ path: SafeRelativePathSchema, type: z.literal("directory") }).strict(),
  z.object({ path: SafeRelativePathSchema, type: z.literal("file"), sha256: Sha256Schema }).strict(),
])

export type WorkdirManifestEntry = z.infer<typeof WorkdirManifestEntrySchema>

export const InitialWorkdirManifestSchema = z.object({
  schemaVersion: z.literal("skvm-initial-workdir-manifest/v1"),
  entries: z.array(WorkdirManifestEntrySchema),
}).strict().superRefine((value, context) => {
  const paths = value.entries.map((entry) => entry.path)
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", message: "manifest paths must be unique" })
  }
  const sorted = [...paths].sort((left, right) => left.localeCompare(right, "en"))
  if (paths.some((entry, index) => entry !== sorted[index])) {
    context.addIssue({ code: "custom", message: "manifest entries must be sorted" })
  }
})

export type InitialWorkdirManifest = z.infer<typeof InitialWorkdirManifestSchema>

export const InitialWorkdirManifestReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict()

export type InitialWorkdirManifestReference = z.infer<typeof InitialWorkdirManifestReferenceSchema>

export type WorkdirDeltaViolationCode =
  | "INITIAL_ENTRY_MISSING"
  | "INITIAL_ENTRY_TYPE_CHANGED"
  | "INITIAL_FILE_MODIFIED"
  | "REQUIRED_OUTPUT_MISSING"
  | "UNEXPECTED_ENTRY"

export type WorkdirDeltaViolation = {
  code: WorkdirDeltaViolationCode
  path: string
}

export class UnsafeWorkdirEntryError extends Error {}

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

function comparePaths(left: WorkdirManifestEntry, right: WorkdirManifestEntry): number {
  return left.path.localeCompare(right.path, "en")
}

export async function snapshotWorkdir(workDir: string): Promise<WorkdirManifestEntry[]> {
  const root = await realpath(path.resolve(workDir))
  if (!(await lstat(root)).isDirectory()) throw new Error("workdir must be a directory")
  const entries: WorkdirManifestEntry[] = []

  const visit = async (directory: string, prefix: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name, "en"))
    for (const child of children) {
      const absolute = path.join(directory, child.name)
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name
      if (!isContained(root, absolute)) throw new UnsafeWorkdirEntryError(`unsafe workdir entry: ${relativePath}`)
      const stat = await lstat(absolute)
      if (stat.isSymbolicLink()) throw new UnsafeWorkdirEntryError(`unsafe workdir entry: ${relativePath}`)
      if (stat.isDirectory()) {
        entries.push({ path: relativePath, type: "directory" })
        await visit(absolute, relativePath)
      } else if (stat.isFile()) {
        entries.push({ path: relativePath, type: "file", sha256: sha256(await readFile(absolute)) })
      } else {
        throw new UnsafeWorkdirEntryError(`unsafe workdir entry: ${relativePath}`)
      }
    }
  }

  await visit(root, "")
  return entries.sort(comparePaths)
}

async function assertExternalManifestPath(workDir: string, manifestPath: string): Promise<string> {
  const root = await realpath(path.resolve(workDir))
  const resolvedPath = path.resolve(manifestPath)
  await mkdir(path.dirname(resolvedPath), { recursive: true })
  const resolvedParent = await realpath(path.dirname(resolvedPath))
  const candidate = path.join(resolvedParent, path.basename(resolvedPath))
  if (isContained(root, candidate)) throw new Error("initial workdir manifest must be outside workdir")
  return candidate
}

export async function writeInitialWorkdirManifest(input: {
  workDir: string
  manifestPath: string
}): Promise<InitialWorkdirManifestReference> {
  const manifestPath = await assertExternalManifestPath(input.workDir, input.manifestPath)
  const manifest = InitialWorkdirManifestSchema.parse({
    schemaVersion: "skvm-initial-workdir-manifest/v1",
    entries: await snapshotWorkdir(input.workDir),
  })
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await writeFile(manifestPath, bytes)
  return { path: manifestPath, sha256: sha256(bytes) }
}

export async function readInitialWorkdirManifest(input: {
  workDir: string
  reference: InitialWorkdirManifestReference
}): Promise<InitialWorkdirManifest> {
  const reference = InitialWorkdirManifestReferenceSchema.parse(input.reference)
  const manifestPath = await assertExternalManifestPath(input.workDir, reference.path)
  const stat = await lstat(manifestPath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("initial workdir manifest must be a regular file")
  const bytes = await readFile(manifestPath)
  if (sha256(bytes) !== reference.sha256) throw new Error("initial workdir manifest digest mismatch")
  return InitialWorkdirManifestSchema.parse(JSON.parse(bytes.toString("utf8")))
}

export async function assessWorkdirDelta(input: {
  workDir: string
  initialManifest: InitialWorkdirManifest
  allowedNewDirectories: string[]
  requiredNewFiles: string[]
}): Promise<{ status: "pass" | "fail"; violations: WorkdirDeltaViolation[] }> {
  const initial = InitialWorkdirManifestSchema.parse(input.initialManifest)
  const current = await snapshotWorkdir(input.workDir)
  const initialByPath = new Map(initial.entries.map((entry) => [entry.path, entry]))
  const currentByPath = new Map(current.map((entry) => [entry.path, entry]))
  const allowedDirectories = new Set(input.allowedNewDirectories.map((entry) => SafeRelativePathSchema.parse(entry)))
  const requiredFiles = new Set(input.requiredNewFiles.map((entry) => SafeRelativePathSchema.parse(entry)))
  const violations: WorkdirDeltaViolation[] = []

  for (const [entryPath, entry] of initialByPath) {
    const finalEntry = currentByPath.get(entryPath)
    if (!finalEntry) {
      violations.push({ code: "INITIAL_ENTRY_MISSING", path: entryPath })
    } else if (finalEntry.type !== entry.type) {
      violations.push({ code: "INITIAL_ENTRY_TYPE_CHANGED", path: entryPath })
    } else if (entry.type === "file" && finalEntry.type === "file" && entry.sha256 !== finalEntry.sha256) {
      violations.push({ code: "INITIAL_FILE_MODIFIED", path: entryPath })
    }
  }

  for (const [entryPath, entry] of currentByPath) {
    if (initialByPath.has(entryPath)) continue
    const allowed = entry.type === "directory"
      ? allowedDirectories.has(entryPath)
      : requiredFiles.has(entryPath)
    if (!allowed) violations.push({ code: "UNEXPECTED_ENTRY", path: entryPath })
  }

  for (const requiredPath of requiredFiles) {
    const entry = currentByPath.get(requiredPath)
    if (!entry || entry.type !== "file" || initialByPath.has(requiredPath)) {
      violations.push({ code: "REQUIRED_OUTPUT_MISSING", path: requiredPath })
    }
  }

  violations.sort((left, right) => left.path.localeCompare(right.path, "en") || left.code.localeCompare(right.code, "en"))
  return { status: violations.length === 0 ? "pass" : "fail", violations }
}
