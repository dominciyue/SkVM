## Result

`GET /api/documents/{pk}/download/` authorizes the authenticated caller against the **root document**, then selects an effective document version, then selects that version’s archive or original representation. Alternate versions and file representations are not independently permission-checked.

### 1. Entry and document identifier

- The API router mounts `UnifiedSearchViewSet` at `documents` under `/api/`. `UnifiedSearchViewSet` inherits `DocumentViewSet`, including its `download` action. A DRF detail action produces the `{prefix}/{lookup}/{url_path}/` route.  
  [`src/paperless/urls.py:74-100`](src/paperless/urls.py#L74-L100), [`src/documents/views.py:2503-2516`](src/documents/views.py#L2503-L2516), [`framework/rest_framework-3.18.1/rest_framework/routers.py:128-135`](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135)
- `@action(methods=["get"], detail=True)` supplies the URL’s lookup value as `pk`. `download()` delegates to `file_response(pk, request, "attachment")`; missing document/file exceptions become 404.  
  [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)
- `/fetch/doc/{pk}` is also present, but only redirects to this API URL.  
  [`src/paperless/urls.py:304-313`](src/paperless/urls.py#L304-L313)

### 2. Authorization order

Before `download()` runs, DRF:

1. authenticates the request;
2. evaluates the view’s permission classes;
3. only then invokes the action handler.  
   [`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)

`DocumentViewSet` uses:

```python
(IsAuthenticated, PaperlessObjectPermissions)
```

[`src/documents/views.py:1008-1027`](src/documents/views.py#L1008-L1027)

Consequently:

- `IsAuthenticated` requires a non-null authenticated `request.user`.  
  [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)
- For GET, `PaperlessObjectPermissions` maps the request to the model’s `view` permission. Its inherited request-level check calls `user.has_perms(...)` without an object, so the user must first pass the model-level Document view-permission check.  
  [`src/documents/permissions.py:30-53`](src/documents/permissions.py#L30-L53), [`framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

The action does **not** call DRF’s `get_object()`. Therefore the ordinary `get_object()` path—which filters the queryset and invokes `check_object_permissions()`—is not used. Instead, Download performs its own lookup and object check.  
[`framework/rest_framework-3.18.1/rest_framework/generics.py:79-105`](framework/rest_framework-3.18.1/rest_framework/generics.py#L79-L105)

That manual path is:

1. Look up `pk` using `Document.global_objects`, because Download passes `include_deleted=True`.
2. Determine the root document.
3. Check `has_perms_owner_aware(request.user, "view_document", root_doc)`.
4. Return 403 if that check fails.
5. Only after it passes, select the effective version and representation.  
   [`src/documents/views.py:1401-1445`](src/documents/views.py#L1401-L1445)

`has_perms_owner_aware` allows access when the root document:

- has no owner;
- is owned by the caller; or
- passes Guardian’s `view_document` object-permission check.  
  [`src/documents/permissions.py:624-635`](src/documents/permissions.py#L624-L635)

### 3. Version selection

After root authorization, `_get_effective_file_doc()` selects the row whose files will be served:

| Request | Selected document |
|---|---|
| `pk` names a version and `version` parameter is absent | That exact version |
| `pk` names a root and `version` is absent | Newest version, or the root if it has no versions |
| Any `pk` with a nonempty `version={id}` | That ID, but only if it is the root or a direct version of that root |
| `version` is empty, e.g. `?version=` | Treated as “no version value” during resolution, so selects newest/root fallback |
| `version` is non-integer | 404, “Invalid version parameter” |
| ID is absent or belongs to another root | 404 |

[`src/documents/views.py:1375-1399`](src/documents/views.py#L1375-L1399), [`src/documents/versioning.py:140-195`](src/documents/versioning.py#L140-L195)

Because `include_deleted=True` is used, request-document, explicit-version, and latest-version lookup all use the global manager and can resolve deleted rows.

### 4. Original versus archive

For the selected `file_doc`:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

`original_requested()` is true only if `original` exists and its value is exactly lowercase `"true"`.

Therefore:

- `?original=true` always selects `file_doc.source_file`;
- absent `original`, or any other value, selects `archive_file` if `archive_filename` is non-null;
- otherwise it falls back to `source_file`.

[`src/documents/views.py:1368-1373`](src/documents/views.py#L1368-L1373), [`src/documents/views.py:1429-1448`](src/documents/views.py#L1429-L1448), [`src/documents/models.py:458-464`](src/documents/models.py#L458-L464)

`serve_file()` then:

- opens `archive_file` with `application/pdf`, or
- opens `source_file` with the document MIME type;
- constructs a `FileResponse`;
- adds `Content-Disposition: attachment` with normalized and RFC 5987 filename forms.  
  [`src/documents/views.py:4941-4995`](src/documents/views.py#L4941-L4995)

`follow_formatting` changes the filename source, not which file bytes are selected. Since the query value is passed directly, any nonempty string—including `"false"`—is truthy in the later Python condition.

### 5. Which resource is authorized?

The resources differ by stage:

- **Authorized object:** `root_doc`.
- **Version membership constraint:** an explicitly selected version must be that root or one of its direct versions.
- **File-producing object:** `file_doc`, which may be the root, newest version, directly addressed version, or explicit version.
- **Representation:** `file_doc.archive_file` or `file_doc.source_file`.

There is no second permission check against `file_doc`, `archive_file`, or `source_file`. Thus alternate-version and original/archive selection change the returned row or representation **after root authorization**; they do not change the object on which authorization is evaluated.

This is not by itself enough to call the behavior a vulnerability: that conclusion depends on whether the application’s intended security invariant is that root authorization covers every version and both representations.

### 6. `restrict_queryset_to_visible` local contract

This helper is not used by the traced Download lookup, which queries the manager directly.

Locally:

- `user is None` is considered unrestricted;
- an authenticated, active superuser is unrestricted;
- unrestricted inputs return the original queryset before calling `permitted_object_ids`;
- every other input reaches:

```python
queryset.filter(
    pk__in=permitted_object_ids(user, queryset.model, perm)
)
```

[`src/documents/permissions.py:411-433`](src/documents/permissions.py#L411-L433), [`src/documents/permissions.py:436-457`](src/documents/permissions.py#L436-L457)

A null user here means “the caller requested no filtering,” not an authenticated Download request.

The auxiliary machine property checker left this call-reachability relation `unknown` because it did not adopt the call as the queried effect (`property-source-effect-unadopted`). The source-level branch above is nevertheless explicit; no machine certification is being claimed.

### 7. Missing facts and blocked conclusions

| Missing fact | Conclusion it prevents |
|---|---|
| Caller’s model-level Document view permission | Whether the request reaches `download()` at all |
| Root owner and caller identity | Whether ownership authorizes this particular request |
| Guardian grants and configured permission backends | Whether the root’s object-permission branch succeeds |
| Runtime `pk`, version graph, deletion state, and query parameters | Which exact document row is selected or whether selection returns 404 |
| Whether root authorization is intended to cover all versions and representations | Whether the lack of a separate `file_doc` check is a security defect |
| Whether versions can carry independently meaningful ownership or grants | Whether root-only authorization could expose another principal’s protected version |
| Archive filename and actual storage contents | Whether archive or source is chosen and whether opening it succeeds |
| Filesystem/storage deployment state | The exact bytes returned and whether a missing-file 404 occurs |
| Authentication backend/configuration | How the authenticated principal was established; this does not alter the traced post-authentication ordering |