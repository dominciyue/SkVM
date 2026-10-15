import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
// Evaluation-only, exact raw hashes. Add a mapping only after inspecting the
// model's actual return expressions; mapping cannot fill a missing relation.
const mappingFile = path.join(import.meta.dir, "evaluation/reviewed-mappings.json")
export function assessAutomaticCase(expected: any, execution: any, programSha256?: string) {
  const maps = existsSync(mappingFile) ? JSON.parse(readFileSync(mappingFile, "utf8")) : {}
  const mapping = programSha256 && maps[programSha256], literalShape = assessFiniteCase(expected, execution)
  if (!mapping) return { literalShape, semanticFields: null, fieldMappingStatus: "pending-independent-review", normalizedReturned: undefined }
  const normalizedReturned = execution?.returned && Object.fromEntries(Object.entries(mapping.fields as Record<string, string>).filter(([, field]) => Object.hasOwn(execution.returned, field)).map(([semantic, field]) => [semantic, execution.returned[field]]))
  if (normalizedReturned) for (const [key, values] of Object.entries(mapping.enums ?? {}) as Array<[string, Record<string, unknown>]>) {
    if (Object.hasOwn(values, normalizedReturned[key])) normalizedReturned[key] = values[normalizedReturned[key]]
    else delete normalizedReturned[key]
  }
  return { literalShape, semanticFields: assessFiniteCase(expected, { ...execution, returned: normalizedReturned }), fieldMappingStatus: "reviewed-raw-specific", mapping, normalizedReturned }
}
