## Conclusion

The Download operation authorizes the **root document**, then chooses which document version and which physical representation to return. Selecting another version **does not change the resource checked for authorization**; it only changes the effective `file_doc`, and the selected version must belong to the authorized root’s version lineage.

### Control flow

1. `DocumentViewSet.download()` delegates to `file_response(pk, request, "attachment")`. Missing documents/files become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. The viewset applies:
   - `IsAuthenticated`
   - `PaperlessObjectPermissions`  
   
   For GET requests, the latter requires the model-level `view_document` permission.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:150-151,233-246`

3. `pk` resolves `request_doc`, including deleted documents for this path. The code derives `root_doc` from it and checks:
   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```
   Failure returns HTTP 403. Thus the decisive object is `root_doc`, not a subsequently selected version.  
   `src/documents/views.py:1401-1427`

4. Only after that check, `_get_effective_file_doc()` chooses the file-bearing document:
   - If `pk` directly names a version and no `version` parameter is supplied, that version remains `file_doc`.
   - Otherwise, the root’s requested/default version is resolved.
   - An explicit version ID is accepted only if it is the root itself or has that root as `root_document_id`; unrelated versions produce 404.  
   `src/documents/views.py:1375-1399`  
   `src/documents/versioning.py:169-195`

5. Representation selection applies to that `file_doc`:
   - `original=true` exactly → `source_file`
   - otherwise, if an archive exists → `archive_file`
   - otherwise → `source_file`  
   
   This branch changes the returned bytes, not the authorization object. `follow_formatting` only affects the download filename.  
   `src/documents/views.py:1369-1373,1429-1448,4941-4995`

### Authorization branches

- **Allow:** authenticated caller passes model permission and `view_document` on `root_doc`; requested version is valid within that root lineage.
- **Deny:** unauthenticated caller or missing model-level GET permission.
- **Deny with 403:** root-document `has_perms_owner_aware` check fails.
- **Deny with 404:** document/file is missing, or the requested version is invalid, nonexistent, or unrelated to the root.

Ownership and grant data were not supplied. Source shows owner-aware/global/object permission branches, including direct owner handling and object-permission fallback, but it cannot establish which branch a real user satisfies. Active authentication/permission backend configuration and stored grants are also runtime/deployment facts not established here.  
`src/documents/permissions.py:30-53,624-635`

There is therefore no source basis to call cross-version selection an authorization bypass: versions are treated as representations within one root authorization domain. A different result would require an external policy stating that individual versions must have separate ACLs.

**Validation status:** source-grounded but partially unreviewed. The structured checker did not pass because its final envelope expected a different result schema and retained unresolved semantic-link diagnostics at the delegated entry return.