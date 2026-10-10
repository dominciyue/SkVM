## Download trace

1. `DefaultRouter` registers `documents` to `UnifiedSearchViewSet`, which inherits `DocumentViewSet`. The detail action therefore exposes the equivalent of `GET /api/documents/{pk}/download/`. The action passes `pk` to `self.file_response(pk, request, "attachment")`.  
   [`src/paperless/urls.py:74-78,297`](src/paperless/urls.py)  
   [`src/documents/views.py:1834-1839,2503`](src/documents/views.py)  
   [`framework/rest_framework-3.18.1/rest_framework/routers.py:128-134`](framework/rest_framework-3.18.1/rest_framework/routers.py)

2. Before dispatching the action, DRF authenticates the request and evaluates the view-level permissions:
   - `IsAuthenticated`;
   - `PaperlessObjectPermissions`, whose GET mapping requires `documents.view_document`.
   
   Thus an authenticated user still needs the global model permission before document lookup occurs.  
   [`src/documents/views.py:1008-1027`](src/documents/views.py)  
   [`src/documents/permissions.py:36-44`](src/documents/permissions.py)  
   [`framework/rest_framework-3.18.1/rest_framework/views.py:331-342,404-421`](framework/rest_framework-3.18.1/rest_framework/views.py)  
   [`framework/rest_framework-3.18.1/rest_framework/permissions.py:145-151,233-246`](framework/rest_framework-3.18.1/rest_framework/permissions.py)

3. The file-response helper looks up `pk` through `Document.global_objects`, so the initial lookup includes deleted documents. It obtains both:
   - `request_doc`: the row directly named by `pk`;
   - `root_doc`: that row’s root document, or the row itself if it is a root.

4. It then authorizes access against **`root_doc`**, before resolving the requested version or choosing original/archive. `has_perms_owner_aware(..., "view_document", root_doc)` permits the root when:
   - it is ownerless;
   - its owner is the requesting user; or
   - the user has the Guardian `view_document` object permission on it.

   Failure returns HTTP 403. The viewset’s ordinary object-permission method and queryset filter are not invoked through `get_object()` here; this explicit root check is the action’s object-level authorization.  
   [`src/documents/views.py:1401-1448`](src/documents/views.py)  
   [`src/documents/permissions.py:46-53,624-635`](src/documents/permissions.py)

## Version-selection branches

After successful root authorization:

| Request form | Effective document |
|---|---|
| `pk` names a version and `version` is absent | Exactly the version named by `pk`, including a deleted version found through `global_objects`. |
| `pk` names the root and `version` is absent | Latest non-deleted version for that root, falling back to the root itself. |
| `version=` is present but empty | Latest version; presence also enables deleted-version resolution. |
| `version=<integer>` | The matching root or child version, including deleted versions. |
| Malformed `version` | HTTP 404 (`NotFound`). |
| Version missing or belonging to another root family | HTTP 404. |

A supplied alternate version must therefore be the checked root itself or a document whose `root_document_id` is that root.  
[`src/documents/views.py:1375-1398`](src/documents/views.py)  
[`src/documents/versioning.py:140-195`](src/documents/versioning.py)

Because the root permission check precedes version parsing, an unauthorized user receives 403 before an invalid-version 404 is evaluated.

## Original versus archive

For the effective `file_doc`:

- Only the exact query value `original=true` forces `file_doc.source_file`.
- Otherwise, if `file_doc.has_archive_version` is true, Download serves `file_doc.archive_file`.
- Otherwise it serves `file_doc.source_file`.
- Archive responses use `application/pdf`; original responses primarily use the document MIME type.
- `follow_formatting` changes the downloaded filename, not the authorized object or selected file contents. Its raw query-string value is used as a truth value, so even a nonempty value such as `follow_formatting=false` takes the formatted-filename branch.
- Download uses `Content-Disposition: attachment`.
- A missing document or backing file is translated to HTTP 404.

[`src/documents/views.py:1367-1372,1429-1448,1834-1839,4941-4995`](src/documents/views.py)

## Authorization object versus returned object

Selecting another version or choosing original/archive **does not change the resource against which authorization is evaluated**:

- Authorization object: `root_doc`.
- Selected document: `file_doc`, possibly a different version within the same root family.
- Returned representation: `file_doc.source_file` or `file_doc.archive_file`.

There is no second permission check on `file_doc`, `source_file`, or `archive_file` in the analyzed path. Consequently, conditional on passing both the global GET permission and the root-level check, the source treats access to the root as authorization for its eligible versions and both representations.

## Facts not available

The source cannot determine the concrete outcome without:

- the user’s global `documents.view_document` permission;
- whether the root is ownerless, owned by that user, or covered by an object grant;
- actual `pk`, `version`, `original`, and `follow_formatting` values;
- document/version existence, lineage, and deletion state;
- archive availability and backing-file existence.

No supplied policy says whether authorizing every version and representation through the root is intended, so this trace does not establish a policy violation.

Finally, the authorization checker could not semantically close the `download()` → `file_response()` call edge, even though the lexical call and the helper bodies were read directly. The composed trace above is therefore source-supported but not mechanically certified by that checker.