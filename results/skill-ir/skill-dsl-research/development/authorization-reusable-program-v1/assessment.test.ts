import { expect, test } from "bun:test"
import { assessAutomaticCase } from "./assessment.ts"
test("reviewed field mapping remains raw-specific and does not erase missing conditions", () => {
  const expected = { kind: "conditional", conditions: ["ObjectPermissionChecker.construct completion is unspecified"], returned: { requested_document: 10, authorized_resource: 10, file_document: 11, archive_selected: true, selected_file: "a" } }
  const actual = { returned: { request_document: 10, authorized_root: 10, selected_document: 11, use_archive: true, selected_file: "a" }, conditions: [], gaps: [], events: [] }
  const assessed: any = (assessAutomaticCase as any)(expected, actual, "600aa50010f56eaf6d97a3c2bf334fc4ca658cbe3027b4c9167462f02d1e7036")
  expect(assessed.semanticFields?.valuesMatch).toBe(true)
  expect(assessed.semanticFields?.finiteMachineMatch).toBe(false)
  expect(assessed.literalShape.valuesMatch).toBe(false)
  expect((assessAutomaticCase as any)(expected, actual, "unreviewed").semanticFields).toBeNull()
})
