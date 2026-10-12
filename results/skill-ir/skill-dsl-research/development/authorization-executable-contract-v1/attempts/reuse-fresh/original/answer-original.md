## Conclusion

`GET /api/documents/{pk}/download/` authorizes the authenticated user against the **root document**, then selects a requested/default version and its original/archive representation **without a second object-permission check on that selected version or file representation**.

Therefore:

- `version` changes the `Document` row whose file is returned.
- `original=true` changes archive versus source bytes for that selected row.
- Neither changes the object used by the application’s manual authorization check: authorization remains against the root document.

This describes source behavior; whether a particular user succeeds depends on unspecified model permission, ownership, and object grants.

## Request-to-file trace

### 1. Routing and entry

`UnifiedSearchViewSet`, which inherits `DocumentViewSet`, is registered under `documents` in the API router. The router is included below `/api/`, producing the detail action route `/api/documents/{pk}/download/`. A legacy `/fetch/doc/{pk}` route merely redirects there.  
`src/paperless/urls.py:74-77`, `src/paperless/urls.py:97-100`, `src/paperless/urls.py:293-300`, `src/paperless/urls.py:305-312`; `src/documents/views.py:2503`; `src/documents/views.py:1834-1839`

The action accepts GET, is detail-scoped, and calls:

```python
self.file_response(pk, request, "attachment")
```

A missing database row or file becomes HTTP 404.  
`src/documents/views.py:1834-1839`

### 2. Framework-level gates

Before invoking `download`, DRF performs authentication and request-level permission checks.  
`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`

The inherited view configuration requires:

1. `IsAuthenticated`; and
2. `PaperlessObjectPermissions`.

`src/documents/views.py:1008-1027`

`IsAuthenticated` requires a non-null authenticated user.  
`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`

For GET, Paperless overrides the permission map to require the model permission `documents.view_document`. DRF’s inherited `has_permission` obtains the queryset model and calls `request.user.has_perms(...)`. Thus merely owning a document is insufficient if this model-level gate fails.  
`src/documents/permissions.py:30-44`; `framework/rest_framework-3.18.1/rest_framework/permissions.py:218-246`

This is only a request/model-level check. DRF normally invokes object permissions from `get_object()`, but Download never calls `get_object()`; it performs its own lookup and authorization. Consequently, the configured `PermittedObjectsFilter` is not used to select this download object.  
`framework/rest_framework-3.18.1/rest_framework/generics.py:79-105`; `src/documents/views.py:1429-1448`

### 3. Path `pk`, requested document, and root authorization

`file_response` calls `_resolve_request_and_root_doc(pk, request, include_deleted=True)`. That function:

1. looks up `pk` as `request_doc`, using `Document.global_objects` because `include_deleted=True`;
2. resolves its root document:
   - a root row maps to itself;
   - a version normally maps to its `root_document`;
   - if that relation cannot be retrieved, `get_root_document` falls back to a manager lookup and ultimately to the request document itself;
3. evaluates `has_perms_owner_aware(request.user, "view_document", root_doc)`.

`src/documents/views.py:1401-1427`, `src/documents/views.py:1429-1436`; `src/documents/versioning.py:136-156`

The root check succeeds when:

- the root is unowned;
- the user owns the root; or
- Guardian’s `ObjectPermissionChecker` reports the requested object permission on the root.

Otherwise the action returns HTTP 403.  
`src/documents/permissions.py:624-635`; `src/documents/views.py:1421-1426`

Although the helper contains a `request.user is None` branch that skips this manual check, normal Download dispatch has already passed `IsAuthenticated`, so that branch is not the authenticated-user path under review.

### 4. Version selection

Only after root authorization does `_get_effective_file_doc` select the row whose file is served.  
`src/documents/views.py:1435-1441`

The complete branches are:

| Path target and `version` parameter | Selected `file_doc` |
|---|---|
| `pk` names a version and the `version` query key is absent | That exact version named by `pk` |
| `pk` names a root and `version` is absent | Newest version under that root, falling back to the root if none exists |
| `version=` is present but empty | Also newest version, because presence bypasses the exact-request-version branch but the resolver treats an empty value as no explicit version |
| Nonempty integer `version=N` | Row `N`, only if it is the root itself or a direct version of that root |
| Non-integer `version` | DRF `NotFound("Invalid version parameter")` |
| Missing `version=N`, or a row outside the root’s version family | HTTP 404 |

`src/documents/views.py:1375-1399`; `src/documents/versioning.py:140-143`, `src/documents/versioning.py:159-195`

“Newest” means descending `version_index` with descending ID as the tie-breaker.  
`src/documents/versioning.py:23-28`

Because this path passes `include_deleted=True`, version resolution selects through `global_objects`, including for default-latest and explicit-version lookup. Whether downloading soft-deleted rows is intended policy cannot be concluded from this trace alone.  
`src/documents/views.py:1429-1434`; `src/documents/versioning.py:136-137`, `src/documents/versioning.py:159-195`

### 5. Original/archive representation selection

After selecting `file_doc`, the code calculates:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

`src/documents/views.py:1442-1448`

The branches are:

- `original=true`, exactly lowercase: serve the selected version’s source/original file.
- Any other value, including `original=True`, `original=1`, `original=false`, or omission:
  - serve its archive when `archive_filename` is non-null;
  - otherwise serve its source file.

`src/documents/views.py:1368-1373`; `src/documents/models.py:452-475`

When archive is selected:

- bytes come from `file_doc.archive_file`;
- MIME type is forced to `application/pdf`;
- filename is either the stored archive filename or a generated public PDF filename.

When source is selected:

- bytes come from `file_doc.source_file`;
- MIME type comes from `file_doc.mime_type`;
- filename is either the stored filename or generated public filename.

`src/documents/views.py:4941-4973`

`follow_formatting` is not parsed as a Boolean: it is passed directly from `query_params`. Consequently, any nonempty supplied string—including `"false"`—is truthy and selects the stored filename branch. It affects the response filename, not the selected bytes.  
`src/documents/views.py:1447`, `src/documents/views.py:4952-4965`

The response is a streaming `FileResponse` with `Content-Disposition: attachment` and ASCII-normalized plus RFC 5987 UTF-8 filenames. A missing selected source/archive file becomes 404 in `download`.  
`src/documents/views.py:4973-4995`, `src/documents/views.py:1835-1839`

## Authorization versus selected resource

The order is:

1. Framework authentication.
2. Global/model `view_document` permission.
3. Lookup of `pk` and derivation of its root.
4. Owner/object-grant check on the **root document**.
5. Version selection within that root’s family.
6. Original/archive selection on the selected version.
7. File opening and response construction.

Thus there is no independent owner/grant check on:

- `request_doc` when it is a version;
- an alternate version named by `?version=`;
- the newest version selected by default; or
- the original/archive representation.

The database does constrain an explicit `version` ID to the authorized root’s family, but the model constraint shown only makes `(root_document, version_index)` unique; it does not establish that version ownership or object grants must equal the root’s.  
`src/documents/versioning.py:189-195`; `src/documents/models.py:315-356`

Therefore root-only authorization is source-established. Whether it constitutes an authorization defect depends on the unestablished invariant that all versions and their files belong to the same authorization domain as their root.

## `restrict_queryset_to_visible` local contract

This helper is not part of the traced Download path.

Locally:

- `user is None` makes `user_is_unrestricted` return true.
- A non-null user is unrestricted only when authenticated, active, and superuser.
- For those unrestricted cases, `restrict_queryset_to_visible` returns the queryset unchanged before calling `permitted_object_ids`.
- For every other non-null user—including normal authenticated users, inactive users, and inactive superusers—the `permitted_object_ids(...)` lookup is reachable and used inside `queryset.filter(...)`.

`src/documents/permissions.py:411-433`, `src/documents/permissions.py:436-457`

A null user here means “the caller requested no filtering,” not that an unauthenticated Download request is permitted.

The auxiliary machine property checker retained this relation as `unknown` because it did not adopt the call as the queried effect; the direct source control flow above is nevertheless explicit.

## Missing facts and blocked conclusions

| Missing fact | Conclusion it prevents |
|---|---|
| Whether the user has global `documents.view_document` | Whether the request reaches the Download handler |
| Root ownership and Guardian object grants | Whether the manual root check returns 403 or permits selection |
| Actual `pk`, version graph, and query parameters | Which `Document` row becomes `file_doc` |
| Whether the selected row has `archive_filename` | Whether omission/non-`true` `original` returns archive or source |
| File existence and storage state | Whether the operation returns bytes or 404 |
| Authentication/backend configuration outside the allowed source | Which credentials establish `request.user`, and the exact unauthenticated response behavior |
| Lifecycle policy for `global_objects`/deleted versions | Whether deleted-version downloadability is intentional |
| Creation/update invariants for owners and grants across a root and its versions | Whether root-only authorization is safe by design or can expose a separately protected version |
| A concrete user, owner, and grant assignment | Any claim that a particular user is authorized or unauthorized |

No deployment or proxy fact is needed to establish the in-process selection and authorization order above, but such facts would be needed to characterize final transport behavior beyond the constructed `FileResponse`.