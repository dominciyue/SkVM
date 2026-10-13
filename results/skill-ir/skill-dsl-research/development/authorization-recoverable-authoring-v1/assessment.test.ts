import { expect, test } from "bun:test"
import { assessAutomaticCase } from "./assessment.ts"
test("evaluation distinguishes output names from values and preserves unresolved conditions", () => {
  const expected = { kind: "returned", conditions: [], returned: { requested_document: 10, authorized_resource: 10, file_document: 11, archive_selected: true, selected_file: "v1-archive.pdf" } }
  const execution = { returned: { requested_document_id: 10, authorization_root_document_id: 10, returned_document_id: 11, archive_representation: true, returned_file: "v1-archive.pdf" }, conditions: ["unresolved permission"] }
  const result = assessAutomaticCase(expected, execution)
  expect(result.literalShape.valuesMatch).toBe(false)
  expect(result.semanticFields.valuesMatch).toBe(true)
  expect(result.semanticFields.finiteMachineMatch).toBe(false)
  expect(assessAutomaticCase(expected, { ...execution, returned: { requested_document_id: 10 } }).semanticFields.valuesMatch).toBe(false)
})
