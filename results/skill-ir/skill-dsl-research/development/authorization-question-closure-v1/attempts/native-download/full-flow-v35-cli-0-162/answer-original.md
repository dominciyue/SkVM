## Partial source conclusion

**Status:** unreviewed/partial. The final authorization check failed because the analysis graph retained an unresolved callee link and class-level permission dependency. The direct source branches below were nevertheless inspected.

### Download flow

1. `DocumentViewSet.download()` is a GET detail action. It calls `file_response(pk, request, "attachment")`; missing document/file errors become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. `file_response()` resolves:
   - `request_doc`: the document whose ID is `pk`, using `global_objects` because download passes `include_deleted=True`;
   - `root_doc`: the version family’s root document.  
   `src/documents/views.py:1401-1427`, `1429-1434`

3. The explicit object authorization is:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   A non-null user failing it receives HTTP 403 and no file is served. The checked resource is **`root_doc`**, not the subsequently selected version.  
   `src/documents/views.py:1421-1427`, `1435-1436`

### Which version is returned?

After authorization, `_get_effective_file_doc()` chooses `file_doc`:

- If `pk` directly names a version (`request_doc.root_document_id is not None`) and there is **no** `version` parameter, it returns that `request_doc`.
- Otherwise it resolves the requested or default version relative to `root_doc`.
- An invalid version parameter produces `NotFound`; no resolved document produces HTTP 404.

`src/documents/views.py:1375-1399`

Consequently, selecting another version can change the `Document` instance whose file is returned, but it **does not change the resource passed to the explicit authorization check**. Authorization remains against the version family’s `root_doc`.

### Original versus archive

For the selected `file_doc`:

- `original=true` requests its original representation.
- Otherwise, the archive representation is used only when `file_doc.has_archive_version` is true.
- Therefore original/archive selection changes the representation, not the authorization object.

`src/documents/views.py:1368-1373`, `1442-1448`

### Conditional outcome

- **Deny:** the authenticated user lacks owner-aware `view_document` permission on `root_doc` → HTTP 403.
- **Allow:** that root-document check succeeds → the selected version’s original or archive representation is served.
- **Unknown for the stated request:** ownership and object grants were not provided, so neither branch can be assumed.

### Precise gaps

- The source-analysis checker retained an unresolved semantic link between `file_response()` and `_resolve_request_and_root_doc()`, despite both bodies being read.
- It also retained an unresolved class-level permission/decorator dependency. DRF source shows that `dispatch()` runs `initial()`, which performs authentication and permission checks, but the complete applicable class-level permission configuration was not successfully linked by the checker.
- These gaps prevent a fully checked authorization conclusion; they do not alter the directly observed root-document check described above.