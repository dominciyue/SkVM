## Review status

**Partial / unreviewed.** The source trace below is directly grounded in the cited files, but the structured authorization check did not pass because its semantic model could not resolve the dynamic ORM `manager.select_related(...)` relation and retained earlier annotation diagnostics. Consequently, this is not a completed machine-verified authorization proof or a vulnerability verdict.

## 1. Request and returned-file selection

### Entry

- `UnifiedSearchViewSet`, a subclass of `DocumentViewSet`, is registered as the `documents` API route. The router is included beneath `/api/`, producing the detail action path `/api/documents/{pk}/download/`.  
  `src/paperless/urls.py:74-78,97-100,297-300`  
  `src/documents/views.py:2503`
- `/fetch/doc/{pk}` redirects to that download path.  
  `src/paperless/urls.py:305-313`
- The `download` detail action delegates to `file_response(pk, request, "attachment")`. Missing documents or files are translated to HTTP 404.  
  `src/documents/views.py:1834-1839`

### Document and version selection

`file_response` performs these steps:

1. It resolves the route-selected document and its root with `include_deleted=True`. Therefore, the initial `pk` lookup uses `Document.global_objects`, allowing the route identifier to locate deleted documents or versions.  
   `src/documents/views.py:1401-1448`

2. After authorization, it chooses the effective file document:

   - If `pk` directly identifies a version—`request_doc.root_document_id` is non-null—and there is **no** `version` query parameter, that exact `request_doc` is used. Because the initial lookup includes deleted rows, this branch can select a deleted version.
   - Otherwise, selection is rooted at `root_doc`:
     - No `version` parameter selects the latest **non-deleted** version, falling back to the root.
     - An explicit `version` must parse as an integer.
     - The selected document must be either the root itself or have `root_document_id == root_doc.id`.
     - Malformed values raise DRF `NotFound`; missing or unrelated versions result in 404.
     - Explicit version lookup includes deleted versions.

   `src/documents/views.py:1375-1399`  
   `src/documents/versioning.py:130-205`

### Original/archive selection

For the effective file document:

- Only the exact query value `original=true` requests the original.
- Otherwise, the archive is selected when `file_doc.has_archive_version` is true.
- If no archive exists, `source_file` is returned even when `original=true` was not supplied.
- `follow_formatting` affects the selected download filename, not authorization or which file field is opened.
- Download uses attachment disposition.

`serve_file` opens:

- `archive_file`, with PDF MIME type, for the archive branch;
- `source_file`, with the document MIME type, otherwise.

`src/documents/views.py:1368-1373,1429-1448,4941-4995`

## 2. Authorization and selection order

The order is:

1. DRF initializes the request, authenticates it, and runs class-level permission checks before invoking the Download handler.  
   `framework/rest_framework-3.18.1/rest_framework/views.py:404-421,490-529`

2. `DocumentViewSet` declares:

   - `IsAuthenticated`
   - `PaperlessObjectPermissions`

   `IsAuthenticated` requires an authenticated `request.user`. `PaperlessObjectPermissions` extends `DjangoObjectPermissions` and maps GET to the model’s `view_*` permission.  
   `src/documents/views.py:1008-1027`  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`  
   `src/documents/permissions.py:24-44`

3. The custom Download action does not use the normal `get_object()` path for this lookup. Its manual resolver:

   - looks up `request_doc`;
   - derives `root_doc`;
   - evaluates `has_perms_owner_aware(request.user, "view_document", root_doc)`;
   - returns HTTP 403 on failure.

   `src/documents/views.py:1401-1448`

4. The owner-aware check succeeds when any of these is true:

   - `root_doc.owner is None`;
   - `root_doc.owner == request.user`;
   - the guardian-backed checker grants `view_document` on `root_doc`.

   `src/documents/permissions.py:624-635`

5. Only after that root-document check succeeds are the effective version and original/archive representation selected.

Therefore, the significant object-level Download authorization is evaluated on **`root_doc`**, before selecting the file-bearing version or representation.

## 3. Does alternate selection change the authorized resource?

No, according to the traced source:

- A different `version` does not become a separately authorized object.
- Explicit versions are constrained to the already-authorized root’s version family.
- When `pk` directly names a version and no explicit version parameter is present, that version supplies the file, but authorization is still evaluated against its derived root.
- Choosing `source_file` versus `archive_file` occurs after authorization and does not trigger a separate permission check.

Thus:

> **Authorized object:** `root_doc`  
> **File-bearing object:** the selected effective root/version document  
> **Representation:** that effective document’s `source_file` or `archive_file`

`src/documents/views.py:1375-1448`  
`src/documents/versioning.py:146-205`

## 4. Missing facts and conditional conclusions

The following facts are unavailable:

- the concrete user’s model-level view permission;
- whether the root is ownerless or owned by that user;
- guardian `view_document` grants on the root;
- the actual `pk` and query parameters;
- the database’s version-family and deletion state;
- whether an archive exists;
- whether the selected stored file exists;
- deployment-specific authentication configuration establishing `request.user`.

Consequently:

- The source defines the authorization rule, but it is not possible to conclude whether a particular authenticated user receives the file or a denial.
- The exact version, original/archive file, filename, or error response cannot be determined for a concrete request.
- No independent expected policy was supplied, so this trace does not establish policy conformance or a vulnerability.