## Download authorization analysis

**Verification status: partial / unreviewed.** The final authorization check rejected the stronger `allow`/`violated` classification because the retained semantic model did not close `file_response`’s normal return and unmatched-exception outcomes. The source relationships below are directly supported, but the checker’s formal behavior and policy disposition remain **unknown / undetermined**.

### Request and authorization flow

1. `DocumentViewSet.download()` delegates to `file_response(pk, request, "attachment")`; missing documents or files become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. The viewset declares `IsAuthenticated` and `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1022`

3. `file_response()` resolves:
   - `request_doc`: the document identified by `pk`;
   - `root_doc`: that document’s version-family root.  
   `src/documents/views.py:1401-1427`

4. The explicit object check on the download path is:

   ```python
   has_perms_owner_aware(
       request.user,
       "view_document",
       root_doc,
   )
   ```

   Failure returns HTTP 403 before a file is served. Crucially, the checked object is **`root_doc`**, not the subsequently selected `file_doc`.  
   `src/documents/views.py:1421-1427`

5. `has_perms_owner_aware()` allows access when the checked root:
   - has no owner;
   - is owned by the caller; or
   - has a matching Guardian object grant.  
   `src/documents/permissions.py:624-635`

Ownership and grants for any concrete document are unspecified, so no particular user’s result should be assumed.

### Which document supplies the file?

After checking `root_doc`, `_get_effective_file_doc()` selects the actual `file_doc`:

- If `pk` directly names a child version and no `version` parameter is present, `request_doc` itself is returned.
- Otherwise, resolution occurs relative to `root_doc`.
- Without an explicit `version`, the latest version in the root’s family is selected.
- With `version=<id>`, the selected document must be either the root or a child whose `root_document_id` equals that root’s ID; unrelated documents produce 404.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:159-195`

Therefore, version selection cannot escape the requested root’s version family, but it **can change the exact document whose file is returned without changing the authorized object**.

### Original versus archive

`serve_file()` receives the already-selected `file_doc`:

- `original=true` causes its `source_file` to be returned.
- Otherwise, if it has an archive version, its `archive_file` is returned.
- If no archive exists, its `source_file` is returned.

`src/documents/views.py:1429-1448`  
`src/documents/views.py:4941-4965`

Thus:

- Selecting **original versus archive does not change the document being authorized or selected**; it changes only the representation of `file_doc`.
- Selecting another **version can change `file_doc`**, while authorization remains against `root_doc`.
- No second exact-object authorization check is visible between version selection and file serving.

### Policy assessment

The supplied policy requires authorization for the **exact document whose file is returned**, and says root-only permission is insufficient.

Source-level behavior appears inconsistent with that policy whenever `file_doc != root_doc`, including:

- directly requesting a child version by `pk`;
- receiving the latest child version for a root;
- selecting a related child through `version=<id>`.

The exact-object policy is satisfied only when the effective `file_doc` is itself `root_doc`, or when an external control independently proves equivalent exact-version authorization.

### Missing facts

- The concrete root/version ownership and Guardian grants are runtime facts not supplied.
- The actual `pk`, `version`, `original`, and archive availability determine which branch executes.
- No repository evidence reviewed here establishes an external gateway or deployment control that independently authorizes the exact selected version. Its existence must not be assumed.
- Formal checker closure remains incomplete for `file_response`’s normal return and unmatched exceptions; consequently, the automated conformance result remained **undetermined**, despite the direct source-level root-versus-file-object mismatch.