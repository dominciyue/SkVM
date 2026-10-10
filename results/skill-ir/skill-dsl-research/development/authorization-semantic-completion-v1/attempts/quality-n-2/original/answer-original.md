## Request-to-file trace

### 1. Routing and request identity

`UnifiedSearchViewSet` is registered under `documents` inside the `/api/` URL tree. Its inherited `download` detail action therefore handles:

```text
GET /api/documents/{pk}/download/
```

The path’s `{pk}` identifies the initially requested `Document` row.  
Sources: `src/paperless/urls.py:74-77,97-100,297`; `src/documents/views.py:2503`; `framework/rest_framework-3.18.1/rest_framework/routers.py:115-134`.

### 2. Pre-handler authorization

Before `download()` runs, DRF authenticates the request and checks the view’s permission classes (`src/documents/views.py:1008-1027`; `framework/rest_framework-3.18.1/rest_framework/views.py:404-421`):

1. `IsAuthenticated` requires an authenticated user.
2. `PaperlessObjectPermissions` requires the global model permission `documents.view_document` for a GET request, because Paperless overrides the standard GET permission map (`src/documents/permissions.py:30-44`; `framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`).

The `download` action does not override those permission classes (`src/documents/views.py:1834-1839`).

### 3. Requested document and authorization target

`download()` calls `file_response(pk, request, "attachment")`. That method:

1. Looks up `{pk}` through `Document.global_objects`, because it calls `_resolve_request_and_root_doc(..., include_deleted=True)`. Consequently, the initial lookup can include a soft-deleted document or version.
2. Resolves the document family’s root:
   - if `{pk}` identifies a root, the root is that row;
   - if it identifies a version, the root is its `root_document`.
3. Applies the object-level check to the **root document**, not to the initially requested version or the subsequently selected file-bearing version.

The owner-aware check permits access when:

- the root has no owner;
- the authenticated user owns the root; or
- Guardian reports that the user has `view_document` on the root.

Otherwise it returns HTTP 403.  
Sources: `src/documents/views.py:1401-1427,1429-1436`; `src/documents/versioning.py:146-156`; `src/documents/permissions.py:624-635`.

This is a custom lookup/check path. It does not call DRF’s `get_object()`, so DRF’s normal `check_object_permissions()` call and the configured `PermittedObjectsFilter` are not used for this download lookup. The explicit root check above is the operative object authorization. Compare `src/documents/views.py:1022-1027,1429-1448` with `framework/rest_framework-3.18.1/rest_framework/generics.py:79-105`.

## Version-selection branches

Version selection happens **after authorization of the root**.

| Request condition | File-bearing `Document` selected |
|---|---|
| `{pk}` is a version and no `version` query parameter is present | That exact requested version |
| `{pk}` is a root and no `version` parameter is present | Newest non-deleted child version by descending `version_index`, then ID; otherwise the root |
| `version=<integer>` is present | The row with that ID, but only if it is the root itself or a direct version of that root |
| `version` names another document family | HTTP 404 |
| `version` is non-integer | HTTP 404, “Invalid version parameter” |
| `version=` is present but empty | Treated as “latest,” but presence enables lookup through `global_objects`, so deleted versions can participate |
| Numeric `version` is present | Candidate lookup also uses `global_objects`, so a deleted root/version can be selected |

Sources: `src/documents/views.py:1369-1399,1437-1441`; `src/documents/versioning.py:23-28,159-195`; `src/documents/models.py:315-330`.

Thus, a `version` value cannot directly escape to an unrelated document: the candidate must be the authorized root or have `root_document_id == authorized_root.id`.

## Original versus archive selection

After the file-bearing version is selected:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

The branches are:

- `original=true`, exactly and case-sensitively: return the selected version’s original/source file.
- `original` absent or any value other than exact `"true"`:
  - if the selected version has an archive file, return that archive;
  - otherwise fall back to its original/source file.

An archive exists when `archive_filename` is non-null.  
Sources: `src/documents/views.py:1368-1373,1442-1448`; `src/documents/models.py:452-475`.

`serve_file()` then returns:

- **archive:** `doc.archive_file`, MIME type `application/pdf`;
- **original:** `doc.source_file`, using `doc.mime_type`.

The response is a `FileResponse` with attachment `Content-Disposition`.  
Sources: `src/documents/views.py:4941-4973,4988-4995`.

`follow_formatting` affects only the download filename:

- truthy value: use the stored `archive_filename` or `filename`;
- otherwise: use the generated public filename.

The implementation passes the raw query value, so even `follow_formatting=false` is a non-empty, truthy string and selects the stored filename branch. It does not change the returned bytes. Sources: `src/documents/views.py:1447,4948-4965`; `src/documents/models.py:477-498`.

## Authorization versus selected resource

The exact order is:

1. Authenticate user.
2. Require global `documents.view_document`.
3. Resolve `{pk}` and its root.
4. Authorize `view_document` against the **root**.
5. Select the exact/latest/requested version.
6. Select that version’s original or archive representation.
7. Open and return the file.

Therefore:

- Selecting another version changes the file-bearing `Document` row and potentially the bytes returned, but it does **not** change the object on which authorization is evaluated.
- Selecting original versus archive changes only the representation of the already-selected version.
- Neither the selected version’s owner/grants nor the original/archive file receives a separate authorization check.
- The same-root constraint is what prevents `version=<id>` from selecting an arbitrary unrelated document.

A missing selected file, missing requested row, or nonexistent/unrelated version results in HTTP 404; lack of root access produces HTTP 403 (`src/documents/views.py:1382-1385,1414-1426,1835-1839`).

## Facts not available from the allowed source

The source establishes the decision logic, but not whether a particular authenticated user succeeds. That depends on unavailable runtime facts:

- whether the user has global `documents.view_document`;
- the root document’s owner;
- user/group Guardian grants on that root;
- whether `{pk}` exists and whether it is soft-deleted;
- the actual root/version relationships, deletion states, and version ordering;
- whether original/archive files exist in configured storage;
- authentication backend and deployment-level controls outside the supplied paths.

Those facts block a conclusion such as “user X can download document Y,” but they do not alter the source-established conclusion that object authorization is performed against the root before version and representation selection.