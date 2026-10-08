## Download authorization flow

**Entry point:** `DocumentViewSet.download()` is a detail `GET` action. It passes the URL document ID (`pk`) and authenticated request to `file_response()` with attachment disposition. Missing documents/files become 404s.  
`src/documents/views.py:1834-1839`

### Upstream controls

`DocumentViewSet` declares:

- `IsAuthenticated`
- `PaperlessObjectPermissions`

DRF performs authentication and permission checks before invoking the action.  
`src/documents/views.py:1008-1027`  
`framework/rest_framework-3.18.1/rest_framework/views.py:490-529`

The decisive per-document check for downloads is nevertheless explicit inside `_resolve_request_and_root_doc()`:

1. Load the document named by the URL `pk`, including deleted rows.
2. Resolve it to its root document.
3. Check `view_document` on that **root document** using the authenticated `request.user`.
4. Return HTTP 403 if the check fails.

`src/documents/views.py:1401-1436`

`has_perms_owner_aware()` permits access when the root document:

- has no owner;
- is owned by the caller; or
- has a `view_document` object grant for the caller.

`src/documents/permissions.py:624-635`

Because ownership and grants are unspecified, the concrete outcome is conditional: the download is authorized only if one of those root-document conditions holds.

## Version selection versus authorized resource

Authorization is performed on the root resolved from the URL document. The file-bearing document is selected **afterward**:

- URL names a version, with no `version` parameter: serve that exact version.
- URL names a root, with no `version` parameter: serve the newest version, or the root if it has no versions.
- `version=<id>` is supplied: serve it only if it is that root or a child version whose `root_document_id` matches that root.
- Invalid, nonexistent, or cross-root version selections are rejected rather than changing document families.

`src/documents/views.py:1375-1441`  
`src/documents/versioning.py:169-195`

Therefore, **selecting another version changes the file-bearing row, but does not change the resource against which authorization is checked**. The check remains `view_document` on the original URL document’s root. A version ID belonging to another root cannot redirect the download to that other document.

## Original versus archive

For the selected file-bearing document:

- `original=true` selects its original representation.
- Otherwise, its archive representation is selected when `has_archive_version` is true.
- If no archive exists, it falls back to the original.

`src/documents/views.py:1368-1373`  
`src/documents/views.py:1442-1448`  
`src/documents/views.py:4941-4995`

Changing original/archive representation likewise does not trigger authorization against a different object; it only chooses which stored representation of the already-selected version is returned.

## Remaining runtime facts

The source determines the control relationship, but an actual allow/deny result requires:

- the authenticated user’s identity;
- the resolved root’s owner;
- that user’s `view_document` object grants on the root;
- the requested version value and its root relationship; and
- whether the selected version has an archive representation.

No deployment-specific fact is needed to establish the source-level root-versus-version relationship. The structured interpretation check could not complete because its format-repair budget was exhausted; conclusions above are based on direct source inspection.