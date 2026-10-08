## Source-supported conclusion — partial / unreviewed

The Download implementation authorizes `root_doc`, then can select and return a different version document as `file_doc`. Therefore:

- **When `file_doc is root_doc`**, the supplied exact-document policy is satisfied by the shown object check.
- **When a child/version document becomes `file_doc`**, the policy is **violated**: no subsequent object-view authorization is performed on that exact document.
- Choosing original versus archive only changes the representation of the already-selected `file_doc`; it does not change the authorization object.

Formal machine verification did not complete because the semantic entry remained incorrectly bound to `BaseRouter.urls`. These source conclusions must therefore be treated as **partial/unreviewed**, despite the direct source evidence below.

## Request and returned-file trace

1. The API router registers the document viewset at `api/documents`:
   - `src/paperless/urls.py:74-100`
2. The detail action handles:
   - `GET /api/documents/{pk}/download/`
   - `src/documents/views.py:1834-1838`
3. `download()` calls:
   - `file_response(pk, request, "attachment")`
4. `file_response()` resolves:
   - `request_doc` from `pk`, using `Document.global_objects` because Download passes `include_deleted=True`;
   - `root_doc` from `request_doc`;
   - authorization on `root_doc`;
   - then `file_doc`;
   - then original/archive representation.
   - `src/documents/views.py:1401-1448`

### Version selection

`_get_effective_file_doc()` and `resolve_requested_version_for_root()` implement these branches:

- If `pk` identifies a child version and the `version` parameter is completely absent, that child `request_doc` is used directly.
- Otherwise selection is relative to `root_doc`:
  - absent or falsy `version`: latest child version, falling back to the root;
  - numeric `version`: the root itself or a child whose `root_document_id` matches;
  - malformed, missing, or unrelated ID: `404`/`NotFound`.
- A present version parameter permits lookup including deleted versions.
- If an associated root cannot be loaded, `get_root_document()` falls back to the supplied document.

Evidence: `src/documents/views.py:1375-1399`; `src/documents/versioning.py:130-205`.

### Original/archive selection

For the selected `file_doc`:

- only `original=true` selects `source_file`;
- otherwise `archive_file` is selected when `file_doc.has_archive_version`;
- if no archive exists, selection falls back to `source_file`;
- `follow_formatting` affects the download filename, not the authorized resource.

`serve_file()` constructs the `FileResponse` and `Content-Disposition` header. Missing documents or files ultimately produce `404`.

Evidence: `src/documents/views.py:1368-1373`, `1429-1448`, `4935-5005`.

## Authorization and ordering

`DocumentViewSet` declares:

```python
permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
```

DRF runs request authentication and general permission checks before dispatching the action (`src/documents/views.py:1021`; REST framework `views.py:325-365`, `396-421`).

However, Download does not obtain the document through DRF’s `get_object()` path and does not invoke `check_object_permissions()` for the selected `file_doc`. Instead, `_resolve_request_and_root_doc()` performs:

```python
has_perms_owner_aware(request.user, "view_document", root_doc)
```

This permits the operation when the root:

- is unowned;
- is owned by the requesting user; or
- has a `view_document` object grant for that user.

Failure returns `403`. Only after this check does the code select the version and original/archive representation.

Evidence: `src/documents/views.py:1401-1448`; `src/documents/permissions.py:624-636`.

## Exact-resource policy assessment

| Branch | Authorized object | Returned document | Policy result |
|---|---|---|---|
| Root selected | `root_doc` | `root_doc` | Satisfied by shown object check |
| Child `pk`, no `version` | `root_doc` | child `request_doc` | **Violated** |
| Latest child selected | `root_doc` | latest child | **Violated** |
| Explicit related child selected | `root_doc` | selected child | **Violated** |
| Original/archive switch | unchanged | unchanged `file_doc` | Representation-only; inherits the result above |

Permission on a related root is therefore treated as sufficient for downloading a child version, contrary to the supplied policy.

## Missing runtime facts

The following facts are unavailable and prevent predicting a concrete request’s status or exact returned file:

- authenticated identity and request-level permissions;
- root ownership and object grants;
- `pk`, `version`, `original`, and formatting parameter values;
- document/version relationships and deletion state;
- archive availability and filesystem presence.

These facts affect whether a request returns `403`, `404`, or a file. They do **not** remove the source-level mismatch on branches where `file_doc != root_doc`.

## Verification limitation

The authorization checker did not accept the final result:

- the semantic graph remained bound to the initially offered `BaseRouter.urls` candidate rather than the actual Download action;
- retained diagnostics included `semantic-transform-unbound`, `semantic-exception-type-unknown`, and `entry-return-outcome-unspecified`;
- the repaired check was malformed at the result-schema level, and the reserved check budget was exhausted.

Accordingly, the policy conclusion above is directly source-supported but not independently machine-verified.