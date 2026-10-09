## Conclusion

The download endpoint authorizes the **root document**, then may return bytes from a **different version document within that root’s version family**. Choosing `version=` changes the concrete `Document` used for the file response, but **does not change the document on which `view_document` is checked**.

### Control flow

1. `DocumentViewSet.download` is a GET detail action that calls `file_response(pk, request, "attachment")`. Missing documents/files become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. The viewset declares `IsAuthenticated` and `PaperlessObjectPermissions`; DRF performs authentication and permission checks before invoking the action.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/views.py:321-342,404-421,490-529`

3. `pk` loads `request_doc`, using `global_objects` for this download path. The code then derives `root_doc`.  
   `src/documents/views.py:1401-1420`

4. The explicit local authorization check is:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   It permits access when the root is unowned, owned by the user, or the user has the object permission; otherwise it returns 403.  
   `src/documents/views.py:1421-1427`  
   `src/documents/permissions.py:624-635`

Because ownership and grants were not supplied, the actual request outcome remains conditional.

### Version selection

After the root authorization succeeds:

- If `pk` identifies a version and no `version` parameter is supplied, that requested version is used.
- Otherwise the root’s latest version is selected.
- If `version=<id>` is supplied, the candidate must be either the root itself or a document whose `root_document_id` equals that root’s ID. Unrelated documents are rejected as not found.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:140-195`

There is **no separate owner/object-grant check on the selected version document**. Authority is inherited from the checked root relationship. Source alone does not establish whether this family-level authorization is contrary to the intended policy, so this is not a confirmed vulnerability.

### Original versus archive

For the selected `file_doc`:

- `original=true` returns `file_doc.source_file`.
- Otherwise, if that document has an archive version, it returns `file_doc.archive_file`.
- Otherwise it falls back to `source_file`.

This changes only the representation of the selected document, not the authorization object.  
`src/documents/views.py:1369-1373,1429-1448,4941-4995`

### Missing facts

- The root document’s owner.
- Whether the authenticated user has a relevant object grant.
- Any independent policy requiring each historical version to be authorized separately from its root.

The source conclusions above are direct, but the automated semantic check remained partially unreviewed because it did not accept the entry-to-`file_response` linkage and guard annotation as complete.