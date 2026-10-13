import { isDeepStrictEqual } from "node:util"
type Oracle = { kind: "computed" | "conditional" | "denied" | "rejected" | "unknown"; requestedDocument?: number; authorizedResource?: number; rejection?: string; returned?: Record<string, any>; conditions: string[] }
/** Evaluation only. Derived from views.py:1368-1448, permissions.py:624-635,
 * versioning.py:23-28/140-195 and views.py:4941-4965, never a model input.
 * Finite rows represent a complete development population, not an actual DB.
 * Request-wide auth, global permissions, storage and FileResponse stay outside. */
export function sourceDownloadOracle(facts: any, assumptions: readonly any[]): Oracle {
  const conditions: string[] = []
  const find = (name: string, args: any) => assumptions.find(a => a.name === name && isDeepStrictEqual(a.arguments, args))
  if (!facts?.request || !Array.isArray(facts.documents)) return { kind: "unknown", conditions: ["current request or finite documents are unavailable"] }
  const requested = facts.documents.find((d: any) => d.id === facts.request.pk)
  if (!requested) return { kind: "rejected", rejection: "request-not-found", conditions }
  const root = requested.root_document_id === null ? requested : facts.related_root ?? facts.documents.find((d: any) => d.id === requested.root_document_id) ?? requested
  const identity = { requestedDocument: requested.id, authorizedResource: root.id }
  const actor = facts.actor
  if (actor === undefined) conditions.push("current actor is unavailable")
  else if (actor !== null) {
    if (find("ObjectPermissionChecker.construct", { user: actor.id })?.value !== true) conditions.push("ObjectPermissionChecker.construct completion is unspecified")
    if (!Object.hasOwn(root, "owner_id")) conditions.push("resolved root ownership is unavailable")
    else if (root.owner_id !== null && root.owner_id !== actor.id) {
      const grant = find("ObjectPermissionChecker.has_perm", { user: actor.id, resource: root.id, permission: "view_document" })?.value
      if (grant === false) return { ...identity, kind: "denied", conditions }
      if (grant !== true) conditions.push("ObjectPermissionChecker.has_perm on resolved root is unspecified")
    }
  }
  const version = facts.request.version
  let file = requested
  if (requested.root_document_id === null || version !== null) {
    if (!version) {
      const versions = facts.documents.filter((d: any) => d.root_document_id === root.id && (version !== null || !d.deleted))
      versions.sort((a: any, b: any) => a.version_index === null ? b.version_index === null ? b.id - a.id : 1 : b.version_index === null ? -1 : b.version_index - a.version_index || b.id - a.id)
      file = versions[0] ?? root
    } else {
      if (typeof version !== "string" || !/^[\x00-\x7f]*$/.test(version) || version.includes("_")) return { ...identity, kind: "unknown", conditions: [...conditions, "version integer conversion is outside the bounded decimal oracle"] }
      if (!/^[+-]?\d+$/.test(version.trim())) return { ...identity, kind: "rejected", rejection: "invalid-version", conditions }
      const id = Number(version.trim())
      if (!Number.isSafeInteger(id)) return { ...identity, kind: "unknown", conditions: [...conditions, "version integer is outside the safe finite range"] }
      file = facts.documents.find((d: any) => d.id === id)
      if (!file) return { ...identity, kind: "rejected", rejection: "version-not-found", conditions }
      if (file.id !== root.id && file.root_document_id !== root.id) return { ...identity, kind: "rejected", rejection: "unrelated-version", conditions }
    }
  }
  const archive = facts.request.original !== "true" && file.has_archive_version
  return { ...identity, kind: conditions.length ? "conditional" : "computed", conditions,
    returned: { requested_document: requested.id, authorized_resource: root.id, file_document: file.id, archive_selected: !!archive, selected_file: archive ? file.archive_file : file.source_file } }
}
