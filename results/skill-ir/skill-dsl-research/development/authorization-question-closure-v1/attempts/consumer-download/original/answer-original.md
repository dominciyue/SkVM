## Download trace

### 1. Entry and document selection

- `UnifiedSearchViewSet` is registered as `documents` under `/api/` and inherits `DocumentViewSet`. DRF turns its `@action(methods=["get"], detail=True)` into:
  `GET /api/documents/{pk}/download/`  
  [`src/paperless/urls.py:74-77`, `97-100`, `297-300`; `src/documents/views.py:2503`; `framework/rest_framework-3.18.1/rest_framework/routers.py:128-135`]
- `download()` calls `file_response(pk, request, "attachment")`; missing files or documents become 404 responses.  
  [`src/documents/views.py:1834-1839`]
- `pk` loads `request_doc` using `Document.global_objects`, so deleted documents are included. If absent, the result is 404. The code then derives `root_doc`: the document itself if it is a root, otherwise its associated root, with a defensive fallback to the requested child if the root cannot be loaded.  
  [`src/documents/views.py:1401-1420`; `src/documents/versioning.py:146-156`]

### 2. Authorization order

Before `download()` runs, DRF:

1. authenticates the request;
2. checks class-level permissions;
3. invokes the action only if those checks pass.  
   [`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`]

`DocumentViewSet` declares:

- `IsAuthenticated`;
- `PaperlessObjectPermissions`.  
  [`src/documents/views.py:1008-1027`]

For this GET:

- `IsAuthenticated` requires `request.user.is_authenticated`;
- `PaperlessObjectPermissions` requires the model-level `documents.view_document` permission through `user.has_perms(...)`.  
  [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`, `233-246`; `src/documents/permissions.py:30-44`]

The action does not use `self.get_object()`, so its custom lookup does not invoke DRF’s ordinary object-permission hook. Instead, `_resolve_request_and_root_doc()` explicitly checks `view_document` on **`root_doc`**. It permits access when:

- `root_doc.owner is None`;
- `root_doc.owner == request.user`; or
- Guardian grants the user `view_document` on `root_doc`.

Otherwise it returns HTTP 403.  
[`src/documents/views.py:1421-1427`; `src/documents/permissions.py:624-635`]

Thus authorization precedes version and original/archive selection.

### 3. Version selection

After root authorization passes:

| Request state | Effective `file_doc` |
|---|---|
| `pk` names a child version and the `version` key is absent | That child (`request_doc`) |
| Otherwise, no `version` value | Newest version under the root, or the root if no version exists |
| `version=` is present but empty | Also resolves to the newest version, even when `pk` named a child |
| Nonempty valid integer `version` | That document, only if it is the root or a direct child of the same root |
| Invalid integer | 404 via `NotFound("Invalid version parameter")` |
| Missing or different-family version ID | 404 |

[`src/documents/views.py:1375-1399`; `src/documents/versioning.py:140-143`, `159-195`]

Version lookup also includes deleted documents on this path.

### 4. Original versus archive

For the selected `file_doc`:

- only the exact query value `original=true` forces the original;
- otherwise, an archive is returned when `file_doc.has_archive_version` is true;
- otherwise, the original is returned.

[`src/documents/views.py:1368-1373`, `1442-1447`]

`serve_file()` then returns:

- **archive:** `archive_file`, MIME type `application/pdf`;
- **original:** `source_file`, using `doc.mime_type`.

The Download action always uses `Content-Disposition: attachment`. `follow_formatting` changes the response filename, not the file representation. Because its raw query value is passed as a boolean condition, any nonempty value—including `follow_formatting=false`—is truthy.  
[`src/documents/views.py:4941-4995`]

## Authorized resource versus returned resource

Selecting another version **does not change the authorization resource**:

- authorization is evaluated on `root_doc`;
- version selection occurs afterward;
- no second ownership or object-grant check is made on `file_doc`;
- original/archive selection merely chooses a file field on that `file_doc`.

Consequently, root authorization governs every valid version in the family and both representations, even if individual version rows have different ownership or grants.

## Conditional conclusion and missing facts

The concrete result cannot be determined because these runtime facts are unspecified:

1. Whether the user has model-level `documents.view_document`—without it, DRF does not reach the action.
2. Whether the root is unowned, owned by the user, or has a Guardian `view_document` grant—this determines success versus 403.
3. The actual `pk`, `version`, and `original` values and database version relationships—these determine `file_doc` and representation.
4. Whether the selected backing file exists—this determines successful download versus 404.

No deployment fact is needed for the source behavior above. No independent policy was supplied, so this is a behavior trace rather than a conformance judgment.

**Validation limitation:** the automated semantic check remained unresolved because its retained entry was the unrelated `BaseRouter.urls` cache property rather than `DocumentViewSet.download`. The conclusions above come from the directly cited Download-path source; the machine semantic result remained unreviewed.