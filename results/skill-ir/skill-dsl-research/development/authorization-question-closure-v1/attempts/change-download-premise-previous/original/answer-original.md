## Result: source-grounded, machine review incomplete

The Download path is clear from the application source. However, the authorization checker did not accept the final trace because its retained entry was incorrectly anchored to `BaseRouter.urls` rather than the Download action. The conclusions below are therefore **source-grounded but not machine-validated**.

### 1. Request and file selection

The document router registers `UnifiedSearchViewSet`, which inherits the Download action from `DocumentViewSet` (`src/paperless/urls.py:77`, `src/documents/views.py:1008-1027`, `2503-2741`).

The detail action receives the URL document identifier as `pk` and calls:

```python
self.file_response(pk, request, "attachment")
```

(`src/documents/views.py:1834-1839`).

`file_response` then:

1. Loads the URL-requested document by `id=pk` using `Document.global_objects`, so deleted documents can be found.
2. Derives its root document.
3. Authorizes access to that root.
4. Only after authorization, selects the effective version and physical representation (`src/documents/views.py:1401-1448`).

Version branches are:

- **URL identifies a version and no `version` query key is present:** that exact URL-requested version is returned.
- **Otherwise, no truthy `version` value:** selects the latest version of the root, falling back to the root itself.
  - With no query key, latest-version lookup excludes deleted versions.
  - `?version=` counts as a present parameter but has a falsey value, so it selects the latest version while including deleted versions.
- **Numeric `version=<id>`:** accepts only the root itself or a document whose `root_document_id` is that root. Missing or unrelated IDs produce 404.
- **Malformed `version`:** produces 404.

Latest ordering is descending `version_index`, then descending ID (`src/documents/versioning.py:23-28`, `140-195`).

Representation branches are:

- Exact `?original=true` → `source_file`.
- Otherwise, if the selected document has an archive version → `archive_file`, served as PDF.
- Otherwise → `source_file` using the document MIME type.
- `follow_formatting` changes the response filename, not the authorized resource or file selection.

See `src/documents/views.py:1369-1448`, `4941-4975`.

### 2. Authorization and its order

The effective order is:

1. DRF request initialization and authentication.
2. `IsAuthenticated`.
3. `PaperlessObjectPermissions` global model-level permission. For GET, its permission map requires `documents.view_document`.
4. Load the URL-requested document and derive its root.
5. Explicitly evaluate:

   ```python
   has_perms_owner_aware(user, "view_document", root_doc)
   ```

6. If that fails, return HTTP 403.
7. Select the requested/latest version.
8. Select source versus archive and construct the attachment response.

Relevant source: `src/documents/views.py:1019-1027`, `1401-1448`; `src/documents/permissions.py:30-53`, `624-635`; framework initialization at `framework/rest_framework-3.18.1/rest_framework/views.py:404-430`.

The owner-aware root check succeeds when the root:

- has no owner;
- is owned by the caller; or
- has a corresponding object permission granted to the caller.

Although normal DRF retrieval performs object permission checks through `get_object()`, this action does not use `self.get_object()`. Its decisive object-specific check is the explicit check on `root_doc`.

Under the stated premise:

- If the URL document is the root and the caller owns it, the explicit root check passes, subject to the separate global model permission.
- If the URL document is a version, owning that version alone does **not** establish authorization: ownership or grants for its root remain decisive.

### 3. Alternate version and representation

Selecting another version does **not** change the object on which authorization is evaluated.

The authorization object remains the derived **root document**. Version selection happens afterward and is limited to that root or one of its child versions. There is no second owner/object-grant check on the selected version.

Likewise, choosing original versus archive changes only the returned physical representation:

| Selection | Authorization object | Returned file |
|---|---|---|
| Root/latest version | Root document | Selected document’s archive when available, otherwise source |
| `version=<child-id>` | Root document | Child version’s archive or source |
| `original=true` | Root document | Selected document’s source file |
| Default representation | Root document | Archive if present, otherwise source |

### 4. Missing facts and conditional conclusions

The following runtime facts remain unspecified:

- Whether the caller has the global `documents.view_document` model permission. Without it, the request can be denied before root selection.
- If the URL identifies a version, whether its root is unowned, owned by the caller, or covered by an object grant. This determines the explicit root authorization result.
- Whether the selected document actually has its expected source/archive file. Missing files affect the eventual 404 response, not the authorization decision.

Ownership or object grants on the selected child version and on the archive representation are not missing prerequisites: this implementation does not consult them separately.

**Validation limitation:** the host’s retained semantic trace remained attached to unrelated router URL-cache code and reported unresolved transform/return diagnostics. Consequently, this result is partial/unreviewed at the machine-check layer despite the direct application-source trace above.