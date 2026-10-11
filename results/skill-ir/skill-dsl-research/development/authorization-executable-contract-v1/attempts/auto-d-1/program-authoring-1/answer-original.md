## Request entry and document identity

- `UnifiedSearchViewSet`, which inherits `DocumentViewSet`, is registered under the API router as `documents`; the router is mounted under `/api/`. The detail `download` action therefore handles `GET /api/documents/<pk>/download/`. A legacy `/fetch/doc/<pk>` endpoint redirects there. [`src/paperless/urls.py:74-77`](src/paperless/urls.py#L74-L77) [`src/paperless/urls.py:97-100`](src/paperless/urls.py#L97-L100) [`src/paperless/urls.py:297-312`](src/paperless/urls.py#L297-L312) [`src/documents/views.py:2503`](src/documents/views.py#L2503)
- The `pk` path component is passed to `download()`, which delegates to `file_response(pk, request, "attachment")`. Missing documents or files become 404 responses. [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)
- `file_response()` resolves `pk` through `Document.global_objects`, so the initial lookup includes deleted rows. It derives `root_doc` from the requested row and returns 404 if the requested row does not exist. [`src/documents/views.py:1401-1420`](src/documents/views.py#L1401-L1420)

## Authorization order

Authorization precedes version and original/archive file selection:

1. **Framework-level checks:** `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`. DRF authenticates and runs every permission’s `has_permission()` before invoking the handler. [`src/documents/views.py:1008-1027`](src/documents/views.py#L1008-L1027) [`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)
   - `IsAuthenticated` requires a truthy user whose `is_authenticated` is true. [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151)
   - For GET, `PaperlessObjectPermissions` requires the model-level `view_document` permission. Its inherited `has_permission()` obtains the queryset model and calls `request.user.has_perms(...)`. [`src/documents/permissions.py:30-44`](src/documents/permissions.py#L30-L44) [`framework/rest_framework-3.18.1/rest_framework/permissions.py:218-246`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L218-L246)

2. **Application object check:** after loading `request_doc`, the code resolves its `root_doc` and checks `has_perms_owner_aware(user, "view_document", root_doc)`. Failure returns an explicit 403. This check passes if the root is unowned, owned by the user, or the Guardian checker reports the object grant. [`src/documents/views.py:1408-1427`](src/documents/views.py#L1408-L1427) [`src/documents/permissions.py:624-635`](src/documents/permissions.py#L624-L635)

3. **Only after that check** does `file_response()` select the effective version and then choose its archive or source file. [`src/documents/views.py:1429-1448`](src/documents/views.py#L1429-L1448)

Although the viewset declares `PermittedObjectsFilter`, this action does not use DRF’s filtered `get_object()` path or call `check_object_permissions()`. It performs a direct manager lookup followed by the explicit root check above. Thus `PaperlessObjectPermissions.has_object_permission()` is not the decisive object check for Download.

## Version-selection branches

The effective `file_doc` is selected as follows:

- **The URL `pk` identifies a version row and no `version` parameter is present:** return that exact requested version.
- **Otherwise, no nonempty `version` value:** select the newest version belonging to the root, falling back to the root itself if no version exists.
- **Explicit integer `version=<id>`:** select that row only if it is the root itself or has `root_document_id == root_doc.id`.
- **Non-integer version:** DRF `NotFound("Invalid version parameter")`.
- **Missing or unrelated version ID:** 404.
- An explicitly supplied version enables `global_objects`, so deleted versions can participate. An absent version normally uses the non-deleted manager when choosing the latest version. An empty `?version=` is treated as “parameter present” for the deleted-object flag but as no specific version for resolution. [`src/documents/views.py:1368-1399`](src/documents/views.py#L1368-L1399) [`src/documents/versioning.py:140-195`](src/documents/versioning.py#L140-L195)

Crucially, explicit version selection is constrained to the already-authorized root’s version family. The selected version is **not independently permission-checked**.

## Original versus archive

After `file_doc` is selected:

- `original=true`, exactly lowercase, forces `file_doc.source_file`.
- Otherwise, if `file_doc.has_archive_version` is true, `file_doc.archive_file` is returned.
- Otherwise it falls back to `file_doc.source_file`. [`src/documents/views.py:1368-1373`](src/documents/views.py#L1368-L1373) [`src/documents/views.py:1442-1448`](src/documents/views.py#L1442-L1448)

For an archive, the MIME type is `application/pdf`; for the source it is `file_doc.mime_type`. The response is an attachment. `follow_formatting` changes the download filename—not the selected file—between the on-disk name and public formatted name. [`src/documents/views.py:4941-4995`](src/documents/views.py#L4941-L4995)

## Authorized resource versus returned resource

The effective authorization relation is:

- model-level gate: the **Document model** and `view_document`;
- object-level gate: the **root document**;
- returned content: the selected root/version’s **source or archive representation**.

Therefore, choosing another version or choosing original versus archive does not change the object against which authorization is evaluated. It changes the `Document` instance/file representation returned after root authorization. A request whose path directly names a version similarly authorizes its root and can then return that exact version when no `version` parameter overrides it.

## Facts that remain unavailable

| Missing fact | Conclusion it prevents |
|---|---|
| User’s actual model permissions and authentication-backend results | Whether the framework-level gate permits this particular request |
| Root ownership and actual user/group Guardian grants | Whether the root object check returns success or 403 |
| Actual `pk`, root/version relationships, deletion state, and query parameters | Which version branch executes or whether it returns 404 |
| `has_archive_version` and stored-file availability | Whether archive or source bytes are returned and whether opening the file succeeds |
| Intended policy for separately authorizing historical versions/representations | Whether root-level authorization is policy-correct; source alone establishes behavior, not whether that behavior is a vulnerability |
| Storage/proxy/deployment configuration | Whether the selected `FileResponse` is ultimately delivered successfully; it does not alter the source-level authorization order shown above |

The auxiliary property checker remained `unknown` because its source relations were unbound; the conclusions above are therefore the direct cited source trace, not a machine-certified authorization verdict.