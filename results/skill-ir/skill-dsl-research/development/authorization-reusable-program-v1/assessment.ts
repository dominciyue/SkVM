import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
// Evaluation-only reviewed correspondences, pinned to exact model raw bytes.
// A0 result fields: automatic-program.json:563-604. Source basis: views.py
// 1401-1448, versioning.py:146-195. This maps names, not missing semantics.
const mappings: Record<string, Record<string, string>> = {
  "600aa50010f56eaf6d97a3c2bf334fc4ca658cbe3027b4c9167462f02d1e7036": { requested_document: "request_document", authorized_resource: "authorized_root", file_document: "selected_document", archive_selected: "use_archive", selected_file: "selected_file" },
  "ada6f2943052383fa1fac99418ec58e932f205efc4683c33bbac1f2b497ce56e": { requested_document: "request_document" },
  // Independently reviewed A1 result: automatic-program-A1-first.json:625-683;
  // first-program-A1-first.json:186-212 only contains request/root identities.
  "14ca904ca4b14205d03314e52449fd8d899340550c5a0e44819af5be7c4d5492": { requested_document: "requested_document_id", authorized_resource: "authorization_document_id", file_document: "file_document_id", archive_selected: "use_archive", selected_file: "selected_file" },
  "a897d67279f5bfd05dea3fc942c3b69a50e87a444f903080bffba2edcef93df7": { requested_document: "requested_document_id", authorized_resource: "authorization_document_id" },
}
export function assessAutomaticCase(expected: any, execution: any, programSha256?: string) {
  const literalShape = assessFiniteCase(expected, execution), mapping = programSha256 && mappings[programSha256]
  if (!mapping) return { literalShape, semanticFields: null, fieldMappingStatus: "pending-independent-review", normalizedReturned: undefined }
  const normalizedReturned = execution?.returned && Object.fromEntries(Object.entries(mapping).filter(([, field]) => Object.hasOwn(execution.returned, field)).map(([semantic, field]) => [semantic, execution.returned[field]]))
  return { literalShape, semanticFields: assessFiniteCase(expected, { ...execution, returned: normalizedReturned }), fieldMappingStatus: "reviewed-raw-specific", mapping, normalizedReturned }
}
