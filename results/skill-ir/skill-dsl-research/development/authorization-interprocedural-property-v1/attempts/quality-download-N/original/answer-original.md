## Download authorization and file selection

At revision `126ec414a8b65158368653a2604ae58415e43103`, the endpoint is:

`GET /api/documents/{pk}/download/`

It is a detail action inherited by `UnifiedSearchViewSet` through `DocumentViewSet` ([urls.py:74-78](src/paperless/urls.py#L74-L78), [views.py:2503-2507](src/documents/views.py#L2503-L2507), [views.py:1834-1839](src/documents/views.py#L1834-L1839)).

### Control flow

1. **Request-level authorization**
   - `DocumentViewSet` requires both `IsAuthenticated` and `PaperlessObjectPermissions` ([views.py:1008-1027](src/documents/views.py#L1008-L1027)).
   - For GET, `PaperlessObjectPermissions` requires the model-level `documents.view_document` permission ([permissions.py:30-44](src/documents/permissions.py#L30-L44)). DRF performs this before invoking `download` ([views.py:418-421](framework/rest_framework-3.18.1/rest_framework/views.py#L418-L421), [permissions.py:233-246](framework/rest_framework-3.18.1/rest_framework/permissions.py#L233-L246)).

2. **Resolve the URL document and authorization resource**
   - `file_response()` loads the `{pk}` row as `request_doc` using `Document.global_objects`, so soft-deleted rows are included.
   - If `{pk}` is a version, `get_root_document()` resolves its `root_document`; otherwise the requested row is itself the root.
   - Authorization is then checked **on that root document**, not on `request_doc` or the subsequently selected version ([views.py:1401-1427](src/documents/views.py#L1401-L1427)).
   - The root passes when it is unowned, owned by the requesting user, or Guardian’s object checker reports `view_document`; otherwise the response is 403 ([permissions.py:624-635](src/documents/permissions.py#L624-L635)).

3. **Select the document row whose file will be returned**
   - URL names a **root**, no `?version=`: choose the newest non-deleted child version, falling back to the root.
   - URL names a **child version**, no `?version=`: return that exact child.
   - Any request with `?version=`: interpret its value as a document primary key and resolve it relative to the root family ([views.py:1388-1399](src/documents/views.py#L1388-L1399), [versioning.py:159-195](src/documents/versioning.py#L159-L195)).
   - A selected ID is accepted only if it is either:
     - the root itself, or
     - a direct child whose `root_document_id` equals that root’s ID.
   - Consequently, `?version=` cannot select an arbitrary document from another root family. Invalid syntax, a missing row, or an unrelated row produces 404 ([views.py:1375-1386](src/documents/views.py#L1375-L1386), [versioning.py:184-195](src/documents/versioning.py#L184-L195)).

4. **Choose original versus archive**
   - The default is the selected row’s archive PDF when `has_archive_version` is true.
   - Exact query value `original=true` forces its original file.
   - If the selected row has no archive, its original is returned regardless.
   - `serve_file()` opens either `file_doc.archive_file` or `file_doc.source_file`; thus both representations belong to the selected version row ([views.py:1429-1448](src/documents/views.py#L1429-L1448), [views.py:4941-4973](src/documents/views.py#L4941-L4973), [models.py:452-475](src/documents/models.py#L452-L475)).

### Does selecting another version change what is authorized?

**No.** Selecting `?version=<id>` changes the row supplying the returned bytes, but it does not change the authorization object. Authorization remains against the root derived from the URL’s `{pk}`. There is no separate owner or object-grant check on the selected version row.

The relationship is therefore:

> authorized resource = root document family  
> returned file = selected member’s original or archive representation

This aligns with an apparent family-level design: the model comments that the root owns metadata for all versions ([models.py:477-484](src/documents/models.py#L477-L484)). However, each `Document` row technically inherits its own nullable `owner` field, and the shown model constraint does not require version owners or object grants to match the root ([models.py:33-44](src/documents/models.py#L33-L44), [models.py:315-356](src/documents/models.py#L315-L356)). Therefore:

- If versions are intended to inherit the root’s access policy, the observed check is consistent.
- If deployment policy treats individual version rows as independently protected resources, this path does not enforce that policy and needs owner confirmation.

### Deleted-version nuance

Because download initially uses `global_objects`, a deleted `{pk}` can be resolved. An explicit `?version=` also resolves through `global_objects`, allowing a deleted family member to be selected. Without `?version=`, a root normally selects the latest non-deleted version, while a child URL returns that exact child even if deleted ([views.py:1408-1419](src/documents/views.py#L1408-L1419), [views.py:1375-1381](src/documents/views.py#L1375-L1381)).

### Facts still needed for a concrete access decision

Source alone does not establish whether a particular user receives a particular file. That requires:

- the root document’s owner;
- the authenticated user’s global `documents.view_document` permission;
- Guardian user/group grants on the root;
- the requested and selected rows’ actual root relationship and deletion state;
- whether the installation’s intended policy is root-family authorization or independent per-version authorization;
- confirmation that the configured Django/Guardian authentication backends implement the permission calls as expected.

No cross-family version-selection bypass is demonstrated by these source branches.