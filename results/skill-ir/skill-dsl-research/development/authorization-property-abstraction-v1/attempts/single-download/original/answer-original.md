## Source-grounded partial conclusion

**Selecting another version changes the downloaded object, but not the object explicitly authorized.**

- `download()` delegates to `file_response()` (`src/documents/views.py:1834-1839`).
- The requested `pk` resolves to `request_doc`, from which `root_doc` is derived. The explicit `view_document` check is performed against **`root_doc`** (`src/documents/views.py:1401-1427`).
- Only afterward is **`file_doc`** selected and passed to `serve_file()` (`src/documents/views.py:1429-1448`).
- A `version` parameter may select a different document, but only the root itself or a child whose `root_document_id` matches that root. Cross-root IDs are rejected (`src/documents/versioning.py:169-195`).

Therefore, for another valid version:

> **Authorized resource:** root document  
> **Effect resource:** selected version document

This is bounded to one version family; the selector cannot pivot to an unrelated document.

### Conditional outcome

The root check passes when the root is unowned, owned by the caller, or the caller has the relevant object grant (`src/documents/permissions.py:624-635`). Because ownership and grants are unspecified, the concrete result remains conditional:

- root check passes → the selected same-root version may be downloaded;
- root check fails → HTTP 403;
- invalid, missing, or cross-root version → no file is served.

### Remaining limits

- No independent policy states whether versions inherit root-level authority or require separate authorization, so this behavior cannot be classified as a vulnerability.
- Deployment authentication configuration and external proxy/middleware controls were not established; they may impose additional restrictions.
- The source relationships above were recorded, but the host’s semantic check remained **unreviewed** because the protocol format-correction budget was exhausted.