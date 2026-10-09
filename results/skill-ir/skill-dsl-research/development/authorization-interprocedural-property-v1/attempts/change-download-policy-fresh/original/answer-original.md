## Result — partial / unreviewed

The source-level behavior is clear, but the authorization checker did **not** validate the result because its retained graph failed to link `file_response` to the protected file effect (`source-fields-missing:role`). Its formal disposition and policy assessment therefore remain **unknown / undetermined**.

### Source behavior

- `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`. The `download` detail action passes `pk` and `request` to `file_response`; missing documents/files become 404 responses.  
  `src/documents/views.py:1008-1021,1834-1839`

- `file_response` loads `request_doc` from `pk`, including deleted documents, and derives its `root_doc`. It then explicitly checks:
  ```python
  has_perms_owner_aware(request.user, "view_document", root_doc)
  ```
  Failure returns 403. This helper permits an unowned root, its owner, or a Guardian-backed object grant on that root. Ownership and grants are unspecified here.  
  `src/documents/views.py:1401-1427`  
  `src/documents/permissions.py:624-635`

- Only after that root check does the code choose `file_doc`:
  - If `pk` names a version and there is no `version` query parameter, `file_doc = request_doc`.
  - Otherwise it resolves from `root_doc`: no `version` selects the latest family member; an explicit version ID must identify either the root or one of its versions.  
  `src/documents/views.py:1375-1399`  
  `src/documents/versioning.py:140-195`

- `serve_file` receives `file_doc`. `original=true` chooses its source file; otherwise its archive is used when available. Consequently, **original/archive changes the representation, not the document being authorized**.  
  `src/documents/views.py:1429-1448,4941-4965`

### Authorized object versus returned object

Selecting another version can change the document whose file is returned, but it does **not** change the explicit authorization target:

- checked object: `root_doc`
- returned-file object: `file_doc`

When they are identical, the exact-object relationship holds. When version selection makes them different, the shown path performs no second `view_document` check on `file_doc`.

Thus, the read source indicates that permission on a related root can be sufficient to return a version’s file—contrary to the supplied exact-object policy. Formal conformance remains **undetermined** only because the machine authorization graph did not validate the helper-to-effect linkage.

### Unresolved facts

- The concrete `pk`, `version`, and `original` values.
- Ownership and object grants for `request_doc`, `root_doc`, and the selected `file_doc`.
- Deployment authentication configuration and the complete DRF route/dispatch chain.
- The checker’s unresolved semantic link from `file_response` to the protected file-return effect.