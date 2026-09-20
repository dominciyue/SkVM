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
  return bundle.files.map(file => {
    const provenance = file.originalLocations.length > 0
      ? file.originalLocations.join(", ")
      : "not separately supplied"
    return [
      `===== BEGIN ALLOWED INPUT: ${file.relativePath} =====`,
      `Location note: crop lines ${file.cropRange.startLine}-${file.cropRange.endLine}; original locations: ${provenance}`,
      file.content,
      `===== END ALLOWED INPUT: ${file.relativePath} =====`,
    ].join("\n")
  }).join("\n\n")
}
