## Conclusion

The outcome is **conditional** on the authenticated user’s permission for the document’s **root document**. Selecting a version or choosing original versus archive can change the file returned, but does **not** change the resource against which the explicit authorization check is performed.

### Control flow

1. `download` is a GET detail action. It passes the path `pk` and request to `file_response`; missing records/files become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:150-151`

3. `file_response` resolves `pk` through `Document.global_objects`, including deleted rows, producing:
   - `request_doc`: the exact document identified by `pk`;
   - `root_doc`: its version-family root.  
   `src/documents/views.py:1401-1420`

4. Before choosing a version or representation, it calls:

   `has_perms_owner_aware(request.user, "view_document", root_doc)`

   Failure returns HTTP 403. Therefore, the explicit authorization object is **`root_doc`**, not the subsequently selected version.  
   `src/documents/views.py:1421-1427`  
   `src/documents/permissions.py:624-635`

### Which version supplies the file?

After the root authorization succeeds:

- If `pk` itself identifies a version and there is no `version` query parameter, that exact `request_doc` is used.
- Otherwise:
  - no `version` parameter selects the latest version for the root;
  - an explicit numeric version ID is accepted only if it is the root itself or has `root_document_id == root_doc.id`;
  - malformed, missing, or unrelated version IDs produce not-found behavior.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:140-143,159-195`

Consequently, selecting another version **can change `file_doc` and the bytes returned**, but cannot use this parameter to move into another document family. It also does not cause a second authorization check against the selected version.

### Original versus archive

For the selected `file_doc`:

- `original=true` serves `source_file`;
- otherwise, if an archive exists, it serves `archive_file`;
- otherwise it falls back to `source_file`.

This is only representation selection; it does not alter the previously authorized `root_doc`.  
`src/documents/views.py:1368-1373,1429-1448,4941-4965`

### Conditional outcomes

- **Allow:** authenticated user passes the owner-aware `view_document` check for `root_doc`; the chosen in-family version and representation are served.
- **Deny:** that root check fails; HTTP 403 is returned before version/representation selection.
- **Not found:** document, version, or file is absent, the version is malformed, or it belongs to another root family.

The document’s ownership and the user’s object grants are unspecified, so the concrete allow/deny result cannot be determined. Authentication-backend configuration and the concrete router prefix are also outside the inspected source path.

**Validation note:** the source observations were recorded, but the structured authorization checker rejected its final envelope due conflicting focused/inquiry schema requirements and internal `focus-schema` discriminator errors. It therefore marked semantic review as unreviewed; the source-based explanation above is preserved as partial evidence rather than a checker-validated result.