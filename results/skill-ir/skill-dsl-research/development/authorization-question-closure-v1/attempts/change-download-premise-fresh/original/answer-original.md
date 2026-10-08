## Result: conditional, with unresolved semantic-validation gaps

### Request and file selection

- `DocumentViewSet.download` is a GET detail action. The route-provided `pk` identifies the requested document record; the action calls `file_response(pk, request, "attachment")` (`src/documents/views.py:1834-1839`).
- `file_response` loads `request_doc` by `id=pk` using `Document.global_objects`, including deleted records (`src/documents/views.py:1401-1415`, `1429-1434`).
- It derives `root_doc` and checks:
  `has_perms_owner_aware(request.user, "view_document", root_doc)`.
  Failure returns HTTP 403 before file/version selection (`src/documents/views.py:1417-1427`).
- After authorization:
  - If `request_doc` is a version and no version parameter exists, that `request_doc` becomes `file_doc`.
  - Otherwise, the version is resolved relative to `root_doc`.
  - Invalid or absent resolutions produce 404 (`src/documents/views.py:1375-1399`).
- Representation selection then passes `file_doc` to `serve_file`:
  - `original=true` selects the original.
  - Otherwise, the archive is used when `file_doc.has_archive_version`; without an archive it falls back to the original.
  - The response uses attachment disposition (`src/documents/views.py:1368-1373`, `1429-1448`).
- Missing documents/files become 404 (`src/documents/views.py:1835-1839`).

### Authorization order and resource

DRF performs authentication and view-level permission checks before invoking the action (`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`, `490-523`). `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions` (`src/documents/views.py:1008-1027`).

The explicit application-level object check on this path is nevertheless performed against **`root_doc`**, not:

- the `pk`-selected `request_doc`,
- an alternate version selected afterward, or
- the original/archive representation.

Consequently:

1. Authentication and view-level checks run first.
2. `request_doc` is loaded and `root_doc` derived.
3. `view_document` is checked on `root_doc`.
4. Only after success is `file_doc` or an alternate version selected.
5. Original versus archive is selected last.

No second permission check on the selected `file_doc` is visible in the reviewed branch.

### Effect of alternate versions and representations

Selecting another version can change the document passed to `serve_file`, but does not change the resource used by the explicit authorization check. Likewise, `original=true` or archive fallback changes only the file representation.

Therefore, the premise that the caller owns the requested document is insufficient for a universal allow conclusion when that record is a version whose distinct root document has unspecified ownership or grants. If the root-document check fails, the result is 403 before any representation is selected.

### Missing facts and limits

The following block a definitive runtime result:

- whether `pk` identifies a root document or a version;
- ownership and object grants on the derived root document;
- the exact version and `original` query parameters;
- archive and underlying file existence;
- the complete implementation of `has_perms_owner_aware`;
- the complete version-resolution and `serve_file` implementations.

The source trace establishes the ordering and the root-document authorization target, but the automated authorization check remained rejected because framework/decorator and exception-call relations were not fully semantically linked. These conclusions should therefore be treated as source-grounded but partially unreviewed, not as a confirmed vulnerability finding.