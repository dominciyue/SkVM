/**
 * Workspace helpers for the optimizer:
 *  - copy skill folder to a temp workspace
 *  - serialize evidence + history into .optimize/ as both JSON and markdown
 *  - compute the diff between workspace and original skill folder
 */

import path from "node:path"
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { copySkillDir } from "../core/fs-utils.ts"
import { getTmpDir } from "../core/config.ts"
import { readPreRunInputSnapshotContents } from "../run/pre-run-input-snapshot.ts"
import { scoreFromCriteria } from "./evidence.ts"
import type { Evidence, EvidenceCriterion, EvidenceInputResources, HistoryEntry } from "./types.ts"

/**
 * Per-task status thresholds. A task mean at or above `PASSING` is
 * considered safe (the No-trade-off rule's "don't make these worse"
 * set); below `FAILING` is where the optimizer should focus. Anything
 * in between is MARGINAL — fixable but riskier. Defined once so the
 * README explanation, the summary table, and the bucketing logic
 * can't drift from each other.
 */
const STATUS_THRESHOLD_PASSING = 0.9
const STATUS_THRESHOLD_FAILING = 0.5

/**
 * Turn a task id into a filesystem-safe directory name. Task ids in
 * practice are already simple slugs (`pdf-extract`, `chart-generator`)
 * but the log source derives them from file paths, so we defensively
 * reduce anything non-alphanumeric/.-_ to `-` and collapse repeats.
 *
 * Critical constraints enforced here:
 *  - Never return `.`, `..`, or any sequence of pure dots. `path.join(root,
 *    "..")` resolves outside `root` and would clobber the workspace; a bare
 *    `.` collapses the parent segment and confuses layout. The log source
 *    can realistically produce these ids (e.g. a file named `...jsonl`
 *    whose extension-stripped basename is `..`).
 *  - Never return empty. Empty path segments silently drop a directory
 *    level on most platforms.
 *
 * `safeModelName` in core/config.ts only handles `/` and `:` — the
 * semantics are wrong for task ids and its slash replacement (`--`)
 * looks like a CLI flag prefix, which is confusing in directory names.
 */
function safeTaskSlug(taskId: string): string {
  const replaced = taskId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-")
  const trimmed = replaced.replace(/^-+|-+$/g, "")
  if (trimmed.length === 0) return "unnamed-task"
  // Reject pure-dot slugs (`.`, `..`, `...`, etc.). A slug must contain at
  // least one non-dot character to be a distinct directory name.
  if (/^\.+$/.test(trimmed)) return "unnamed-task"
  return trimmed
}

// ---------------------------------------------------------------------------
// Walk helper (for diffing)
// ---------------------------------------------------------------------------

const BUNDLE_EXCLUDED = new Set(["LICENSE.txt", "_meta.json"])
const DIFF_TRANSIENT_DIRECTORIES = new Set([
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "node_modules",
])

/**
 * Walk a directory recursively and yield (relativePath, absolutePath) for every
 * file. Skips hidden files and the .optimize/ scratch directory.
 */
async function* walkFiles(root: string, base: string = root): AsyncGenerator<{ rel: string; abs: string }> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await readdir(base, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (BUNDLE_EXCLUDED.has(entry.name)) continue
    if (entry.isDirectory() && DIFF_TRANSIENT_DIRECTORIES.has(entry.name)) continue
    if (entry.isFile() && (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo"))) continue
    const full = path.join(base, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(root, full)
    } else if (entry.isFile()) {
      yield { rel: path.relative(root, full).split(path.sep).join("/"), abs: full }
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace creation
// ---------------------------------------------------------------------------

export interface Workspace {
  dir: string
  optimizeDir: string
  submissionPath: string
}

export async function createWorkspace(skillDir: string): Promise<Workspace> {
  const dir = await mkdtemp(path.join(getTmpDir(), "jit-optimize-"))
  await copySkillDir(skillDir, dir)
  const optimizeDir = path.join(dir, ".optimize")
  await mkdir(optimizeDir, { recursive: true })
  return {
    dir,
    optimizeDir,
    submissionPath: path.join(optimizeDir, "submission.json"),
  }
}

// ---------------------------------------------------------------------------
// Evidence / history serialization
// ---------------------------------------------------------------------------

export interface SerializeOptions {
  maxConvLogEntries?: number
  maxFileInlineChars?: number
  /** Explicit skill root copied into the optimizer workspace. */
  skillDir?: string
}

const DEFAULT_MAX_CONV_LOG = 400
const DEFAULT_MAX_FILE_INLINE = 4000

/**
 * Render-time caps for the optimizer's `.optimize/tasks/*\/run-*-workdir/`
 * projection. These bound what the OPTIMIZER MODEL sees, independent of how
 * much the durable record actually holds — the snapshot may be larger if a
 * caller raised the capture cap (see `SNAPSHOT_CAPTURE_DEFAULTS` in
 * evidence.ts). Historically a single 512KB/64KB pair did both jobs; the two
 * are now separated so durable fidelity can scale without bloating context.
 */
const RENDER_WORKDIR_MAX_TOTAL = 512 * 1024
const RENDER_WORKDIR_MAX_FILE = 64 * 1024

/**
 * Original task fixtures are evidence inputs, not optimizer output. Keep their
 * projection deliberately smaller than a general task workspace and fail the
 * whole projection closed rather than silently presenting an incomplete input
 * bundle as complete.
 */
const RENDER_TASK_FIXTURE_MAX_FILES = 64
const RENDER_TASK_FIXTURE_MAX_TOTAL = 512 * 1024
const RENDER_TASK_FIXTURE_MAX_FILE = 64 * 1024

interface MaterializedTaskFixture {
  path: string
  bytes: number
  sha256: string
  source: "inline" | "fixtures-directory"
  content: Uint8Array
}

interface TaskFixtureDiagnostic {
  code: string
  message: string
}

interface TaskFixtureProjection {
  schemaVersion: "jit-optimize-task-fixtures/v1"
  status: "materialized" | "empty" | "unresolved"
  taskSha256: string | null
  files: Array<Omit<MaterializedTaskFixture, "content">>
  diagnostic?: TaskFixtureDiagnostic
  limits: {
    maxFiles: number
    maxFileBytes: number
    maxTotalBytes: number
  }
}

interface PreRunInputProjectionFile {
  path: string
  bytes: number
  sha256: string
  mediaType: "text" | "binary"
}

interface PreRunInputProjection {
  schemaVersion: "jit-optimize-pre-run-inputs/v1"
  status: "materialized" | "empty" | "partial" | "unavailable" | "unresolved"
  reference: { path: string; sha256: string; bytes: number } | null
  files: PreRunInputProjectionFile[]
  omissions: Array<{
    path: string
    type: "file" | "symbolic-link" | "other"
    reason: "file-too-large" | "total-cap-exceeded" | "unreadable" | "unsupported"
    bytes?: number
  }>
  limits?: { maxFileBytes: number; maxTotalBytes: number }
  diagnostic?: { code: string; message: string }
}

interface ImplementationFormatObservation {
  kind: "json" | "csv" | "yaml" | "text" | "binary-or-unknown"
  rootType?: "object" | "array" | "string" | "number" | "boolean" | "null"
  topLevelKeys?: string[]
  columns?: string[]
  valid?: boolean
}

interface ImplementationContextFile {
  path: string
  locator: string
  bytes: number
  sha256: string
  format: ImplementationFormatObservation
}

/**
 * Grouped view of a single evidence for layout purposes. `globalIndex` is the
 * stable 0..N-1 integer the optimizer still uses in `blockedEvidenceIds` —
 * kept as the canonical audit reference even though the files themselves live
 * under `tasks/{safeTaskId}/run-{localIndex}.md` now. `infraTainted` /
 * `score` are cached at grouping time so the render helpers don't
 * re-scan criteria for each run.
 */
interface TaskGroupRun {
  globalIndex: number
  localIndex: number
  evidence: Evidence
  infraTainted: boolean
  score: number | null
}

type TaskStatus = "FAILING" | "MARGINAL" | "PASSING" | "UNASSESSED" | "TAINTED"

interface TaskGroup {
  taskId: string
  safeId: string
  runs: TaskGroupRun[]
  mean: number | null
  status: TaskStatus
  worstCriterion: string | null
}

function sha256Bytes(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function fixtureLimits(): TaskFixtureProjection["limits"] {
  return {
    maxFiles: RENDER_TASK_FIXTURE_MAX_FILES,
    maxFileBytes: RENDER_TASK_FIXTURE_MAX_FILE,
    maxTotalBytes: RENDER_TASK_FIXTURE_MAX_TOTAL,
  }
}

function unresolvedTaskFixtures(
  taskSha256: string | null,
  code: string,
  message: string,
): TaskFixtureProjection {
  return {
    schemaVersion: "jit-optimize-task-fixtures/v1",
    status: "unresolved",
    taskSha256,
    files: [],
    diagnostic: { code, message },
    limits: fixtureLimits(),
  }
}

/**
 * Normalize to a portable relative path before joining it to a workspace.
 * Task files are external evidence and must never be allowed to address a
 * parent directory. Reject Windows-illegal names as well so an archive made on
 * POSIX cannot become a different or partial projection on Windows.
 */
function normalizeTaskFixturePath(raw: string): string | TaskFixtureDiagnostic {
  if (raw.length === 0 || raw.includes("\0")) {
    return { code: "unsafe-fixture-path", message: `Unsafe empty or NUL-containing fixture path: ${JSON.stringify(raw)}` }
  }
  if (path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    return { code: "unsafe-fixture-path", message: `Absolute fixture path is not allowed: ${raw}` }
  }
  const portable = raw.replaceAll("\\", "/")
  const segments = portable.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return { code: "unsafe-fixture-path", message: `Dot, empty, or parent path segment is not allowed: ${raw}` }
  }
  if (segments.some((segment) => /[<>:"|?*]/u.test(segment))) {
    return { code: "unsafe-fixture-path", message: `Non-portable fixture path is not allowed: ${raw}` }
  }
  if (segments.some((segment) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) {
    return { code: "unsafe-fixture-path", message: `Reserved fixture path is not allowed: ${raw}` }
  }
  return segments.join("/")
}

async function readFixtureDirectory(
  root: string,
  current: string = root,
): Promise<{ files: Array<{ path: string; content: Uint8Array }>; diagnostic?: TaskFixtureDiagnostic }> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && current === root) return { files: [] }
    return {
      files: [],
      diagnostic: {
        code: "fixture-directory-unreadable",
        message: `Could not read task fixtures directory ${current}: ${String(error)}`,
      },
    }
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
  const files: Array<{ path: string; content: Uint8Array }> = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isSymbolicLink()) {
      return {
        files: [],
        diagnostic: {
          code: "fixture-symlink-unsupported",
          message: `Symbolic links are not projected from task fixtures: ${path.relative(root, absolute)}`,
        },
      }
    }
    if (entry.isDirectory()) {
      const nested = await readFixtureDirectory(root, absolute)
      if (nested.diagnostic) return nested
      files.push(...nested.files)
      continue
    }
    if (!entry.isFile()) {
      return {
        files: [],
        diagnostic: {
          code: "fixture-entry-unsupported",
          message: `Only regular files are projected from task fixtures: ${path.relative(root, absolute)}`,
        },
      }
    }
    files.push({
      path: path.relative(root, absolute).split(path.sep).join("/"),
      content: new Uint8Array(await readFile(absolute)),
    })
  }
  return { files }
}

async function collectTaskFixtures(taskPath: string): Promise<{
  projection: TaskFixtureProjection
  files: MaterializedTaskFixture[]
}> {
  let taskBytes: Uint8Array
  try {
    taskBytes = new Uint8Array(await readFile(taskPath))
  } catch (error) {
    return {
      projection: unresolvedTaskFixtures(null, "task-file-unreadable", `Could not read bound task file ${taskPath}: ${String(error)}`),
      files: [],
    }
  }
  const taskSha256 = sha256Bytes(taskBytes)

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(taskBytes))
  } catch (error) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "task-file-invalid", `Bound task file is not valid UTF-8 JSON: ${String(error)}`),
      files: [],
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "task-file-invalid", "Bound task file must contain a JSON object."),
      files: [],
    }
  }

  const rawFixtures = (parsed as Record<string, unknown>).fixtures
  if (rawFixtures !== undefined && (typeof rawFixtures !== "object" || rawFixtures === null || Array.isArray(rawFixtures))) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "task-fixtures-invalid", "The task fixtures field must be an object of string values."),
      files: [],
    }
  }

  const candidates: Array<{ path: string; content: Uint8Array; source: MaterializedTaskFixture["source"] }> = []
  for (const [rawPath, value] of Object.entries((rawFixtures ?? {}) as Record<string, unknown>)) {
    if (typeof value !== "string") {
      return {
        projection: unresolvedTaskFixtures(taskSha256, "task-fixtures-invalid", `Task fixture ${rawPath} is not a string.`),
        files: [],
      }
    }
    candidates.push({ path: rawPath, content: new TextEncoder().encode(value), source: "inline" })
  }

  const directory = await readFixtureDirectory(path.join(path.dirname(taskPath), "fixtures"))
  if (directory.diagnostic) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, directory.diagnostic.code, directory.diagnostic.message),
      files: [],
    }
  }
  for (const file of directory.files) {
    candidates.push({ ...file, source: "fixtures-directory" })
  }

  // Match the runner's precedence: sibling fixtures/ files overwrite inline
  // fixtures at the same exact path. Case-only or normalization collisions are
  // rejected because they are not portable across supported hosts.
  const byPortablePath = new Map<string, MaterializedTaskFixture>()
  const spellingByFoldedPath = new Map<string, string>()
  for (const candidate of candidates) {
    const normalized = normalizeTaskFixturePath(candidate.path)
    if (typeof normalized !== "string") {
      return {
        projection: unresolvedTaskFixtures(taskSha256, normalized.code, normalized.message),
        files: [],
      }
    }
    const folded = normalized.toLocaleLowerCase("en-US")
    const priorSpelling = spellingByFoldedPath.get(folded)
    if (priorSpelling && priorSpelling !== normalized) {
      return {
        projection: unresolvedTaskFixtures(
          taskSha256,
          "fixture-path-collision",
          `Fixture paths differ only by case or normalization: ${priorSpelling} and ${normalized}`,
        ),
        files: [],
      }
    }
    spellingByFoldedPath.set(folded, normalized)
    byPortablePath.set(normalized, {
      path: normalized,
      bytes: candidate.content.byteLength,
      sha256: sha256Bytes(candidate.content),
      source: candidate.source,
      content: candidate.content,
    })
  }

  const files = [...byPortablePath.values()].sort((left, right) => left.path.localeCompare(right.path, "en"))
  if (files.length > RENDER_TASK_FIXTURE_MAX_FILES) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "fixture-count-limit", `Task has ${files.length} fixture files; limit is ${RENDER_TASK_FIXTURE_MAX_FILES}.`),
      files: [],
    }
  }
  const oversized = files.find((file) => file.bytes > RENDER_TASK_FIXTURE_MAX_FILE)
  if (oversized) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "fixture-file-size-limit", `Task fixture ${oversized.path} is ${oversized.bytes} bytes; limit is ${RENDER_TASK_FIXTURE_MAX_FILE}.`),
      files: [],
    }
  }
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0)
  if (totalBytes > RENDER_TASK_FIXTURE_MAX_TOTAL) {
    return {
      projection: unresolvedTaskFixtures(taskSha256, "fixture-total-size-limit", `Task fixtures total ${totalBytes} bytes; limit is ${RENDER_TASK_FIXTURE_MAX_TOTAL}.`),
      files: [],
    }
  }

  return {
    projection: {
      schemaVersion: "jit-optimize-task-fixtures/v1",
      status: files.length > 0 ? "materialized" : "empty",
      taskSha256,
      files: files.map(({ content: _content, ...file }) => file),
      limits: fixtureLimits(),
    },
    files,
  }
}

async function materializeTaskFixtures(taskDir: string, localIndex: number, taskPath: string): Promise<void> {
  const { projection, files } = await collectTaskFixtures(taskPath)
  const fixtureDir = path.join(taskDir, `run-${localIndex}-task-fixtures`)
  if (projection.status === "materialized") {
    try {
      for (const file of files) {
        const destination = path.join(fixtureDir, ...file.path.split("/"))
        await mkdir(path.dirname(destination), { recursive: true })
        await Bun.write(destination, file.content)
      }
    } catch (error) {
      await rm(fixtureDir, { recursive: true, force: true })
      const failed = unresolvedTaskFixtures(
        projection.taskSha256,
        "fixture-projection-write-failed",
        `Could not write the complete task fixture projection: ${String(error)}`,
      )
      await Bun.write(
        path.join(taskDir, `run-${localIndex}-task-fixtures-manifest.json`),
        JSON.stringify(failed, null, 2),
      )
      return
    }
  }
  await Bun.write(
    path.join(taskDir, `run-${localIndex}-task-fixtures-manifest.json`),
    JSON.stringify(projection, null, 2),
  )
}

async function materializePreRunInputs(
  taskDir: string,
  localIndex: number,
  resource: EvidenceInputResources["preRun"] | undefined,
): Promise<PreRunInputProjection> {
  const inputDir = path.join(taskDir, `run-${localIndex}-pre-run-inputs`)
  const manifestPath = path.join(taskDir, `run-${localIndex}-pre-run-inputs-manifest.json`)
  const reference = resource?.reference ?? null
  let projection: PreRunInputProjection
  if (!resource) {
    projection = {
      schemaVersion: "jit-optimize-pre-run-inputs/v1",
      status: "unavailable",
      reference,
      files: [],
      omissions: [],
    }
  } else {
    try {
      const loaded = await readPreRunInputSnapshotContents(resource.reference)
      const omissions = loaded.snapshot.entries
        .filter((entry) => entry.status === "omitted")
        .map((entry) => ({
          path: entry.path,
          type: entry.type,
          reason: entry.reason,
          ...(entry.bytes === undefined ? {} : { bytes: entry.bytes }),
        }))
      const files = loaded.files.map(({ content: _content, ...file }) => file)
      const status: PreRunInputProjection["status"] = files.length === 0
        ? omissions.length === 0 ? "empty" : "unresolved"
        : omissions.length > 0 ? "partial" : "materialized"
      try {
        await rm(inputDir, { recursive: true, force: true })
        for (const file of loaded.files) {
          const destination = path.join(inputDir, ...file.path.split("/"))
          await mkdir(path.dirname(destination), { recursive: true })
          await Bun.write(destination, file.content)
        }
      } catch (error) {
        await rm(inputDir, { recursive: true, force: true })
        projection = {
          schemaVersion: "jit-optimize-pre-run-inputs/v1",
          status: "unresolved",
          reference,
          files: [],
          omissions,
          limits: loaded.snapshot.limits,
          diagnostic: {
            code: "pre-run-input-projection-write-failed",
            message: `Could not write the complete pre-run input projection: ${String(error)}`,
          },
        }
        await Bun.write(manifestPath, JSON.stringify(projection, null, 2))
        return projection
      }
      projection = {
        schemaVersion: "jit-optimize-pre-run-inputs/v1",
        status,
        reference,
        files,
        omissions,
        limits: loaded.snapshot.limits,
      }
    } catch (error) {
      await rm(inputDir, { recursive: true, force: true })
      projection = {
        schemaVersion: "jit-optimize-pre-run-inputs/v1",
        status: "unresolved",
        reference,
        files: [],
        omissions: [],
        diagnostic: {
          code: "pre-run-input-snapshot-invalid",
          message: `Could not read the digest-bound pre-run input snapshot: ${String(error)}`,
        },
      }
    }
  }
  await Bun.write(manifestPath, JSON.stringify(projection, null, 2))
  return projection
}

function observedFormat(filePath: string, content: Uint8Array | string): ImplementationFormatObservation {
  const extension = path.extname(filePath).toLowerCase()
  const text = typeof content === "string" ? content : new TextDecoder("utf-8").decode(content)
  if (extension === ".json") {
    try {
      const parsed: unknown = JSON.parse(text)
      const rootType = parsed === null
        ? "null"
        : Array.isArray(parsed)
          ? "array"
          : typeof parsed as ImplementationFormatObservation["rootType"]
      return {
        kind: "json",
        rootType,
        ...(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? { topLevelKeys: Object.keys(parsed).sort((left, right) => left.localeCompare(right, "en")) }
          : {}),
        valid: true,
      }
    } catch {
      return { kind: "json", valid: false }
    }
  }
  if (extension === ".csv") {
    const header = text.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? ""
    const columns = header.includes(",") && !header.includes('"')
      ? header.split(",").map((item) => item.trim()).filter(Boolean)
      : []
    return { kind: "csv", ...(columns.length > 0 ? { columns } : {}) }
  }
  if ([".yaml", ".yml"].includes(extension)) return { kind: "yaml" }
  if ([".md", ".txt", ".tsv", ".xml", ".html", ".js", ".mjs", ".cjs", ".ts", ".py", ".sh", ".ps1"].includes(extension)) {
    return { kind: "text" }
  }
  return { kind: "binary-or-unknown" }
}

function sourceRuntime(filePath: string): "python" | "node" | "shell" | "powershell" | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case ".py": return "python"
    case ".js":
    case ".mjs":
    case ".cjs":
    case ".ts": return "node"
    case ".sh": return "shell"
    case ".ps1": return "powershell"
    default: return undefined
  }
}

async function buildImplementationContext(
  skillDir: string | undefined,
  groups: TaskGroup[],
  optimizeDir: string,
): Promise<object> {
  let skillText = ""
  if (skillDir) {
    try {
      skillText = await readFile(path.join(skillDir, "SKILL.md"), "utf8")
    } catch {
      // The complete resource index already reports what is present.
    }
  }
  const sourceInterfaces: Array<{
    path: string
    runtime: "python" | "node" | "shell" | "powershell"
    bytes: number
    sha256: string
    parameterTokens: string[]
    referencedBySkill: boolean
  }> = []
  if (skillDir) {
    for (const resource of await indexSkillResources(skillDir)) {
      const runtime = sourceRuntime(resource.path)
      if (!runtime) continue
      let source = ""
      if (resource.bytes <= 64 * 1024) {
        try {
          source = await readFile(path.join(skillDir, ...resource.path.split("/")), "utf8")
        } catch {
          // Keep the interface indexed without guessing its parameters.
        }
      }
      sourceInterfaces.push({
        path: resource.path,
        runtime,
        bytes: resource.bytes,
        sha256: resource.sha256,
        parameterTokens: [...new Set(source.match(/--[A-Za-z][A-Za-z0-9-]*/gu) ?? [])].sort((left, right) => left.localeCompare(right, "en")),
        referencedBySkill: skillText.includes(resource.path),
      })
    }
  }

  const evidence = []
  for (const group of groups) {
    for (const run of group.runs) {
      const fixtureManifestPath = `.optimize/tasks/${group.safeId}/run-${run.localIndex}-task-fixtures-manifest.json`
      let inputStatus: "materialized" | "empty" | "unresolved" | "unavailable" = "unavailable"
      let inputFiles: ImplementationContextFile[] = []
      const taskPath = run.evidence.trace?.taskPath
      if (taskPath) {
        const boundTaskPath = path.isAbsolute(taskPath)
          ? taskPath
          : path.resolve(path.dirname(run.evidence.trace!.sourcePath), taskPath)
        const collected = await collectTaskFixtures(boundTaskPath)
        inputStatus = collected.projection.status
        inputFiles = collected.files.map((file) => ({
          path: file.path,
          locator: `.optimize/tasks/${group.safeId}/run-${run.localIndex}-task-fixtures/${file.path}`,
          bytes: file.bytes,
          sha256: file.sha256,
          format: observedFormat(file.path, file.content),
        }))
      }
      const taskDir = path.join(optimizeDir, "tasks", group.safeId)
      await mkdir(taskDir, { recursive: true })
      const preRunProjection = await materializePreRunInputs(
        taskDir,
        run.localIndex,
        run.evidence.inputResources?.preRun,
      )
      const preRunInputFiles = await Promise.all(preRunProjection.files.map(async (file) => {
        const projectedPath = path.join(taskDir, `run-${run.localIndex}-pre-run-inputs`, ...file.path.split("/"))
        let content = new Uint8Array()
        try {
          content = new Uint8Array(await Bun.file(projectedPath).arrayBuffer())
        } catch {
          // The projection manifest remains authoritative about the missing
          // file; keep a conservative format marker instead of guessing.
        }
        return {
          path: file.path,
          locator: `.optimize/tasks/${group.safeId}/run-${run.localIndex}-pre-run-inputs/${file.path}`,
          bytes: file.bytes,
          sha256: file.sha256,
          mediaType: file.mediaType,
          format: file.mediaType === "binary"
            ? { kind: "binary-or-unknown" as const }
            : observedFormat(file.path, content),
        }
      }))
      const preRunInputs = {
        source: "pre-run-input-snapshot",
        status: preRunProjection.status,
        manifestPath: `.optimize/tasks/${group.safeId}/run-${run.localIndex}-pre-run-inputs-manifest.json`,
        ...(preRunProjection.reference
          ? { reference: { sha256: preRunProjection.reference.sha256, bytes: preRunProjection.reference.bytes } }
          : {}),
        ...(preRunProjection.limits ? { limits: preRunProjection.limits } : {}),
        files: preRunInputFiles,
        omissions: preRunProjection.omissions,
        ...(preRunProjection.diagnostic ? { diagnostic: preRunProjection.diagnostic } : {}),
      }
      const observedOutputs = [...(run.evidence.workDirSnapshot?.files ?? new Map<string, string>())]
        .map(([filePath, content]) => {
          const portable = filePath.replaceAll("\\", "/")
          const bytes = new TextEncoder().encode(content)
          return {
            path: portable,
            locator: `.optimize/tasks/${group.safeId}/run-${run.localIndex}-workdir/${portable}`,
            bytes: bytes.byteLength,
            sha256: sha256Bytes(bytes),
            format: observedFormat(portable, content),
          }
        })
        .sort((left, right) => left.path.localeCompare(right.path, "en"))
      evidence.push({
        evidenceIndex: run.globalIndex,
        taskId: group.taskId,
        inputs: {
          status: inputStatus,
          manifestPath: fixtureManifestPath,
          files: inputFiles,
        },
        preRunInputs,
        observedOutputs,
        checks: (run.evidence.criteria ?? []).map((criterion) => ({
          id: criterion.id,
          method: criterion.method,
          passed: criterion.passed,
          score: criterion.score,
          sourceRef: `evidence:${run.globalIndex}#criteria/${criterion.id}`,
          ...(criterion.description ? { description: criterion.description } : {}),
        })),
      })
    }
  }
  return {
    schemaVersion: "jit-optimize-implementation-context/v1",
    note: "This is a navigation and observed-shape index, not proof that every declared input or precondition is supported. Use exact locators and retain untested conditions as residual duties.",
    implementationContract: {
      existingExecutable: "reuse-script",
      newExecutable: "generate-script",
      domainBackend: "registered-only",
      declarationMismatch: "repairable-action-diagnostic",
      changedPathsMeaning: "paths actually changed in the candidate; do not use them to turn a pre-existing script into a generated-program claim",
    },
    sourceInterfaces,
    evidence,
  }
}

/** Write evidence + history + a README into {workspace}/.optimize/ */
export async function serializeContext(
  optimizeDir: string,
  evidences: Evidence[],
  history: HistoryEntry[],
  opts: SerializeOptions = {},
): Promise<void> {
  const maxConvLog = opts.maxConvLogEntries ?? DEFAULT_MAX_CONV_LOG
  const maxFileInline = opts.maxFileInlineChars ?? DEFAULT_MAX_FILE_INLINE

  const groups = groupEvidencesByTask(evidences)

  const hasSkillResourceIndex = opts.skillDir !== undefined
  if (opts.skillDir) {
    await Bun.write(
      path.join(optimizeDir, "SKILL_RESOURCE_INDEX.md"),
      await renderSkillResourceIndex(opts.skillDir, evidences),
    )
  }

  await Bun.write(
    path.join(optimizeDir, "CONSTRAINT_SOURCES.json"),
    JSON.stringify(renderConstraintSources(evidences, hasSkillResourceIndex), null, 2),
  )
  await Bun.write(
    path.join(optimizeDir, "IMPLEMENTATION_CONTEXT.json"),
    JSON.stringify(await buildImplementationContext(opts.skillDir, groups, optimizeDir), null, 2),
  )

  // README: navigation guide
  const readme = buildReadme(groups, history.length, hasSkillResourceIndex)
  await Bun.write(path.join(optimizeDir, "README.md"), readme)

  // Top-level PER_TASK_SUMMARY.md. This is the anchor the optimizer prompt
  // references for the No-trade-off rule: the PASSING column tells it what
  // it must NOT break while fixing the FAILING / MARGINAL rows.
  await Bun.write(
    path.join(optimizeDir, "PER_TASK_SUMMARY.md"),
    renderPerTaskSummary(groups),
  )

  // Submission template. Three valid shapes — pick one and fill it in.
  await Bun.write(
    path.join(optimizeDir, "submission.template.json"),
    JSON.stringify({
      _comment: "This file shows all three valid submission shapes. Pick ONE for submission.json — don't submit this file verbatim.",
      _shape_1_edit: {
        rootCause: "One paragraph diagnosing the underlying problem (not what you changed).",
        reasoning: "Full analysis, including the four answers from the Pre-Edit Checklist in step 4: generality test, rewrite-in-place test, budget, no-trade-off test.",
        confidence: 0.8,
        changedFiles: ["SKILL.md"],
        changes: [
          {
            file: "SKILL.md",
            section: "workflow",
            description: "Rewrite step 2 to make the ordering explicit.",
            generality: "Any task on this skill that exercises step 2 under time pressure benefits from the tightened ordering — e.g. the batch-import task under tasks/task-import/ and any similar bulk-operation task.",
            linesDelta: -1,
          },
        ],
        opportunities: [
          {
            category: "instruction-clarity",
            summary: "Take over delegated steps: describe the bounded workflow; variable parameters: name the values/paths; required resources: name the files/runtime; check source: cite the independent rule; disposition reason: explain why this is implemented.",
            evidenceIds: ["0"],
            disposition: "implemented",
            residualDuty: "The agent still performs the context-dependent judgment and any steps not covered by the check.",
          },
        ],
        actions: [
          {
            id: "make-repeated-work-executable",
            kind: "reuse-script",
            evidenceIds: ["0"],
            sourceRefs: ["scripts/existing-tool.py"],
            dependsOn: [],
            inputs: ["input path supplied by the user"],
            outputs: ["output path returned to the user"],
            preconditions: ["the bundled runtime dependency is available"],
            constraints: [
              {
                description: "A permanent rule stated by the source skill.",
                scope: "skill",
                sourceRef: "SKILL.md#relevant-section",
              },
              {
                description: "A file or side-effect restriction from this evidence task only.",
                scope: "task",
                sourceRef: ".optimize/tasks/<safeTaskId>/run-N.json#taskPrompt",
              },
            ],
            validation: {
              help: { args: ["--help"], stdoutIncludes: ["Usage:"] },
              cases: [
                {
                  id: "observed-task",
                  evidenceId: "0",
                  inputSource: "task-fixtures",
                  inputFiles: ["path/from/task-fixtures"],
                  args: ["--input", "path/from/task-fixtures", "--out", "result.json"],
                  expectedFiles: [{ path: "result.json", referencePath: "path/in/observed-workdir" }],
                  applicability: "supported",
                  basis: "reference-output",
                  sourceRefs: ["evidence:0#criteria/<criterion-id>"],
                },
              ],
            },
            changedPaths: ["SKILL.md"],
            residualDuties: ["the agent selects whether this action applies"],
            verification: ["run the bundled tool on a changed input"],
          },
        ],
      },
      _shape_2_no_changes: {
        noChanges: true,
        rootCause: "The evidence was reviewed; no generalizable, checkable opportunity is available. State why the opportunity is retained or not-applicable rather than merely saying that no defect was observed.",
        opportunities: [],
      },
      _shape_3_infra_blocked: {
        infraBlocked: true,
        blockedEvidenceIds: ["0", "1"],
        blockedReason: "Both runs have runStatus=timeout with tokens=0 and durationMs matching task.timeoutMs — the agent subprocess was killed before producing any LLM output. The 'Evidence Index' column in PER_TASK_SUMMARY.md identifies these runs (0 and 1). No skill-level diagnosis is possible.",
        opportunities: [],
      },
    }, null, 2),
  )

  // Task-first evidence layout: tasks/{safeTaskId}/{summary.md, run-N.md, run-N.json, run-N-workdir/}
  // runsPerTask > 1 means a task contributes multiple runs; localIndex is
  // sequential per task, globalIndex is the flat 0..N-1 position that
  // `blockedEvidenceIds` still references.
  for (const group of groups) {
    const taskDir = path.join(optimizeDir, "tasks", group.safeId)
    await mkdir(taskDir, { recursive: true })
    await Bun.write(
      path.join(taskDir, "summary.md"),
      renderTaskGroupSummary(group),
    )
    for (const run of group.runs) {
      await Bun.write(
        path.join(taskDir, `run-${run.localIndex}.json`),
        JSON.stringify(serializeEvidenceJson(run.evidence), null, 2),
      )
      await Bun.write(
        path.join(taskDir, `run-${run.localIndex}.md`),
        renderEvidenceMarkdown(group, run, { maxConvLog, maxFileInline }),
      )

      if (run.evidence.trace?.taskPath) {
        const boundTaskPath = path.isAbsolute(run.evidence.trace.taskPath)
          ? run.evidence.trace.taskPath
          : path.resolve(path.dirname(run.evidence.trace.sourcePath), run.evidence.trace.taskPath)
        await materializeTaskFixtures(taskDir, run.localIndex, boundTaskPath)
      }

      if (run.evidence.workDirSnapshot && run.evidence.workDirSnapshot.files.size > 0) {
        const snapDir = path.join(taskDir, `run-${run.localIndex}-workdir`)
        // mkdir once per unique parent directory instead of once per
        // file — sibling files in the same workdir subdirectory don't
        // need a repeated recursive mkdir call each time.
        const createdDirs = new Set<string>()
        let renderedBytes = 0
        for (const [filePath, content] of run.evidence.workDirSnapshot.files) {
          // Render-time projection cap: the durable record may hold more
          // than the optimizer should see. Skip individual files past the
          // per-file ceiling, stop entirely once the per-run aggregate
          // ceiling is reached. Both ceilings independent of the snapshot
          // capture cap by design (see RENDER_WORKDIR_MAX_* above).
          if (content.length > RENDER_WORKDIR_MAX_FILE) continue
          if (renderedBytes + content.length > RENDER_WORKDIR_MAX_TOTAL) break
          const dest = path.join(snapDir, filePath)
          const parent = path.dirname(dest)
          if (!createdDirs.has(parent)) {
            await mkdir(parent, { recursive: true })
            createdDirs.add(parent)
          }
          await Bun.write(dest, content)
          renderedBytes += content.length
        }
      }
    }
  }

  // History
  if (history.length > 0) {
    await Bun.write(
      path.join(optimizeDir, "history.json"),
      JSON.stringify(history, null, 2),
    )
    await Bun.write(
      path.join(optimizeDir, "history.md"),
      renderHistoryMarkdown(history),
    )
  }
}

function renderConstraintSources(evidences: Evidence[], hasSkillSource: boolean): object {
  const sourceRef = (evidence: Evidence, suffix: string): string => {
    const trace = evidence.trace
    if (!trace) return `.optimize/tasks/${safeTaskSlug(evidence.taskId)}/run-0.json#${suffix}`
    return `${trace.sourcePath}#${trace.recordLocator}#${suffix}`
  }

  return {
    schemaVersion: "jit-optimize-constraint-sources/v1",
    skill: {
      sourceRef: hasSkillSource ? "SKILL.md" : null,
      note: "Only rules stated by the source skill may be treated as permanent skill constraints. An unobserved rule is not removable.",
    },
    tasks: evidences.map((evidence, evidenceIndex) => ({
      evidenceIndex,
      taskId: evidence.taskId,
      sourceRef: sourceRef(evidence, "taskPrompt"),
      text: evidence.taskPrompt,
      note: "Current task values and restrictions are task-scoped unless the source skill independently states them.",
    })),
    environments: evidences.map((evidence, evidenceIndex) => ({
      evidenceIndex,
      sourceRef: sourceRef(evidence, "environment"),
      facts: {
        ...(evidence.trace?.adapter ? { adapter: evidence.trace.adapter } : {}),
        ...(evidence.trace?.model ? { model: evidence.trace.model } : {}),
        ...(evidence.trace?.system ? { system: evidence.trace.system } : {}),
        ...(evidence.trace?.workDirPath ? { workDirPath: evidence.trace.workDirPath } : {}),
        ...(evidence.runMeta?.runStatus ? { runStatus: evidence.runMeta.runStatus } : {}),
        ...(evidence.runMeta?.durationMs !== undefined
          ? { durationMs: evidence.runMeta.durationMs }
          : {}),
      },
      note: "Observed runtime facts describe this execution and are not portable skill requirements by default.",
    })),
    unknown: {
      note: "If the available source cannot establish a constraint's scope, record scope=unknown; do not promote it to a permanent rule or discard it.",
    },
  }
}

interface IndexedSkillResource {
  path: string
  bytes: number
  sha256: string
}

async function* walkSkillResources(
  root: string,
  base: string = root,
): AsyncGenerator<{ rel: string; abs: string }> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await readdir(base, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.name === ".optimize" || entry.name === ".git" || entry.name === "node_modules") continue
    const full = path.join(base, entry.name)
    if (entry.isDirectory()) {
      yield* walkSkillResources(root, full)
    } else if (entry.isFile()) {
      yield {
        rel: path.relative(root, full).split(path.sep).join("/"),
        abs: full,
      }
    }
  }
}

async function indexSkillResources(skillDir: string): Promise<IndexedSkillResource[]> {
  const root = path.resolve(skillDir)
  const resources: IndexedSkillResource[] = []
  for await (const file of walkSkillResources(root)) {
    const bytes = new Uint8Array(await Bun.file(file.abs).arrayBuffer())
    resources.push({
      path: file.rel,
      bytes: bytes.byteLength,
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    })
  }
  return resources
}

async function renderSkillResourceIndex(skillDir: string, evidences: Evidence[]): Promise<string> {
  const root = path.resolve(skillDir)
  const resources = await indexSkillResources(root)
  const parts = [
    "# Skill Resource Index",
    "",
    `Configured skill root: \`${root}\``,
    "",
    "This is a navigation index of the complete configured skill copy. A file or rule not observed in the trace remains readable here; absence from one run is not evidence that the rule is unused or safe to remove.",
    "",
    "| Path | Bytes | SHA-256 |",
    "| --- | ---: | --- |",
  ]
  for (const resource of resources) {
    parts.push(`| \`${resource.path.replace(/\|/g, "\\|")}\` | ${resource.bytes} | \`${resource.sha256}\` |`)
  }
  if (resources.length === 0) parts.push("| (no readable files) | 0 | n/a |")
  parts.push("", "## Explicit Trace Bindings", "")
  const bound = evidences
    .map((evidence, evidenceIndex) => ({ evidenceIndex, trace: evidence.trace }))
    .filter((item): item is { evidenceIndex: number; trace: NonNullable<Evidence["trace"]> } => item.trace !== undefined)
  if (bound.length === 0) {
    parts.push("No external trace binding was supplied. This index does not infer one.")
  } else {
    for (const item of bound) {
      parts.push(`- Evidence ${item.evidenceIndex}: \`${item.trace.sourcePath}\` at \`${item.trace.recordLocator}\``)
      parts.push(`  - trace-declared skill: ${item.trace.skillPath ? `\`${item.trace.skillPath}\`` : "unknown"}`)
      parts.push(`  - configured optimization skill: \`${root}\``)
    }
  }
  parts.push("")
  return parts.join("\n")
}

/**
 * Claim a unique filesystem-safe id for a task group, disambiguating with
 * a numeric suffix when a previously-seen group already took the slug.
 * Comparison is case-insensitive so case-only differences (`Foo` vs
 * `foo`) collide on case-insensitive filesystems like macOS APFS.
 */
function allocateSafeId(base: string, claimed: Set<string>): string {
  if (!claimed.has(base.toLowerCase())) {
    claimed.add(base.toLowerCase())
    return base
  }
  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix++) {
    const candidate = `${base}-${suffix}`
    if (!claimed.has(candidate.toLowerCase())) {
      claimed.add(candidate.toLowerCase())
      return candidate
    }
  }
  // Unreachable — the loop runs until it finds a free slug.
  throw new Error("allocateSafeId: exhausted suffix range")
}

/**
 * Group evidences by taskId in the order they first appear. Each run's
 * infra-taint flag, score, and the group's worst-criterion label are
 * computed in one pass over the criteria list, which is what the render
 * helpers need downstream. Preserves the original flat index as
 * `globalIndex` so `blockedEvidenceIds` keeps working.
 */
function groupEvidencesByTask(evidences: Evidence[]): TaskGroup[] {
  const order: string[] = []
  const byId = new Map<string, TaskGroup>()
  const worstByGroup = new Map<string, { score: number; label: string }>()
  // Tracks safeIds already handed out so two distinct taskIds that collapse
  // to the same slug (e.g. `pdf/extract` vs `pdf:extract`, or either
  // falling back to `unnamed-task`) end up in distinct directories.
  // Case-insensitive matching so macOS APFS default config doesn't
  // silently alias `Foo` and `foo`.
  const claimedSafeIds = new Set<string>()

  for (let i = 0; i < evidences.length; i++) {
    const ev = evidences[i]!
    let group = byId.get(ev.taskId)
    if (!group) {
      group = {
        taskId: ev.taskId,
        safeId: allocateSafeId(safeTaskSlug(ev.taskId), claimedSafeIds),
        runs: [],
        mean: null,
        status: "UNASSESSED",
        worstCriterion: null,
      }
      byId.set(ev.taskId, group)
      order.push(ev.taskId)
    }

    // Single pass over criteria: detect infra-taint, track worst-scoring
    // clean criterion for the summary column, and — if the run wasn't
    // tainted — compute the run's score via the canonical
    // `scoreFromCriteria` helper (which re-walks criteria, but only once
    // per run now instead of the previous three-pass structure).
    let hasInfra = (ev.runMeta?.runStatus !== undefined && ev.runMeta.runStatus !== "ok")
      || (ev.trace?.runStatus !== undefined && ev.trace.runStatus !== "ok")
    const criteria = ev.criteria ?? []
    for (const c of criteria) {
      if (c.infraError !== undefined) {
        hasInfra = true
        continue
      }
      const prior = worstByGroup.get(ev.taskId)
      if (prior === undefined || c.score < prior.score) {
        worstByGroup.set(ev.taskId, { score: c.score, label: c.name ?? c.id })
      }
    }
    const score = hasInfra ? null : scoreFromCriteria(criteria)
    group.runs.push({
      globalIndex: i,
      localIndex: group.runs.length,
      evidence: ev,
      infraTainted: hasInfra,
      score,
    })
  }

  for (const group of byId.values()) {
    const cleanScores: number[] = []
    for (const run of group.runs) {
      if (run.score !== null) cleanScores.push(run.score)
    }
    if (cleanScores.length > 0) {
      group.mean = cleanScores.reduce((a, b) => a + b, 0) / cleanScores.length
      group.status =
        group.mean >= STATUS_THRESHOLD_PASSING
          ? "PASSING"
          : group.mean < STATUS_THRESHOLD_FAILING
            ? "FAILING"
            : "MARGINAL"
    } else if (group.runs.length > 0 && group.runs.every((run) => run.infraTainted)) {
      group.status = "TAINTED"
    } else {
      group.status = "UNASSESSED"
    }
    const worst = worstByGroup.get(group.taskId)
    group.worstCriterion = worst === undefined
      ? null
      : `${worst.label} (${worst.score.toFixed(2)})`
  }

  return order.map((id) => byId.get(id)!)
}

function renderPerTaskSummary(groups: TaskGroup[]): string {
  const parts: string[] = []
  parts.push("# Per-Task Summary")
  parts.push("")
  parts.push(
    "Each row is one task from round-0 (baseline) grouped across its runs. " +
    "The `Status` column is what the selection engine's per-task regression gate " +
    "uses to decide whether your edit is allowed to win. **You must not make any " +
    "PASSING task worse than its current mean.**",
  )
  parts.push("")
  parts.push("Status buckets:")
  parts.push("- **FAILING** (mean < 0.5) — you're here to fix these.")
  parts.push("- **MARGINAL** (0.5 ≤ mean < 0.9) — fixable, but watch for regressions.")
  parts.push("- **PASSING** (mean ≥ 0.9) — leave them alone. Your edit must NOT lower these.")
  parts.push("- **UNASSESSED** — usable trace/artifact evidence without a score. Analyze it, but do not invent quality labels. A missing score is not an infrastructure failure.")
  parts.push("- **TAINTED** — all runs were infra-broken; no usable score. See the Abstain section of your instructions.")
  parts.push("")

  // Sort by mean ascending so the pain points are at the top; TAINTED rows
  // last because they carry no score. Display order is for humans only —
  // the Evidence Index column gives the canonical audit identity.
  const sorted = [...groups].sort((a, b) => {
    const av = a.mean ?? Infinity
    const bv = b.mean ?? Infinity
    return av - bv
  })

  parts.push("| Status   | Task ID | Runs | Mean | Dir (relative to .optimize/) | Worst Criterion | Evidence Indices |")
  parts.push("|----------|---------|------|------|------------------------------|-----------------|------------------|")
  for (const g of sorted) {
    const mean = g.mean === null ? "n/a" : g.mean.toFixed(3)
    const dir = `tasks/${g.safeId}/`
    const worst = g.worstCriterion ?? "(none)"
    const indices = g.runs.map((r) => r.globalIndex).join(",")
    parts.push(
      `| ${g.status.padEnd(8)} | \`${g.taskId}\` | ${g.runs.length} | ${mean} | ${dir} | ${worst} | ${indices} |`,
    )
  }
  parts.push("")
  parts.push(
    "The **Evidence Indices** column is what `blockedEvidenceIds` references " +
    "if you emit an `infraBlocked` submission — it's the original flat 0..N-1 " +
    "numbering, independent of the per-task directory layout.",
  )
  parts.push("")
  return parts.join("\n")
}

function renderTaskGroupSummary(group: TaskGroup): string {
  const parts: string[] = []
  parts.push(`# Task \`${group.taskId}\` — ${group.status}`)
  parts.push("")
  parts.push(`- runs: ${group.runs.length}`)
  parts.push(`- mean score: ${group.mean === null ? "n/a" : group.mean.toFixed(3)}`)
  if (group.worstCriterion) {
    parts.push(`- worst criterion: ${group.worstCriterion}`)
  }
  parts.push("")
  parts.push(`## Per-Run Breakdown`)
  parts.push("")
  parts.push("| Local | Evidence Index | Score | Status |")
  parts.push("|-------|---------------|-------|--------|")
  for (const run of group.runs) {
    const scoreText = run.score === null ? "n/a" : run.score.toFixed(3)
    const statusText = run.infraTainted
      ? "INFRA-TAINTED"
      : run.score === null ? "no-data" : "scored"
    parts.push(`| run-${run.localIndex} | ${run.globalIndex} | ${scoreText} | ${statusText} |`)
  }
  parts.push("")
  parts.push(`See \`run-N.md\` in this directory for the full evidence of each run.`)
  parts.push("")
  return parts.join("\n")
}

function serializeEvidenceJson(ev: Evidence): object {
  return {
    taskId: ev.taskId,
    taskPrompt: ev.taskPrompt,
    criteria: ev.criteria ?? null,
    runMeta: ev.runMeta ?? null,
    inputResources: ev.inputResources ?? null,
    trace: ev.trace ?? null,
    conversationLogEntries: ev.conversationLog.length,
    workDirFileCount: ev.workDirSnapshot?.files.size ?? 0,
    conversationLog: ev.conversationLog,
  }
}

function renderCriterionBlock(c: EvidenceCriterion): string[] {
  const lines: string[] = []
  const icon = c.passed ? "✓" : "✗"
  const label = c.name ?? c.id
  const weightPct = (c.weight * 100).toFixed(1)
  lines.push(`### ${icon} ${label} (weight ${weightPct}%, score ${c.score.toFixed(2)})`)
  lines.push(`- **id:** \`${c.id}\``)
  lines.push(`- **method:** ${c.method}`)
  if (c.description) {
    lines.push(`- **what it tests:** ${c.description}`)
  }
  if (c.details) {
    lines.push(`- **why below max:** ${c.details}`)
  }
  lines.push("")
  return lines
}

function renderEvidenceMarkdown(
  group: TaskGroup,
  run: TaskGroupRun,
  opts: { maxConvLog: number; maxFileInline: number },
): string {
  const ev = run.evidence
  const parts: string[] = []
  parts.push(`# Task \`${group.taskId}\` — run ${run.localIndex}`)
  parts.push("")
  parts.push(`- Evidence Index (global): ${run.globalIndex}`)
  parts.push(`- Task status (across all runs): ${group.status}`)
  if (group.mean !== null) {
    parts.push(`- Task mean score: ${group.mean.toFixed(3)}`)
  }
  parts.push("")
  parts.push(`## Task`)
  parts.push("")
  parts.push("```")
  parts.push(ev.taskPrompt)
  parts.push("```")
  parts.push("")

  if (ev.criteria && ev.criteria.length > 0) {
    const failedFirst = [...ev.criteria].sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1
      return b.weight - a.weight
    })
    const failed = failedFirst.filter((c) => !c.passed)
    parts.push(`## Evaluation Criteria (${ev.criteria.length} total, ${failed.length} failed)`)
    parts.push("")
    parts.push(
      failed.length > 0
        ? `Failed criteria are listed first, ordered by weight (biggest impact on the overall score first). Each criterion's weight is its normalized share of the total task score.`
        : `All criteria passed. Listed in order of weight for reference.`,
    )
    parts.push("")
    for (const c of failedFirst) {
      parts.push(...renderCriterionBlock(c))
    }
  } else {
    parts.push(`## Evaluation Criteria`)
    parts.push("")
    parts.push("(no structured eval data available for this evidence)")
    parts.push("")
  }

  if (ev.runMeta) {
    parts.push(`## Run Metadata`)
    parts.push("")
    // runStatus is the canonical infra-health signal. Show it first so the
    // optimizer can see at a glance whether this evidence reflects skill
    // behavior or infrastructure failure. Values other than 'ok' mean the
    // run was not scored — the abstain path (jit-optimize-abstain-path.md)
    // will consume this to avoid hallucinating skill edits.
    if (ev.runMeta.runStatus) {
      parts.push(`- runStatus: ${ev.runMeta.runStatus}`)
      if (ev.runMeta.statusDetail) {
        parts.push(`  detail: ${ev.runMeta.statusDetail.slice(0, 300)}`)
      }
      if (ev.runMeta.runStatus !== "ok") {
        parts.push(
          `  NOTE: runStatus is not 'ok'. This run did not execute normally:` +
          ` the evaluator was NOT run against the work directory, and any` +
          ` criteria shown below are stubs carrying infraError — not real` +
          ` evaluations. See the "infraBlocked" section of your output format` +
          ` instructions for when to abstain on this kind of evidence.`,
        )
      }
    }
    parts.push(`- duration: ${ev.runMeta.durationMs}ms`)
    parts.push(`- tokens: in=${ev.runMeta.tokens.input} out=${ev.runMeta.tokens.output}`)
    if (ev.runMeta.skillLoaded === false) parts.push(`- WARNING: skill was not loaded`)
    if (ev.runMeta.adapterError) {
      const ae = ev.runMeta.adapterError
      parts.push(`- adapter error: exit ${ae.exitCode}`)
      if (ae.diagnosis) {
        parts.push(`  ${ae.diagnosis.summary}`)
        if (ae.diagnosis.hint) parts.push(`  ${ae.diagnosis.hint}`)
      } else {
        parts.push(`  stderr: ${ae.stderr.slice(0, 500)}`)
      }
    }
    parts.push("")
  }

  if (ev.trace) {
    parts.push(`## External Trace Binding`)
    parts.push("")
    parts.push(`- format: ${ev.trace.format}`)
    parts.push(`- representation: ${ev.trace.representation}`)
    parts.push(`- source: ${ev.trace.sourcePath}`)
    parts.push(`- SHA-256: ${ev.trace.inputSha256}`)
    parts.push(`- record: ${ev.trace.recordLocator}`)
    if (ev.trace.sourceAgent) parts.push(`- source agent: ${ev.trace.sourceAgent}`)
    if (ev.trace.adapter) parts.push(`- adapter: ${ev.trace.adapter}${ev.trace.adapterVersion ? ` ${ev.trace.adapterVersion}` : ""}`)
    if (ev.trace.model) parts.push(`- model: ${ev.trace.model}`)
    if (ev.trace.system) parts.push(`- system: ${ev.trace.system}`)
    if (ev.trace.runStatus) parts.push(`- run status: ${ev.trace.runStatus}`)
    if (ev.trace.durationMs !== undefined) parts.push(`- duration: ${ev.trace.durationMs}ms`)
    if (ev.trace.usage) {
      parts.push(`- observed usage: input=${ev.trace.usage.inputTokens ?? "unknown"}, output=${ev.trace.usage.outputTokens ?? "unknown"}, costUsd=${ev.trace.usage.costUsd ?? "unknown"} (${ev.trace.usage.source})`)
    }
    parts.push(`- unknown fields: ${ev.trace.unknownFields.length > 0 ? ev.trace.unknownFields.join(", ") : "none"}`)
    for (const item of ev.trace.diagnostics) {
      parts.push(`- ${item.severity} ${item.code} at ${item.locator}: ${item.message}`)
    }
    parts.push("")
  }

  if (ev.trace?.taskPath) {
    const fixturePath = `.optimize/tasks/${group.safeId}/run-${run.localIndex}-task-fixtures`
    const manifestPath = `${fixturePath}-manifest.json`
    parts.push(`## Original Task Fixtures`)
    parts.push("")
    parts.push(`- manifest: \`${manifestPath}\``)
    parts.push(`- files, when manifest status is \`materialized\`: \`${fixturePath}/\``)
    parts.push(`- meaning: original pre-run inputs bound by the trace taskPath; these are not evaluator expectations or files produced by the observed run.`)
    parts.push(`- completeness: treat status \`unresolved\` as a hard evidence gap. Do not infer or recreate skipped inputs.`)
    parts.push("")
  }

  if (ev.inputResources?.preRun) {
    const inputPath = `.optimize/tasks/${group.safeId}/run-${run.localIndex}-pre-run-inputs`
    const manifestPath = `${inputPath}-manifest.json`
    parts.push(`## Original Pre-Run Inputs`)
    parts.push("")
    parts.push(`- source: digest-bound \`skvm-pre-run-input-snapshot/v1\``)
    parts.push(`- manifest: \`${manifestPath}\``)
    parts.push(`- captured files, when available: \`${inputPath}/\``)
    parts.push(`- meaning: bytes captured before the source agent or adapter could mutate the live workdir; this namespace is distinct from task fixtures and observed outputs.`)
    parts.push(`- incomplete or omitted entries remain listed in the manifest and must not be guessed or replaced with current workdir bytes.`)
    parts.push("")
  }

  // Conversation — head + tail if over the limit
  parts.push(`## Conversation Log (${ev.conversationLog.length} entries)`)
  parts.push("")
  const log = ev.conversationLog
  if (log.length <= opts.maxConvLog) {
    for (let i = 0; i < log.length; i++) {
      parts.push(`### [${i}] ${log[i]!.type}`)
      parts.push("```json")
      parts.push(JSON.stringify(log[i], null, 2))
      parts.push("```")
    }
  } else {
    const head = Math.floor(opts.maxConvLog * 0.6)
    const tail = opts.maxConvLog - head
    for (let i = 0; i < head; i++) {
      parts.push(`### [${i}] ${log[i]!.type}`)
      parts.push("```json")
      parts.push(JSON.stringify(log[i], null, 2))
      parts.push("```")
    }
    parts.push("")
    parts.push(`... (${log.length - head - tail} entries elided) ...`)
    parts.push("")
    for (let i = log.length - tail; i < log.length; i++) {
      parts.push(`### [${i}] ${log[i]!.type}`)
      parts.push("```json")
      parts.push(JSON.stringify(log[i], null, 2))
      parts.push("```")
    }
  }
  parts.push("")

  if (ev.workDirSnapshot && ev.workDirSnapshot.files.size > 0) {
    const workdirPath = `.optimize/tasks/${group.safeId}/run-${run.localIndex}-workdir`
    parts.push(`## Work Directory (${ev.workDirSnapshot.files.size} files)`)
    parts.push("")
    parts.push(`Files are available under \`${workdirPath}/\`. Small files inlined below:`)
    parts.push("")
    for (const [filePath, content] of ev.workDirSnapshot.files) {
      if (content.length <= opts.maxFileInline) {
        parts.push(`### ${filePath}`)
        parts.push("```")
        parts.push(content)
        parts.push("```")
      } else {
        parts.push(`- ${filePath} (${content.length} chars — read \`${workdirPath}/${filePath}\`)`)
      }
    }
    parts.push("")
  }

  return parts.join("\n")
}

function renderHistoryMarkdown(history: HistoryEntry[]): string {
  const parts: string[] = []
  parts.push(`# Optimization History`)
  parts.push("")
  parts.push(`This skill has been optimized ${history.length} time(s) before. Do not repeat diagnoses that did not improve the score.`)
  parts.push("")
  for (const entry of history) {
    const status = entry.improved === null
      ? "pending"
      : entry.improved ? "IMPROVED" : "did NOT improve"
    parts.push(`## Round ${entry.round} — ${status}`)
    parts.push(`- timestamp: ${entry.timestamp}`)
    parts.push(`- confidence: ${entry.confidence.toFixed(2)}`)
    parts.push(`- train score: ${entry.trainScore === null ? "n/a" : entry.trainScore.toFixed(3)}`)
    if (entry.testScore !== null) {
      parts.push(`- test score: ${entry.testScore.toFixed(3)}`)
    }
    parts.push("")
    parts.push(`### Root Cause (diagnosed at the time)`)
    parts.push("")
    parts.push(entry.rootCause)
    parts.push("")
    parts.push(`### Changes`)
    parts.push("")
    parts.push(`Files changed: ${entry.changedFiles.join(", ")}`)
    const totalDelta = entry.changes.reduce(
      (sum, c) => sum + (typeof c.linesDelta === "number" ? c.linesDelta : 0),
      0,
    )
    const hasDelta = entry.changes.some((c) => typeof c.linesDelta === "number")
    if (hasDelta) {
      parts.push(`Net line delta this round: ${totalDelta >= 0 ? "+" : ""}${totalDelta}`)
    }
    parts.push("")
    for (const c of entry.changes) {
      const deltaSuffix = typeof c.linesDelta === "number"
        ? ` [Δ ${c.linesDelta >= 0 ? "+" : ""}${c.linesDelta}]`
        : ""
      parts.push(`- \`${c.file}\`${c.section ? ` (${c.section})` : ""}${deltaSuffix}: ${c.description}`)
      if (c.generality && c.generality.trim().length > 0) {
        parts.push(`  - generalized to: ${c.generality}`)
      }
    }
    parts.push("")
    if ((entry.actions?.length ?? 0) > 0) {
      parts.push(`### Actions`)
      parts.push("")
      for (const action of entry.actions ?? []) {
        parts.push(`- \`${action.id}\` (${action.kind}); depends on: ${action.dependsOn.join(", ") || "none"}`)
        parts.push(`  - residual duties: ${action.residualDuties.join("; ") || "none stated"}`)
        for (const constraint of action.constraints ?? []) {
          parts.push(`  - ${constraint.scope} constraint from \`${constraint.sourceRef}\`: ${constraint.description}`)
        }
        if (action.validation) {
          parts.push(`  - validation cases: ${action.validation.cases.map((item) => item.id).join(", ") || "none"}`)
        }
      }
      parts.push("")
    }
    if ((entry.actionDiagnostics?.length ?? 0) > 0) {
      parts.push(`### Engine Diagnostics`)
      parts.push("")
      for (const diagnostic of entry.actionDiagnostics ?? []) {
        const owner = diagnostic.actionId ? ` (action ${diagnostic.actionId})` : ""
        parts.push(`- ${diagnostic.code}${owner} at \`${diagnostic.locator}\`: ${diagnostic.message}`)
      }
      parts.push("")
    }
    parts.push(`### Reasoning`)
    parts.push("")
    parts.push(entry.reasoning)
    parts.push("")
  }
  return parts.join("\n")
}

function buildReadme(groups: TaskGroup[], historyCount: number, hasSkillResourceIndex: boolean): string {
  const taskCount = groups.length
  const runCount = groups.reduce((n, g) => n + g.runs.length, 0)
  const failing = groups.filter((g) => g.status === "FAILING").length
  const marginal = groups.filter((g) => g.status === "MARGINAL").length
  const passing = groups.filter((g) => g.status === "PASSING").length
  const unassessed = groups.filter((g) => g.status === "UNASSESSED").length
  const tainted = groups.filter((g) => g.status === "TAINTED").length

  const dirListing = groups
    .map((g) => `  - \`tasks/${g.safeId}/\` — task \`${g.taskId}\` (${g.status}, ${g.runs.length} run${g.runs.length === 1 ? "" : "s"})`)
    .join("\n")

  return `# JIT-Optimize Workspace

Your current directory is a **complete copy of a skill folder**. You may freely
edit any file — SKILL.md, scripts, references, etc. — using your normal tools
(read, edit, write, glob, grep, bash). Your edits become the "optimized" version
of this skill.

## Where to find context

- \`.optimize/PER_TASK_SUMMARY.md\` — **READ THIS FIRST.** One row per task
  with status (FAILING / MARGINAL / PASSING / TAINTED), mean score, and
  where to find its evidence. This is the landscape you're working against.
  Counts right now: ${failing} FAILING, ${marginal} MARGINAL, ${passing} PASSING, ${unassessed} UNASSESSED, ${tainted} TAINTED across ${taskCount} task(s) / ${runCount} run(s).
- \`.optimize/tasks/<safeTaskId>/\` — per-task directories. Each contains:
  - \`summary.md\` — the task's aggregate status and a per-run breakdown.
  - \`run-N.md\` — the full evidence for run N (conversation, criteria,
    run metadata). Files for multiple runs of the same task live in the
    same directory, so you can tell "task A failed twice the same way"
    apart from "two different tasks failed once each".
  - \`run-N.json\` — the same evidence in structured form.
  - \`run-N-task-fixtures/\` — original pre-run inputs from the trace-bound
    task file (when present and safely materialized). The adjacent
    \`run-N-task-fixtures-manifest.json\` binds their hashes and completeness;
    these files are not evaluator expectations or observed outputs.
  - \`run-N-workdir/\` — files the agent left in its work directory (if recorded).

  - \`run-N-pre-run-inputs/\` — digest-bound bytes captured from the real
    workdir before the source run. The adjacent
    \`run-N-pre-run-inputs-manifest.json\` records captured and omitted entries;
    this namespace is distinct from task fixtures and observed outputs.

  Directories for this session:
${dirListing}
${hasSkillResourceIndex ? "- `.optimize/SKILL_RESOURCE_INDEX.md` — complete configured skill-file navigation plus explicit trace-to-skill bindings. Read relevant resources before deciding an unobserved rule is removable.\n" : ""}- \`.optimize/CONSTRAINT_SOURCES.json\` — structured provenance buckets for permanent skill rules, current task conditions, observed environment facts, and unknown scope. Do not promote a task or environment value to a skill-wide rule.
- \`.optimize/IMPLEMENTATION_CONTEXT.json\` — engine-built source interfaces, normalized input/output locators, observed format shapes, and available checks for executable work. It is an index, not a claim that untested parameters are supported.
${historyCount > 0 ? `- \`.optimize/history.md\` — **${historyCount} previous optimization round(s)** with their diagnoses, changes, and whether they improved the score. READ THIS before proposing changes — do not repeat diagnoses that did not work.\n` : ""}- \`.optimize/submission.template.json\` — the output format you must follow.

## What to do

1. Read \`PER_TASK_SUMMARY.md\`. Identify FAILING/MARGINAL defects, UNASSESSED
   trace facts, and PASSING evidence. Passing work must not regress, but it may
   still reveal repeated transformations or avoidable verification work.
2. Read the relevant \`tasks/<safeTaskId>/summary.md\` and \`run-N.md\` files
   in that order: failing first, marginal next, unassessed next, passing last.
   Read each External Trace Binding before deciding what the record can prove.
3. Read the relevant parts of this skill folder (SKILL.md is the entry point).
4. Edit files in this workspace to fix the root cause.
5. When done, write \`.optimize/submission.json\` with your structured summary
   (see \`submission.template.json\`).

## Candidate attempt versus recommendation

The workspace diff and action list describe a **candidate attempt**. A
**recommendation** is only justified after the engine can run the declared
checks and preserve the residual duties; a high quality score or an agent's
self-check is not enough by itself. A missing score is evidence-thin, not a
failure and not a reason to skip the optimizer.

An opportunity may be useful even when the source task passed. Consider
bounded reductions in repeated file I/O, tool discovery, or transformations,
existing-script reuse, parameterized processing, and deterministic checks.
For a localizable example, a source rule plus locale files can establish a
local key-set/placeholder boundary without claiming to automate translation
quality. Do not dismiss that opportunity solely because there was no defect,
the whole skill is broader, or a regression is conceivable.

Each opportunity summary should compactly state the delegated steps, variable
parameters, required resources, check source, and the specific reason for its
\`implemented\`, \`retained\`, or \`not-applicable\` disposition. Put duties that
remain with the agent in \`residualDuty\`. If an opportunity is marked
\`implemented\`, the submission must also name a corresponding changed file,
change summary, or valid action; otherwise the engine records an explicit
diagnostic and does not treat the round as no-change.

## Rules

- **Task-content-agnostic**: the skill is used for MANY different tasks. Do
  NOT hard-code specific values, file names, or examples from the evidence
  into the skill. Fixes must generalize.
- **No task trade-off**: a fix that improves a FAILING task by regressing a
  PASSING task is NOT an improvement. The selection engine's per-task gate
  will reject the round. Before each edit, check \`PER_TASK_SUMMARY.md\` and
  ask "could this plausibly lower any PASSING task's score?" If yes, stop.
- **Preserve scope**: do not narrow the skill's capabilities to "just pass
  these tasks". You are fixing a tool, not overfitting to a test set.
- **Keep it concise**: every instruction the agent reads costs tokens and
  attention. Prefer trimming to adding.
- **Diagnose before prescribing**: the \`rootCause\` field in your submission
  is the *underlying problem you identified*, not a list of what you changed.
  Example of a bad rootCause: "Added a guardrail for empty input."
  Example of a good rootCause: "The skill tells the agent to call validate()
  but doesn't say what to do when validate() returns null, so the agent
  guessed wrong 5/5 times."

## If the skill is fine

If the evidence shows the skill is already working and no changes would help,
write \`{"noChanges": true}\` to submission.json and don't edit anything.

## If the evidence is infra-broken

Each \`run-N.md\` has a **Run Metadata** block whose first line is
\`runStatus: <value>\`. When that value is anything other than \`ok\` (e.g.
\`timeout\`, \`adapter-crashed\`, \`parse-failed\`, \`tainted\`), the run did not
execute normally: the agent subprocess was killed, crashed, or produced
unparseable output. The evaluator was NOT run against those runs — any
criteria you see on them are stubs carrying \`infraError\`, not real
evaluations.

If at least one run has \`runStatus !== 'ok'\` AND the remaining clean
evidence (if any) is insufficient to support a skill-level root cause, write:

\`\`\`json
{
  "infraBlocked": true,
  "blockedEvidenceIds": ["0", "2"],
  "blockedReason": "Runs with Evidence Index 0 and 2 both show runStatus=timeout with tokens=0; no LLM output was produced. The remaining clean runs are insufficient for a skill-level diagnosis."
}
\`\`\`

\`blockedEvidenceIds\` uses the **Evidence Indices** column in
\`PER_TASK_SUMMARY.md\` — the flat 0..N-1 numbering, independent of the
per-task directory layout.

\`infraBlocked\` and \`noChanges\` are mutually exclusive. \`noChanges\` says
"the skill is fine"; \`infraBlocked\` says "I cannot judge the skill from this
evidence." Pick the one that matches what you actually observed. Do not edit
any files when submitting \`infraBlocked\`.
`
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

export interface WorkspaceDiff {
  added: string[]
  modified: string[]
  removed: string[]
}

/** Compute file-level diff between a workspace and the original skill directory. */
export async function computeDiff(workspaceDir: string, originalDir: string): Promise<WorkspaceDiff> {
  const wsFiles = new Map<string, string>()
  for await (const { rel, abs } of walkFiles(workspaceDir)) {
    if (rel.startsWith(".optimize/") || rel === ".optimize") continue
    try {
      wsFiles.set(rel, await Bun.file(abs).text())
    } catch {
      // unreadable → skip
    }
  }

  const origFiles = new Map<string, string>()
  for await (const { rel, abs } of walkFiles(originalDir)) {
    try {
      origFiles.set(rel, await Bun.file(abs).text())
    } catch {
      // unreadable → skip
    }
  }

  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []

  for (const [rel, content] of wsFiles) {
    const orig = origFiles.get(rel)
    if (orig === undefined) {
      added.push(rel)
    } else if (orig !== content) {
      modified.push(rel)
    }
  }
  for (const rel of origFiles.keys()) {
    if (!wsFiles.has(rel)) removed.push(rel)
  }

  return { added, modified, removed }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Remove the .optimize/ scratch directory so the workspace contains only skill files. */
export async function stripOptimizeDir(workspaceDir: string): Promise<void> {
  await rm(path.join(workspaceDir, ".optimize"), { recursive: true, force: true })
}

export async function removeWorkspace(workspaceDir: string): Promise<void> {
  await rm(workspaceDir, { recursive: true, force: true })
}

/** Check whether a path exists. */
export async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}
