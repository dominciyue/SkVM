## Download authorization review

**Status:** Partial/source-grounded; the final machine check failed because several framework helper links remained semantically unreviewed. The source-level conclusions below are retained, but the formal conformance result is **undetermined**, not independently validated.

### Request and authorization flow

1. `download` is a GET detail action. It passes the route `pk` to `file_response` and converts missing-document/file errors to HTTP 404.  
   `src/documents/views.py:1834-1839`

2. The viewset declares `IsAuthenticated` and `PaperlessObjectPermissions`.  
   `src/documents/views.py:1008-1021`

3. `file_response` resolves:
   - `request_doc`: the exact document selected by `pk`, using `Document.global_objects`;
   - `root_doc`: the root associated with `request_doc`.  
   `src/documents/views.py:1401-1420, 1429-1434`

4. The explicit download-path object check is:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   Failure returns HTTP 403. Importantly, the checked object is **`root_doc`**, not necessarily the document later served.  
   `src/documents/views.py:1421-1427`

5. That helper allows access when the checked root:
   - has no owner;
   - is owned by `request.user`; or
   - has the relevant Guardian object grant for that user.  
   `src/documents/permissions.py:624-635`

Ownership, unowned status, and object grants are runtime-unspecified, so no concrete request can be classified as allowed or denied from the supplied facts.

### Which document is returned?

After the root check passes, `_get_effective_file_doc` selects `file_doc`:

- If `pk` selected a version document and no `version` query parameter is present, `file_doc = request_doc`.
- Otherwise, resolution starts from `root_doc`:
  - without `version`, it selects the latest version, falling back to the root;
  - with `version=<id>`, it selects that ID only if it is the root or a member of the same root family.  
  `src/documents/views.py:1375-1399`  
  `src/documents/versioning.py:140-195`

Consequently, `file_doc` can differ from both the URL-selected `request_doc` and the authorization-checked `root_doc`.

### Original versus archive

`serve_file` always receives `doc=file_doc`:

- `original=true` selects that document’s original representation;
- otherwise, its archive representation is used when one exists.  
  `src/documents/views.py:1442-1447`

Selecting original versus archive **does not change the document resource**. It only changes the representation of the already selected `file_doc`.

### Exact-object policy assessment

Source-level branch analysis indicates a policy mismatch:

- **Same-object branch:** if `file_doc == root_doc`, the authorized and returned document coincide.
- **Different-version branch:** if `file_doc != root_doc`, authorization was performed only against `root_doc`; there is no subsequent `view_document` check against the exact `file_doc` whose bytes are returned.

Therefore, selecting another version can change the returned resource without changing the resource checked by the explicit download guard. This conflicts with the supplied policy that permission on a related root alone is insufficient.

### Remaining gaps

- The actual `pk`, `version` parameter, ownership, unowned state, and grants are unspecified.
- Authentication backend behavior and any deployment-level authorization outside the allowed source are unavailable.
- The formal authorization checker rejected the result because framework permission-helper call links and feasible semantic paths were not fully closed. Thus the source-level policy mismatch is **partial/unreviewed**, rather than a machine-validated conformance finding.