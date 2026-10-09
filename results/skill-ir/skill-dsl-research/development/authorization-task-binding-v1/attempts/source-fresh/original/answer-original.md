## Download trace

### 1. Request and returned file

`download` is a DRF detail `GET` action. The router-supplied detail identifier becomes `pk`; the handler calls:

```python
self.file_response(pk, request, "attachment")
```

`FileNotFoundError` and `Document.DoesNotExist` raised during that call are translated to HTTP 404.  
[`src/documents/views.py:1834-1839`]

`file_response` then:

1. Looks up `request_doc` by `id=pk` using `Document.global_objects`, so the initial lookup includes deleted documents.
2. Derives its root document.
3. Performs the explicit permission check described below.
4. Selects the effective `file_doc`.
5. Selects its original or archive file.
6. Returns an attachment `FileResponse`.  
[`src/documents/views.py:1401-1448`]

#### Version selection

- If `pk` directly names a version (`request_doc.root_document_id` is non-null) and the `version` parameter is absent, `file_doc` remains that exact `request_doc`.
- Otherwise selection occurs within `root_doc`’s version family:
  - absent or falsy `version` selects the latest version;
  - a truthy value must parse as an integer **Document ID**;
  - the candidate must be the root itself or a child of that root;
  - invalid syntax produces `NotFound`;
  - a missing or unrelated candidate produces 404.
- Merely supplying `version`, including an empty value, enables include-deleted resolution; an empty value still takes the “latest” branch.  
[`src/documents/views.py:1375-1399`; `src/documents/versioning.py:140-195`]

#### Original/archive selection

`original` is recognized only when its value is exactly lowercase `"true"`:

- `original=true` → `file_doc.source_file`.
- Otherwise, if `file_doc.has_archive_version` → `file_doc.archive_file`.
- Otherwise → `file_doc.source_file`.

Archive responses use the archive filename and PDF MIME type. Source responses use the source filename and `doc.mime_type`.  
[`src/documents/views.py:1368-1373`; `src/documents/views.py:1438-1448`; `src/documents/views.py:4941-4995`]

`follow_formatting` changes only the response filename. It is tested as the raw query value, so any non-empty string—including `"false"`—takes the truthy branch. It does not change the file being opened.

---

## 2. Authorization and ordering

The order is:

1. **DRF request initialization**
2. **Authentication**
3. **View-level permission checks**
4. **`download` handler**
5. **Lookup of `request_doc` by `pk`**
6. **Explicit owner-aware permission on `request_doc`**
7. **Version selection**
8. **Original/archive selection**
9. **File response construction**

DRF calls `perform_authentication()` and `check_permissions()` before dispatching the handler.  
[`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`; `framework/rest_framework-3.18.1/rest_framework/views.py:490-529`]

`DocumentViewSet` declares:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

For `GET`, `PaperlessObjectPermissions` maps to the model’s `view` permission.  
[`src/documents/views.py:1008-1027`; `src/documents/permissions.py:30-53`]

The custom download code does not use DRF’s normal `get_object()` path and contains no visible `check_object_permissions(file_doc)` call. Instead, after looking up `request_doc`, it explicitly checks:

```python
has_perms_owner_aware(
    request.user,
    "view_document",
    request_doc,
)
```

That helper allows access when:

- `request_doc.owner is None`;
- `request_doc.owner == request.user`; or
- Guardian’s `ObjectPermissionChecker` reports the requested object permission.

Otherwise, the operation returns HTTP 403 before selecting a version or opening a file.  
[`src/documents/views.py:1401-1427`; `src/documents/permissions.py:624-635`]

The explicit branch is skipped if `request.user` is null, although normal DRF dispatch is protected upstream by `IsAuthenticated`.

---

## 3. Which resource is authorized?

The explicit owner-aware authorization object is always **`request_doc`**, the document identified by `pk`.

| Request branch | Authorized object | File document |
|---|---|---|
| `pk` identifies a version; no `version` parameter | `request_doc` | Same `request_doc` |
| `pk` identifies a root; no `version` parameter | Root `request_doc` | Latest version under that root |
| Explicit `version` parameter | `request_doc` | Root or another member of the same root family |
| Original/archive choice | Unchanged | Unchanged; only its file field changes |

Consequently:

- Alternate-version selection can change the document whose file is returned **after** authorization.
- No second owner-aware or DRF object-permission check on the selected `file_doc` is visible.
- Choosing original versus archive does **not** change the authorization resource; it only chooses `source_file` versus `archive_file` on `file_doc`.

This establishes the source behavior, but not whether root/version-family authorization equivalence is intended policy.

---

## 4. Missing facts and conditional conclusions

The following facts are unavailable:

- The caller’s model-level `view_document` permission.
- The `request_doc` owner, whether it is unowned, and the caller’s Guardian grants.
- The concrete root/version relationships, deletion state, and archive availability.
- Whether the selected backing file exists and how the configured storage backend behaves.
- The policy specifying whether permission on one root-family member authorizes every selectable version.
- The router registration needed to establish the exact deployed URL; only the detail-action entry and `pk` behavior are established here.
- Any external deployment, proxy, or storage controls outside the allowed source.

Therefore:

- A particular authenticated user’s allow/deny result cannot be determined without their permissions and the selected document’s ownership/grants.
- The precise returned file cannot be determined without instance data.
- The absence of a second check on `file_doc` is established, but whether that is an authorization vulnerability remains unresolved without the root/version authorization policy.

**Validation note:** the automated authorization check remained semantically unreviewed because its entry-call role annotation and host branch-path closure were unresolved. Accordingly, this is a bounded source trace, not a confirmed vulnerability verdict.