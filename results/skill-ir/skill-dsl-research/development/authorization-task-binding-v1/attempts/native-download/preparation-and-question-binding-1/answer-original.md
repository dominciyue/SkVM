## Validation status

**Partial / unreviewed.** The retained source supports the trace below, but the authorization checker did not accept the end-to-end result because it could not bind the `download → file_response` call as the protected response effect (`source-fields-missing:role`). Therefore, the concrete path verdict remains **unknown**, and no authorization-bypass finding is asserted.

## 1. Request and returned file

1. The API router registers `UnifiedSearchViewSet` under `documents`; that viewset inherits the document actions from `DocumentViewSet`. [`src/paperless/urls.py:77`](src/paperless/urls.py#L77)
2. `download` is a detail `GET` action, so the route’s detail identifier becomes `pk`. The handler calls:
   ```python
   self.file_response(pk, request, "attachment")
   ```
   Missing documents/files are translated to `Http404`. [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)
3. `file_response` resolves:
   - `request_doc` by `id=pk`, using `Document.global_objects` because downloads pass `include_deleted=True`;
   - `root_doc` from that requested document;
   - the authorization result described below. [`src/documents/views.py:1401-1448`](src/documents/views.py#L1401-L1448)
4. After authorization, the effective `file_doc` is selected:
   - If `request_doc` is a non-root version and no `version` parameter is present, that exact `request_doc` is returned.
   - Otherwise, version resolution is performed relative to `root_doc`.
   - An explicit version request permits the resolver to consider deleted versions.
   - An invalid version parameter raises `NotFound`; no resolved document raises `Http404`. [`src/documents/views.py:1375-1399`](src/documents/views/views.py#L1375-L1399)
5. Representation selection then evaluates `original`:
   - Only `?original=true` selects `file_doc.source_file`.
   - Otherwise, `file_doc.archive_file` is selected when `file_doc.has_archive_version` is true.
   - If no archive exists, it falls back to `source_file`. [`src/documents/views.py:1367-1373`](src/documents/views.py#L1367-L1373), [`src/documents/views.py:1429-1448`](src/documents/views.py#L1429-L1448)
6. `serve_file` constructs the `FileResponse`:
   - archive: PDF MIME type and archive filename;
   - original/source: the document MIME type and source filename;
   - `follow_formatting` selects stored/disk naming instead of the public formatted filename. [`src/documents/views.py:4941-4995`](src/documents/views.py#L4941-L4995)

## 2. Authorization order

Before the action executes, DRF dispatch performs authentication and request-level permission checks. [`framework/rest_framework-3.18.1/rest_framework/views.py:404-414`](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L414), [`framework/rest_framework-3.18.1/rest_framework/views.py:490-519`](framework/rest_framework-3.18.1/rest_framework/views.py#L490-L519)

`DocumentViewSet` declares:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

[`src/documents/views.py:1008-1035`](src/documents/views.py#L1008-L1035)

Consequently:

1. `IsAuthenticated` requires an authenticated user. [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)
2. For a GET operation, `PaperlessObjectPermissions` requires the model-level `view_document` permission. [`src/documents/permissions.py:30-53`](src/documents/permissions.py#L30-L53), [`framework/rest_framework-3.18.1/rest_framework/permissions.py:217-260`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L217-L260)
3. The custom action does not use DRF’s `get_object()` or call `check_object_permissions()`. Instead, `_resolve_request_and_root_doc` explicitly checks:
   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```
   Failure returns HTTP 403 before version or representation selection. [`src/documents/views.py:1401-1427`](src/documents/views.py#L1401-L1427)
4. `has_perms_owner_aware` permits access when:
   - `root_doc.owner is None`;
   - the user owns `root_doc`; or
   - Guardian reports the user has `view_document` on `root_doc`.  
   [`src/documents/permissions.py:624-635`](src/documents/permissions.py#L624-L635)

Thus the source ordering is:

**authentication → model permission → load requested/root document → authorize root document → choose version → choose original/archive → construct file response**

## 3. Alternate versions and authorization resource

Selecting another version does **not** change the object passed to the explicit authorization predicate:

- authorization is evaluated against `root_doc`;
- the subsequently selected version is `file_doc`;
- original/archive selection chooses a file field on `file_doc`;
- there is no later authorization check against the selected child version, `source_file`, or `archive_file`.

Therefore, in the inspected source, alternate-version and original/archive options change the **returned representation**, not the **authorized object**. This describes the implemented model; it does not establish whether a particular user is allowed, because ownership and grants were not supplied.

## 4. Missing facts and blocked conclusions

The following facts are unavailable:

- **Authentication and model permission:** needed to know whether DRF admits the request.
- **Root ownership, ownerless state, and Guardian grants:** needed to know whether the explicit root-document check permits access or returns 403.
- **Actual `pk` and `version` parameter:** needed to identify `request_doc` and `file_doc`, including deleted-version branches.
- **`original` and `follow_formatting` values:** needed to determine the selected file field and filename.
- **Document/version/archive database state:** needed to determine whether resolution succeeds and whether an archive exists.
- **Backing-file existence:** needed to determine whether a file response can actually be opened or results in 404.
- **Deployed identity, authorization records, database, and storage state:** needed for a conclusion about a real deployed request.

These missing facts block a concrete allow/deny and exact-file conclusion, but they do not alter the source-visible ordering described above.