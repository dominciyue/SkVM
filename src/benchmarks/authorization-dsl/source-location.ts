import { loadPortableSourceBundle } from "./inputs.ts"

export interface AuthorizationSourceLocationReport {
  schemaVersion: "authorization-source-location/v1"
  status: "zero" | "unique" | "multiple" | "invalid"
  path: string
  lineNumberBasis: "current-provided-file"
  lineCount: number
  totalMatches: number
  truncated: boolean
  matches: Array<{line: number; text: string; context: Array<{line: number; text: string}>}>
  diagnostics: Array<{code: string; path: string; message: string}>
}

/** Read one explicit file. Matching is literal; no symbol or entry inference occurs. */
export async function locateAuthorizationSource(input: {
  root: string; file: string; match: string; limit?: number
}): Promise<AuthorizationSourceLocationReport> {
  const report: AuthorizationSourceLocationReport = {
    schemaVersion: "authorization-source-location/v1", status: "invalid", path: input.file,
    lineNumberBasis: "current-provided-file", lineCount: 0, totalMatches: 0,
    truncated: false, matches: [], diagnostics: [],
  }
  const limit = input.limit ?? 20
  if (!input.match || input.match.includes("\0") || input.file.includes("\0") || input.root.includes("\0")
      || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    report.diagnostics.push({code:"invalid-location-input",path:"locate",message:"Provide a nonempty literal match, NUL-free paths, and integer limit 1-1000."})
    return report
  }
  const loaded = await loadPortableSourceBundle({
    sourceRoot: input.root, sourceFiles: [input.file], repository: "local-location", sourceRef: "current-file",
  })
  if (!loaded.success) return {...report, diagnostics: loaded.diagnostics}
  const file = loaded.bundle.files[0]!
  const lines = file.content ? file.content.replace(/\r?\n$/, "").split(/\r?\n/) : []
  const matching = lines.flatMap((text, index) => text.includes(input.match) ? [index] : [])
  return {
    ...report, path: file.relativePath, lineCount: lines.length, totalMatches: matching.length,
    status: matching.length === 0 ? "zero" : matching.length === 1 ? "unique" : "multiple",
    truncated: matching.length > limit,
    matches: matching.slice(0, limit).map(index => ({
      line: index + 1, text: lines[index]!,
      context: lines.slice(Math.max(0, index - 2), index + 3).map((text, offset) => ({line: Math.max(0,index - 2) + offset + 1, text})),
    })),
  }
}
