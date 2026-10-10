## Download request flow

### 1. Routing and document identifier

`UnifiedSearchViewSet` is registered as `documents` under the `/api/` router, and inherits `DocumentViewSet`:

- `src/paperless/urls.py:74-77,97-100,297`
- `src/documents/views.py:2503-2507`

The `download` method is a detail `GET` action, so the normal route is:

```text
GET /api/documents/{pk}/download/
```

The path `{pk}` initially identifies either a root document or one of its version records. DRF generates detail-action routes in the form `{prefix}/{lookup}/{url_path}/` (`framework/rest_framework-3.18.1/rest_framework/routers.py:115-135`).

### 2. Authentication and authorization order

Before `download()` executes, DRF:

1. authenticates the request;
2. checks all view-level permission classes;
3. only then invokes the action.

This ordering is in `framework/rest_framework-3.18.1/rest_framework/views.py:404-421`.

`DocumentViewSet` declares:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

at `src/documents/views.py:1008-1027`. The action does not override these permissions (`src/documents/views.py:1834-1839`).

For this `GET`, the initial checks therefore require:

- an authenticated user; and
- the global/model-level `documents.view_document` permission, because `PaperlessObjectPermissions` maps `GET` to `view_<model>` (`src/documents/permissions.py:30-44`) and its inherited `has_permission()` calls `request.user.has_perms()` for the queryset model (`framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`).

The action does **not** use DRF's normal `get_object()`, which would automatically call `check_object_permissions()` (`framework/rest_framework-3.18.1/rest_framework/generics.py:79-105`). Instead, it performs its own lookup and object authorization.

### 3. Request document and root authorization

`download()` calls `file_response(pk, request, "attachment")` (`src/documents/views.py:1834-1839`).

`file_response()` first calls `_resolve_request_and_root_doc(..., include_deleted=True)`:

1. It looks up the path `pk` through `Document.global_objects`, including soft-deleted records.
2. It loads that record as `request_doc`.
3. If it is a version, `get_root_document()` resolves its root; otherwise the record itself is the root.
4. It applies `has_perms_owner_aware(user, "view_document", root_doc)`.
5. Failure returns `403 Insufficient permissions`; a missing `pk` produces 404.

See `src/documents/views.py:1401-1441` and `src/documents/versioning.py:146-156`.

The root check succeeds exactly when one of these is true:

- `root_doc.owner is None`;
- `root_doc.owner == request.user`; or
- Guardian's `ObjectPermissionChecker` reports `view_document` on `root_doc`.

That condition is defined at `src/documents/permissions.py:624-635`.

Consequently, passing the root object check still presupposes that the earlier model-level `documents.view_document` check passed.

## Version selection branches

Version selection happens **after authorization of the root document**.

### No `version` query parameter

There are two cases:

- **Path `pk` identifies a version:** that exact version is returned.
- **Path `pk` identifies the root:** the newest version is returned; if there are no versions, the root itself is returned.

The special handling for a version path is at `src/documents/views.py:1388-1399`. “Newest” is ordered by descending `version_index`, then descending ID, and falls back to the root when no version exists (`src/documents/versioning.py:23-28,159-166`).

### `version` query parameter present

When `?version=<id>` is present, selection is resolved relative to the already-authorized root:

- A numeric ID equal to the root ID is accepted.
- A numeric ID whose `root_document_id` equals the authorized root ID is accepted.
- An ID belonging to an unrelated document/root is rejected as not found.
- A nonexistent ID is rejected as not found.
- A non-integer value produces `NotFound("Invalid version parameter")`.
- An empty `?version=` is treated as requesting the latest version, because the parameter is present for dispatch purposes but falsy inside the resolver.

See `src/documents/views.py:1375-1386` and `src/documents/versioning.py:169-195`.

Because download passes `include_deleted=True`, version resolution also uses `Document.global_objects`; a soft-deleted requested record or related version can therefore participate if it exists and the root authorization succeeds.

The root/version relationship is an explicit self-referencing foreign key (`src/documents/models.py:315-330`), and the membership check prevents `?version=` from selecting an arbitrary document outside the authorized root.

## Original versus archive selection

After the effective version record (`file_doc`) is chosen, `file_response()` selects its representation:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

`src/documents/views.py:1429-1448`.

Branches:

- `?original=true` — exact lowercase string `"true"` — forces the selected version's original/source file.
- Any other value, including `original=false`, `original=1`, or omission, does not request original.
  - If the selected version has an archive file, the archive is returned.
  - Otherwise it falls back to the original/source file.

`original_requested()` is at `src/documents/views.py:1368-1373`. Archive availability is defined solely as `archive_filename is not None` (`src/documents/models.py:452-475`).

`serve_file()` then returns:

| Representation | Opened file | MIME type |
|---|---|---|
| Archive | `file_doc.archive_file` | fixed `application/pdf` |
| Original | `file_doc.source_file` | `file_doc.mime_type` |

See `src/documents/views.py:4941-4973`.

The response is a `FileResponse` with attachment disposition. Missing files are converted by `download()` to 404 (`src/documents/views.py:1835-1839`).

### `follow_formatting`

This parameter changes only the download filename, not the bytes or authorization:

- Truthy value: uses the stored `archive_filename` or `filename`.
- Absent/falsy: uses `get_public_filename()`.

Because the raw query value is passed directly, any nonempty string—including `follow_formatting=false`—is truthy in this branch. Response filename normalization and `Content-Disposition` construction occur at `src/documents/views.py:4952-4995`.

## Authorized resource versus returned resource

The decisive distinction is:

- **Authorized object:** always the root document derived from the path `pk`.
- **Selected file record:** the path version, latest version, root, or explicit related version chosen afterward.
- **Returned representation:** that selected record's archive or original file, chosen last.

There is no separate object-permission check on the selected version, its original file, or its archive file. Selecting another related version or switching original/archive therefore changes the returned record or representation, **not the resource against which object authorization is evaluated**. The selected version is nevertheless constrained to the authorized root's version family.

## Facts unavailable and conclusions they block

The allowed source does not establish:

1. **The user's global `documents.view_document` permission.**  
   Blocks deciding whether the request reaches the action at all.

2. **The root's owner and the user's root-level Guardian grant.**  
   Blocks deciding whether the explicit root check returns the file or 403.

3. **The actual path `pk` and query values.**  
   Blocks identifying the concrete root, version, original/archive branch, and output filename behavior.

4. **Database state:** record existence, version relationships, `version_index`, deletion state, and `archive_filename`.  
   Blocks determining the concrete selected version and whether archive fallback occurs.

5. **Filesystem/storage state and file contents.**  
   Blocks determining whether opening the selected path succeeds and what bytes are returned.

6. **Authentication/backend and deployment configuration outside the allowed paths.**  
   Blocks determining the authentication mechanism and whether an initial denial is rendered as 401 versus 403 in the deployed configuration. It does not change the source-established authorization and selection order above.