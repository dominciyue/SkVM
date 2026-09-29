import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import Ajv, { type ValidateFunction } from "ajv"

const schemaUrl = new URL("../../../../schemas/authorization/authoring-v2.schema.json", import.meta.url)
let validator: ValidateFunction | undefined

/** A fresh copy of the local asset; no network lookup and no declaration rewriting. */
export function loadAuthoringEditorSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(schemaUrl, "utf8")) as Record<string, unknown>
}

/** JSON Pointer paths identify structural errors; runtime remains authoritative. */
export function checkEditorStructure(value: unknown): {
  valid: boolean
  diagnostics: Array<{ path: string; message: string; keyword: string }>
} {
  validator ??= new Ajv({ allErrors: true, strict: true, ownProperties: true }).compile(loadAuthoringEditorSchema())
  const valid = validator(value)
  const escape = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1")
  return {
    valid: !!valid,
    diagnostics: (validator.errors ?? []).map(error => {
      const property = error.keyword === "required" ? error.params.missingProperty
        : error.keyword === "additionalProperties" ? error.params.additionalProperty
        : error.propertyName
      return {
        path: `${error.instancePath}${property === undefined ? "" : `/${escape(String(property))}`}` || "$",
        message: error.message ?? "Invalid editor structure.",
        keyword: error.keyword,
      }
    }),
  }
}

/** A missing version receives advice only for a confidently recognizable named v2 declaration. */
export function isAuthoringV2Candidate(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.schemaVersion === "authorization-assessment-authoring/v2") return true
  if (v.schemaVersion !== undefined || Object.hasOwn(v, "task")) return false
  const metadata = ["taskId", "request", "repository", "sourceRef", "sourceRoot", "sources"].filter(key => Object.hasOwn(v, key)).length
  const dictionaries = ["policies", "principals", "resources", "entries", "scenarios"].filter(key => Object.hasOwn(v, key) && v[key] && typeof v[key] === "object" && !Array.isArray(v[key])).length
  return metadata >= 3 && dictionaries >= 2
}

/** Shared ordinary init/check advice; no version insertion, policy acceptance or downstream cascade. */
export function authoringEditorDiagnostics(value: unknown): Array<{ code: string; path: string; schemaPath: string; message: string; fix: string }> | undefined {
  if (!isAuthoringV2Candidate(value)) return undefined
  return checkEditorStructure(value).diagnostics.map(d => {
    const segments = d.path === "$" ? [] : d.path.slice(1).split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"))
    // Keep the established author path; the exact JSON Pointer also identifies unknown fields.
    const authorSegments = d.keyword === "additionalProperties" ? segments.slice(0, -1) : segments
    return { code: "author-v2-structure", path: authorSegments.join(".") || "$", schemaPath: d.path, message: d.message,
      fix: d.path === "/schemaVersion" ? "Explicitly set schemaVersion to authorization-assessment-authoring/v2; no version is inferred."
        : d.keyword === "additionalProperties" ? `Remove the unknown field ${d.path}; use the local authoring-v2 schema.`
        : `Provide ${d.path} with the shape described by the local authoring-v2 schema; policy and expectations must remain authored.` }
  })
}

export function authoringEditorGuidance() {
  const schema = loadAuthoringEditorSchema()
  return { schemaVersion: "authorization-assessment-authoring/v2", schemaPath: fileURLToPath(schemaUrl), requiredFields: schema.required,
    guidance: "Use the complete named declaration and local schema; check reports structural paths before source/reference validation. Author policy acceptance, scenario expectations and exact premises yourself. Omitted facts remain undeclared." }
}
