import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
const base = path.resolve(import.meta.dir, ".."), packageRoot = path.resolve(base, "../authorization-interprocedural-property-v1/model/packages/download")
const original = JSON.parse(await readFile(path.join(packageRoot, "inquiry.json"), "utf8")), questionId = original.inquiry.questions[0].id
const files = { views: "src/documents/views.py", versions: "src/documents/versioning.py", perms: "src/documents/permissions.py" }
const hashes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, p]) => [k, createHash("sha256").update(await readFile(path.join(packageRoot, "source", p))).digest("hex")])))
const at = (file: keyof typeof files, startLine: number, endLine = startLine) => ({ path: files[file], startLine, endLine, sha256: hashes[file] })
const ref = (name: string) => ({ ref: name }), literal = (value: any) => ({ literal: value })
const binding = (name: string) => ({ binding: name }), lit = (value: any) => ({ literal: value })
const eq = (name: string, value: any) => ({ op: "eq", left: binding(name), right: lit(value) })
const same = (a: string, b: string) => ({ op: "eq", left: binding(a), right: binding(b) })
const nil = (name: string) => ({ op: "is-null", value: binding(name) }), not = (arg: any) => ({ op: "not", arg })
const all = (...args: any[]) => ({ op: "all", args }), any = (...args: any[]) => ({ op: "any", args })
const truthy = (name: string) => ({ op: "truthy", language: "python", value: binding(name) })
const choose = (test: any, yes: any, no: any) => ({ choose: { test, then: yes, else: no } })
const field = (name: string, key: string) => ({ field: { of: ref(name), key } })
const steps: any[] = []
const value = (id: string, value: any, source: any, because: string, when?: any) => steps.push({ id, op: "value", value, source, because, ...(when ? { when } : {}) })
const select = (id: string, where: any, source: any, because: string, extra = {}) => steps.push({ id, op: "select", from: "documents", where, source, because, ...extra })
const guard = (id: string, test: any, failure: string, source: any, because: string, extra = {}) => steps.push({ id, op: "guard", test, failure, source, because, ...extra })
const external = (id: string, name: string, args: any, source: any, because: string, when?: any) => steps.push({ id, op: "external", name, arguments: args, source, because, ...(when ? { when } : {}) })
value("request_include_deleted", literal(true), at("views", 1430, 1434), "file_response passes its own include_deleted=True to requested/root lookup.")
select("request_doc", same("row.id", "request.pk"), at("views", 1408, 1415), "Select the requested pk from the supplied complete finite global-object population, including deleted records.")
guard("request_found", not(nil("request_doc")), "Http404-request", at("views", 1410, 1415), "Missing requested document stops before root authorization.")
select("root_lookup", same("row.id", "request_doc.root_document_id"), at("versions", 154, 156), "Fallback root lookup has the requested/root helper's own include_deleted=True.", { when: all(not(nil("request_doc.root_document_id")), nil("related_root")) })
value("root_doc", choose(nil("request_doc.root_document_id"), ref("request_doc"), { coalesce: [ref("related_root"), ref("root_lookup"), ref("request_doc")] }), at("versions", 146, 156), "Root records return themselves; a loaded relation wins; otherwise root lookup or requested record fallback.")
external("checker_constructed", "ObjectPermissionChecker.construct", { user: field("actor", "id") }, at("perms", 634), "The external checker constructor executes even on the unowned/owner shortcut; normal completion is an explicit external assumption.", not(nil("actor")))
guard("checker_completion", truthy("checker_constructed"), "external-checker-failure", at("perms", 634), "Continue only conditionally when external constructor completion is unknown.", { when: not(nil("actor")) })
external("object_grant", "ObjectPermissionChecker.has_perm", { user: field("actor", "id"), resource: field("root_doc", "id"), permission: literal("view_document") }, at("perms", 635), "External object grant is consulted only after unowned and same-owner shortcuts; it stays unknown without an exact argument assumption.", all(not(nil("actor")), not(nil("root_doc.owner_id")), not(same("root_doc.owner_id", "actor.id"))))
guard("root_authorized", any(nil("actor"), nil("root_doc.owner_id"), same("root_doc.owner_id", "actor.id"), truthy("object_grant")), "HttpResponseForbidden", at("views", 1421, 1427), "For non-null user, owner-aware permission is checked on root_doc before effective-file selection. Null user skips this local check only; this says nothing about request authentication.", { principal: ref("actor"), resource: ref("root_doc"), permission: "view_document" })
// The guard combines the caller and helper body; both source identities matter.
steps.at(-1).sources = [at("perms", 624, 635)]
value("direct_requested_version", { test: all(not(nil("request_doc.root_document_id")), nil("request.version")) }, at("views", 1394, 1399), "A requested version with no version parameter returns itself after root authorization.")
value("version_include_deleted", { test: not(nil("request.version")) }, at("views", 1375, 1381), "Version selection independently uses presence, not truthiness, to choose its manager; empty string is present.")
value("explicit_version", { test: truthy("request.version") }, at("versions", 175, 182), "The inner selector separately uses truthiness: null and empty string choose latest.")
const resolving = not(truthy("direct_requested_version")), explicit = all(resolving, truthy("explicit_version")), latest = all(resolving, not(truthy("explicit_version")))
value("version_id", { integer: field("request", "version") }, at("versions", 184, 187), "Parse explicit version as bounded decimal; invalid ASCII maps to null and unsupported Python integer forms remain gaps.", explicit)
guard("version_valid", not(nil("version_id")), "NotFound-invalid-version", at("views", 1382, 1383), "Invalid explicit version returns before candidate/file selection.", { when: explicit })
select("candidate", all(same("row.id", "version_id"), any(truthy("version_include_deleted"), eq("row.deleted", false))), at("versions", 189, 192), "Explicit candidate selection uses only its own include_deleted argument.", { when: explicit })
guard("candidate_found", not(nil("candidate")), "Http404-version", at("views", 1384, 1385), "No selected candidate stops the response.", { when: explicit })
guard("candidate_belongs", any(same("candidate.id", "root_doc.id"), same("candidate.root_document_id", "root_doc.id")), "Http404-unrelated-version", at("versions", 193, 195), "Candidate must equal the authorized root or refer to that root.", { when: explicit })
select("latest_candidate", all(same("row.root_document_id", "root_doc.id"), any(truthy("version_include_deleted"), eq("row.deleted", false))), at("versions", 159, 166), "Latest selection uses its own manager and source ordering, with root fallback when empty.", { when: latest, unique: false, order: [{ field: "version_index", direction: "desc", nulls: "last" }, { field: "id", direction: "desc" }] })
value("latest_file", { coalesce: [ref("latest_candidate"), ref("root_doc")] }, at("versions", 165, 166), "An empty latest-version selection returns the authorized root.", latest)
value("file_doc", choose(truthy("direct_requested_version"), ref("request_doc"), choose(truthy("explicit_version"), ref("candidate"), ref("latest_file"))), at("views", 1388, 1399), "The selected file object is computed after root permission; explicit selection is not a second permission check.")
value("original_requested", { test: eq("request.original", "true") }, at("views", 1369, 1373), "Only exact string true requests original; absent original must be supplied as null in complete query facts.")
value("use_archive", { test: all(not(truthy("original_requested")), truthy("file_doc.has_archive_version")) }, at("views", 1442, 1448), "Representation follows selected file archive availability and exact original request; root authorization remains unchanged.")
value("representation", choose(truthy("use_archive"), literal("archive"), literal("original")), at("views", 4941, 4970), "serve_file chooses archive or source representation.")
value("selected_path", choose(truthy("use_archive"), field("file_doc", "archive_file"), field("file_doc", "source_file")), at("views", 4941, 4970), "File location is a supplied source-object field; no disk or business code is executed.")
steps.push({ id: "returned_file", op: "return", value: { record: { requested_id: field("request_doc", "id"), authorized_root_id: field("root_doc", "id"), file_document_id: field("file_doc", "id"), representation: ref("representation"), path: ref("selected_path"), disposition: literal("attachment") } }, source: at("views", 1442, 1448), because: "Conditional file-response descriptor after computed selection. Actual storage open, formatting, headers and external exceptions remain separate gaps, not a claimed successful network response." })
const program = { schemaVersion: "authorization-executable-contract/v1", id: "paperless-download-workflow-v1", scope: { kind: "function-contract", questionId, operationId: "document-download", root: { ...at("views", 1429, 1448), receiverClass: "DocumentViewSet" }, upstream: ["Download router/action, APIView initial authentication and permission classes remain source-review duties outside this local resource summary."] }, sourceDeclarations: [{ schemaVersion: "authorization-question-declaration/v1", source: { ...at("views", 1429, 1448), receiverClass: "DocumentViewSet" }, statements: ["self", "pk", "request", "disposition"].map(expression => ({ kind: "object", expression, as: "context", because: "Actual local formal; this declaration alone does not establish call effects." })) }], queries: [], assumptions: [{ text: "Finite documents input represents the complete relevant population including deleted records; absent inputs remain unknown. owner_id equality represents ORM user identity by primary key. related_root is the actual loaded relation or null, not an inferred grant.", origin: "development-premise" }], resourceWorkflow: { inputs: ["request", "actor", "documents", "related_root"], steps, gaps: ["Request-level routing/authentication/permission checks require independent original-source review.", "Storage existence/opening, filename formatting, FileResponse and header behavior are outside the finite selection descriptor.", "ORM/database failure and external checker behavior are not executed; source summaries are authored and unreviewed."] } }
await writeFile(path.join(base, "authoring/download-program.json"), JSON.stringify(program, null, 2) + "\n")
await mkdir(path.join(base, "inputs"), { recursive: true })
original.sourceRoot = path.relative(path.join(base, "inputs"), path.join(packageRoot, "source")).split(path.sep).join("/")
await writeFile(path.join(base, "inputs/base.json"), JSON.stringify(original, null, 2) + "\n")
const documents = [
  { id: 10, root_document_id: null, owner_id: 7, version_index: null, deleted: false, has_archive_version: true, source_file: "root-original.pdf", archive_file: "root-archive.pdf" },
  { id: 11, root_document_id: 10, owner_id: 9, version_index: 1, deleted: false, has_archive_version: true, source_file: "v1-original.pdf", archive_file: "v1-archive.pdf" },
  { id: 12, root_document_id: 10, owner_id: 9, version_index: 2, deleted: true, has_archive_version: false, source_file: "v2-original.txt", archive_file: null },
  { id: 20, root_document_id: null, owner_id: 8, version_index: null, deleted: false, has_archive_version: false, source_file: "other.txt", archive_file: null }
]
const variants: Record<string, any> = {
  "root-default": { request: { pk: 10, version: null, original: null } },
  "empty-version": { request: { pk: 10, version: "", original: null } },
  "explicit-version": { request: { pk: 10, version: "12", original: "true" } },
  "unrelated-version": { request: { pk: 10, version: "20", original: null } },
  "invalid-version": { request: { pk: 10, version: "invalid", original: null } },
  "requested-version": { request: { pk: 11, version: null, original: null }, related_root: documents[0] },
  "root-fallback": { request: { pk: 11, version: null, original: null }, documents: [documents[1]], actor: { id: 9 } },
  "denied": { request: { pk: 10, version: null, original: null }, actor: { id: 9 } },
  "missing-owner": { request: { pk: 10, version: null, original: null }, actor: {} },
  "original-representation": { request: { pk: 10, version: null, original: "true" } }
}
for (const [id, changes] of Object.entries(variants)) {
  const facts = { actor: { id: 7 }, documents, related_root: null, ...changes }
  const assumptions: any[] = facts.actor.id ? [{ name: "ObjectPermissionChecker.construct", arguments: { user: facts.actor.id }, value: true, reason: "Development fixture assumes normal external constructor completion, not a grant." }] : []
  if (id === "denied") assumptions.push({ name: "ObjectPermissionChecker.has_perm", arguments: { user: 9, resource: 10, permission: "view_document" }, value: false, reason: "Explicit development denial fixture." })
  await writeFile(path.join(base, `inputs/${id}.json`), JSON.stringify({ ...original, resourceInputs: { [questionId]: facts }, externalAssumptions: { [questionId]: assumptions } }, null, 2) + "\n")
}
console.log(JSON.stringify({ program: "authoring/download-program.json", steps: steps.length, variants: Object.keys(variants).length }))
