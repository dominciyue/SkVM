import { readFileSync } from "node:fs"
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
  diagnostics: Array<{ path: string; message: string }>
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
      }
    }),
  }
}
