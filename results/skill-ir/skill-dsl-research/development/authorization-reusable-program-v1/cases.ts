import { createDevelopmentCases } from "../authorization-authoring-loop-v1/development-cases.ts"
export const question = "requested-document-and-returned-file"
/** Facts only. Independent expected results remain in the evaluation directory. */
export function createCases(root: any, empty: any, denied: any, fallback: any) {
  const cases = createDevelopmentCases(root, empty, denied, fallback)
  const hit = structuredClone(root), facts = hit.resourceInputs[question]
  facts.request.pk = facts.documents.find((d: any) => d.root_document_id === facts.request.pk && !d.deleted).id
  facts.related_root = null
  cases.push({ name: "root-query-hit", input: hit })
  const renamed = structuredClone(root), f = renamed.resourceInputs[question]
  for (const d of f.documents) { d.id += 1000; if (d.root_document_id !== null) d.root_document_id += 1000 }
  f.request.pk += 1000; f.documents.reverse()
  for (const a of renamed.externalAssumptions?.[question] ?? []) if (typeof a.arguments.resource === "number") a.arguments.resource += 1000
  cases.push({ name: "renamed-and-reordered", input: renamed })
  const explicitFalse = structuredClone(denied), absent = structuredClone(denied)
  for (const a of explicitFalse.externalAssumptions[question]) if (a.name === "ObjectPermissionChecker.has_perm") a.value = false
  absent.externalAssumptions[question] = absent.externalAssumptions[question].filter((a: any) => a.name !== "ObjectPermissionChecker.has_perm")
  cases.push({ name: "explicit-false", input: explicitFalse }, { name: "explicit-false-absent", input: absent })
  return cases
}
