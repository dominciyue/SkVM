import { question } from "../authorization-reusable-program-v1/cases.ts"
/** Additional evaluation-only facts. These never enter an author's allowlist. */
export function createTraceCases(root: any) {
  const cases: Array<{ name: string; input: any }> = []
  const add = (name: string, edit: (input: any, facts: any) => void) => { const input = structuredClone(root); edit(input, input.resourceInputs[question]); cases.push({ name, input }) }
  add("null-owner-shortcut", (_i, f) => { f.documents.find((d: any) => d.id === f.request.pk).owner_id = null })
  add("anonymous-skip-checker", (_i, f) => { f.actor = null })
  add("missing-constructor-only", (i, _f) => { i.externalAssumptions[question] = i.externalAssumptions[question].filter((a: any) => a.name !== "ObjectPermissionChecker.construct") })
  add("latest-fallback-root", (_i, f) => { f.documents = f.documents.filter((d: any) => d.root_document_id !== f.request.pk) })
  add("nulls-last", (_i, f) => { const first = f.documents.find((d: any) => d.root_document_id === f.request.pk && !d.deleted); f.documents.push({ ...first, id: 99, version_index: null, source_file: "null-key.txt", archive_file: "null-key.pdf" }) })
  add("original-true", (_i, f) => { f.request.original = "true" })
  add("permission-wrong-resource", (i, f) => { f.documents.find((d: any) => d.id === f.request.pk).owner_id = 9; i.externalAssumptions[question].push({ name: "ObjectPermissionChecker.has_perm", arguments: { user: f.actor.id, resource: 999, permission: "view_document" }, value: true, reason: "Evaluation wrong-object fact" }) })
  add("permission-wrong-name", (i, f) => { f.documents.find((d: any) => d.id === f.request.pk).owner_id = 9; i.externalAssumptions[question].push({ name: "ObjectPermissionChecker.has_perm", arguments: { user: f.actor.id, resource: f.request.pk, permission: "change_document" }, value: true, reason: "Evaluation wrong-permission fact" }) })
  return cases
}
