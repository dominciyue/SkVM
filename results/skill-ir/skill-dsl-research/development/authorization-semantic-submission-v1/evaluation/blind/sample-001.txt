## Conclusion

The download path authorizes the **root document**, then may return a file belonging to a selected document version under that root. Selecting another valid version changes the `Document` passed to file serving, but **does not change the object checked by the explicit authorization guard**.

Because ownership and object grants are unspecified, the caller’s final allow/deny result remains conditional.

## Control flow

1. `DocumentViewSet.download()` passes the URL `pk`, authenticated request, and `"attachment"` disposition to `file_response()`. Missing documents or files become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. DRF authenticates and performs view-level permission checks before invoking the action. `DocumentViewSet` configures `IsAuthenticated` and `PaperlessObjectPermissions`; `IsAuthenticated` requires an authenticated `request.user`.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/views.py:404-421`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:150-151`

3. `file_response()` resolves the URL `pk` into `request_doc`, including deleted rows, and derives its `root_doc`. It then checks:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   Failure returns HTTP 403 before version or representation selection.  
   `src/documents/views.py:1401-1436`

4. After authorization, `_get_effective_file_doc()` chooses the file-bearing `file_doc`:
   - If the URL directly identifies a version and there is no `version` query parameter, that version remains `file_doc`.
   - Otherwise, `version=<id>` may select only the root itself or a version whose `root_document_id` matches that root.
   - Without a version value, resolution selects the newest version, falling back to the root.
   - Invalid, missing, or unrelated version IDs do not produce a file.  
   `src/documents/views.py:1375-1399`  
   `src/documents/versioning.py:140-195`

5. `serve_file()` receives the selected `file_doc`. `original=true` selects its original representation. Otherwise, its archive representation is used when `file_doc.has_archive_version` is true.  
   `src/documents/views.py:1368-1373`  
   `src/documents/views.py:1437-1448`

## Authorization/resource relationship

| Branch | Authorized object | File-bearing object |
|---|---|---|
| Root URL, no version | Root document | Newest applicable version, or root |
| Root URL with valid `version=<id>` | Root document | Requested member of that root’s version family |
| Version URL, no `version` parameter | That version’s root document | URL-selected version |
| `original=true` | Unchanged root document | Unchanged selected version; original representation |
| Archive/default representation | Unchanged root document | Unchanged selected version; archive if available |

Thus, version selection deliberately authorizes the family through its root rather than independently checking the selected version. The resolver prevents crossing into an unrelated root’s version family.

## Remaining facts

- Whether this particular user passes `has_perms_owner_aware(..., "view_document", root_doc)` cannot be determined without the root’s owner and object-grant data.
- The internal grant-resolution branches of `has_perms_owner_aware` and the final filesystem/proxy behavior inside `serve_file` were not traced here. Neither is required to establish the root-versus-version authorization relationship.
- The automated authorization-result check did not validate the complete model because of unresolved entry exception/decorator dependencies. The conclusions above are therefore **source-grounded but partially machine-unreviewed**; no vulnerability is asserted.