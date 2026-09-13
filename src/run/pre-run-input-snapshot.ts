import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const CapturedInputEntrySchema = z.object({
  path: SafeRelativePathSchema,
  type: z.literal("file"),
  status: z.literal("captured"),
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
  contentPath: SafeRelativePathSchema,
  mediaType: z.enum(["text", "binary"]),
}).strict()

const OmittedInputEntrySchema = z.object({
  path: SafeRelativePathSchema,
  type: z.enum(["file", "symbolic-link", "other"]),
  status: z.literal("omitted"),
  reason: z.enum(["file-too-large", "total-cap-exceeded", "unreadable", "unsupported"]),
  bytes: z.number().int().nonnegative().optional(),
}).strict()

export const PreRunInputSnapshotEntrySchema = z.discriminatedUnion("status", [
  CapturedInputEntrySchema,
  OmittedInputEntrySchema,
])

export const PreRunInputSnapshotSchema = z.object({
  schemaVersion: z.literal("skvm-pre-run-input-snapshot/v1"),
  limits: z.object({
    maxFileBytes: z.number().int().positive(),
    maxTotalBytes: z.number().int().positive(),
  }).strict(),
  entries: z.array(PreRunInputSnapshotEntrySchema),
}).strict().superRefine((value, context) => {
  const paths = value.entries.map((entry) => entry.path)
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", message: "snapshot paths must be unique" })
  }
  const sorted = [...paths].sort((left, right) => left.localeCompare(right, "en"))
  if (paths.some((entry, index) => entry !== sorted[index])) {
    context.addIssue({ code: "custom", message: "snapshot entries must be sorted" })
  }
})

export type PreRunInputSnapshot = z.infer<typeof PreRunInputSnapshotSchema>
export type PreRunInputSnapshotReference = { path: string; sha256: string; bytes: number }

/** A captured file with its verified original bytes. */
export interface PreRunInputSnapshotFile {
  path: string
  sha256: string
  bytes: number
  contentPath: string
  mediaType: "text" | "binary"
  content: Uint8Array
}

/** A digest-checked snapshot manifest plus the captured file bytes it names. */
export interface PreRunInputSnapshotContents {
  snapshot: PreRunInputSnapshot
  files: PreRunInputSnapshotFile[]
}

const DEFAULT_MAX_FILE_BYTES = 64 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024

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

function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

async function resolveExternalManifest(workDir: string, manifestPath: string): Promise<{
  workRoot: string
  manifestPath: string
  snapshotRoot: string
}> {
  const workRoot = await realpath(path.resolve(workDir))
  const resolvedManifest = path.resolve(manifestPath)
  const snapshotRoot = path.dirname(resolvedManifest)
  await mkdir(snapshotRoot, { recursive: true })
  const realSnapshotRoot = await realpath(snapshotRoot)
  if (isContained(workRoot, realSnapshotRoot)) {
    throw new Error("pre-run input snapshot must be outside workdir")
  }
  if (await Bun.file(resolvedManifest).exists()) {
    throw new Error("pre-run input snapshot manifest already exists")
  }
  return { workRoot, manifestPath: resolvedManifest, snapshotRoot: realSnapshotRoot }
}

export async function writePreRunInputSnapshot(input: {
  workDir: string
  manifestPath: string
  excludedPrefixes?: string[]
  maxFileBytes?: number
  maxTotalBytes?: number
}): Promise<PreRunInputSnapshotReference> {
  const { workRoot, manifestPath, snapshotRoot } = await resolveExternalManifest(input.workDir, input.manifestPath)
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxTotalBytes = input.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) throw new Error("maxFileBytes must be a positive safe integer")
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes <= 0) throw new Error("maxTotalBytes must be a positive safe integer")
  const excludedPrefixes = (input.excludedPrefixes ?? []).map((entry) => SafeRelativePathSchema.parse(entry))
  const entries: PreRunInputSnapshot["entries"] = []
  let capturedBytes = 0

  const excluded = (relative: string): boolean => excludedPrefixes.some(
    (prefix) => relative === prefix || relative.startsWith(`${prefix}/`),
  )
  const visit = async (directory: string, prefix: string): Promise<void> => {
    let children
    try {
      children = await readdir(directory, { withFileTypes: true })
    } catch {
      if (prefix) entries.push({ path: prefix, type: "other", status: "omitted", reason: "unreadable" })
      return
    }
    children.sort((left, right) => left.name.localeCompare(right.name, "en"))
    for (const child of children) {
      const absolute = path.join(directory, child.name)
      const relative = prefix ? `${prefix}/${child.name}` : child.name
      if (excluded(relative)) continue
      if (!isContained(workRoot, absolute)) {
        entries.push({ path: relative, type: "other", status: "omitted", reason: "unsupported" })
        continue
      }
      let itemStat
      try {
        itemStat = await lstat(absolute)
      } catch {
        entries.push({ path: relative, type: "other", status: "omitted", reason: "unreadable" })
        continue
      }
      if (itemStat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symbolic-link", status: "omitted", reason: "unsupported" })
        continue
      }
      if (itemStat.isDirectory()) {
        await visit(absolute, relative)
        continue
      }
      if (!itemStat.isFile()) {
        entries.push({ path: relative, type: "other", status: "omitted", reason: "unsupported" })
        continue
      }
      if (itemStat.size > maxFileBytes) {
        entries.push({ path: relative, type: "file", status: "omitted", reason: "file-too-large", bytes: itemStat.size })
        continue
      }
      if (capturedBytes + itemStat.size > maxTotalBytes) {
        entries.push({ path: relative, type: "file", status: "omitted", reason: "total-cap-exceeded", bytes: itemStat.size })
        continue
      }
      let bytes: Uint8Array
      try {
        bytes = await readFile(absolute)
      } catch {
        entries.push({ path: relative, type: "file", status: "omitted", reason: "unreadable", bytes: itemStat.size })
        continue
      }
      if (capturedBytes + bytes.byteLength > maxTotalBytes) {
        entries.push({ path: relative, type: "file", status: "omitted", reason: "total-cap-exceeded", bytes: bytes.byteLength })
        continue
      }
      const contentPath = `files/${relative}`
      const destination = path.join(snapshotRoot, ...contentPath.split("/"))
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, bytes)
      capturedBytes += bytes.byteLength
      entries.push({
        path: relative,
        type: "file",
        status: "captured",
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        contentPath,
        mediaType: isText(bytes) ? "text" : "binary",
      })
    }
  }

  await visit(workRoot, "")
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"))
  const snapshot = PreRunInputSnapshotSchema.parse({
    schemaVersion: "skvm-pre-run-input-snapshot/v1",
    limits: { maxFileBytes, maxTotalBytes },
    entries,
  })
  const manifestBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
  const temporary = `${manifestPath}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, manifestBytes)
  await rename(temporary, manifestPath)
  return { path: manifestPath, sha256: sha256(manifestBytes), bytes: manifestBytes.byteLength }
}

export async function readPreRunInputSnapshot(reference: PreRunInputSnapshotReference): Promise<PreRunInputSnapshot> {
  const manifestPath = path.resolve(reference.path)
  const manifestBytes = await readFile(manifestPath)
  if (manifestBytes.byteLength !== reference.bytes || sha256(manifestBytes) !== reference.sha256) {
    throw new Error("pre-run input snapshot manifest binding mismatch")
  }
  const snapshot = PreRunInputSnapshotSchema.parse(JSON.parse(manifestBytes.toString("utf8")))
  const root = path.dirname(manifestPath)
  for (const entry of snapshot.entries) {
    if (entry.status !== "captured") continue
    const candidate = path.resolve(root, ...entry.contentPath.split("/"))
    if (!isContained(root, candidate)) throw new Error(`pre-run input content escapes snapshot root: ${entry.path}`)
    const bytes = await readFile(candidate)
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`pre-run input content binding mismatch: ${entry.path}`)
    }
  }
  return snapshot
}

/**
 * Read a pre-run snapshot and return only its captured files. The manifest and
 * every content file are verified by the same digest/containment checks as
 * {@link readPreRunInputSnapshot}; omitted entries remain represented in the
 * returned `snapshot` and are never converted into empty files.
 */
export async function readPreRunInputSnapshotContents(
  reference: PreRunInputSnapshotReference,
): Promise<PreRunInputSnapshotContents> {
  const snapshot = await readPreRunInputSnapshot(reference)
  const root = path.dirname(path.resolve(reference.path))
  const files: PreRunInputSnapshotFile[] = []
  for (const entry of snapshot.entries) {
    if (entry.status !== "captured") continue
    const candidate = path.resolve(root, ...entry.contentPath.split("/"))
    const content = new Uint8Array(await readFile(candidate))
    files.push({
      path: entry.path,
      sha256: entry.sha256,
      bytes: entry.bytes,
      contentPath: entry.contentPath,
      mediaType: entry.mediaType,
      content,
    })
  }
  return { snapshot, files }
}
