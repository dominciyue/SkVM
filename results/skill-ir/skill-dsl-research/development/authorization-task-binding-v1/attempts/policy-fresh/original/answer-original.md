## Result status

**Partial / unreviewed.** Direct source inspection establishes the flow below, but the authorization-domain checker rejected the final result because it could not semantically link `file_response()` to the already-read `_resolve_request_and_root_doc()` helper. Consequently, its formal policy status remains **undetermined**, despite the source-level mismatch described below.

## Download flow

1. The API router registers the documents viewset under `/api/documents/`; the `download` GET detail action receives the route `pk` and delegates to:

   ```python
   self.file_response(pk, request, "attachment")
   ```

   Missing documents or files become HTTP 404.  
   `src/paperless/urls.py:74-77,297`  
   `src/documents/views.py:1834-1839`

2. `file_response()` calls `_resolve_request_and_root_doc(..., include_deleted=True)`:

   - `pk` is looked up through `Document.global_objects` as `request_doc`.
   - `root_doc` is `request_doc` itself when it has no root, otherwise its associated root document.
   - Missing `pk` produces 404.

   `src/documents/views.py:1401-1434`  
   `src/documents/versioning.py:146-156`

3. The explicit object authorization check is:

   ```python
   has_perms_owner_aware(
       request.user,
       "view_document",
       root_doc,
   )
   ```

   Failure returns HTTP 403 **before** selecting `file_doc`. The helper permits access when `root_doc`:

   - has no owner;
   - is owned by the user; or
   - has a Guardian `view_document` grant for the user.

   `src/documents/views.py:1421-1427`  
   `src/documents/permissions.py:624-635`

4. Only after that check, `_get_effective_file_doc()` chooses the document whose file is returned:

   - If the route directly identifies a child version and there is no `version` query parameter, that `request_doc` remains `file_doc`.
   - Otherwise:
     - no nonempty `version` value selects the latest version in the root family, falling back to the root;
     - a supplied value must parse as an integer and identify either the root or one of its direct versions;
     - malformed values produce `NotFound("Invalid version parameter")`;
     - absent or unrelated IDs produce 404.

   `src/documents/views.py:1375-1399`  
   `src/documents/versioning.py:140-195`

5. Representation selection operates on the resulting `file_doc`:

   - `original=true` exactly selects the original/source representation.
   - Otherwise the archive is used only when `file_doc.has_archive_version`; if not, the source is used.
   - Archive branch: `file_doc.archive_file`.
   - Original branch: `file_doc.source_file`.
   - `follow_formatting` changes the response filename, not the selected document or file representation.
   - The response disposition is `attachment`.

   `src/documents/views.py:1368-1373,1442-1448,4941-4973`

## Authorization ordering

DRF authenticates and applies request-level permissions before dispatching the action. `DocumentViewSet` declares:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

`PaperlessObjectPermissions` maps GET to `view_<model>` and supplies owner-aware object permission behavior. However, generic DRF object permission enforcement is normally invoked through `GenericAPIView.get_object()`. This action does not call `get_object()`; its operative object-specific check is the manual `has_perms_owner_aware(..., root_doc)` call above.

`src/documents/views.py:1008-1021`  
`src/documents/permissions.py:30-53`  
`framework/rest_framework-3.18.1/rest_framework/views.py:279-283,321-342,404-421,490-529`  
`framework/rest_framework-3.18.1/rest_framework/generics.py:97-103`

Therefore, the order is:

1. authentication;
2. request/model-level permissions;
3. lookup of `request_doc` and `root_doc`;
4. `view_document` authorization on `root_doc`;
5. selection of `file_doc`;
6. original/archive selection;
7. `FileResponse`.

## Alternate-version authorization

Choosing original versus archive **only changes the representation of `file_doc`**. It does not change the authorization object.

Choosing a version can change the actual `Document` whose file is returned:

- If `file_doc is root_doc`, the root authorization also covers the exact returned document.
- If `file_doc` is a distinct child/latest version, authorization was evaluated only on `root_doc`. No subsequent `view_document` check on `file_doc` appears before its file is served.

### Policy assessment

Direct static inspection therefore indicates an **apparent violation** of the supplied exact-document policy for branches where `file_doc != root_doc`: permission on the related root alone can reach the selected version’s file.

The formal checker left conformance **undetermined**, solely because its semantic graph failed to link the already-read helper call; this is an interpretation-tool gap, not a missing source or deployment fact.

## Missing facts

These facts are not supplied and prevent deciding whether a particular request succeeds:

- whether `root_doc` is unowned or owned by the requesting user;
- the user’s Guardian grants on `root_doc` and on any selected version;
- the concrete `pk`, `version`, `original`, and `follow_formatting` values;
- the document-family and deletion state;
- archive availability and underlying file existence.

Authentication backend and deployment details outside the allowed source were not examined. They do not alter the source-level observation that the explicit object check targets `root_doc`, while a distinct `file_doc` may subsequently be returned.