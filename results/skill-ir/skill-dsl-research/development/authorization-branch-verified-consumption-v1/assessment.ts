import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
// Evaluation-only reviewed correspondences, pinned to exact model raw bytes.
// Entries are added only after reviewing exact new raw return expressions.
// Mapping names cannot supply missing values, branches, or assumptions.
const a1Raw = "7bb99c9261ec97dca5c788320a50f81e91372e567f541a7e47573e163ddfbaba"
const mappings: Record<string, Record<string, string>> = {
  // BM first retained the exact BL raw hash and return expressions, unchanged.
  "600aa50010f56eaf6d97a3c2bf334fc4ca658cbe3027b4c9167462f02d1e7036": { requested_document: "request_document", authorized_resource: "authorized_root", file_document: "selected_document", archive_selected: "use_archive", selected_file: "selected_file" },
  // A1 raw lines470-537: request/root/file_doc ids; representation is the
  // exact archive/original choose over use_archive, also selecting file path.
  [a1Raw]: { requested_document: "requested_document_id", authorized_resource: "authorized_root_id", file_document: "returned_document_id", archive_selected: "representation", selected_file: "file" },
}

export function assessAutomaticCase(expected: any, execution: any, programSha256?: string) {
  const literalShape = assessFiniteCase(expected, execution), mapping = programSha256 && mappings[programSha256]
  if (!mapping) return { literalShape, semanticFields: null, fieldMappingStatus: "pending-independent-review", normalizedReturned: undefined }
  const normalizedReturned = execution?.returned && Object.fromEntries(Object.entries(mapping).filter(([, field]) => Object.hasOwn(execution.returned, field)).map(([semantic, field]) => [semantic, execution.returned[field]]))
  if (programSha256 === a1Raw && normalizedReturned) {
    if (normalizedReturned.archive_selected === "archive") normalizedReturned.archive_selected = true
    else if (normalizedReturned.archive_selected === "original") normalizedReturned.archive_selected = false
    else delete normalizedReturned.archive_selected
  }
  return { literalShape, semanticFields: assessFiniteCase(expected, { ...execution, returned: normalizedReturned }), fieldMappingStatus: "reviewed-raw-specific", mapping, normalizedReturned }
}
