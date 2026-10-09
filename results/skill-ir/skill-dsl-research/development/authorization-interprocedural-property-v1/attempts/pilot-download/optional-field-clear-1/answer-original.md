## Download behavior

**Review status:** Partial/source-grounded. The final semantic check did not pass because its interprocedural model could not type-link `download(pk, request)` to `file_response(pk, request, ...)`. The source relations below were directly observed, but remain machine-unverified.

### Authorization flow

1. `DocumentViewSet.download` is a GET detail action. It calls `file_response(pk, request, "attachment")`; missing documents or files become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. The view configures both `IsAuthenticated` and `PaperlessObjectPermissions`. `IsAuthenticated` requires `request.user.is_authenticated`. For GET, `PaperlessObjectPermissions` maps to `view_document`; its inherited general permission check therefore applies before dispatch.  
   `src/documents/views.py:1008-1027`  
   `src/documents/permissions.py:30-53`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151,233-246`

3. `file_response` loads the `Document` identified by route `pk`, including deleted rows, and derives its root document. It then explicitly checks:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   Failure returns HTTP 403 before version selection or file serving.  
   `src/documents/views.py:1401-1448`

4. That owner-aware check succeeds when the root document:
   - has no owner;
   - is owned by the authenticated user; or
   - has the applicable Guardian object grant for that user.

   Ownership and grants are unspecified here, so the actual request may allow or deny.  
   `src/documents/permissions.py:624-635`

### Requested document versus selected version

The route `pk` first identifies `request_doc`; authorization is performed against its `root_doc`. Only afterward is `file_doc` selected:

- If `pk` directly identifies a version and there is no `version` query parameter, that version is served.
- Otherwise, with no `version` parameter, the latest version for the root is selected, falling back to the root.
- With `?version=<id>`, that exact document is selected only if it is:
  - the root itself, or
  - a version whose `root_document_id` equals that root’s ID.
- A malformed version value produces “Invalid version parameter”; a missing or unrelated ID produces 404.
- Explicit version lookup includes deleted versions.

`src/documents/views.py:1375-1441`  
`src/documents/versioning.py:140-195`

**Therefore, selecting another version can change the `Document` row and bytes returned, but it does not change the resource authorized.** The permission check remains on the common `root_doc`; an unrelated document cannot be selected through the version parameter.

### Original versus archive

After `file_doc` is selected:

- `original=true` causes `file_doc.source_file` to be returned.
- Otherwise, `file_doc.archive_file` is returned when an archive exists.
- If no archive exists, the source file is returned.
- `follow_formatting` affects the filename, not document selection or authorization.

`src/documents/views.py:1368-1373,1442-1448,4941-4973`

Thus original/archive selection changes only the representation of the already selected `file_doc`, not the authorization object.

### Precise unresolved facts

- The root document’s owner and the authenticated user’s global/object grants are not supplied.
- Authentication-backend configuration determining how `request.user` is established was outside the reviewed source.
- Storage backend state and file existence determine whether the authorized operation ultimately returns bytes or 404.
- The semantic checker retained an unresolved caller-to-helper typing link, so this explanation is **partial/unreviewed**, despite the directly observed source branches.