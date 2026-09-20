import { createHash } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

export interface SourceBundleFile {
  relativePath: string
  content: string
  sha256: string
  cropRange: {
    startLine: number
    endLine: number
  }
  originalLocations: string[]
}

export interface SourceBundle {
  repository: string
  sourceRef: string
  sourceMode: "fixed-context"
  isolation: "exact-allowlist"
  files: SourceBundleFile[]
}

export interface AuthorizationSourceCatalogEntry {
  sourceId: string
  relativePath: string
  sha256: string
  cropRange: SourceBundleFile["cropRange"]
  originalLocations: string[]
  lines: Array<{ lineNumber: number; text: string }>
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
  code: "unsafe-input-path" | "missing-input" | "symlink-escape" | "not-a-file" | "input-read-failed"
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

export type LoadExactSourceBundleResult =
  | { success: true; bundle: SourceBundle; diagnostics: [] }
  | { success: false; diagnostics: SourceInputDiagnostic[] }

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
  const identity = [bundle.repository, bundle.sourceRef, file.relativePath, file.sha256].join("\0")
  return `src-${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16)}`
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
      || file.cropRange.endLine !== expectedEndLine
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
      lines: lines.map((text, lineIndex) => ({
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

  const startOffset = reference.startLine - source.cropRange.startLine
  const endOffset = reference.endLine - source.cropRange.startLine + 1
  return {
    success: true,
    diagnostics: [],
    citation: {
      path: source.relativePath,
      startLine: reference.startLine,
      endLine: reference.endLine,
      quote: source.lines.slice(startOffset, endOffset).map(line => line.text).join("\n"),
    },
  }
}

function diagnostic(
  code: SourceInputDiagnostic["code"],
  index: number,
  message: string,
): SourceInputDiagnostic {
  return { code, path: `allowedInputFiles.${index}`, message }
}

export async function loadExactSourceBundle(
  options: LoadExactSourceBundleOptions,
): Promise<LoadExactSourceBundleResult> {
  const diagnostics: SourceInputDiagnostic[] = []
  const files: SourceBundleFile[] = []
  const canonicalRoot = await realpath(options.caseRoot)

  for (const [index, relativePath] of options.allowedInputFiles.entries()) {
    if (!isPortableRelativeInputPath(relativePath)) {
      diagnostics.push(diagnostic(
        "unsafe-input-path",
        index,
        `Allowed input must be a portable path beneath inputs/: ${relativePath}`,
      ))
      continue
    }

    const candidate = path.resolve(canonicalRoot, ...relativePath.split("/"))
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
          ? `Allowlisted input does not exist: ${relativePath}`
          : `Could not resolve allowlisted input ${relativePath}: ${String(error)}`,
      ))
      continue
    }

    if (!isWithinRoot(canonicalRoot, canonicalCandidate)) {
      diagnostics.push(diagnostic(
        "symlink-escape",
        index,
        `Allowlisted input resolves outside the case root: ${relativePath}`,
      ))
      continue
    }

    const fileStats = await stat(canonicalCandidate)
    if (!fileStats.isFile()) {
      diagnostics.push(diagnostic("not-a-file", index, `Allowlisted input is not a file: ${relativePath}`))
      continue
    }

    try {
      const content = await readFile(canonicalCandidate, "utf8")
      files.push({
        relativePath,
        content,
        sha256: createHash("sha256").update(content, "utf8").digest("hex"),
        cropRange: { startLine: 1, endLine: countLines(content) },
        originalLocations: [...(options.originalLocationsByFile?.[relativePath] ?? [])],
      })
    } catch (error) {
      diagnostics.push(diagnostic(
        "input-read-failed",
        index,
        `Could not read allowlisted input ${relativePath} as UTF-8: ${String(error)}`,
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

export function renderSourceBundle(bundle: SourceBundle): string {
  const built = buildAuthorizationSourceCatalog(bundle)
  if (!built.success) {
    throw new Error(`Invalid authorization source bundle: ${built.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`)
  }
  return built.catalog.sources.map(source => {
    const provenance = source.originalLocations.length > 0
      ? source.originalLocations.join(", ")
      : "not separately supplied"
    return [
      `===== BEGIN ALLOWED INPUT: ${source.relativePath} =====`,
      `Source ID: ${source.sourceId}`,
      `Location note: crop lines ${source.cropRange.startLine}-${source.cropRange.endLine}; original locations: ${provenance}`,
      "Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.",
      source.lines.map(line => `${line.lineNumber} | ${line.text}`).join("\n"),
      `===== END ALLOWED INPUT: ${source.relativePath} =====`,
    ].join("\n")
  }).join("\n\n")
}
