import { createHash } from "node:crypto"
import { lstat, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { ZodError } from "zod"
import { composeAuthorizationAuthoring } from "../authoring-compose.ts"
import type { AuthorizationAuthoringInputV2 } from "../authoring-v2.ts"
import { loadLocalAuthorizationInputValue } from "../local-input.ts"
import { AuthorizationReplacementsSchema, AuthorizationWorkspaceSchema } from "./schema.ts"

export interface WorkspaceDiagnostic {
  code: string
  field: string
  message: string
  file?: string
  variantId?: string
  fix?: string
}
export interface WorkspaceProvenance {
  schemaVersion: "authorization-scenario-provenance/v1"
  variantId: string
  workspaceFile: string
  workspaceSha256: string
  baseFile: string
  baseFileSha256: string
  baseSha256: string
  replacementsFile: string
  replacementsSha256: string
  changedFields: string[]
  fieldOrigins: Record<string, string>
  sourceRoot: { authored: string; relativeToFile: string; effective: string; generated: string; reason: string }
  semanticClaim: "none; provenance only"
}
export interface WorkspaceVariantPlan {
  id: string
  inputPath: string
  provenancePath: string
  input: AuthorizationAuthoringInputV2
  provenance: WorkspaceProvenance
}
export interface AuthorizationWorkspacePlan {
  schemaVersion: "authorization-scenario-workspace-plan/v1"
  status: "valid" | "invalid"
  workspaceFile: string
  outDir: string
  variants: WorkspaceVariantPlan[]
  diagnostics: WorkspaceDiagnostic[]
}
const sha256 = (bytes: string) => createHash("sha256").update(bytes).digest("hex")
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

function errors(error: unknown, field: string, file: string, variantId?: string): WorkspaceDiagnostic[] {
  const context = { file, ...(variantId ? { variantId } : {}) }
  if (error instanceof ZodError) return error.issues.map(issue => ({ ...context, code: "workspace-schema-invalid", field: issue.path.join(".") || field, message: issue.message }))
  const composerField = /^(?:Unsupported|Duplicate) replacement: (.+)$/.exec(message(error))?.[1]
  return [{ ...context, code: "workspace-input-invalid", field: composerField ?? field, message: message(error) }]
}

/** Read-only planning. Coordinates come from the files, never the invocation cwd. */
export async function planAuthorizationWorkspace(workspaceFile: string, outDir: string): Promise<AuthorizationWorkspacePlan> {
  const result: AuthorizationWorkspacePlan = { schemaVersion: "authorization-scenario-workspace-plan/v1", status: "invalid", workspaceFile: path.resolve(workspaceFile), outDir: path.resolve(outDir), variants: [], diagnostics: [] }
  let field = "$workspace", file = result.workspaceFile
  try {
    const workspaceBytes = await readFile(file, "utf8")
    const config = AuthorizationWorkspaceSchema.parse(JSON.parse(workspaceBytes))
    field = "base"; file = path.resolve(path.dirname(result.workspaceFile), config.base)
    const baseFile = file, baseBytes = await readFile(baseFile, "utf8"), base: unknown = JSON.parse(baseBytes)
    // Validate once even when every variant is malformed. Composition still owns replacement semantics.
    composeAuthorizationAuthoring(base, [])
    for (const variant of config.variants) {
      const replacementsFile = path.resolve(path.dirname(result.workspaceFile), variant.replacements)
      try {
        const replacementsBytes = await readFile(replacementsFile, "utf8")
        const replacements = AuthorizationReplacementsSchema.parse(JSON.parse(replacementsBytes))
        const composed = composeAuthorizationAuthoring(base, replacements.map(replacement => ({ ...replacement, value: replacement.value })))
        const authoredRoot = composed.input.sourceRoot
        const relativeToFile = replacements.some(replacement => replacement.field === "sourceRoot") ? result.workspaceFile : baseFile
        if (authoredRoot.includes("\\") || path.posix.isAbsolute(authoredRoot) || path.win32.isAbsolute(authoredRoot) || /^[A-Za-z]:/.test(authoredRoot)) {
          result.diagnostics.push({ code: "workspace-source-root-invalid", variantId: variant.id, file: relativeToFile, field: "sourceRoot", message: "sourceRoot must use a relative path with forward slashes." })
          continue
        }
        const effective = path.resolve(path.dirname(relativeToFile), authoredRoot)
        const generated = path.relative(result.outDir, effective).split(path.sep).join("/") || "."
        if (path.isAbsolute(generated) || path.win32.isAbsolute(generated)) {
          result.diagnostics.push({ code: "workspace-source-root-cross-volume", variantId: variant.id, file: relativeToFile, field: "sourceRoot", message: "Output and sourceRoot must be on the same filesystem volume for relative relocation." })
          continue
        }
        const input = { ...composed.input, sourceRoot: generated }
        const inputPath = path.join(result.outDir, `${variant.id}.json`)
        // Validate at the authored coordinate first: relocation must not widen the
        // original sourceRoot junction boundary merely by selecting a different out directory.
        const checked = await loadLocalAuthorizationInputValue(composed.input, relativeToFile)
        if (checked.status === "invalid") result.diagnostics.push(...checked.diagnostics.map(diagnostic => ({ code: diagnostic.code, field: diagnostic.path ?? "$", message: diagnostic.message, variantId: variant.id, file: inputPath, ...("fix" in diagnostic && typeof diagnostic.fix === "string" ? { fix: diagnostic.fix } : {}) })))
        result.variants.push({ id: variant.id, inputPath, provenancePath: path.join(result.outDir, `${variant.id}.provenance.json`), input,
          provenance: { schemaVersion: "authorization-scenario-provenance/v1", variantId: variant.id, workspaceFile: result.workspaceFile, workspaceSha256: sha256(workspaceBytes), baseFile, baseFileSha256: sha256(baseBytes), baseSha256: composed.baseSha256, replacementsFile, replacementsSha256: sha256(replacementsBytes), changedFields: replacements.map(replacement => replacement.field), fieldOrigins: composed.fieldOrigins, sourceRoot: { authored: authoredRoot, relativeToFile, effective, generated, reason: "Mechanical coordinate relocation; policy and task semantics unchanged." }, semanticClaim: "none; provenance only" },
        })
      } catch (error) { result.diagnostics.push(...errors(error, "replacements", replacementsFile, variant.id)) }
    }
    try {
      await lstat(result.outDir)
      result.diagnostics.push({ code: "workspace-output-exists", field: "$out", file: result.outDir, message: "Output already exists; choose a new directory. Existing files, directories and links are never overwritten." })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.diagnostics.push(...errors(error, "$out", result.outDir)) }
    try {
      if (!(await stat(path.dirname(result.outDir))).isDirectory()) throw new Error("Output parent must be an existing directory.")
    } catch (error) { result.diagnostics.push(...errors(error, "$out.parent", path.dirname(result.outDir))) }
  } catch (error) { result.diagnostics.push(...errors(error, field, file)) }
  result.status = result.diagnostics.length ? "invalid" : "valid"
  return result
}
