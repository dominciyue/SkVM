import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
/** Literal contract comparison only until the new raw program's fields are reviewed. */
export function assessAutomaticCase(expected: any, execution: any) {
  return { literalShape: assessFiniteCase(expected, execution), semanticFields: null, fieldMappingStatus: "pending-independent-review", normalizedReturned: undefined }
}
