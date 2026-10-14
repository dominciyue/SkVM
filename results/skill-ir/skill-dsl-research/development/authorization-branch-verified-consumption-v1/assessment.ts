import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
// Evaluation-only reviewed correspondences, pinned to exact model raw bytes.
// Entries are added only after reviewing exact new raw return expressions.
// Mapping names cannot supply missing values, branches, or assumptions.
const mappings: Record<string, Record<string, string>> = {}

export function assessAutomaticCase(expected: any, execution: any, programSha256?: string) {
  const literalShape = assessFiniteCase(expected, execution), mapping = programSha256 && mappings[programSha256]
  if (!mapping) return { literalShape, semanticFields: null, fieldMappingStatus: "pending-independent-review", normalizedReturned: undefined }
  const normalizedReturned = execution?.returned && Object.fromEntries(Object.entries(mapping).filter(([, field]) => Object.hasOwn(execution.returned, field)).map(([semantic, field]) => [semantic, execution.returned[field]]))
  return { literalShape, semanticFields: assessFiniteCase(expected, { ...execution, returned: normalizedReturned }), fieldMappingStatus: "reviewed-raw-specific", mapping, normalizedReturned }
}
