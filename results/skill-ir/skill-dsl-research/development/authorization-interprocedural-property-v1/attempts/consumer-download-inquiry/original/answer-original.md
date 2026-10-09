## Status

**Partial / unreviewed.** The source trace below is supported by the cited code, but the authorization checker did not validate the complete semantic chain: it could not link `file_response()`’s `_resolve_request_and_root_doc()` call to the separately interpreted helper body. Therefore these conclusions should not be treated as independently checked.

## Download request flow

The router registers `UnifiedSearchViewSet` under `documents`; it inherits the document actions. The resulting detail action is conventionally:

```http
GET /api/documents/{pk}/download/
```

Routing is registered at `src/paperless/urls.py:77`. The action is defined at `src/documents/views.py:1835-1839` and delegates to:

```python
self.file_response(pk, request, "attachment")
```

### Processing order

1. **DRF request controls**
   - `DocumentViewSet` configures `IsAuthenticated` and `PaperlessObjectPermissions` (`src/documents/views.py:1008-1045`).
   - DRF authenticates the request and executes request-level permissions before calling `download()` (`framework/rest_framework-3.18.1/rest_framework/views.py:404-421,490-529`).
   - `IsAuthenticated` requires an authenticated `request.user` (`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`).

2. **Resolve the URL document**
   - `_resolve_request_and_root_doc()` looks up `pk` through `Document.global_objects`, so deleted rows may participate.
   - It then derives that document’s root document.
   - Missing `pk` produces a 404.

3. **Authorize against the root**
   - Before selecting a version or file representation, the helper checks:
     ```python
     has_perms_owner_aware(request.user, "view_document", root_doc)
     ```
   - Failure returns 403.
   - This helper permits access when the root is unowned, owned by the caller, or the caller has the applicable Guardian object permission (`src/documents/permissions.py:624-635`).
   - Relevant flow: `src/documents/views.py:1368-1448`.

4. **Choose the effective document version**
   - If the URL `pk` directly identifies a version and there is **no** `version` query parameter, that version is used.
   - Otherwise:
     - no `version` parameter → latest version for the root, falling back to the root itself;
     - non-integer `version` → 404;
     - nonexistent version → 404;
     - version belonging to another root → 404;
     - valid version under the same root → that version is used.
   - See `src/documents/views.py:1368-1448` and the version-resolution helper at `src/documents/views.py:169-195`.

5. **Choose original or archive**
   - `original=true`, exactly, selects `file_doc.source_file`.
   - Otherwise, if `file_doc.has_archive_version` is true, it selects `file_doc.archive_file`.
   - Otherwise it falls back to `file_doc.source_file`.
   - Archive responses use `application/pdf`; source responses use the document MIME type.
   - `follow_formatting` affects the download filename, not which file contents are selected.
   - See `src/documents/views.py:4941-4995`.

6. **Construct the response**
   - `serve_file()` returns a Django `FileResponse` with `Content-Disposition: attachment`.
   - Missing backing files are converted by `download()` to a 404.

## Authorization versus selection

The explicit per-document authorization decision is made on the **root document derived from the URL `pk`**. It happens before:

- resolving a `version` query parameter;
- selecting latest versus explicit version;
- selecting source versus archive storage.

Selecting another version does not create a separate authorization target. Instead, the version resolver constrains the candidate to the already-authorized root. An unrelated root’s version is rejected.

Similarly, `original=true` and archive fallback only change the representation returned from the selected `file_doc`; they do not trigger another authorization check.

One important implementation detail is that this action does not obtain the document through DRF’s normal `get_object()` path. Consequently, the decisive document-specific control here is the explicit root-document check inside `_resolve_request_and_root_doc()`, rather than an automatic `check_object_permissions()` invocation on the selected version.

## Conditional branches

| Condition | Result |
|---|---|
| Authentication/request-level permission fails | Rejected before `download()` |
| URL `pk` is missing | 404 |
| Caller lacks root-document permission | 403 |
| URL identifies a version and no `version` parameter exists | That URL-selected version |
| No explicit version otherwise | Latest version, or root fallback |
| `version` is malformed, absent, or belongs to another root | 404 |
| `original=true` | Source/original file |
| Other `original` value or omitted, archive exists | Archive PDF |
| Archive does not exist | Source/original file |
| Backing file does not exist | 404 |

## Facts still needed for a concrete allow/deny conclusion

The source establishes the decision order, but not whether a particular request succeeds. That requires:

- whether the caller is authenticated;
- root-document ownership;
- the caller’s model and Guardian object grants;
- the actual `pk`, `version`, `original`, and `follow_formatting` values;
- the requested version’s root relationship and deletion state;
- archive availability and backing-file existence.

Authentication backend behavior, storage behavior, middleware, and deployment controls outside the allowed source were not reviewed. No live or sandboxed runtime test was performed.