## Conclusion

Download authorizes the **root document**, then selects a document version (`file_doc`) and its original/archive representation. Selecting another version or the archive does **not** trigger another object-permission check. The selected version must, however, be the root itself or a version linked to that root.

### 1. Request entry and identification

`UnifiedSearchViewSet`, which inherits `DocumentViewSet`, is registered as `documents` under the API router. The `download` method is a GET detail action, yielding the conventional route:

`GET /api/documents/{pk}/download/`

The URL `pk` is therefore the initial document identifier. The action calls `file_response(pk, request, "attachment")`; missing files or uncaught `Document.DoesNotExist` become 404 responses.  
[src/paperless/urls.py:74-78](src/paperless/urls.py#L74-L78)  
[framework/rest_framework-3.18.1/rest_framework/routers.py:131](framework/rest_framework-3.18.1/rest_framework/routers.py#L131)  
[src/documents/views.py:2503-2507](src/documents/views.py#L2503-L2507)  
[src/documents/views.py:1834-1839](src/documents/views.py#L1834-L1839)

### 2. Authorization order

Before `download` runs, DRF performs authentication and view-level permission checks. `DocumentViewSet` declares:

- `IsAuthenticated`
- `PaperlessObjectPermissions`

For GET, `PaperlessObjectPermissions` maps the request to the model-level `view_document` permission. Thus an authenticated user must first pass the model permission check before the handler executes.  
[src/documents/views.py:1017-1027](src/documents/views.py#L1017-L1027)  
[framework/rest_framework-3.18.1/rest_framework/views.py:404-421](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)  
[framework/rest_framework-3.18.1/rest_framework/views.py:331-342](framework/rest_framework-3.18.1/rest_framework/views.py#L331-L342)  
[framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)  
[src/documents/permissions.py:30-44](src/documents/permissions.py#L30-L44)  
[framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)

Inside `file_response`, application authorization proceeds as follows:

1. Load `request_doc` by `id=pk`, using `Document.global_objects` because `include_deleted=True`. Missing `pk` gives 404.
2. Derive `root_doc`:
   - a root document remains itself;
   - a version normally resolves to its `root_document`;
   - if the referenced root cannot be obtained, `get_root_document` falls back to `request_doc`.
3. Evaluate `has_perms_owner_aware(request.user, "view_document", root_doc)`.
4. If false, return 403 before selecting `file_doc`.
5. If true, continue to version and representation selection.

The owner-aware check succeeds when the root is ownerless, owned by the user, or the Guardian object-permission checker grants the requested permission.  
[src/documents/views.py:1401-1427](src/documents/views.py#L1401-L1427)  
[src/documents/versioning.py:146-156](src/documents/versioning.py#L146-L156)  
[src/documents/permissions.py:624-635](src/documents/permissions.py#L624-L635)

Notably, this action does not call DRF’s normal `get_object()`/`check_object_permissions()` path. Its decisive object check is the explicit root-document check above.

### 3. Version-selection branches

After root authorization, `_get_effective_file_doc` chooses the document supplying the file:

| Request form | Selected `file_doc` |
|---|---|
| `pk` identifies a version and there is **no** `version` parameter | That exact `request_doc` version |
| `pk` identifies a root and there is no `version` parameter | Latest non-deleted version for the root, falling back to the root |
| Any `pk` plus a valid numeric `version` | The document with that ID, but only if it is the authorized root or has `root_document_id == root_doc.id` |
| Non-integer `version` | 404 `"Invalid version parameter"` |
| Numeric version missing or outside the root’s version family | 404 |

An explicit `version` parameter enables `global_objects`, so explicitly selected deleted versions can be resolved. There is also a subtle empty-value branch: `?version=` counts as “present” for `include_deleted`, but as falsey in `resolve_requested_version_for_root`; it therefore selects the latest version while including deleted documents.  
[src/documents/views.py:1375-1400](src/documents/views.py#L1375-L1400)  
[src/documents/versioning.py:136-143](src/documents/versioning.py#L136-L143)  
[src/documents/versioning.py:159-195](src/documents/versioning.py#L159-L195)

### 4. Original versus archive

Once `file_doc` is fixed:

- `original=true`—exact lowercase string—requests the original.
- Otherwise, the archive is used if `file_doc.has_archive_version` is true.
- If there is no archive, the original is returned regardless.
- No additional authorization occurs for either representation.

`serve_file` then:

- uses `archive_file`, archive filename, and PDF MIME type for the archive;
- otherwise uses `source_file`, the source filename, and the document MIME type;
- returns an attachment with a normalized and UTF-8-encoded `Content-Disposition` filename.

`follow_formatting` is passed directly from query parameters. Because it is not parsed as a Boolean here, any nonempty value—including the string `"false"`—is truthy and selects the on-disk filename.  
[src/documents/views.py:1368-1373](src/documents/views.py#L1368-L1373)  
[src/documents/views.py:1429-1448](src/documents/views.py#L1429-L1448)  
[src/documents/views.py:4941-4995](src/documents/views.py#L4941-L4995)

## Authorized resource versus returned resource

The resources differ by stage:

- **View-level check:** Document model permission.
- **Object authorization:** `root_doc`.
- **Returned document/version:** `file_doc`, selected only after root authorization.
- **Returned representation:** `file_doc.archive_file` or `file_doc.source_file`, selected after version selection.

Therefore, alternate-version and original/archive parameters change the object or file **returned**, but not the object against which the explicit object authorization is evaluated. Source establishes that the alternate version must belong to the authorized root’s version family; it does not establish a separate permission check against that version’s own owner or grants.

## Missing facts and blocked conclusions

| Missing fact | Conclusion it prevents |
|---|---|
| Whether the user has the model-level `documents.view_document` permission | Whether DRF permits the handler to run |
| Root-document owner and Guardian object grants | Whether the explicit root check permits or returns 403 |
| Actual `pk`, `version`, root/version relationships, and deletion state | Which document becomes `request_doc`, `root_doc`, and `file_doc`, or whether the request is 404 |
| `file_doc.has_archive_version` | Whether a non-`original=true` request returns archive or source |
| Actual backing-file existence | Whether streaming completes or the action converts `FileNotFoundError` to 404 |
| Authentication/permission backend configuration outside the allowed source | Exact runtime identity and grant resolution beyond the shown calls |

No deployment assumption is needed to establish the internal order above. External middleware or proxy controls could add earlier restrictions, but none can be inferred from the allowed evidence. The auxiliary property checker did not certify the complete dynamic router/dispatch relation, so no machine-level whole-task certification is claimed; the conclusions above are based on the cited source trace.