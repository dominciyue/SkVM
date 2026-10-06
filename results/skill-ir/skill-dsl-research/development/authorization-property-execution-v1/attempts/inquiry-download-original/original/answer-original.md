## Source-based behavior analysis

**Status:** Partial/unreviewed. The final authorization checker rejected the structured result because the delegated return/exception semantics were not fully linked in its semantic graph. The source conclusions below remain directly supported.

### Request and authorization flow

1. `DocumentViewSet.download()` passes the URL `pk` and authenticated request to `file_response()` with attachment disposition. Missing document/file errors become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. The viewset applies:
   - `IsAuthenticated`; and
   - `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1027`

   For GET requests, `PaperlessObjectPermissions` requires the model-level `view_document` permission.  
   `src/documents/permissions.py:35-44`

3. Independently of normal DRF object retrieval, `_resolve_request_and_root_doc()`:
   - loads the document identified by `pk` as `request_doc`, including deleted version rows;
   - derives `root_doc`;
   - checks `has_perms_owner_aware(request.user, "view_document", root_doc)`;
   - returns HTTP 403 if that check fails.  
   `src/documents/views.py:1401-1427`

4. That owner-aware check succeeds if the **root document**:
   - has no owner;
   - is owned by the authenticated user; or
   - has an applicable `view_document` object grant for the user.  
   `src/documents/permissions.py:624-635`

### Version selection versus authorization

Authorization is performed against `root_doc` **before** choosing the effective file version.

After authorization:

- If `pk` directly identifies a version and no `version` query parameter is supplied, that `request_doc` remains the effective `file_doc`.
- Otherwise, `_resolve_file_doc(root_doc, request)` resolves the requested or default version from the root. Invalid or absent resolutions produce 404-style failures.  
  `src/documents/views.py:1375-1399`

Therefore, **selecting another version may change the document row and bytes returned, but it does not change the resource checked by the explicit owner/object-grant authorization: that resource remains the root document.**

### Original versus archive representation

For the already-selected `file_doc`:

- `original=true` selects `file_doc.source_file`.
- Otherwise, if that version has an archive representation, `file_doc.archive_file` is returned.
- If no archive exists, it falls back to `source_file`.  
  `src/documents/views.py:1368-1373,1429-1448,4941-4965`

Thus, original/archive selection changes only the representation of the effective version; it does not trigger authorization against a different object.

### Concrete outcome

The concrete allow/deny result is **unknown** because root-document ownership and object-grant facts were not supplied:

- qualifying owner/ownerless/grant state → file returned;
- failed root `view_document` check → HTTP 403;
- missing document, invalid version, or missing file → 404-style response.

No deployment fact is required to describe these source branches.