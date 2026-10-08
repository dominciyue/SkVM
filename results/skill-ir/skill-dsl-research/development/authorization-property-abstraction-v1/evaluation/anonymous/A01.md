## Conclusion

The download path authorizes the **version-family root document**, then may return bytes from a **different document row representing a version**. Selecting another version changes the file source, but **does not change the object against which authorization is evaluated**.

### Control flow

1. `DocumentViewSet` requires authentication and `PaperlessObjectPermissions`. For GET, that permission class requests the model-level `documents.view_document` permission.  
   `src/documents/views.py:1008-1027`  
   `src/documents/permissions.py:30-44`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246`

2. `download()` calls `file_response()` directly rather than DRF’s `get_object()`. Consequently, DRF’s normal per-object check is not applied to the requested or selected version; the custom check below is decisive.  
   `src/documents/views.py:1834-1839`  
   `framework/rest_framework-3.18.1/rest_framework/generics.py:86-105`

3. `file_response()` loads the requested `pk`, obtains its root document, and checks only:
   ```python
   has_perms_owner_aware(user, "view_document", root_doc)
   ```
   `src/documents/views.py:1401-1441`

4. For that root, authorization succeeds when:
   - the root is unowned;
   - the authenticated user owns the root; or
   - Guardian reports `view_document` on the root.

   Otherwise the endpoint returns 403.  
   `src/documents/permissions.py:624-635`

### Version selection

| Request | Document row supplying the file | Authorized object |
|---|---|---|
| Root `pk`, no `version` | Newest version, or root when none exists | Root |
| Version `pk`, no `version` | That specifically addressed version | Root |
| Either `pk`, `?version=<id>` | Root itself or a direct version belonging to that same root | Root |

The explicit version resolver rejects non-integer, nonexistent, or cross-family IDs. Thus it cannot select an arbitrary unrelated document, but it can switch from the addressed row to a sibling version in the same family.  
`src/documents/views.py:1375-1399`  
`src/documents/versioning.py:169-195`

A blank `?version=` is treated as present by part of the control flow but as “select latest” by the resolver. Explicit version lookups use `global_objects`; the requested `pk` is also loaded through that manager, so deleted-state behavior differs from the ordinary active-object queryset.  
`src/documents/views.py:1375-1381, 1429-1434`

### Original versus archive

After selecting `file_doc`:

- exact `original=true` returns `file_doc.source_file`;
- otherwise, if that version has an archive filename, it returns `file_doc.archive_file`;
- otherwise it returns the source file.

`follow_formatting` changes only the returned filename. None of these choices causes another authorization check.  
`src/documents/views.py:1368-1373, 1442-1448`  
`src/documents/views.py:4941-4965`  
`src/documents/models.py:452-475`

## Authorization implication

The enforced policy is therefore **root-level ACL inheritance across the version family**:

- permission on a selected child version is neither required nor consulted;
- owning or having a grant on a child does not help if access to its root is denied;
- conversely, access to the root permits downloading any selectable version, regardless of that version row’s own owner or Guardian grants.

Separate version-row ownership is possible. Consumer-created versions copy the root owner, but `merge_as_versions()` only changes the source document’s root/version fields and does not normalize its owner or object grants.  
`src/documents/consumer.py:272-285`  
`src/documents/bulk_edit.py:632-682`

## Security status and missing facts

This source establishes the root-versus-version authorization behavior, but not a confirmed unauthorized disclosure. Confirmation requires:

- the actual root owner and Guardian grants;
- the selected version’s owner and grants;
- the requester’s model-level permission and root access;
- whether product policy intends every version to inherit the root ACL or intends each `Document` row’s ACL to remain effective;
- the relevant rows’ deletion and archive/file availability state.

If versions are intended to retain independent ACLs, this is a source-grounded authorization mismatch: a user authorized only for the root could receive another version’s original or archive bytes. If the root intentionally owns the family ACL, the behavior is consistent with that design.