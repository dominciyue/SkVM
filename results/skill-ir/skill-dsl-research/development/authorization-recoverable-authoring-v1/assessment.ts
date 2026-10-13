import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
/** Evaluation only: names verified against A0's raw return expressions. Never fed to authors. */
export function assessAutomaticCase(expected: any, execution: any) {
  const value = execution?.returned
  const normalized = value && {
    requested_document: value.requested_document_id,
    authorized_resource: value.authorization_root_document_id,
    file_document: value.returned_document_id,
    archive_selected: value.archive_representation,
    selected_file: value.returned_file,
  }
  return { literalShape: assessFiniteCase(expected, execution), semanticFields: assessFiniteCase(expected, { ...execution, returned: normalized }), normalizedReturned: normalized }
}
