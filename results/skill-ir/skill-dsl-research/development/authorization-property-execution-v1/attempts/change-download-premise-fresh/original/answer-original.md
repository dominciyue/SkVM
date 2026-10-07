## Download authorization behavior

**Status:** Partial/unreviewed. The final automated semantic check failed because it did not link `file_response()` to the already-read `_resolve_request_and_root_doc()` body. The conclusions below are retained direct-source observations.

### Control flow

1. `download` is a detail GET action that returns `file_response(pk, request, "attachment")`; missing documents/files become 404.  
   `src/documents/views.py:1834-1839`

2. The viewset applies:
   - `IsAuthenticated`; and
   - `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1027`

   For GET, `PaperlessObjectPermissions` requires the global `view_document` model permission at the view-level gate. Owning one document does not by itself establish this global permission.  
   `src/documents/permissions.py:30-53`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`

3. The requested `pk` is loaded as `request_doc`, including deleted documents. Its version-family root is derived as `root_doc`. The explicit download-specific object check is:

   `has_perms_owner_aware(request.user, "view_document", root_doc)`

   Failure returns 403 before file selection.  
   `src/documents/views.py:1401-1427`

   That check permits access when the **root document**:
   - has no owner;
   - is owned by the caller; or
   - grants the caller `view_document` through the object-permission backend.  
   `src/documents/permissions.py:624-635`

### Requested document versus selected version

The resource explicitly authorized is **`root_doc`**, not necessarily the `pk`-selected `request_doc` and not the subsequently selected version.

After that root check:

- If `pk` already names a child version and there is no `version` query parameter, that exact `request_doc` supplies the file.
- Otherwise, selection occurs within `root_doc`’s version family:
  - no `version` parameter selects the latest version, falling back to the root;
  - a version ID must identify either the root or a child whose `root_document_id` equals that root;
  - missing, invalid, or unrelated versions produce 404/NotFound.  
  `src/documents/views.py:1375-1399`  
  `src/documents/versioning.py:140-195`

**Therefore, selecting another version changes the file-bearing `Document`, but does not change the resource authorized.** The selected version’s separate owner or object grants are not rechecked on this path; authority is derived from the root document.

### Original versus archive

Once `file_doc` is selected:

- `original=true` causes its `source_file` to be returned.
- Otherwise, its `archive_file` is returned when an archive exists; if not, `source_file` is returned.

This changes only the representation of the already selected `file_doc`, not the authorization object.  
`src/documents/views.py:1369-1373, 1429-1448, 4941-4965`

### Outcome under the stated premise

The caller owning the requested document is insufficient to determine the outcome:

- If `pk` names the root, that ownership satisfies the explicit root-owner check, but the caller must still pass the global GET `view_document` gate.
- If `pk` names a child version, ownership of that child does **not** establish authorization: ownership or grants on its related root are unspecified.
- Access is allowed only if the upstream view-level permissions pass and the owner-aware check on `root_doc` passes.

No deployment fact is needed to describe these branches. The unresolved facts are runtime authorization facts: the caller’s global `documents.view_document` permission and, where different, the root document’s owner/object grants.