## Partial source conclusion

**Selecting another version changes the file served, but not the resource explicitly authorized.**

- `download()` delegates the document ID and request to `file_response()` (`src/documents/views.py:1835-1839`).
- The ID resolves to `request_doc`, from which `root_doc` is derived. The explicit permission check is:
  `has_perms_owner_aware(request.user, "view_document", root_doc)`  
  (`src/documents/views.py:1401-1427`).
- Only after that check passes does the code select `file_doc` and pass it to `serve_file()` (`src/documents/views.py:1429-1448`).
- A `version` parameter may therefore change `file_doc`, but the selected document must either be the authorized root itself or have `root_document_id == root_doc.id`. An unrelated document ID is rejected (`src/documents/versioning.py:169-195`).

Thus, authorization is performed against the **root document family**, while the protected effect may serve a selected member of that family. The version selector does not permit switching to another root family.

### Conditional caller outcome

The concrete allow/deny result cannot be determined because ownership and object grants are unspecified. The helper permits an ownerless root, the root owner, or a caller with the root’s `view_document` object permission (`src/documents/permissions.py:624-635`); otherwise the handler returns HTTP 403.

The view also declares `IsAuthenticated` and `PaperlessObjectPermissions` (`src/documents/views.py:1008-1022`).

### Remaining limits

- Runtime caller identity, root ownership, and object grants were not supplied.
- Deployment-time overrides or monkey patches are outside the reviewed source.
- Some framework/decorator integration relationships remained mechanically unreviewed. The direct ordering and root/version relationship above are source-explicit, but the host’s final semantic check could not complete because its format-repair budget was exhausted. Therefore this is a **partial, unvalidated source conclusion**, not a confirmed vulnerability finding.