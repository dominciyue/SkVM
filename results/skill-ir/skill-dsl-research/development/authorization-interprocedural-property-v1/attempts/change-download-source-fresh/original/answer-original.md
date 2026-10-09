## Download authorization behavior

**Status: partial / semantically unreviewed.** The source establishes the local branches below, but the final authorization check rejected the interprocedural link between `download(pk, request)` and `file_response`, so this is not a fully machine-verified authorization verdict.

### Control flow

1. `download` is a detail action that calls `file_response(pk, request, "attachment")`. Missing documents or files become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`. DRF performs authentication and view-level permission checks before invoking the action.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/views.py:404-421,490-529`

3. `file_response` resolves the URL document as `request_doc`. For downloads it uses `Document.global_objects`, so deleted rows may also be resolved. It then checks:

   ```python
   has_perms_owner_aware(request.user, "view_document", request_doc)
   ```

   Failure returns HTTP 403.  
   `src/documents/views.py:1368-1448`

4. That owner-aware check succeeds when `request_doc`:
   - has no owner,
   - is owned by the authenticated user, or
   - has the required object grant for that user.  
   
   `src/documents/permissions.py:624-635`

### Requested document versus selected version

The explicit owner-aware authorization check is against **`request_doc`**, the document identified by the URL `pk`.

The subsequently served **`file_doc`** is selected as follows:

| Request | Served document |
|---|---|
| `pk` names a child version, no `version` parameter | That same child `request_doc` |
| `pk` names the root, no `version` parameter | The root’s latest version |
| Explicit integer `version` parameter | That version, if it is the root or a child of the same root |
| Invalid, missing, or unrelated version | HTTP 404 |

`src/documents/views.py:1368-1448`  
`src/documents/versioning.py:140-195`

Therefore, **selecting another version can change the document whose file is returned without changing the document used by the explicit owner-aware permission check**. The selected document is constrained to the same root/version family, but the examined path contains no second `has_perms_owner_aware` check against `file_doc`.

### Original versus archive

After selecting `file_doc`:

- `original=true` serves `file_doc.source_file`.
- Otherwise, an available archive representation serves `file_doc.archive_file`.
- If no archive exists, it serves `source_file`.

Thus original/archive selection changes the **representation of the selected document**, not the document used for the earlier authorization check.  
`src/documents/views.py:4941-4995`

### What cannot be concluded

Ownership and object grants for both `request_doc` and the selected version are unspecified. Consequently, the source does not establish that a concrete caller can retrieve an unauthorized version; it only establishes the differing authorization-versus-effect objects on relevant branches.

The semantic checker also left two source-linking gaps:

- `pk` and `request` were not successfully bound from the entry action to the interpreted helper parameters.
- The complete action-registration/class-decorator dependency remained pending.

Accordingly, this is not a confirmed vulnerability or allow/deny decision for any particular user.