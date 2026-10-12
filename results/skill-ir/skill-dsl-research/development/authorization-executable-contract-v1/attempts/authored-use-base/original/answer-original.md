## End-to-end flow

### 1. Routing and document identifier

`UnifiedSearchViewSet` is registered as the `documents` router resource, and the router is mounted below `/api/`. It inherits `DocumentViewSet.download`, declared as a detail-only GET action. Thus the operation is:

```text
GET /api/documents/{pk}/download/
```

The route’s `{pk}` identifies a `Document` row by its numeric `id`; it may identify either a root document or a version row.  
`src/paperless/urls.py:74-78,297`; `src/documents/views.py:2503-2507`; `src/documents/views.py:1834-1839`

### 2. Request-level authorization before the handler

Before `download()` runs, DRF:

1. performs authentication;
2. checks every configured permission class;
3. only then invokes the action handler.

`framework/rest_framework-3.18.1/rest_framework/views.py:404-421,490-528`

`DocumentViewSet` configures:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

`IsAuthenticated` requires a truthy, authenticated `request.user`. `PaperlessObjectPermissions` maps GET to `documents.view_document`; its inherited request-level check calls `request.user.has_perms(...)` without an object. Therefore the request must also pass the model-level `documents.view_document` check before entering `download()`.  
`src/documents/views.py:1008-1027`; `src/documents/permissions.py:30-44`; `framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151,203-246`

### 3. Path document lookup and object authorization

`download()` calls `file_response(pk, request, "attachment")`. `file_response()` resolves the path document with `include_deleted=True`, so it uses `Document.global_objects` and can find soft-deleted root or version rows. Missing rows become 404.  
`src/documents/views.py:1835-1839,1429-1436`; `src/documents/views.py:1401-1415`

It then derives the root:

- if the path document has no `root_document_id`, it is its own root;
- otherwise its `root_document` is used, with a fallback lookup when necessary.

`src/documents/versioning.py:146-156`

The decisive object check is against this **root document**:

```python
has_perms_owner_aware(
    request.user,
    "view_document",
    root_doc,
)
```

Access succeeds if the root is unowned, owned by the user, or Guardian reports `view_document` on the root; otherwise the response is 403. This check occurs **before version and original/archive selection**.  
`src/documents/views.py:1417-1427`; `src/documents/permissions.py:624-635`

Although `PaperlessObjectPermissions` has an object-permission method, this action never calls DRF’s `get_object()` or `check_object_permissions()`. It performs the explicit root check above instead.

## Version selection branches

After root authorization, `_get_effective_file_doc()` selects the `Document` row whose file properties will be used.

### No `version` query parameter

- **Path `{pk}` is a version row:** that exact path-selected version is returned.
- **Path `{pk}` is a root row:** versions are ordered by descending `version_index`, then descending ID. The newest non-deleted version is selected; if none exists, the root itself is selected.

`src/documents/views.py:1388-1399`; `src/documents/versioning.py:23-28,159-166,175-182`

### Non-empty `?version=<value>`

The value must parse as an integer:

- non-integer → 404, reported as “Invalid version parameter”;
- missing candidate → 404;
- candidate is accepted only if it is the authorized root itself or has `root_document_id == authorized_root.id`;
- an ID belonging to another document family → 404.

Because the parameter is present, this lookup uses `global_objects`, so a deleted version in the same root family can be selected.  
`src/documents/views.py:1375-1386`; `src/documents/versioning.py:169-195`

### Empty `?version=`

There is a subtle distinct branch:

- presence of the parameter causes `include_deleted=True`;
- its empty value is then considered falsy by the resolver;
- consequently the newest version is chosen as if no explicit ID were supplied, but deleted versions participate.

`src/documents/views.py:1375-1381`; `src/documents/versioning.py:175-182`

An explicit `version` parameter also overrides a version ID in the path: selection is performed relative to that path row’s root and may choose the root or a sibling version.

## Original versus archive

Once `file_doc` is selected:

- `?original=true`, with exactly lowercase `"true"`, forces the source/original file.
- Otherwise, an archive is used when `file_doc.has_archive_version` is true.
- If that selected version has no archive, its source/original is used.

`src/documents/views.py:1368-1373,1442-1447`

`has_archive_version` means `archive_filename is not None`. Archive selection opens the selected document’s archive path; source selection opens its originals path.  
`src/documents/models.py:452-475`

`serve_file()` then returns:

- **archive:** `doc.archive_file`, PDF MIME type;
- **original:** `doc.source_file`, `doc.mime_type`;
- `Content-Disposition: attachment` with an encoded filename.

`follow_formatting` changes the response filename, not which file is opened. It is passed as an unparsed query value, so any non-empty string—including `"false"`—is truthy in the filename branch.  
`src/documents/views.py:4941-4995`

Missing files and missing document rows are translated to 404.  
`src/documents/views.py:1835-1839`

## Which resource is authorized?

The authorization resource remains the **root document** in every selection branch.

| Selection | Separately authorized? | Effect |
|---|---:|---|
| Path-selected version | No | Changes `file_doc`; root is checked |
| Latest version | No | Changes `file_doc`; root is checked |
| Explicit sibling/root `version` | No | Must belong to the same root family |
| Original versus archive | No | Chooses a file representation of `file_doc` |
| `follow_formatting` | No | Changes only the download filename |

Therefore, alternate versions and original/archive choices do not change the object on which authorization is evaluated. They change the representation returned **after** root authorization. No ownership or Guardian check is performed separately against the selected version row or archive/source file.

## Local `restrict_queryset_to_visible` contract

This helper is independent of the download path above:

- `user is None` → `user_is_unrestricted()` returns true, the original queryset is returned, and `permitted_object_ids(...)` is unreachable.
- authenticated, active superuser → same short-circuit.
- every other non-null user → `permitted_object_ids(...)` is reached and its IDs restrict the queryset.

`None` here means “this helper was asked not to filter,” not “the Download request is authenticated.”  
`src/documents/permissions.py:411-433,436-457`

The auxiliary machine checker currently labels this relation unresolved because a later source-ownership declaration was rejected; the direct source branch above is nevertheless explicit.

## Unavailable facts and blocked conclusions

- **User’s model permission, root ownership, and Guardian grants are unspecified.** Therefore source alone cannot say whether a particular authenticated user passes the request-level `documents.view_document` check or the root-object check.
- **Authentication settings/backends are outside the reviewed evidence.** The source proves authentication occurs first, but not which credentials are accepted or whether a failed request becomes 401 versus 403 in a particular deployment.
- **Database contents are unknown.** The actual `{pk}`, root/version relationships, deletion state, latest ordering, and requested version’s existence cannot be determined.
- **`archive_filename` and storage contents are unknown.** Consequently the exact original/archive branch and whether opening the selected file succeeds cannot be predicted.
- **Storage settings and deployment mounts are unavailable.** The code identifies `ORIGINALS_DIR` or `ARCHIVE_DIR`, but not their deployed absolute locations or availability.
- **Proxy/public URL configuration is unavailable.** `/api/documents/{pk}/download/` is the application route; an externally visible prefix or hostname cannot be established from the allowed source.