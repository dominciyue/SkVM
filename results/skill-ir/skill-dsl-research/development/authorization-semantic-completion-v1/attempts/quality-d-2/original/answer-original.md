## Status

**Partial / unreviewed trace.** The local control flow is source-supported, but the final authorization checker could not certify the complete routed call chain because the action-registration/class-decorator dependency and one `file_response → _resolve_request_and_root_doc` semantic link remained unresolved.

## Download and file selection

1. `DocumentViewSet.download` is a GET detail action. Its route-supplied `pk` is passed to `file_response(..., disposition="attachment")`. Missing document or file conditions become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. `file_response` resolves `pk` into:
   - `request_doc`: the directly addressed document;
   - `root_doc`: its root document.

   Because it passes `include_deleted=True`, this initial lookup uses the manager that includes deleted documents.  
   `src/documents/views.py:1397-1448`

3. Effective version selection occurs after the root permission check:
   - If `pk` names a version and no explicit `version` parameter exists, that `request_doc` remains the effective `file_doc`.
   - Otherwise, the requested/default version is resolved relative to `root_doc`.
   - An explicit version parameter enables deleted-version resolution.
   - An invalid version raises `NotFound`; no resolved document produces 404.  
   `src/documents/views.py:1375-1395`

4. Representation selection:
   - Exact `?original=true` selects the original.
   - Otherwise, archive is used if the selected `file_doc.has_archive_version`.
   - If no archive exists, it falls back to the original.  
   `src/documents/views.py:1369-1373,1429-1448`

5. `serve_file` then uses:
   - archive: `doc.archive_file`, PDF content type;
   - original: `doc.source_file`, the document MIME type.

   It constructs a `FileResponse`. `follow_formatting` changes stored-filename versus public-filename formatting, not the authorization object.  
   `src/documents/views.py:4941-4995`

## Authorization and ordering

`DocumentViewSet` configures:

- `IsAuthenticated`
- `PaperlessObjectPermissions`

`src/documents/views.py:1008-1027`

DRF performs authentication and view-level permission checks before dispatching the action handler.  
`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`

Inside the Download path:

1. Resolve `request_doc` and `root_doc`.
2. Evaluate:

   `has_perms_owner_aware(request.user, "view_document", root_doc)`

3. Return HTTP 403 if that fails.
4. Only after it passes, select the effective version and original/archive representation.
5. Construct the file response.

`src/documents/views.py:1397-1448`

Therefore, the directly observed application-level object authorization is against **`root_doc`**. The selected version and original/archive representation affect the returned file, but do not replace `root_doc` as the object of that guard. No separate object-permission check on the selected `file_doc`, `archive_file`, or `source_file` is shown in this path.

## Conditional outcomes

- **Denied before the handler:** authentication or a configured DRF view-level permission fails.
- **403:** upstream checks pass, but the caller lacks owner-aware `view_document` permission on `root_doc`.
- **404/NotFound:** document, requested version, or backing file cannot be resolved.
- **File returned:** authorization passes and resolution/storage succeeds; the version and representation rules above select the file.

## Facts still missing

The following prevent an unconditional result for a concrete request:

- Caller ownership and object grants: blocks deciding whether `has_perms_owner_aware` succeeds.
- Actual `pk`, `version`, `original`, and `follow_formatting` values: blocks identifying the concrete document, version, representation, and filename.
- Archive and backing-file availability: blocks concluding that retrieval completes.
- Deployed authentication and permission-backend configuration: blocks deployment-specific identity and grant conclusions.
- Exact externally mounted route prefix: only the GET detail action and `pk` entry were established.
- Unresolved action-registration/class-decorator dependency and local callee linkage: blocks certifying this as a fully reviewed end-to-end call-chain result.