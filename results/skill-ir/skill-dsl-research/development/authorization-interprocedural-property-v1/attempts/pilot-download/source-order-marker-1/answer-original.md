## Result

No cross-root authorization change was found in the inspected download flow. Version selection can change the `Document` whose file is returned, but authorization remains against that document family’s **root document**.

### Request and authorization flow

1. `DocumentViewSet.download` is a GET detail action. It passes the path `pk` and request to `file_response(..., "attachment")`; missing documents/files become 404 responses.  
   `src/documents/views.py:1834-1839`

2. Under normal DRF dispatch, the viewset configures `IsAuthenticated` and `PaperlessObjectPermissions`, and DRF evaluates request permissions before calling the action.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/views.py:331-342,404-421,490-529`

3. `file_response` loads `pk` as `request_doc`, including deleted rows, then derives `root_doc`. It explicitly checks:
   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```
   Failure returns 403 before selecting or serving a file.  
   `src/documents/views.py:1401-1441`

4. The owner-aware check succeeds when the root document:
   - is unowned;
   - is owned by `request.user`; or
   - grants that user `view_document` through the object-permission checker.  
   `src/documents/permissions.py:624-635`

Ownership and grants were not supplied, so authorization for a particular user remains conditional.

### Version selection

After authorizing `root_doc`, the code determines `file_doc`:

- If the path `pk` itself identifies a version and there is no `version` query parameter, that requested version remains `file_doc`.
- Without an explicit version otherwise, it selects the latest version associated with the root.
- With `version=<id>`, the candidate is accepted only when it is either:
  - the authorized root itself, or
  - a document whose `root_document_id` equals the authorized root’s ID.
- Missing, invalid, or unrelated version IDs produce NotFound/404 rather than another document’s file.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:140-195`

Therefore, selecting a version **changes the file-bearing object but not the resource being authorized**. The authorization object remains `root_doc`, and the selected object is constrained to that root’s version family.

### Original versus archive

Representation selection happens only after `file_doc` is chosen:

- `original=true` exactly selects `file_doc.source_file`.
- Otherwise, `file_doc.archive_file` is returned when that same document has an archive version.
- If it has no archive, the source file is returned.
- `follow_formatting` changes the download filename, not document selection or authorization.

`src/documents/views.py:1368-1373,1429-1448,4941-4965`

### Relevant limitations

The concrete outcome cannot be determined without:

- the authenticated identity;
- the root document’s owner/unowned state;
- applicable `view_document` object grants;
- the actual `pk`, `version`, and `original` values;
- deletion/archive state and backing-file existence.

The `request.user is not None` condition means the explicit root check is skipped for a direct internal invocation with a null user. Normal DRF dispatch is protected by `IsAuthenticated`; whether any deployment exposes this method outside that dispatch path was not established from the reviewed source.

The authorization evidence checker also retained an interpretation gap linking `_resolve_request_and_root_doc` into its machine-level effect trace. The source-level conclusions above are therefore bounded and manually source-grounded rather than a fully accepted end-to-end machine proof.