## Result

The download path authorizes the **root document**, then may return bytes from a different document version within that root’s version family.

Selecting another version can therefore change the document/file that supplies the response, but **does not change the resource against which object authorization is checked**. No separate per-version object-permission check appears in this path.

## Control flow

1. `DocumentViewSet` requires `IsAuthenticated` and `PaperlessObjectPermissions` (`src/documents/views.py:1008-1027`).
   - DRF checks these permissions before invoking the action (`framework/rest_framework-3.18.1/rest_framework/views.py:331-342`, `:490-529`).
   - For GET, `PaperlessObjectPermissions` requires the model-level view permission (`src/documents/permissions.py:30-53`; `framework/rest_framework-3.18.1/rest_framework/permissions.py:240-314`).

2. `download()` passes the URL `pk` to `file_response()` (`src/documents/views.py:1835-1839`).

3. `file_response()` loads that requested document, including deleted records, and derives its root document (`src/documents/views.py:1401-1448`).

4. The explicit object check is performed against the **root document** using `has_perms_owner_aware(..., "view_document", root_doc)`.
   - It passes when the root is unowned, the user owns the root, or the user has the corresponding object grant.
   - Otherwise the operation returns 403 (`src/documents/permissions.py:624-635`; `src/documents/views.py:1401-1427`).
   - Ownership and grants are unspecified here, so no particular caller can be said to pass this branch.

5. The effective file document is then selected:
   - If the URL `pk` already identifies a version and no `version` query is supplied, that requested version is used.
   - If the URL identifies the root and no `version` is supplied, the latest version is selected.
   - An explicit `version` value can resolve only to the root itself or a child whose `root_document_id` matches that root. A version from another family is rejected (`src/documents/views.py:1368-1399`; `src/documents/versioning.py:136-200`).

6. Representation selection occurs on that effective file document:
   - `original=true` returns `source_file`.
   - Otherwise `archive_file` is returned when an archive exists, with fallback to `source_file` (`src/documents/views.py:1429-1448`, `:4941-4995`).

Thus neither `version=…` nor `original=true` causes authorization to move to a different object. They affect the returned bytes only after the root authorization check.

## Relevant failure branches

- Authentication or model-level permission fails: DRF rejects the request before `download()`.
- Root owner-aware permission fails: explicit 403.
- Invalid version syntax: DRF `NotFound`.
- Missing requested document/version or version outside the root family: 404.
- Missing underlying file: caught by `download()` and converted to 404.

## Unspecified facts

The concrete result remains conditional on:

- the caller’s authentication and global `documents.view_document` permission;
- the root’s owner/unowned state and any object grant;
- existence, deletion state, and family membership of the requested document/version;
- archive availability and the exact query parameters;
- configured authentication and object-permission backends, plus any deployment-layer controls outside the reviewed source.

**Validation limitation:** the retained source analysis is partial/unreviewed by the structured semantic checker because its internal model typed the entry `request` as a value but the helper parameter as a principal. That tooling linkage failure is not evidence of an application vulnerability.