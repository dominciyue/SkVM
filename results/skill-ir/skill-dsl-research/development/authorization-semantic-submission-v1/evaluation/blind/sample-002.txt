## Source-based conclusion

The download path is **conditional on authorization of the root document**, while the returned bytes may come from a selected version document.

### Control flow

1. `DocumentViewSet.download()` delegates the route `pk` and request to `file_response(..., "attachment")`. Missing documents/files become 404s.  
   `src/documents/views.py:1835-1839`

2. `file_response()`:
   - resolves the route-selected document and its root;
   - checks authorization;
   - selects the effective version document;
   - chooses original or archive representation;
   - serves the resulting file.  
   `src/documents/views.py:1429-1448`

### Principal and authorization object

`DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions`.  
`src/documents/views.py:1008-1027`

The local download-specific check uses:

```python
has_perms_owner_aware(request.user, "view_document", root_doc)
```

A non-null user failing this check receives HTTP 403. The check succeeds when the root is:

- unowned;
- owned by the authenticated user; or
- covered by that user’s object-level permission grant.

`src/documents/views.py:1401-1427`  
`src/documents/permissions.py:624-635`

Because ownership and grants were not supplied, the outcome for a particular authenticated user cannot be selected: it depends on those runtime facts.

### Requested document and version selection

The route `pk` first loads `request_doc`; its `root_doc` is then derived.

The effective file document behaves as follows:

- If `pk` directly names a version document and no `version` parameter is present, that version remains the effective document.
- Otherwise, selection is relative to `root_doc`.
- With no version value, the latest version for the root is selected.
- With an explicit integer `version`, the candidate must be either:
  - the root itself, or
  - a document whose `root_document_id` equals that root’s ID.
- Invalid, missing, or out-of-lineage versions are rejected rather than served.

`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:140-195`

### Original versus archive

After `file_doc` is selected:

- `original=true` causes the source/original file to be served.
- Otherwise, the archive is used when `file_doc.has_archive_version` is true.
- If no archive exists, the source file is used.

Concretely, `serve_file()` selects `doc.archive_file` or `doc.source_file`.  
`src/documents/views.py:1368-1373, 1442-1448, 4941-4995`

## Does selecting another version change the authorized resource?

**No—the local authorization object remains `root_doc`.** An explicit version can change `file_doc`, and therefore the actual file returned, but there is no second owner/grant check against that selected version.

The relation is therefore:

- **authorized object:** `root_doc`
- **effect object:** selected `file_doc`
- **constraint connecting them:** `file_doc` must be the root or belong to that root’s version lineage

This is not by itself a confirmed vulnerability. Whether root-level authorization is sufficient depends on an unestablished policy/data-model invariant—particularly whether versions may legitimately have distinct owners or object grants. That fact was not established by the reviewed source windows and must not be assumed.

## Validation limitation

These conclusions are source-grounded but formally **partial/unreviewed**: the final machine-result check failed because its `missing` entry used a string where the protocol required an object, after which tool delivery closed. Two retained semantic diagnostics also remained around propagating the entry method’s mixed success/403 outcome and exception outcome. These protocol gaps do not alter the source branches described above.