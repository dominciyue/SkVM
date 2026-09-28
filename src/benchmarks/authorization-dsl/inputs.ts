import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import type { AuthorizationEvidenceReport, PreparedSourceSegment } from "./evidence-preparation/schema.ts"
import { containsOriginalRange, validateSourceSegments } from "./evidence-preparation/segments.ts"

export interface SourceBundleFile {
  relativePath: string
  content: string
  sha256: string
  cropRange: {
    startLine: number
    endLine: number
  }
  originalLocations: string[]
  segments?: PreparedSourceSegment[]
}

export interface SourceBundle {
  repository: string
  sourceRef: string
  sourceMode: "fixed-context"
  isolation: "exact-allowlist"
  files: SourceBundleFile[]
  evidencePreparation?: AuthorizationEvidenceReport
}

export interface AuthorizationSourceCatalogEntry {
  sourceId: string
  relativePath: string
  sha256: string
  cropRange: SourceBundleFile["cropRange"]
  originalLocations: string[]
  lines: Array<{ lineNumber: number; text: string }>
  segments?: PreparedSourceSegment[]
}

export interface AuthorizationSourceCatalog {
  schemaVersion: "authorization-source-catalog/v1"
  repository: string
  sourceRef: string
  sources: AuthorizationSourceCatalogEntry[]
}

export interface AuthorizationSourceDiagnostic {
  code:
    | "duplicate-source-path"
    | "duplicate-source-id"
    | "source-content-digest-mismatch"
    | "source-crop-range-mismatch"
    | "unknown-source-id"
    | "citation-out-of-range"
  message: string
  path: string
}

export type BuildAuthorizationSourceCatalogResult =
  | { success: true; catalog: AuthorizationSourceCatalog; diagnostics: [] }
  | { success: false; diagnostics: AuthorizationSourceDiagnostic[] }

export interface AuthorizationSourceReference {
  sourceId: string
  startLine: number
  endLine: number
}

export interface ResolvedAuthorizationCitation {
  path: string
  startLine: number
  endLine: number
  quote: string
}

export type ResolveAuthorizationSourceCitationResult =
  | { success: true; citation: ResolvedAuthorizationCitation; diagnostics: [] }
  | { success: false; diagnostics: AuthorizationSourceDiagnostic[] }

export interface SourceInputDiagnostic {
  code:
    | "unsafe-input-path"
    | "duplicate-source-path"
    | "missing-input"
    | "missing-root"
    | "root-not-directory"
    | "root-read-failed"
    | "symlink-escape"
    | "not-a-file"
    | "input-read-failed"
    | "input-byte-budget"
  message: string
  path: string
}

export interface LoadExactSourceBundleOptions {
  caseRoot: string
  repository: string
  sourceRef: string
  allowedInputFiles: string[]
  originalLocationsByFile?: Record<string, string[]>
}

export interface LoadPortableSourceBundleOptions {
  sourceRoot: string
  repository: string
  sourceRef: string
  sourceFiles: string[]
  originalLocationsByFile?: Record<string, string[]>
  maxBytes?: number
}

export type LoadExactSourceBundleResult =
  | { success: true; bundle: SourceBundle; diagnostics: [] }
  | { success: false; diagnostics: SourceInputDiagnostic[] }

function normalizePortableRelativePath(value: string): string | undefined {
  if (value.length === 0 || value.includes("\\")) return undefined
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return undefined
  const normalized = path.posix.normalize(value)
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined
  if (normalized.split("/").some(segment => segment === "" || segment === "..")) return undefined
  return normalized
}

function isPortableRelativeInputPath(value: string): boolean {
  if (value.length === 0 || value.includes("\\")) return false
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return false
  const segments = value.split("/")
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) return false
  return segments[0] === "inputs"
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function countLines(content: string): number {
  if (content.length === 0) return 0
  const withoutTerminalDelimiter = content.replace(/\r?\n$/, "")
  return withoutTerminalDelimiter.split(/\r?\n/).length
}

function sourceLines(content: string): string[] {
  if (content.length === 0) return []
  return content.replace(/\r?\n$/, "").split(/\r?\n/)
}

function authorizationSourceId(bundle: SourceBundle, file: SourceBundleFile): string {
  const identity = [bundle.repository, bundle.sourceRef, file.relativePath, file.sha256, ...(file.segments ? [JSON.stringify(file.segments)] : [])].join("\0")
  return `src-${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16)}`
}

/** Original coordinates for mapped snapshots; legacy continuous files retain their existing crop coordinates. */
export function sourceRangeText(file: SourceBundleFile, startLine: number, endLine: number): string | undefined {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || endLine < startLine) return undefined
  const lines = sourceLines(file.content)
  if (file.segments) {
    const segment = file.segments.find(item => containsOriginalRange([item], startLine, endLine))
    if (!segment) return undefined
    const offset = segment.snapshotStartLine - 1 + startLine - segment.originalStartLine
    return lines.slice(offset, offset + endLine - startLine + 1).join("\n")
  }
  if (startLine < file.cropRange.startLine || endLine > file.cropRange.endLine) return undefined
  return lines.slice(startLine - file.cropRange.startLine, endLine - file.cropRange.startLine + 1).join("\n")
}

function sourceDiagnostic(
  code: AuthorizationSourceDiagnostic["code"],
  pathValue: string,
  message: string,
): AuthorizationSourceDiagnostic {
  return { code, path: pathValue, message }
}

export function buildAuthorizationSourceCatalog(bundle: SourceBundle): BuildAuthorizationSourceCatalogResult {
  const diagnostics: AuthorizationSourceDiagnostic[] = []
  const seenPaths = new Set<string>()
  const seenIds = new Set<string>()
  const sources: AuthorizationSourceCatalogEntry[] = []

  bundle.files.forEach((file, index) => {
    const diagnosticPath = `files.${index}`
    if (seenPaths.has(file.relativePath)) {
      diagnostics.push(sourceDiagnostic(
        "duplicate-source-path",
        `${diagnosticPath}.relativePath`,
        `Source bundle repeats path ${file.relativePath}.`,
      ))
      return
    }
    seenPaths.add(file.relativePath)

    const actualDigest = createHash("sha256").update(file.content, "utf8").digest("hex")
    if (actualDigest !== file.sha256) {
      diagnostics.push(sourceDiagnostic(
        "source-content-digest-mismatch",
        `${diagnosticPath}.sha256`,
        `Source bytes for ${file.relativePath} do not match the retained SHA-256.`,
      ))
      return
    }
    const lines = sourceLines(file.content)
    const expectedEndLine = file.cropRange.startLine + lines.length - 1
    if (
      !Number.isInteger(file.cropRange.startLine)
      || file.cropRange.startLine < 1
      || (file.segments ? validateSourceSegments(file.content, file.segments).length > 0
        || file.cropRange.startLine !== file.segments[0]?.originalStartLine
        || file.cropRange.endLine !== file.segments.at(-1)?.originalEndLine : file.cropRange.endLine !== expectedEndLine)
    ) {
      diagnostics.push(sourceDiagnostic(
        "source-crop-range-mismatch",
        `${diagnosticPath}.cropRange`,
        `Crop ${file.cropRange.startLine}-${file.cropRange.endLine} does not label the ${lines.length} retained lines for ${file.relativePath}.`,
      ))
      return
    }

    const sourceId = authorizationSourceId(bundle, file)
    if (seenIds.has(sourceId)) {
      diagnostics.push(sourceDiagnostic(
        "duplicate-source-id",
        diagnosticPath,
        `Source ID collision for ${file.relativePath}: ${sourceId}.`,
      ))
      return
    }
    seenIds.add(sourceId)
    sources.push({
      sourceId,
      relativePath: file.relativePath,
      sha256: file.sha256,
      cropRange: { ...file.cropRange },
      originalLocations: [...file.originalLocations],
      ...(file.segments ? { segments: structuredClone(file.segments) } : {}),
      lines: file.segments ? file.segments.flatMap(segment => lines.slice(segment.snapshotStartLine - 1, segment.snapshotEndLine).map((text, i) => ({ lineNumber: segment.originalStartLine + i, text }))) : lines.map((text, lineIndex) => ({
        lineNumber: file.cropRange.startLine + lineIndex,
        text,
      })),
    })
  })

  if (diagnostics.length > 0) return { success: false, diagnostics }
  return {
    success: true,
    diagnostics: [],
    catalog: {
      schemaVersion: "authorization-source-catalog/v1",
      repository: bundle.repository,
      sourceRef: bundle.sourceRef,
      sources: sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    },
  }
}

export function resolveAuthorizationSourceCitation(
  catalog: AuthorizationSourceCatalog,
  reference: AuthorizationSourceReference,
): ResolveAuthorizationSourceCitationResult {
  const source = catalog.sources.find(candidate => candidate.sourceId === reference.sourceId)
  if (!source) {
    return {
      success: false,
      diagnostics: [sourceDiagnostic(
        "unknown-source-id",
        "sourceId",
        `Citation source ID is not in the exact source catalog for ${catalog.sourceRef}: ${reference.sourceId}.`,
      )],
    }
  }
  if (
    !Number.isInteger(reference.startLine)
    || !Number.isInteger(reference.endLine)
    || reference.startLine < source.cropRange.startLine
    || reference.endLine > source.cropRange.endLine
    || reference.endLine < reference.startLine
    || (source.segments && !containsOriginalRange(source.segments, reference.startLine, reference.endLine))
  ) {
    return {
      success: false,
      diagnostics: [sourceDiagnostic(
        "citation-out-of-range",
        `${reference.sourceId}:${reference.startLine}-${reference.endLine}`,
        `Citation range ${reference.startLine}-${reference.endLine} is outside source ${reference.sourceId} crop ${source.cropRange.startLine}-${source.cropRange.endLine}; a citation cannot cross sources.`,
      )],
    }
  }

  return {
    success: true,
    diagnostics: [],
    citation: {
      path: source.relativePath,
      startLine: reference.startLine,
      endLine: reference.endLine,
      quote: source.lines.filter(line => line.lineNumber >= reference.startLine && line.lineNumber <= reference.endLine).map(line => line.text).join("\n"),
    },
  }
}

function diagnostic(
  code: SourceInputDiagnostic["code"],
  index: number,
  message: string,
  collection = "allowedInputFiles",
): SourceInputDiagnostic {
  return { code, path: `${collection}.${index}`, message }
}

async function loadSourceBundleFromRoot(options: {
  root: string
  repository: string
  sourceRef: string
  files: string[]
  collection: "allowedInputFiles" | "sources"
  inputsOnly: boolean
  originalLocationsByFile?: Record<string, string[]>
  maxBytes?: number
}): Promise<LoadExactSourceBundleResult> {
  const diagnostics: SourceInputDiagnostic[] = []
  const files: SourceBundleFile[] = []
  let readBytes = 0
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(options.root)
    const rootStats = await stat(canonicalRoot)
    if (!rootStats.isDirectory()) {
      return {
        success: false,
        diagnostics: [{
          code: "root-not-directory",
          path: options.collection === "sources" ? "sourceRoot" : "caseRoot",
          message: `Source root is not a directory: ${options.root}`,
        }],
      }
    }
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : ""
    return {
      success: false,
      diagnostics: [{
        code: code === "ENOENT" ? "missing-root" : "root-read-failed",
        path: options.collection === "sources" ? "sourceRoot" : "caseRoot",
        message: code === "ENOENT"
          ? `Source root does not exist: ${options.root}`
          : `Could not resolve source root ${options.root}: ${String(error)}`,
      }],
    }
  }

  const seenRelativePaths = new Set<string>()
  const seenCanonicalTargets = new Set<string>()

  for (const [index, sourcePath] of options.files.entries()) {
    const normalizedPath = normalizePortableRelativePath(sourcePath)
    if (!normalizedPath || (options.inputsOnly && !isPortableRelativeInputPath(sourcePath))) {
      diagnostics.push(diagnostic(
        "unsafe-input-path",
        index,
        options.inputsOnly
          ? `Allowed input must be a portable path beneath inputs/: ${sourcePath}`
          : `Source must be a portable path beneath sourceRoot: ${sourcePath}`,
        options.collection,
      ))
      continue
    }

    const normalizedIdentity = normalizedPath.normalize("NFC")
    const portableIdentity = process.platform === "win32"
      ? normalizedIdentity.toLocaleLowerCase("en-US")
      : normalizedIdentity
    if (seenRelativePaths.has(portableIdentity)) {
      diagnostics.push(diagnostic(
        "duplicate-source-path",
        index,
        `Source path normalizes to an already listed path: ${sourcePath} -> ${normalizedPath}`,
        options.collection,
      ))
      continue
    }
    seenRelativePaths.add(portableIdentity)

    const candidate = path.resolve(canonicalRoot, ...normalizedPath.split("/"))
    let canonicalCandidate: string
    try {
      canonicalCandidate = await realpath(candidate)
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : ""
      diagnostics.push(diagnostic(
        code === "ENOENT" ? "missing-input" : "input-read-failed",
        index,
        code === "ENOENT"
          ? `Allowlisted input does not exist: ${normalizedPath}`
          : `Could not resolve allowlisted input ${normalizedPath}: ${String(error)}`,
        options.collection,
      ))
      continue
    }

    if (!isWithinRoot(canonicalRoot, canonicalCandidate)) {
      diagnostics.push(diagnostic(
        "symlink-escape",
        index,
        `Allowlisted input resolves outside the source root: ${normalizedPath}`,
        options.collection,
      ))
      continue
    }

    const normalizedCanonicalIdentity = canonicalCandidate.normalize("NFC")
    const canonicalIdentity = process.platform === "win32"
      ? normalizedCanonicalIdentity.toLocaleLowerCase("en-US")
      : normalizedCanonicalIdentity
    if (seenCanonicalTargets.has(canonicalIdentity)) {
      diagnostics.push(diagnostic(
        "duplicate-source-path",
        index,
        `Source resolves to a file already listed by another path: ${normalizedPath}`,
        options.collection,
      ))
      continue
    }
    seenCanonicalTargets.add(canonicalIdentity)

    let fileStats
    try {
      fileStats = await stat(canonicalCandidate)
    } catch (error) {
      diagnostics.push(diagnostic(
        "input-read-failed",
        index,
        `Could not inspect allowlisted input ${normalizedPath}: ${String(error)}`,
        options.collection,
      ))
      continue
    }
    if (!fileStats.isFile()) {
      diagnostics.push(diagnostic(
        "not-a-file",
        index,
        `Allowlisted input is not a file: ${normalizedPath}`,
        options.collection,
      ))
      continue
    }

    if (options.maxBytes !== undefined && fileStats.size > options.maxBytes - readBytes) {
      diagnostics.push(diagnostic("input-byte-budget", index, `Allowlisted source exceeds the remaining read budget: ${normalizedPath}`, options.collection))
      continue
    }

    try {
      const content = await readFile(canonicalCandidate, "utf8")
      const contentBytes = Buffer.byteLength(content, "utf8")
      if (options.maxBytes !== undefined && contentBytes > options.maxBytes - readBytes) {
        diagnostics.push(diagnostic("input-byte-budget", index, `Source grew beyond the read budget: ${normalizedPath}`, options.collection))
        continue
      }
      readBytes += contentBytes
      files.push({
        relativePath: normalizedPath,
        content,
        sha256: createHash("sha256").update(content, "utf8").digest("hex"),
        cropRange: { startLine: 1, endLine: countLines(content) },
        originalLocations: [...(
          options.originalLocationsByFile?.[sourcePath]
          ?? options.originalLocationsByFile?.[normalizedPath]
          ?? []
        )],
      })
    } catch (error) {
      diagnostics.push(diagnostic(
        "input-read-failed",
        index,
        `Could not read allowlisted input ${normalizedPath} as UTF-8: ${String(error)}`,
        options.collection,
      ))
    }
  }

  if (diagnostics.length > 0) return { success: false, diagnostics }

  return {
    success: true,
    diagnostics: [],
    bundle: {
      repository: options.repository,
      sourceRef: options.sourceRef,
      sourceMode: "fixed-context",
      isolation: "exact-allowlist",
      files,
    },
  }
}

export async function loadExactSourceBundle(
  options: LoadExactSourceBundleOptions,
): Promise<LoadExactSourceBundleResult> {
  return loadSourceBundleFromRoot({
    root: options.caseRoot,
    repository: options.repository,
    sourceRef: options.sourceRef,
    files: options.allowedInputFiles,
    collection: "allowedInputFiles",
    inputsOnly: true,
    ...(options.originalLocationsByFile
      ? { originalLocationsByFile: options.originalLocationsByFile }
      : {}),
  })
}

export async function loadPortableSourceBundle(
  options: LoadPortableSourceBundleOptions,
): Promise<LoadExactSourceBundleResult> {
  return loadSourceBundleFromRoot({
    root: options.sourceRoot,
    repository: options.repository,
    sourceRef: options.sourceRef,
    files: options.sourceFiles,
    collection: "sources",
    inputsOnly: false,
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.originalLocationsByFile
      ? { originalLocationsByFile: options.originalLocationsByFile }
      : {}),
  })
}

export function renderSourceBundle(bundle: SourceBundle): string {
  const built = buildAuthorizationSourceCatalog(bundle)
  if (!built.success) {
    throw new Error(`Invalid authorization source bundle: ${built.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`)
  }
  const sourceText = built.catalog.sources.map(source => {
    const provenance = source.originalLocations.length > 0
      ? source.originalLocations.join(", ")
      : "not separately supplied"
    return [
      `===== BEGIN ALLOWED INPUT: ${source.relativePath} =====`,
      `Source ID: ${source.sourceId}`,
      `Location note: crop lines ${source.cropRange.startLine}-${source.cropRange.endLine}; original locations: ${provenance}`,
      source.segments ? "Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources." : "Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.",
      source.lines.map((line, i) => `${i > 0 && line.lineNumber > source.lines[i - 1]!.lineNumber + 1 ? `[OMITTED original lines ${source.lines[i - 1]!.lineNumber + 1}-${line.lineNumber - 1}]\n` : ""}${line.lineNumber} | ${line.text}`).join("\n"),
      `===== END ALLOWED INPUT: ${source.relativePath} =====`,
    ].join("\n")
  }).join("\n\n")
  if (!bundle.evidencePreparation) return sourceText
  const report = bundle.evidencePreparation
  return [
    `Preparation status: ${report.status}`,
    `Closure claim: ${report.closureClaim}`,
    `Prepared from: ${report.sourceIdentity.repository}@${report.sourceIdentity.sourceRef}; root ${report.sourceRoot}`,
    `Included original ranges: ${report.included.flatMap(item => "segments" in item ? item.segments.map(segment => `${item.originalPath}:${segment.originalStartLine}-${segment.originalEndLine} [${segment.origins.join(", ")}]`) : [`${item.originalPath}:${item.startLine}-${item.endLine} [${item.origins.join(", ")}]`]).join("; ")}`,
    `Unresolved gaps: ${report.gaps.length === 0 ? "none" : report.gaps.map(gap => `${gap.id}: ${gap.reason}${gap.attemptedPath ? ` (${gap.attemptedPath})` : ""}`).join("; ")}`,
    sourceText,
  ].join("\n\n")
}
