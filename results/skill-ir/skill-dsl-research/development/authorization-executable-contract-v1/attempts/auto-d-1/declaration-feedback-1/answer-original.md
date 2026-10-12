## Request entry and document identity

The direct endpoint is:

`GET /api/documents/{pk}/download/`

`documents` is registered to `UnifiedSearchViewSet`, which inherits `DocumentViewSet`; DRF generates detail-action routes as `{prefix}/{lookup}/{url_path}/`, with `pk` as the default lookup argument. [`src/paperless/urls.py:74-77`](src/paperless/urls.py#L74-L77), [`src/documents/views.py:2503`](src/documents/views.py#L2503), [`framework/rest_framework-3.18.1/rest_framework/routers.py:128-135`](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135), [`framework/rest_framework-3.18.1/rest_framework/routers.py:238-264`](framework/rest_framework-3.18.1/rest_framework/routers.py#L238-L264)

There is also a legacy `GET /fetch/doc/{numeric-pk}` entry that redirects to the same API download URL. [`src/paperless/urls.py:301-313`](src/paperless/urls.py#L301-L313)

`download()` delegates to `file_response(pk, request, "attachment")`; missing model/file errors become 404. [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)

## Authorization order

1. **Framework authentication and view-level permissions occur before `download()`.** DRF runs authentication and `check_permissions()` in `initial()`, before dispatching to the handler. [`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421), [`framework/rest_framework-3.18.1/rest_framework/views.py:507-524`](framework/rest_framework-3.18.1/rest_framework/views.py#L507-L524)

2. `DocumentViewSet` declares:

   ```python
   permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
   ```

   [`src/documents/views.py:1008-1027`](src/documents/views.py#L1008-L1027)

   Consequently, before document lookup:
   - `IsAuthenticated` requires an authenticated `request.user`.
   - For GET, `PaperlessObjectPermissions` requires the model permission `documents.view_document`; its inherited `has_permission()` calls `request.user.has_perms(...)` without an object. [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151), [`framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246), [`src/documents/permissions.py:30-44`](src/documents/permissions.py#L30-L44)

3. **Path-document and root-document lookup follows.** Because download calls `_resolve_request_and_root_doc(..., include_deleted=True)`, `pk` is looked up through `Document.global_objects`, and the document’s version-family root is derived. Thus the path may identify either a root document or a version, including a deleted row. [`src/documents/views.py:1401-1420`](src/documents/views.py#L1401-L1420)

4. **The decisive object-level check is performed on the root document**, before version or original/archive selection:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   Failure returns 403. This helper allows access when the root is unowned, owned by the user, or the user has the Guardian object permission on that root. [`src/documents/views.py:1421-1427`](src/documents/views.py#L1421-L1427), [`src/documents/permissions.py:624-635`](src/documents/permissions.py#L624-L635)

This action does not use generic `get_object()` followed by DRF’s `check_object_permissions()`. The application’s explicit root check is therefore the relevant object authorization; `PaperlessObjectPermissions.has_object_permission()` is not separately applied to the selected version. DRF distinguishes view-level and explicitly invoked object-level checks. [`framework/rest_framework-3.18.1/rest_framework/views.py:331-355`](framework/rest_framework-3.18.1/rest_framework/views.py#L331-L355)

## Version selection

Only after the root permission check does `_get_effective_file_doc()` select the file-bearing document. [`src/documents/views.py:1429-1441`](src/documents/views.py#L1429-L1441)

| Request condition | Selected document |
|---|---|
| Path `pk` identifies a version and the `version` query parameter is entirely absent | That exact path version |
| Path `pk` identifies a root and `version` is absent | Newest non-deleted version, ordered by descending `version_index` then ID; root is the fallback |
| `version=<integer>` is present | That ID, but only if it is the root itself or a version belonging to that root |
| `version` is non-integer | 404, “Invalid version parameter” |
| Integer version does not exist or belongs to another root | 404 |
| `version=` is present but empty | It enters the explicit-version branch but is treated as falsy by the resolver, selecting the newest version; because the parameter is present, deleted versions are included |

The relevant branches are in [`src/documents/views.py:1368-1399`](src/documents/views.py#L1368-L1399) and [`src/documents/versioning.py:140-195`](src/documents/versioning.py#L140-L195).

## Original versus archive

After selecting `file_doc`, the response chooses:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

[`src/documents/views.py:1442-1448`](src/documents/views.py#L1442-L1448)

`original_requested()` is true only when `original=true` is present with that exact lowercase string. Therefore:

- `?original=true` returns `file_doc.source_file`.
- Otherwise, if `file_doc.has_archive_version`, it returns `file_doc.archive_file`.
- Otherwise it falls back to `file_doc.source_file`.
- Values such as `original=false`, `original=1`, or differently cased values do not request the original.

Archive responses use `application/pdf`; originals use the document MIME type. The result is a streaming `FileResponse` with `Content-Disposition: attachment`. `follow_formatting` changes only the download filename—archive/source selection is unchanged. Because the raw query value is passed directly, any nonempty value, including the string `"false"`, is truthy for filename-selection purposes. [`src/documents/views.py:1368-1373`](src/documents/views.py#L1368-L1373), [`src/documents/views.py:4941-4995`](src/documents/views.py#L4941-L4995)

If the selected physical file is absent, `FileNotFoundError` becomes 404; there is no archive-to-original fallback after `has_archive_version` selected the archive.

## Authorized resource versus returned representation

The authorization resource is the **root document belonging to the path `pk`**:

- Choosing another version within that root does not change the authorized object.
- Requesting original versus archive does not cause another permission check.
- A version’s own owner or object grants are not consulted by this operation.
- A cross-root `version` ID cannot redirect the download to another family; it produces 404.
- Changing the path `pk` to a document in another family changes the root on which authorization is evaluated.

Thus version and original/archive parameters generally change the returned file after root authorization, not the resource authorized.

## Unavailable facts and blocked conclusions

- **User’s global `documents.view_document` permission:** unknown; blocks deciding whether the request reaches document lookup.
- **Root ownership and Guardian grants:** explicitly unspecified; blocks deciding whether this particular user receives 403 or proceeds.
- **Authentication settings/backends:** outside the allowed evidence; blocks identifying which credentials authenticate the user and whether an authentication failure is surfaced as 401 or 403.
- **Database contents and version/deletion relationships:** unknown; block naming the exact selected document and whether lookup/version resolution produces 404.
- **`has_archive_version` and actual storage contents:** unknown; block determining whether archive or original bytes are returned and whether the selected file exists.
- **Proxy, external authorization, and storage deployment configuration:** unavailable; block claims about end-to-end deployment reachability or downstream delivery, but do not change the application-level ordering established above.

The optional machine property relations remained `unknown/unbound`; the conclusions above are the bounded source trace, not a machine certification.