const question = "requested-document-and-returned-file"
/** Current exposed development shapes only. This module generates facts, never expected answers. */
export function createDevelopmentCases(root: any, empty: any, denied: any, fallback: any) {
  const cases: Array<{ name: string; input: any }> = []
  const add = (name: string, original: any, edit?: (input: any, facts: any) => void) => {
    const input = structuredClone(original)
    edit?.(input, input.resourceInputs[question])
    cases.push({ name, input })
  }
  add("root-default", root)
  add("empty-version", empty, (_, facts) => { facts.request.version = "" })
  add("explicit-version", root, (_, facts) => { facts.request.version = String(facts.documents.find((d: any) => d.root_document_id === facts.request.pk && !d.deleted).id) })
  add("explicit-deleted-version", root, (_, facts) => { facts.request.version = String(facts.documents.find((d: any) => d.root_document_id === facts.request.pk && d.deleted).id) })
  add("invalid-version", root, (_, facts) => { facts.request.version = "not-an-integer" })
  add("other-root-version", root, (_, facts) => { facts.request.version = String(facts.documents.find((d: any) => d.root_document_id === null && d.id !== facts.request.pk).id) })
  add("ordering", root, (_, facts) => { facts.documents.find((d: any) => d.root_document_id === facts.request.pk && d.deleted).deleted = false })
  add("ordering-tie", root, (_, facts) => {
    const latest = facts.documents.find((d: any) => d.root_document_id === facts.request.pk && d.deleted)
    latest.deleted = false
    facts.documents.push({ ...latest, id: Math.max(...facts.documents.map((d: any) => d.id)) + 1, source_file: "additional-version.txt", archive_file: null })
  })
  add("denied", denied)
  add("granted", denied, input => {
    const grant = input.externalAssumptions[question].find((a: any) => a.name === "ObjectPermissionChecker.has_perm")
    if (grant) grant.value = true
  })
  add("root-fallback", fallback)
  add("no-external", root, input => { input.externalAssumptions[question] = [] })
  add("reordered", root, (_, facts) => { facts.documents.reverse() })
  add("unrelated-document", root, (_, facts) => {
    const other = facts.documents.find((d: any) => d.root_document_id === null && d.id !== facts.request.pk)
    facts.documents.push({ ...other, id: Math.max(...facts.documents.map((d: any) => d.id)) + 1, root_document_id: other.id, version_index: 100, source_file: "unrelated-file.txt" })
  })
  return cases
}
