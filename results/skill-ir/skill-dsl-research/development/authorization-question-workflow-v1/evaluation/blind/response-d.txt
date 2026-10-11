## Conclusion

Authorization is evaluated against the **root document**, not against the selected version row or its original/archive file. Version and representation selection happen only after that root-document authorization succeeds. Consequently, the authorized object and returned `file_doc` can differ, but an explicit version must be the root itself or one of that root’s versions.

The automated property checker remained unresolved, so this is a source-derived trace rather than a machine-certified whole-task verdict.

## Request entry and authorization order

1. `UnifiedSearchViewSet`, a subclass of `DocumentViewSet`, is registered under `documents` beneath `/api/`. DRF’s detail-action route makes the endpoint `GET /api/documents/{pk}/download/`.  
   `src/paperless/urls.py:74-77,97-100,297`  
   `src/documents/views.py:2503-2507,1834-1839`  
   `framework/rest_framework-3.18.1/rest_framework/routers.py:128-134`

2. Before calling `download`, DRF performs authentication and view-level permission checks.  
   `framework/rest_framework-3.18.1/rest_framework/views.py:404-421`

3. The inherited permission classes are:
   - `IsAuthenticated`;
   - `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1027`

   `IsAuthenticated` requires an authenticated user. For GET, `PaperlessObjectPermissions` maps the request to `view_document`; its inherited `has_permission` checks that permission against the `Document` model before the handler runs.  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151,218-246`  
   `src/documents/permissions.py:30-44`

4. `download()` delegates to `file_response(pk, request, "attachment")`. The supplied `pk` is looked up directly as `request_doc` using `Document.global_objects`, so the initial lookup includes deleted rows. Missing rows become 404.  
   `src/documents/views.py:1401-1415,1429-1436,1834-1839`

5. The code derives `root_doc`:
   - a root document remains itself;
   - a version maps to its `root_document`, with a lookup fallback if needed.  
   `src/documents/versioning.py:146-156`

6. The decisive object authorization is then:

   `has_perms_owner_aware(request.user, "view_document", root_doc)`

   It succeeds when the root is unowned, is owned by the requester, or the requester has the Guardian-backed object permission. Failure returns HTTP 403.  
   `src/documents/views.py:1417-1427`  
   `src/documents/permissions.py:624-635`

This custom path does not call DRF’s `get_object()`, which is where DRF ordinarily invokes `check_object_permissions`. The explicit root check above is therefore the material object-level check for Download.  
`framework/rest_framework-3.18.1/rest_framework/generics.py:79-105`

## Version selection

Only after root authorization succeeds does `_get_effective_file_doc` select the returned document row.  
`src/documents/views.py:1435-1441`

Branches:

- **The URL `pk` names a version and no `version` query parameter is present:** that exact requested version becomes `file_doc`.  
  `src/documents/views.py:1388-1399`

- **Otherwise, no `version` parameter:** select the newest non-deleted version under the root, ordered by descending `version_index`, then descending ID; if no version exists, use the root itself.  
  `src/documents/versioning.py:23-28,159-182`

- **Nonempty `version=<id>`:** parse the value as an integer and look it up with deleted rows included. It may identify:
  - the root itself, or
  - any version whose `root_document_id` equals the authorized root’s ID.

  A nonexistent or unrelated ID returns 404, preventing selection of a version from a different root. A non-integer value raises a 404-style `NotFound("Invalid version parameter")`.  
  `src/documents/views.py:1375-1386`  
  `src/documents/versioning.py:169-195`

- **Edge case `?version=`:** the view treats the parameter as present when deciding to include deleted rows, but the resolver treats its empty value as “no explicit version.” It therefore selects the newest version while including deleted versions.  
  `src/documents/views.py:1375-1381`  
  `src/documents/versioning.py:175-182`

Thus an alternate version changes the returned `file_doc`, but does **not** change the authorization resource: authorization remains on `root_doc`. There is no second owner/grant check against the chosen version.

## Original versus archive selection

After `file_doc` is selected:

- Only the exact query value `original=true` counts as requesting the original. The comparison is case-sensitive.
- Otherwise, the archive is used when `file_doc.has_archive_version` is true.
- If no archive exists, the original/source file is used regardless.  
  `src/documents/views.py:1368-1373,1442-1448`

`has_archive_version` means `archive_filename is not None`. The logical files are opened from `ORIGINALS_DIR` or `ARCHIVE_DIR`.  
`src/documents/models.py:452-475`

Response construction:

- **Archive:** `doc.archive_file`, MIME type `application/pdf`.
- **Original:** `doc.source_file`, using the document’s MIME type.
- Both become a `FileResponse` with attachment disposition. Missing physical files become 404.  
  `src/documents/views.py:1835-1839,4941-4973`

`follow_formatting` only changes the download filename—on-disk filename versus public filename—not the selected document or file representation. Because the implementation passes the raw query-string value as a Boolean, any nonempty value, including `follow_formatting=false`, is truthy at this point.  
`src/documents/views.py:1447,4953-4965,4973-4995`

## Facts not supplied

| Missing fact | Conclusion it prevents |
|---|---|
| Whether the user has the model-level `documents.view_document` permission | Whether the request passes DRF’s pre-handler permission gate |
| Root ownership, whether it is unowned, and the user’s object grants | Whether the root-document check returns success or 403 |
| The actual `pk`, root/version relationships, deletion state, and version ordering | Which document row becomes `request_doc`, `root_doc`, and ultimately `file_doc` |
| Exact `version`, `original`, and `follow_formatting` query values | Which version, representation, and response filename branch executes |
| Whether the selected document has `archive_filename` | Whether the archive or source representation is selected |
| Physical storage contents and configured original/archive directories | Whether opening the selected file succeeds or returns 404, and its concrete filesystem path |
| Authentication-class and deployment configuration outside the allowed evidence | How the requester becomes authenticated; it does not alter the demonstrated requirement that Download reaches the handler only after DRF authentication and permission checks |

Therefore, the source establishes the ordering and authorization resource, but the unspecified ownership and grant facts prevent an unconditional conclusion that any particular authenticated user is allowed or denied.