## Request entry and document identification

`DefaultRouter` registers `UnifiedSearchViewSet` under `documents`, and the router is mounted below `/api/`. Because `UnifiedSearchViewSet` inherits `DocumentViewSet`, its detail `download` action is exposed as:

```text
GET /api/documents/{pk}/download/
```

The router supplies `{pk}` to `download(request, pk)`, which immediately calls `file_response(pk, request, "attachment")`. [src/paperless/urls.py:74-77](src/paperless/urls.py#L74-L77) [src/paperless/urls.py:97-100](src/paperless/urls.py#L97-L100) [framework/rest_framework-3.18.1/rest_framework/routers.py:128-134](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L134) [src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839) [src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507)

`file_response` resolves `{pk}` using `Document.global_objects`, so the directly requested row may be either a root document or one of its versions and may be deleted. It then derives `root_doc`: a root points to itself; a version normally points to its `root_document`. [src/documents/views.py:1401-1420](src/documents/views.py#L1401-L1420) [src/documents/versioning.py:136-156](src/documents/versioning.py#L136-L156)

## Authorization order

The checks occur in this order:

1. **Framework request-level checks, before `download` runs.** DRF calls authentication and `check_permissions` in `initial`, before invoking the selected handler. [framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421) [framework/rest_framework-3.18.1/rest_framework/views.py:490-524](framework/rest_framework-3.18.1/rest_framework/views.py#L490-L524)
2. **Authentication.** `DocumentViewSet` declares `IsAuthenticated`, which requires an authenticated `request.user`. [src/documents/views.py:1008-1027](src/documents/views.py#L1008-L1027) [framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)
3. **Model permission.** The other class-level permission is `PaperlessObjectPermissions`. For GET it requires the model-level `view_document` permission; DRF obtains the model from the view queryset and calls `request.user.has_perms(...)`. [src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44) [framework/rest_framework-3.18.1/rest_framework/permissions.py:218-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L218-L246)
4. **Requested-row and root lookup.** Only after the preceding checks does `file_response` load `{pk}` and derive its root.
5. **Explicit root-object authorization.** Before deciding which file version or representation to return, `_resolve_request_and_root_doc` checks `view_document` against `root_doc`. Access passes when the root is unowned, is owned by the requester, or the requester has a Guardian object grant; otherwise it returns HTTP 403. [src/documents/views.py:1408-1427](src/documents/views.py#L1408-L1427) [src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)
6. **Version and original/archive selection.** These happen only after the root check succeeds. [src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)

The download action does **not** call `self.get_object()`. Consequently, DRF’s normal filtered-queryset lookup and automatic `check_object_permissions` path is not used; the relevant object check is the explicit root check above. [framework/rest_framework-3.18.1/rest_framework/generics.py:79-105](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L105) [src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

## Version-selection branches

After root authorization, `_get_effective_file_doc` chooses `file_doc`:

- **`{pk}` identifies a version and there is no `version` query parameter:** that exact requested version is returned.
- **`{pk}` identifies the root and no `version` parameter exists:** select the newest non-deleted version belonging to that root; if none exists, use the root itself.
- **A `version` parameter is present:** selection is relative to the already-authorized root, regardless of whether `{pk}` named the root or another version.
  - A nonempty value must parse as an integer.
  - The selected row must be either the root itself or a version whose `root_document_id` equals that root’s ID.
  - A nonexistent or unrelated ID produces 404, preventing selection of a version from another document family.
  - A non-integer value produces “Invalid version parameter” as a 404.
- **`?version=` with an empty value:** presence of the parameter prevents the direct-version shortcut, but the resolver treats its empty value like “latest.” Because the parameter is present, that latest-version lookup includes deleted rows.
- Explicit nonempty version selection also uses `global_objects`, so a deleted version can be selected.
- A directly requested version without a `version` parameter can likewise be deleted because the initial `{pk}` lookup used `global_objects`.

[src/documents/views.py:1375-1399](src/documents/views.py#L1375-L1399) [src/documents/versioning.py:140-143](src/documents/versioning.py#L140-L143) [src/documents/versioning.py:159-195](src/documents/versioning.py#L159-L195)

Thus, choosing another version does **not** change the authorization object: authorization remains against `root_doc`. Version selection changes only the `Document` row whose file properties are used after that authorization. The same-root constraint prevents an explicit version parameter from crossing into an unrelated root.

## Original versus archive representation

Once `file_doc` is known:

- `?original=true`, exactly and case-sensitively, forces the source/original representation.
- Otherwise, the archive representation is used when `file_doc.archive_filename` is non-null.
- If no archive exists, the source/original representation is used even without `original=true`.
- Other `original` values—including `false`, `True`, or an empty value—do not request the original and therefore retain the archive-if-present default.

[src/documents/views.py:1368-1373](src/documents/views/views.py#L1368-L1373) [src/documents/views.py:1442-1447](src/documents/views.py#L1442-L1447) [src/documents/models.py:452-475](src/documents/models.py#L452-L475)

For the final response:

- **Archive:** opens `file_doc.archive_file`, reports `application/pdf`, and uses either the stored archive filename or an archive-form public filename.
- **Original:** opens `file_doc.source_file`, reports `file_doc.mime_type`, and uses either its stored filename or public filename.
- The response is a `FileResponse` with `Content-Disposition: attachment`.
- `follow_formatting` affects the response filename, not the selected bytes or authorization resource. It is passed through without Boolean parsing, so any nonempty query-string value—including `"false"`—is truthy where the filename branch is evaluated.

[src/documents/views.py:4941-4995](src/documents/views.py#L4941-L4995) [src/documents/models.py:477-502](src/documents/models.py#L477-L502)

A missing requested document, invalid/unrelated version, or missing physical file results in 404; root-object denial results in 403. [src/documents/views.py:1382-1386](src/documents/views.py#L1382-L1386) [src/documents/views.py:1414-1426](src/documents/views.py#L1414-L1426) [src/documents/views.py:1835-1839](src/documents/views.py#L1835-L1839)

## Unavailable facts and the conclusions they block

- **The user’s global `view_document` grant is unspecified.** Therefore, source alone cannot establish that the request passes the class-level model permission.
- **Root ownership and Guardian grants are unspecified.** Therefore, it cannot establish whether a particular authenticated user passes the root-object check. Conditional result: unowned root, requester-owned root, or a matching root grant passes; otherwise 403.
- **Authentication backend/settings and credentials are outside the allowed evidence.** They prevent identifying how a real request becomes the assumed authenticated principal, though they do not alter the traced post-authentication branches.
- **Runtime document/version rows and deletion state are unavailable.** They prevent identifying the concrete `request_doc`, root, latest version, or whether version selection ends in 404.
- **`archive_filename` and the actual query parameters are unavailable.** They prevent deciding whether archive or original is returned in a particular request.
- **Storage settings and filesystem contents are unavailable.** They prevent naming the concrete filesystem path or establishing that opening the selected file succeeds rather than producing 404.

Accordingly, the source establishes that authorization is rooted at the document family’s root and precedes effective version/representation selection, but it does not establish that any particular user is authorized or which concrete file that user would receive.