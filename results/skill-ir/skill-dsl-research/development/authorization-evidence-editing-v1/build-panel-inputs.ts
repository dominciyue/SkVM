import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = import.meta.dir
const prior = path.resolve(root, "../authorization-task-semantics-v1/inputs")
const refs = {
  owui: { repository: "https://github.com/open-webui/open-webui", ref: "841c9045d789005145274955e7ef60b1b11a9be9" },
  fastapi: { repository: "https://github.com/fastapi/full-stack-fastapi-template", ref: "cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7" },
  memos: { repository: "https://github.com/usememos/memos", ref: "cb42e326ba9cc266a6a9570c53e0fe04c62793f4" },
  paperless: { repository: "https://github.com/paperless-ngx/paperless-ngx", ref: "126ec414a8b65158368653a2604ae58415e43103" },
} as const

type Dependency = { id: string; from: string; path: string; startLine: number; endLine: number; match?: string; reason: "identity" | "resource-binding" | "control" | "effect" | "other"; basis: "author" | "locator" }
type Case = {
  id: string; project: "memos" | "paperless"; source: string; start: number; end: number; taskId: string; request: string;
  policyKey: string; policy: string; policyLocation: string; principalKey: string; principalRole: string; principalFacts: string[];
  resourceKey: string; resourceType: string; resourceFacts: string[]; entryKey: string; entryName: string;
  scenarioKey: string; relation: string; operation: string; expectation: "allow" | "deny" | "conditional";
  premise?: string; detail: string; dependencies: Dependency[]; allowedFiles: string[];
}

const cases: Case[] = [
  {
    id: "memos-create-share", project: "memos", source: "server/api/v1/memo_share_service.go", start: 23, end: 80,
    taskId: "memos-create-share-admin", request: "At CreateMemoShare handler entry, does an authenticated active instance administrator pass the source-visible authorization controls to create a share for an existing active non-SPACE memo authored by someone else? Assess authorization, not whether an external store call succeeds under every runtime condition.",
    policyKey: "memo-share-creator-or-admin", policy: "A memo share may be created by the memo creator or an instance administrator; SPACE audience memos are not shareable.", policyLocation: "proto/api/v1/memo_service.proto:116-123; server/api/v1/memo_share_service.go:54-56",
    principalKey: "instance-admin", principalRole: "authenticated active instance administrator, not the memo creator", principalFacts: ["The caller is active and has the instance ADMIN role.", "The caller is not the memo's creator."],
    resourceKey: "other-normal-memo", resourceType: "memo", resourceFacts: ["The memo exists, is active, and has a non-SPACE audience.", "The memo was created by another user."],
    entryKey: "create-share", entryName: "CreateMemoShare", scenarioKey: "admin-other-memo", relation: "active-instance-admin-not-creator", operation: "create memo share", expectation: "allow",
    premise: "At CreateMemoShare entry, the caller is an authenticated active instance ADMIN; the selected memo exists, is active, non-SPACE, and authored by another user. The requested expiry, if any, is valid.",
    detail: "Trace the author-or-admin helper and the protected CreateMemoShare store effect; keep store failure and concurrent state changes outside the authorization conclusion.",
    allowedFiles: ["server/api/v1/memo_share_service.go", "core/access/memo.go", "server/api/v1/memo_access.go", "store/memo.go", "store/memo_share.go"],
    dependencies: [
      { id: "manage", from: "create-share", path: "core/access/memo.go", startLine: 61, endLine: 85, match: "func CanManageMemo", reason: "control", basis: "locator" },
      { id: "write-policy", from: "create-share", path: "server/api/v1/memo_access.go", startLine: 163, endLine: 168, match: "func memoWritePolicy", reason: "control", basis: "locator" },
      { id: "write-snapshot", from: "write-policy", path: "store/memo.go", startLine: 277, endLine: 350, match: "func ValidateMemoWriteSnapshot", reason: "control", basis: "locator" },
      { id: "share-store", from: "create-share", path: "store/memo_share.go", startLine: 37, endLine: 49, match: "func (s *Store) CreateMemoShare", reason: "effect", basis: "locator" },
    ],
  },
  {
    id: "memos-get-shared", project: "memos", source: "server/api/v1/memo_share_service.go", start: 170, end: 213,
    taskId: "memos-get-shared-anonymous", request: "At GetSharedMemo handler entry, can an anonymous caller retrieve the private, active, non-SPACE memo associated with a supplied share token when this task does not say whether the token exists or is unexpired? Assume the associated memo has a valid creator if the token resolves. State the source-visible branches and missing runtime facts.",
    policyKey: "share-token-exact-memo", policy: "GetSharedMemo needs no authentication; a current share token grants access to its exact memo only. Invalid or expired tokens and inaccessible memos yield NOT_FOUND.", policyLocation: "proto/api/v1/memo_service.proto:134-138; server/api/v1/memo_share_service.go:170-213",
    principalKey: "anonymous-token-holder", principalRole: "anonymous caller presenting an unspecified share token", principalFacts: ["The caller is not authenticated.", "Token existence and expiry are not supplied as facts."],
    resourceKey: "private-memo", resourceType: "memo", resourceFacts: ["If the token resolves, its associated memo is active, private, non-SPACE, and has a valid creator.", "There is no separately named memo identifier in GetSharedMemoRequest."],
    entryKey: "get-shared", entryName: "GetSharedMemo", scenarioKey: "token-status-unspecified", relation: "anonymous-token-validity-unknown", operation: "retrieve token-associated memo", expectation: "conditional",
    premise: "At GetSharedMemo entry, the caller is anonymous. If the token resolves, its associated memo is active, private, non-SPACE, and has a valid creator. Token existence and expiry are unspecified.",
    detail: "Explain the valid token-associated memo and invalid/expired branches; do not invent token state, a separate requested memo identity, or deployment success.",
    allowedFiles: ["server/api/v1/memo_share_service.go", "server/api/v1/memo_access.go", "core/access/memo.go", "core/access/memo_resolve.go", "store/memo_share.go"],
    dependencies: [
      { id: "active-token", from: "get-shared", path: "server/api/v1/memo_share_service.go", startLine: 216, endLine: 229, match: "func (s *APIV1Service) getActiveMemoShare", reason: "identity", basis: "locator" },
      { id: "read-context", from: "get-shared", path: "server/api/v1/memo_access.go", startLine: 15, endLine: 40, match: "func (s *APIV1Service) buildMemoReadContext(ctx", reason: "resource-binding", basis: "locator" },
      { id: "read-decision", from: "read-context", path: "core/access/memo.go", startLine: 87, endLine: 156, match: "func CheckMemoReadContext", reason: "control", basis: "locator" },
      { id: "read-resolve", from: "read-context", path: "core/access/memo_resolve.go", startLine: 26, endLine: 90, match: "func ResolveMemoReadFacts", reason: "resource-binding", basis: "locator" },
    ],
  },
  {
    id: "memos-member-leave", project: "memos", source: "server/api/v1/space_service.go", start: 740, end: 763,
    taskId: "memos-member-self-leave", request: "At DeleteSpaceMember handler entry, may an authenticated active ordinary member delete their own active membership, and may the same non-administrator delete a different active member's membership in that space? Assume resource resolution succeeds and compare the two requested targets.",
    policyKey: "space-member-removal", policy: "A space member may delete their own membership to leave. Removing a different member requires space administrator authority.", policyLocation: "proto/api/v1/space_service.proto:126-130; server/api/v1/space_service.go:750-755",
    principalKey: "ordinary-member", principalRole: "authenticated active ordinary space member who is not a space administrator", principalFacts: ["The caller has an active ordinary membership in the selected space.", "The caller does not hold the space ADMIN role."],
    resourceKey: "membership-target", resourceType: "space membership", resourceFacts: ["The target membership exists and is active in the caller's space.", "The target is the caller's own membership or a different active member's membership as stated by each scenario."],
    entryKey: "delete-member", entryName: "DeleteSpaceMember", scenarioKey: "self-leave", relation: "caller-is-target-member", operation: "delete own space membership", expectation: "allow",
    premise: "At DeleteSpaceMember entry, the active ordinary member targets their own active membership, and resolveSpaceMemberResource succeeds.",
    detail: "Explain the self exception and the separate administrator check for a different target; do not assume the caller is an administrator.",
    allowedFiles: ["server/api/v1/space_service.go", "store/space.go"],
    dependencies: [
      { id: "member-resolution", from: "delete-member", path: "server/api/v1/space_service.go", startLine: 632, endLine: 662, match: "func (s *APIV1Service) resolveSpaceMemberResource", reason: "resource-binding", basis: "locator" },
      { id: "administrator-guard", from: "delete-member", path: "server/api/v1/space_service.go", startLine: 54, endLine: 59, match: "func requireSpaceAdministrator", reason: "control", basis: "locator" },
    ],
  },
  {
    id: "paperless-download", project: "paperless", source: "src/documents/views.py", start: 1834, end: 1839,
    taskId: "paperless-version-download-root", request: "At DocumentViewSet.download handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root? Assume the user has the required global view permission and the documents exist.",
    policyKey: "document-root-view", policy: "A download must pass the owner-aware view_document check on the root document before serving any selected file version.", policyLocation: "src/documents/views.py:1401-1448; src/documents/permissions.py:624-635",
    principalKey: "version-owner", principalRole: "authenticated user who owns the requested version but not the root document", principalFacts: ["The caller has global documents.view_document permission.", "The caller has no object view_document grant on the root."],
    resourceKey: "rooted-version", resourceType: "document version and root", resourceFacts: ["The requested version and its root both exist.", "The version is caller-owned; the root has another owner and no caller view grant."],
    entryKey: "download", entryName: "DocumentViewSet.download", scenarioKey: "version-owner-no-root-view", relation: "owns-version-not-root", operation: "download requested document version", expectation: "deny",
    premise: "At download entry, the authenticated caller has global document view permission and owns the requested version, but a different user owns the existing root document and the caller has no object view grant on that root.",
    detail: "Identify which object is checked and which file object would be served; do not collapse version ownership into root authorization.",
    allowedFiles: ["src/documents/views.py", "src/documents/permissions.py"],
    dependencies: [
      { id: "file-response", from: "download", path: "src/documents/views.py", startLine: 1429, endLine: 1448, match: "def file_response", reason: "effect", basis: "locator" },
      { id: "root-resolution", from: "file-response", path: "src/documents/views.py", startLine: 1401, endLine: 1427, match: "def _resolve_request_and_root_doc", reason: "resource-binding", basis: "locator" },
      { id: "version-selection", from: "file-response", path: "src/documents/views.py", startLine: 1388, endLine: 1399, match: "def _get_effective_file_doc", reason: "resource-binding", basis: "locator" },
      { id: "owner-aware", from: "root-resolution", path: "src/documents/permissions.py", startLine: 624, endLine: 635, match: "def has_perms_owner_aware", reason: "control", basis: "locator" },
    ],
  },
  {
    id: "paperless-note-post", project: "paperless", source: "src/documents/views.py", start: 1841, end: 1913,
    taskId: "paperless-note-post-object-change", request: "At DocumentViewSet.notes POST handler entry, can an authenticated user who has all listed global POST permissions and an object view grant on a document create a note when a different user owns the document and the caller has no object change_document grant?",
    policyKey: "note-post-document-change", policy: "Creating a note requires the POST global note/document permissions and an owner-aware change_document check on the target document; viewing the document alone is insufficient.", policyLocation: "src/documents/permissions.py:673-699; src/documents/views.py:1857-1892",
    principalKey: "viewer-no-change", principalRole: "authenticated user with global note POST permissions and only object view access", principalFacts: ["The caller has documents.add_note, documents.view_document, and documents.change_document global permissions.", "The caller has an object view grant but no object change grant on the document."],
    resourceKey: "other-document", resourceType: "document and attached note", resourceFacts: ["The document exists and is owned by another user.", "The caller is not its owner."],
    entryKey: "notes-post", entryName: "DocumentViewSet.notes POST", scenarioKey: "viewer-cannot-add-note", relation: "object-view-without-object-change", operation: "create note on document", expectation: "deny",
    premise: "At notes POST entry, the authenticated caller has the global POST permissions and an object view grant, but is not the document owner and lacks its object change_document grant.",
    detail: "Separate the global PaperlessNotePermissions check, the object view check, the object change check, and Note.objects.create effect.",
    allowedFiles: ["src/documents/views.py", "src/documents/permissions.py"],
    dependencies: [
      { id: "note-global", from: "notes-post", path: "src/documents/permissions.py", startLine: 673, endLine: 699, match: "class PaperlessNotePermissions", reason: "control", basis: "locator" },
      { id: "owner-aware", from: "notes-post", path: "src/documents/permissions.py", startLine: 624, endLine: 635, match: "def has_perms_owner_aware", reason: "control", basis: "locator" },
    ],
  },
  {
    id: "paperless-share-create", project: "paperless", source: "src/documents/views.py", start: 4696, end: 4717,
    taskId: "paperless-share-create-document-view", request: "At ShareLinkViewSet.create handler entry, can an authenticated caller with global add_sharelink and global view_document permission create a share link for a document owned by someone else when the caller lacks object view_document permission on that document?",
    policyKey: "share-target-document-view", policy: "Share-link creation requires the share-link creation permission and view access to the referenced document; a global view_document grant alone does not substitute for the owner-aware object check.", policyLocation: "src/documents/permissions.py:30-53; src/documents/serialisers.py:2851-2886",
    principalKey: "global-permissions-only", principalRole: "authenticated user with global add_sharelink and view_document permissions", principalFacts: ["The caller has the global permissions named in the question.", "The caller has no object view_document grant on the target document."],
    resourceKey: "other-document-share", resourceType: "document and new share link", resourceFacts: ["The referenced document exists and is owned by another user.", "No object view grant is held by the caller."],
    entryKey: "share-create", entryName: "ShareLinkViewSet.create", scenarioKey: "global-only-no-document-view", relation: "global-view-without-object-view", operation: "create share link referencing document", expectation: "deny",
    premise: "At ShareLinkViewSet.create entry, the authenticated caller has global add_sharelink and view_document, but the referenced document exists, belongs to another user, and has no caller object view grant.",
    detail: "Trace the viewset's permissions and serializer validation of the referenced document; distinguish the share-link object from its target document.",
    allowedFiles: ["src/documents/views.py", "src/documents/permissions.py", "src/documents/serialisers.py"],
    dependencies: [
      { id: "global-share-permission", from: "share-create", path: "src/documents/permissions.py", startLine: 30, endLine: 53, match: "class PaperlessObjectPermissions", reason: "control", basis: "locator" },
      { id: "serializer-user", from: "share-create", path: "src/documents/views.py", startLine: 406, endLine: 426, match: "class PassUserMixin", reason: "identity", basis: "locator" },
      { id: "document-validation", from: "share-create", path: "src/documents/serialisers.py", startLine: 2851, endLine: 2886, match: "class ShareLinkSerializer", reason: "control", basis: "locator" },
      { id: "owner-aware", from: "document-validation", path: "src/documents/permissions.py", startLine: 624, endLine: 635, match: "def has_perms_owner_aware", reason: "control", basis: "locator" },
    ],
  },
]

function physicalLines(content: string): string[] { return content.match(/[^\n]*\n|[^\n]+$/g) ?? [] }
function writeJson(file: string, value: unknown) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8") }
function authoring(value: Case, sourceRoot: string, sourcePath: string, startLine: number, endLine: number) {
  const identity = refs[value.project]
  const result = {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: value.taskId, request: value.request,
    repository: identity.repository, sourceRef: identity.ref, sourceRoot, sources: [sourcePath],
    policies: { [value.policyKey]: { text: value.policy, location: value.policyLocation, revision: identity.ref, acceptance: "accepted", reason: "Public fixed-ref source and task-author bounded requirement." } },
    principals: { [value.principalKey]: { role: value.principalRole, facts: value.principalFacts } },
    resources: { [value.resourceKey]: { type: value.resourceType, facts: value.resourceFacts } },
    entries: { [value.entryKey]: { name: value.entryName, locations: [{ path: sourcePath, startLine, endLine }] } },
    scenarios: { [value.scenarioKey]: { principal: value.principalKey, resource: value.resourceKey, policy: value.policyKey,
      entries: [value.entryKey], relation: value.relation, operation: value.operation, expectation: value.expectation } },
    additionalQuestions: ["identify the principal, operation, protected resource, decisive control, and effect", "return source_supported_failure, source_refuted, or unknown with exact supplied-source locations"],
    additionalConstraints: ["Use only the supplied fixed-ref case inputs.", "Do not execute the target project or infer deployment facts."],
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1",
      publicInstruction: `Decide the current scenario at the stated declared-entry boundary from the supplied fixed source and accepted policy. Treat premises as question assumptions, not source or deployment proof. Trace the decisive authorization control, protected object and effect with exact supplied-source locations. State any decisive missing runtime fact rather than assuming it. Do not execute the target, infer missing deployment facts, or consult later versions.\nCurrent question: ${value.request}\nAnalysis boundary: declared-entry.\nTask premise: ${value.premise ?? "Only the explicit task facts above are assumed."}\nRequired response detail: ${value.detail}`,
      scenarios: { [value.scenarioKey]: { boundary: "declared-entry", premises: value.premise ? [{ id: "premise-1", statement: value.premise, atEntry: value.entryKey, provenance: "task-assumption" }] : [], requestedBranches: [], requiredResponseDetails: [value.detail] } } },
  }
  if (value.id === "memos-member-leave") {
    result.scenarios["other-member"] = { principal: value.principalKey, resource: value.resourceKey, policy: value.policyKey,
      entries: [value.entryKey], relation: "caller-is-not-target-member-and-not-admin", operation: "delete another active space membership", expectation: "deny" }
    result.analysisContract.scenarios["other-member"] = { boundary: "declared-entry",
      premises: [{ id: "premise-1", statement: "At DeleteSpaceMember entry, the active ordinary non-administrator targets a different active member in the same space, and resolveSpaceMemberResource succeeds.", atEntry: value.entryKey, provenance: "task-assumption" }],
      requestedBranches: [], requiredResponseDetails: ["Explain why the administrator guard blocks deletion of another member before the store effect."] }
  }
  return result
}

for (const value of cases) {
  const directory = path.join(root, "inputs", value.id)
  const source = readFileSync(path.join(root, "public-source", value.project, ...value.source.split("/")), "utf8")
  const lines = physicalLines(source)
  if (value.end > lines.length) throw new Error(`${value.id}: entry exceeds source line count`)
  const crop = lines.slice(value.start - 1, value.end).join("")
  const baselineSource = path.join(directory, "baseline", "source", ...value.source.split("/"))
  mkdirSync(path.dirname(baselineSource), { recursive: true })
  writeFileSync(baselineSource, crop, "utf8")
  writeJson(path.join(directory, "baseline", "authoring.json"), authoring(value, "source", value.source, 1, value.end - value.start + 1))
  writeJson(path.join(directory, "baseline-origin.json"), { schemaVersion: "authorization-baseline-origin/v1", repository: refs[value.project].repository,
    sourceRef: refs[value.project].ref, originalPath: value.source, startLine: value.start, endLine: value.end, selection: "complete declared entry" })
  writeJson(path.join(directory, "full", "authoring.json"), authoring(value, `../../../public-source/${value.project}`, value.source, value.start, value.end))
  writeJson(path.join(directory, "request.json"), { schemaVersion: "authorization-evidence-request/v1", sourceRoot: `../../../public-source/${value.project}`,
    allowedFiles: value.allowedFiles, entries: [{ entryKey: value.entryKey, path: value.source, startLine: value.start, endLine: value.end }],
    dependencies: value.dependencies, limits: { maxFiles: 12, maxBytes: 65_536, maxDepth: 3 } })
}

for (const item of [
  { id: "owui-file", project: "owui" as const, oldPath: "owui-file", source: "backend/open_webui/routers/retrieval.py", start: 1546, end: 1762,
    dependencies: [{ id: "vector-write-helper", from: "post-process-file", path: "backend/open_webui/routers/retrieval.py", startLine: 1340, endLine: 1537, match: "def save_docs_to_vector_db", reason: "effect", basis: "locator" }] },
  { id: "fastapi-superuser-read", project: "fastapi" as const, oldPath: "fastapi-superuser-read", source: "backend/app/api/routes/items.py", start: 48, end: 58,
    dependencies: [{ id: "current-user-binding", from: "read-item", path: "backend/app/api/deps.py", startLine: 30, endLine: 49, match: "def get_current_user", reason: "identity", basis: "locator" }] },
] as const) {
  const directory = path.join(root, "inputs", item.id)
  const old = JSON.parse(readFileSync(path.join(prior, item.oldPath, "authoring.json"), "utf8"))
  const oldSourceRoot = path.resolve(prior, item.oldPath, old.sourceRoot)
  old.sourceRoot = "source"
  if (item.id === "owui-file") {
    const original = readFileSync(path.join(root, "public-source", item.project, ...item.source.split("/")), "utf8")
    const crop = physicalLines(original).slice(item.start - 1, item.end).join("")
    const target = path.join(directory, "baseline", "source", ...item.source.split("/"))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, crop, "utf8")
    old.sources = [item.source]
    const entry = Object.values(old.entries as Record<string, { locations: Array<{ path: string; startLine: number; endLine: number }> }>)[0]!
    entry.locations = [{ path: item.source, startLine: 1, endLine: item.end - item.start + 1 }]
  } else {
    for (const sourcePath of old.sources as string[]) {
      const target = path.join(directory, "baseline", "source", ...sourcePath.split("/"))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, readFileSync(path.join(oldSourceRoot, ...sourcePath.split("/"))))
    }
  }
  writeJson(path.join(directory, "baseline", "authoring.json"), old)
  writeJson(path.join(directory, "baseline-origin.json"), { schemaVersion: "authorization-baseline-origin/v1", repository: refs[item.project].repository,
    sourceRef: refs[item.project].ref, originalPath: item.source, startLine: item.start, endLine: item.end,
    selection: item.id === "owui-file"
      ? "complete original handler entry; historical AI crop excluded from new panel because its editorial comment asserted the authorization conclusion"
      : "retained AI regression source; see baseline authoring for its crop-line coordinates" })
  const full = structuredClone(old)
  full.sourceRoot = `../../../public-source/${item.project}`
  full.sources = [item.source]
  const entry = Object.values(full.entries as Record<string, { locations: Array<{ path: string; startLine: number; endLine: number }> }>)[0]!
  entry.locations = [{ path: item.source, startLine: item.start, endLine: item.end }]
  writeJson(path.join(directory, "full", "authoring.json"), full)
  writeJson(path.join(directory, "request.json"), { schemaVersion: "authorization-evidence-request/v1", sourceRoot: full.sourceRoot,
    allowedFiles: item.project === "fastapi" ? [item.source, "backend/app/api/deps.py"] : [item.source],
    entries: [{ entryKey: Object.keys(full.entries)[0], path: item.source, startLine: item.start, endLine: item.end }],
    dependencies: item.dependencies, limits: { maxFiles: 12, maxBytes: 65_536, maxDepth: 3 } })
}

const briefs = cases.map(value => ({ id: value.id, repository: refs[value.project].repository, sourceRef: refs[value.project].ref,
  entry: `${value.source}:${value.start}-${value.end}`, acceptedPolicy: value.policy, currentQuestion: value.request,
  boundary: "declared-entry", premises: value.id === "memos-member-leave"
    ? [value.premise!, "For the second scenario, the same active ordinary non-administrator targets a different active member in the same space, and resource resolution succeeds."]
    : value.premise ? [value.premise] : [], requiredResponseDetails: [value.detail] }))
for (const id of ["owui-file", "fastapi-superuser-read"]) {
  const full = JSON.parse(readFileSync(path.join(root, "inputs", id, "full", "authoring.json"), "utf8"))
  briefs.push({ id, repository: full.repository, sourceRef: full.sourceRef,
    entry: Object.values(full.entries as Record<string, { name: string }>)[0]!.name,
    acceptedPolicy: Object.values(full.policies as Record<string, { text: string }>)[0]!.text,
    currentQuestion: full.request, boundary: "declared-entry",
    premises: Object.values(full.analysisContract.scenarios as Record<string, { premises: Array<{ statement: string }> }>)[0]!.premises.map(item => item.statement),
    requiredResponseDetails: Object.values(full.analysisContract.scenarios as Record<string, { requiredResponseDetails: string[] }>)[0]!.requiredResponseDetails })
}
writeJson(path.join(root, "public-briefs.json"), { schemaVersion: "authorization-aj-public-briefs/v1",
  commonInstruction: "Decide the stated authorization scenario at the declared entry from supplied fixed source and accepted policy. Treat premises as assumptions, cite exact supplied-source locations for the control and effect, preserve decisive unknowns, and do not execute the target or infer deployment facts.",
  cases: briefs })

process.stdout.write(`${cases.length + 2} baseline/full cases and evidence requests materialized.\n`)
