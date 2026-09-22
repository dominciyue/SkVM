import {createHash} from "node:crypto"
import {AuthorizationAuthoringInputV2Schema} from "./authoring-v2.ts"

const replaceableFields = new Set([
  "taskId", "request", "repository", "sourceRef", "sourceRoot", "sources",
  "policies", "principals", "resources", "entries", "scenarios",
  "additionalQuestions", "additionalConstraints",
])

/** Whole top-level replacements only. Run ordinary check afterwards for references and source bounds. */
export function composeAuthorizationAuthoring(
  base: unknown,
  replacements: readonly {field: string; value: unknown; origin: string}[],
) {
  const parsed = AuthorizationAuthoringInputV2Schema.parse(base)
  const composed: Record<string, unknown> = structuredClone(parsed)
  const fieldOrigins: Record<string, string> = Object.fromEntries(Object.keys(parsed).map(key => [key, "base"]))
  const seen = new Set<string>()
  for (const replacement of replacements) {
    if (!replaceableFields.has(replacement.field)) throw new Error(`Unsupported replacement: ${replacement.field}`)
    if (seen.has(replacement.field)) throw new Error(`Duplicate replacement: ${replacement.field}`)
    if (!replacement.origin.trim()) throw new Error("Replacement origin must be nonempty")
    seen.add(replacement.field)
    composed[replacement.field] = structuredClone(replacement.value)
    fieldOrigins[replacement.field] = replacement.origin
  }
  return {
    input: AuthorizationAuthoringInputV2Schema.parse(composed),
    fieldOrigins,
    baseSha256: createHash("sha256").update(JSON.stringify(parsed)).digest("hex"),
  }
}
