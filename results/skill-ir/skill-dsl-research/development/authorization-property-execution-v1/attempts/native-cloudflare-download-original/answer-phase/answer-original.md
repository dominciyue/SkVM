## Source-supported behavior

**Review status: partial / unreviewed.** The final structured check failed because the analysis graph did not link `file_response()` to `_resolve_request_and_root_doc()`, even though both bodies were read. The conclusions below are direct source observations, not a confirmed vulnerability finding.

### Request and authorization flow

1. `DocumentViewSet.download()` passes the URL `pk` and request to `file_response()` with attachment disposition. Missing document or file exceptions become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`. `IsAuthenticated` requires an authenticated `request.user`.  
   `src/documents/views.py:1021`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:150-151`

3. `file_response()` resolves `pk` as `request_doc`, derives its `root_doc`, and performs an explicit owner-aware `view_document` check **against `root_doc`**. Failure returns HTTP 403 before file selection.  
   `src/documents/views.py:1401-1427`

Therefore, the decisive in-method authorization resource is the requested document’s **root document**, not the subsequently selected version file.

### Version selection

After root authorization:

- If `pk` already identifies a version and no `version` query parameter is supplied, that `request_doc` is used directly.
- Otherwise, version resolution starts from `root_doc`.
- Without an explicit version, it resolves the latest version for that root.
- With a `version` parameter, the candidate must be either the root itself or a document whose `root_document_id` equals that root’s ID.
- Invalid, unavailable, or unrelated versions produce NotFound/404.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:169-195`

**Answer to the key question:** selecting another version can change the `file_doc` whose bytes are returned, but it does **not** change the authorization object. Authorization remains against the root derived from the original `pk`. The version parameter cannot select a document outside that root’s version family.

Changing the URL `pk` to a document in another family is different: that derives another `root_doc`, which is then separately authorized.

### Original versus archive representation

For the effective `file_doc`:

- `original=true` exactly selects `file_doc.source_file`.
- Otherwise, `file_doc.archive_file` is selected when an archive exists.
- If no archive exists, the source file is returned.
- This representation choice occurs after root authorization and does not cause another authorization check against a different document.

`src/documents/views.py:1369-1373`  
`src/documents/views.py:1429-1448`  
`src/documents/views.py:4941-4965`

### Relevant outcomes

- Unauthenticated caller: rejected by `IsAuthenticated`.
- Authenticated caller lacking owner-aware `view_document` permission on `root_doc`: HTTP 403.
- Missing requested document/file: HTTP 404.
- Invalid or unrelated version: NotFound/HTTP 404.
- Authorized root and valid version: selected version’s source or archive bytes are returned.

The concrete outcome remains unknown because the requested `pk`, version/original parameters, ownership relationship, and authenticated user’s object grants were not supplied. No authorization bypass is established from the reviewed source.