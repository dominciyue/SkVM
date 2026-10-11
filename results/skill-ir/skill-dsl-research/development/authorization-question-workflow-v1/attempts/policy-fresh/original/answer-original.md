## Conclusion

The Download path authorizes the **root document**, then selects the document version whose file will actually be returned. Consequently:

- If the selected `file_doc` is the root document, authorization and returned resource coincide.
- If `file_doc` is a child/version document, the code does **not** perform `view_document` authorization on that exact document after selection.
- Choosing original versus archive does not select another `Document`; it selects a different file representation of the already selected `file_doc`.

Therefore, branches returning a child/version document do **not enforce** the supplied policy that authorization must cover the exact document whose file is returned.

## Request entry

`UnifiedSearchViewSet`, registered under `documents`, inherits the Download action from `DocumentViewSet`. The API router is included beneath `/api/`, and DRF detail actions use the `{prefix}/{lookup}/{url_path}/` form. Thus the entry is effectively:

```text
GET /api/documents/{pk}/download/
```

[src/paperless/urls.py:74-78] [src/paperless/urls.py:97-100] [src/paperless/urls.py:297-298] [framework/rest_framework-3.18.1/rest_framework/routers.py:115-135] [src/documents/views.py:1834-1839]

The action passes the route’s `pk`, the request, and disposition `"attachment"` to `file_response`. Missing files and `Document.DoesNotExist` become HTTP 404. [src/documents/views.py:1835-1839]

## Authorization and selection order

1. **Framework-level checks occur before the action.** DRF authenticates the request and runs view-level permission checks during `initial()`. [framework/rest_framework-3.18.1/rest_framework/views.py:404-421]

2. `DocumentViewSet` declares:

   ```python
   permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
   ```

   [src/documents/views.py:1008-1027]

   For GET, `PaperlessObjectPermissions` maps the request to `view_document`. Its inherited model-permission check calls `request.user.has_perms(...)` against the `Document` model before dispatching the action. [src/documents/permissions.py:30-44] [framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246]

3. **No normal DRF object lookup occurs.** DRF’s ordinary `get_object()` would filter a queryset and invoke `check_object_permissions`, but Download never calls it; instead it performs its own direct lookup. [framework/rest_framework-3.18.1/rest_framework/generics.py:79-105] [src/documents/views.py:1429-1448]

4. `file_response` calls `_resolve_request_and_root_doc(..., include_deleted=True)`. That function:
   - looks up `pk` as `request_doc` through `Document.global_objects`;
   - derives `root_doc`;
   - checks `has_perms_owner_aware(request.user, "view_document", root_doc)`;
   - returns HTTP 403 if that check fails.

   Only after it passes does `file_response` select `file_doc`. [src/documents/views.py:1401-1441]

5. The owner-aware root check succeeds when the root is unowned, owned by the caller, or the caller has the explicit object permission on the root. [src/documents/permissions.py:624-635]

Thus the explicit object authorization resource is always `root_doc`, not `request_doc` or the subsequently selected `file_doc`.

## Version selection branches

`version` is read directly from `request.query_params`. [src/documents/versioning.py:140-143]

### No `version` parameter

- If `{pk}` identifies a child/version document, that same `request_doc` becomes `file_doc`.
- If `{pk}` identifies a root document, the resolver returns its newest non-deleted child version, or the root itself when no child exists.

[src/documents/views.py:1388-1399] [src/documents/versioning.py:159-166]

“Newest” is ordered by descending `version_index`, then descending ID. [src/documents/versioning.py:23-28]

### Empty `version=`

An empty parameter is present, so `_resolve_file_doc` enables `include_deleted`; however, the version resolver treats the empty value as false and selects the newest version. Consequently this differs from a genuinely absent parameter for a child URL and may include deleted versions. [src/documents/views.py:1375-1386] [src/documents/versioning.py:175-182]

### Nonempty `version=<id>`

The value must parse as an integer. The candidate is loaded using the deleted-inclusive manager and is accepted only if it is:

- the root itself, or
- a direct child whose `root_document_id` equals that root’s ID.

A malformed value produces “Invalid version parameter”/404; nonexistent or unrelated IDs also produce 404. [src/documents/versioning.py:184-195] [src/documents/views.py:1375-1386]

## Original versus archive

After `file_doc` is selected:

- Only the exact query value `original=true` requests the source/original file.
- Otherwise, if `file_doc.has_archive_version` is true, the archive is returned.
- Otherwise, the source/original file is returned.

[src/documents/views.py:1368-1373] [src/documents/views.py:1442-1448]

`has_archive_version` means `archive_filename is not None`. [src/documents/models.py:462-475]

The final branches are:

- **Archive:** open `doc.archive_file`, report PDF MIME type, and use either the stored archive filename or generated public archive filename.
- **Original/source:** open `doc.source_file`, use its MIME type, and use either the stored source filename or generated public filename.

Both produce a `FileResponse` with attachment disposition. [src/documents/views.py:4941-4995]

`follow_formatting` changes the download filename, not the selected bytes. Because it is passed as the raw query value, any nonempty string—including `"false"`—is truthy in the filename condition. [src/documents/views.py:1447-1448] [src/documents/views.py:4953-4965]

## Policy comparison

| Returned document | Object checked | Policy result |
|---|---|---|
| `file_doc is root_doc` | Root/exact returned document | Conforms, assuming preceding checks pass |
| Latest child selected from a root URL | Root only | Does not enforce exact-object authorization |
| Child addressed directly without `version` | Its root only | Does not enforce exact-object authorization |
| Explicit child selected with `version=<child-id>` | Root only | Does not enforce exact-object authorization |
| Original versus archive of any `file_doc` | No change; still root authorization | Representation changes, authorized object does not |

There is no post-selection call to `has_perms_owner_aware(..., file_doc)` or `check_object_permissions(request, file_doc)` before `serve_file`. [src/documents/views.py:1421-1448]

## Unavailable facts and what they prevent

- **Actual `pk`, query parameters, version graph, deletion state, and archive availability:** prevent identifying the concrete document and file returned for a particular request.
- **Caller’s global model permission, root ownership, and root object grants:** prevent deciding whether that caller passes authorization.
- **Caller’s ownership/grants on a selected child version:** prevent deciding whether the caller happens independently to be authorized for that child. They do not change the structural fact that Download does not enforce that authorization.
- **Configured authentication and Django permission backends:** prevent determining which credentials are accepted and the deployment-specific result of `has_perms`/Guardian checks.
- **Filesystem contents and media-directory configuration:** prevent guaranteeing successful completion rather than a file-related 404.
- **Middleware, proxy, and deployment behavior outside the allowed source:** prevent asserting the exact externally observed response after the application returns it.

The auxiliary machine property evaluation remained unresolved because its full dispatch and property bindings were incomplete; the conclusions above are based directly on the cited source rather than machine certification.