## Conclusion

The Download operation is **conditionally non-conformant** with the supplied exact-object policy:

- Authorization is evaluated against `root_doc`.
- The returned file is selected from `file_doc`, which may be the root document, the requested child/version, the latest version, or an explicitly selected version.
- There is **no object-view authorization check on `file_doc` after selection**.
- Therefore, branches where `file_doc is root_doc` authorize the matching document, but branches where `file_doc != root_doc` rely only on permission to the related root document, contrary to the stated policy.

Whether this produces an actual unauthorized disclosure for a particular user depends on unspecified ownership and object grants.

## Request entry and identification

`UnifiedSearchViewSet`, which inherits `DocumentViewSet`, is registered under the `documents` API router; the router is included under `^api/`. Thus the detail action is exposed as `GET /api/documents/{pk}/download/`. A legacy `/fetch/doc/{pk}` URL redirects there.【src/paperless/urls.py:L74-L77】【src/paperless/urls.py:L97-L100】【src/documents/views.py:L2503-L2506】【src/paperless/urls.py:L305-L312】

The `download` detail action receives `{pk}` and delegates to:

```python
self.file_response(pk, request, "attachment")
```

A `FileNotFoundError` or `Document.DoesNotExist` becomes a 404.【src/documents/views.py:L1834-L1839】

Inside `file_response`:

1. `pk` is looked up directly as `request_doc`.
2. The lookup uses `Document.global_objects` because `include_deleted=True`, so soft-deleted request rows are included.
3. `root_doc` is derived from `request_doc`: a root points to itself; a child points to its related root, with fallback to the request document if that root cannot be obtained.
4. A missing `pk` produces 404.【src/documents/views.py:L1401-L1427】【src/documents/versioning.py:L146-L156】

## Authorization and its order

Before the action executes, DRF authenticates the request and runs view-level permissions.【framework/rest_framework-3.18.1/rest_framework/views.py:L404-L421】

`DocumentViewSet` specifies:

- `IsAuthenticated`
- `PaperlessObjectPermissions`【src/documents/views.py:L1008-L1027】

For this GET:

1. `IsAuthenticated` requires an authenticated `request.user`.【framework/rest_framework-3.18.1/rest_framework/permissions.py:L145-L151】
2. `PaperlessObjectPermissions` maps GET to `view_document`. Its inherited `has_permission` obtains the queryset’s model and calls `request.user.has_perms(...)`; this is a model/view-level gate performed before the handler.【src/documents/permissions.py:L30-L44】【framework/rest_framework-3.18.1/rest_framework/permissions.py:L218-L246】
3. The handler then performs its own object-specific check, but specifically on `root_doc`:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   Failure returns 403 before file selection or serving.【src/documents/views.py:L1417-L1427】

The owner-aware check permits the root when it is unowned, owned by the user, or the Guardian checker reports `view_document` on that root.【src/documents/permissions.py:L624-L635】

Although DRF provides `check_object_permissions`, `initial()` only invokes ordinary `check_permissions`; object permissions are normally invoked later by object lookup code. This Download path does not use DRF’s `get_object()` or call `check_object_permissions()`—it performs the root-only check above instead.【framework/rest_framework-3.18.1/rest_framework/views.py:L331-L355】【framework/rest_framework-3.18.1/rest_framework/views.py:L404-L421】

Thus the order is:

1. authentication;
2. model-level `view_document`;
3. lookup of `request_doc` and derivation of `root_doc`;
4. object-view decision on `root_doc`;
5. selection of final `file_doc`;
6. original/archive selection;
7. file response.

## Version-selection branches

After root authorization, `_get_effective_file_doc` selects `file_doc`.【src/documents/views.py:L1388-L1399】【src/documents/views.py:L1429-L1448】

### 1. Child/version `pk`, with no `version` parameter at all

If `request_doc.root_document_id` is non-null and `get_request_version_param(request) is None`, `file_doc` is exactly `request_doc`.

Consequently, requesting a child/version ID directly returns that child’s file, but authorization was performed on its root.

### 2. Root `pk`, with no `version` parameter

The resolver selects the newest non-deleted child/version for that root, or the root itself if no child version exists.【src/documents/versioning.py:L159-L182】

Therefore:

- no versions → `file_doc == root_doc`;
- versions exist → `file_doc` is normally the latest child, while authorization remains on `root_doc`.

### 3. Empty `?version=`

This differs subtly from omitting the parameter:

- `_get_effective_file_doc` sees that the parameter is present and uses the resolver;
- the resolver treats the empty value as falsey and selects the latest version;
- because the parameter was present, `_resolve_file_doc` requests `include_deleted=True`.

Thus an empty version parameter selects the latest version from the global, deleted-inclusive manager.

### 4. Nonempty `?version=<value>`

The value must parse as an integer:

- non-integer → 404 with `"Invalid version parameter"`;
- nonexistent ID → 404;
- a document unrelated to the resolved root → 404;
- the root’s own ID or a child whose `root_document_id` equals that root’s ID → selected as `file_doc`.

Explicit version lookup includes deleted documents.【src/documents/views.py:L1375-L1386】【src/documents/versioning.py:L169-L195】

## Original versus archive representation

Representation selection happens only after `file_doc` has been selected:

- `?original=true` exactly → use the source/original file;
- otherwise, if `file_doc.has_archive_version` → use the archive;
- otherwise → use the source/original file.

Other values, including `original=false`, do not request the original explicitly and therefore take the archive when one exists.【src/documents/views.py:L1368-L1373】【src/documents/views.py:L1442-L1448】

`serve_file` then opens:

- `doc.archive_file`, with PDF MIME type, for archive mode;
- `doc.source_file`, with `doc.mime_type`, for original mode.

It returns a `FileResponse` and sets an attachment `Content-Disposition` filename. `follow_formatting` changes filename construction, not which document or file representation is selected.【src/documents/views.py:L4941-L4965】【src/documents/views.py:L4973-L4995】

Choosing original versus archive therefore **does not change the document used for authorization**. It only changes which file field of the already selected `file_doc` is returned.

## Exact authorized resource versus returned resource

| Selection branch | Authorized object | Returned document |
|---|---|---|
| Root with no versions | `root_doc` | `root_doc` |
| Explicit root version ID | `root_doc` | `root_doc` |
| Child/version `pk`, no `version` | `root_doc` | `request_doc` child |
| Root `pk`, latest child exists | `root_doc` | latest child |
| Empty `version` | `root_doc` | latest version, including deleted candidates |
| Explicit child version ID | `root_doc` | selected child |
| Original/archive switch | unchanged `root_doc` | unchanged `file_doc`; only its file representation changes |

Accordingly, exact-object authorization matches the returned document only when the selected `file_doc` is the root itself. The code has no subsequent:

```python
has_perms_owner_aware(user, "view_document", file_doc)
```

or equivalent check.

## Unavailable facts and what they prevent

1. **The user’s model-level `view_document` permission is unspecified.**  
   This prevents determining whether the request reaches the handler at all.

2. **Root ownership and root object grants are unspecified.**  
   This prevents determining whether the root-specific check returns 403 or allows selection to continue.

3. **Ownership and grants on child/version documents are unspecified.**  
   This prevents proving that a particular allowed request discloses a file the user could not view directly. It does not change the structural conformance result: those permissions are never checked.

4. **Document/version database contents are unavailable.**  
   This prevents determining whether `pk` names a root or child, which version is latest, whether an explicit version belongs to that root, and whether deleted versions participate.

5. **`has_archive_version` and underlying file availability are unavailable.**  
   This prevents determining whether the archive or source bytes are actually returned, or whether file access ends in 404.

6. **Authentication backend and deployment configuration are outside the evidence.**  
   This prevents identifying accepted credential types, the precise unauthenticated HTTP response, and the externally deployed URL prefix. It does not alter the established in-handler root-versus-file authorization order.

The auxiliary property checker remained `unknown` because its source relations were not successfully bound; that machine status does not supply or contradict any of the source conclusions above.