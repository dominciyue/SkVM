## Conclusion

The Download operation is **root-document authorized but representation-selective**:

- The URL `pk` identifies either a root document or one of its version rows.
- Authorization is evaluated against the document family’s **root document**.
- Only after that authorization succeeds does the code select a particular version and then its original/archive representation.
- Selecting another version does **not** cause an independent permission check on that version, but the selected row must be the authorized root itself or a version whose `root_document_id` equals that root’s ID.

## Request and routing

`UnifiedSearchViewSet`, which inherits `DocumentViewSet`, is registered under `documents` inside the `/api/` URL namespace. DRF’s detail-action route produces:

```text
GET /api/documents/{pk}/download/
```

The `{pk}` path component becomes `download(..., pk=...)`; query parameters control version and representation selection.  
[`src/paperless/urls.py:74-77`](src/paperless/urls.py#L74-L77), [`src/paperless/urls.py:97-100`](src/paperless/urls.py#L97-L100), [`src/paperless/urls.py:293-299`](src/paperless/urls.py#L293-L299), [`framework/rest_framework-3.18.1/rest_framework/routers.py:128-135`](framework/rest_framework-3.18.1/rest_framework/routers.py#L128-L135), [`src/documents/views.py:2503-2507`](src/documents/views.py#L2503-L2507), [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)

## Authorization order

1. **Framework-level authentication and permission checks happen before `download`.** DRF authenticates, calls every view permission’s `has_permission`, and only then dispatches to the handler.  
   [`framework/rest_framework-3.18.1/rest_framework/views.py:404-421`](framework/rest_framework-3.18.1/rest_framework/views.py#L404-L421)

2. `DocumentViewSet` uses:

   ```python
   (IsAuthenticated, PaperlessObjectPermissions)
   ```

   `IsAuthenticated` requires a truthy authenticated user. For GET, `PaperlessObjectPermissions` maps the request to `view_document`; its inherited model-level check calls `request.user.has_perms(...)` against the `Document` model. Thus an ordinarily dispatched Download request must pass the global/model `documents.view_document` gate before entering the handler.  
   [`src/documents/views.py:1008-1027`](src/documents/views.py#L1008-L1027), [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L145-L151), [`src/documents/permissions.py:30-44`](src/documents/permissions.py#L30-L44), [`framework/rest_framework-3.18.1/rest_framework/permissions.py:218-246`](framework/rest_framework-3.18.1/rest_framework/permissions.py#L218-L246)

3. `download` calls `file_response(pk, request, "attachment")`. It does **not** use DRF’s `get_object()` and consequently does not invoke the standard `check_object_permissions()` path.  
   [`src/documents/views.py:1834-1839`](src/documents/views.py#L1834-L1839)

4. `file_response` looks up the row identified by `pk` using `Document.global_objects`, resolves its root, and manually checks:

   ```python
   has_perms_owner_aware(request.user, "view_document", root_doc)
   ```

   That succeeds if the root is unowned, owned by the user, or Guardian’s object-permission checker reports `view_document` on the root. Failure returns HTTP 403. This check occurs **before version or original/archive selection**.  
   [`src/documents/views.py:1401-1436`](src/documents/views/views.py#L1401-L1436), [`src/documents/permissions.py:624-635`](src/documents/permissions.py#L624-L635)

The `request.user is None` branch would skip the manual root check, but normal routed execution has already passed `IsAuthenticated`; it does not make Download anonymously accessible.

## Version selection branches

After root authorization:

### No `version` query parameter

- If `{pk}` identifies a version row (`request_doc.root_document_id is not None`), that exact row is returned.
- If `{pk}` identifies the root, the newest non-deleted version is selected; if there is no version, the root itself is used.

“Newest” is by descending `version_index`, with descending ID as a tie-breaker.  
[`src/documents/views.py:1388-1399`](src/documents/views.py#L1388-L1399), [`src/documents/versioning.py:23-28`](src/documents/versioning.py#L23-L28), [`src/documents/versioning.py:159-166`](src/documents/versioning.py#L159-L166)

### `version` is present

- The value is parsed as an integer.
- The selected row is accepted only if it is:
  - the authorized root itself, or
  - a row whose `root_document_id` equals that root’s ID.
- A non-integer value produces `NotFound("Invalid version parameter")`.
- A missing row or a row from another document family produces 404.

Explicit version selection uses `global_objects`, so deleted versions can be selected. An empty `?version=` is considered “present” by the caller but falsy by the resolver; it therefore selects the latest version while including deleted rows.  
[`src/documents/views.py:1375-1386`](src/documents/views.py#L1375-L1386), [`src/documents/versioning.py:140-143`](src/documents/versioning.py#L140-L143), [`src/documents/versioning.py:169-195`](src/documents/versioning.py#L169-L195)

## Original versus archive representation

For the selected `file_doc`:

```python
use_archive = (
    not original_requested(request)
    and file_doc.has_archive_version
)
```

- Only the exact query value `original=true` requests the source/original.
- Otherwise, an archive is returned whenever `archive_filename` is non-null.
- If no archive exists, the source/original is returned.
- Archive responses use `archive_file` and MIME type `application/pdf`.
- Original responses use `source_file` and the document’s `mime_type`.
- The Download action always passes disposition `"attachment"`.

`follow_formatting` affects only the download filename: truthy values use the stored filename; otherwise the public formatted filename is used. Because the raw query value is passed through, any non-empty string—including `"false"`—is truthy.  
[`src/documents/views.py:1368-1373`](src/documents/views.py#L1368-L1373), [`src/documents/views.py:1429-1448`](src/documents/views.py#L1429-L1448), [`src/documents/views.py:4941-4973`](src/documents/views.py#L4941-L4973), [`src/documents/models.py:452-475`](src/documents/models.py#L452-L475)

Missing files and missing document rows become 404 responses; authorization failure remains 403.  
[`src/documents/views.py:1835-1839`](src/documents/views.py#L1835-L1839)

## Authorized resource versus returned resource

| Stage | Resource |
|---|---|
| Model-level gate | `Document` model / global `view_document` permission |
| Manual object authorization | Root document |
| Version selection | Root or version constrained to that authorized root’s family |
| Representation selection | Original or archive file of the selected version |

Therefore, alternate-version and original/archive choices **change the row or file representation returned, not the object on which authorization is evaluated**. There is no separate owner or object-grant check on the selected version row or archive/source file.

## Local `restrict_queryset_to_visible` contract

This helper is not part of the traced Download path:

- `user is None` is considered unrestricted locally.
- Otherwise only an authenticated, active superuser is unrestricted.
- For an unrestricted user, the helper returns the queryset unchanged and never reaches `permitted_object_ids`.
- For every other user, execution reaches `permitted_object_ids(...)` and returns a queryset filtered to those IDs.

A null user here means “the caller requested no filtering,” not “an anonymous Download request was authenticated.”  
[`src/documents/permissions.py:411-433`](src/documents/permissions.py#L411-L433), [`src/documents/permissions.py:436-457`](src/documents/permissions.py#L436-L457)

The auxiliary machine property check remained unresolved because it did not adopt the nested call as its effect; that does not change the direct source-level control flow above.

## Unavailable facts and blocked conclusions

- **The particular user’s global `documents.view_document` permission is unspecified.** This prevents concluding that the request passes the pre-handler model-permission gate.
- **Root ownership and Guardian object grants are unspecified.** This prevents concluding that a particular authenticated user passes or fails the manual root check.
- **Authentication backend and deployment configuration are outside the supplied evidence.** This prevents saying which credentials establish `request.user`; it does not alter the stated premise that the caller is authenticated.
- **Actual database rows, root/version links, deletion state, and request parameters are unavailable.** These prevent naming the exact selected row.
- **Actual filenames, archive availability, storage configuration, and filesystem contents are unavailable.** These prevent naming the physical file or guaranteeing a successful stream instead of 404.

No missing fact blocks the structural conclusion: authorization is root-scoped and precedes version and original/archive selection.